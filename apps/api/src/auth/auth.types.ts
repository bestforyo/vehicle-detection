import { MembershipRole, PlatformRole } from "@prisma/client";

export type AuthenticatedActor = {
  userId: string;
  sessionId: string;
  tenantId: string | null;
  membershipId: string | null;
  role: MembershipRole | null;
  platformRole: PlatformRole;
};

export type AccessTokenClaims = {
  sub: string;
  sid: string;
  tenantId: string | null;
  membershipId: string | null;
};
