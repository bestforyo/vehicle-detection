import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { TemplatesController } from "./templates.controller";
import { TemplatesService } from "./templates.service";

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService, AuditService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
