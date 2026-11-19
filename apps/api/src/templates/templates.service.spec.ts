import { BadRequestException } from "@nestjs/common";
import { MembershipRole, PlatformRole } from "@prisma/client";
import { TemplatesService } from "./templates.service";

describe("TemplatesService standard approval gate", () => {
  const validSchema = {
    version: 1,
    sections: [{ key: "body", title: "车身", items: [{ key: "door", title: "车门" }] }],
  };

  it("does not create standards or templates from a client-supplied approval reference", async () => {
    const transaction = {
      standard: { findUnique: jest.fn().mockResolvedValue(null) },
      standardRevision: { findUnique: jest.fn() },
      inspectionTemplate: { create: jest.fn() },
      templateRevision: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const service = new TemplatesService(prisma as never, {} as never);

    await expect(service.create("tenant-1", {
      code: "passenger-used",
      title: "乘用车二手车",
      vehicleKind: "PASSENGER_CAR",
      usage: "USED",
      standardCode: "LOCAL-STANDARD",
      standardVersion: "1.0",
      schema: validSchema,
    }, {
      userId: "admin",
      sessionId: "session",
      tenantId: "tenant-1",
      membershipId: "membership",
      role: MembershipRole.ORG_ADMIN,
      platformRole: PlatformRole.NONE,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(transaction.standardRevision.findUnique).not.toHaveBeenCalled();
    expect(transaction.inspectionTemplate.create).not.toHaveBeenCalled();
  });
});
