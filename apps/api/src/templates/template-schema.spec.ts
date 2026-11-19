import { inspectionTemplateSchema } from "./template-schema";

describe("inspectionTemplateSchema", () => {
  it("preserves the decision classification of critical template items", () => {
    const result = inspectionTemplateSchema.safeParse({
      version: 1,
      sections: [{
        key: "accident",
        title: "重大事故检测",
        items: [{
          key: "front-rail",
          title: "前纵梁",
          options: ["正常", "修复"],
          decisionType: "关键决定项",
          thresholdRequiredWhen: ["修复"],
        }],
      }],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sections[0].items[0]).toMatchObject({
        decisionType: "关键决定项",
        thresholdRequiredWhen: ["修复"],
      });
    }
  });

  it("rejects unknown decision classifications", () => {
    const result = inspectionTemplateSchema.safeParse({
      version: 1,
      sections: [{
        key: "accident",
        title: "重大事故检测",
        items: [{
          key: "front-rail",
          title: "前纵梁",
          decisionType: "重要项目",
        }],
      }],
    });

    expect(result.success).toBe(false);
  });

  it("limits the total checklist item count to the draft API limit", () => {
    const schema = {
      version: 1 as const,
      sections: [251, 250].map((itemCount, sectionIndex) => ({
        key: `section-${sectionIndex}`,
        title: `章节 ${sectionIndex}`,
        items: Array.from({ length: itemCount }, (_, itemIndex) => ({
          key: `item-${sectionIndex}-${itemIndex}`,
          title: `项目 ${sectionIndex}-${itemIndex}`,
        })),
      })),
    };

    const result = inspectionTemplateSchema.safeParse(schema);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ["sections"],
        message: "单个检测模板的检测项总数不能超过 500 项。",
      }));
    }
  });
});
