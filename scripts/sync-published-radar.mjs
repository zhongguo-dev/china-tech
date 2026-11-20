import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const PUBLIC_FEED = "https://www.zhongguo.dev/api/radar/public-archive";
const BASE_URL = "https://www.zhongguo.dev/radar";
const badQuery = /(?:token|api_key|access_key|password|secret)=/i;

export function validatePublicUrl(input) {
  if (typeof input !== "string" || /\s|[<>]/.test(input))
    throw new Error("Invalid public source URL.");
  const url = new URL(input);
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname ||
      url.username || url.password || badQuery.test(url.search) ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(url.hostname))
    throw new Error("Unsafe public source URL.");
  return input;
}

export function checkPublishedFeed(previous, incoming) {
  if (!previous || !incoming ||
      previous.schema_version !== 1 || incoming.schema_version !== 1 ||
      previous.source !== BASE_URL || incoming.source !== BASE_URL ||
      !Array.isArray(previous.editions) || !Array.isArray(incoming.editions) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(incoming.snapshot_date))
    throw new Error("Unrecognized published Radar archive data.");

  const ids = new Set(), weeks = new Set();
  for (const e of incoming.editions) {
    if (!Number.isSafeInteger(e.number) || e.number <= 0 ||
        !/^\d{4}-W\d{2}$/.test(e.week) ||
        e.slug !== "china-dev-radar-" + String(e.number).padStart(3, "0") +
          "-" + e.week.toLowerCase() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(e.publication_date) ||
        e.publication_date > incoming.snapshot_date ||
        typeof e.title !== "string" || !e.title.trim() ||
        typeof e.introduction !== "string" || !e.introduction.trim() ||
        !Array.isArray(e.items) || e.items.length === 0 ||
        ids.has(e.number) || weeks.has(e.week))
      throw new Error("Invalid or duplicate published Radar edition.");
    ids.add(e.number);
    weeks.add(e.week);
    for (const story of e.items) {
      if (!story || !story.title || !story.summary ||
          !["featured", "quick_update", "research_desk"].includes(story.section) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(story.original_publication_date) ||
          !Array.isArray(story.sources) || !story.sources.length)
        throw new Error("Invalid published Radar development.");
      for (const ref of story.sources) {
        if (!ref?.label || !ref?.url) throw new Error("Missing published citation.");
        validatePublicUrl(ref.url);
      }
    }
  }
  if (incoming.editions.length < previous.editions.length)
    throw new Error("Published Radar archive shrank unexpectedly.");
  for (const previousEdition of previous.editions) {
    const updated = incoming.editions.find((e) => e.slug === previousEdition.slug);
    if (!updated) throw new Error("Previously published Radar edition disappeared.");
    if (JSON.stringify(updated) !== JSON.stringify(previousEdition))
      throw new Error("Previously published Radar content changed; review corrections separately.");
  }
  const maxNumber = Math.max(0, ...previous.editions.map((e) => e.number));
  const fresh = incoming.editions
    .filter((e) => !previous.editions.some((old) => old.slug === e.slug))
    .sort((a, b) => a.number - b.number);
  for (let index = 0; index < fresh.length; index++) {
    if (fresh[index].number !== maxNumber + index + 1)
      throw new Error("Unexpected Radar numbering or backfilled edition.");
  }
  if (!fresh.length) return { changed: false, editions: [] };

  const latestOldDate = previous.editions[0]?.publication_date || "0000-00-00";
  for (const e of fresh) {
    if (e.publication_date < latestOldDate)
      throw new Error("A new Radar edition predates the existing archive.");
  }
  return { changed: true, editions: fresh.map((e) => e.slug) };
}

async function publicJson(endpoint, fetcher = fetch) {
  const response = await fetcher(endpoint, {
    redirect: "follow",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Published Radar feed unavailable.");
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("Published Radar feed returned a non-JSON response.");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 4_000_000) throw new Error("Published Radar feed exceeded size limit.");
  const body = await response.text();
  if (body.length > 4_000_000) throw new Error("Published Radar feed exceeded size limit.");
  return JSON.parse(body);
}

export async function synchronizeRadar(previous, incoming, verifyPage) {
  const result = checkPublishedFeed(previous, incoming);
  if (!result.changed) return { changed: false, editions: [], snapshot: previous };
  for (const slug of result.editions) {
    const pageUrl = BASE_URL + "/" + slug;
    const response = await verifyPage(pageUrl);
    if (!response || !response.ok ||
        (response.url && !response.url.startsWith(pageUrl)))
      throw new Error("The published Radar article is not available at its canonical URL.");
  }
  return { changed: true, editions: result.editions, snapshot: incoming };
}

async function main() {
  const previous = JSON.parse(await readFile("data/radar.json", "utf8"));
  // Check URL and publication status independently from the GitHub snapshot.
  const incoming = await publicJson(PUBLIC_FEED);
  const outcome = await synchronizeRadar(previous, incoming, (url) =>
    fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(20000) }));
  if (!outcome.changed) {
    console.log("Radar archive is already current.");
    return;
  }
  // No new edition is accepted solely from a date, source link, or draft artifact.
  await writeFile("data/radar.json", JSON.stringify(outcome.snapshot, null, 2) + "\n");
  console.log("New published Radar editions: " + outcome.editions.join(", "));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Radar archive synchronization stopped: " + error.message);
    process.exitCode = 1;
  });
}
