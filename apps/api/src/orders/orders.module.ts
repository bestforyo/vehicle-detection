import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { FieldCryptoService } from "../crypto/field-crypto.service";
import { OrdersController } from "./orders.controller";
import { OrdersService } from "./orders.service";

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, FieldCryptoService, AuditService],
  exports: [OrdersService],
})
export class OrdersModule {}
