import test from "node:test";
import assert from "node:assert/strict";
import { fetchHackerNews } from "../src/providers/hackernews.js";

test("fetches and normalizes a bounded Hacker News list", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async url => String(url).endsWith("beststories.json")
    ? Response.json([123])
    : Response.json({ id: 123, by: "pg", time: 1784462400, title: "A useful thing", url: "https://example.com", score: 42, descendants: 7, type: "story" });
  const items = await fetchHackerNews({ limit: 1 });
  assert.equal(items[0].sourceType, "hackernews");
  assert.equal(items[0].engagement.replies, 7);
  assert.equal(items[0].canonicalUrl, "https://example.com");
});
