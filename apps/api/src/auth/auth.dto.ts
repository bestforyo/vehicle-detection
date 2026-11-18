import { IsEmail, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength } from "class-validator";

export class WeChatSessionDto {
  @IsString()
  @Length(1, 128)
  code!: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class PasswordSessionDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class RefreshSessionDto {
  @IsString()
  @MinLength(32)
  @MaxLength(512)
  refreshToken!: string;
}

export class InvitationSessionDto {
  @IsString()
  @Length(1, 128)
  code!: string;

  @IsString()
  @Length(32, 128)
  invitationToken!: string;

  @IsString()
  @Length(1, 80)
  displayName!: string;
}

export class CreateInvitationDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsString()
  @Length(1, 32)
  role!: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;
}
