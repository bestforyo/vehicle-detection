import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { RolesGuard } from "../auth/roles.guard";
import { AuditService } from "../audit/audit.service";
import { TenantsController } from "./tenants.controller";
import { OrganizationController } from "./organization.controller";
import { OrganizationService } from "./organization.service";
import { TenantsService } from "./tenants.service";

@Module({
  imports: [AuthModule],
  controllers: [TenantsController, OrganizationController],
  providers: [TenantsService, OrganizationService, AuditService, AccessTokenGuard, RolesGuard],
})
export class TenantsModule {}
