import test from "node:test";
import assert from "node:assert/strict";
import { connectBluesky, fetchBlueskyTimeline, isBlueskyAccessTokenError, publishBlueskyPost, searchBlueskyPosts } from "../src/providers/bluesky.js";

test("connects with a Bluesky session without retaining the password", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).password, "app-pass");
    return Response.json({ accessJwt: "access", refreshJwt: "refresh", did: "did:plc:1", handle: "me.bsky.social" });
  };
  const session = await connectBluesky({ identifier: "me.bsky.social", password: "app-pass" });
  assert.equal(session.handle, "me.bsky.social");
  assert.equal("password" in session, false);
});

test("publishes a standard AT Protocol Bluesky post", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://pds.example/xrpc/com.atproto.repo.createRecord");
    assert.equal(options.headers.authorization, "Bearer access");
    const body = JSON.parse(options.body);
    assert.equal(body.repo, "did:plc:me");
    assert.equal(body.collection, "app.bsky.feed.post");
    assert.equal(body.record.text, "Hello from Curamator");
    return Response.json({ uri: "at://did:plc:me/app.bsky.feed.post/abc" });
  };
  const result = await publishBlueskyPost(
    { pds: "https://pds.example", accessJwt: "access", did: "did:plc:me", handle: "me.example" },
    { text: "Hello from Curamator", createdAt: "2026-07-20T10:00:00Z" }
  );
  assert.equal(result.destination, "bluesky");
  assert.equal(result.url, "https://bsky.app/profile/me.example/post/abc");
});

test("normalizes the authenticated home timeline to original content items", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.authorization, "Bearer access");
    return Response.json({ feed: [{ post: {
      uri: "at://did:plc:author/app.bsky.feed.post/abc", indexedAt: "2026-07-19T10:00:00Z",
      author: { did: "did:plc:author", handle: "author.fi", displayName: "Author" },
      record: { text: "Alkuperäinen postaus", createdAt: "2026-07-19T09:59:00Z", langs: ["fi"] },
      likeCount: 2, replyCount: 1, repostCount: 0
    }}] });
  };
  const items = await fetchBlueskyTimeline({ pds: "https://bsky.social", accessJwt: "access" });
  assert.equal(items[0].text, "Alkuperäinen postaus");
  assert.match(items[0].canonicalUrl, /author\.fi\/post\/abc$/);
  assert.equal(items[0].feedLayer, "personal");
});

test("recognizes Bluesky's HTTP 400 ExpiredToken response for automatic refresh", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json(
    { error: "ExpiredToken", message: "Token has expired" },
    { status: 400 }
  );
  await assert.rejects(
    fetchBlueskyTimeline({ pds: "https://bsky.social", accessJwt: "expired" }),
    error => error.status === 400
      && error.providerCode === "ExpiredToken"
      && isBlueskyAccessTokenError(error)
  );
});

test("discovers Bluesky posts outside the home feed with bounded queries", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "public.api.bsky.app");
    assert.equal(parsed.searchParams.get("q"), "wingfoil");
    return Response.json({ posts: [{ uri: "at://did:plc:w/app.bsky.feed.post/wing", indexedAt: "2026-07-19T10:00:00Z", author: { did: "did:plc:w", handle: "wing.bsky.social" }, record: { text: "Wingfoil session", createdAt: "2026-07-19T10:00:00Z" } }] });
  };
  const items = await searchBlueskyPosts(["wingfoil"], { limitPerQuery: 5 });
  assert.equal(items[0].feedLayer, "discovery");
  assert.match(items[0].socialContext, /wingfoil/);
});

test("normalizes Bluesky video and external embeds for inline rendering", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ feed: [{ post: {
    uri: "at://did:plc:author/app.bsky.feed.post/media", indexedAt: "2026-07-19T10:00:00Z",
    author: { did: "did:plc:author", handle: "author.test" },
    record: { text: "Video", createdAt: "2026-07-19T10:00:00Z", langs: ["en"] },
    embed: { media: { $type: "app.bsky.embed.video#view", playlist: "https://video.bsky.app/watch/test.m3u8", thumbnail: "https://video.bsky.app/thumb.jpg" }, external: { uri: "https://example.com/story", title: "Story", description: "Original link" } }
  }}] });
  const [item] = await fetchBlueskyTimeline({ pds: "https://bsky.social", accessJwt: "access" });
  assert.deepEqual(item.media.map(media => media.type), ["video", "link"]);
});

test("normalizes quoted Bluesky posts for inline context", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ feed: [{ post: {
    uri: "at://did:plc:a/app.bsky.feed.post/outer", indexedAt: "2026-07-19T10:00:00Z",
    author: { did: "did:plc:a", handle: "a.test" }, record: { text: "Katso tämä", createdAt: "2026-07-19T10:00:00Z" },
    embed: { record: { uri: "at://did:plc:b/app.bsky.feed.post/inner", author: { handle: "b.test", displayName: "B" }, value: { text: "Lainattu alkuperäinen ajatus" } } }
  }}] });
  const [item] = await fetchBlueskyTimeline({ pds: "https://bsky.social", accessJwt: "access" });
  assert.equal(item.media[0].type, "quote");
  assert.match(item.media[0].url, /b\.test\/post\/inner$/);
});
