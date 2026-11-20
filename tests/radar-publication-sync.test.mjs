import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  checkPublishedFeed, synchronizeRadar, validatePublicUrl,
} from "../scripts/sync-published-radar.mjs";
import {
  editionMarker, discussionBody, alreadyAnnounced,
  unannouncedEditions, readDiscussionState,
} from "../scripts/publish-radar-discussions.mjs";

const previous = JSON.parse(readFileSync(new URL("../data/radar.json", import.meta.url), "utf8"));
function newEdition() {
  return {
    number: 6,
    week: "2026-W48",
    slug: "china-dev-radar-006-2026-w48",
    title: "China Dev Radar #006: Example published developments",
    title_zh: "中国开发者技术雷达 #006：示例技术进展",
    introduction: "A synthetic description of published changes.",
    introduction_zh: "仅供测试的中文技术摘要。",
    publication_date: "2026-11-27",
    items: [{
      title: "Synthetic engineering release",
      title_zh: "用于测试的工程技术发布",
      summary: "A synthetic summary used only for testing.",
      summary_zh: "仅供测试的中文摘要。",
      section: "featured",
      original_publication_date: "2026-11-26",
      related_profile: "/projects/example",
      sources: [{ label: "Original release", url: "https://example.org/release/v2" }],
    }],
  };
}
const next = () => ({
  ...previous, snapshot_date: "2026-11-27",
  editions: [newEdition(), ...previous.editions],
});

test("a current published snapshot creates no update", () => {
  assert.deepEqual(checkPublishedFeed(previous, previous), { changed: false, editions: [] });
});
test("only a new numbered published edition advances the archive", () => {
  assert.deepEqual(checkPublishedFeed(previous, next()), {
    changed: true, editions: ["china-dev-radar-006-2026-w48"],
  });
});
test("historical changes, disappearing editions and numbering gaps stop sync", () => {
  const changed = next();
  changed.editions[2] = { ...changed.editions[2], title: "Changed published headline" };
  assert.throws(() => checkPublishedFeed(previous, changed), /content changed/);
  assert.throws(() => checkPublishedFeed(previous, {
    ...next(), editions: [newEdition(), ...previous.editions.slice(0, 4)],
  }), /disappeared/);
  assert.throws(() => checkPublishedFeed(previous, {
    ...next(), editions: [{ ...newEdition(), number: 7, slug: "china-dev-radar-007-2026-w48" }, ...previous.editions],
  }), /numbering/);
});
test("official sources cannot contain credential URLs or local addresses", () => {
  for (const url of ["https://alice:pw@example.org/item", "file:///tmp/item",
    "https://localhost/item", "https://example.org/item?secret=yes"])
    assert.throws(() => validatePublicUrl(url), /Unsafe/);
});
test("new editions require a reachable published website article", async () => {
  const ok = await synchronizeRadar(previous, next(), async (url) => ({ ok: true, url }));
  assert.equal(ok.changed, true);
  assert.equal(ok.editions.length, 1);
  await assert.rejects(synchronizeRadar(previous, next(), async () => ({ ok: false })),
    /not available/);
  await assert.rejects(synchronizeRadar(previous, next(), async () => ({
    ok: true, url: "https://example.org/radar/fake",
  })), /not available/);
});

test("announcements are derived from public copy, not editorial worksheets", () => {
  const e = newEdition();
  const body = discussionBody(e);
  assert.ok(body.includes(e.introduction));
  assert.ok(body.includes(e.introduction_zh));
  assert.ok(body.includes(e.items[0].title_zh));
  assert.ok(body.includes("/zh/radar/" + e.slug));
  assert.ok(body.includes("/blob/main/RADAR.zh-CN.md"));
  assert.ok(body.includes("https://example.org/release/v2"));
  assert.ok(body.includes("https://www.zhongguo.dev/radar/" + e.slug));
  assert.ok(body.includes(editionMarker(e)));
  assert.equal(alreadyAnnounced(e, [{ title: "Existing", body }]), true);
  assert.equal(alreadyAnnounced(e, [{ title: e.title, body: "" }]), true);
  assert.equal(alreadyAnnounced(e, []), false);
});
test("historical five editions are excluded and previously posted editions are skipped", () => {
  assert.deepEqual(unannouncedEditions(previous, previous, []), []);
  assert.deepEqual(unannouncedEditions(next(), next(), []).map((e) => e.number), [6]);
  assert.deepEqual(unannouncedEditions(next(), next(), [
    { title: newEdition().title, body: editionMarker(newEdition()) },
  ]), []);
  assert.throws(() => unannouncedEditions(next(), previous, []), /not confirmed/);
});
test("discussion category and history must be fully readable before posting", async () => {
  const state = await readDiscussionState("fixture", async (_token, query) => {
    if (query.includes("discussionCategories")) return {
      repository: { id: "repo-id", discussionCategories: {
        pageInfo: { hasNextPage: false },
        nodes: [{ id: "cat-id", name: "China Dev Radar" }],
      } },
    };
    return { repository: { discussions: {
      nodes: [{ id: "post-id", title: "Existing", body: "Text" }],
      pageInfo: { hasNextPage: false, endCursor: null },
    } } };
  });
  assert.deepEqual(state, {
    repositoryId: "repo-id", categoryId: "cat-id",
    discussions: [{ id: "post-id", title: "Existing", body: "Text" }],
  });
  await assert.rejects(readDiscussionState("fixture", async () => ({
    repository: { id: "repo-id", discussionCategories: {
      pageInfo: { hasNextPage: false }, nodes: [],
    } },
  })), /must exist exactly once/);
});

test("missing Chinese copy stops synchronization and announcements", () => {
  const bad = next();
  bad.editions[0] = { ...bad.editions[0], introduction_zh: "" };
  assert.throws(() => checkPublishedFeed(previous, bad), /Chinese|published Radar edition/);
  assert.throws(() => discussionBody(bad.editions[0]), /Incomplete published bilingual edition/);
});
