import { readFile } from "node:fs/promises";

const required = [
  "README.md",
  "CONTRIBUTING.md",
  "EDITORIAL_POLICY.md",
  "CODE_OF_CONDUCT.md",
  "LICENSE",
  "data/taxonomy.json",
  "data/catalog.json",
  "CATALOG.md",
  "catalog/projects.md",
  "catalog/ai-models.md",
  "catalog/companies.md",
  "catalog/products.md",
  "scripts/generate-catalog.mjs",
  ".github/CODEOWNERS",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/suggest-technology.yml",
  ".github/ISSUE_TEMPLATE/correction-or-removal.yml",
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
      if (!Array.isArray(area.topics) || !area.topics.length) errors.push(`Empty area: ${area.area}`);
      for (const topic of area.topics ?? []) {
        if (!topic.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(topic.slug) || slugs.has(topic.slug))
          errors.push(`Invalid or duplicate slug: ${topic.slug}`);
        if (!topic.title || titles.has(topic.title)) errors.push(`Missing or duplicate topic name: ${topic.title}`);
        slugs.add(topic.slug);
        titles.add(topic.title);
        const link = `[${topic.title}](https://www.zhongguo.dev/topics/${topic.slug})`;
        if (!readme.includes(link)) errors.push(`Missing README topic link: ${topic.slug}`);
        if (!form.includes(`- ${topic.title}`)) errors.push(`Missing issue-form topic: ${topic.title}`);
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
if (!contents.get("LICENSE")?.startsWith("MIT License")) errors.push("MIT license missing or malformed");

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Repository documentation, contribution files, and taxonomy are valid.");
}
