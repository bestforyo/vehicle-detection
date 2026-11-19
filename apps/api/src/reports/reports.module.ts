import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { AuditService } from "../audit/audit.service";
import { MediaModule } from "../media/media.module";
import { RolesGuard } from "../auth/roles.guard";
import { PublicReportsController, ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [ReportsController, PublicReportsController],
  providers: [ReportsService, AuditService, AccessTokenGuard, RolesGuard],
  exports: [ReportsService],
})
export class ReportsModule {}
