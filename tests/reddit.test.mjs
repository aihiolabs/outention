import test from "node:test";
import assert from "node:assert/strict";
import { createRedditAuthorizationUrl, exchangeRedditCode, fetchRedditHome, getRedditApplicationSession, searchRedditPosts } from "../src/providers/reddit.js";

const config = {
  clientId: "client", clientSecret: "secret",
  redirectUri: "http://127.0.0.1:4173/api/oauth/reddit/callback",
  userAgent: "web:com.outention.local:v0.1 (by /u/tester)"
};

test("Reddit authorization requests permanent read-only access", () => {
  const url = new URL(createRedditAuthorizationUrl(config, "state-value"));
  assert.equal(url.searchParams.get("duration"), "permanent");
  assert.equal(url.searchParams.get("state"), "state-value");
  assert.equal(url.searchParams.get("scope"), "read");
});

test("exchanges authorization code without exposing client secret in body", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    assert.match(options.headers.authorization, /^Basic /);
    assert.doesNotMatch(options.body.toString(), /secret/);
    return Response.json({ access_token: "access", refresh_token: "refresh", expires_in: 3600, scope: "read identity" });
  };
  const session = await exchangeRedditCode(config, "one-time-code");
  assert.equal(session.accessToken, "access");
  assert.equal(session.refreshToken, "refresh");
});

test("gets an application token for broad Reddit discovery without user login", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.body.get("grant_type"), "client_credentials");
    return Response.json({ access_token: "application-access", expires_in: 3600, scope: "read" });
  };
  const session = await getRedditApplicationSession({ ...config, clientId: "discovery-client" });
  assert.equal(session.accessToken, "application-access");
  assert.equal(session.refreshToken, null);
});

test("normalizes the authenticated Reddit home listing", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.match(url, /oauth\.reddit\.com\/best/);
    assert.equal(options.headers.authorization, "Bearer access");
    return Response.json({ data: { children: [{ data: {
      name: "t3_abc", author: "person", subreddit: "Finland", title: "Otsikko", selftext: "Alkuperäinen teksti",
      permalink: "/r/Finland/comments/abc/post/", created_utc: 1784451600, score: 12, num_comments: 3, over_18: false
    }}] } });
  };
  const items = await fetchRedditHome(config, { accessToken: "access" });
  assert.equal(items[0].sourceType, "reddit");
  assert.match(items[0].text, /Otsikko\n\nAlkuperäinen teksti/);
  assert.equal(items[0].author.handle, "r/Finland");
});

test("uses bounded authenticated Reddit search for intent discovery", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/search");
    assert.equal(parsed.searchParams.get("q"), "wingfoil technique");
    assert.equal(parsed.searchParams.get("limit"), "5");
    assert.equal(parsed.searchParams.get("t"), "month");
    assert.equal(options.headers.authorization, "Bearer access");
    return Response.json({ data: { children: [{ data: { name: "t3_wing", author: "rider", subreddit: "wingfoil", title: "First jibe unlocked", permalink: "/r/wingfoil/comments/wing", created_utc: 1784452800, score: 18, num_comments: 7 } }] } });
  };
  const items = await searchRedditPosts(config, { accessToken: "access" }, ["wingfoil technique"], { limitPerQuery: 5 });
  assert.equal(items[0].feedLayer, "discovery");
  assert.match(items[0].socialContext, /Reddit-haku/);
  assert.equal(items[0].author.handle, "r/wingfoil");
});
