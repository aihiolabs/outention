import { reconcileContentLanguage } from "../language.js";
import type { Candidate } from "../types.js";

const DEFAULT_PDS = "https://bsky.social";

export async function connectBluesky({ identifier, password, service = DEFAULT_PDS }) {
  const response = await fetch(`${cleanOrigin(service)}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier, password })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, data.message || "Bluesky-kirjautuminen epäonnistui. Tarkista tunnus ja salasana.");
  return {
    pds: cleanOrigin(service), accessJwt: data.accessJwt, refreshJwt: data.refreshJwt,
    did: data.did, handle: data.handle, displayName: data.displayName || data.handle
  };
}

export async function refreshBlueskySession(session) {
  const response = await fetch(`${session.pds}/xrpc/com.atproto.server.refreshSession`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${session.refreshJwt}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, "Bluesky-istunto vanheni. Yhdistä tili uudelleen.");
  return { ...session, accessJwt: data.accessJwt, refreshJwt: data.refreshJwt, handle: data.handle || session.handle, did: data.did || session.did };
}

export function isBlueskyAccessTokenError(error) {
  return error?.status === 401
    || ["ExpiredToken", "InvalidToken"].includes(error?.providerCode)
    || /token has expired/i.test(String(error?.message || ""));
}

export async function fetchBlueskyTimeline(session, { limit = 50 } = {}) {
  const params = new URLSearchParams({ limit: String(Math.min(limit, 100)) });
  const response = await fetch(`${session.pds}/xrpc/app.bsky.feed.getTimeline?${params}`, {
    headers: { authorization: `Bearer ${session.accessJwt}` }, signal: AbortSignal.timeout(10_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, data.message || "Bluesky-feedin haku epäonnistui.", data.error);
  return (data.feed || []).map(entry => ({ ...normalizeFeedViewPost(entry), feedLayer: "personal" })).filter(item => item.text);
}

export async function searchBlueskyPosts(queries: unknown[] = [], { limitPerQuery = 15 } = {}) {
  const cleanQueries = [...new Set((queries || []).map(query => String(query).trim()).filter(Boolean))].slice(0, 3);
  const responses = await Promise.allSettled(cleanQueries.map(async query => {
    const params = new URLSearchParams({ q: query, limit: String(Math.min(limitPerQuery, 25)), sort: "latest" });
    const response = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?${params}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw providerError(response.status, data.message || "Bluesky-haun suoritus epäonnistui.");
    return (data.posts || []).map(post => ({ ...normalizeFeedViewPost({ post }), feedLayer: "discovery", socialContext: `Bluesky-haku · ${query}` }));
  }));
  const unique = new Map<string, Candidate>();
  for (const item of responses.flatMap(result => result.status === "fulfilled" ? result.value : [])) if (item.text && !unique.has(item.id)) unique.set(item.id, item);
  return [...unique.values()].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export async function publishBlueskyPost(session, { text, createdAt = new Date().toISOString() }) {
  const value = String(text || "").trim();
  if (!value) throw providerError(400, "Julkaisu ei voi olla tyhjä.");
  if ([...value].length > 300) throw providerError(400, "Bluesky-julkaisu voi olla enintään 300 merkkiä.");
  const response = await fetch(`${session.pds}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${session.accessJwt}`, "content-type": "application/json" },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: { $type: "app.bsky.feed.post", text: value, createdAt }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, data.message || "Julkaiseminen Blueskyyn epäonnistui.", data.error);
  return { destination: "bluesky", id: data.uri, url: blueskyUrl(data.uri, session.handle) };
}

function normalizeFeedViewPost(entry) {
  const post = entry.post || {};
  const record = post.record || {};
  const author = post.author || {};
  const reason = entry.reason || null;
  return {
    id: post.uri,
    sourceType: "bluesky",
    sourceName: "Bluesky",
    canonicalUrl: blueskyUrl(post.uri, author.handle),
    author: { id: author.did, name: author.displayName || author.handle, handle: `@${author.handle}`, avatar: author.avatar || null },
    text: record.text || "",
    language: reconcileContentLanguage(record.text, Array.isArray(record.langs) ? record.langs[0] : null),
    publishedAt: record.createdAt || post.indexedAt,
    indexedAt: post.indexedAt,
    engagement: { likes: post.likeCount || 0, replies: post.replyCount || 0, reposts: post.repostCount || 0 },
    socialContext: reason?.by ? `Uudelleenjakoi ${reason.by.displayName || reason.by.handle}` : null,
    reply: record.reply ? { root: record.reply.root?.uri || null, parent: record.reply.parent?.uri || null } : null,
    labels: (post.labels || []).map(label => label.val),
    media: extractMedia(post.embed)
  };
}

function extractMedia(embed) {
  const mediaView = embed?.media || embed || {};
  const images = mediaView.images || [];
  const result = images.slice(0, 4).map(image => ({
    type: "image", url: image.fullsize || image.thumb, thumbnailUrl: image.thumb || image.fullsize,
    alt: image.alt || "", aspectRatio: image.aspectRatio || null
  }));
  if (mediaView.playlist || mediaView.$type?.includes("video")) result.push({
    type: "video", url: mediaView.playlist || null, thumbnailUrl: mediaView.thumbnail || null,
    alt: mediaView.alt || "", aspectRatio: mediaView.aspectRatio || null
  });
  const external = embed?.external || mediaView.external;
  if (external?.uri) result.push({
    type: "link", url: external.uri, thumbnailUrl: external.thumb || null,
    title: external.title || "", description: external.description || ""
  });
  const quoteView = embed?.record?.record || embed?.record;
  const quoteRecord = quoteView?.value;
  if (quoteRecord?.text && quoteView?.author) result.push({
    type: "quote", url: blueskyUrl(quoteView.uri, quoteView.author.handle),
    title: quoteView.author.displayName || quoteView.author.handle,
    handle: `@${quoteView.author.handle}`, description: quoteRecord.text
  });
  return result;
}

function blueskyUrl(uri, handle) {
  const rkey = uri?.split("/").pop();
  return handle && rkey ? `https://bsky.app/profile/${handle}/post/${rkey}` : "https://bsky.app/";
}

function cleanOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw providerError(400, "PDS-osoitteen pitää käyttää HTTPS-yhteyttä.");
  return url.origin;
}

function providerError(status: number, message: string, providerCode: string | null = null): Error & { status: number; providerCode: string | null } {
  return Object.assign(new Error(message), { status, providerCode });
}
