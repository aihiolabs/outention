import test from "node:test";
import assert from "node:assert/strict";
import { createThreadsAuthorizationUrl, exchangeThreadsCode, searchThreadsPosts, threadsConfigured } from "../src/providers/threads.js";

const config = {
  appId: "threads-app", appSecret: "threads-secret",
  redirectUri: "http://127.0.0.1:4173/api/oauth/threads/callback"
};

test("Threads discovery configuration requires the complete OAuth application", () => {
  assert.equal(threadsConfigured(config), true);
  assert.equal(threadsConfigured({ appId: "threads-app" }), false);
});

test("Threads authorization requests only basic and keyword-search permissions", () => {
  const url = new URL(createThreadsAuthorizationUrl(config, "state-value"));
  assert.equal(url.hostname, "threads.net");
  assert.equal(url.searchParams.get("state"), "state-value");
  assert.equal(url.searchParams.get("scope"), "threads_basic,threads_keyword_search");
});

test("exchanges a Threads code, upgrades the token and reads the profile", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("/oauth/access_token")) return Response.json({ access_token: "short", user_id: "u1" });
    if (String(url).includes("/access_token")) {
      assert.equal(options.headers.authorization, "Bearer short");
      return Response.json({ access_token: "long", expires_in: 5_184_000 });
    }
    assert.equal(options.headers.authorization, "Bearer long");
    return Response.json({ id: "u1", username: "listener", name: "Listener" });
  };
  const session = await exchangeThreadsCode(config, "one-time-code");
  assert.equal(session.accessToken, "long");
  assert.equal(session.username, "listener");
  assert.equal(requests.length, 3);
});

test("searches Threads with bounded OAuth discovery and normalizes original posts", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://graph.threads.net");
    assert.equal(parsed.pathname, "/keyword_search");
    assert.equal(parsed.searchParams.get("q"), "independent AI tools");
    assert.equal(parsed.searchParams.get("search_type"), "RECENT");
    assert.equal(parsed.searchParams.get("limit"), "12");
    assert.equal(options.headers.authorization, "Bearer access");
    return Response.json({ data: [{
      id: "post-1", username: "maker", text: "A small open-source feed experiment",
      permalink: "https://www.threads.net/@maker/post/example", timestamp: "2026-07-25T10:00:00Z",
      media_type: "IMAGE", media_url: "https://cdn.example/image.jpg", profile_picture_url: "https://cdn.example/avatar.jpg"
    }] });
  };
  const [item] = await searchThreadsPosts({ accessToken: "access" }, ["independent AI tools"], { limitPerQuery: 12 });
  assert.equal(item.sourceType, "threads");
  assert.equal(item.feedLayer, "discovery");
  assert.equal(item.author.handle, "@maker");
  assert.equal(item.media[0].type, "image");
  assert.match(item.socialContext, /independent AI tools/);
});
