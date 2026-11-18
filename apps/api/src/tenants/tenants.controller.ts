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
import { IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from "class-validator";
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
    return this.tenants.changeStatus(tenantId, body.status, actor);
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
