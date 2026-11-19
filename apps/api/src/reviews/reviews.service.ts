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
  ReviewDecision,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedActor } from "../auth/auth.types";
import { FieldCryptoService } from "../crypto/field-crypto.service";
import { PrismaService } from "../database/prisma.service";
import { inspectionTemplateSchema } from "../templates/template-schema";
import { ReturnInspectionDto, ReviewDecisionDto } from "./reviews.dto";

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCryptoService,
    private readonly audit: AuditService,
  ) {}

  async listQueue(actor: AuthenticatedActor) {
    const tenantId = this.requireAdminTenant(actor);
    const orders = await this.prisma.inspectionOrder.findMany({
      where: { tenantId, status: OrderStatus.REVIEW_PENDING },
      orderBy: { updatedAt: "asc" },
      take: 100,
      include: {
        vehicle: { select: { kind: true, brand: true, model: true, year: true, plateCipher: true } },
        template: { select: { title: true, standardType: true } },
        inspector: { select: { user: { select: { displayName: true } } } },
        revisions: {
          where: { status: InspectionRevisionStatus.SUBMITTED },
          orderBy: { revisionNumber: "desc" },
          take: 1,
          select: { id: true, revisionNumber: true, submittedAt: true },
        },
      },
    });
    return orders.map((order) => ({
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      vehicle: {
        kind: order.vehicle.kind,
        brand: order.vehicle.brand,
        model: order.vehicle.model,
        year: order.vehicle.year,
        plate: this.crypto.mask(this.crypto.decrypt(order.vehicle.plateCipher)),
      },
      template: order.template,
      inspector: order.inspector.user,
      revision: order.revisions[0] ?? null,
    }));
  }

  async getOrderForReview(actor: AuthenticatedActor, orderId: string) {
    const tenantId = this.requireAdminTenant(actor);
    const order = await this.prisma.inspectionOrder.findFirst({
      where: { id: orderId, tenantId, status: OrderStatus.REVIEW_PENDING },
      include: {
        vehicle: true,
        template: { select: { title: true, standardType: true } },
        inspector: { select: { id: true, userId: true, user: { select: { displayName: true } } } },
        revisions: {
          where: { status: InspectionRevisionStatus.SUBMITTED },
          orderBy: { revisionNumber: "desc" },
          take: 1,
          include: { answers: true, evidence: { include: { asset: { select: { id: true, mimeType: true, scanStatus: true } } } } },
        },
      },
    });
    if (!order || !order.revisions[0]) {
      throw new NotFoundException("待审核检测版本不存在。");
    }
    return {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
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
      template: order.template,
      inspector: { id: order.inspector.id, displayName: order.inspector.user.displayName },
      revision: {
        id: order.revisions[0].id,
        revisionNumber: order.revisions[0].revisionNumber,
        schema: order.revisions[0].schemaSnapshot,
        submittedAt: order.revisions[0].submittedAt,
        answers: order.revisions[0].answers.map((answer) => ({ itemKey: answer.itemKey, answer: answer.answer })),
        evidence: order.revisions[0].evidence.map((entry) => ({
          itemKey: entry.itemKey,
          assetId: entry.asset.id,
          mimeType: entry.asset.mimeType,
          scanStatus: entry.asset.scanStatus,
        })),
      },
    };
  }

  async approve(
    actor: AuthenticatedActor,
    orderId: string,
    input: ReviewDecisionDto,
  ) {
    const tenantId = this.requireAdminTenant(actor);
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.inspectionOrder.findFirst({
        where: { id: orderId, tenantId, status: OrderStatus.REVIEW_PENDING },
        include: {
          vehicle: true,
          template: { select: { title: true, standardType: true } },
          templateRevision: {
            select: {
              revisionNumber: true,
              approvalRef: true,
              standardRevision: {
                select: {
                  version: true,
                  effectiveAt: true,
                  scope: true,
                  approvedAt: true,
                  standard: { select: { licenseRef: true } },
                },
              },
            },
          },
          inspector: { select: { userId: true, user: { select: { displayName: true } } } },
          tenant: { select: { name: true, settings: true } },
          revisions: {
            where: { id: input.revisionId, status: InspectionRevisionStatus.SUBMITTED },
            include: { answers: true, evidence: { include: { asset: true } } },
            take: 1,
          },
        },
      });
      if (!order || !order.revisions[0]) {
        throw new ConflictException("待审核检测版本已变更，请刷新后重试。");
      }
      if (order.inspector.userId === actor.userId) {
        throw new ForbiddenException("检测师不能审核自己提交的检测版本。");
      }
      const revision = order.revisions[0];
      if (!order.templateRevision.standardRevision?.approvedAt) {
        throw new UnprocessableEntityException("报告引用的检测标准尚未通过平台审批，不能发布。");
      }
      if (revision.evidence.some((entry) => entry.asset.scanStatus !== "CLEAN")) {
        throw new UnprocessableEntityException("报告包含未完成安全检查的照片，暂不能发布。");
      }
      const schema = inspectionTemplateSchema.parse(revision.schemaSnapshot);
      const answers = revision.answers.map((answer) => ({
        itemKey: answer.itemKey,
        value: answer.answer,
      }));
      const evidence = revision.evidence.map((entry) => ({
        itemKey: entry.itemKey,
        assetId: entry.assetId,
        caption: entry.caption,
      }));
      const publishedAt = new Date();
      const reportNo = `RPT${publishedAt.toISOString().slice(0, 10).replace(/-/g, "")}${randomBytes(6).toString("hex").toUpperCase()}`;
      const tenantSettings = order.tenant.settings;
      const settings = tenantSettings && typeof tenantSettings === "object" && !Array.isArray(tenantSettings)
        ? tenantSettings as Record<string, unknown>
        : {};
      const snapshot: Prisma.InputJsonObject = {
        version: 1,
        reportNo,
        orderNo: order.orderNo,
        tenant: {
          name: order.tenant.name,
          displayName: typeof settings.displayName === "string" ? settings.displayName : order.tenant.name,
          reportDisclaimer: typeof settings.reportDisclaimer === "string" ? settings.reportDisclaimer : null,
        },
        publishedAt: publishedAt.toISOString(),
        vehicle: {
          kind: order.vehicle.kind,
          brand: order.vehicle.brand,
          model: order.vehicle.model,
          year: order.vehicle.year,
          mileage: order.vehicle.mileage,
          plate: this.crypto.mask(this.crypto.decrypt(order.vehicle.plateCipher)),
          vin: this.crypto.mask(this.crypto.decrypt(order.vehicle.vinCipher)),
          firstRegisteredAt: order.vehicle.firstRegisteredAt?.toISOString() ?? null,
        },
        template: {
          title: order.template.title,
          standardType: order.template.standardType,
          standardVersion: order.templateRevision.standardRevision?.version ?? null,
          standardEffectiveAt: order.templateRevision.standardRevision?.effectiveAt?.toISOString() ?? null,
          coverageScope: order.templateRevision.standardRevision?.scope ?? null,
          standardLicenseRef: order.templateRevision.standardRevision?.standard.licenseRef ?? null,
          revisionNumber: order.templateRevision.revisionNumber,
          approvalRef: order.templateRevision.approvalRef,
        },
        inspector: { displayName: order.inspector.user.displayName },
        professionalConclusion: input.professionalConclusion?.trim() || null,
        schema: schema as object,
        answers: answers as object[],
        evidence: evidence as object[],
      };

      const review = await transaction.reviewRecord.create({
        data: {
          tenantId,
          orderId,
          revisionId: revision.id,
          reviewerId: actor.userId,
          decision: ReviewDecision.APPROVED,
          comment: input.professionalConclusion?.trim() || null,
        },
      });
      await transaction.inspectionRevision.update({
        where: { id: revision.id },
        data: { status: InspectionRevisionStatus.APPROVED },
      });
      const report = await transaction.report.create({
        data: {
          tenantId,
          orderId,
          revisionId: revision.id,
          reportNo,
          snapshot,
          publishedBy: actor.userId,
          publishedAt,
        },
        select: { id: true, reportNo: true, publishedAt: true },
      });
      await transaction.inspectionOrder.update({
        where: { id: orderId },
        data: { status: OrderStatus.PUBLISHED },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "report.publish",
        resourceType: "report",
        resourceId: report.id,
        metadata: { reportNo, revisionId: revision.id, reviewId: review.id },
      }, transaction);
      return report;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async returnForModification(
    actor: AuthenticatedActor,
    orderId: string,
    input: ReturnInspectionDto,
  ) {
    const tenantId = this.requireAdminTenant(actor);
    const comment = input.comment.trim();
    if (!comment) {
      throw new BadRequestException("退回意见不能为空。");
    }
    return this.prisma.$transaction(async (transaction) => {
      const order = await transaction.inspectionOrder.findFirst({
        where: { id: orderId, tenantId, status: OrderStatus.REVIEW_PENDING },
        include: {
          inspector: { select: { userId: true } },
          revisions: {
            where: { id: input.revisionId, status: InspectionRevisionStatus.SUBMITTED },
            include: { answers: true, evidence: true },
            take: 1,
          },
        },
      });
      if (!order || !order.revisions[0]) {
        throw new ConflictException("待审核检测版本已变更，请刷新后重试。");
      }
      if (order.inspector.userId === actor.userId) {
        throw new ForbiddenException("检测师不能退回自己提交的检测版本。");
      }
      const revision = order.revisions[0];
      const itemKeys = new Set(inspectionTemplateSchema.parse(revision.schemaSnapshot)
        .sections.flatMap((section) => section.items.map((item) => item.key)));
      const schemaSnapshot = inspectionTemplateSchema.parse(revision.schemaSnapshot);
      const targetItemKeys = [...new Set(input.targetItemKeys ?? [])];
      if (targetItemKeys.some((key) => !itemKeys.has(key))) {
        throw new UnprocessableEntityException("退回项目必须属于当前检测模板。");
      }

      await transaction.reviewRecord.create({
        data: {
          tenantId,
          orderId,
          revisionId: revision.id,
          reviewerId: actor.userId,
          decision: ReviewDecision.RETURNED,
          comment,
          targetKeys: targetItemKeys,
        },
      });
      await transaction.inspectionRevision.update({
        where: { id: revision.id },
        data: { status: InspectionRevisionStatus.RETURNED },
      });
      const nextRevision = await transaction.inspectionRevision.create({
        data: {
          tenantId,
          orderId,
          revisionNumber: revision.revisionNumber + 1,
          basedOnRevisionId: revision.id,
          schemaSnapshot: schemaSnapshot as Prisma.InputJsonValue,
          answers: {
            create: revision.answers.map((answer) => ({
              tenantId,
              itemKey: answer.itemKey,
              answer: answer.answer as Prisma.InputJsonValue,
            })),
          },
          evidence: {
            create: revision.evidence.map((entry) => ({
              tenantId,
              itemKey: entry.itemKey,
              assetId: entry.assetId,
              caption: entry.caption,
            })),
          },
        },
        select: { id: true, revisionNumber: true },
      });
      await transaction.inspectionOrder.update({
        where: { id: orderId },
        data: { status: OrderStatus.NEEDS_MODIFICATION, currentRevisionId: nextRevision.id },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "inspection.return",
        resourceType: "inspection_revision",
        resourceId: revision.id,
        metadata: { nextRevisionId: nextRevision.id, targetItemKeys },
      }, transaction);
      return { orderId, revisionId: nextRevision.id, revisionNumber: nextRevision.revisionNumber };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private requireAdminTenant(actor: AuthenticatedActor): string {
    if (!actor.tenantId || !actor.membershipId || actor.role !== MembershipRole.ORG_ADMIN) {
      throw new ForbiddenException("只有机构管理员可以访问审核队列和报告审核功能。");
    }
    return actor.tenantId;
  }
}
