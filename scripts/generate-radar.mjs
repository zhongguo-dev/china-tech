import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const origin = "https://www.zhongguo.dev";
const sourceUrl = origin + "/radar";
const start = "<!-- BEGIN GENERATED RADAR -->";
const end = "<!-- END GENERATED RADAR -->";
const sections = [
  { key: "featured", title: "Featured developments" },
  { key: "quick_update", title: "Quick updates" },
  { key: "research_desk", title: "Research Desk" },
];
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const md = (value) => String(value).replace(/\r?\n/g, " ")
  .replace(/\\/g, "\\\\")
  .replace(/([*_[\]<>|])/g, "\\$1")
  .replaceAll(String.fromCharCode(96), String.fromCharCode(92, 96))
  .replace(/\s+/g, " ").trim();
const date = (value) => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
  new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
const url = (value) => {
  assert(typeof value === "string" && /^https?:\/\//i.test(value), "Invalid source URL");
  const parsed = new URL(value);
  assert(["https:", "http:"].includes(parsed.protocol) &&
    parsed.hostname && !parsed.username && !parsed.password &&
    !/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(parsed.hostname) &&
    !/(?:token|api_key|access_key|password|secret)=/i.test(parsed.search),
    "Unsafe public URL");
  return value.replace(/\(/g, "%28").replace(/\)/g, "%29");
};
const formatNumber = (n) => "#" + String(n).padStart(3, "0");
const radar = JSON.parse(await readFile("data/radar.json", "utf8"));
assert(Object.keys(radar).sort().join(",") === "editions,schema_version,snapshot_date,source",
  "Unexpected Radar metadata");
assert(radar.schema_version === 2 && radar.source === sourceUrl &&
  date(radar.snapshot_date), "Invalid Radar snapshot");
assert(Array.isArray(radar.editions) && radar.editions.length, "No editions");
const weeks = new Set();
let previousDate = "9999-12-31";
let stories = 0, citations = 0;
for (const edition of radar.editions) {
  assert(Object.keys(edition).sort().join(",") ===
    "introduction,introduction_zh,items,number,publication_date,slug,title,title_zh,week", "Unexpected edition fields");
  assert(Number.isInteger(edition.number) && edition.number > 0 &&
    typeof edition.week === "string" && /^\d{4}-W\d{2}$/.test(edition.week) &&
    edition.slug === "china-dev-radar-" + String(edition.number).padStart(3, "0") +
      "-" + edition.week.toLowerCase().replace("-", "-") &&
    date(edition.publication_date) && edition.publication_date <= radar.snapshot_date &&
    edition.publication_date <= previousDate &&
    typeof edition.title === "string" && edition.title.trim() &&
    typeof edition.introduction === "string" && edition.introduction.trim() &&
    typeof edition.title_zh === "string" && edition.title_zh.trim() &&
    typeof edition.introduction_zh === "string" && edition.introduction_zh.trim(),
    "Invalid published Radar edition");
  previousDate = edition.publication_date;
  assert(!weeks.has(edition.week), "Duplicate Radar week");
  weeks.add(edition.week);
  assert(Array.isArray(edition.items) && edition.items.length, "Edition has no stories");
  const titles = new Set();
  for (const item of edition.items) {
    assert(Object.keys(item).sort().join(",") ===
      "original_publication_date,related_profile,section,sources,summary,summary_zh,title,title_zh", "Unexpected Radar item fields");
    assert(typeof item.title === "string" && item.title.trim() &&
      typeof item.summary === "string" && item.summary.trim() &&
      typeof item.title_zh === "string" && item.title_zh.trim() &&
      typeof item.summary_zh === "string" && item.summary_zh.trim() &&
      date(item.original_publication_date) &&
      item.original_publication_date <= radar.snapshot_date &&
      sections.some((s) => s.key === item.section), "Invalid published development");
    assert(!titles.has(item.title), "Duplicate story in Radar edition");
    titles.add(item.title);
    assert(item.related_profile === null || (
      typeof item.related_profile === "string" &&
      /^\/(projects|ai|companies|directory)\/[a-z0-9-]+$/.test(item.related_profile)
    ), "Invalid related profile");
    assert(Array.isArray(item.sources) && item.sources.length, "Missing original-source references");
    const referenceUrls = new Set();
    for (const source of item.sources) {
      assert(Object.keys(source).sort().join(",") === "label,url" &&
        typeof source.label === "string" && source.label.trim(), "Invalid public source");
      url(source.url);
      assert(!referenceUrls.has(source.url), "Repeated reference within a story");
      referenceUrls.add(source.url);
      citations++;
    }
    stories++;
  }
}

const output = new Map();
function archivePath(edition) { return "radar/" + edition.week + ".md"; }
function editionUrl(edition) { return sourceUrl + "/" + edition.slug; }
function storyMarkdown(item) {
  const lines = [
    "### " + md(item.title), "",
    "**Original publication:** " + item.original_publication_date, "",
    md(item.summary), "",
    "**Original sources:** " + item.sources.map((s) => "[" + md(s.label) +
      "](" + url(s.url) + ")").join(" · "), "",
  ];
  if (item.related_profile) {
    lines.push("**Related Directory entry:** [View on Zhongguo.dev](" +
      origin + item.related_profile + ")", "");
  }
  return lines;
}
for (const edition of radar.editions) {
  const lines = [
    "# China Dev Radar " + formatNumber(edition.number) + " | " + edition.week, "",
    "**English** | [简体中文](" + edition.week + ".zh-CN.md)", "",
    "**" + md(edition.title) + "**", "",
    "**Published:** " + edition.publication_date +
      " · **Developments:** " + edition.items.length, "",
    "[Read the full bilingual edition](" + editionUrl(edition) + ")" +
      " · [All Radar editions](../RADAR.md)", "",
    md(edition.introduction), "",
  ];
  for (const section of sections) {
    const items = edition.items.filter((item) => item.section === section.key);
    if (!items.length) continue;
    lines.push("## " + section.title, "");
    if (section.key === "research_desk") lines.push(
      "Earlier technical developments and research, with original dates preserved.", "");
    for (const item of items) lines.push(...storyMarkdown(item));
  }
  lines.push("---", "",
    "This archive is a concise reference to a published edition. " +
    "See the [full Zhongguo.dev article](" + editionUrl(edition) +
    ") for complete context and bilingual coverage.", "");
  output.set(archivePath(edition), lines.join("\n").trimEnd() + "\n");
}

const latest = radar.editions[0];
const archive = [
  "# China Dev Radar archive", "",
  "**English** | [简体中文](RADAR.zh-CN.md)", "",
  "A chronological archive of published China Dev Radar editions. " +
    "Each page summarizes the developments covered, preserves their original dates, " +
    "and links to the official sources and the full bilingual article on Zhongguo.dev.", "",
  "**" + radar.editions.length + " editions · " + stories +
    " developments · " + citations + " source references**", "",
  "**Latest:** [China Dev Radar " + formatNumber(latest.number) +
    " | " + latest.week + "](" + archivePath(latest) + ")", "",
  "| Week | Edition | Published | Developments | Full article |",
  "| --- | --- | --- | ---: | --- |",
];
for (const edition of radar.editions) archive.push(
  "| [" + edition.week + "](" + archivePath(edition) + ")" +
  " | [" + formatNumber(edition.number) + "](" + archivePath(edition) + ")" +
  " | " + edition.publication_date + " | " + edition.items.length +
  " | [Read on Zhongguo.dev](" + editionUrl(edition) + ") |",
);
archive.push("", "## Edition summaries", "");
for (const edition of radar.editions) archive.push(
  "### [" + md(edition.title) + "](" + archivePath(edition) + ")", "",
  md(edition.introduction), "",
);
archive.push(
  "## Suggest a development", "",
  "Know of an important release, engineering change, or technical announcement? " +
    "[Suggest a Radar development](https://github.com/zhongguo-dev/china-tech/issues/new?template=suggest-radar-development.yml)." +
    " Suggestions are reviewed and require original evidence before publication.", "",
  "[Explore the complete bilingual Radar on Zhongguo.dev](" + sourceUrl + ").", "",
);
output.set("RADAR.md", archive.join("\n").trimEnd() + "\n");

const readme = await readFile("README.md", "utf8");
assert(readme.split(start).length === 2 && readme.split(end).length === 2 &&
  readme.indexOf(start) < readme.indexOf(end), "Invalid Radar README markers");
const radarSnippet = [
  "**Latest:** [China Dev Radar " + formatNumber(latest.number) + " | " +
    latest.week + "](" + archivePath(latest) + ") · Published " +
    latest.publication_date + " · " + latest.items.length + " developments",
  "",
  "[Explore all " + radar.editions.length + " published editions](RADAR.md)" +
    " · [Read full articles](" + sourceUrl + ")" +
    " · [Suggest a Radar development](https://github.com/zhongguo-dev/china-tech/issues/new?template=suggest-radar-development.yml)",
].join("\n");
const insertStart = readme.indexOf(start) + start.length;
const insertEnd = readme.indexOf(end);
output.set("README.md", readme.slice(0, insertStart) + "\n\n" + radarSnippet +
  "\n\n" + readme.slice(insertEnd));


const sectionZh = new Map([
  ["featured", "重点技术进展"],
  ["quick_update", "开发者快讯"],
  ["research_desk", "研究资料室"],
]);
function zhArchivePath(edition) { return "radar/" + edition.week + ".zh-CN.md"; }
function zhEditionUrl(edition) { return origin + "/zh/radar/" + edition.slug; }
function zhStory(item) {
  const lines = [
    "### " + md(item.title_zh), "",
    "**原始发布日期：**" + item.original_publication_date, "",
    md(item.summary_zh), "",
    "**原始资料：**" + item.sources.map((s) =>
      "[" + md(s.label) + "](" + url(s.url) + ")").join(" · "), "",
  ];
  if (item.related_profile) lines.push(
    "**相关技术目录：**[在 Zhongguo.dev 查看](" + origin + "/zh" + item.related_profile + ")", "");
  return lines;
}
for (const edition of radar.editions) {
  const lines = [
    "# 中国开发者技术雷达 " + formatNumber(edition.number) + " | " + edition.week, "",
    "[English](" + edition.week + ".md) | **简体中文**", "",
    "**" + md(edition.title_zh) + "**", "",
    "**发布日期：**" + edition.publication_date + " · **技术进展：**" + edition.items.length + " 条", "",
    "[阅读完整双语文章](" + zhEditionUrl(edition) + ")" +
      " · [返回技术雷达归档](../RADAR.zh-CN.md)", "",
    md(edition.introduction_zh), "",
  ];
  for (const section of sections) {
    const items = edition.items.filter((item) => item.section === section.key);
    if (!items.length) continue;
    lines.push("## " + sectionZh.get(section.key), "");
    if (section.key === "research_desk") lines.push(
      "本节包含此前发布的技术资料与研究，原始日期均予以保留。", "");
    for (const item of items) lines.push(...zhStory(item));
  }
  lines.push("---", "",
    "本页是已发布 Radar 文章的简要归档。完整背景与双语内容请参见 " +
    "[Zhongguo.dev 正式文章](" + zhEditionUrl(edition) + ")。", "");
  output.set(zhArchivePath(edition), lines.join("\n").trimEnd() + "\n");
}

const zhArchive = [
  "# 中国开发者技术雷达归档", "",
  "[English](RADAR.md) | **简体中文**", "",
  "本归档按时间列出已发布的 China Dev Radar 期刊，保留各技术进展的原始发布日期，并提供官方资料和 Zhongguo.dev 完整双语文章链接。", "",
  "**" + radar.editions.length + " 期 · " + stories + " 条技术进展 · " +
    citations + " 条原始资料引用**", "",
  "**最新一期：**[China Dev Radar " + formatNumber(latest.number) + " | " +
    latest.week + "](" + zhArchivePath(latest) + ")", "",
  "| 周次 | 期数 | 发布日期 | 进展数量 | 完整文章 |",
  "| --- | --- | --- | ---: | --- |",
];
for (const edition of radar.editions) zhArchive.push(
  "| [" + edition.week + "](" + zhArchivePath(edition) + ")" +
  " | [" + formatNumber(edition.number) + "](" + zhArchivePath(edition) + ")" +
  " | " + edition.publication_date + " | " + edition.items.length +
  " | [Zhongguo.dev 中文版](" + zhEditionUrl(edition) + ") |");
zhArchive.push("", "## 各期摘要", "");
for (const edition of radar.editions) zhArchive.push(
  "### [" + md(edition.title_zh) + "](" + zhArchivePath(edition) + ")", "",
  md(edition.introduction_zh), "");
zhArchive.push(
  "## 推荐技术进展", "",
  "发现新的技术发布、工程实践或值得研究的资源？欢迎通过 " +
    "[Radar 建议表单](https://github.com/zhongguo-dev/china-tech/issues/new?template=suggest-radar-development.yml)" +
    " 提交线索。所有建议仍须经过独立验证，不保证收录。", "",
  "[在 Zhongguo.dev 浏览完整中文雷达](https://www.zhongguo.dev/zh/radar)。", "",
);
output.set("RADAR.zh-CN.md", zhArchive.join("\n").trimEnd() + "\n");

const readmeZh = await readFile("README.zh-CN.md", "utf8");
assert(readmeZh.split(start).length === 2 && readmeZh.split(end).length === 2 &&
  readmeZh.indexOf(start) < readmeZh.indexOf(end),
  "Invalid Chinese Radar README markers");
const zhStart = readmeZh.indexOf(start) + start.length;
const zhEnd = readmeZh.indexOf(end);
const zhSnippet = [
  "**最新一期：**[China Dev Radar " + formatNumber(latest.number) +
    " | " + latest.week + "](" + zhArchivePath(latest) + ")" +
    " · 发布于 " + latest.publication_date + " · " + latest.items.length + " 条技术进展",
  "", "[查看已发布的 " + radar.editions.length + " 期归档](RADAR.zh-CN.md)" +
    " · [阅读完整文章](https://www.zhongguo.dev/zh/radar)" +
    " · [推荐技术进展](https://github.com/zhongguo-dev/china-tech/issues/new?template=suggest-radar-development.yml)",
].join("\n");
output.set("README.zh-CN.md", readmeZh.slice(0, zhStart) +
  "\n\n" + zhSnippet + "\n\n" + readmeZh.slice(zhEnd));

const check = process.argv.includes("--check");
let mismatches = 0;
for (const [path, expected] of output) {
  if (check) {
    let current = "";
    try { current = await readFile(path, "utf8"); } catch {}
    if (current !== expected) {
      console.error("Radar archive not current: " + path);
      mismatches++;
    }
  } else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected);
    console.log("Generated " + path);
  }
}
if (check && mismatches) process.exitCode = 1;
else if (check) console.log("Validated " + radar.editions.length + " Radar editions and " +
  stories + " developments.");
