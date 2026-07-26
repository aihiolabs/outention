const API_ORIGIN = "https://graph.threads.net";
const AUTHORIZE_URL = "https://threads.net/oauth/authorize";
const DISCOVERY_SCOPE = "threads_basic,threads_keyword_search";
const THREAD_FIELDS = [
  "id", "media_type", "media_url", "gif_url", "permalink", "owner", "username", "text", "timestamp",
  "shortcode", "thumbnail_url", "children", "is_quote_post", "quoted_post", "reposted_post", "has_replies",
  "alt_text", "link_attachment_url", "topic_tag", "is_verified", "profile_picture_url"
].join(",");

export function threadsConfigured(config) {
  return Boolean(config.appId && config.appSecret && config.redirectUri);
}

export function createThreadsAuthorizationUrl(config, state) {
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    scope: DISCOVERY_SCOPE,
    response_type: "code",
    state
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeThreadsCode(config, code) {
  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri
  });
  const response = await fetch(`${API_ORIGIN}/oauth/access_token?${params}`, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw providerError(response.status || 400, threadsMessage(data, "Threads-valtuutus epäonnistui."));

  const longLived = await exchangeLongLivedToken(config, data.access_token).catch(() => null);
  const accessToken = longLived?.access_token || data.access_token;
  const expiresIn = Number(longLived?.expires_in || data.expires_in || 3600);
  const profile = await fetchThreadsProfile({ accessToken });
  return {
    accessToken,
    expiresAt: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    userId: profile.id || data.user_id || null,
    username: profile.username || null,
    name: profile.name || profile.username || null
  };
}

export async function fetchThreadsProfile(session) {
  const params = new URLSearchParams({ fields: "id,username,name,threads_profile_picture_url" });
  const response = await threadsRequest(`/me?${params}`, session);
  return response;
}

export async function searchThreadsPosts(session, queries: unknown[] = [], { limitPerQuery = 15, searchType = "RECENT" } = {}) {
  const cleanQueries = [...new Set((queries || []).map(query => String(query).trim()).filter(Boolean))].slice(0, 3);
  const type = String(searchType).toUpperCase() === "TOP" ? "TOP" : "RECENT";
  const responses = await Promise.allSettled(cleanQueries.map(async query => {
    const params = new URLSearchParams({
      q: query.slice(0, 120),
      search_type: type,
      search_mode: "KEYWORD",
      fields: THREAD_FIELDS,
      limit: String(Math.min(50, Math.max(1, Number(limitPerQuery) || 15)))
    });
    const data = await threadsRequest(`/keyword_search?${params}`, session);
    return (data.data || []).map(post => normalizeThreadsPost(post, query));
  }));
  const unique = new Map<string, Candidate>();
  let firstError = null;
  for (const result of responses) {
    if (result.status === "rejected") { firstError ||= result.reason; continue; }
    for (const item of result.value) if (item.text && !unique.has(item.id)) unique.set(item.id, item);
  }
  if (!unique.size && firstError && responses.every(result => result.status === "rejected")) throw firstError;
  return [...unique.values()].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

async function exchangeLongLivedToken(config, accessToken) {
  const params = new URLSearchParams({ grant_type: "th_exchange_token", client_secret: config.appSecret });
  const response = await fetch(`${API_ORIGIN}/access_token?${params}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw providerError(response.status || 400, threadsMessage(data, "Pitkäkestoisen Threads-tokenin luonti epäonnistui."));
  return data;
}

async function threadsRequest(path, session) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { authorization: `Bearer ${session.accessToken}`, accept: "application/json" }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, threadsMessage(data, "Threads-haku epäonnistui."));
  return data;
}

function normalizeThreadsPost(post, query) {
  const username = post.username || post.owner?.username || "threads-user";
  return {
    id: `threads:${post.id}`,
    sourceType: "threads",
    sourceName: "Threads",
    canonicalUrl: secureUrl(post.permalink) || `https://www.threads.net/@${encodeURIComponent(username)}`,
    author: {
      id: String(post.owner?.id || username),
      name: post.owner?.name || username,
      handle: `@${username}`,
      avatar: secureUrl(post.profile_picture_url || post.owner?.profile_picture_url)
    },
    text: String(post.text || "").trim(),
    language: null,
    publishedAt: post.timestamp || new Date().toISOString(),
    indexedAt: new Date().toISOString(),
    engagement: { likes: 0, replies: 0, reposts: 0 },
    socialContext: `Threads-haku · ${query}`,
    reply: null,
    labels: [],
    feedLayer: "discovery",
    media: extractThreadsMedia(post)
  };
}

function extractThreadsMedia(post) {
  const media = [];
  const type = String(post.media_type || "").toUpperCase();
  const mediaUrl = secureUrl(post.media_url || post.gif_url);
  const thumbnailUrl = secureUrl(post.thumbnail_url);
  if (mediaUrl && type.includes("IMAGE")) media.push({ type: "image", url: mediaUrl, thumbnailUrl: thumbnailUrl || mediaUrl, alt: post.alt_text || "" });
  if (mediaUrl && (type.includes("VIDEO") || post.gif_url)) media.push({ type: "video", url: mediaUrl, thumbnailUrl, alt: post.alt_text || "" });
  for (const child of post.children?.data || []) media.push(...extractThreadsMedia(child));
  const link = secureUrl(post.link_attachment_url);
  if (link) media.push({ type: "link", url: link, thumbnailUrl: null, title: new URL(link).hostname, description: "" });
  return media.slice(0, 6);
}

function secureUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; }
  catch { return null; }
}

function threadsMessage(data, fallback) {
  return data?.error?.message || data?.error_message || data?.message || fallback;
}

function providerError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}
import type { Candidate } from "../types.js";
