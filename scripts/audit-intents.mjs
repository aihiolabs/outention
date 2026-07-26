import { writeFile } from "node:fs/promises";

const baseUrl = String(process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const outputPath = process.env.AUDIT_OUTPUT || "";
const locale = process.env.AUDIT_LOCALE === "fi" ? "fi" : "en";

const allCases = [
  { id: "friends-fi", intent: "Siis kavereiden päivityksiä", expectedMode: "broad_personal", personalOnly: true, expectedLanguages: [] },
  { id: "following-en", intent: "Recent updates from people I follow", expectedMode: "broad_personal", personalOnly: true, expectedLanguages: [] },
  { id: "friends-no-news", intent: "Kavereiden kuulumisia, ei uutisia", expectedMode: "broad_personal", personalOnly: true, expectedLanguages: [] },
  { id: "missed-people", intent: "What did I miss from my people today?", expectedMode: "broad_personal", personalOnly: true, expectedLanguages: [] },
  { id: "wingfoil", intent: "Wingfoil technique, gear setup, and interesting sessions", expectedMode: "topical", expectedLanguages: [] },
  { id: "finland-politics", intent: "Suomen politiikan tärkeimmät uudet käänteet", expectedMode: "topical", expectedLanguages: [] },
  { id: "ai-startups", intent: "The most interesting recent US AI startup funding and product launches", expectedMode: "topical", expectedLanguages: [] },
  { id: "adhd-lived", intent: "First-person experiences of living with ADHD, not generic health advice", expectedMode: "topical", expectedLanguages: [] },
  { id: "calm-nature", intent: "Calm nature photos and small observations, nothing argumentative", expectedLanguages: [] },
  { id: "good-energy", intent: "Something with good energy from real people", expectedLanguages: [] },
  { id: "surprise-thoughtful", intent: "Surprise me with thoughtful original posts", expectedLanguages: [] },
  { id: "rautalampi", intent: "Tuoreita uutisia Rautalammilta", expectedMode: "topical", expectedLanguages: [], expectedSourcesAny: ["locationews"] },
  { id: "yle-headlines", intent: "Ylen tärkeimmät tuoreet uutiset", expectedMode: "topical", expectedLanguages: [], expectedSourcesAny: ["rss"] },
  { id: "passkeys-hn", intent: "Recent Hacker News discussion about passkeys and authentication UX", expectedMode: "topical", expectedLanguages: [], expectedSourcesAny: ["hackernews"] },
  { id: "finnish-only", intent: "Vain suomenkielisiä ajankohtaisia yhteiskunnallisia keskusteluja", expectedMode: "topical", expectedLanguages: ["fi"] },
  { id: "english-only", intent: "English-language technology posts only", expectedMode: "topical", expectedLanguages: ["en"] },
  { id: "funny-no-politics", intent: "Funny everyday posts, no politics and no ragebait", expectedLanguages: [] },
  { id: "nuclear-balance", intent: "Strong arguments both for and against nuclear energy", expectedMode: "topical", expectedLanguages: [] },
  { id: "photo-video", intent: "Useful photography videos and hands-on tutorials", expectedMode: "topical", expectedLanguages: [] },
  { id: "climate-science", intent: "Recent climate science findings, not political opinion", expectedMode: "topical", expectedLanguages: [] },
  { id: "r3-friends-fi", intent: "Kavereiden tavallisia kuulumisia ja päivityksiä, ei uutisia", expectedMode: "broad_personal", expectedOrigin: "people", personalOnly: true, expectedLanguages: [] },
  { id: "r3-friends-en", intent: "Personal updates from people I follow, not news links", expectedMode: "broad_personal", expectedOrigin: "people", personalOnly: true, expectedLanguages: [] },
  { id: "r3-politics-fi", intent: "Vain suomenkielistä keskustelua Suomen politiikan uusimmista käänteistä", expectedMode: "topical", expectedLanguages: ["fi"] },
  { id: "r3-politics-us-en", intent: "English-language reporting and thoughtful discussion about the latest US politics", expectedMode: "topical", expectedLanguages: ["en"] },
  { id: "r3-recipe-weeknight", intent: "Easy vegetarian weeknight recipes with clear instructions", expectedMode: "topical", expectedLanguages: [] },
  { id: "r3-recipe-finnish", intent: "Vain suomenkielisiä helppoja arkiruokaohjeita", expectedMode: "topical", expectedLanguages: ["fi"] },
  { id: "r3-local-rautalampi", intent: "Tämän päivän paikallisuutiset Rautalammilta", expectedMode: "topical", expectedLanguages: [], expectedSourcesAny: ["locationews"] },
  { id: "r3-local-kuopio", intent: "Tuoreita paikallisuutisia ja tapahtumia Kuopiosta", expectedMode: "topical", expectedLanguages: [], expectedSourcesAny: ["locationews"] },
  { id: "r3-local-brooklyn", intent: "Fresh local news and community updates from Brooklyn, New York", expectedMode: "topical", expectedLanguages: [] },
  { id: "r3-ukraine-en", intent: "English-language factual updates on the current situation in Ukraine", expectedMode: "topical", expectedLanguages: ["en"] },
  { id: "r3-ukraine-fi", intent: "Vain suomenkielisiä asiallisia päivityksiä Ukrainan tämänhetkisestä tilanteesta", expectedMode: "topical", expectedLanguages: ["fi"] },
  { id: "r3-mtb-technique", intent: "Practical mountain biking cornering and descending technique", expectedMode: "topical", expectedLanguages: [] },
  { id: "r3-mtb-trails", intent: "Interesting recent mountain bike trail rides and trip reports", expectedMode: "topical", expectedLanguages: [] },
  { id: "r3-travel-tokyo", intent: "Practical Tokyo travel tips from people who have actually visited", expectedMode: "topical", expectedOrigin: "people", expectedLanguages: [] },
  { id: "r3-travel-finland", intent: "Rauhallisia viikonloppumatkavinkkejä Suomessa ilman luksushotelleja", expectedMode: "topical", expectedLanguages: [] },
  { id: "r3-tv-new", intent: "Recent TV comedy recommendations from real viewers", expectedMode: "topical", expectedOrigin: "people", expectedLanguages: [] },
  { id: "r3-tv-classic", intent: "Thoughtful discussion of classic sitcoms and why they still work", expectedMode: "topical", expectedLanguages: [] },
  { id: "r3-tv-light", intent: "Light, warm TV comedies without cringe humor", expectedMode: "topical", expectedLanguages: [] },
  { id: "r3-politics-balanced", intent: "Good-faith arguments from different viewpoints on current US politics, in English", expectedMode: "topical", expectedLanguages: ["en"] },
  { id: "r3-food-people", intent: "Home cooks sharing meals they actually made, with usable recipes", expectedMode: "topical", expectedOrigin: "people", expectedLanguages: [] }
];
const selectedIds = new Set(String(process.env.AUDIT_CASE_IDS || "").split(",").map(value => value.trim()).filter(Boolean));
const cases = selectedIds.size ? allCases.filter(testCase => selectedIds.has(testCase.id)) : allCases;

let cookie = "";
const results = [];
for (const [index, testCase] of cases.entries()) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/feed`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-outention-request": "1",
        "x-outention-locale": locale,
        ...(cookie ? { cookie } : {})
      },
      body: JSON.stringify({
        intent: testCase.intent,
        controls: {
          weights: { relevance: 45, tone: 10, freshness: 20, social: 20, engagement: 5 },
          familiarity_target: 70,
          max_per_author: 2
        }
      })
    });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const data = await response.json().catch(() => ({}));
    results.push(summarizeCase(testCase, response.status, data, Date.now() - startedAt));
  } catch (error) {
    results.push({ id: testCase.id, intent: testCase.intent, ok: false, error: error.message, durationMs: Date.now() - startedAt });
  }
  process.stderr.write(`[${index + 1}/${cases.length}] ${testCase.id}\n`);
}

const report = {
  createdAt: new Date().toISOString(),
  baseUrl,
  locale,
  caseCount: cases.length,
  passedWithoutFlags: results.filter(result => result.ok && !result.flags.length).length,
  failedRequests: results.filter(result => !result.ok).length,
  flaggedCases: results.filter(result => result.flags?.length).length,
  results
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) await writeFile(outputPath, serialized, { encoding: "utf8", mode: 0o600 });
else process.stdout.write(serialized);

function summarizeCase(testCase, status, data, durationMs) {
  if (status >= 400) return { id: testCase.id, intent: testCase.intent, ok: false, status, error: data.error || "Request failed", durationMs };
  if (data.clarificationNeeded) return {
    id: testCase.id, intent: testCase.intent, ok: false, status,
    error: `Unexpected clarification: ${data.clarificationQuestion}`, durationMs
  };
  const items = data.items || [];
  const sources = countBy(items, item => item.sourceType || "unknown");
  const layers = countBy(items, item => item.feedLayer || "unknown");
  const languages = countBy(items, item => primaryLanguage(item.language) || "unknown");
  const relevance = items.map(item => Number(item.components?.relevance)).filter(Number.isFinite);
  const flags = [];
  const actualLanguages = data.program?.languages || [];
  if (testCase.expectedMode && data.program?.selection_mode !== testCase.expectedMode) {
    flags.push(`mode:${data.program?.selection_mode || "missing"}!=${testCase.expectedMode}`);
  }
  if (testCase.expectedOrigin && data.program?.origin_scope !== testCase.expectedOrigin) {
    flags.push(`origin:${data.program?.origin_scope || "missing"}!=${testCase.expectedOrigin}`);
  }
  if (JSON.stringify(actualLanguages) !== JSON.stringify(testCase.expectedLanguages)) {
    flags.push(`languages:${JSON.stringify(actualLanguages)}!=${JSON.stringify(testCase.expectedLanguages)}`);
  }
  if (testCase.personalOnly && Object.keys(layers).some(layer => layer !== "personal")) flags.push(`non-personal:${JSON.stringify(layers)}`);
  if (testCase.expectedSourcesAny && !testCase.expectedSourcesAny.some(source => sources[source])) {
    flags.push(`missing-source:${testCase.expectedSourcesAny.join("|")}`);
  }
  if (items.length < 5) flags.push(`sparse:${items.length}`);
  if (data.program?.selection_mode === "topical" && relevance.length && average(relevance) < 50) {
    flags.push(`low-relevance:${average(relevance)}`);
  }
  return {
    id: testCase.id,
    intent: testCase.intent,
    ok: true,
    status,
    durationMs,
    program: {
      selectionMode: data.program?.selection_mode,
      originScope: data.program?.origin_scope,
      languages: actualLanguages,
      requiredSources: data.program?.required_sources,
      include: data.program?.include,
      exclude: data.program?.exclude,
      tone: data.program?.tone,
      socialScope: data.program?.social_scope,
      contentForms: data.program?.content_forms,
      familiarityTarget: data.program?.familiarity_target,
      horizonHours: data.program?.horizon_hours,
      discovery: data.program?.discovery
    },
    itemCount: items.length,
    sources,
    layers,
    itemLanguages: languages,
    relevance: relevance.length ? { min: Math.min(...relevance), average: average(relevance), max: Math.max(...relevance) } : null,
    topReasons: topCounts(items.flatMap(item => item.reasons || []), 8),
    pagination: data.pagination,
    pipeline: data.pipeline,
    flags
  };
}

function countBy(items, keyFor) {
  return Object.fromEntries([...items.reduce((counts, item) => {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map()).entries()].sort((left, right) => right[1] - left[1]));
}

function topCounts(values, limit) {
  return Object.entries(countBy(values, value => value)).slice(0, limit).map(([label, count]) => ({ label, count }));
}

function primaryLanguage(value) {
  return String(value || "").trim().toLowerCase().split(/[-_]/)[0];
}

function average(values) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10;
}
