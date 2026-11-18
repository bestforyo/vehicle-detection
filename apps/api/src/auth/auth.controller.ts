import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CurrentActor } from "./current-actor.decorator";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthService } from "./auth.service";
import {
  InvitationSessionDto,
  PasswordSessionDto,
  RefreshSessionDto,
  WeChatSessionDto,
} from "./auth.dto";
import { AuthenticatedActor } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("wechat/session")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  signInWithWeChat(@Body() body: WeChatSessionDto) {
    return this.auth.signInWithWeChat(body.code, body.tenantId);
  }

  @Post("wechat/accept-invitation")
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  acceptWeChatInvitation(@Body() body: InvitationSessionDto) {
    return this.auth.acceptWeChatInvitation(body.code, body.invitationToken, body.displayName);
  }

  @Post("password/session")
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  signInWithPassword(@Body() body: PasswordSessionDto) {
    return this.auth.signInWithPassword(body.email, body.password, body.tenantId);
  }

  @Post("refresh")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  refresh(@Body() body: RefreshSessionDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @UseGuards(AccessTokenGuard)
  async signOut(@CurrentActor() actor: AuthenticatedActor) {
    await this.auth.signOut(actor);
    return { signedOut: true };
  }

  @Get("me")
  @UseGuards(AccessTokenGuard)
  currentUser(@CurrentActor() actor: AuthenticatedActor) {
    return this.auth.currentUser(actor);
  }

  @Get("workspaces")
  @UseGuards(AccessTokenGuard)
  async workspaces(@CurrentActor() actor: AuthenticatedActor) {
    const user = await this.auth.currentUser(actor);
    return { workspaces: user.memberships };
  }

  @Post("workspaces/:tenantId/switch")
  @UseGuards(AccessTokenGuard)
  switchWorkspace(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("tenantId") tenantId: string,
  ) {
    return this.auth.switchWorkspace(actor, tenantId);
  }
}
