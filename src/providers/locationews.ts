const DEFAULT_BASE = "https://locationews.com";
const MUNICIPALITY_CACHE_MS = 24 * 60 * 60 * 1000;
let municipalityCache = { base: null, expiresAt: 0, items: [] };

export async function resolveLocationewsContext(context, { baseUrl = DEFAULT_BASE } = {}) {
  const text = String(context || "").trim();
  if (!text) return null;
  const municipalities = await fetchLocationewsMunicipalities({ baseUrl });
  return matchMunicipality(text, municipalities);
}

export function shouldResolveLocationContext(intent, profileContext = "") {
  const text = `${intent || ""} ${profileContext || ""}`.toLocaleLowerCase();
  return /\b(local|locally|nearby|near me|i live in|based in|my location)\b/u.test(text)
    || /\b(news|events|weather|what is happening|what's happening)\s+(in|from|around)\s+[a-z]/u.test(text)
    || /(paikallis|lähialue|läheltä|uutis|asun|asuinpaikka|sijainti)/u.test(text);
}

export async function fetchLocationewsMunicipalities({ baseUrl = DEFAULT_BASE } = {}) {
  const base = cleanOrigin(baseUrl);
  if (municipalityCache.base === base && municipalityCache.expiresAt > Date.now()) return municipalityCache.items;
  const response = await fetch(`${base}/api/kunnat`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
  const data = await response.json().catch(() => ([]));
  if (!response.ok) throw providerError(response.status, data.error || "Locationewsin paikkakuntien haku epäonnistui.");
  const rawItems = Array.isArray(data) ? data : data.kunnat || [];
  const items = rawItems
    .map(item => ({ kuntakoodi: String(item.kuntakoodi || "").padStart(3, "0"), name: String(item.name || "").trim() }))
    .filter(item => /^\d{3}$/.test(item.kuntakoodi) && item.name);
  municipalityCache = { base, expiresAt: Date.now() + MUNICIPALITY_CACHE_MS, items };
  return items;
}

export function matchMunicipality(context, municipalities) {
  const normalizedContext = normalizePlace(context);
  const words = normalizedContext.split(" ").filter(Boolean);
  let best = null;
  for (const municipality of municipalities || []) {
    const name = normalizePlace(municipality.name);
    if (!name) continue;
    let score = normalizedContext.includes(` ${name} `) || normalizedContext === name || normalizedContext.startsWith(`${name} `) || normalizedContext.endsWith(` ${name}`)
      ? 120 + name.length : 0;
    const nameWords = name.split(" ");
    if (nameWords.length === 1) {
      for (const word of words) score = Math.max(score, municipalityWordScore(word, name));
    } else {
      const matched = nameWords.every(nameWord => words.some(word => municipalityWordScore(word, nameWord) >= 90));
      if (matched) score = Math.max(score, 105 + name.length);
    }
    if (!best || score > best.score) best = { ...municipality, score };
  }
  return best?.score >= 90 ? { kuntakoodi: best.kuntakoodi, name: best.name } : null;
}

export async function fetchLocationewsStories({ baseUrl = DEFAULT_BASE, limit = 15, kunta, topic }: { baseUrl?: string; limit?: number; kunta?: string; topic?: string } = {}): Promise<Candidate[]> {
  const base = cleanOrigin(baseUrl);
  const params = new URLSearchParams({ limit: String(Math.min(limit, 50)) });
  if (kunta) params.set("kunta", kunta);
  if (topic) params.set("topic", topic);
  const response = await fetch(`${base}/api/feed?${params}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, data.error || "Locationews-uutisten haku epäonnistui.");
  return (data.stories || []).map(story => normalizeStory(story, base)).filter(item => item.text);
}

function normalizeStory(story, base) {
  const title = story.title || "";
  const lead = story.lead || "";
  return {
    id: `locationews:${story.id}`,
    sourceType: "locationews",
    sourceName: "Locationews",
    feedLayer: "discovery",
    canonicalUrl: `${base}/uutiset/${story.slug}`,
    author: {
      id: story.kuntakoodi || "locationews",
      name: story.sourceName || "Locationews",
      handle: story.kuntaName ? `📍 ${story.kuntaName}` : "📍 Suomi",
      avatar: null
    },
    text: lead ? `${title}\n\n${lead}` : title,
    language: "fi",
    publishedAt: story.publishedAt,
    indexedAt: story.publishedAt,
    engagement: { likes: 0, replies: 0, reposts: 0 },
    socialContext: story.topicName ? `Paikallisuutinen · ${story.topicName}` : "Paikallisuutinen",
    reply: null,
    labels: [],
    media: story.heroImage ? [{ type: "image", url: story.heroImage, thumbnailUrl: story.heroImage, alt: title }] : []
  };
}

function cleanOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw providerError(400, "Locationews-osoitteen pitää käyttää HTTPS-yhteyttä.");
  }
  return url.origin;
}

function municipalityWordScore(word, name) {
  if (word === name) return 120 + name.length;
  for (const form of wordForms(word)) {
    if (form === name) return 110 + name.length;
    if (Math.min(form.length, name.length) >= 5 && editDistanceAtMostOne(form, name)) return 100 + name.length;
  }
  return 0;
}

function wordForms(word) {
  const forms = new Set([word]);
  const suffixes = ["ssa", "sta", "lla", "lta", "lle", "ksi", "na", "ineen", "seen", "sen", "ssa", "sta", "lla", "lta", "sta", "n"];
  for (const suffix of suffixes) if (word.endsWith(suffix) && word.length - suffix.length >= 4) forms.add(word.slice(0, -suffix.length));
  return forms;
}

function editDistanceAtMostOne(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let i = 0; let j = 0; let differences = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i += 1; j += 1; continue; }
    if (++differences > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else { i += 1; j += 1; }
  }
  return differences + Number(i < left.length || j < right.length) <= 1;
}

function normalizePlace(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function providerError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}
import type { Candidate } from "../types.js";
