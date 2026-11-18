import { IsArray, IsOptional, IsString, IsUUID, Length, MaxLength, ArrayMaxSize } from "class-validator";

export class ReviewDecisionDto {
  @IsUUID()
  revisionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  professionalConclusion?: string;
}

export class ReturnInspectionDto {
  @IsUUID()
  revisionId!: string;

  @IsString()
  @Length(1, 2000)
  comment!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  targetItemKeys?: string[];
}
