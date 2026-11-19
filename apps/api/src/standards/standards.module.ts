import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { AuditService } from "../audit/audit.service";
import { RolesGuard } from "../auth/roles.guard";
import { StandardsController } from "./standards.controller";
import { StandardsService } from "./standards.service";

@Module({
  imports: [AuthModule],
  controllers: [StandardsController],
  providers: [StandardsService, AuditService, AccessTokenGuard, RolesGuard],
})
export class StandardsModule {}
