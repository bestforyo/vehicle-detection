import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsObject,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";

export class CreateTemplateDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/)
  code!: string;

  @IsString()
  @Length(1, 120)
  title!: string;

  @IsIn(["PASSENGER_CAR", "MOTORCYCLE"])
  vehicleKind!: string;

  @IsIn(["NEW", "USED"])
  usage!: string;

  @IsString()
  @Length(1, 40)
  standardCode!: string;

  @IsString()
  @Length(1, 40)
  standardVersion!: string;

  @IsObject()
  schema!: Record<string, unknown>;
}

export class CreateTemplateRevisionDto {
  @IsObject()
  schema!: Record<string, unknown>;
}

export class PublishTemplateRevisionDto {
  @IsString()
  @Length(1, 200)
  approvalRef!: string;

  @IsString()
  @MaxLength(2000)
  approvalNote!: string;
}

export class ConfiguredTemplateImportItemDto {
  @IsString()
  @IsIn(["car-three", "car-three-group", "car-four", "car-four-group", "car-standard", "car-group", "car-new", "car-new-group"])
  code!: string;

  @IsString()
  @Length(1, 120)
  title!: string;

  @IsIn(["PASSENGER_CAR"])
  vehicleKind!: string;

  @IsIn(["NEW", "USED"])
  usage!: string;

  @IsIn(["国标", "团标"])
  standardType!: string;

  @IsObject()
  schema!: Record<string, unknown>;
}

export class ImportConfiguredTemplatesDto {
  @IsArray()
  @ArrayMinSize(8)
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => ConfiguredTemplateImportItemDto)
  templates!: ConfiguredTemplateImportItemDto[];
}

export class LinkStandardRevisionDto {
  @IsUUID()
  standardRevisionId!: string;
}
