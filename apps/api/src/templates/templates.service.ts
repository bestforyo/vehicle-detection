import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedActor } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import {
  inspectionTemplateSchema,
  InspectionTemplateSchema,
} from "./template-schema";
import { ConfiguredTemplateImportItemDto } from "./templates.dto";

type NewTemplate = {
  code: string;
  title: string;
  vehicleKind: string;
  usage: string;
  standardCode: string;
  standardVersion: string;
  schema: Record<string, unknown>;
};

function parseTemplateSchema(input: unknown): InspectionTemplateSchema {
  const parsed = inspectionTemplateSchema.safeParse(input);
  if (!parsed.success) {
    throw new UnprocessableEntityException({
      message: "检测模板结构不符合要求。",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

const configuredTemplateMetadata: Record<string, {
  usage: "NEW" | "USED";
  standardType: "国标" | "团标";
  itemCount: number;
}> = {
  "car-three": { usage: "USED", standardType: "国标", itemCount: 95 },
  "car-three-group": { usage: "USED", standardType: "团标", itemCount: 115 },
  "car-four": { usage: "USED", standardType: "国标", itemCount: 101 },
  "car-four-group": { usage: "USED", standardType: "团标", itemCount: 121 },
  "car-standard": { usage: "USED", standardType: "国标", itemCount: 160 },
  "car-group": { usage: "USED", standardType: "团标", itemCount: 180 },
  "car-new": { usage: "NEW", standardType: "国标", itemCount: 138 },
  "car-new-group": { usage: "NEW", standardType: "团标", itemCount: 158 },
};

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, vehicleKind?: string, usage?: string) {
    return this.prisma.inspectionTemplate.findMany({
      where: {
        tenantId,
        ...(vehicleKind ? { vehicleKind } : {}),
        ...(usage ? { usage } : {}),
        revisions: { some: { publishedAt: { not: null }, approvedAt: { not: null } } },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        title: true,
        vehicleKind: true,
        usage: true,
        standardType: true,
        revisions: {
          where: { publishedAt: { not: null }, approvedAt: { not: null } },
          orderBy: { revisionNumber: "desc" },
          take: 1,
          select: {
            id: true,
            revisionNumber: true,
            schema: true,
            approvalRef: true,
            approvedAt: true,
            publishedAt: true,
          },
        },
      },
    });
  }

  listForManagement(tenantId: string) {
    return this.prisma.inspectionTemplate.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        title: true,
        vehicleKind: true,
        usage: true,
        standardType: true,
        standardRevision: {
          select: {
            id: true,
            version: true,
            approvalRef: true,
            approvedAt: true,
            standard: { select: { code: true, title: true } },
          },
        },
        revisions: {
          orderBy: { revisionNumber: "desc" },
          take: 1,
          select: {
            id: true,
            revisionNumber: true,
            schema: true,
            standardRevisionId: true,
            approvalRef: true,
            approvedAt: true,
            publishedAt: true,
          },
        },
      },
    });
  }

  listApprovedStandardRevisions() {
    return this.prisma.standardRevision.findMany({
      where: { approvedAt: { not: null }, approvalRef: { not: null } },
      orderBy: [{ standard: { code: "asc" } }, { createdAt: "desc" }],
      select: {
        id: true,
        version: true,
        standard: { select: { code: true, title: true } },
      },
    });
  }

  async importConfiguredTemplates(
    tenantId: string,
    templates: ConfiguredTemplateImportItemDto[],
    actor: AuthenticatedActor,
  ) {
    const codes = templates.map((template) => template.code);
    if (new Set(codes).size !== Object.keys(configuredTemplateMetadata).length
      || Object.keys(configuredTemplateMetadata).some((code) => !codes.includes(code))) {
      throw new BadRequestException("必须一次导入完整且不重复的八种已配置检测模板。");
    }

    const normalized = templates.map((template) => {
      const metadata = configuredTemplateMetadata[template.code];
      if (!template.title.trim()) {
        throw new BadRequestException(`模板“${template.code}”必须填写名称。`);
      }
      if (template.vehicleKind !== "PASSENGER_CAR"
        || template.usage !== metadata.usage
        || template.standardType !== metadata.standardType) {
        throw new BadRequestException(`模板“${template.code}”的车辆类型或标准类别与原型配置不一致。`);
      }
      const schema = parseTemplateSchema(template.schema);
      const itemCount = schema.sections.reduce((total, section) => total + section.items.length, 0);
      if (itemCount !== metadata.itemCount) {
        throw new UnprocessableEntityException(`模板“${template.code}”应包含 ${metadata.itemCount} 个检测项，实际为 ${itemCount} 个。`);
      }
      return { ...template, schema };
    });

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.inspectionTemplate.findFirst({
        where: { tenantId, code: { in: codes } },
        select: { code: true },
      });
      if (existing) {
        throw new ConflictException(`模板“${existing.code}”已存在，未覆盖任何内容。`);
      }
      const result: Array<{
        id: string;
        code: string;
        title: string;
        revisionId: string;
        revisionNumber: number;
        itemCount: number;
        status: "DRAFT";
      }> = [];
      for (const template of normalized) {
        const created = await transaction.inspectionTemplate.create({
          data: {
            tenantId,
            code: template.code,
            title: template.title.trim(),
            vehicleKind: template.vehicleKind,
            usage: template.usage,
            standardType: template.standardType,
          },
        });
        const revision = await transaction.templateRevision.create({
          data: {
            tenantId,
            templateId: created.id,
            revisionNumber: 1,
            schema: template.schema as object,
          },
        });
        await this.audit.record({
          tenantId,
          actorId: actor.userId,
          action: "template.prototype_import",
          resourceType: "template_revision",
          resourceId: revision.id,
          metadata: {
            templateCode: created.code,
            revisionNumber: revision.revisionNumber,
            itemCount: configuredTemplateMetadata[template.code].itemCount,
            status: "DRAFT",
          },
        }, transaction);
        result.push({
          id: created.id,
          code: created.code,
          title: created.title,
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          itemCount: configuredTemplateMetadata[template.code].itemCount,
          status: "DRAFT",
        });
      }
      return result;
    });
  }

  async linkApprovedStandardRevision(
    tenantId: string,
    templateId: string,
    revisionId: string,
    standardRevisionId: string,
    actor: AuthenticatedActor,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const revision = await transaction.templateRevision.findFirst({
        where: { tenantId, templateId, id: revisionId, publishedAt: null },
        select: { id: true, revisionNumber: true, standardRevisionId: true },
      });
      if (!revision) {
        throw new NotFoundException("待关联的模板草稿不存在或已发布。");
      }
      const standardRevision = await transaction.standardRevision.findUnique({
        where: { id: standardRevisionId },
        select: {
          id: true,
          version: true,
          approvalRef: true,
          approvedAt: true,
          standard: { select: { code: true, title: true } },
        },
      });
      if (!standardRevision?.approvedAt || !standardRevision.approvalRef) {
        throw new BadRequestException("只能关联平台已审批且记录了审核依据的标准版本。");
      }
      const templateUpdated = await transaction.inspectionTemplate.updateMany({
        where: { tenantId, id: templateId },
        data: { standardRevisionId },
      });
      if (templateUpdated.count !== 1) {
        throw new NotFoundException("检测模板不存在。");
      }
      await transaction.templateRevision.update({
        where: { id: revision.id },
        data: { standardRevisionId },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "template.standard_revision.link",
        resourceType: "template_revision",
        resourceId: revision.id,
        metadata: {
          revisionNumber: revision.revisionNumber,
          standardCode: standardRevision.standard.code,
          standardVersion: standardRevision.version,
          standardRevisionId,
        },
      }, transaction);
      return {
        id: revision.id,
        standardRevisionId,
        standardCode: standardRevision.standard.code,
        standardTitle: standardRevision.standard.title,
        standardVersion: standardRevision.version,
      };
    });
  }

  async getPublishedRevision(tenantId: string, templateId: string, revisionId: string) {
    const revision = await this.prisma.templateRevision.findFirst({
      where: {
        tenantId,
        templateId,
        id: revisionId,
        approvedAt: { not: null },
        publishedAt: { not: null },
      },
      include: {
        template: {
          select: {
            id: true,
            code: true,
            title: true,
            vehicleKind: true,
            usage: true,
            standardType: true,
          },
        },
        standardRevision: {
          include: { standard: { select: { code: true, title: true } } },
        },
      },
    });
    if (!revision) {
      throw new NotFoundException("已发布的检测模板修订不存在。");
    }
    return revision;
  }

  async create(tenantId: string, input: NewTemplate, actor: AuthenticatedActor) {
    const schema = parseTemplateSchema(input.schema);
    const created = await this.prisma.$transaction(async (transaction) => {
      const standard = await transaction.standard.findUnique({
        where: { code: input.standardCode.trim() },
        select: { id: true },
      });
      if (!standard) {
        throw new BadRequestException("该标准尚未由平台录入并审批，不能创建正式检测模板。");
      }
      const standardRevision = await transaction.standardRevision.findUnique({
        where: {
          standardId_version: {
            standardId: standard.id,
            version: input.standardVersion.trim(),
          },
        },
        select: { id: true, approvedAt: true, approvalRef: true },
      });
      if (!standardRevision?.approvedAt || !standardRevision.approvalRef) {
        throw new BadRequestException("该标准版本尚未完成审核，不能发布检测模板。");
      }

      const template = await transaction.inspectionTemplate.create({
        data: {
          tenantId,
          code: input.code.trim(),
          title: input.title.trim(),
          vehicleKind: input.vehicleKind,
          usage: input.usage,
          standardType: input.standardCode.trim(),
          standardRevisionId: standardRevision.id,
        },
      });
      const revision = await transaction.templateRevision.create({
        data: {
          tenantId,
          templateId: template.id,
          revisionNumber: 1,
          schema: schema as object,
          standardRevisionId: standardRevision.id,
        },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "template.create",
        resourceType: "template_revision",
        resourceId: revision.id,
        metadata: { templateCode: template.code, standardRevisionId: standardRevision.id },
      }, transaction);
      return { template, revision };
    });

    return {
      id: created.template.id,
      code: created.template.code,
      title: created.template.title,
      revisionId: created.revision.id,
      revisionNumber: created.revision.revisionNumber,
      publishedAt: created.revision.publishedAt,
      status: "DRAFT",
    };
  }

  async createRevision(
    tenantId: string,
    templateId: string,
    schemaInput: Record<string, unknown>,
    actor: AuthenticatedActor,
  ) {
    const schema = parseTemplateSchema(schemaInput);
    return this.prisma.$transaction(async (transaction) => {
      const template = await transaction.inspectionTemplate.findFirst({
        where: { id: templateId, tenantId },
        include: { revisions: { select: { revisionNumber: true }, orderBy: { revisionNumber: "desc" }, take: 1 } },
      });
      if (!template) {
        throw new NotFoundException("检测模板不存在。");
      }
      const revisionNumber = (template.revisions[0]?.revisionNumber ?? 0) + 1;
      const revision = await transaction.templateRevision.create({
        data: {
          tenantId,
          templateId,
          revisionNumber,
          schema: schema as object,
          standardRevisionId: template.standardRevisionId,
        },
      });
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "template.revision.create",
        resourceType: "template_revision",
        resourceId: revision.id,
        metadata: { revisionNumber },
      }, transaction);
      return revision;
    });
  }

  async publishRevision(
    tenantId: string,
    templateId: string,
    revisionId: string,
    approvalRef: string,
    approvalNote: string,
    actor: AuthenticatedActor,
  ) {
    if (!approvalRef.trim() || !approvalNote.trim()) {
      throw new BadRequestException("发布前必须填写审核依据和审核说明。");
    }
    const publishedAt = new Date();
    return this.prisma.$transaction(async (transaction) => {
      const revision = await transaction.templateRevision.findFirst({
        where: { id: revisionId, tenantId, templateId, publishedAt: null },
        include: { standardRevision: { select: { approvedAt: true, approvalRef: true } } },
      });
      if (!revision) {
        throw new NotFoundException("待发布的模板修订不存在，或该版本已不可变。");
      }
      if (!revision.standardRevision?.approvedAt || !revision.standardRevision.approvalRef) {
        throw new BadRequestException("模板引用的标准版本未通过平台审批，不能发布。");
      }
      parseTemplateSchema(revision.schema);
      const result = await transaction.templateRevision.updateMany({
        where: { id: revision.id, tenantId, publishedAt: null },
        data: {
          approvalRef: approvalRef.trim(),
          approvedAt: publishedAt,
          publishedAt,
          publishedBy: actor.userId,
        },
      });
      if (result.count !== 1) {
        throw new BadRequestException("模板修订状态已改变，请刷新后重试。");
      }
      await this.audit.record({
        tenantId,
        actorId: actor.userId,
        action: "template.revision.publish",
        resourceType: "template_revision",
        resourceId: revision.id,
        metadata: { approvalRef: approvalRef.trim(), approvalNote: approvalNote.trim() },
      }, transaction);
      return { id: revision.id, publishedAt };
    });
  }
}
