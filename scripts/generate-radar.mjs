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
assert(radar.schema_version === 1 && radar.source === sourceUrl &&
  date(radar.snapshot_date), "Invalid Radar snapshot");
assert(Array.isArray(radar.editions) && radar.editions.length, "No editions");
const weeks = new Set();
let previousDate = "9999-12-31";
let stories = 0, citations = 0;
for (const edition of radar.editions) {
  assert(Object.keys(edition).sort().join(",") ===
    "introduction,items,number,publication_date,slug,title,week", "Unexpected edition fields");
  assert(Number.isInteger(edition.number) && edition.number > 0 &&
    typeof edition.week === "string" && /^\d{4}-W\d{2}$/.test(edition.week) &&
    edition.slug === "china-dev-radar-" + String(edition.number).padStart(3, "0") +
      "-" + edition.week.toLowerCase().replace("-", "-") &&
    date(edition.publication_date) && edition.publication_date <= radar.snapshot_date &&
    edition.publication_date <= previousDate &&
    typeof edition.title === "string" && edition.title.trim() &&
    typeof edition.introduction === "string" && edition.introduction.trim(),
    "Invalid published Radar edition");
  previousDate = edition.publication_date;
  assert(!weeks.has(edition.week), "Duplicate Radar week");
  weeks.add(edition.week);
  assert(Array.isArray(edition.items) && edition.items.length, "Edition has no stories");
  const titles = new Set();
  for (const item of edition.items) {
    assert(Object.keys(item).sort().join(",") ===
      "original_publication_date,related_profile,section,sources,summary,title", "Unexpected Radar item fields");
    assert(typeof item.title === "string" && item.title.trim() &&
      typeof item.summary === "string" && item.summary.trim() &&
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
