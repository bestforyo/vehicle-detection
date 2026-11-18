import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  IsIn,
  Matches,
  ValidateNested,
} from "class-validator";
import { OrderStatus } from "@prisma/client";

export class CreateOrderDto {
  @IsUUID()
  templateRevisionId!: string;

  @IsIn(["PASSENGER_CAR", "MOTORCYCLE"])
  vehicleKind!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1886)
  @Max(2200)
  year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  plate?: string;

  @IsOptional()
  @IsString()
  @Length(17, 17)
  @Matches(/^[A-HJ-NPR-Z0-9]{17}$/i)
  vin?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  mileage?: number;

  @IsOptional()
  @IsDateString()
  firstRegisteredAt?: string;

  @IsOptional()
  @IsUUID()
  assignedInspectorId?: string;
}

export class SaveInspectionAnswerDto {
  @IsString()
  @Length(1, 100)
  itemKey!: string;

  @IsString()
  @MaxLength(500)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  thresholdFinding?: string;

  @IsArray()
  @IsUUID("all", { each: true })
  @ArrayMaxSize(10)
  evidenceAssetIds!: string[];
}

export class SaveDraftDto {
  @IsUUID()
  revisionId!: string;

  @IsDateString()
  revisionUpdatedAt!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveInspectionAnswerDto)
  @ArrayMaxSize(500)
  answers!: SaveInspectionAnswerDto[];
}

export class SubmitInspectionDto {
  @IsUUID()
  revisionId!: string;
}

export class ListOrdersQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @IsOptional()
  @IsUUID()
  inspectorId?: string;
}
