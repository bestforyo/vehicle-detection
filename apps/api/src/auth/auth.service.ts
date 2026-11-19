import {
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { MembershipRole, PlatformRole, Prisma, TenantStatus } from "@prisma/client";
import { randomBytes, createHash, createHmac, randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../database/prisma.service";
import { AuthenticatedActor } from "./auth.types";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXJhbmRvbXNhbHQ$NO7kP/+Myd1J1dXQ/8fZVRASXhHpQXPA0OQdshFntg";

type UserWithMemberships = Prisma.UserGetPayload<{
  include: {
    memberships: {
      where: { status: "ACTIVE" };
      include: { tenant: { select: { id: true; name: true; code: true; status: true; expiresAt: true } } };
    };
  };
}>;

type WeChatSessionResponse = {
  openid?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

function isTenantAvailable(tenant: { status: TenantStatus; expiresAt?: Date | null }): boolean {
  return tenant.status === TenantStatus.ACTIVE && (!tenant.expiresAt || tenant.expiresAt > new Date());
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async signInWithWeChat(code: string, requestedTenantId?: string) {
    const appId = this.config.get<string>("WECHAT_MINIAPP_APP_ID");
    const appSecret = this.config.get<string>("WECHAT_MINIAPP_APP_SECRET");
    if (!appId || !appSecret) {
      throw new UnprocessableEntityException("微信小程序登录尚未配置，请联系平台管理员。");
    }

    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", appId);
    url.searchParams.set("secret", appSecret);
    url.searchParams.set("js_code", code);
    url.searchParams.set("grant_type", "authorization_code");

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch (error) {
      throw new UnprocessableEntityException(
        error instanceof Error ? "微信身份服务暂时不可用，请稍后重试。" : "微信身份服务暂时不可用，请稍后重试。",
      );
    }
    if (!response.ok) {
      throw new UnprocessableEntityException("微信身份服务暂时不可用，请稍后重试。");
    }

    const payload = await response.json() as WeChatSessionResponse;
    if (payload.errcode !== undefined || !payload.openid) {
      throw new UnauthorizedException("微信登录凭证无效或已过期，请重新授权。");
    }

    const subjectHash = this.hashIdentity(`${appId}:${payload.openid}`);
    const identity = await this.prisma.userIdentity.findUnique({
      where: { provider_subjectHash: { provider: "WECHAT_MINI_PROGRAM", subjectHash } },
      include: { user: { include: this.activeMembershipsInclude() } },
    });
    if (!identity || identity.user.status !== "ACTIVE") {
      throw new UnauthorizedException("此微信账号尚未加入机构，请联系机构管理员开通。");
    }

    return this.selectWorkspace(identity.user, requestedTenantId);
  }

  async acceptWeChatInvitation(code: string, invitationToken: string, displayName: string) {
    const appId = this.config.get<string>("WECHAT_MINIAPP_APP_ID");
    const appSecret = this.config.get<string>("WECHAT_MINIAPP_APP_SECRET");
    if (!appId || !appSecret) {
      throw new UnprocessableEntityException("微信小程序登录尚未配置，请联系平台管理员。");
    }

    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", appId);
    url.searchParams.set("secret", appSecret);
    url.searchParams.set("js_code", code);
    url.searchParams.set("grant_type", "authorization_code");

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    } catch {
      throw new UnprocessableEntityException("微信身份服务暂时不可用，请稍后重试。");
    }
    if (!response.ok) {
      throw new UnprocessableEntityException("微信身份服务暂时不可用，请稍后重试。");
    }

    const payload = await response.json() as WeChatSessionResponse;
    if (payload.errcode !== undefined || !payload.openid) {
      throw new UnauthorizedException("微信登录凭证无效或已过期，请重新授权。");
    }

    const identityHash = this.hashIdentity(`${appId}:${payload.openid}`);
    const tokenHash = this.hashToken(invitationToken);
    const refreshToken = randomBytes(48).toString("base64url");
    const refreshHash = this.hashToken(refreshToken);
    const sessionId = randomUUID();

    const result = await this.prisma.$transaction(async (transaction) => {
      const invitation = await transaction.tenantInvitation.findUnique({
        where: { tokenHash },
        include: { tenant: { select: { id: true, status: true, expiresAt: true } } },
      });
      if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()
        || !isTenantAvailable(invitation.tenant)) {
        throw new UnauthorizedException("邀请链接无效、已使用或已过期。");
      }

      const existingIdentity = await transaction.userIdentity.findUnique({
        where: { provider_subjectHash: { provider: "WECHAT_MINI_PROGRAM", subjectHash: identityHash } },
        include: { user: { select: { id: true, status: true } } },
      });
      if (existingIdentity?.user.status === "DISABLED") {
        throw new UnauthorizedException("此微信账号已停用，请联系平台管理员。");
      }

      const user = existingIdentity
        ? await transaction.user.findUniqueOrThrow({ where: { id: existingIdentity.user.id } })
        : await transaction.user.create({
          data: {
            displayName: displayName.trim(),
            identities: {
              create: { provider: "WECHAT_MINI_PROGRAM", subjectHash: identityHash },
            },
          },
        });

      const membership = await transaction.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: invitation.tenantId, userId: user.id } },
      });
      if (membership?.status === "ACTIVE") {
        throw new UnauthorizedException("当前微信账号已加入此机构。");
      }

      const activeMembership = membership
        ? await transaction.tenantMembership.update({
          where: { id: membership.id },
          data: { status: "ACTIVE", role: invitation.role },
        })
        : await transaction.tenantMembership.create({
          data: {
            tenantId: invitation.tenantId,
            userId: user.id,
            role: invitation.role,
          },
        });

      await transaction.tenantInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      await transaction.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          tenantId: invitation.tenantId,
          membershipId: activeMembership.id,
          refreshHash,
          refreshFamily: randomUUID(),
          expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
        },
      });
      await this.audit.record({
        tenantId: invitation.tenantId,
        actorId: user.id,
        action: "tenant.invitation.accept",
        resourceType: "tenant_membership",
        resourceId: activeMembership.id,
      }, transaction);

      return {
        userId: user.id,
        tenantId: invitation.tenantId,
        membershipId: activeMembership.id,
        role: activeMembership.role,
      };
    });

    return {
      ...(await this.issueTokens(
        result.userId,
        sessionId,
        result.tenantId,
        result.membershipId,
        result.role,
      )),
      refreshToken,
    };
  }

  async signInWithPassword(email: string, password: string, requestedTenantId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { memberships: { include: { tenant: { select: { id: true, name: true, code: true, status: true, expiresAt: true } } } } },
    });
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    let passwordMatches = false;
    try {
      passwordMatches = await argon2.verify(passwordHash, password);
    } catch {
      passwordMatches = false;
    }
    if (!user || !passwordMatches || user.status !== "ACTIVE") {
      throw new UnauthorizedException("邮箱或密码不正确。");
    }

    const memberships = user.memberships.filter(
      (membership) => membership.status === "ACTIVE" && isTenantAvailable(membership.tenant),
    );
    return this.selectWorkspace({ ...user, memberships } as UserWithMemberships, requestedTenantId);
  }

  async refresh(refreshToken: string) {
    const refreshHash = this.hashToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshHash },
      include: {
        user: { select: { id: true, status: true, platformRole: true } },
        membership: { include: { tenant: { select: { id: true, status: true, expiresAt: true } } } },
      },
    });

    if (!session) {
      const reusedToken = await this.prisma.session.findFirst({
        where: { previousRefreshHashes: { has: refreshHash }, revokedAt: null },
        select: { refreshFamily: true },
      });
      if (reusedToken) {
        await this.prisma.session.updateMany({
          where: { refreshFamily: reusedToken.refreshFamily, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      throw new UnauthorizedException("刷新凭证无效，请重新登录。");
    }
    if (session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") {
      throw new UnauthorizedException("登录状态已过期，请重新登录。");
    }
    if (session.tenantId && (
      !session.membership || session.membership.status !== "ACTIVE"
      || !isTenantAvailable(session.membership.tenant)
    )) {
      throw new UnauthorizedException("机构账号已停用或机构不可用。");
    }

    const refreshTokenNext = randomBytes(48).toString("base64url");
    const refreshHashNext = this.hashToken(refreshTokenNext);
    const rotated = await this.prisma.session.updateMany({
      where: { id: session.id, refreshHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { refreshHash: refreshHashNext, previousRefreshHashes: { push: refreshHash } },
    });
    if (rotated.count !== 1) {
      throw new UnauthorizedException("登录状态已更新，请重新登录。");
    }

    const accessToken = await this.issueAccessToken({
      userId: session.userId,
      sessionId: session.id,
      tenantId: session.tenantId,
      membershipId: session.membershipId,
    });
    return { accessToken, refreshToken: refreshTokenNext, expiresIn: 600 };
  }

  async signOut(actor: AuthenticatedActor): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: actor.sessionId, userId: actor.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      action: "auth.session.logout",
      resourceType: "session",
      resourceId: actor.sessionId,
    });
  }

  async currentUser(actor: AuthenticatedActor) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: {
        id: true,
        displayName: true,
        email: true,
        platformRole: true,
        memberships: {
          where: {
            status: "ACTIVE",
            tenant: {
              status: TenantStatus.ACTIVE,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          },
          select: {
            id: true,
            role: true,
            tenant: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
  }

  async switchWorkspace(actor: AuthenticatedActor, tenantId: string) {
    const membership = await this.prisma.tenantMembership.findFirst({
      where: {
        tenantId,
        userId: actor.userId,
        status: "ACTIVE",
        tenant: {
          status: "ACTIVE",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new UnauthorizedException("当前账号未加入该机构或机构不可用。");
    }

    const refreshToken = randomBytes(48).toString("base64url");
    const refreshHash = this.hashToken(refreshToken);
    const now = new Date();
    const nextSession = await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.session.update({
        where: { id: actor.sessionId },
        data: { revokedAt: now },
      });
      const next = await transaction.session.create({
        data: {
          userId: actor.userId,
          tenantId,
          membershipId: membership.id,
          refreshHash,
          refreshFamily: session.refreshFamily,
          expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
        },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "auth.workspace.switch",
        resourceType: "tenant_membership",
        resourceId: membership.id,
      }, transaction);
      return next;
    });
    return {
      ...(await this.issueTokens(actor.userId, nextSession.id, tenantId, membership.id)),
      refreshToken,
    };
  }

  private activeMembershipsInclude() {
    return {
      memberships: {
        where: {
          status: "ACTIVE" as const,
          tenant: {
            status: TenantStatus.ACTIVE,
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
        },
        include: { tenant: { select: { id: true, name: true, code: true, status: true, expiresAt: true } } },
      },
    };
  }

  private async selectWorkspace(user: UserWithMemberships, requestedTenantId?: string) {
    const memberships = user.memberships.filter(
      (membership) => isTenantAvailable(membership.tenant),
    );
    const workspaces = memberships.map((membership) => ({
      id: membership.tenant.id,
      name: membership.tenant.name,
      code: membership.tenant.code,
      role: membership.role,
    }));

    if (!memberships.length && user.platformRole !== PlatformRole.NONE) {
      return this.createPlatformSession(user.id, user.platformRole);
    }
    if (!memberships.length) {
      throw new UnauthorizedException("当前账号没有可用的机构工作空间。");
    }
    if (!requestedTenantId && memberships.length > 1) {
      return { workspaces, requiresWorkspaceSelection: true };
    }

    const membership = memberships.find(
      (candidate) => candidate.tenant.id === (requestedTenantId ?? memberships[0].tenant.id),
    );
    if (!membership) {
      throw new UnauthorizedException("当前账号未加入所选机构。");
    }

    const sessionId = randomUUID();
    const refreshToken = randomBytes(48).toString("base64url");
    const session = await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        tenantId: membership.tenant.id,
        membershipId: membership.id,
        refreshHash: this.hashToken(refreshToken),
        refreshFamily: randomUUID(),
        expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
      },
    });
    await this.audit.record({
      tenantId: membership.tenant.id,
      actorId: user.id,
      action: "auth.session.login",
      resourceType: "session",
      resourceId: session.id,
      metadata: { provider: "password_or_wechat" },
    });
    return {
      workspaces,
      requiresWorkspaceSelection: false,
      ...(await this.issueTokens(user.id, session.id, membership.tenant.id, membership.id, membership.role)),
      refreshToken,
    };
  }

  private async createPlatformSession(userId: string, platformRole: PlatformRole) {
    const sessionId = randomUUID();
    const refreshToken = randomBytes(48).toString("base64url");
    const session = await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshHash: this.hashToken(refreshToken),
        refreshFamily: randomUUID(),
        expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
      },
    });
    await this.audit.record({
      actorId: userId,
      action: "auth.platform.login",
      resourceType: "session",
      resourceId: session.id,
    });
    return {
      workspaces: [],
      requiresWorkspaceSelection: false,
      ...(await this.issueTokens(userId, session.id, null, null)),
      refreshToken,
      platformRole,
    };
  }

  private async issueTokens(
    userId: string,
    sessionId: string,
    tenantId: string | null,
    membershipId: string | null,
    role?: MembershipRole,
  ) {
    const accessToken = await this.issueAccessToken({ userId, sessionId, tenantId, membershipId });
    return {
      accessToken,
      expiresIn: 600,
      actor: { userId, tenantId, membershipId, role: role ?? null },
    };
  }

  private issueAccessToken(input: {
    userId: string;
    sessionId: string;
    tenantId: string | null;
    membershipId: string | null;
  }) {
    return this.jwt.signAsync(
      {
        sid: input.sessionId,
        tenantId: input.tenantId,
        membershipId: input.membershipId,
      },
      {
        subject: input.userId,
        issuer: "jianjian-api",
        audience: "jianjian-clients",
        expiresIn: "10m",
      },
    );
  }

  private hashIdentity(identity: string): string {
    return createHmac("sha256", this.config.getOrThrow<string>("IDENTITY_HASH_SECRET"))
      .update(identity)
      .digest("hex");
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
