import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PlatformRole } from "@prisma/client";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RequirePlatformRole } from "../auth/access.decorator";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedActor } from "../auth/auth.types";
import {
  ApproveStandardRevisionDto,
  CreateStandardDto,
  CreateStandardRevisionDto,
} from "./standards.dto";
import { StandardsService } from "./standards.service";

@Controller("standards")
@UseGuards(AccessTokenGuard, RolesGuard)
@RequirePlatformRole(PlatformRole.SUPER_ADMIN)
export class StandardsController {
  constructor(private readonly standards: StandardsService) {}

  @Get()
  list() {
    return this.standards.list();
  }

  @Post()
  create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() body: CreateStandardDto,
  ) {
    return this.standards.create(body, actor);
  }

  @Post(":standardId/revisions")
  createRevision(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("standardId", ParseUUIDPipe) standardId: string,
    @Body() body: CreateStandardRevisionDto,
  ) {
    return this.standards.createRevision(standardId, body, actor);
  }

  @Post(":standardId/revisions/:revisionId/approve")
  approveRevision(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("standardId", ParseUUIDPipe) standardId: string,
    @Param("revisionId", ParseUUIDPipe) revisionId: string,
    @Body() body: ApproveStandardRevisionDto,
  ) {
    return this.standards.approveRevision(standardId, revisionId, body, actor);
  }
}
