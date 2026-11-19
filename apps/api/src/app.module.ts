import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { validateEnvironment } from "./config/environment";
import { AuthModule } from "./auth/auth.module";
import { HealthController } from "./health/health.controller";
import { TenantsModule } from "./tenants/tenants.module";
import { TemplatesModule } from "./templates/templates.module";
import { OrdersModule } from "./orders/orders.module";
import { MediaModule } from "./media/media.module";
import { ReviewsModule } from "./reviews/reviews.module";
import { ReportsModule } from "./reports/reports.module";
import { StandardsModule } from "./standards/standards.module";
import { DatabaseModule } from "./database/database.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/api/.env", ".env"],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    AuthModule,
    TenantsModule,
    TemplatesModule,
    OrdersModule,
    MediaModule,
    ReviewsModule,
    ReportsModule,
    StandardsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
