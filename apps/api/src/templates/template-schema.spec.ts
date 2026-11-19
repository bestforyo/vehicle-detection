import { inspectionTemplateSchema } from "./template-schema";

describe("inspectionTemplateSchema", () => {
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
