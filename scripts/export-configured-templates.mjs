import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "apps", "miniapp", "data");
const outputPath = path.join(outputDirectory, "configured-templates.json");
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { buildConfiguredTemplateImport } = await server.ssrLoadModule("/src/App.tsx");
  const templates = buildConfiguredTemplateImport();
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify({ templates })}\n`, "utf8");
  console.log(`Exported ${templates.length} configured templates to ${path.relative(root, outputPath)}.`);
} finally {
  await server.close();
}
