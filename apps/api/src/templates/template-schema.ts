import { z } from "zod";

const itemSchema = z.object({
  key: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/),
  title: z.string().trim().min(1).max(200),
  guidance: z.string().max(2000).optional(),
  options: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  decisionType: z.enum(["关键决定项", "非关键决定项"]).optional(),
  required: z.boolean().default(true),
  evidenceRequiredWhen: z.array(z.string().max(80)).max(100).default([]),
  noteRequiredWhen: z.array(z.string().max(80)).max(100).default([]),
  thresholdRequiredWhen: z.array(z.string().max(80)).max(100).default([]),
});

const sectionSchema = z.object({
  key: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/),
  title: z.string().trim().min(1).max(120),
  guidance: z.string().max(2000).optional(),
  items: z.array(itemSchema).min(1).max(500),
});

export const inspectionTemplateSchema = z.object({
  version: z.literal(1),
  sections: z.array(sectionSchema).min(1).max(100),
}).superRefine((schema, context) => {
  const sectionKeys = new Set<string>();
  const itemKeys = new Set<string>();
  const totalItemCount = schema.sections.reduce((total, section) => total + section.items.length, 0);
  if (totalItemCount > 500) {
    context.addIssue({
      code: "custom",
      path: ["sections"],
      message: "单个检测模板的检测项总数不能超过 500 项。",
    });
  }

  schema.sections.forEach((section, sectionIndex) => {
    if (sectionKeys.has(section.key)) {
      context.addIssue({
        code: "custom",
        path: ["sections", sectionIndex, "key"],
        message: "检测章节标识不得重复。",
      });
    }
    sectionKeys.add(section.key);

    section.items.forEach((item, itemIndex) => {
      if (itemKeys.has(item.key)) {
        context.addIssue({
          code: "custom",
          path: ["sections", sectionIndex, "items", itemIndex, "key"],
          message: "检测项目标识必须在同一模板中唯一。",
        });
      }
      itemKeys.add(item.key);
      if (item.options && new Set(item.options).size !== item.options.length) {
        context.addIssue({
          code: "custom",
          path: ["sections", sectionIndex, "items", itemIndex, "options"],
          message: "选项不得重复。",
        });
      }
    });
  });
});

export type InspectionTemplateSchema = z.infer<typeof inspectionTemplateSchema>;
export type InspectionTemplateItem = InspectionTemplateSchema["sections"][number]["items"][number];
