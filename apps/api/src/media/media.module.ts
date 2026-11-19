import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";

@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [MediaService, AccessTokenGuard],
  exports: [MediaService],
})
export class MediaModule {}
