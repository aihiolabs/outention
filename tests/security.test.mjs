import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicHostname, fetchPublicUrl, mutationAllowed, safeEqualSecret, SlidingWindowLimiter } from "../src/security.js";

test("compares access codes without accepting length or value mismatches", () => {
  assert.equal(safeEqualSecret("friend-code", "friend-code"), true);
  assert.equal(safeEqualSecret("friend", "friend-code"), false);
  assert.equal(safeEqualSecret("wrong-code!", "friend-code"), false);
});

test("sliding limiter rejects requests above the window allowance", () => {
  const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: 1000 });
  assert.equal(limiter.consume("a", 1000).allowed, true);
  assert.equal(limiter.consume("a", 1100).allowed, true);
  assert.equal(limiter.consume("a", 1200).allowed, false);
  assert.equal(limiter.consume("a", 2101).allowed, true);
});

test("rejects hostnames resolving to private networks", async () => {
  await assert.rejects(assertPublicHostname("feed.example", async () => [{ address: "10.0.0.4" }]), error => error.status === 400);
  await assert.doesNotReject(assertPublicHostname("feed.example", async () => [{ address: "8.8.8.8" }]));
});

test("revalidates redirect destinations before fetching", async () => {
  const fetched = [];
  const fetchImpl = async url => {
    fetched.push(String(url));
    return new Response(null, { status: 302, headers: { location: "https://internal.example/feed" } });
  };
  await assert.rejects(fetchPublicUrl("https://public.example/feed", {}, {
    fetchImpl,
    resolveHost: async hostname => [{ address: hostname === "public.example" ? "8.8.8.8" : "192.168.1.4" }]
  }), error => error.status === 400);
  assert.deepEqual(fetched, ["https://public.example/feed"]);
});

test("mutation guard requires the app header and configured origin", () => {
  const request = { headers: { "x-outention-request": "1", origin: "https://example.com" } };
  assert.equal(mutationAllowed(request, "https://example.com"), true);
  assert.equal(mutationAllowed(request, "https://other.example"), false);
  assert.equal(mutationAllowed({ headers: { origin: "https://example.com" } }, "https://example.com"), false);
});
