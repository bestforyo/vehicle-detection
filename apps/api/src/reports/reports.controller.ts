import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { MembershipRole } from "@prisma/client";
import { Throttle } from "@nestjs/throttler";
import { IsString, Matches } from "class-validator";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RequireMembershipRole } from "../auth/access.decorator";
import { CurrentActor } from "../auth/current-actor.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedActor } from "../auth/auth.types";
import { ReportsService } from "./reports.service";
import { CreateReportShareDto } from "./reports.dto";

class PublicTokenParam {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;
}

@Controller("reports")
@UseGuards(AccessTokenGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("orders/:orderId")
  listForOrder(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("orderId", ParseUUIDPipe) orderId: string,
  ) {
    return this.reports.listForOrder(actor, orderId);
  }

  @Get(":reportId")
  get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("reportId", ParseUUIDPipe) reportId: string,
  ) {
    return this.reports.getPrivateReport(actor, reportId);
  }

  @Post(":reportId/shares")
  createShare(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @Body() body: CreateReportShareDto,
  ) {
    return this.reports.createShare(actor, reportId, body);
  }

  @Get(":reportId/shares")
  @RequireMembershipRole(MembershipRole.ORG_ADMIN)
  listShares(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("reportId", ParseUUIDPipe) reportId: string,
  ) {
    return this.reports.listShares(actor, reportId);
  }

  @Post(":reportId/shares/:shareId/revoke")
  @RequireMembershipRole(MembershipRole.ORG_ADMIN)
  revokeShare(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("reportId", ParseUUIDPipe) reportId: string,
    @Param("shareId", ParseUUIDPipe) shareId: string,
  ) {
    return this.reports.revokeShare(actor, reportId, shareId);
  }
}

@Controller("public/reports")
export class PublicReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(":token")
  @Header("Cache-Control", "private, no-store")
  @Header("Referrer-Policy", "no-referrer")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async get(@Param() params: PublicTokenParam) {
    return this.reports.getPublicReport(params.token);
  }

  @Get(":token/assets/:assetId/preview-url")
  @Header("Cache-Control", "private, no-store")
  @Header("Referrer-Policy", "no-referrer")
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async preview(
    @Param() params: PublicTokenParam,
    @Param("assetId", ParseUUIDPipe) assetId: string,
  ) {
    return this.reports.getPublicAssetPreviewUrl(params.token, assetId);
  }
}
