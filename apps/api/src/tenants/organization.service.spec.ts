import { ConflictException, ForbiddenException } from "@nestjs/common";
import { MembershipRole, PlatformRole, UserStatus } from "@prisma/client";
import { AuthenticatedActor } from "../auth/auth.types";
import { OrganizationService } from "./organization.service";

describe("OrganizationService member access", () => {
  const admin: AuthenticatedActor = {
    userId: "admin-user",
    sessionId: "admin-session",
    tenantId: "tenant-1",
    membershipId: "admin-membership",
    role: MembershipRole.ORG_ADMIN,
    platformRole: PlatformRole.NONE,
  };

  it("prevents inspectors from managing organization members", async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new OrganizationService(prisma as never, {} as never);
    const inspector = { ...admin, role: MembershipRole.INSPECTOR };

    await expect(service.listMembers(inspector)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not allow the last active organization admin to be disabled", async () => {
    const transaction = {
      tenantMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: "membership-2",
          role: MembershipRole.ORG_ADMIN,
          status: UserStatus.ACTIVE,
          userId: "other-user",
        }),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const service = new OrganizationService(prisma as never, {} as never);

    await expect(
      service.updateMemberStatus(admin, "membership-2", UserStatus.DISABLED),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.tenantMembership.update).not.toHaveBeenCalled();
  });

  it("does not allow an administrator to disable their own access", async () => {
    const transaction = {
      tenantMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: admin.membershipId,
          role: MembershipRole.ORG_ADMIN,
          status: UserStatus.ACTIVE,
          userId: admin.userId,
        }),
        count: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const service = new OrganizationService(prisma as never, {} as never);

    await expect(
      service.updateMemberStatus(admin, admin.membershipId!, UserStatus.DISABLED),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.tenantMembership.update).not.toHaveBeenCalled();
  });

  it("preserves unrelated organization settings when updating the profile", async () => {
    const updatedSettings = {
      displayName: "New name",
      customBranding: { color: "blue" },
    };
    const transaction = {
      tenant: {
        update: jest.fn().mockResolvedValue({
          id: "tenant-1",
          code: "ORG-1",
          name: "Organization",
          settings: updatedSettings,
        }),
      },
    };
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          name: "Organization",
          settings: {
            displayName: "Old name",
            customBranding: { color: "blue" },
          },
        }),
      },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const service = new OrganizationService(prisma as never, { record: jest.fn() } as never);

    await service.updateProfile(admin, { displayName: "New name" });

    expect(transaction.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ settings: updatedSettings }),
    }));
  });
});
