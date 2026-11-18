import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { REQUIRED_MEMBERSHIP_ROLES, REQUIRED_PLATFORM_ROLES } from "./access.decorator";
import { AuthenticatedActor } from "./auth.types";

type AuthorizedRequest = Request & { actor?: AuthenticatedActor };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AuthenticatedActor["role"][]>(
      REQUIRED_MEMBERSHIP_ROLES,
      [context.getHandler(), context.getClass()],
    );
    const platformRoles = this.reflector.getAllAndOverride<AuthenticatedActor["platformRole"][]>(
      REQUIRED_PLATFORM_ROLES,
      [context.getHandler(), context.getClass()],
    );

    if (!roles?.length && !platformRoles?.length) {
      return true;
    }

    const actor = context.switchToHttp().getRequest<AuthorizedRequest>().actor;
    if (!actor) {
      throw new ForbiddenException("缺少有效的身份上下文。");
    }

    if (platformRoles?.length && platformRoles.includes(actor.platformRole)) {
      return true;
    }

    if (roles?.length && actor.role && roles.includes(actor.role)) {
      return true;
    }

    throw new ForbiddenException("当前账号没有执行此操作的权限。");
  }
}
