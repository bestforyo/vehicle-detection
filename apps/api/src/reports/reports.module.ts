import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { MediaModule } from "../media/media.module";
import { PublicReportsController, ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [MediaModule],
  controllers: [ReportsController, PublicReportsController],
  providers: [ReportsService, AuditService],
  exports: [ReportsService],
})
export class ReportsModule {}
