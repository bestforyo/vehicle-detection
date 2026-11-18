import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AccessTokenGuard } from "../auth/access-token.guard";
import { CurrentActor } from "../auth/current-actor.decorator";
import { AuthenticatedActor } from "../auth/auth.types";
import { CompleteUploadDto, CreateUploadIntentDto } from "./media.dto";
import { MediaService } from "./media.service";

@Controller("media")
@UseGuards(AccessTokenGuard)
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post("upload-intents")
  createUploadIntent(
    @CurrentActor() actor: AuthenticatedActor,
    @Body() body: CreateUploadIntentDto,
  ) {
    return this.media.createUploadIntent(actor, body);
  }

  @Post(":assetId/complete")
  complete(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", ParseUUIDPipe) assetId: string,
    @Body() body: CompleteUploadDto,
  ) {
    if (body.assetId !== assetId) {
      throw new BadRequestException("照片编号不匹配。");
    }
    return this.media.completeUpload(actor, assetId);
  }

  @Post(":assetId/preview-url")
  previewUrl(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("assetId", ParseUUIDPipe) assetId: string,
  ) {
    return this.media.createPreviewUrl(actor, assetId);
  }
}
