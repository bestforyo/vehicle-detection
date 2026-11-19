import { BadRequestException, UnprocessableEntityException } from "@nestjs/common";
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

describe("TemplatesService configured prototype import", () => {
  const configuredTemplates = [
    { code: "car-three", usage: "USED", standardType: "国标", itemCount: 95 },
    { code: "car-three-group", usage: "USED", standardType: "团标", itemCount: 115 },
    { code: "car-four", usage: "USED", standardType: "国标", itemCount: 101 },
    { code: "car-four-group", usage: "USED", standardType: "团标", itemCount: 121 },
    { code: "car-standard", usage: "USED", standardType: "国标", itemCount: 160 },
    { code: "car-group", usage: "USED", standardType: "团标", itemCount: 180 },
    { code: "car-new", usage: "NEW", standardType: "国标", itemCount: 138 },
    { code: "car-new-group", usage: "NEW", standardType: "团标", itemCount: 158 },
  ];

  it("imports all eight exact-size schemas as audited drafts without an approved standard binding", async () => {
    let templateId = 0;
    let revisionId = 0;
    const transaction = {
      inspectionTemplate: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }) => Promise.resolve({ id: `template-${++templateId}`, ...data })),
      },
      templateRevision: {
        create: jest.fn(({ data }) => Promise.resolve({ id: `revision-${++revisionId}`, ...data })),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new TemplatesService(prisma as never, audit as never);
    const imported = configuredTemplates.map(({ code, usage, standardType, itemCount }) => ({
      code,
      title: code,
      vehicleKind: "PASSENGER_CAR",
      usage,
      standardType,
      schema: {
        version: 1,
        sections: [{
          key: "all-items",
          title: "全部项目",
          items: Array.from({ length: itemCount }, (_, index) => ({
            key: `item-${index}`,
            title: `检测项目${index}`,
          })),
        }],
      },
    }));

    const result = await service.importConfiguredTemplates("tenant-1", imported, {
      userId: "admin",
      sessionId: "session",
      tenantId: "tenant-1",
      membershipId: "membership",
      role: MembershipRole.ORG_ADMIN,
      platformRole: PlatformRole.NONE,
    });

    expect(result).toHaveLength(8);
    expect(result.every((item) => item.status === "DRAFT")).toBe(true);
    expect(transaction.templateRevision.create).toHaveBeenCalledTimes(8);
    expect(transaction.templateRevision.create.mock.calls.every(([call]) => call.data.standardRevisionId === undefined)).toBe(true);
    expect(audit.record).toHaveBeenCalledTimes(8);
  });

  it("rejects incomplete imports before writing any templates", async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new TemplatesService(prisma as never, {} as never);

    await expect(service.importConfiguredTemplates("tenant-1", [], {
      userId: "admin",
      sessionId: "session",
      tenantId: "tenant-1",
      membershipId: "membership",
      role: MembershipRole.ORG_ADMIN,
      platformRole: PlatformRole.NONE,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a checklist whose item count differs from the configured source", async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new TemplatesService(prisma as never, {} as never);
    const imported = configuredTemplates.map(({ code, usage, standardType, itemCount }) => ({
      code,
      title: code,
      vehicleKind: "PASSENGER_CAR",
      usage,
      standardType,
      schema: {
        version: 1,
        sections: [{
          key: "all-items",
          title: "全部项目",
          items: Array.from({ length: itemCount - (code === "car-three" ? 1 : 0) }, (_, index) => ({
            key: `item-${index}`,
            title: `检测项目${index}`,
          })),
        }],
      },
    }));

    await expect(service.importConfiguredTemplates("tenant-1", imported, {
      userId: "admin",
      sessionId: "session",
      tenantId: "tenant-1",
      membershipId: "membership",
      role: MembershipRole.ORG_ADMIN,
      platformRole: PlatformRole.NONE,
    })).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
