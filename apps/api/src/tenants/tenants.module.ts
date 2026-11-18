import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  controllers: [TenantsController],
  providers: [TenantsService, AuditService],
})
export class TenantsModule {}
