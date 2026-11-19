import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedActor } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { ApproveStandardRevisionDto, CreateStandardDto, CreateStandardRevisionDto } from "./standards.dto";

@Injectable()
export class StandardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.standard.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        title: true,
        owner: true,
        licenseRef: true,
        revisions: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            version: true,
            sourceFileName: true,
            sourceHash: true,
            effectiveAt: true,
            scope: true,
            approvalRef: true,
            approvedBy: true,
            approvedAt: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async create(input: CreateStandardDto, actor: AuthenticatedActor) {
    const standard = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.standard.create({
        data: {
          code: input.code.trim(),
          title: input.title.trim(),
          owner: input.owner?.trim() || null,
          licenseRef: input.licenseRef.trim(),
        },
      });
      await this.audit.record({
        actorId: actor.userId,
        action: "standard.create",
        resourceType: "standard",
        resourceId: created.id,
        metadata: { code: created.code },
      }, transaction);
      return created;
    });
    return standard;
  }

  async createRevision(
    standardId: string,
    input: CreateStandardRevisionDto,
    actor: AuthenticatedActor,
  ) {
    const standard = await this.prisma.standard.findUnique({
      where: { id: standardId },
      select: { id: true, code: true, licenseRef: true },
    });
    if (!standard) {
      throw new NotFoundException("标准不存在。");
    }
    if (!standard.licenseRef?.trim()) {
      throw new UnprocessableEntityException("标准来源及使用授权未记录，不能创建可审核版本。");
    }
    return this.prisma.$transaction(async (transaction) => {
      const revision = await transaction.standardRevision.create({
        data: {
          standardId,
          version: input.version.trim(),
          sourceFileName: input.sourceFileName.trim(),
          sourceHash: input.sourceHash.toLowerCase(),
          effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
          scope: input.scope.trim(),
        },
      });
      await this.audit.record({
        actorId: actor.userId,
        action: "standard.revision.create",
        resourceType: "standard_revision",
        resourceId: revision.id,
        metadata: {
          standardCode: standard.code,
          version: revision.version,
          sourceFileName: revision.sourceFileName,
          sourceHash: revision.sourceHash,
        },
      }, transaction);
      return revision;
    });
  }

  async approveRevision(
    standardId: string,
    revisionId: string,
    input: ApproveStandardRevisionDto,
    actor: AuthenticatedActor,
  ) {
    const revision = await this.prisma.standardRevision.findFirst({
      where: { id: revisionId, standardId },
      include: { standard: { select: { code: true, licenseRef: true } } },
    });
    if (!revision) {
      throw new NotFoundException("标准修订不存在。");
    }
    if (!revision.standard.licenseRef?.trim() || !revision.sourceFileName || !revision.sourceHash) {
      throw new UnprocessableEntityException("标准来源文件、文件校验值和使用授权必须齐全后才能审批。");
    }
    if (revision.approvedAt) {
      throw new ConflictException("标准修订已审批且不可变，请创建新版本。");
    }
    const approvedAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.standardRevision.updateMany({
        where: { id: revisionId, standardId, approvedAt: null },
        data: {
          approvalRef: input.approvalRef.trim(),
          approvedBy: actor.userId,
          approvedAt,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException("标准修订状态已改变，请刷新后重试。");
      }
      await this.audit.record({
        actorId: actor.userId,
        action: "standard.revision.approve",
        resourceType: "standard_revision",
        resourceId: revisionId,
        metadata: {
          standardCode: revision.standard.code,
          version: revision.version,
          approvalRef: input.approvalRef.trim(),
          approvalNote: input.approvalNote.trim(),
          sourceHash: revision.sourceHash,
        },
      }, transaction);
      return { id: revisionId, approvedAt, approvedBy: actor.userId };
    });
  }
}
