import {
  IsDateString,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateStandardDto {
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9._-]{1,39}$/)
  code!: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  owner?: string;

  @IsString()
  @Length(1, 300)
  licenseRef!: string;
}

export class CreateStandardRevisionDto {
  @IsString()
  @Length(1, 80)
  version!: string;

  @IsString()
  @Length(1, 255)
  sourceFileName!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  sourceHash!: string;

  @IsOptional()
  @IsDateString()
  effectiveAt?: string;

  @IsString()
  @Length(1, 2000)
  scope!: string;
}

export class ApproveStandardRevisionDto {
  @IsString()
  @Length(3, 200)
  approvalRef!: string;

  @IsString()
  @Length(10, 2000)
  approvalNote!: string;
}
