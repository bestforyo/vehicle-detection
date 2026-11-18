import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class CreateUploadIntentDto {
  @IsUUID()
  orderId!: string;

  @IsUUID()
  revisionId!: string;

  @IsString()
  @Length(1, 100)
  itemKey!: string;

  @IsString()
  @MaxLength(160)
  fileName!: string;

  @IsIn(["image/jpeg", "image/png", "image/webp"])
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  sizeBytes!: number;
}

export class CompleteUploadDto {
  @IsUUID()
  assetId!: string;
}
