import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MembershipRole, ReportStatus, ShareStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedActor } from "../auth/auth.types";
import { MediaService } from "../media/media.service";
import { PrismaService } from "../database/prisma.service";
import { CreateReportShareDto } from "./reports.dto";
import { hashPublicReportToken } from "./public-report-token";

const SHARE_SCOPE = {
  vehicleIdentifiers: "masked",
  inspectionResults: true,
  photoEvidence: true,
  internalReviewNotes: false,
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  async listForOrder(actor: AuthenticatedActor, orderId: string) {
    const tenantId = this.requireTenant(actor);
    const order = await this.prisma.inspectionOrder.findFirst({
      where: {
        id: orderId,
        tenantId,
        ...(actor.role === MembershipRole.INSPECTOR ? { inspectorId: actor.membershipId! } : {}),
      },
      select: { id: true },
    });
    if (!order) {
      throw new NotFoundException("检测订单不存在或当前账号无权访问。");
    }
    return this.prisma.report.findMany({
      where: { tenantId, orderId, status: ReportStatus.PUBLISHED },
      orderBy: { publishedAt: "desc" },
      select: { id: true, reportNo: true, status: true, publishedAt: true },
    });
  }

  async getPrivateReport(actor: AuthenticatedActor, reportId: string) {
    const tenantId = this.requireTenant(actor);
    const report = await this.prisma.report.findFirst({
      where: {
        id: reportId,
        tenantId,
        status: ReportStatus.PUBLISHED,
        order: actor.role === MembershipRole.INSPECTOR ? { inspectorId: actor.membershipId! } : {},
      },
      select: { id: true, orderId: true, reportNo: true, status: true, snapshot: true, publishedAt: true },
    });
    if (!report) {
      throw new NotFoundException("正式报告不存在或当前账号无权访问。");
    }
    return report;
  }

  async createShare(actor: AuthenticatedActor, reportId: string, input: CreateReportShareDto) {
    const tenantId = this.requireTenant(actor);
    const report = await this.prisma.report.findFirst({
      where: {
        id: reportId,
        tenantId,
        status: ReportStatus.PUBLISHED,
        order: actor.role === MembershipRole.INSPECTOR ? { inspectorId: actor.membershipId! } : {},
      },
      select: { id: true },
    });
    if (!report) {
      throw new NotFoundException("只有当前机构已发布的正式报告可以分享。");
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
    const share = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.reportShare.create({
        data: {
          tenantId,
          reportId,
          tokenHash: hashPublicReportToken(token),
          scope: SHARE_SCOPE,
          expiresAt,
          createdBy: actor.userId,
        },
        select: { id: true, expiresAt: true, status: true },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "report.share.create",
        resourceType: "report_share",
        resourceId: created.id,
        metadata: { reportId, expiresAt: expiresAt.toISOString() },
      }, transaction);
      return created;
    });
    const baseUrl = this.config.getOrThrow<string>("PUBLIC_REPORT_BASE_URL").replace(/\/+$/, "");
    return { ...share, url: `${baseUrl}/r/${token}`, token };
  }

  async listShares(actor: AuthenticatedActor, reportId: string) {
    const tenantId = this.requireAdminTenant(actor);
    const report = await this.prisma.report.findFirst({
      where: { id: reportId, tenantId },
      select: { id: true },
    });
    if (!report) {
      throw new NotFoundException("正式报告不存在。");
    }
    return this.prisma.reportShare.findMany({
      where: { tenantId, reportId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
  }

  async revokeShare(actor: AuthenticatedActor, reportId: string, shareId: string) {
    const tenantId = this.requireAdminTenant(actor);
    const share = await this.prisma.reportShare.findFirst({
      where: {
        id: shareId,
        reportId,
        tenantId,
        status: ShareStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!share) {
      throw new NotFoundException("有效的报告分享链接不存在。");
    }
    const revokedAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.reportShare.update({
        where: { id: share.id },
        data: { status: ShareStatus.REVOKED, revokedAt },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "report.share.revoke",
        resourceType: "report_share",
        resourceId: share.id,
      }, transaction);
    });
    return { id: share.id, status: ShareStatus.REVOKED, revokedAt };
  }

  async getPublicReport(token: string) {
    const share = await this.findValidShare(token);
    return {
      report: share.report.snapshot,
      reportNo: share.report.reportNo,
      publishedAt: share.report.publishedAt,
      expiresAt: share.expiresAt,
    };
  }

  async getPublicAssetPreviewUrl(token: string, assetId: string) {
    const share = await this.findValidShare(token);
    const evidence = await this.prisma.inspectionEvidence.findFirst({
      where: {
        tenantId: share.tenantId,
        revisionId: share.report.revisionId,
        assetId,
        asset: { scanStatus: "CLEAN", previewKey: { not: null } },
      },
      select: { assetId: true },
    });
    if (!evidence) {
      throw new NotFoundException("该报告未包含此现场照片。");
    }
    return this.media.createReportPreviewUrl(share.tenantId, share.report.revisionId, assetId);
  }

  private findValidShare(token: string) {
    return this.prisma.reportShare.findFirst({
      where: {
        tokenHash: hashPublicReportToken(token),
        status: ShareStatus.ACTIVE,
        expiresAt: { gt: new Date() },
        report: {
          status: ReportStatus.PUBLISHED,
          tenant: { status: "ACTIVE" },
        },
      },
      include: {
        report: {
          select: { id: true, revisionId: true, reportNo: true, snapshot: true, publishedAt: true },
        },
      },
    }).then((share) => {
      if (!share) {
        throw new NotFoundException("报告分享链接不可用。");
      }
      return share;
    });
  }

  private requireTenant(actor: AuthenticatedActor): string {
    if (!actor.tenantId || !actor.membershipId || !actor.role) {
      throw new ForbiddenException("请先选择有效的机构工作空间。");
    }
    return actor.tenantId;
  }

  private requireAdminTenant(actor: AuthenticatedActor): string {
    const tenantId = this.requireTenant(actor);
    if (actor.role !== MembershipRole.ORG_ADMIN) {
      throw new ForbiddenException("只有机构管理员可以管理分享链接。");
    }
    return tenantId;
  }
}
