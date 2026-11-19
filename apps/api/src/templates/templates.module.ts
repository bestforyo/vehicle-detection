import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { AuditService } from "../audit/audit.service";
import { RolesGuard } from "../auth/roles.guard";
import { TemplatesController } from "./templates.controller";
import { TemplatesService } from "./templates.service";

@Module({
  imports: [AuthModule],
  controllers: [TemplatesController],
  providers: [TemplatesService, AuditService, AccessTokenGuard, RolesGuard],
  exports: [TemplatesService],
})
export class TemplatesModule {}
