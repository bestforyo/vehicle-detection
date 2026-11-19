import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { MembershipRole, PlatformRole, TenantStatus } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedActor } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  createTenant(input: { name: string; code: string }, actor: AuthenticatedActor) {
    return this.prisma.$transaction(async (transaction) => {
      const tenant = await transaction.tenant.create({
        data: {
          name: input.name.trim(),
          code: input.code.trim().toLowerCase(),
          settings: {},
        },
        select: { id: true, name: true, code: true, status: true, createdAt: true },
      });
      await this.audit.record({
        actorId: actor.userId,
        action: "platform.tenant.create",
        resourceType: "tenant",
        resourceId: tenant.id,
      }, transaction);
      return tenant;
    });
  }

  async listTenants(cursor?: string, limit = 25) {
    if (cursor && !await this.prisma.tenant.findUnique({ where: { id: cursor }, select: { id: true } })) {
      throw new NotFoundException("分页位置不存在。");
    }
    return this.prisma.tenant.findMany({
      take: Math.min(limit, 100),
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        planCode: true,
        expiresAt: true,
        seatLimit: true,
        monthlyOrderLimit: true,
        createdAt: true,
        _count: { select: { memberships: true, orders: true } },
      },
    });
  }

  async getPlatformOverview() {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [activeTenants, totalTenants, monthlyOrders, publishedReports, media] = await Promise.all([
      this.prisma.tenant.count({
        where: {
          status: TenantStatus.ACTIVE,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
      this.prisma.tenant.count(),
      this.prisma.inspectionOrder.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.report.count({ where: { status: "PUBLISHED" } }),
      this.prisma.mediaAsset.aggregate({ _sum: { sizeBytes: true }, _count: { id: true } }),
    ]);
    return {
      tenants: { active: activeTenants, total: totalTenants },
      orders: { currentMonth: monthlyOrders },
      reports: { published: publishedReports },
      media: {
        assets: media._count.id,
        bytes: (media._sum.sizeBytes ?? 0n).toString(),
      },
    };
  }

  async listPlatformAudit(cursor?: string, limit = 25) {
    if (cursor && !await this.prisma.auditEvent.findUnique({ where: { id: cursor }, select: { id: true } })) {
      throw new NotFoundException("审计分页位置不存在。");
    }
    return this.prisma.auditEvent.findMany({
      take: Math.min(Math.max(limit, 1), 100),
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        tenantId: true,
        actorId: true,
        action: true,
        resourceType: true,
        resourceId: true,
        requestId: true,
        metadata: true,
        createdAt: true,
      },
    });
  }

  async changeStatus(
    tenantId: string,
    status: TenantStatus,
    support: { reason: string; ticketNumber: string },
    actor: AuthenticatedActor,
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException("机构不存在。");
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.tenant.update({
        where: { id: tenantId },
        data: { status },
        select: { id: true, name: true, code: true, status: true, expiresAt: true },
      });
      if (status !== TenantStatus.ACTIVE) {
        await transaction.session.updateMany({
          where: { tenantId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: `platform.tenant.${status.toLowerCase()}`,
        resourceType: "tenant",
        resourceId: tenantId,
        metadata: { reason: support.reason, ticketNumber: support.ticketNumber },
      }, transaction);
      return result;
    });
    return updated;
  }

  async updateSubscription(
    tenantId: string,
    input: {
      planCode?: string;
      expiresAt?: string | null;
      seatLimit?: number;
      monthlyOrderLimit?: number | null;
      reason: string;
      ticketNumber: string;
    },
    actor: AuthenticatedActor,
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) {
      throw new NotFoundException("机构不存在。");
    }

    const { reason, ticketNumber, expiresAt } = input;
    const updatedFields = [
      ...(input.planCode !== undefined ? ["planCode"] : []),
      ...(input.expiresAt !== undefined ? ["expiresAt"] : []),
      ...(input.seatLimit !== undefined ? ["seatLimit"] : []),
      ...(input.monthlyOrderLimit !== undefined ? ["monthlyOrderLimit"] : []),
    ];
    if (!updatedFields.length) {
      throw new UnprocessableEntityException("至少提供一项需要更新的套餐或额度。");
    }
    const result = await this.prisma.$transaction(async (transaction) => {
      if (input.seatLimit !== undefined) {
        const [activeMembers, pendingInvitations] = await Promise.all([
          transaction.tenantMembership.count({ where: { tenantId, status: "ACTIVE" } }),
          transaction.tenantInvitation.count({
            where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
          }),
        ]);
        if (input.seatLimit < activeMembers + pendingInvitations) {
          throw new UnprocessableEntityException("成员席位不能低于当前启用成员和有效邀请数。");
        }
      }
      const updated = await transaction.tenant.update({
        where: { id: tenantId },
        data: {
          ...(input.planCode !== undefined ? { planCode: input.planCode.trim() } : {}),
          ...(input.seatLimit !== undefined ? { seatLimit: input.seatLimit } : {}),
          ...(input.monthlyOrderLimit !== undefined ? { monthlyOrderLimit: input.monthlyOrderLimit } : {}),
          ...(expiresAt !== undefined ? { expiresAt: expiresAt ? new Date(expiresAt) : null } : {}),
        },
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          planCode: true,
          expiresAt: true,
          seatLimit: true,
          monthlyOrderLimit: true,
        },
      });
      if (updated.status !== TenantStatus.ACTIVE || (updated.expiresAt && updated.expiresAt <= new Date())) {
        await transaction.session.updateMany({
          where: { tenantId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "platform.tenant.subscription.update",
        resourceType: "tenant",
        resourceId: tenantId,
        metadata: {
          updatedFields,
          ...(input.planCode !== undefined ? { planCode: input.planCode.trim() } : {}),
          ...(input.seatLimit !== undefined ? { seatLimit: input.seatLimit } : {}),
          ...(input.monthlyOrderLimit !== undefined ? { monthlyOrderLimit: input.monthlyOrderLimit } : {}),
          ...(expiresAt !== undefined ? { expiresAt } : {}),
          reason,
          ticketNumber,
        },
      }, transaction);
      return updated;
    });
    return result;
  }

  async changeMembershipRole(
    tenantId: string,
    membershipId: string,
    input: { role: MembershipRole; reason: string; ticketNumber: string },
    actor: AuthenticatedActor,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.tenantMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { id: true, role: true, status: true },
      });
      if (!membership) {
        throw new NotFoundException("机构成员不存在。");
      }
      if (membership.role === input.role) {
        throw new UnprocessableEntityException("成员已具有所选角色。");
      }
      if (membership.status === "ACTIVE"
        && membership.role === MembershipRole.ORG_ADMIN
        && input.role !== MembershipRole.ORG_ADMIN) {
        const activeAdmins = await transaction.tenantMembership.count({
          where: { tenantId, role: MembershipRole.ORG_ADMIN, status: "ACTIVE" },
        });
        if (activeAdmins <= 1) {
          throw new UnprocessableEntityException("机构至少需要保留一名启用的机构管理员。");
        }
      }
      const updated = await transaction.tenantMembership.update({
        where: { id: membership.id },
        data: { role: input.role },
        select: { id: true, role: true, status: true },
      });
      await transaction.session.updateMany({
        where: { membershipId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "platform.membership.role.change",
        resourceType: "tenant_membership",
        resourceId: membershipId,
        metadata: {
          previousRole: membership.role,
          nextRole: input.role,
          reason: input.reason,
          ticketNumber: input.ticketNumber,
        },
      }, transaction);
      return updated;
    }, { isolationLevel: "Serializable" });
  }

  async createInvitation(
    tenantId: string,
    email: string | undefined,
    roleName: string,
    actor: AuthenticatedActor,
  ) {
    if (actor.platformRole === PlatformRole.NONE && actor.tenantId !== tenantId) {
      throw new ForbiddenException("不能为其他机构创建邀请。");
    }
    if (actor.platformRole === PlatformRole.NONE && actor.role !== MembershipRole.ORG_ADMIN) {
      throw new ForbiddenException("只有机构管理员可以邀请机构成员。");
    }
    const role = roleName.toUpperCase();
    if (role !== MembershipRole.INSPECTOR && role !== MembershipRole.ORG_ADMIN) {
      throw new UnprocessableEntityException("机构角色只能为检测师或机构管理员。");
    }
    if (role === MembershipRole.ORG_ADMIN && actor.platformRole === PlatformRole.NONE) {
      throw new ForbiddenException("机构管理员账号只能由平台管理员开通。");
    }
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        status: TenantStatus.ACTIVE,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        ...(actor.platformRole === PlatformRole.NONE ? { memberships: { some: { id: actor.membershipId! } } } : {}),
      },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException("可用机构不存在。");
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const invitation = await this.prisma.$transaction(async (transaction) => {
      const [tenantWithLimit, activeMembers, pendingInvitations] = await Promise.all([
        transaction.tenant.findUnique({
          where: { id: tenantId },
          select: { seatLimit: true, expiresAt: true },
        }),
        transaction.tenantMembership.count({ where: { tenantId, status: "ACTIVE" } }),
        transaction.tenantInvitation.count({
          where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
        }),
      ]);
      if (!tenantWithLimit || tenantWithLimit.expiresAt && tenantWithLimit.expiresAt <= new Date()) {
        throw new NotFoundException("可用机构不存在。");
      }
      if (activeMembers + pendingInvitations >= tenantWithLimit.seatLimit) {
        throw new UnprocessableEntityException("机构成员席位已用完，请联系平台管理员调整配额。");
      }
      const created = await transaction.tenantInvitation.create({
        data: {
          tenantId,
          email: email?.toLowerCase(),
          role,
          tokenHash,
          expiresAt,
          invitedBy: actor.userId,
        },
        select: { id: true, tenantId: true, email: true, role: true, expiresAt: true },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "tenant.invitation.create",
        resourceType: "tenant_invitation",
        resourceId: created.id,
        metadata: { role, hasEmail: Boolean(email) },
      }, transaction);
      return created;
    }, { isolationLevel: "Serializable" });

    return {
      ...invitation,
      invitationToken: token,
    };
  }
}
