export function rankEvaluatedCandidates({ candidates, evaluated, program, limit = 20, offset = 0 }) {
  const signals = new Map(evaluated.map(item => [item.id, item]));
  const weights = normalizedWeights(program.weights);
  const horizon = clamp(program.horizon_hours, 6, 336, 72);
  const maxPerAuthor = clamp(program.diversity?.max_per_author, 1, 10, 2);
  const now = Date.now();
  const minimumRelevance = program.selection_mode === "broad_personal"
    ? 0
    : program.selection_mode === "broad_discovery"
      ? 35
      : relevanceFloor(program.weights?.relevance);
  const scored = candidates.flatMap(item => {
    if (!candidateMatchesSelectionMode(item, program.selection_mode)) return [];
    if (!candidateMatchesRequiredSources(item, program.required_sources)) return [];
    if (!candidateMatchesOriginScope(item, program.origin_scope)) return [];
    const signal = signals.get(item.id);
    if (!signal || signal.core_match === false || signal.hard_excluded || signal.semantic_score < minimumRelevance) return [];
    const ageHours = Math.max(0, (now - new Date(item.publishedAt).getTime()) / 3_600_000);
    const freshness = Math.max(0, 100 * (1 - ageHours / horizon));
    const engagement = engagementScore(item.engagement || {});
    const familiarity = item.feedLayer === "personal" ? 100 : 0;
    const familiarityFit = 100 - Math.abs(familiarity - clamp(program.familiarity_target, 0, 100, 70));
    const score = weights.relevance * signal.semantic_score + weights.tone * signal.tone_score + weights.freshness * freshness + weights.social * familiarityFit + weights.engagement * engagement;
    return [{ item, signal, score, components: { relevance: signal.semantic_score, tone: signal.tone_score, freshness, familiarity: familiarityFit, engagement } }];
  }).sort((a, b) => b.score - a.score);

  const authorCounts = new Map();
  const sourceCounts = new Map();
  const selected = [];
  const remaining = [...scored];
  while (remaining.length && selected.length < offset + limit) {
    const eligible = remaining.filter(entry => (authorCounts.get(authorKey(entry.item)) || 0) < maxPerAuthor);
    if (!eligible.length) break;
    let entry = eligible[0];
    if (selected.length >= 4 && wouldDominateSource(entry.item, sourceCounts, selected.length)) {
      const alternative = eligible.find(candidate => sourceKey(candidate.item) !== sourceKey(entry.item));
      if (alternative) entry = alternative;
    }
    remaining.splice(remaining.indexOf(entry), 1);
    const author = authorKey(entry.item);
    const source = sourceKey(entry.item);
    authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
    sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
    selected.push({
      id: entry.item.id,
      score: Math.round(entry.score * 10) / 10,
      reasons: entry.signal.reasons,
      components: Object.fromEntries(Object.entries(entry.components).map(([key, value]) => [key, Math.round(value)]))
    });
  }
  return selected.slice(offset, offset + limit);
}

export function filterCandidatesBySelectionMode(candidates, selectionMode = "topical") {
  return candidates.filter(item => candidateMatchesSelectionMode(item, selectionMode));
}

export function filterCandidatesByRequiredSources(candidates, requiredSources = []) {
  return candidates.filter(item => candidateMatchesRequiredSources(item, requiredSources));
}

export function filterCandidatesByOriginScope(candidates, originScope = "any") {
  return candidates.filter(item => candidateMatchesOriginScope(item, originScope));
}

function candidateMatchesSelectionMode(item, selectionMode) {
  if (selectionMode === "broad_personal") return item.feedLayer === "personal";
  return true;
}

function candidateMatchesRequiredSources(item, requiredSources = []) {
  if (!requiredSources.length) return true;
  return requiredSources.includes(candidateSourceId(item));
}

function candidateMatchesOriginScope(item, originScope) {
  const peopleSource = item.feedLayer === "personal" || ["bluesky", "mastodon", "threads", "reddit"].includes(item.sourceType);
  if (originScope === "people") return peopleSource;
  if (originScope === "publishers") return !peopleSource;
  return true;
}

function candidateSourceId(item) {
  if (item.sourceType === "rss" && /\byle\b/i.test(String(item.sourceName || ""))) return "yle";
  return item.sourceType || "unknown";
}

export function summarizeRankingQuality({ candidates, evaluated, program }) {
  const ranked = rankEvaluatedCandidates({ candidates, evaluated, program, limit: candidates.length });
  const byId = new Map(candidates.map(item => [item.id, item]));
  const authors = new Set();
  const sources = new Set();
  for (const result of ranked) {
    const item = byId.get(result.id);
    if (!item) continue;
    authors.add(authorKey(item));
    sources.add(sourceKey(item));
  }
  const target = Math.min(10, candidates.length);
  const enoughAuthors = authors.size >= Math.min(3, ranked.length);
  const status = ranked.length === 0 ? "empty" : ranked.length < target || !enoughAuthors ? "sparse" : "healthy";
  return {
    status,
    eligible: ranked.length,
    evaluated: evaluated.length,
    uniqueAuthors: authors.size,
    uniqueSources: sources.size
  };
}

function relevanceFloor(relevanceWeight) {
  const weight = clamp(relevanceWeight, 0, 100, 45);
  return weight <= 0 ? 0 : Math.min(75, Math.max(60, weight * .8));
}

function wouldDominateSource(item, counts, selectedCount) {
  const source = sourceKey(item);
  const nextShare = ((counts.get(source) || 0) + 1) / (selectedCount + 1);
  return nextShare > .65;
}

function authorKey(item) { return item.author.id || item.author.handle; }
function sourceKey(item) { return item.sourceType || item.sourceName || item.feedLayer || "unknown"; }

export function selectCandidatePool(candidates, familiarityTarget = 70, limit = 80) {
  const boundedLimit = clamp(limit, 1, 100, 80);
  const target = clamp(familiarityTarget, 0, 100, 70);
  const personalShare = .2 + .75 * target / 100;
  const personalLimit = Math.round(boundedLimit * personalShare);
  const discoveryLimit = boundedLimit - personalLimit;
  const personal = candidates.filter(item => item.feedLayer === "personal");
  const discovery = candidates.filter(item => item.feedLayer !== "personal");
  const selected = [...personal.slice(0, personalLimit), ...discovery.slice(0, discoveryLimit)];
  if (selected.length < boundedLimit) {
    const selectedIds = new Set(selected.map(item => item.id));
    selected.push(...candidates.filter(item => !selectedIds.has(item.id)).slice(0, boundedLimit - selected.length));
  }
  return selected.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

// The deterministic middle layer of the onion: use source-native order,
// metadata and cheap lexical signals to avoid sending the whole retrieval
// buffer to a model. It deliberately keeps a per-source reserve so a noisy
// source cannot erase the others before semantic evaluation.
export function triageCandidates(candidates, program = {}, limit = 36) {
  const boundedLimit = clamp(limit, 1, 60, 36);
  if (candidates.length <= boundedLimit) return [...candidates];
  const terms = triageTerms(program);
  const horizon = clamp(program.horizon_hours, 6, 336, 72);
  const now = Date.now();
  const scored = candidates.map((item, index) => {
    const haystack = candidateText(item);
    const lexical = terms.reduce((sum, term) => sum + (haystack.includes(term) ? Math.min(18, 5 + term.length) : 0), 0);
    const ageHours = Math.max(0, (now - new Date(item.publishedAt || now).getTime()) / 3_600_000);
    const freshness = Math.max(0, 16 * (1 - ageHours / horizon));
    const nativeOrder = Math.max(0, 14 - index / Math.max(1, candidates.length) * 14);
    const personal = item.feedLayer === "personal" ? 8 : 0;
    const context = item.retrievalContext ? 3 : 0;
    return { item, index, score: lexical + freshness + nativeOrder + personal + context };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const selected = [];
  const selectedIds = new Set();
  const sourceGroups = new Map();
  for (const entry of scored) {
    const key = sourceKey(entry.item);
    if (!sourceGroups.has(key)) sourceGroups.set(key, []);
    sourceGroups.get(key).push(entry);
  }
  // One strong candidate from each source first, then fill by score.
  for (const group of sourceGroups.values()) {
    if (selected.length >= boundedLimit) break;
    selectEntry(group[0], selected, selectedIds);
  }
  for (const entry of scored) {
    if (selected.length >= boundedLimit) break;
    selectEntry(entry, selected, selectedIds);
  }
  return selected.map(entry => entry.item);
}

function selectEntry(entry, selected, selectedIds) {
  if (!entry || selectedIds.has(entry.item.id)) return;
  selected.push(entry);
  selectedIds.add(entry.item.id);
}

function triageTerms(program) {
  const values = [
    program.intent,
    ...(program.include || []),
    ...(program.content_forms || []),
    ...(program.discovery?.bluesky_queries || []),
    ...(program.discovery?.reddit_queries || []),
    ...(program.discovery?.mastodon_tags || [])
  ];
  return [...new Set(values.flatMap(value => String(value || "").toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []))].slice(0, 40);
}

function candidateText(item) {
  return [item.text, item.title, item.sourceName, item.retrievalContext, ...(item.tags || [])]
    .filter(Boolean).join(" ").toLocaleLowerCase();
}

function normalizedWeights(input = {}) {
  const values = {
    relevance: clamp(input.relevance, 0, 100, 45),
    tone: clamp(input.tone, 0, 100, 10),
    freshness: clamp(input.freshness, 0, 100, 20),
    social: clamp(input.social, 0, 100, 20),
    engagement: clamp(input.engagement, 0, 100, 5)
  };
  const total = Object.values(values).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value / total]));
}

function engagementScore({ likes = 0, replies = 0, reposts = 0 }) {
  const value = Math.max(0, likes + replies * 2 + reposts * 1.5);
  return Math.min(100, Math.log1p(value) / Math.log(1001) * 100);
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}
