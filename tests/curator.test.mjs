import test from "node:test";
import assert from "node:assert/strict";
import { compileIntent, evaluateCandidates, explicitIntentLanguages, filterCandidatesByLanguage, listLocalModels, normalizeLanguageCodes, normalizeMastodonTags, probeModelConnection } from "../src/curator/openai.js";

const program = {
  intent: "wingfoil discoveries", selection_mode: "topical", origin_scope: "any", include: ["wingfoil"], exclude: [], tone: ["practical"], social_scope: ["home", "discovery"], content_forms: ["posts"],
  languages: ["fi", "en"], required_sources: [],
  weights: { relevance: 45, tone: 10, freshness: 20, social: 20, engagement: 5 }, diversity: { max_per_author: 2 }, horizon_hours: 72,
  familiarity_target: 55, market_context: "US/global", discovery: { bluesky_queries: ["wingfoil", "wingfoiling"], reddit_queries: ["wingfoil", "subreddit:wingfoil equipment"], mastodon_tags: ["wingfoil"] }
};

test("compiles intent into US-first retrieval and ranking controls", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.match(request.instructions, /US-market-first/);
    assert.match(request.instructions, /Never infer a content language/i);
    assert.match(request.instructions, /background_context/);
    const input = JSON.parse(request.input);
    assert.equal(input.background_context, "Asun Rautalammilla ja pidän vesilajeista.");
    assert.equal(input.ui_locale, "en");
    return Response.json({ output_text: JSON.stringify({ clarification_needed: false, clarification_question: null, program }) });
  };
  const result = await compileIntent({ apiKey: "test", model: "gpt-5.6-luna", intent: "wingfoil", previousProgram: null, profileContext: "Asun Rautalammilla ja pidän vesilajeista." });
  assert.deepEqual(result.program.discovery.bluesky_queries, ["wingfoil", "wingfoiling"]);
  assert.deepEqual(result.program.discovery.reddit_queries, ["wingfoil", "subreddit:wingfoil equipment"]);
  assert.equal(result.program.market_context, "US/global");
  assert.deepEqual(result.program.languages, []);
});

test("enforces a language only when the current intent explicitly requests one", () => {
  assert.deepEqual(explicitIntentLanguages("Siis kavereiden päivityksiä", ["en"]), []);
  assert.deepEqual(explicitIntentLanguages("Suomen politiikkaa englanniksi", []), ["en"]);
  assert.deepEqual(explicitIntentLanguages("Finnish-language local news", ["en"]), ["fi"]);
});

test("filters known unsupported languages before model evaluation", () => {
  const candidates = [
    { id: "fi", language: "fi" },
    { id: "en", language: "en-US" },
    { id: "fr", language: "fr" },
    { id: "unknown", language: null }
  ];
  assert.deepEqual(filterCandidatesByLanguage(candidates, ["fi", "en"]).map(item => item.id), ["fi", "en", "unknown"]);
});

test("an empty language list keeps every language", () => {
  const candidates = [{ id: "fi", language: "fi" }, { id: "fr", language: "fr" }, { id: "unknown", language: null }];
  assert.deepEqual(filterCandidatesByLanguage(candidates, []).map(item => item.id), ["fi", "fr", "unknown"]);
});

test("normalizes model-produced language names to ISO codes", () => {
  assert.deepEqual(normalizeLanguageCodes(["English", "suomeksi", "sv-SE", "English"]), ["en", "fi", "sv"]);
});

test("normalizes model-produced Mastodon tags", () => {
  assert.deepEqual(normalizeMastodonTags(["#ukraina", "ukraine", "##ukraina", ""]), ["ukraina", "ukraine"]);
});

test("evaluates only supplied IDs without synthetic content", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.match(request.instructions, /never answer, summarize/);
    assert.match(request.instructions, /full 0-100 scale/);
    assert.match(request.instructions, /explicit program\.exclude item is a veto/);
    assert.match(request.instructions, /Requested content_forms matter/);
    assert.match(request.instructions, /authoritative retrieval classification/);
    assert.match(request.instructions, /named locality/);
    assert.match(request.instructions, /Historical or explicitly non-current/);
    assert.match(request.instructions, /explicitly different subject/);
    assert.match(request.instructions, /missing central requested property/);
    assert.match(request.instructions, /core_match is an independent gate/);
    assert.match(request.instructions, /Reasons are English selection criteria/);
    const input = JSON.parse(request.input);
    assert.equal(input.candidates[0].id, "c1");
    assert.equal(input.candidates[0].author, undefined);
    assert.equal(input.candidates[0].text.length, 900);
    assert.equal(input.candidates[0].source_context, "Locationews · Rautalampi · @a");
    return Response.json({ output_text: JSON.stringify({ evaluated: [
      { id: "c1", semantic_score: 90, tone_score: 70, core_match: true, hard_excluded: false, reasons: ["Osuva wingfoil-havainto"] }
    ] }) });
  };
  const candidates = [{ id: "real", author: { handle: "@a" }, text: "x".repeat(1200), publishedAt: "2026-07-19T10:00:00Z", engagement: {}, socialContext: null, retrievalContext: "Locationews · Rautalampi", media: [], feedLayer: "personal", sourceType: "bluesky" }];
  const result = await evaluateCandidates({ apiKey: "test", model: "gpt-5.6-luna", program, candidates });
  assert.deepEqual(result.map(item => item.id), ["real"]);
});

test("rejects missing, duplicate or invented evaluation IDs", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ output_text: JSON.stringify({ evaluated: [
    { id: "invented", semantic_score: 90, tone_score: 70, core_match: true, hard_excluded: false, reasons: ["Invalid"] }
  ] }) });
  const candidates = [{ id: "real", author: { handle: "@a" }, text: "wingfoil", publishedAt: "2026-07-19T10:00:00Z", engagement: {}, socialContext: null, media: [], feedLayer: "personal", sourceType: "bluesky" }];
  await assert.rejects(evaluateCandidates({ apiKey: "test", model: "gpt-5.6-luna", program, candidates }), /virheellisen ehdokasarvion/);
});

test("uses Anthropic forced tool output for structured curation", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.anthropic.com/v1/messages");
    assert.equal(options.headers["x-api-key"], "sk-ant-test-secret");
    const request = JSON.parse(options.body);
    assert.equal(request.tool_choice.name, "outention_program");
    assert.equal(request.tools[0].input_schema.type, "object");
    return Response.json({ content: [{ type: "tool_use", name: "outention_program", input: compiledOutput() }] });
  };
  const result = await compileIntent({ provider: "anthropic", apiKey: "sk-ant-test-secret", model: "claude-haiku-test", intent: "wingfoil" });
  assert.equal(result.program.intent, program.intent);
});

test("uses OpenRouter strict JSON schema response format", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    const request = JSON.parse(options.body);
    assert.equal(request.response_format.type, "json_schema");
    assert.equal(request.response_format.json_schema.strict, true);
    assert.equal(request.provider.require_parameters, true);
    assert.equal(request.provider.data_collection, "deny");
    return Response.json({ choices: [{ message: { content: JSON.stringify(compiledOutput()) } }] });
  };
  const result = await compileIntent({ provider: "openrouter", apiKey: "sk-or-test-secret", model: "openai/test", intent: "wingfoil" });
  assert.equal(result.program.intent, program.intent);
});

test("uses Gemini response JSON schema", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
    assert.equal(options.headers["x-goog-api-key"], "gemini-test-secret");
    const request = JSON.parse(options.body);
    assert.equal(request.generationConfig.responseMimeType, "application/json");
    assert.equal(request.generationConfig.responseJsonSchema.type, "object");
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(compiledOutput()) }] } }] });
  };
  const result = await compileIntent({ provider: "gemini", apiKey: "gemini-test-secret", model: "gemini-test", intent: "wingfoil" });
  assert.equal(result.program.intent, program.intent);
});

test("uses Ollama's native JSON schema endpoint", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "http://127.0.0.1:11434/api/chat");
    const request = JSON.parse(options.body);
    assert.equal(request.model, "gemma4:e4b");
    assert.equal(request.format.type, "object");
    assert.equal(request.options.temperature, 0);
    return Response.json({ message: { content: `\`\`\`json\n${JSON.stringify(compiledOutput())}\n\`\`\`` } });
  };
  const result = await compileIntent({ provider: "local", apiKey: "", model: "gemma4:e4b", baseUrl: "http://127.0.0.1:11434/v1", intent: "wingfoil" });
  assert.equal(result.program.intent, program.intent);
});

test("probes structured output before accepting a model connection", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.equal(request.format.properties.ok.const, true);
    return Response.json({ message: { content: JSON.stringify({ ok: true }) } });
  };
  assert.deepEqual(await probeModelConnection({ provider: "local", model: "gemma4:26b", apiKey: "", baseUrl: "http://127.0.0.1:11434/v1" }), { verified: true });
});

test("lists installed Ollama models without guessing a preset", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async url => {
    assert.equal(url, "http://127.0.0.1:11434/api/tags");
    return Response.json({ models: [{ name: "gemma4:26b" }, { model: "qwen3:8b" }] });
  };
  assert.deepEqual(await listLocalModels({ baseUrl: "http://127.0.0.1:11434/v1" }), ["gemma4:26b", "qwen3:8b"]);
});

test("retries one malformed structured response", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    const request = JSON.parse(options.body);
    if (calls === 1) return Response.json({ output_text: "not-json" });
    assert.match(request.instructions, /STRICT RETRY/);
    return Response.json({ output_text: JSON.stringify(compiledOutput()) });
  };
  const result = await compileIntent({ apiKey: "test", model: "gpt-5.6-luna", intent: "wingfoil" });
  assert.equal(result.program.intent, program.intent);
  assert.equal(calls, 2);
});

test("does not expose provider error messages or API keys", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ error: { type: "invalid_request", message: "bad sk-secret-key" } }, { status: 400 });
  await assert.rejects(
    compileIntent({ provider: "openai", apiKey: "sk-secret-key", model: "test", intent: "wingfoil" }),
    error => error.message === "OpenAI-mallikutsu epäonnistui (invalid_request)." && !error.message.includes("sk-secret-key")
  );
});

function compiledOutput() {
  return { clarification_needed: false, clarification_question: null, program };
}
