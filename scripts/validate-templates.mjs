import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const expectedItemCounts = new Map([
  ["car-three", 95],
  ["car-three-group", 115],
  ["car-four", 101],
  ["car-four-group", 121],
  ["car-standard", 160],
  ["car-group", 180],
  ["car-new", 138],
  ["car-new-group", 158],
]);
const expectedCriticalCounts = new Map([
  ["car-three", 22],
  ["car-three-group", 28],
  ["car-four", 22],
  ["car-four-group", 28],
  ["car-standard", 22],
  ["car-group", 28],
  ["car-new", 22],
  ["car-new-group", 28],
]);
const keyDecision = "\u5173\u952e\u51b3\u5b9a\u9879";
const nonKeyDecision = "\u975e\u5173\u952e\u51b3\u5b9a\u9879";
const incompleteValue = "\u5f85\u68c0\u67e5";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { buildConfiguredTemplateImport } = await server.ssrLoadModule("/src/App.tsx");
  const { inspectionTemplateSchema } = await server.ssrLoadModule("/apps/api/src/templates/template-schema.ts");
  const templates = buildConfiguredTemplateImport();
  const miniappFixturePath = path.resolve("apps/miniapp/data/configured-templates.json");
  const miniappFixtureText = await readFile(miniappFixturePath, "utf8");
  const miniappFixture = JSON.parse(miniappFixtureText);

  assert.equal(templates.length, expectedItemCounts.size, "all configured passenger-car templates must be exported");
  assert.deepEqual(miniappFixture.templates, templates, "miniapp import fixture must match the configured prototype source");
  assert.ok(Buffer.byteLength(miniappFixtureText) <= 512 * 1024, "miniapp import fixture must fit the API's bounded import body limit");
  for (const template of templates) {
    const parsed = inspectionTemplateSchema.safeParse(template.schema);
    assert.equal(parsed.success, true, `${template.code} must satisfy the API template schema`);
    const items = parsed.data.sections.flatMap((section) => section.items);
    assert.equal(items.length, expectedItemCounts.get(template.code), `${template.code} item count`);

    const criticalItems = items.filter((item) => item.decisionType === keyDecision);
    assert.equal(criticalItems.length, expectedCriticalCounts.get(template.code), `${template.code} critical item count`);
    assert.ok(criticalItems.every((item) => item.thresholdRequiredWhen.length > 0), `${template.code} critical items require size findings`);
    assert.ok(items
      .filter((item) => item.decisionType === nonKeyDecision)
      .every((item) => item.thresholdRequiredWhen.length === 0), `${template.code} non-critical items must not require size findings`);
    assert.ok(items.every((item) => item.required), `${template.code} items must remain required`);
    assert.ok(items.some((item) => item.noteRequiredWhen.length > 0), `${template.code} must retain conditional note requirements`);
    assert.ok(items.some((item) => item.evidenceRequiredWhen.length > 0), `${template.code} must retain evidence requirements`);
    assert.ok(items.every((item) => item.thresholdRequiredWhen.every((value) => item.options?.includes(value))), `${template.code} size conditions must be valid options`);
    assert.ok(items.every((item) => !item.evidenceRequiredWhen.includes(incompleteValue)), `${template.code} must not require evidence before an answer is selected`);

    console.log(`${template.code}: ${items.length} items, ${criticalItems.length} critical items`);
  }
} finally {
  await server.close();
}
