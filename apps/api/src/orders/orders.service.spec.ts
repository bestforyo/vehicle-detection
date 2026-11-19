import { UnprocessableEntityException } from "@nestjs/common";
import { MembershipRole, PlatformRole } from "@prisma/client";
import { AuthenticatedActor } from "../auth/auth.types";
import { OrdersService } from "./orders.service";

describe("OrdersService tenant quota", () => {
  it("blocks order creation when the tenant has exhausted its monthly quota", async () => {
    const transaction = {
      tenant: { findFirst: jest.fn().mockResolvedValue({ monthlyOrderLimit: 10 }) },
      inspectionOrder: { count: jest.fn().mockResolvedValue(10) },
      templateRevision: { findFirst: jest.fn() },
    };
    const prisma = {
      idempotencyKey: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const service = new OrdersService(prisma as never, {} as never, {} as never);
    const actor: AuthenticatedActor = {
      userId: "inspector-user",
      sessionId: "inspector-session",
      tenantId: "tenant-1",
      membershipId: "membership-1",
      role: MembershipRole.INSPECTOR,
      platformRole: PlatformRole.NONE,
    };

    await expect(service.create(actor, "order-idempotency-key-001", {
      templateRevisionId: "revision-1",
      vehicleKind: "PASSENGER_CAR",
    })).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(transaction.templateRevision.findFirst).not.toHaveBeenCalled();
  });
});
