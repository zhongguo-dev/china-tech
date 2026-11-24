import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const origin = "https://www.zhongguo.dev";
const beginMarker = "<!-- BEGIN GENERATED CATALOG -->";
const endMarker = "<!-- END GENERATED CATALOG -->";
const types = [
  { id: "project", label: "Projects", singular: "Project", file: "catalog/projects.md" },
  { id: "ai_model", label: "AI models", singular: "AI model", file: "catalog/ai-models.md" },
  { id: "company", label: "Companies", singular: "Company", file: "catalog/companies.md" },
  { id: "product", label: "Products & platforms", singular: "Product / platform", file: "catalog/products.md" },
  { id: "organization", label: "Organizations", singular: "Organization", file: "catalog/organizations.md" },
  { id: "person", label: "Maintainers & people", singular: "Person / maintainer", file: "catalog/people.md" },
];
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const md = (value) => String(value)
  .replace(/\r?\n/g, " ")
  .replace(/\\/g, "\\\\")
  .replace(/([*_[\]<>|])/g, "\\$1")
  .replaceAll(String.fromCharCode(96), String.fromCharCode(92, 96))
  .replace(/\s+/g, " ").trim();
const safeUrl = (value) => {
  const url = new URL(value);
  assert(["https:", "http:"].includes(url.protocol) && url.hostname &&
    !url.username && !url.password &&
    !["localhost", "127.0.0.1", "::1"].includes(url.hostname),
    "Invalid official URL");
  return value.replace(/\(/g, "%28").replace(/\)/g, "%29");
};
const compare = (a, b) => {
  const x = a.name.toLowerCase(), y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
};
const readme = await readFile("README.md", "utf8");
const taxonomy = JSON.parse(await readFile("data/taxonomy.json", "utf8"));
const snapshot = JSON.parse(await readFile("data/catalog.json", "utf8"));
assert(snapshot.schema_version === 2 && snapshot.source === origin + "/directory",
  "Unexpected catalog source or format");
assert(/^\d{4}-\d{2}-\d{2}$/.test(snapshot.refreshed_on), "Invalid catalog snapshot date");
assert(Array.isArray(snapshot.entries) && snapshot.entries.length > 0, "Empty catalog");
assert(Array.isArray(taxonomy.areas) && taxonomy.areas.length === 4, "Unexpected taxonomy");
const topics = taxonomy.areas.flatMap((area) => area.topics);
const topicMap = new Map(topics.map((topic) => [topic.slug, topic]));
assert(topicMap.size === 12, "Expected twelve unique topics");
for (const area of taxonomy.areas) {
  assert(typeof area.area_zh === "string" && area.area_zh.trim(), "Missing Chinese area name");
  for (const topic of area.topics)
    assert(typeof topic.title_zh === "string" && topic.title_zh.trim(), "Missing Chinese topic name");
}
const paths = new Set();
const entries = [...snapshot.entries].map((e) => {
  assert(Object.keys(e).sort().join(",") ===
    "description,description_zh,documentation,name,name_zh,path,repository,topics,type,website", "Unexpected catalog fields");
  assert(types.some((t) => t.id === e.type), "Unexpected entry type");
  assert(typeof e.name === "string" && e.name.trim() &&
    typeof e.description === "string" && e.description.trim() &&
    typeof e.description_zh === "string" && e.description_zh.trim() &&
    (e.name_zh === null || typeof e.name_zh === "string" && e.name_zh.trim()) &&
    typeof e.path === "string" &&
    /^\/(projects|ai|companies|directory)\/[a-z0-9-]+$/.test(e.path),
    "Invalid published entry");
  assert(!paths.has(e.path), "Duplicate canonical profile");
  paths.add(e.path);
  assert(Array.isArray(e.topics) && new Set(e.topics).size === e.topics.length, "Invalid topics");
  for (const slug of e.topics) assert(topicMap.has(slug), "Unknown technical topic");
  for (const key of ["website", "repository", "documentation"]) {
    assert(e[key] == null || typeof e[key] === "string", "Invalid resource field");
    if (e[key]) safeUrl(e[key]);
  }
  assert(e.website || e.repository || e.documentation, "Entry without an official resource");
  return e;
}).sort(compare);
const groups = types.map((t) => ({
  ...t, entries: entries.filter((e) => e.type === t.id),
})).filter((t) => t.entries.length > 0);
const typeLinks = groups.map((t) => "[" + t.label + " (" + t.entries.length + ")](" + t.file + ")");
const unassigned = entries.filter((e) => e.topics.length === 0);
const intro = "Curated published entries from [Zhongguo.dev](" + origin +
  "/directory). Snapshot refreshed " + snapshot.refreshed_on +
  ". Inclusion is for discovery, not endorsement or ranking.";
function entryLine(e) {
  const kind = types.find((t) => t.id === e.type).singular;
  const links = [], seen = new Set();
  for (const [label, value] of [["Source", e.repository], ["Website", e.website], ["Docs", e.documentation]]) {
    if (!value) continue;
    const url = safeUrl(value);
    if (!seen.has(url)) links.push("[" + label + "](" + url + ")");
    seen.add(url);
  }
  return "- **[" + md(e.name) + "](" + origin + e.path + ")** (" + kind +
    "): " + md(e.description) + (links.length ? " · " + links.join(" · ") : "");
}
const generated = new Map();
const topicPage = [
  "# China Tech catalog by topic", "", "**English** | [简体中文](CATALOG.zh-CN.md)", "", intro, "",
  "**" + entries.length + " unique entries** across " + taxonomy.areas.length +
    " technical areas and " + topics.length +
    " topics. Entries relevant to multiple topics may appear in multiple sections.",
  "", "**Browse by type:** " + typeLinks.join(" · "), "",
  "**Jump to a technical area:**", "",
  ...taxonomy.areas.map((a) => "- [" + a.area + "](#area-" +
    a.area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "") + ")"),
  "- [Awaiting topic assignment (" + unassigned.length + ")](#awaiting-topic-assignment)", "",
];
for (const area of taxonomy.areas) {
  const slug = area.area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
  topicPage.push('<a id="area-' + slug + '"></a>', "## " + area.area, "");
  for (const topic of area.topics) {
    const matching = entries.filter((e) => e.topics.includes(topic.slug));
    topicPage.push('<a id="topic-' + topic.slug + '"></a>',
      "### " + topic.title + " (" + matching.length + ")", "",
      "[Explore this topic on Zhongguo.dev](" + origin + "/topics/" + topic.slug + ")", "",
      ...(matching.length ? matching.map(entryLine) : ["No published entries assigned to this topic yet."]),
      "");
  }
}
topicPage.push('<a id="awaiting-topic-assignment"></a>',
  "## Awaiting topic assignment (" + unassigned.length + ")", "",
  "These published entries do not yet have a technical topic assignment. They remain discoverable by type and canonical profile.",
  "", ...unassigned.map(entryLine), "");
generated.set("CATALOG.md", topicPage.join("\n").trimEnd() + "\n");

for (const type of groups) {
  const initial = (e) => /^[a-z0-9]/i.test(e.name) ? e.name[0].toUpperCase() : "#";
  const letters = [...new Set(type.entries.map(initial))].sort();
  const lines = ["# " + type.label, "", "**English** | [简体中文](" + type.file.split("/")[1].replace(".md", ".zh-CN.md") + ")", "", intro, "",
    "**" + type.entries.length + " published entries** · [Browse by topic](../CATALOG.md)", "",
    "**Jump to:** " + letters.map((letter) => "[" + letter + "](#letter-" +
      (letter === "#" ? "other" : letter.toLowerCase()) + ")").join(" · "), ""];
  for (const letter of letters) {
    lines.push('<a id="letter-' + (letter === "#" ? "other" : letter.toLowerCase()) + '"></a>',
      "## " + (letter === "#" ? "Other" : letter), "",
      ...type.entries.filter((e) => initial(e) === letter).map(entryLine), "");
  }
  generated.set(type.file, lines.join("\n").trimEnd() + "\n");
}
assert(readme.split(beginMarker).length === 2 && readme.split(endMarker).length === 2,
  "README must contain one generated catalog region");
const first = readme.indexOf(beginMarker) + beginMarker.length;
const last = readme.indexOf(endMarker);
assert(first <= last, "Invalid generated catalog markers");
// Reuse the same topic sections in the standalone catalog and README.
// Counts remain in the standalone catalog; the homepage is a browsing surface.
function homepageSections(page) {
  const start = page.findIndex((line) => line.startsWith('<a id="area-'));
  assert(start !== -1, "Missing catalog sections");
  return page.slice(start).map((line) =>
    /^#{2,3} /.test(line) ? line.replace(/(?: \(\d+\)|（\d+）)$/, "") : line);
}

const summary = [
  "**Browse by type:** " + groups.map((t) =>
    "[" + t.label + "](" + t.file + ")").join(" · "),
  "",
  "[Standalone catalog](CATALOG.md) · [Live Directory](" + origin + "/directory)",
  "",
  "Entries may appear under multiple relevant topics.",
  "",
  ...homepageSections(topicPage),
].join("\n").trimEnd();
generated.set("README.md", readme.slice(0, first) + "\n\n" + summary + "\n\n" + readme.slice(last));


const labelsZh = new Map([
  ["project", ["项目", "项目"]],
  ["ai_model", ["AI 模型", "AI 模型"]],
  ["company", ["企业与组织", "企业"]],
  ["product", ["产品与平台", "产品"]],
  ["organization", ["组织", "组织"]],
  ["person", ["开发者与维护者", "开发者"]],
]);
const typeFileZh = (t) => t.file.replace(/\.md$/, ".zh-CN.md");
const zhTypeLinks = groups.map((t) =>
  "[" + labelsZh.get(t.id)[0] + "（" + t.entries.length + "）](" + typeFileZh(t) + ")");
const zhIntro = "本目录收录 [Zhongguo.dev](" + origin +
  "/zh/directory) 已发布的技术资料，数据快照日期：" + snapshot.refreshed_on +
  "。收录仅供技术发现与信息参考，不代表认可、认证或排名。";
function entryLineZh(e) {
  const kind = labelsZh.get(e.type)[1];
  const links = [], seen = new Set();
  for (const [label, value] of [
    ["代码仓库", e.repository], ["官方网站", e.website], ["文档", e.documentation],
  ]) {
    if (!value) continue;
    const ref = safeUrl(value);
    if (!seen.has(ref)) links.push("[" + label + "](" + ref + ")");
    seen.add(ref);
  }
  return "- **[" + md(e.name_zh || e.name) + "](" + origin + "/zh" + e.path +
    ")**（" + kind + "）："+ md(e.description_zh) +
    (links.length ? " · " + links.join(" · ") : "");
}
const zhTopicPage = [
  "# China Tech 中文技术目录", "",
  "[English](CATALOG.md) | **简体中文**", "", zhIntro, "",
  "**" + entries.length + " 个独立条目**，涵盖 " + taxonomy.areas.length +
    " 个技术领域和 " + topics.length + " 个主题。同一条目可能同时归属多个相关主题。",
  "", "**按类型浏览：**" + zhTypeLinks.join(" · "), "",
  "**跳转到技术领域：**", "",
  ...taxonomy.areas.map((a) => "- [" + a.area_zh + "](#area-" +
    a.area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "") + ")"),
  "- [待分配主题（" + unassigned.length + "）](#awaiting-topic-assignment)", "",
];
for (const area of taxonomy.areas) {
  const slug = area.area.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
  zhTopicPage.push('<a id="area-' + slug + '"></a>', "## " + area.area_zh, "");
  for (const topic of area.topics) {
    const matching = entries.filter((e) => e.topics.includes(topic.slug));
    zhTopicPage.push('<a id="topic-' + topic.slug + '"></a>',
      "### " + topic.title_zh + "（" + matching.length + "）", "",
      "[在 Zhongguo.dev 查看该主题](" + origin + "/zh/topics/" + topic.slug + ")", "",
      ...(matching.length ? matching.map(entryLineZh) : ["该主题暂无已发布条目。"]), "");
  }
}
zhTopicPage.push('<a id="awaiting-topic-assignment"></a>',
  "## 待分配主题（" + unassigned.length + "）", "",
  "这些条目已公开发布，但尚未分配具体技术主题。仍可通过类型索引或官网详情页访问。", "",
  ...unassigned.map(entryLineZh), "");
generated.set("CATALOG.zh-CN.md", zhTopicPage.join("\n").trimEnd() + "\n");

for (const type of groups) {
  const initial = (e) => /^[a-z0-9]/i.test(e.name) ? e.name[0].toUpperCase() : "#";
  const letters = [...new Set(type.entries.map(initial))].sort();
  const lines = ["# " + labelsZh.get(type.id)[0], "",
    "[English](" + type.file.split("/")[1] + ") | **简体中文**", "",
    zhIntro, "", "**" + type.entries.length +
    " 个已发布条目** · [按技术主题浏览](../CATALOG.zh-CN.md)", "",
    "**字母索引：**" + letters.map((letter) => "[" + letter +
      "](#letter-" + (letter === "#" ? "other" : letter.toLowerCase()) + ")").join(" · "), ""];
  for (const letter of letters) {
    lines.push('<a id="letter-' + (letter === "#" ? "other" : letter.toLowerCase()) + '"></a>',
      "## " + (letter === "#" ? "其他" : letter), "",
      ...type.entries.filter((e) => initial(e) === letter).map(entryLineZh), "");
  }
  generated.set(typeFileZh(type), lines.join("\n").trimEnd() + "\n");
}
const readmeZh = await readFile("README.zh-CN.md", "utf8");
assert(readmeZh.split(beginMarker).length === 2 && readmeZh.split(endMarker).length === 2 &&
  readmeZh.indexOf(beginMarker) < readmeZh.indexOf(endMarker),
  "Chinese README must contain exactly one catalog region");
const firstZh = readmeZh.indexOf(beginMarker) + beginMarker.length;
const lastZh = readmeZh.indexOf(endMarker);
const summaryZh = [
  "**按类型浏览：**" + groups.map((t) =>
    "[" + labelsZh.get(t.id)[0] + "](" + typeFileZh(t) + ")").join(" · "),
  "",
  "[独立技术目录](CATALOG.zh-CN.md) · [官网实时目录](" + origin + "/zh/directory)",
  "",
  "同一条目可能同时归属多个相关主题。",
  "",
  ...homepageSections(zhTopicPage),
].join("\n").trimEnd();
generated.set("README.zh-CN.md", readmeZh.slice(0, firstZh) +
  "\n\n" + summaryZh + "\n\n" + readmeZh.slice(lastZh));

const check = process.argv.includes("--check");
let failed = 0;
for (const [path, expected] of generated) {
  if (check) {
    let actual;
    try { actual = await readFile(path, "utf8"); } catch { actual = ""; }
    if (actual !== expected) {
      console.error("Out of date: " + path);
      failed++;
    }
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected);
    console.log("Generated " + path);
  }
}
if (check && failed) process.exitCode = 1;
else if (check) console.log("Validated " + entries.length + " entries across " + generated.size + " generated Markdown files.");
