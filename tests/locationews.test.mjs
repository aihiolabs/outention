import test from "node:test";
import assert from "node:assert/strict";
import { fetchLocationewsStories, matchMunicipality, resolveLocationewsContext, shouldResolveLocationContext } from "../src/providers/locationews.js";

const municipalities = [
  { kuntakoodi: "091", name: "Helsinki" },
  { kuntakoodi: "686", name: "Rautalampi" },
  { kuntakoodi: "491", name: "Mikkeli" }
];

test("only resolves municipality infrastructure for location-shaped context", () => {
  assert.equal(shouldResolveLocationContext("Thoughtful software discussions"), false);
  assert.equal(shouldResolveLocationContext("Ideas from practitioners"), false);
  assert.equal(shouldResolveLocationContext("uutisia Rautalammista"), true);
  assert.equal(shouldResolveLocationContext("Local news from Brooklyn"), true);
  assert.equal(shouldResolveLocationContext("What is happening near me?"), true);
  assert.equal(shouldResolveLocationContext("calm updates", "Asun Tampereella"), true);
});

test("resolves Finnish inflected municipality names from natural language", () => {
  assert.deepEqual(matchMunicipality("Haluaisin uutisia Rautalammista", municipalities), { kuntakoodi: "686", name: "Rautalampi" });
  assert.deepEqual(matchMunicipality("Asun Rautalammilla ja seuraan luontoa", municipalities), { kuntakoodi: "686", name: "Rautalampi" });
  assert.deepEqual(matchMunicipality("Mitä Helsingissä tapahtuu?", municipalities), { kuntakoodi: "091", name: "Helsinki" });
  assert.equal(matchMunicipality("Pidän wingfoilista", municipalities), null);
});

test("loads Locationews municipality catalog for context resolution", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async url => {
    assert.equal(String(url), "https://catalog.example/api/kunnat");
    return Response.json(municipalities);
  };
  assert.deepEqual(await resolveLocationewsContext("uutisia Rautalammista", { baseUrl: "https://catalog.example" }), { kuntakoodi: "686", name: "Rautalampi" });
});

test("normalizes Locationews stories to feed candidates", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async url => {
    assert.match(String(url), /^https:\/\/locationews\.com\/api\/feed\?limit=15$/);
    return Response.json({ mode: "latest", stories: [{
      id: "9ba3cd54", slug: "koirapuisto-avattiin-abc123",
      title: "Koirapuisto avattiin", lead: "Uusi koirapuisto avattiin keskustaan.",
      publishedAt: "2026-07-19T18:30:00.000Z", sourceType: "auto", aiGenerated: true,
      heroImage: "https://example.com/kuva.jpg", kuntaName: "Mikkeli", kuntakoodi: "491",
      topicName: null, sourceName: "Mikkelin kaupunki", sourceKind: "kunta"
    }] });
  };
  const items = await fetchLocationewsStories({ limit: 15 });
  assert.equal(items[0].id, "locationews:9ba3cd54");
  assert.equal(items[0].sourceType, "locationews");
  assert.equal(items[0].canonicalUrl, "https://locationews.com/uutiset/koirapuisto-avattiin-abc123");
  assert.equal(items[0].author.name, "Mikkelin kaupunki");
  assert.match(items[0].text, /^Koirapuisto avattiin\n\n/);
  assert.equal(items[0].media[0].thumbnailUrl, "https://example.com/kuva.jpg");
});

test("passes kunta and topic filters and surfaces API errors", async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async url => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("kunta"), "491");
    assert.equal(parsed.searchParams.get("topic"), "liikenne");
    return Response.json({ error: "sisäinen virhe" }, { status: 500 });
  };
  await assert.rejects(
    fetchLocationewsStories({ kunta: "491", topic: "liikenne" }),
    error => error.status === 500
  );
});
