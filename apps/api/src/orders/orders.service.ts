import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  InspectionRevisionStatus,
  MembershipRole,
  OrderStatus,
  Prisma,
} from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedActor } from "../auth/auth.types";
import { FieldCryptoService } from "../crypto/field-crypto.service";
import { PrismaService } from "../database/prisma.service";
import { InspectionTemplateItem, InspectionTemplateSchema, inspectionTemplateSchema } from "../templates/template-schema";
import { CreateOrderDto, ListOrdersQueryDto, SaveDraftDto, SaveInspectionAnswerDto } from "./orders.dto";

const INCOMPLETE_VALUES = new Set(["", "待检查", "未检查"]);
const ALLOWED_THRESHOLDS = new Set(["LESS_THAN_30CM_X_30CM", "GREATER_THAN_30CM_X_30CM"]);

type StoredAnswer = {
  value: string;
  note?: string;
  thresholdFinding?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getTemplateSchema(value: Prisma.JsonValue): InspectionTemplateSchema {
  const parsed = inspectionTemplateSchema.safeParse(value);
  if (!parsed.success) {
    throw new UnprocessableEntityException("该订单使用的检测模板结构无效，请联系机构管理员。");
  }
  return parsed.data;
}

function itemMap(schema: InspectionTemplateSchema): Map<string, InspectionTemplateItem> {
  return new Map(schema.sections.flatMap((section) => section.items.map((item) => [item.key, item] as const)));
}

function answerFromJson(value: Prisma.JsonValue): StoredAnswer {
  if (!isRecord(value) || typeof value.value !== "string") {
    return { value: "" };
  }
  return {
    value: value.value,
    ...(typeof value.note === "string" ? { note: value.note } : {}),
    ...(typeof value.thresholdFinding === "string" ? { thresholdFinding: value.thresholdFinding } : {}),
  };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCryptoService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: AuthenticatedActor,
    idempotencyKey: string | undefined,
    input: CreateOrderDto,
  ) {
    const tenantId = this.requireTenant(actor);
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("请为订单创建请求提供有效的 Idempotency-Key。");
    }

    const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { tenantId_actorId_key: { tenantId, actorId: actor.userId, key: idempotencyKey } },
    });
    if (existing && existing.expiresAt > new Date()) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException("相同请求标识不能用于不同的订单内容。");
      }
      return this.getOrder(actor, existing.resourceId);
    }

    try {
      const createdId = await this.prisma.$transaction(async (transaction) => {
        if (existing) {
          await transaction.idempotencyKey.delete({ where: { id: existing.id } });
        }
        const templateRevision = await transaction.templateRevision.findFirst({
          where: {
            id: input.templateRevisionId,
            tenantId,
            approvedAt: { not: null },
            publishedAt: { not: null },
          },
          include: { template: true, standardRevision: true },
        });
        if (!templateRevision) {
          throw new UnprocessableEntityException("所选模板不存在、未发布或未通过审核。");
        }
        if (templateRevision.template.vehicleKind !== input.vehicleKind) {
          throw new UnprocessableEntityException("所选检测模板与车辆类型不匹配。");
        }
        const schema = getTemplateSchema(templateRevision.schema);
        const inspectorId = input.assignedInspectorId ?? actor.membershipId;
        if (!inspectorId) {
          throw new ForbiddenException("当前账号没有可用的机构成员身份。");
        }
        const inspector = await transaction.tenantMembership.findFirst({
          where: { id: inspectorId, tenantId, status: "ACTIVE", role: { in: [MembershipRole.INSPECTOR, MembershipRole.ORG_ADMIN] } },
          select: { id: true },
        });
        if (!inspector) {
          throw new UnprocessableEntityException("指定检测师不存在或不属于当前机构。");
        }
        if (actor.role === MembershipRole.INSPECTOR && inspectorId !== actor.membershipId) {
          throw new ForbiddenException("检测师只能为本人创建检测订单。");
        }

        const vehicle = await transaction.vehicle.create({
          data: {
            tenantId,
            kind: input.vehicleKind,
            brand: input.brand?.trim() || null,
            model: input.model?.trim() || null,
            year: input.year ?? null,
            plateCipher: this.crypto.encrypt(input.plate?.trim()),
            vinCipher: this.crypto.encrypt(input.vin?.trim().toUpperCase()),
            mileage: input.mileage ?? null,
            firstRegisteredAt: input.firstRegisteredAt ? new Date(input.firstRegisteredAt) : null,
          },
          select: { id: true },
        });
        const order = await transaction.inspectionOrder.create({
          data: {
            tenantId,
            orderNo: this.createOrderNumber(),
            vehicleId: vehicle.id,
            templateId: templateRevision.templateId,
            templateRevisionId: templateRevision.id,
            inspectorId,
            status: OrderStatus.INSPECTING,
          },
          select: { id: true, orderNo: true },
        });
        const revision = await transaction.inspectionRevision.create({
          data: {
            tenantId,
            orderId: order.id,
            revisionNumber: 1,
            schemaSnapshot: schema as object,
          },
          select: { id: true },
        });
        await transaction.inspectionOrder.update({
          where: { id: order.id },
          data: { currentRevisionId: revision.id },
        });
        await transaction.idempotencyKey.create({
          data: {
            tenantId,
            actorId: actor.userId,
            key: idempotencyKey,
            requestHash,
            resourceId: order.id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        await this.audit.record({
          tenantId,
          actorId: actor.userId,
          action: "order.create",
          resourceType: "order",
          resourceId: order.id,
          metadata: {
            orderNo: order.orderNo,
            templateRevisionId: templateRevision.id,
            vehicleKind: input.vehicleKind,
            sectionCount: schema.sections.length,
          },
        }, transaction);
        return order.id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.getOrder(actor, createdId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicate = await this.prisma.idempotencyKey.findUnique({
          where: { tenantId_actorId_key: { tenantId, actorId: actor.userId, key: idempotencyKey } },
        });
        if (duplicate?.requestHash === requestHash) {
          return this.getOrder(actor, duplicate.resourceId);
        }
        if (duplicate) {
          throw new ConflictException("相同请求标识不能用于不同的订单内容。");
        }
      }
      throw error;
    }
  }

  async list(actor: AuthenticatedActor, query: ListOrdersQueryDto) {
    const tenantId = this.requireTenant(actor);
    if (query.cursor && !await this.prisma.inspectionOrder.findFirst({
      where: { id: query.cursor, tenantId },
      select: { id: true },
    })) {
      throw new NotFoundException("分页位置不存在。");
    }
    const orders = await this.prisma.inspectionOrder.findMany({
      where: {
        tenantId,
        ...(query.status ? { status: query.status } : {}),
        ...(actor.role === MembershipRole.INSPECTOR
          ? { inspectorId: actor.membershipId! }
          : query.inspectorId ? { inspectorId: query.inspectorId } : {}),
      },
      take: query.limit,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        vehicle: { select: { kind: true, brand: true, model: true, year: true, mileage: true, plateCipher: true } },
        template: { select: { title: true, standardType: true } },
        inspector: { select: { id: true, user: { select: { displayName: true } } } },
      },
    });
    return orders.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      inspector: { id: order.inspector.id, displayName: order.inspector.user.displayName },
      vehicle: {
        kind: order.vehicle.kind,
        brand: order.vehicle.brand,
        model: order.vehicle.model,
        year: order.vehicle.year,
        mileage: order.vehicle.mileage,
        plate: this.crypto.decrypt(order.vehicle.plateCipher),
      },
      template: order.template,
    }));
  }

  async getOrder(actor: AuthenticatedActor, orderId: string) {
    const order = await this.findAccessibleOrder(actor, orderId);
    return this.toOrderView(order);
  }

  async saveDraft(actor: AuthenticatedActor, orderId: string, input: SaveDraftDto) {
    const tenantId = this.requireTenant(actor);
    this.assertUniqueAnswerKeys(input.answers);
    const saved = await this.prisma.$transaction(async (transaction) => {
      const order = await transaction.inspectionOrder.findFirst({
        where: {
          id: orderId,
          tenantId,
          ...(actor.role === MembershipRole.INSPECTOR ? { inspectorId: actor.membershipId! } : {}),
        },
        include: {
          revisions: {
            where: { id: input.revisionId, status: InspectionRevisionStatus.DRAFT },
            include: { answers: true },
            take: 1,
          },
        },
      });
      if (!order || order.currentRevisionId !== input.revisionId || !order.revisions[0]) {
        throw new ConflictException("检测版本已提交或已被退回，无法继续编辑。");
      }
      const revision = order.revisions[0];
      if (revision.updatedAt.getTime() !== new Date(input.revisionUpdatedAt).getTime()) {
        throw new ConflictException("检测草稿已在其他设备上更新，请重新加载后合并修改。");
      }
      const schema = getTemplateSchema(revision.schemaSnapshot);
      this.validateDraftAnswers(schema, input.answers);
      await this.replaceAnswersAndEvidence(transaction, tenantId, revision.id, order.id, input.answers);
      const updated = await transaction.inspectionRevision.update({
        where: { id: revision.id },
        data: { updatedAt: new Date() },
        select: { id: true, updatedAt: true },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "inspection.draft.save",
        resourceType: "inspection_revision",
        resourceId: revision.id,
      }, transaction);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { revisionId: saved.id, updatedAt: saved.updatedAt.toISOString() };
  }

  async submit(actor: AuthenticatedActor, orderId: string, revisionId: string) {
    const tenantId = this.requireTenant(actor);
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.inspectionOrder.findFirst({
        where: {
          id: orderId,
          tenantId,
          status: { in: [OrderStatus.INSPECTING, OrderStatus.NEEDS_MODIFICATION] },
          ...(actor.role === MembershipRole.INSPECTOR ? { inspectorId: actor.membershipId! } : {}),
        },
        include: {
          revisions: {
            where: { id: revisionId, status: InspectionRevisionStatus.DRAFT },
            include: { answers: true, evidence: { include: { asset: true } } },
            take: 1,
          },
        },
      });
      if (!order || order.currentRevisionId !== revisionId || !order.revisions[0]) {
        throw new ConflictException("检测版本状态已变更，无法提交审核。");
      }
      const revision = order.revisions[0];
      const schema = getTemplateSchema(revision.schemaSnapshot);
      this.validateSubmission(schema, revision.answers, revision.evidence);
      const contentHash = createHash("sha256")
        .update(JSON.stringify({
          schema: revision.schemaSnapshot,
          answers: revision.answers.map(({ itemKey, answer }) => ({ itemKey, answer })).sort((a, b) => a.itemKey.localeCompare(b.itemKey)),
          evidence: revision.evidence.map(({ itemKey, assetId }) => ({ itemKey, assetId })).sort((a, b) => a.itemKey.localeCompare(b.itemKey)),
        }))
        .digest("hex");

      await transaction.inspectionRevision.update({
        where: { id: revision.id },
        data: {
          status: InspectionRevisionStatus.SUBMITTED,
          submittedBy: actor.userId,
          submittedAt: new Date(),
          contentHash,
        },
      });
      await transaction.inspectionOrder.update({
        where: { id: order.id },
        data: { status: OrderStatus.REVIEW_PENDING },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "inspection.submit",
        resourceType: "inspection_revision",
        resourceId: revision.id,
        metadata: { contentHash },
      }, transaction);
      return { orderId: order.id, revisionId: revision.id, status: OrderStatus.REVIEW_PENDING };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private requireTenant(actor: AuthenticatedActor): string {
    if (!actor.tenantId || !actor.membershipId || !actor.role) {
      throw new ForbiddenException("请先选择有效的机构工作空间。");
    }
    return actor.tenantId;
  }

  private createOrderNumber(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `JJ${date}${randomBytes(6).toString("hex").toUpperCase()}`;
  }

  private assertUniqueAnswerKeys(answers: SaveInspectionAnswerDto[]): void {
    if (new Set(answers.map((answer) => answer.itemKey)).size !== answers.length) {
      throw new UnprocessableEntityException("同一检测草稿中项目不能重复。");
    }
  }

  private validateDraftAnswers(schema: InspectionTemplateSchema, answers: SaveInspectionAnswerDto[]) {
    const items = itemMap(schema);
    for (const answer of answers) {
      const item = items.get(answer.itemKey);
      if (!item) {
        throw new UnprocessableEntityException("检测答卷中包含模板以外的项目。");
      }
      if (item.options && answer.value && !item.options.includes(answer.value)) {
        throw new UnprocessableEntityException(`“${item.title}”的检测结果不属于模板允许选项。`);
      }
      if (answer.thresholdFinding && !ALLOWED_THRESHOLDS.has(answer.thresholdFinding)) {
        throw new UnprocessableEntityException(`“${item.title}”的尺寸判定值无效。`);
      }
      if (new Set(answer.evidenceAssetIds).size !== answer.evidenceAssetIds.length) {
        throw new UnprocessableEntityException(`“${item.title}”不能重复附加同一照片。`);
      }
    }
  }

  private validateSubmission(
    schema: InspectionTemplateSchema,
    answers: Array<{ itemKey: string; answer: Prisma.JsonValue }>,
    evidence: Array<{ itemKey: string; assetId: string; asset: { scanStatus: string } }>,
  ) {
    const answersByKey = new Map(answers.map((answer) => [answer.itemKey, answerFromJson(answer.answer)]));
    const evidenceCountByKey = new Map<string, number>();
    for (const itemEvidence of evidence) {
      if (itemEvidence.asset.scanStatus !== "CLEAN") {
        throw new UnprocessableEntityException("现场照片仍在检查或无法使用，请替换后再提交。");
      }
      evidenceCountByKey.set(itemEvidence.itemKey, (evidenceCountByKey.get(itemEvidence.itemKey) ?? 0) + 1);
    }

    const incomplete: string[] = [];
    for (const section of schema.sections) {
      for (const item of section.items) {
        const answer = answersByKey.get(item.key);
        const value = answer?.value ?? "";
        if (item.required && INCOMPLETE_VALUES.has(value.trim())) {
          incomplete.push(item.key);
          continue;
        }
        if (!value) {
          continue;
        }
        if (item.options && !item.options.includes(value)) {
          throw new UnprocessableEntityException(`“${item.title}”的检测结果不属于模板允许选项。`);
        }
        if (item.noteRequiredWhen.includes(value) && !answer?.note?.trim()) {
          incomplete.push(item.key);
        }
        if (item.thresholdRequiredWhen.includes(value) && !answer?.thresholdFinding) {
          incomplete.push(item.key);
        }
        if (item.thresholdRequiredWhen.includes(value) && answer?.thresholdFinding
          && !ALLOWED_THRESHOLDS.has(answer.thresholdFinding)) {
          throw new UnprocessableEntityException(`“${item.title}”的尺寸判定值无效。`);
        }
        if (item.evidenceRequiredWhen.includes(value) && !(evidenceCountByKey.get(item.key) ?? 0)) {
          incomplete.push(item.key);
        }
      }
    }
    if (incomplete.length) {
      throw new UnprocessableEntityException({
        message: "请完成必检项目、必填说明、尺寸判定和现场照片后再提交审核。",
        itemKeys: [...new Set(incomplete)],
      });
    }
  }

  private async replaceAnswersAndEvidence(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    revisionId: string,
    orderId: string,
    answers: SaveInspectionAnswerDto[],
  ) {
    for (const answer of answers) {
      const assetIds = [...new Set(answer.evidenceAssetIds)];
      const assets = assetIds.length
        ? await transaction.mediaAsset.findMany({
          where: {
            id: { in: assetIds },
            tenantId,
            orderId,
            itemKey: answer.itemKey,
            scanStatus: "CLEAN",
          },
          select: { id: true },
        })
        : [];
      if (assets.length !== assetIds.length) {
        throw new UnprocessableEntityException("照片尚未完成安全检查，或不属于当前检测项。");
      }
      const answerJson: Prisma.InputJsonObject = {
        value: answer.value,
        ...(answer.note?.trim() ? { note: answer.note.trim() } : {}),
        ...(answer.thresholdFinding ? { thresholdFinding: answer.thresholdFinding } : {}),
      };
      await transaction.inspectionAnswer.upsert({
        where: { revisionId_itemKey: { revisionId, itemKey: answer.itemKey } },
        create: { tenantId, revisionId, itemKey: answer.itemKey, answer: answerJson },
        update: { answer: answerJson, updatedAt: new Date() },
      });
      await transaction.inspectionEvidence.deleteMany({
        where: { tenantId, revisionId, itemKey: answer.itemKey },
      });
      if (assetIds.length) {
        await transaction.inspectionEvidence.createMany({
          data: assetIds.map((assetId) => ({
            tenantId,
            revisionId,
            itemKey: answer.itemKey,
            assetId,
          })),
        });
      }
    }
  }

  private async findAccessibleOrder(actor: AuthenticatedActor, orderId: string) {
    const tenantId = this.requireTenant(actor);
    const order = await this.prisma.inspectionOrder.findFirst({
      where: {
        id: orderId,
        tenantId,
        ...(actor.role === MembershipRole.INSPECTOR ? { inspectorId: actor.membershipId! } : {}),
      },
      include: {
        vehicle: true,
        template: { select: { title: true, standardType: true } },
        templateRevision: {
          select: {
            revisionNumber: true,
            approvalRef: true,
            standardRevision: {
              select: { version: true, standard: { select: { code: true, title: true } } },
            },
          },
        },
        inspector: { select: { id: true, user: { select: { displayName: true } } } },
        revisions: {
          orderBy: { revisionNumber: "desc" },
          include: { answers: true, evidence: { include: { asset: { select: { id: true, mimeType: true, scanStatus: true, previewKey: true } } } } },
        },
      },
    });
    if (!order) {
      throw new NotFoundException("检测订单不存在或当前账号无权访问。");
    }
    return order;
  }

  private toOrderView(order: Awaited<ReturnType<OrdersService["findAccessibleOrder"]>>) {
    return {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      vehicle: {
        kind: order.vehicle.kind,
        brand: order.vehicle.brand,
        model: order.vehicle.model,
        year: order.vehicle.year,
        mileage: order.vehicle.mileage,
        plate: this.crypto.decrypt(order.vehicle.plateCipher),
        vin: this.crypto.decrypt(order.vehicle.vinCipher),
        firstRegisteredAt: order.vehicle.firstRegisteredAt,
      },
      inspector: { id: order.inspector.id, displayName: order.inspector.user.displayName },
      template: {
        ...order.template,
        revisionNumber: order.templateRevision.revisionNumber,
        approvalRef: order.templateRevision.approvalRef,
        standard: order.templateRevision.standardRevision,
      },
      revisions: order.revisions.map((revision) => ({
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        status: revision.status,
        schema: revision.schemaSnapshot,
        updatedAt: revision.updatedAt,
        submittedAt: revision.submittedAt,
        answers: revision.answers.map((answer) => ({
          itemKey: answer.itemKey,
          ...answerFromJson(answer.answer),
        })),
        evidence: revision.evidence.map((entry) => ({
          itemKey: entry.itemKey,
          assetId: entry.asset.id,
          mimeType: entry.asset.mimeType,
          scanStatus: entry.asset.scanStatus,
        })),
      })),
    };
  }
}
