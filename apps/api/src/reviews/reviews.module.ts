import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { AuditService } from "../audit/audit.service";
import { FieldCryptoService } from "../crypto/field-crypto.service";
import { RolesGuard } from "../auth/roles.guard";
import { ReviewsController } from "./reviews.controller";
import { ReviewsService } from "./reviews.service";

@Module({
  imports: [AuthModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, FieldCryptoService, AuditService, AccessTokenGuard, RolesGuard],
})
export class ReviewsModule {}
