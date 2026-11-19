import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { MembershipRole, PlatformRole, TenantStatus } from "@prisma/client";
import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { CreateInvitationDto } from "../auth/auth.dto";
import { RequireMembershipRole, RequirePlatformRole } from "../auth/access.decorator";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedActor } from "../auth/auth.types";
import { TenantsService } from "./tenants.service";

class CreateTenantDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9-]{1,39}$/)
  code!: string;
}

class TenantStatusDto {
  @IsIn([TenantStatus.ACTIVE, TenantStatus.SUSPENDED, TenantStatus.CLOSED])
  status!: TenantStatus;

  @IsString()
  @Length(10, 1000)
  @Matches(/\S/)
  reason!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9._/-]{3,80}$/)
  ticketNumber!: string;
}

class TenantSubscriptionDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{1,39}$/)
  planCode?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  seatLimit?: number;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(1000000)
  monthlyOrderLimit?: number | null;

  @IsString()
  @Length(10, 1000)
  @Matches(/\S/)
  reason!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9._/-]{3,80}$/)
  ticketNumber!: string;
}

class TenantMemberRoleDto {
  @IsIn([MembershipRole.INSPECTOR, MembershipRole.ORG_ADMIN])
  role!: MembershipRole;

  @IsString()
  @Length(10, 1000)
  @Matches(/\S/)
  reason!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9._/-]{3,80}$/)
  ticketNumber!: string;
}

class TenantInvitationDto extends CreateInvitationDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  declare email?: string;
}

@Controller("tenants")
@UseGuards(AccessTokenGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @RequirePlatformRole(PlatformRole.OPERATOR, PlatformRole.SUPER_ADMIN)
  list(
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.tenants.listTenants(cursor, limit ? Number(limit) : 25);
  }

  @Get("overview")
  @RequirePlatformRole(PlatformRole.OPERATOR, PlatformRole.SUPER_ADMIN)
  getOverview() {
    return this.tenants.getPlatformOverview();
  }

  @Get("audit")
  @RequirePlatformRole(PlatformRole.OPERATOR, PlatformRole.SUPER_ADMIN)
  listPlatformAudit(
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.tenants.listPlatformAudit(cursor, limit ? Number(limit) : 25);
  }

  @Post()
  @RequirePlatformRole(PlatformRole.SUPER_ADMIN)
  create(@Body() body: CreateTenantDto, @CurrentActor() actor: AuthenticatedActor) {
    return this.tenants.createTenant(body, actor);
  }

  @Patch(":tenantId/status")
  @RequirePlatformRole(PlatformRole.SUPER_ADMIN)
  setStatus(
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Body() body: TenantStatusDto,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.tenants.changeStatus(tenantId, body.status, {
      reason: body.reason,
      ticketNumber: body.ticketNumber,
    }, actor);
  }

  @Patch(":tenantId/subscription")
  @RequirePlatformRole(PlatformRole.SUPER_ADMIN)
  updateSubscription(
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Body() body: TenantSubscriptionDto,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.tenants.updateSubscription(tenantId, body, actor);
  }

  @Patch(":tenantId/members/:membershipId/role")
  @RequirePlatformRole(PlatformRole.SUPER_ADMIN)
  changeMemberRole(
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Param("membershipId", ParseUUIDPipe) membershipId: string,
    @Body() body: TenantMemberRoleDto,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.tenants.changeMembershipRole(tenantId, membershipId, body, actor);
  }

  @Post(":tenantId/invitations")
  @RequireMembershipRole(MembershipRole.ORG_ADMIN)
  @RequirePlatformRole(PlatformRole.OPERATOR, PlatformRole.SUPER_ADMIN)
  invite(
    @Param("tenantId", ParseUUIDPipe) tenantId: string,
    @Body() body: TenantInvitationDto,
    @CurrentActor() actor: AuthenticatedActor,
  ) {
    return this.tenants.createInvitation(tenantId, body.email, body.role, actor);
  }
}
