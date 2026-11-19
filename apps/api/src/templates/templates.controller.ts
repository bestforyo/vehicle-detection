import {
  ForbiddenException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
import {
  CreateTemplateDto,
  CreateTemplateRevisionDto,
  ImportConfiguredTemplatesDto,
  LinkStandardRevisionDto,
  PublishTemplateRevisionDto,
} from "./templates.dto";
import { TemplatesService } from "./templates.service";

@Controller("templates")
@UseGuards(AccessTokenGuard, RolesGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(
    @CurrentActor() actor: AuthenticatedActor,
    @Query("vehicleKind") vehicleKind?: string,
    @Query("usage") usage?: string,
  ) {
    if (!actor.tenantId) {
      return [];
    }
    return this.templates.list(actor.tenantId, vehicleKind, usage);
  }

  @Get("management")
  @RequireMembershipRole(MembershipRole.ORG_ADMIN)
  management(@CurrentActor() actor: AuthenticatedActor) {
    return this.templates.listForManagement(this.requireTenant(actor));
  }

  @Get("approved-standard-revisions")
  @RequireMembershipRole(MembershipRole.ORG_ADMIN)
  approvedStandardRevisions(@CurrentActor() actor: AuthenticatedActor) {
    this.requireTenant(actor);
    return this.templates.listApprovedStandardRevisions();
  }

  @Post("import-configured")
  @RequireMembershipRole(MembershipRole.ORG_ADMIN)
  importConfigured(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() body: ImportConfiguredTemplatesDto,
  ) {
    return this.templates.importConfiguredTemplates(this.requireTenant(actor), body.templates, actor);
  }

  @Get(":templateId/revisions/:revisionId")
  getRevision(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("templateId", ParseUUIDPipe) templateId: string,
    @Param("revisionId", ParseUUIDPipe) revisionId: string,
  ) {
    if (!actor.tenantId) {
      throw new ForbiddenException("平台账号必须先选择机构工作空间。");
    }
    return this.templates.getPublishedRevision(actor.tenantId, templateId, revisionId);
  }

  @Post()
  @RequireMembershipRole(MembershipRole.ORG_ADMIN)
  create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() body: CreateTemplateDto,
  ) {
    return this.templates.create(this.requireTenant(actor), body, actor);
  }

  @Post(":templateId/revisions")
  @RequireMembershipRole(MembershipRole.ORG_ADMIN)
  createRevision(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("templateId", ParseUUIDPipe) templateId: string,
    @Body() body: CreateTemplateRevisionDto,
  ) {
    return this.templates.createRevision(this.requireTenant(actor), templateId, body.schema, actor);
  }

  @Post(":templateId/revisions/:revisionId/publish")
  @RequireMembershipRole(MembershipRole.ORG_ADMIN)
  publish(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("templateId", ParseUUIDPipe) templateId: string,
    @Param("revisionId", ParseUUIDPipe) revisionId: string,
    @Body() body: PublishTemplateRevisionDto,
  ) {
    return this.templates.publishRevision(
      this.requireTenant(actor),
      templateId,
      revisionId,
      body.approvalRef,
      body.approvalNote,
      actor,
    );
  }

  @Post(":templateId/revisions/:revisionId/standard")
  @RequireMembershipRole(MembershipRole.ORG_ADMIN)
  linkStandard(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("templateId", ParseUUIDPipe) templateId: string,
    @Param("revisionId", ParseUUIDPipe) revisionId: string,
    @Body() body: LinkStandardRevisionDto,
  ) {
    return this.templates.linkApprovedStandardRevision(
      this.requireTenant(actor),
      templateId,
      revisionId,
      body.standardRevisionId,
      actor,
    );
  }

  private requireTenant(actor: AuthenticatedActor): string {
    if (!actor.tenantId || !actor.membershipId) {
      throw new ForbiddenException("请先选择有效的机构工作空间。");
    }
    return actor.tenantId;
  }
}
