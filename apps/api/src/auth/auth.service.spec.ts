import { MembershipRole, PlatformRole, TenantStatus } from "@prisma/client";
import { AuthService } from "./auth.service";

describe("AuthService workspace selection", () => {
  const tenant = { id: "tenant-1", name: "机构", code: "org-1", status: TenantStatus.ACTIVE };
  const membership = {
    id: "membership-1",
    role: MembershipRole.INSPECTOR,
    tenant,
  };
  const user = {
    id: "user-1",
    memberships: [membership],
  };

  it("requires an explicit workspace when a user belongs to multiple tenants", async () => {
    const prisma = {
      session: { create: jest.fn() },
    };
    const service = new AuthService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await Reflect.get(service, "selectWorkspace")({
      ...user,
      memberships: [membership, { ...membership, id: "membership-2", tenant: { ...tenant, id: "tenant-2" } }],
    });

    expect(result).toEqual({
      workspaces: [
        { id: tenant.id, name: tenant.name, code: tenant.code, role: membership.role },
        { id: "tenant-2", name: tenant.name, code: tenant.code, role: membership.role },
      ],
      requiresWorkspaceSelection: true,
    });
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it("rejects a workspace that is not associated with the account", async () => {
    const service = new AuthService(
      { session: { create: jest.fn() } } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      Reflect.get(service, "selectWorkspace")(user, "other-tenant"),
    ).rejects.toThrow("当前账号未加入所选机构。");
  });

  it("returns the current tenant workspace and membership for client authorization", async () => {
    const currentUser = {
      id: user.id,
      displayName: "检测师",
      email: null,
      platformRole: "NONE",
      memberships: [membership],
    };
    const service = new AuthService(
      { user: { findUniqueOrThrow: jest.fn().mockResolvedValue(currentUser) } } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.currentUser({
      userId: user.id,
      sessionId: "session-1",
      tenantId: tenant.id,
      membershipId: membership.id,
      role: membership.role,
      platformRole: PlatformRole.NONE,
    })).resolves.toMatchObject({
      activeWorkspace: {
        tenantId: tenant.id,
        membershipId: membership.id,
        role: membership.role,
      },
    });
  });

  it("reports a null active workspace for platform sessions", async () => {
    const service = new AuthService(
      {
        user: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: "platform-user",
            displayName: "平台运营",
            email: "ops@example.test",
            platformRole: "OPERATOR",
            memberships: [],
          }),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.currentUser({
      userId: "platform-user",
      sessionId: "session-2",
      tenantId: null,
      membershipId: null,
      role: null,
      platformRole: PlatformRole.OPERATOR,
    })).resolves.toMatchObject({ activeWorkspace: null });
  });
});
