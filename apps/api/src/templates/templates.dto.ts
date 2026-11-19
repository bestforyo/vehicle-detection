import { IsIn, IsObject, IsString, Length, Matches, MaxLength } from "class-validator";

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
