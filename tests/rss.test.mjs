import test from "node:test";
import assert from "node:assert/strict";
import { fetchRssFeed, normalizeFeedConnection, parseOpmlFeeds } from "../src/providers/rss.js";

test("normalizes a YouTube Atom channel feed", async t => {
  const fetchImpl = async () => new Response(`<?xml version="1.0"?><feed><title>Testikanava</title><entry><id>yt:video:abc</id><title>Uusi video</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc"/><author><name>Tekijä</name></author><published>2026-07-19T12:00:00Z</published><media:group><media:description>Kuvaus</media:description><media:thumbnail url="https://i.ytimg.com/vi/abc/hqdefault.jpg"/></media:group></entry></feed>`, { headers: { "content-type": "application/atom+xml" } });
  const items = await fetchRssFeed({ url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC123", name: "Testikanava" }, { network: { fetchImpl, resolveHost: async () => [{ address: "142.250.74.110" }] } });
  assert.equal(items[0].sourceType, "youtube");
  assert.equal(items[0].canonicalUrl, "https://www.youtube.com/watch?v=abc");
  assert.equal(items[0].author.name, "Tekijä");
  assert.equal(items[0].media[0].type, "video");
});

test("rejects local feed targets", () => {
  assert.throws(() => normalizeFeedConnection({ url: "http://localhost:3000/feed" }), error => error.status === 400);
  assert.throws(() => normalizeFeedConnection({ url: "https://192.168.1.2/feed" }), error => error.status === 400);
});

test("imports a bounded, deduplicated OPML subscription list", () => {
  const feeds = parseOpmlFeeds(`<?xml version="1.0"?><opml version="2.0"><body>
    <outline text="Example &amp; News" xmlUrl="https://example.com/feed.xml" />
    <outline text="Duplicate" xmlUrl="https://example.com/feed.xml" />
    <outline text="Private" xmlUrl="http://localhost/feed" />
  </body></opml>`);
  assert.deepEqual(feeds, [{ name: "Example & News", url: "https://example.com/feed.xml" }]);
});

test("does not expose active or private URLs supplied by an untrusted feed", async () => {
  const fetchImpl = async () => new Response(`<?xml version="1.0"?><rss><channel><title>Unsafe</title><item><guid>x</guid><title>Post</title><link>javascript:alert(1)</link><enclosure url="https://127.0.0.1/private.png" /></item></channel></rss>`);
  const items = await fetchRssFeed({ url: "https://feed.example/rss" }, { network: { fetchImpl, resolveHost: async () => [{ address: "8.8.8.8" }] } });
  assert.equal(items[0].canonicalUrl, "https://feed.example/rss");
  assert.equal(items[0].media[0].url, "https://feed.example/rss");
});
