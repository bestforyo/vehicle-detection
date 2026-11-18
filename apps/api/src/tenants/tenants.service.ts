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
        createdAt: true,
        _count: { select: { memberships: true, orders: true } },
      },
    });
  }

  async changeStatus(
    tenantId: string,
    status: TenantStatus,
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
        select: { id: true, name: true, code: true, status: true },
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
      }, transaction);
      return result;
    });
    return updated;
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
    });

    return {
      ...invitation,
      invitationToken: token,
    };
  }
}
