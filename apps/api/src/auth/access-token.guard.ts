import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { PrismaService } from "../database/prisma.service";
import { AccessTokenClaims, AuthenticatedActor } from "./auth.types";

type AuthenticatedRequest = Request & { actor: AuthenticatedActor };

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (request.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token) {
      throw new UnauthorizedException("请先登录。");
    }

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        issuer: "jianjian-api",
        audience: "jianjian-clients",
      });
    } catch {
      throw new UnauthorizedException("登录状态无效或已过期，请重新登录。");
    }

    const session = await this.prisma.session.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: { select: { id: true, status: true, platformRole: true } },
        membership: {
          include: {
            tenant: { select: { id: true, status: true, expiresAt: true } },
          },
        },
      },
    });

    if (!session || session.user.status !== "ACTIVE") {
      throw new UnauthorizedException("登录会话已失效，请重新登录。");
    }

    if (claims.tenantId !== session.tenantId || claims.membershipId !== session.membershipId) {
      throw new UnauthorizedException("登录工作空间已变更，请重新登录。");
    }

    if (session.tenantId && (
      !session.membership
      || session.membership.status !== "ACTIVE"
      || session.membership.tenant.status !== "ACTIVE"
      || session.membership.tenant.expiresAt && session.membership.tenant.expiresAt <= new Date()
    )) {
      throw new UnauthorizedException("机构账号已停用或机构不可用。");
    }

    request.actor = {
      userId: session.userId,
      sessionId: session.id,
      tenantId: session.tenantId,
      membershipId: session.membershipId,
      role: session.membership?.role ?? null,
      platformRole: session.user.platformRole,
    };
    return true;
  }
}
