import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MembershipRole, UserStatus } from "@prisma/client";
import { AuthenticatedActor } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";
import { ListOrganizationAuditQueryDto, UpdateOrganizationDto } from "./organization.dto";

type OrganizationSettings = Record<string, unknown> & {
  displayName?: string;
  reportDisclaimer?: string;
};

function getSettings(value: unknown): OrganizationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const settings = value as Record<string, unknown>;
  const { displayName, reportDisclaimer, ...otherSettings } = settings;
  return {
    ...otherSettings,
    ...(typeof displayName === "string" ? { displayName } : {}),
    ...(typeof reportDisclaimer === "string" ? { reportDisclaimer } : {}),
  };
}

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getProfile(actor: AuthenticatedActor) {
    const tenantId = this.requireAdmin(actor);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        planCode: true,
        expiresAt: true,
        settings: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException("机构不存在。");
    }
    const settings = getSettings(tenant.settings);
    return {
      id: tenant.id,
      code: tenant.code,
      name: tenant.name,
      displayName: settings.displayName ?? tenant.name,
      reportDisclaimer: settings.reportDisclaimer ?? "",
      status: tenant.status,
      planCode: tenant.planCode,
      expiresAt: tenant.expiresAt,
    };
  }

  async updateProfile(actor: AuthenticatedActor, input: UpdateOrganizationDto) {
    const tenantId = this.requireAdmin(actor);
    if (input.name === undefined && input.displayName === undefined && input.reportDisclaimer === undefined) {
      throw new BadRequestException("至少提供一项需要更新的机构资料。");
    }
    const existing = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, settings: true },
    });
    if (!existing) {
      throw new NotFoundException("机构不存在。");
    }
    const settings = getSettings(existing.settings);
    const nextSettings = {
      ...settings,
      ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
      ...(input.reportDisclaimer !== undefined ? { reportDisclaimer: input.reportDisclaimer.trim() } : {}),
    };
    const updated = await this.prisma.$transaction(async (transaction) => {
      const tenant = await transaction.tenant.update({
        where: { id: tenantId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          settings: nextSettings,
        },
        select: { id: true, code: true, name: true, settings: true },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "organization.profile.update",
        resourceType: "tenant",
        resourceId: tenantId,
        metadata: {
          updatedFields: [
            ...(input.name !== undefined ? ["name"] : []),
            ...(input.displayName !== undefined ? ["displayName"] : []),
            ...(input.reportDisclaimer !== undefined ? ["reportDisclaimer"] : []),
          ],
        },
      }, transaction);
      return tenant;
    });
    const updatedSettings = getSettings(updated.settings);
    return {
      id: updated.id,
      code: updated.code,
      name: updated.name,
      displayName: updatedSettings.displayName ?? updated.name,
      reportDisclaimer: updatedSettings.reportDisclaimer ?? "",
    };
  }

  async listMembers(actor: AuthenticatedActor) {
    const tenantId = this.requireAdmin(actor);
    return this.prisma.tenantMembership.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, displayName: true, email: true, status: true } },
      },
    });
  }

  async updateMemberStatus(actor: AuthenticatedActor, membershipId: string, status: UserStatus) {
    const tenantId = this.requireAdmin(actor);
    return this.prisma.$transaction(async (transaction) => {
      const membership = await transaction.tenantMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { id: true, role: true, status: true, userId: true },
      });
      if (!membership) {
        throw new NotFoundException("机构成员不存在。");
      }
      if (membership.userId === actor.userId && status === UserStatus.DISABLED) {
        throw new ConflictException("不能停用当前登录的机构管理员。");
      }
      if (membership.role === MembershipRole.ORG_ADMIN
        && membership.status === UserStatus.ACTIVE
        && status === UserStatus.DISABLED) {
        const activeAdmins = await transaction.tenantMembership.count({
          where: { tenantId, role: MembershipRole.ORG_ADMIN, status: UserStatus.ACTIVE },
        });
        if (activeAdmins <= 1) {
          throw new ConflictException("机构至少需要保留一名启用的机构管理员。");
        }
      }
      if (membership.status === UserStatus.DISABLED && status === UserStatus.ACTIVE) {
        const [tenant, activeMembers, pendingInvitations] = await Promise.all([
          transaction.tenant.findUnique({ where: { id: tenantId }, select: { seatLimit: true } }),
          transaction.tenantMembership.count({ where: { tenantId, status: UserStatus.ACTIVE } }),
          transaction.tenantInvitation.count({
            where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
          }),
        ]);
        if (!tenant || activeMembers + pendingInvitations >= tenant.seatLimit) {
          throw new ConflictException("机构成员席位已用完，无法重新启用该成员。");
        }
      }
      const updated = await transaction.tenantMembership.update({
        where: { id: membership.id },
        data: { status },
        select: { id: true, status: true, role: true },
      });
      if (status === UserStatus.DISABLED) {
        await transaction.session.updateMany({
          where: { membershipId: membership.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: `organization.member.${status.toLowerCase()}`,
        resourceType: "tenant_membership",
        resourceId: membership.id,
        metadata: { role: membership.role },
      }, transaction);
      return updated;
    }, { isolationLevel: "Serializable" });
  }

  async listAudit(actor: AuthenticatedActor, query: ListOrganizationAuditQueryDto) {
    const tenantId = this.requireAdmin(actor);
    if (query.cursor && !await this.prisma.auditEvent.findFirst({
      where: { id: query.cursor, tenantId },
      select: { id: true },
    })) {
      throw new NotFoundException("审计分页位置不存在。");
    }
    return this.prisma.auditEvent.findMany({
      where: { tenantId },
      take: query.limit,
      ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
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

  async listInvitations(actor: AuthenticatedActor) {
    const tenantId = this.requireAdmin(actor);
    return this.prisma.tenantInvitation.findMany({
      where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });
  }

  async revokeInvitation(actor: AuthenticatedActor, invitationId: string) {
    const tenantId = this.requireAdmin(actor);
    const invitation = await this.prisma.tenantInvitation.findFirst({
      where: { id: invitationId, tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (!invitation) {
      throw new NotFoundException("有效的成员邀请不存在。");
    }
    const revokedAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.tenantInvitation.update({
        where: { id: invitation.id },
        data: { expiresAt: revokedAt },
        select: { id: true, expiresAt: true },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "organization.invitation.revoke",
        resourceType: "tenant_invitation",
        resourceId: invitation.id,
      }, transaction);
      return revoked;
    });
  }

  private requireAdmin(actor: AuthenticatedActor): string {
    if (!actor.tenantId || !actor.membershipId || actor.role !== MembershipRole.ORG_ADMIN) {
      throw new ForbiddenException("只有机构管理员可以管理机构设置和成员。");
    }
    return actor.tenantId;
  }
}
