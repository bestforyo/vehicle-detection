import { ForbiddenException, UnprocessableEntityException } from "@nestjs/common";
import { MembershipRole, PlatformRole } from "@prisma/client";
import { AuthenticatedActor } from "../auth/auth.types";
import { TenantsService } from "./tenants.service";

describe("TenantsService invitations", () => {
  const service = new TenantsService({} as never, {} as never);

  it("prevents inspectors from inviting other members", async () => {
    const inspector: AuthenticatedActor = {
      userId: "user-1",
      sessionId: "session-1",
      tenantId: "tenant-1",
      membershipId: "membership-1",
      role: MembershipRole.INSPECTOR,
      platformRole: PlatformRole.NONE,
    };

    await expect(
      service.createInvitation("tenant-1", undefined, MembershipRole.INSPECTOR, inspector),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("prevents organization admins from creating another organization admin", async () => {
    const admin: AuthenticatedActor = {
      userId: "user-1",
      sessionId: "session-1",
      tenantId: "tenant-1",
      membershipId: "membership-1",
      role: MembershipRole.ORG_ADMIN,
      platformRole: PlatformRole.NONE,
    };

    await expect(
      service.createInvitation("tenant-1", undefined, MembershipRole.ORG_ADMIN, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("fails closed when the target institution has no available seats", async () => {
    const admin: AuthenticatedActor = {
      userId: "user-1",
      sessionId: "session-1",
      tenantId: "tenant-1",
      membershipId: "membership-1",
      role: MembershipRole.ORG_ADMIN,
      platformRole: PlatformRole.NONE,
    };
    const transaction = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ seatLimit: 5, expiresAt: null }) },
      tenantMembership: { count: jest.fn().mockResolvedValue(5) },
      tenantInvitation: { count: jest.fn().mockResolvedValue(0) },
      $transaction: undefined,
    };
    const prisma = {
      tenant: { findFirst: jest.fn().mockResolvedValue({ id: "tenant-1" }) },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const serviceWithPrisma = new TenantsService(prisma as never, {} as never);

    await expect(
      serviceWithPrisma.createInvitation("tenant-1", undefined, MembershipRole.INSPECTOR, admin),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(transaction.tenantInvitation.count).toHaveBeenCalled();
  });
});
