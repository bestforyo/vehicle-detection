const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../../..");
const projectConfig = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
const miniProgramRoot = path.resolve(root, projectConfig.miniprogramRoot);
const app = JSON.parse(fs.readFileSync(path.join(miniProgramRoot, "app.json"), "utf8"));

if (!projectConfig.appid || projectConfig.appid === "touristappid") {
  throw new Error("Set a registered WeChat mini-program AppID in project.config.json.");
}
if (!fs.existsSync(miniProgramRoot)) {
  throw new Error(`Mini-program root does not exist: ${miniProgramRoot}`);
}

for (const page of app.pages) {
  const pageBase = path.join(miniProgramRoot, page);
  for (const extension of [".js", ".json", ".wxml", ".wxss"]) {
    const file = `${pageBase}${extension}`;
    if (!fs.existsSync(file)) throw new Error(`Page ${page} is missing ${extension}.`);
    if (extension === ".json") JSON.parse(fs.readFileSync(file, "utf8"));
    if (extension === ".js") {
      new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });
    }
  }
}

for (const file of [
  path.join(miniProgramRoot, "app.js"),
  path.join(miniProgramRoot, "utils/api.js"),
  path.join(miniProgramRoot, "config.js"),
]) {
  new vm.Script(fs.readFileSync(file, "utf8"), { filename: file });
}

JSON.parse(fs.readFileSync(path.join(miniProgramRoot, "sitemap.json"), "utf8"));
console.info(`Validated WeChat project ${projectConfig.appid} with ${app.pages.length} pages.`);
