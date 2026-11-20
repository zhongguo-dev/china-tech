import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const OWNER = "zhongguo-dev";
export const REPO = "china-tech";
export const CATEGORY_NAME = "China Dev Radar";
export const PREVIOUSLY_ARCHIVED_NUMBER = 5;
export const FEED_URL = "https://www.zhongguo.dev/api/radar/public-archive";
const SOURCE = "https://www.zhongguo.dev/radar";
const GRAPHQL_URL = "https://api.github.com/graphql";

export function editionMarker(edition) {
  if (!/^china-dev-radar-\d{3}-\d{4}-w\d{2}$/.test(edition.slug))
    throw new Error("Invalid Radar edition slug.");
  return "<!-- china-dev-radar-edition:" + edition.slug + " -->";
}

export function discussionBody(edition) {
  const canonical = SOURCE + "/" + edition.slug;
  const lines = [
    "A newly published [China Dev Radar](" + SOURCE + ") briefing from Zhongguo.dev.",
    "",
    "**" + edition.week + " · Published " + edition.publication_date + "**",
    "",
    edition.introduction.trim(),
    "",
    "### In this edition",
    "",
  ];
  for (const item of edition.items) {
    if (!item.title?.trim() || !item.sources?.length)
      throw new Error("Incomplete published Radar item.");
    const firstSource = item.sources[0];
    if (!firstSource?.url || !/^https?:\/\//.test(firstSource.url))
      throw new Error("Radar item has no public original source.");
    const safeTitle = item.title.trim().replace(/\r?\n/g, " ");
    const url = firstSource.url.replace(/\(/g, "%28").replace(/\)/g, "%29");
    lines.push("- **" + safeTitle + "** ([original source](" + url + "))");
  }
  lines.push(
    "",
    "**[Read the complete bilingual edition](" + canonical + ")**",
    "",
    "[Browse the GitHub Radar archive](https://github.com/" + OWNER + "/" +
      REPO + "/blob/main/RADAR.md) · " +
      "[Suggest a development](https://github.com/" + OWNER + "/" + REPO +
      "/issues/new?template=suggest-radar-development.yml)",
    "",
    "Coverage is provided for technical discovery and does not imply endorsement. " +
      "Original release dates and additional sources are preserved in the full edition.",
    "",
    editionMarker(edition),
  );
  return lines.join("\n");
}

export function alreadyAnnounced(edition, discussions) {
  const marker = editionMarker(edition);
  const canonical = SOURCE + "/" + edition.slug;
  const number = "#" + String(edition.number).padStart(3, "0");
  return discussions.some((discussion) =>
    discussion.body?.includes(marker) ||
    discussion.body?.includes(canonical) ||
    (typeof discussion.title === "string" &&
      discussion.title.includes("China Dev Radar " + number)),
  );
}

export function unannouncedEditions(snapshot, publishedFeed, discussions) {
  if (!snapshot || !publishedFeed ||
      !Array.isArray(snapshot.editions) || !Array.isArray(publishedFeed.editions))
    throw new Error("Missing Radar publication snapshots.");
  const published = new Map(publishedFeed.editions.map((e) => [e.slug, e]));
  return snapshot.editions
    .filter((e) => e.number > PREVIOUSLY_ARCHIVED_NUMBER)
    .sort((a, b) => a.number - b.number)
    .filter((e) => {
      const actual = published.get(e.slug);
      if (!actual || JSON.stringify(actual) !== JSON.stringify(e))
        throw new Error("Radar edition not confirmed by the public publication feed.");
      return !alreadyAnnounced(e, discussions);
    });
}

async function githubGraphQL(token, query, variables, fetcher = fetch) {
  const r = await fetcher(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error("GitHub Discussions request failed (HTTP " + r.status + ").");
  const answer = await r.json();
  if (answer.errors?.length || !answer.data)
    throw new Error("GitHub Discussions returned an error.");
  return answer.data;
}

const PROJECT = [
  "query($owner:String!,$repo:String!) {",
  " repository(owner:$owner,name:$repo) {",
  "  id",
  "  discussionCategories(first:100) { pageInfo { hasNextPage } nodes { id name } }",
  " }",
  "}",
].join("\n");
const DISCUSSIONS = [
  "query($owner:String!,$repo:String!,$after:String) {",
  " repository(owner:$owner,name:$repo) {",
  "  discussions(first:100,after:$after) {",
  "   pageInfo { hasNextPage endCursor }",
  "   nodes { id title body }",
  "  }",
  " }",
  "}",
].join("\n");
const CREATE = [
  "mutation($repositoryId:ID!,$categoryId:ID!,$title:String!,$body:String!) {",
  " createDiscussion(input:{",
  "  repositoryId:$repositoryId,categoryId:$categoryId,title:$title,body:$body",
  " }) { discussion { url id } }",
  "}",
].join("\n");

export async function readDiscussionState(token, request = githubGraphQL) {
  const variables = { owner: OWNER, repo: REPO };
  const result = await request(token, PROJECT, variables);
  const repository = result.repository;
  if (!repository?.id) throw new Error("GitHub repository not available.");
  if (repository.discussionCategories?.pageInfo?.hasNextPage)
    throw new Error("Discussion categories require complete review.");
  const matches = (repository.discussionCategories?.nodes || [])
    .filter((c) => c.name === CATEGORY_NAME);
  if (matches.length !== 1)
    throw new Error("China Dev Radar announcement category must exist exactly once.");
  const discussions = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const response = await request(token, DISCUSSIONS, { ...variables, after: cursor });
    const connection = response.repository?.discussions;
    if (!connection?.nodes || !connection.pageInfo)
      throw new Error("GitHub Discussion history could not be verified.");
    discussions.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage)
      return { repositoryId: repository.id, categoryId: matches[0].id, discussions };
    if (!connection.pageInfo.endCursor || connection.pageInfo.endCursor === cursor)
      throw new Error("Incomplete GitHub Discussion pagination.");
    cursor = connection.pageInfo.endCursor;
  }
  throw new Error("Discussion history exceeded pagination limit.");
}

async function main() {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("GitHub Actions token is required.");
  const snapshot = JSON.parse(await readFile("data/radar.json", "utf8"));
  const response = await fetch(FEED_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
    throw new Error("Published Radar feed could not be verified.");
  const publishedFeed = await response.json();
  const state = await readDiscussionState(token);
  const pending = unannouncedEditions(snapshot, publishedFeed, state.discussions);
  for (const edition of pending) {
    // Recheck after every post so a rerun cannot silently duplicate an edition.
    const latest = await readDiscussionState(token);
    if (alreadyAnnounced(edition, latest.discussions)) continue;
    const title = edition.title.trim() + " | " + edition.week;
    const body = discussionBody(edition);
    const result = await githubGraphQL(token, CREATE, {
      repositoryId: latest.repositoryId,
      categoryId: latest.categoryId,
      title,
      body,
    });
    const url = result.createDiscussion?.discussion?.url;
    if (!url) throw new Error("Discussion creation was not confirmed.");
    console.log("Published Radar Discussion: " + url);
  }
  if (!pending.length) console.log("No new published Radar Discussions.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Radar Discussion publication stopped: " + error.message);
    process.exitCode = 1;
  });
}
