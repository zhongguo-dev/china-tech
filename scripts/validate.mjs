import { readFile } from "node:fs/promises";

const required = [
  "README.md",
  "README.zh-CN.md",
  "CONTRIBUTING.zh-CN.md",
  "EDITORIAL_POLICY.zh-CN.md",
  "CODE_OF_CONDUCT.zh-CN.md",
  "RADAR_PUBLICATION.zh-CN.md",
  "CONTRIBUTING.md",
  "EDITORIAL_POLICY.md",
  "CODE_OF_CONDUCT.md",
  "LICENSE",
  "data/taxonomy.json",
  "data/catalog.json",
  "CATALOG.md",
  "CATALOG.zh-CN.md",
  "catalog/projects.md",
  "catalog/projects.zh-CN.md",
  "catalog/ai-models.md",
  "catalog/ai-models.zh-CN.md",
  "catalog/companies.md",
  "catalog/companies.zh-CN.md",
  "catalog/products.md",
  "catalog/products.zh-CN.md",
  "scripts/generate-catalog.mjs",
  "scripts/generate-radar.mjs",
  "scripts/sync-published-radar.mjs",
  "scripts/publish-radar-discussions.mjs",
  "RADAR_PUBLICATION.md",
  ".github/workflows/sync-published-radar.yml",
  ".github/workflows/announce-published-radar.yml",
  "data/radar.json",
  "RADAR.md",
  "RADAR.zh-CN.md",
  "radar/2026-W43.md",
  "radar/2026-W43.zh-CN.md",
  "radar/2026-W44.md",
  "radar/2026-W44.zh-CN.md",
  "radar/2026-W45.md",
  "radar/2026-W45.zh-CN.md",
  "radar/2026-W46.md",
  "radar/2026-W46.zh-CN.md",
  "radar/2026-W47.md",
  "radar/2026-W47.zh-CN.md",
  ".github/CODEOWNERS",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/suggest-technology.yml",
  ".github/ISSUE_TEMPLATE/correction-or-removal.yml",
  ".github/ISSUE_TEMPLATE/suggest-radar-development.yml",
  ".github/pull_request_template.md",
  ".github/workflows/validate.yml",
];
const errors = [];
const contents = new Map();
for (const file of required) {
  try {
    const content = await readFile(file, "utf8");
    contents.set(file, content);
    if (!content.trim()) errors.push(`${file} must not be empty`);
    if (!content.endsWith("\n")) errors.push(`${file} must end with a newline`);
  } catch {
    errors.push(`Missing file: ${file}`);
  }
}

const readme = contents.get("README.md") ?? "";
const form = contents.get(".github/ISSUE_TEMPLATE/suggest-technology.yml") ?? "";
const readmeZh = contents.get("README.zh-CN.md") ?? "";
const topicData = contents.get("data/taxonomy.json") ?? "{}";
let taxonomy;
try {
  taxonomy = JSON.parse(topicData);
} catch {
  errors.push("Invalid taxonomy JSON");
}
if (taxonomy) {
  const areas = taxonomy.areas;
  if (!Array.isArray(areas) || areas.length !== 4) {
    errors.push("Expected exactly four technical areas");
  } else {
    const areaNames = new Set();
    const slugs = new Set();
    const titles = new Set();
    for (const area of areas) {
      if (!area.area || areaNames.has(area.area)) errors.push("Missing or duplicate technical area");
      areaNames.add(area.area);
      if (!readme.includes(`### ${area.area}`)) errors.push(`Missing README area: ${area.area}`);
      if (!area.area_zh?.trim() || !readmeZh.includes(`### ${area.area_zh}`))
        errors.push(`Missing Chinese area: ${area.area}`);
      if (!Array.isArray(area.topics) || !area.topics.length) errors.push(`Empty area: ${area.area}`);
      for (const topic of area.topics ?? []) {
        if (!topic.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic.slug) || slugs.has(topic.slug))
          errors.push(`Invalid or duplicate slug: ${topic.slug}`);
        if (!topic.title || titles.has(topic.title)) errors.push(`Missing or duplicate topic name: ${topic.title}`);
        slugs.add(topic.slug);
        titles.add(topic.title);
        const link = `[${topic.title}](https://www.zhongguo.dev/topics/${topic.slug})`;
        if (!readme.includes(link)) errors.push(`Missing README topic link: ${topic.slug}`);
        if (!form.includes(`- \"${topic.title} / ${topic.title_zh}\"`))
          errors.push(`Missing bilingual issue-form topic: ${topic.title}`);
        if (!topic.title_zh?.trim() || !readmeZh.includes(`https://www.zhongguo.dev/zh/topics/${topic.slug}`))
          errors.push(`Missing Chinese topic link: ${topic.slug}`);
      }
    }
    if (slugs.size !== 12) errors.push(`Expected twelve topics, found ${slugs.size}`);
  }
}

const begin = "<!-- BEGIN GENERATED CATALOG -->";
const end = "<!-- END GENERATED CATALOG -->";
const occurrences = (needle) => readme.split(needle).length - 1;
if (occurrences(begin) !== 1 || occurrences(end) !== 1 || readme.indexOf(begin) >= readme.indexOf(end)) {
  errors.push("README catalog markers must appear once and in order");
}
if (!readme.includes("https://www.zhongguo.dev/directory")) errors.push("Missing Directory link");
if (!readme.includes("RADAR_PUBLICATION.md")) errors.push("Missing Radar publishing guide link");
if (!readme.includes("README.zh-CN.md") || !readmeZh.includes("README.md"))
  errors.push("Missing bilingual README navigation");
if (!readmeZh.includes("(RADAR_PUBLICATION.zh-CN.md)") || !readmeZh.includes("(CODE_OF_CONDUCT.zh-CN.md)"))
  errors.push("Chinese README must link to Chinese policy and publication guides");
if (!readmeZh.includes("RADAR.zh-CN.md") || !readmeZh.includes("CATALOG.zh-CN.md"))
  errors.push("Chinese README missing generated catalog or Radar navigation");
for (const p of ["data/catalog.json", "data/radar.json"]) {
  try {
    const parsed = JSON.parse(contents.get(p) || "{}");
    if (parsed.schema_version !== 2) errors.push(`Bilingual schema required: ${p}`);
    if (p.includes("catalog") && parsed.entries?.some((e) => !e.description_zh?.trim()))
      errors.push("Directory contains an untranslated published description");
    if (p.includes("radar") && parsed.editions?.some((e) => !e.title_zh?.trim() || !e.introduction_zh?.trim() || e.items.some((i) => !i.title_zh?.trim() || !i.summary_zh?.trim())))
      errors.push("Radar contains an untranslated published edition or development");
  } catch { errors.push(`Invalid published snapshot: ${p}`); }
}
if (!readme.includes("RADAR.md") || !readme.includes("<!-- BEGIN GENERATED RADAR -->") || !readme.includes("<!-- END GENERATED RADAR -->")) errors.push("Radar archive navigation or markers missing");
if (!contents.get("LICENSE")?.startsWith("MIT License")) errors.push("MIT license missing or malformed");

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Repository documentation, contribution files, and taxonomy are valid.");
}
