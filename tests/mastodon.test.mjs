import test from "node:test";
import assert from "node:assert/strict";
import { createMastodonAuthorization, fetchMastodonHashtags, fetchMastodonHome, publishMastodonStatus } from "../src/providers/mastodon.js";

test("registers a Mastodon app with timeline read and status-only write scopes", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://mastodon.social/api/v1/apps");
    assert.equal(options.method, "POST");
    assert.match(options.body.get("scopes"), /read:statuses/);
    assert.match(options.body.get("scopes"), /write:statuses/);
    assert.doesNotMatch(options.body.get("scopes"), /write:accounts|write:follows|follow/);
    return Response.json({ client_id: "client", client_secret: "secret" });
  };
  const result = await createMastodonAuthorization({ instance: "mastodon.social", redirectUri: "http://127.0.0.1/callback", state: "csrf", network: { resolveHost: async () => [{ address: "8.8.8.8" }] } });
  const url = new URL(result.authorizationUrl);
  assert.equal(url.searchParams.get("state"), "csrf");
  assert.equal(result.instance, "https://mastodon.social");
});

test("publishes a public status with the connected Mastodon token", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://example.social/api/v1/statuses");
    assert.equal(options.headers.authorization, "Bearer token");
    assert.equal(options.body.get("status"), "Alkuperäinen ajatus");
    assert.equal(options.body.get("visibility"), "public");
    return Response.json({ id: "123", url: "https://example.social/@me/123" });
  };
  const result = await publishMastodonStatus(
    { instance: "https://example.social", accessToken: "token" },
    { text: "Alkuperäinen ajatus", network: { resolveHost: async () => [{ address: "8.8.8.8" }] } }
  );
  assert.equal(result.destination, "mastodon");
  assert.match(result.url, /\/123$/);
});

test("normalizes original and boosted Mastodon statuses", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.authorization, "Bearer access");
    return Response.json([{ id: "1", url: "https://example.social/@a/1", uri: "tag:1", created_at: "2026-07-19T12:00:00Z", content: "<p>Hei <strong>maailma</strong></p>", favourites_count: 2, replies_count: 1, reblogs_count: 3, account: { id: "a", acct: "a@example.social", username: "a", display_name: "A", avatar_static: "https://example.social/a.png" }, media_attachments: [] }]);
  };
  const items = await fetchMastodonHome({ instance: "https://example.social", accessToken: "access" }, { network: { resolveHost: async () => [{ address: "8.8.8.8" }] } });
  assert.equal(items[0].sourceType, "mastodon");
  assert.equal(items[0].text, "Hei maailma");
  assert.equal(items[0].author.handle, "@a@example.social");
});

test("uses public Mastodon hashtag timelines for discovery", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async url => {
    assert.match(url, /\/api\/v1\/timelines\/tag\/wingfoil\?limit=5$/);
    return Response.json([{ id: "2", url: "https://mastodon.social/@w/2", uri: "tag:2", created_at: "2026-07-19T12:00:00Z", content: "<p>#wingfoil day</p>", account: { id: "w", acct: "w", username: "w", display_name: "W" }, media_attachments: [] }]);
  };
  const items = await fetchMastodonHashtags(["wingfoil"], { limitPerTag: 5, network: { resolveHost: async () => [{ address: "8.8.8.8" }] } });
  assert.equal(items[0].feedLayer, "discovery");
  assert.equal(items[0].sourceType, "mastodon");
});
