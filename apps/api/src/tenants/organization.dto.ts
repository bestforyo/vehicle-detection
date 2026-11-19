import { Type } from "class-transformer";
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Matches,
  Min,
} from "class-validator";
import { UserStatus } from "@prisma/client";

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  @Matches(/\S/)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  @Matches(/\S/)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reportDisclaimer?: string;
}

export class OrganizationInvitationDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class UpdateMembershipStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}

export class ListOrganizationAuditQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
