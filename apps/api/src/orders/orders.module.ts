import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { AuditService } from "../audit/audit.service";
import { FieldCryptoService } from "../crypto/field-crypto.service";
import { RolesGuard } from "../auth/roles.guard";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  imports: [AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService, FieldCryptoService, AuditService, AccessTokenGuard, RolesGuard],
  exports: [OrdersService],
})
export class OrdersModule {}
