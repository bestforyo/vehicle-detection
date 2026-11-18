import { SetMetadata } from "@nestjs/common";
import { MembershipRole, PlatformRole } from "@prisma/client";

export const REQUIRED_MEMBERSHIP_ROLES = "requiredMembershipRoles";
export const REQUIRED_PLATFORM_ROLES = "requiredPlatformRoles";

export const RequireMembershipRole = (...roles: MembershipRole[]) =>
  SetMetadata(REQUIRED_MEMBERSHIP_ROLES, roles);

export const RequirePlatformRole = (...roles: PlatformRole[]) =>
  SetMetadata(REQUIRED_PLATFORM_ROLES, roles);
