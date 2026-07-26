const programProperties = {
  intent: { type: "string" },
  selection_mode: { type: "string", enum: ["topical", "broad_personal", "broad_discovery"] },
  origin_scope: { type: "string", enum: ["any", "people", "publishers"] },
  include: { type: "array", items: { type: "string" }, maxItems: 8 },
  exclude: { type: "array", items: { type: "string" }, maxItems: 8 },
  tone: { type: "array", items: { type: "string" }, maxItems: 5 },
  social_scope: { type: "array", items: { type: "string" }, maxItems: 5 },
  content_forms: { type: "array", items: { type: "string" }, maxItems: 6 },
  languages: { type: "array", maxItems: 5, items: { type: "string" } },
  required_sources: {
    type: "array", maxItems: 5,
    items: { type: "string", enum: ["bluesky", "mastodon", "threads", "reddit", "locationews", "yle", "hackernews", "rss", "youtube"] }
  },
  weights: {
    type: "object", additionalProperties: false,
    required: ["relevance", "tone", "freshness", "social", "engagement"],
    properties: {
      relevance: { type: "number", minimum: 0, maximum: 100 }, tone: { type: "number", minimum: 0, maximum: 100 },
      freshness: { type: "number", minimum: 0, maximum: 100 }, social: { type: "number", minimum: 0, maximum: 100 }, engagement: { type: "number", minimum: 0, maximum: 100 }
    }
  },
  diversity: { type: "object", additionalProperties: false, required: ["max_per_author"], properties: { max_per_author: { type: "integer", minimum: 1, maximum: 10 } } },
  horizon_hours: { type: "integer", minimum: 6, maximum: 336 },
  familiarity_target: { type: "number", minimum: 0, maximum: 100 },
  market_context: { type: "string" },
  discovery: {
    type: "object", additionalProperties: false,
    required: ["bluesky_queries", "reddit_queries", "mastodon_tags"],
    properties: {
      bluesky_queries: { type: "array", maxItems: 3, items: { type: "string" } },
      reddit_queries: { type: "array", maxItems: 4, items: { type: "string" } },
      mastodon_tags: { type: "array", maxItems: 3, items: { type: "string" } }
    }
  }
};

const compileSchema = {
  type: "object", additionalProperties: false,
  required: ["clarification_needed", "clarification_question", "program"],
  properties: {
    clarification_needed: { type: "boolean" }, clarification_question: { type: ["string", "null"] },
    program: { type: "object", additionalProperties: false, required: Object.keys(programProperties), properties: programProperties }
  }
};

const evaluationSchema = {
  type: "object", additionalProperties: false, required: ["evaluated"],
  properties: {
    evaluated: { type: "array", maxItems: 100, items: {
      type: "object", additionalProperties: false,
      required: ["id", "semantic_score", "tone_score", "core_match", "hard_excluded", "reasons"],
      properties: {
        id: { type: "string" }, semantic_score: { type: "number", minimum: 0, maximum: 100 }, tone_score: { type: "number", minimum: 0, maximum: 100 },
        core_match: { type: "boolean" }, hard_excluded: { type: "boolean" }, reasons: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } }
      }
    } }
  }
};

const probeSchema = {
  type: "object", additionalProperties: false, required: ["ok"],
  properties: { ok: { type: "boolean", const: true } }
};

const MAX_CANDIDATE_TEXT_CHARS = 900;

export async function compileIntent({ provider = "openai", apiKey, model, baseUrl, intent, previousProgram, profileContext = "", locale = "en" }) {
  const parsed = await requestStructuredWithRetry({
    provider, apiKey, model, baseUrl, schema: compileSchema, name: "outention_program",
    instructions: [
      "You compile a natural-language listening intent into an explicit feed retrieval and ranking program. You do not answer the intent.",
      "Generate 0-3 concise Bluesky search queries, 0-4 Reddit search queries, and 0-3 Mastodon hashtags that can discover relevant original posts outside home feeds.",
      "Bluesky queries must be simple natural phrases of 2-6 words. Do not use parentheses, OR, site:, subreddit:, or other search-engine operators in Bluesky queries. Mastodon tags must not include a leading #.",
      "Reddit queries may use native search syntax such as subreddit:name when the intent clearly points to a relevant community, but should normally search all of Reddit with domain-native synonyms.",
      "The product is US-market-first. Default market_context to US/global and make topical discovery queries English-first, including domain-native synonyms, unless the user explicitly asks for a local geography. Discovery query language never implies a content-language restriction.",
      "background_context is optional private user context. Use it only when relevant; current_intent always overrides it. Never quote it, reveal it, or turn it into feed content.",
      "Never infer a content language from the UI language, market context, profile, or query terms. Set languages to [] unless the user's current intent explicitly asks for one or more content languages.",
      "Set selection_mode to broad_personal when the request is for general updates, posts, or activity from followed/familiar people without a topic constraint. For broad_personal, keep include/tone/content_forms broad, prefer Home sources, and normally generate no discovery queries. Use topical for topic-led requests and broad_discovery for unconstrained discovery.",
      "Set origin_scope to people only when the user explicitly asks for real people, individual voices, friends, followed people, or personal experiences. broad_personal always uses people. Set publishers only for an explicit publisher or editorial-source request; otherwise use any.",
      "Set required_sources only when the user explicitly asks for content from a named source or platform. Map Threads to threads, Yle to yle, and Hacker News or HN to hackernews. Otherwise always use []. A required source is a hard source constraint, not a topic.",
      "Do not ask for clarification merely because a request is broad. Compile broad but usable requests such as general technology, good energy, or thoughtful posts directly. Clarify only an unresolved reference, a material contradiction, or a request with no usable selection signal.",
      "familiarity_target is 100 for mostly familiar Home content, 0 for mostly discovery, and normally 60-75.",
      `Weights should total roughly 100. Engagement must remain low unless explicitly requested. Ask a clarification only if retrieval would otherwise be arbitrary, and ask it in ${locale === "fi" ? "Finnish" : "English"}.`
    ].join("\n"),
    input: { current_intent: intent, ui_locale: locale, background_context: profileContext || null, previous_program: previousProgram }
  }, parsedResult => {
    if (parsedResult?.program) {
      parsedResult.program.languages = explicitIntentLanguages(intent, parsedResult.program.languages);
      if (parsedResult.program.discovery) parsedResult.program.discovery.mastodon_tags = normalizeMastodonTags(parsedResult.program.discovery.mastodon_tags);
    }
    validateCompiledIntent(parsedResult);
    return parsedResult;
  });
  return { clarificationNeeded: parsed.clarification_needed, clarificationQuestion: parsed.clarification_question, program: parsed.program };
}

export async function evaluateCandidates({ provider = "openai", apiKey, model, baseUrl, program, candidates, locale = "en" }) {
  const opaqueIds = new Map();
  const compactCandidates = candidates.map((item, index) => {
    const opaqueId = `c${index + 1}`;
    opaqueIds.set(opaqueId, item.id);
    return {
    id: opaqueId, text: String(item.text || "").slice(0, MAX_CANDIDATE_TEXT_CHARS), published_at: item.publishedAt,
    source: item.sourceType, source_name: item.sourceName,
    source_context: [item.retrievalContext, item.author?.handle, item.socialContext].filter(Boolean).join(" · ").slice(0, 200),
    layer: item.feedLayer || "public", language: item.language,
    social_context: item.socialContext, has_media: item.media.length > 0
  }; });
  const parsed = await requestStructuredWithRetry({
    provider, apiKey, model, baseUrl, schema: evaluationSchema, name: "outention_signals",
    instructions: [
      "You evaluate supplied original posts for a feed program; you never answer, summarize, synthesize, or rewrite them.",
      "Evaluate every candidate exactly once and never invent IDs.",
      "semantic_score is topical and contextual relevance. For selection_mode broad_personal, a personal-layer post is contextually relevant as a genuine update from a followed person even when it has no shared topic; score its fit as a personal update instead of inventing a topic requirement. tone_score is fit with requested tone and content form.",
      "Use the full 0-100 scale for both scores, never a 0-1 scale: unrelated 0-10, tangential 20-40, useful 50-70, directly relevant 80-100.",
      "source_context can contain authoritative retrieval classification supplied by the source adapter. Use it as evidence even when the compact title or lead does not repeat that metadata. For example, a Locationews item retrieved under a named municipality is verified local news from that municipality, and its title plus lead is a news article preview rather than a bare mention.",
      "For a request about a named locality, content about only a broader city, region, or country is not enough. Score it at most 40 unless the candidate or authoritative source_context establishes a direct connection or practical effect on the named locality.",
      "Fresh, current, latest, or today constrain the subject matter as well as the publication timestamp. Historical or explicitly non-current subject matter scores at most 40 unless a current event or development makes that history directly relevant.",
      "A related but explicitly different subject, activity, product, place, or medium is not the requested subject. If your reason would say it is something else rather than the requested thing, semantic_score must be at most 40.",
      "An explicitly missing central requested property is a mismatch, even when the subject and a broad content form match. If your reason says the candidate has no practical guidance, no firsthand experience, no explanation, or otherwise lacks the request's core value, semantic_score must be at most 40.",
      "core_match is an independent gate. Set it true only when the candidate itself satisfies the request's central subject, required form, and central requested properties. Set it false for adjacent subjects, bare mentions, missing recipe, instruction or advice, wrong locality, non-current subject matter when current was requested, or any other missing core value. A high semantic_score never overrides core_match false.",
      "Requested content_forms matter. A candidate that matches the subject but lacks the explicitly requested form must score at most 40. In particular, a recipe request needs usable recipe details, and a tutorial or how-to request needs actionable instruction; a review, promotion, or bare mention is only tangential.",
      "Every explicit program.exclude item is a veto, not a soft negative preference. If a candidate has an excluded property, hard_excluded must be true regardless of its relevance. Never keep hard_excluded false while giving a reason that identifies an excluded property.",
      `hard_excluded is true for explicit exclusions, or when program.languages is non-empty and the post language is outside it. An empty languages array means all languages are allowed. Reasons are ${locale === "fi" ? "Finnish" : "English"} selection criteria, 2-6 words, never content summaries.`
    ].join("\n"),
    input: { program, candidates: compactCandidates }
  }, parsedResult => {
    validateEvaluation(parsedResult, opaqueIds);
    return parsedResult;
  });
  return parsed.evaluated.map(item => ({ ...item, id: opaqueIds.get(item.id) }));
}

export async function probeModelConnection({ provider = "openai", apiKey, model, baseUrl }: { provider?: string; apiKey: string; model: string; baseUrl?: string }) {
  const parsed = await requestStructuredWithRetry({
    provider, apiKey, model, baseUrl, schema: probeSchema, name: "outention_connection_probe",
    instructions: "Return the required JSON object with ok set to true. Do not add commentary.",
    input: { task: "Outention structured-output connection test" }
  }, parsedResult => {
    if (parsedResult?.ok !== true) throw curatorError(502, "Malliyhteys ei läpäissyt rakenteisen vastauksen testiä.");
    return parsedResult;
  });
  return { verified: parsed.ok === true };
}

export async function listLocalModels({ baseUrl }) {
  const normalized = String(baseUrl || "http://127.0.0.1:11434/v1").replace(/\/$/, "");
  if (isOllamaUrl(normalized)) {
    const response = await fetch(`${ollamaRoot(normalized)}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw curatorError(502, "Paikallisen mallipalvelun mallilistaa ei voitu lukea.");
    const data = await response.json().catch(() => ({}));
    return [...new Set((data.models || []).map(item => String(item.name || item.model || "").trim()).filter(Boolean))];
  }
  const response = await fetch(`${normalized}/models`, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw curatorError(502, "Paikallisen mallipalvelun mallilistaa ei voitu lukea.");
  const data = await response.json().catch(() => ({}));
  return [...new Set((data.data || []).map(item => String(item.id || "").trim()).filter(Boolean))];
}

export function filterCandidatesByLanguage(candidates, languages = ["fi", "en"]) {
  const allowed = new Set(languages.map(primaryLanguage).filter(Boolean));
  if (!allowed.size) return candidates;
  return candidates.filter(item => !item.language || allowed.has(primaryLanguage(item.language)));
}

export function normalizeMastodonTags(tags = []) {
  return [...new Set(tags.map(tag => String(tag || "").trim().replace(/^#+/, "")).filter(Boolean))];
}

function primaryLanguage(value) {
  return String(value || "").trim().toLowerCase().split(/[-_]/)[0];
}

export function normalizeLanguageCodes(languages = []) {
  const names = {
    english: "en", englanti: "en", englanniksi: "en",
    finnish: "fi", suomi: "fi", suomeksi: "fi",
    swedish: "sv", ruotsi: "sv", ruotsiksi: "sv",
    german: "de", saksa: "de", saksaksi: "de",
    french: "fr", ranska: "fr", ranskaksi: "fr",
    spanish: "es", espanja: "es", espanjaksi: "es",
    ukrainian: "uk", ukraina: "uk", ukrainaksi: "uk",
    russian: "ru", venäjä: "ru", venäjäksi: "ru"
  };
  return [...new Set(languages.map(value => {
    const clean = String(value || "").trim().toLowerCase().replace(/_/g, "-");
    if (names[clean]) return names[clean];
    const primary = clean.split("-")[0];
    return /^[a-z]{2}$/.test(primary) ? primary : "";
  }).filter(Boolean))].slice(0, 5);
}

export function explicitIntentLanguages(intent, proposed = []) {
  const text = String(intent || "").toLocaleLowerCase();
  const patterns = {
    fi: [/\bsuomeksi\b/u, /\bsuomenkielis(?:tä|iä|et|en)?\b/u, /\bin finnish\b/u, /\bfinnish[- ]language\b/u],
    en: [/\benglanniksi\b/u, /\benglanninkielis(?:tä|iä|et|en)?\b/u, /\bin english\b/u, /\benglish[- ]language\b/u],
    sv: [/\bruotsiksi\b/u, /\bruotsinkielis(?:tä|iä|et|en)?\b/u, /\bin swedish\b/u, /\bswedish[- ]language\b/u],
    de: [/\bsaksaksi\b/u, /\bsaksankielis(?:tä|iä|et|en)?\b/u, /\bin german\b/u, /\bgerman[- ]language\b/u],
    fr: [/\branskaksi\b/u, /\branskankielis(?:tä|iä|et|en)?\b/u, /\bin french\b/u, /\bfrench[- ]language\b/u],
    es: [/\bespanjaksi\b/u, /\bespanjankielis(?:tä|iä|et|en)?\b/u, /\bin spanish\b/u, /\bspanish[- ]language\b/u],
    uk: [/\bukrainaksi\b/u, /\bukrainankielis(?:tä|iä|et|en)?\b/u, /\bin ukrainian\b/u, /\bukrainian[- ]language\b/u]
  };
  const explicit = Object.entries(patterns).filter(([, rules]) => rules.some(rule => rule.test(text))).map(([code]) => code);
  if (explicit.length) return explicit;
  // A model may still return a language because of UI locale or query language.
  // Treat that as unrestricted unless the user actually stated a language.
  return [];
}

export async function curateFeed(options) {
  const compiled = await compileIntent(options);
  if (compiled.clarificationNeeded) return compiled;
  const evaluated = await evaluateCandidates({ ...options, program: compiled.program });
  return { ...compiled, evaluated };
}

async function requestStructured({ provider, apiKey, model, baseUrl, schema, name, instructions, input }) {
  if (provider === "anthropic") return requestAnthropic({ apiKey, model, schema, name, instructions, input });
  if (provider === "openrouter") return requestOpenRouter({ apiKey, model, schema, name, instructions, input });
  if (provider === "gemini") return requestGemini({ apiKey, model, schema, instructions, input });
  if (provider === "local") return requestLocalCompatible({ apiKey, model, baseUrl, schema, name, instructions, input });
  if (provider !== "openai") throw curatorError(400, "Tuntematon mallipalvelu.");
  return requestOpenAI({ apiKey, model, schema, name, instructions, input });
}

async function requestStructuredWithRetry(options, validate) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const instructions = attempt === 0
        ? options.instructions
        : `${options.instructions}\nSTRICT RETRY: return only data matching the supplied JSON schema. Include every required field and no extra fields.`;
      return validate(await requestStructured({ ...options, instructions }));
    } catch (error) {
      lastError = error;
      if (attempt > 0 || !isRetryableStructuredError(error)) throw error;
    }
  }
  throw lastError;
}

function isRetryableStructuredError(error) {
  return /rakente|ranking-ohjelman|ehdokasjoukkoa|ehdokasarvion|connection probe|structured/i.test(String(error?.message || ""));
}

async function requestOpenAI({ apiKey, model, schema, name, instructions, input }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", signal: AbortSignal.timeout(90_000), headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, reasoning: { effort: "low" }, max_output_tokens: 4096, instructions, input: JSON.stringify(input), text: { format: { type: "json_schema", name, strict: true, schema } } })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("OpenAI", response.status, data);
  const outputText = data.output_text || data.output?.flatMap(item => item.content || []).find(content => content.type === "output_text")?.text;
  if (!outputText) throw curatorError(502, "Kuraattorimalli ei palauttanut rakenteista ohjelmaa.");
  return parseStructured(outputText);
}

async function requestAnthropic({ apiKey, model, schema, name, instructions, input }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model, max_tokens: 4096, system: instructions,
      messages: [{ role: "user", content: JSON.stringify(input) }],
      tools: [{ name, description: "Return the requested Outention feed control data.", input_schema: schema, strict: true }],
      tool_choice: { type: "tool", name }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("Anthropic", response.status, data);
  const toolUse = data.content?.find(item => item.type === "tool_use" && item.name === name);
  if (!toolUse?.input) throw curatorError(502, "Anthropic ei palauttanut rakenteista ohjelmaa.");
  return toolUse.input;
}

async function requestOpenRouter({ apiKey, model, schema, name, instructions, input }) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: {
      authorization: `Bearer ${apiKey}`, "content-type": "application/json",
      "http-referer": "https://outention.com", "x-title": "Outention"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: instructions }, { role: "user", content: JSON.stringify(input) }],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      provider: { require_parameters: true, data_collection: "deny" },
      max_tokens: 4096
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("OpenRouter", response.status, data);
  const content = data.choices?.[0]?.message?.content;
  const outputText = Array.isArray(content) ? content.map(part => part.text || "").join("") : content;
  if (!outputText) throw curatorError(502, "OpenRouter ei palauttanut rakenteista ohjelmaa.");
  return parseStructured(outputText);
}

async function requestLocalCompatible({ apiKey, model, baseUrl, schema, name, instructions, input }) {
  if (isOllamaUrl(baseUrl)) return requestOllama({ model, baseUrl, schema, instructions, input });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const response = await fetch(`${String(baseUrl).replace(/\/$/, "")}/chat/completions`, {
    method: "POST", signal: AbortSignal.timeout(120_000), headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: instructions }, { role: "user", content: JSON.stringify(input) }],
      response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
      max_tokens: 4096,
      stream: false
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("Paikallinen malli", response.status, data);
  const content = data.choices?.[0]?.message?.content;
  const outputText = Array.isArray(content) ? content.map(part => part.text || "").join("") : content;
  if (!outputText) throw curatorError(502, "Paikallinen malli ei palauttanut rakenteista ohjelmaa.");
  return parseStructured(outputText);
}

async function requestOllama({ model, baseUrl, schema, instructions, input }) {
  const response = await fetch(`${ollamaRoot(baseUrl)}/api/chat`, {
    method: "POST", signal: AbortSignal.timeout(120_000), headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: instructions }, { role: "user", content: JSON.stringify(input) }],
      format: schema,
      stream: false,
      keep_alive: "10m",
      options: { temperature: 0 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("Paikallinen malli", response.status, data);
  const outputText = data.message?.content;
  if (!outputText) throw curatorError(502, "Paikallinen malli ei palauttanut rakenteista ohjelmaa.");
  return parseStructured(outputText);
}

function isOllamaUrl(baseUrl) {
  try { return new URL(String(baseUrl)).port === "11434"; }
  catch { return false; }
}

function ollamaRoot(baseUrl) {
  const url = new URL(String(baseUrl || "http://127.0.0.1:11434/v1"));
  url.pathname = url.pathname.replace(/\/v1\/?$/, "").replace(/\/$/, "");
  url.search = ""; url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function requestGemini({ apiKey, model, schema, instructions, input }) {
  const safeModel = encodeURIComponent(model);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(90_000),
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema, maxOutputTokens: 4096 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError("Gemini", response.status, data);
  const outputText = data.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("");
  if (!outputText) throw curatorError(502, "Gemini ei palauttanut rakenteista ohjelmaa.");
  return parseStructured(outputText);
}

function parseStructured(value) {
  try { return JSON.parse(String(value).replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
  catch { throw curatorError(502, "Kuraattorimalli palautti virheellisen rakenteisen vastauksen."); }
}

function validateCompiledIntent(parsed) {
  const program = parsed?.program;
  const arrays = [program?.include, program?.exclude, program?.tone, program?.social_scope, program?.content_forms, program?.languages, program?.required_sources];
  const weights = program?.weights;
  const discovery = program?.discovery;
  const valid = typeof parsed?.clarification_needed === "boolean"
    && (parsed.clarification_question === null || typeof parsed.clarification_question === "string")
    && typeof program?.intent === "string"
    && ["topical", "broad_personal", "broad_discovery"].includes(program?.selection_mode)
    && ["any", "people", "publishers"].includes(program?.origin_scope)
    && arrays.every(Array.isArray)
    && weights && ["relevance", "tone", "freshness", "social", "engagement"].every(key => boundedNumber(weights[key], 0, 100))
    && boundedNumber(program?.diversity?.max_per_author, 1, 10)
    && boundedNumber(program?.horizon_hours, 6, 336)
    && boundedNumber(program?.familiarity_target, 0, 100)
    && typeof program?.market_context === "string"
    && discovery && [discovery.bluesky_queries, discovery.reddit_queries, discovery.mastodon_tags].every(Array.isArray);
  if (!valid) throw curatorError(502, "Kuraattorimalli palautti puutteellisen ranking-ohjelman.");
}

function validateEvaluation(parsed, opaqueIds) {
  const evaluated = parsed?.evaluated;
  if (!Array.isArray(evaluated) || evaluated.length !== opaqueIds.size) {
    throw curatorError(502, "Kuraattorimalli ei arvioinut koko ehdokasjoukkoa.");
  }
  const seen = new Set();
  for (const item of evaluated) {
    const valid = opaqueIds.has(item?.id) && !seen.has(item.id)
      && boundedNumber(item.semantic_score, 0, 100) && boundedNumber(item.tone_score, 0, 100)
      && typeof item.core_match === "boolean" && typeof item.hard_excluded === "boolean" && Array.isArray(item.reasons) && item.reasons.length > 0;
    if (!valid) throw curatorError(502, "Kuraattorimalli palautti virheellisen ehdokasarvion.");
    seen.add(item.id);
  }
}

function boundedNumber(value, minimum, maximum) {
  return Number.isFinite(Number(value)) && Number(value) >= minimum && Number(value) <= maximum;
}

function providerError(provider, status, data) {
  const type = data?.error?.type || data?.error?.code || data?.type;
  const suffix = type ? ` (${String(type).slice(0, 80)})` : "";
  const label = provider === "Paikallinen malli" ? "Paikallinen mallikutsu" : `${provider}-mallikutsu`;
  return curatorError(status >= 400 && status < 600 ? status : 502, `${label} epäonnistui${suffix}.`);
}

function curatorError(status: number, message: string): Error & { status: number } { return Object.assign(new Error(message), { status }); }
