import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MembershipRole, OrderStatus } from "@prisma/client";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { AuthenticatedActor } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { inspectionTemplateSchema } from "../templates/template-schema";
import { CreateUploadIntentDto } from "./media.dto";

const PRESIGNED_URL_SECONDS = 300;
const PREVIEW_URL_SECONDS = 120;
const MAX_IMAGE_PIXELS = 40_000_000;
const ACCEPTED_FORMATS = new Map([
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

@Injectable()
export class MediaService {
  private readonly client: S3Client;
  private readonly bucket: string | undefined;
  private readonly maxUploadBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const endpoint = config.get<string>("S3_ENDPOINT");
    const accessKeyId = config.get<string>("S3_ACCESS_KEY_ID");
    const secretAccessKey = config.get<string>("S3_SECRET_ACCESS_KEY");
    this.bucket = config.get<string>("S3_BUCKET");
    this.maxUploadBytes = config.getOrThrow<number>("MAX_UPLOAD_BYTES");
    this.client = new S3Client({
      endpoint,
      region: config.getOrThrow<string>("S3_REGION"),
      forcePathStyle: config.getOrThrow<boolean>("S3_FORCE_PATH_STYLE"),
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
  }

  async createUploadIntent(actor: AuthenticatedActor, input: CreateUploadIntentDto) {
    const tenantId = this.requireTenant(actor);
    if (input.sizeBytes > this.maxUploadBytes) {
      throw new UnprocessableEntityException(`单张照片不能超过 ${Math.floor(this.maxUploadBytes / 1024 / 1024)} MB。`);
    }

    const order = await this.prisma.inspectionOrder.findFirst({
      where: {
        id: input.orderId,
        tenantId,
        currentRevisionId: input.revisionId,
        status: { in: [OrderStatus.INSPECTING, OrderStatus.NEEDS_MODIFICATION] },
        ...(actor.role === MembershipRole.INSPECTOR ? { inspectorId: actor.membershipId! } : {}),
      },
      include: { revisions: { where: { id: input.revisionId, status: "DRAFT" }, take: 1 } },
    });
    if (!order || !order.revisions[0]) {
      throw new ConflictException("只能为当前可编辑的检测版本上传照片。");
    }
    const schema = inspectionTemplateSchema.safeParse(order.revisions[0].schemaSnapshot);
    if (!schema.success || !schema.data.sections.some((section) => section.items.some((item) => item.key === input.itemKey))) {
      throw new UnprocessableEntityException("目标检测项不属于当前模板。");
    }

    const bucket = this.requireBucket();
    const assetId = randomUUID();
    const objectKey = `${tenantId}/${input.orderId}/${input.revisionId}/${assetId}/original`;
    const asset = await this.prisma.mediaAsset.create({
      data: {
        id: assetId,
        tenantId,
        orderId: input.orderId,
        revisionId: input.revisionId,
        itemKey: input.itemKey,
        createdBy: actor.userId,
        objectKey,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
      },
      select: { id: true },
    });
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        ContentType: input.mimeType,
        ContentLength: input.sizeBytes,
      }),
      { expiresIn: PRESIGNED_URL_SECONDS },
    );
    return {
      assetId: asset.id,
      uploadUrl,
      uploadHeaders: { "Content-Type": input.mimeType },
      expiresIn: PRESIGNED_URL_SECONDS,
      maxBytes: this.maxUploadBytes,
    };
  }

  async completeUpload(actor: AuthenticatedActor, assetId: string) {
    const tenantId = this.requireTenant(actor);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, tenantId, createdBy: actor.userId, scanStatus: "PENDING" },
    });
    if (!asset || !asset.orderId || !asset.revisionId || !asset.itemKey) {
      throw new NotFoundException("待处理的现场照片不存在。");
    }
    const bucket = this.requireBucket();

    const head = await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: asset.objectKey }));
    if (head.ContentLength !== Number(asset.sizeBytes) || head.ContentLength > this.maxUploadBytes
      || head.ContentType !== asset.mimeType) {
      await this.rejectAsset(asset.id, bucket, asset.objectKey);
      throw new UnprocessableEntityException("照片大小或文件类型与上传声明不符，请重新上传。");
    }

    let response;
    try {
      response = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: asset.objectKey }));
    } catch (error) {
      console.error("Could not retrieve uploaded inspection evidence.", error);
      throw new UnprocessableEntityException("照片尚未上传完成，请重试。");
    }
    const body = response.Body;
    if (!body) {
      throw new UnprocessableEntityException("照片文件不存在或内容为空。");
    }
    const source = Buffer.from(await body.transformToByteArray());
    if (!source.byteLength || source.byteLength > this.maxUploadBytes
      || BigInt(source.byteLength) !== asset.sizeBytes) {
      await this.rejectAsset(asset.id, bucket, asset.objectKey);
      throw new UnprocessableEntityException("照片文件大小与上传声明不符，请重新上传。");
    }

    let decoded: { mimeType: string; width: number; height: number };
    try {
      decoded = await this.decodeImage(source);
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        await this.rejectAsset(asset.id, bucket, asset.objectKey);
      }
      throw error;
    }
    if (decoded.mimeType !== asset.mimeType) {
      await this.rejectAsset(asset.id, bucket, asset.objectKey);
      throw new UnprocessableEntityException("照片内容与声明的文件类型不符。");
    }

    const previewKey = `${tenantId}/${asset.orderId}/${asset.revisionId}/${asset.id}/preview-720.webp`;
    const image = sharp(source, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS }).rotate();
    const preview = await image.clone().resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 }).toBuffer();
    const thumbnailKey = `${tenantId}/${asset.orderId}/${asset.revisionId}/${asset.id}/preview-320.webp`;
    const thumbnail = await image.clone().resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 }).toBuffer();
    await Promise.all([
      this.client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: previewKey,
        Body: preview,
        ContentType: "image/webp",
        CacheControl: "private, max-age=120",
      })),
      this.client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: thumbnailKey,
        Body: thumbnail,
        ContentType: "image/webp",
        CacheControl: "private, max-age=120",
      })),
    ]);

    const sha256 = createHash("sha256").update(source).digest("hex");
    const updated = await this.prisma.mediaAsset.updateMany({
      where: { id: asset.id, tenantId, scanStatus: "PENDING" },
      data: { previewKey, mimeType: "image/webp", sizeBytes: BigInt(source.byteLength), sha256, scanStatus: "CLEAN" },
    });
    if (updated.count !== 1) {
      await Promise.all([
        this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: previewKey })),
        this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbnailKey })),
      ]);
      throw new ConflictException("照片处理状态已改变，请刷新检测草稿。");
    }
    return {
      assetId: asset.id,
      status: "CLEAN",
      previewFormat: "image/webp",
      width: decoded.width,
      height: decoded.height,
      sha256,
    };
  }

  async createPreviewUrl(actor: AuthenticatedActor, assetId: string) {
    const tenantId = this.requireTenant(actor);
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        tenantId,
        scanStatus: "CLEAN",
        previewKey: { not: null },
        order: {
          ...(actor.role === MembershipRole.INSPECTOR ? { inspectorId: actor.membershipId! } : {}),
        },
      },
      select: { previewKey: true },
    });
    if (!asset?.previewKey) {
      throw new NotFoundException("照片不存在或当前账号无权访问。");
    }
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.requireBucket(),
        Key: asset.previewKey,
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn: PREVIEW_URL_SECONDS },
    );
    return { url, expiresIn: PREVIEW_URL_SECONDS };
  }

  async createReportPreviewUrl(tenantId: string, revisionId: string, assetId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        tenantId,
        scanStatus: "CLEAN",
        previewKey: { not: null },
        evidence: { some: { tenantId, revisionId, assetId } },
      },
      select: { previewKey: true },
    });
    if (!asset?.previewKey) {
      throw new NotFoundException("报告现场照片不存在。");
    }
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.requireBucket(),
        Key: asset.previewKey,
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn: PREVIEW_URL_SECONDS },
    );
    return { url, expiresIn: PREVIEW_URL_SECONDS };
  }

  private async decodeImage(source: Buffer): Promise<{ mimeType: string; width: number; height: number }> {
    let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
    try {
      metadata = await sharp(source, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
    } catch {
      throw new UnprocessableEntityException("照片格式无法解码或图片像素超出限制。");
    }
    const mimeType = metadata.format ? ACCEPTED_FORMATS.get(metadata.format) : undefined;
    if (!mimeType || !metadata.width || !metadata.height
      || metadata.width * metadata.height > MAX_IMAGE_PIXELS
      || metadata.pages !== undefined && metadata.pages > 1) {
      throw new UnprocessableEntityException("仅支持有效的单页 JPEG、PNG 或 WebP 图片。");
    }
    return { mimeType, width: metadata.width, height: metadata.height };
  }

  private async rejectAsset(assetId: string, bucket: string, objectKey: string): Promise<void> {
    await this.prisma.mediaAsset.updateMany({
      where: { id: assetId, scanStatus: "PENDING" },
      data: { scanStatus: "REJECTED" },
    });
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
  }

  private requireTenant(actor: AuthenticatedActor): string {
    if (!actor.tenantId || !actor.membershipId || !actor.role) {
      throw new ForbiddenException("请先选择有效的机构工作空间。");
    }
    return actor.tenantId;
  }

  private requireBucket(): string {
    if (!this.bucket) {
      throw new ServiceUnavailableException("现场照片存储尚未配置，请联系平台管理员。");
    }
    return this.bucket;
  }
}
