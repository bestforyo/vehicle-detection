import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { MembershipRole } from "@prisma/client";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RequireMembershipRole } from "../auth/access.decorator";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedActor } from "../auth/auth.types";
import { TenantsService } from "./tenants.service";
import {
  ListOrganizationAuditQueryDto,
  OrganizationInvitationDto,
  UpdateMembershipStatusDto,
  UpdateOrganizationDto,
} from "./organization.dto";
import { OrganizationService } from "./organization.service";

@Controller("organization")
@UseGuards(AccessTokenGuard, RolesGuard)
@RequireMembershipRole(MembershipRole.ORG_ADMIN)
export class OrganizationController {
  constructor(
    private readonly organization: OrganizationService,
    private readonly tenants: TenantsService,
  ) {}

  @Get()
  getProfile(@CurrentActor() actor: AuthenticatedActor) {
    return this.organization.getProfile(actor);
  }

  @Patch()
  updateProfile(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() body: UpdateOrganizationDto,
  ) {
    return this.organization.updateProfile(actor, body);
  }

  @Get("members")
  listMembers(@CurrentActor() actor: AuthenticatedActor) {
    return this.organization.listMembers(actor);
  }

  @Patch("members/:membershipId/status")
  updateMemberStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
    @Body() body: UpdateMembershipStatusDto,
  ) {
    return this.organization.updateMemberStatus(actor, membershipId, body.status);
  }

  @Post("invitations")
  createInspectorInvitation(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() body: OrganizationInvitationDto,
  ) {
    if (!actor.tenantId) {
      throw new ForbiddenException("请先选择有效的机构工作空间。");
    }
    return this.tenants.createInvitation(actor.tenantId, body.email, MembershipRole.INSPECTOR, actor);
  }

  @Get("invitations")
  listInvitations(@CurrentActor() actor: AuthenticatedActor) {
    return this.organization.listInvitations(actor);
  }

  @Post("invitations/:invitationId/revoke")
  revokeInvitation(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("invitationId", ParseUUIDPipe) invitationId: string,
  ) {
    return this.organization.revokeInvitation(actor, invitationId);
  }

  @Get("audit")
  listAudit(
    @CurrentActor() actor: AuthenticatedActor,
    @Query() query: ListOrganizationAuditQueryDto,
  ) {
    return this.organization.listAudit(actor, query);
  }
}
