import test from "node:test";
import assert from "node:assert/strict";
import { CONNECTOR_API_VERSION, defineConnector, validateCandidateBatch } from "../src/providers/contract.js";

const candidate = {
  id: "example:1", sourceType: "example", sourceName: "Example", feedLayer: "discovery",
  canonicalUrl: "https://example.com/posts/1",
  author: { id: "author", name: "Example Author", handle: "@example", avatar: null },
  text: "An original post", language: "en", publishedAt: "2026-07-24T12:00:00.000Z",
  indexedAt: "2026-07-24T12:01:00.000Z", engagement: { likes: 0, replies: 0, reposts: 0 },
  socialContext: null, reply: null, labels: [], media: []
};

test("defines a minimal versioned connector", () => {
  const connector = defineConnector({
    apiVersion: CONNECTOR_API_VERSION, id: "example-source", name: "Example Source",
    capabilities: ["discovery"], fetchCandidates: async () => [candidate]
  });
  assert.equal(connector.id, "example-source");
  assert.equal(Object.isFrozen(connector), true);
});

test("accepts normalized original-content candidates", () => {
  assert.deepEqual(validateCandidateBatch([candidate], "example-source"), [candidate]);
});

test("rejects incomplete or insecure candidates", () => {
  assert.throws(() => validateCandidateBatch([{ ...candidate, text: "" }], "example-source"), /text is required/);
  assert.throws(() => validateCandidateBatch([{ ...candidate, canonicalUrl: "http:\/\/example.com" }], "example-source"), /must use HTTPS/);
});
