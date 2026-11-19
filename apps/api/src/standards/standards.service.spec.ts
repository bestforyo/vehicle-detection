import { UnprocessableEntityException } from "@nestjs/common";
import { PlatformRole } from "@prisma/client";
import { AuthenticatedActor } from "../auth/auth.types";
import { StandardsService } from "./standards.service";

describe("StandardsService source approval", () => {
  const actor: AuthenticatedActor = {
    userId: "platform-admin",
    sessionId: "platform-session",
    tenantId: null,
    membershipId: null,
    role: null,
    platformRole: PlatformRole.SUPER_ADMIN,
  };

  it("refuses to create a revision without recorded source authorization", async () => {
    const prisma = {
      standard: { findUnique: jest.fn().mockResolvedValue({ id: "standard-1", code: "STD-1", licenseRef: null }) },
      $transaction: jest.fn(),
    };
    const service = new StandardsService(prisma as never, {} as never);

    await expect(service.createRevision("standard-1", {
      version: "2026",
      sourceFileName: "approved-standard.pdf",
      sourceHash: "a".repeat(64),
      scope: "Used passenger vehicles",
    }, actor)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not approve a revision until source metadata and authorization exist", async () => {
    const prisma = {
      standardRevision: {
        findFirst: jest.fn().mockResolvedValue({
          id: "revision-1",
          version: "2026",
          sourceFileName: null,
          sourceHash: null,
          approvedAt: null,
          standard: { code: "STD-1", licenseRef: "license record" },
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new StandardsService(prisma as never, {} as never);

    await expect(service.approveRevision("standard-1", "revision-1", {
      approvalRef: "review-ticket-001",
      approvalNote: "Reviewed by qualified staff against the source document.",
    }, actor)).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
