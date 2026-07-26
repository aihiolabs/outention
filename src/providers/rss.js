import { fetchPublicUrl, publicHttpsUrl } from "../security.js";

const MAX_BYTES = 2_000_000;

export async function fetchRssFeed({ url, name }, { limit = 25, network = {} } = {}) {
  const feedUrl = publicFeedUrl(url);
  const response = await fetchPublicUrl(feedUrl, { headers: { accept: "application/atom+xml, application/rss+xml, application/xml, text/xml" } }, network);
  if (!response.ok) throw providerError(response.status, "Syötteen haku epäonnistui.");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BYTES) throw providerError(413, "Syöte on liian suuri.");
  const xml = await readLimited(response.body, MAX_BYTES);
  const channelTitle = cleanText(tagValue(xml, "title")) || name || new URL(feedUrl).hostname;
  const itemBlocks = blocks(xml, "item");
  const entryBlocks = itemBlocks.length ? [] : blocks(xml, "entry");
  return (itemBlocks.length ? itemBlocks.map(item => normalizeRss(item, feedUrl, name || channelTitle)) : entryBlocks.map(item => normalizeAtom(item, feedUrl, name || channelTitle)))
    .filter(item => item.text && item.canonicalUrl)
    .slice(0, Math.min(limit, 50));
}

export function normalizeFeedConnection({ url, name = "" }) {
  return { url: publicFeedUrl(url), name: String(name).trim().slice(0, 80) };
}

export function parseOpmlFeeds(xml, { limit = 20 } = {}) {
  const source = String(xml || "");
  if (!/<opml\b/i.test(source)) throw providerError(400, "Tiedosto ei ole OPML-tiedosto.");
  const feeds = [];
  const seen = new Set();
  for (const match of source.matchAll(/<outline\b([^>]*)>/gi)) {
    const attributes = match[1];
    const url = decodeEntities(attribute(attributes, "xmlUrl") || attribute(attributes, "url"));
    if (!url || seen.has(url)) continue;
    const name = decodeEntities(attribute(attributes, "title") || attribute(attributes, "text"));
    try {
      const feed = normalizeFeedConnection({ url, name });
      feeds.push(feed); seen.add(feed.url);
    } catch { /* Invalid or private entries are skipped. */ }
    if (feeds.length >= Math.min(50, Math.max(1, limit))) break;
  }
  if (!feeds.length) throw providerError(400, "OPML-tiedostosta ei löytynyt julkisia HTTPS-syötteitä.");
  return feeds;
}

function normalizeRss(xml, feedUrl, sourceName) {
  const title = cleanText(tagValue(xml, "title"));
  const description = cleanText(tagValue(xml, "description") || tagValue(xml, "content:encoded"));
  const canonicalUrl = cleanText(tagValue(xml, "link")) || feedUrl;
  const guid = cleanText(tagValue(xml, "guid")) || canonicalUrl;
  return commonItem({ xml, feedUrl, sourceName, title, description, canonicalUrl, guid, publishedAt: tagValue(xml, "pubDate") || tagValue(xml, "dc:date") });
}

function normalizeAtom(xml, feedUrl, sourceName) {
  const title = cleanText(tagValue(xml, "title"));
  const description = cleanText(tagValue(xml, "content") || tagValue(xml, "summary"));
  const canonicalUrl = attrValue(xml, "link", "href") || feedUrl;
  const guid = cleanText(tagValue(xml, "id")) || canonicalUrl;
  return commonItem({ xml, feedUrl, sourceName, title, description, canonicalUrl, guid, publishedAt: tagValue(xml, "published") || tagValue(xml, "updated") });
}

function commonItem({ xml, feedUrl, sourceName, title, description, canonicalUrl, guid, publishedAt }) {
  const youtube = /youtube\.com\/feeds\/videos\.xml/.test(feedUrl);
  const authorName = cleanText(tagValue(xml, "name") || tagValue(xml, "author") || tagValue(xml, "dc:creator")) || sourceName;
  const thumbnail = attrValue(xml, "media:thumbnail", "url") || attrValue(xml, "enclosure", "url");
  const date = new Date(cleanText(publishedAt) || Date.now());
  return {
    id: `${youtube ? "youtube" : "rss"}:${stableId(guid)}`,
    sourceType: youtube ? "youtube" : "rss",
    sourceName: youtube ? "YouTube" : sourceName,
    feedLayer: "discovery",
    canonicalUrl: absoluteUrl(canonicalUrl, feedUrl),
    author: { id: authorName, name: authorName, handle: sourceName, avatar: null },
    text: [title, description && description !== title ? description : ""].filter(Boolean).join("\n\n").slice(0, 6000),
    language: null,
    publishedAt: Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
    indexedAt: new Date().toISOString(),
    engagement: { likes: 0, replies: 0, reposts: 0 },
    socialContext: youtube ? "YouTube-kanavasyöte" : "RSS/Atom-tilaus",
    reply: null,
    labels: [],
    media: thumbnail ? [{ type: youtube ? "video" : "image", url: absoluteUrl(thumbnail, feedUrl), thumbnailUrl: absoluteUrl(thumbnail, feedUrl), alt: title }] : []
  };
}

function blocks(xml, tag) {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map(match => match[1]);
}

function tagValue(xml, tag) {
  const escaped = tag.replace(":", "\\:");
  return xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"))?.[1] || "";
}

function attrValue(xml, tag, attr) {
  const escaped = tag.replace(":", "\\:");
  const open = xml.match(new RegExp(`<${escaped}\\s[^>]*>`, "i"))?.[0] || "";
  return decodeEntities(open.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"))?.[1] || "");
}

function attribute(value, name) {
  return value.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"))?.[1] || "";
}

function cleanText(value = "") {
  return decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeEntities(value) {
  return value.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function publicFeedUrl(value) {
  try { return publicHttpsUrl(value).toString(); }
  catch (error) { throw providerError(error.status || 400, "Syötteen pitää olla julkinen HTTPS-osoite."); }
}

function absoluteUrl(value, base) {
  try { return publicHttpsUrl(new URL(value, base).toString()).toString(); }
  catch { return base; }
}
function stableId(value) { let hash = 2166136261; for (const char of value) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(36); }
async function readLimited(stream, maxBytes) { const reader = stream.getReader(); const chunks = []; let size = 0; while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); throw providerError(413, "Syöte on liian suuri."); } chunks.push(value); } return new TextDecoder().decode(Buffer.concat(chunks)); }
function providerError(status, message) { const error = new Error(message); error.status = status; return error; }
