import test from "node:test";
import assert from "node:assert/strict";
import { filterCandidatesByOriginScope, filterCandidatesByRequiredSources, filterCandidatesBySelectionMode, rankEvaluatedCandidates, selectCandidatePool, summarizeRankingQuality, triageCandidates } from "../src/curator/ranker.js";

const candidate = (id, layer, author, sourceType = "bluesky") => ({ id, sourceType, feedLayer: layer, publishedAt: new Date().toISOString(), author: { id: author, handle: author }, engagement: {} });
const signal = id => ({ id, semantic_score: 80, tone_score: 70, core_match: true, hard_excluded: false, reasons: ["Osuva"] });
const baseProgram = { selection_mode: "topical", origin_scope: "any", weights: { relevance: 30, tone: 10, freshness: 10, social: 50, engagement: 0 }, horizon_hours: 72, familiarity_target: 100, diversity: { max_per_author: 2 } };

test("reranks the same candidates between familiar and discovery without a model", () => {
  const candidates = [candidate("home", "personal", "a"), candidate("new", "discovery", "b")];
  const evaluated = [signal("home"), signal("new")];
  const familiar = rankEvaluatedCandidates({ candidates, evaluated, program: baseProgram });
  const discovery = rankEvaluatedCandidates({ candidates, evaluated, program: { ...baseProgram, familiarity_target: 0 } });
  assert.equal(familiar[0].id, "home");
  assert.equal(discovery[0].id, "new");
});

test("enforces author diversity and hard exclusions", () => {
  const candidates = [candidate("a1", "personal", "a"), candidate("a2", "personal", "a"), candidate("b1", "personal", "b")];
  const evaluated = [signal("a1"), signal("a2"), { ...signal("b1"), hard_excluded: true }];
  const ranked = rankEvaluatedCandidates({ candidates, evaluated, program: { ...baseProgram, diversity: { max_per_author: 1 } } });
  assert.equal(ranked.length, 1);
  assert.ok(["a1", "a2"].includes(ranked[0].id));
});

test("does not fill a topical feed with semantically unrelated candidates", () => {
  const candidates = [candidate("relevant", "discovery", "a"), candidate("fresh-but-unrelated", "discovery", "b", "locationews")];
  const evaluated = [signal("relevant"), { ...signal("fresh-but-unrelated"), semantic_score: 5 }];
  const ranked = rankEvaluatedCandidates({ candidates, evaluated, program: baseProgram });
  assert.deepEqual(ranked.map(item => item.id), ["relevant"]);
});

test("requires meaningful relevance for topical feeds", () => {
  const candidates = [candidate("weak", "discovery", "a"), candidate("borderline", "discovery", "b"), candidate("useful", "discovery", "c")];
  const evaluated = [{ ...signal("weak"), semantic_score: 35 }, { ...signal("borderline"), semantic_score: 45 }, { ...signal("useful"), semantic_score: 60 }];
  const ranked = rankEvaluatedCandidates({ candidates, evaluated, program: baseProgram });
  assert.deepEqual(ranked.map(item => item.id), ["useful"]);
});

test("rejects a high-scoring candidate that misses the request core", () => {
  const candidates = [candidate("wrong-form", "discovery", "a")];
  const evaluated = [{ ...signal("wrong-form"), semantic_score: 95, core_match: false }];
  assert.deepEqual(rankEvaluatedCandidates({ candidates, evaluated, program: baseProgram }), []);
});

test("keeps broad personal updates even without topical relevance", () => {
  const candidates = [
    ...Array.from({ length: 8 }, (_, index) => candidate(`friend-${index}`, "personal", `friend-${index}`)),
    candidate("hacker-news", "discovery", "hn", "hackernews")
  ];
  const evaluated = candidates.map(item => ({ ...signal(item.id), semantic_score: 5 }));
  const ranked = rankEvaluatedCandidates({ candidates, evaluated, program: { ...baseProgram, selection_mode: "broad_personal" } });
  assert.equal(ranked.length, 8);
  assert.equal(ranked.some(item => item.id === "hacker-news"), false);
});

test("broad personal deterministically excludes non-personal layers", () => {
  const candidates = [candidate("friend", "personal", "friend"), candidate("news", "discovery", "news", "hackernews")];
  assert.deepEqual(filterCandidatesBySelectionMode(candidates, "broad_personal").map(item => item.id), ["friend"]);
  assert.deepEqual(filterCandidatesBySelectionMode(candidates, "broad_discovery").map(item => item.id), ["friend", "news"]);
  assert.deepEqual(filterCandidatesBySelectionMode(candidates, "topical").map(item => item.id), ["friend", "news"]);
});

test("explicit source constraints distinguish Yle RSS from generic RSS", () => {
  const candidates = [
    { ...candidate("yle", "discovery", "yle", "rss"), sourceName: "Yle Uutiset" },
    { ...candidate("blog", "discovery", "blog", "rss"), sourceName: "Personal blog" },
    candidate("hn", "discovery", "hn", "hackernews")
  ];
  assert.deepEqual(filterCandidatesByRequiredSources(candidates, ["yle"]).map(item => item.id), ["yle"]);
  assert.deepEqual(filterCandidatesByRequiredSources(candidates, ["hackernews"]).map(item => item.id), ["hn"]);
});

test("origin scope can require posts from people instead of editorial feeds", () => {
  const candidates = [
    candidate("person", "discovery", "person", "mastodon"),
    candidate("news", "discovery", "news", "locationews"),
    candidate("hn", "discovery", "hn", "hackernews")
  ];
  assert.deepEqual(filterCandidatesByOriginScope(candidates, "people").map(item => item.id), ["person"]);
  assert.deepEqual(filterCandidatesByOriginScope(candidates, "publishers").map(item => item.id), ["news", "hn"]);
});

test("a custom personal-feed connector counts as people regardless of source id", () => {
  const custom = candidate("custom-friend", "personal", "friend", "my-network");
  assert.deepEqual(filterCandidatesByOriginScope([custom], "people").map(item => item.id), ["custom-friend"]);
  assert.deepEqual(filterCandidatesByOriginScope([custom], "publishers"), []);
});

test("prevents one platform from swallowing the first page when alternatives exist", () => {
  const dominant = Array.from({ length: 12 }, (_, index) => candidate(`l${index}`, "discovery", `la${index}`, "locationews"));
  const alternatives = Array.from({ length: 6 }, (_, index) => candidate(`b${index}`, "discovery", `ba${index}`, "bluesky"));
  const candidates = [...dominant, ...alternatives];
  const evaluated = candidates.map((item, index) => ({ ...signal(item.id), semantic_score: index < dominant.length ? 95 : 70 }));
  const ranked = rankEvaluatedCandidates({ candidates, evaluated, program: baseProgram, limit: 10 });
  const sources = ranked.map(result => candidates.find(item => item.id === result.id).sourceType);
  assert.ok(sources.includes("bluesky"));
  assert.ok(sources.filter(source => source === "locationews").length <= 7);
});

test("builds a bounded candidate pool from the familiarity control", () => {
  const candidates = [
    ...Array.from({ length: 80 }, (_, index) => candidate(`p${index}`, "personal", `pa${index}`)),
    ...Array.from({ length: 80 }, (_, index) => candidate(`d${index}`, "discovery", `da${index}`))
  ];
  const familiar = selectCandidatePool(candidates, 90, 80);
  const discovery = selectCandidatePool(candidates, 10, 80);
  assert.equal(familiar.length, 80);
  assert.ok(familiar.filter(item => item.feedLayer === "personal").length > 60);
  assert.ok(discovery.filter(item => item.feedLayer === "discovery").length > 50);
});

test("triages a large buffer before semantic evaluation while preserving source diversity", () => {
  const candidates = [
    ...Array.from({ length: 70 }, (_, index) => ({ ...candidate(`noise-${index}`, "discovery", `a${index}`, "hackernews"), text: "unrelated software discussion" })),
    { ...candidate("bike", "discovery", "rider", "mastodon"), text: "Mountain bike trail technique and setup" },
    { ...candidate("local", "discovery", "paper", "rss"), text: "Mountain biking routes nearby" }
  ];
  const triaged = triageCandidates(candidates, { ...baseProgram, intent: "mountain biking", include: ["trail technique"] }, 20);
  assert.equal(triaged.length, 20);
  assert.ok(triaged.some(item => item.id === "bike"));
  assert.ok(triaged.some(item => item.id === "local"));
  assert.ok(new Set(triaged.map(item => item.sourceType)).size >= 3);
});

test("paginates a ranked feed without repeating selections", () => {
  const candidates = Array.from({ length: 30 }, (_, index) => candidate(`i${index}`, "personal", `a${index}`));
  const evaluated = candidates.map(item => signal(item.id));
  const first = rankEvaluatedCandidates({ candidates, evaluated, program: baseProgram, limit: 10, offset: 0 });
  const second = rankEvaluatedCandidates({ candidates, evaluated, program: baseProgram, limit: 10, offset: 10 });
  assert.equal(first.length, 10); assert.equal(second.length, 10);
  assert.equal(first.some(item => second.some(other => other.id === item.id)), false);
});

test("reports deterministic healthy, sparse and empty quality states", () => {
  const candidates = Array.from({ length: 12 }, (_, index) => candidate(`i${index}`, "personal", `a${index}`, index < 6 ? "bluesky" : "mastodon"));
  assert.deepEqual(summarizeRankingQuality({ candidates, evaluated: candidates.map(item => signal(item.id)), program: baseProgram }), {
    status: "healthy", eligible: 12, evaluated: 12, uniqueAuthors: 12, uniqueSources: 2
  });
  const sparse = summarizeRankingQuality({ candidates, evaluated: candidates.slice(0, 2).map(item => signal(item.id)), program: baseProgram });
  assert.equal(sparse.status, "sparse");
  assert.equal(sparse.eligible, 2);
  const empty = summarizeRankingQuality({ candidates, evaluated: candidates.map(item => ({ ...signal(item.id), semantic_score: 0 })), program: baseProgram });
  assert.equal(empty.status, "empty");
});
