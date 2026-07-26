const AUTHORIZE_URL = "https://www.reddit.com/api/v1/authorize";
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_ORIGIN = "https://oauth.reddit.com";
const applicationSessions = new Map();

export function redditConfigured(config) {
  return Boolean(config.clientId && config.clientSecret && config.redirectUri && config.userAgent);
}

export function createRedditAuthorizationUrl(config, state) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    state,
    redirect_uri: config.redirectUri,
    duration: "permanent",
    scope: "read"
  });
  return `${AUTHORIZE_URL}?${params}`;
}

export async function exchangeRedditCode(config, code) {
  return requestToken(config, new URLSearchParams({
    grant_type: "authorization_code", code, redirect_uri: config.redirectUri
  }));
}

export async function refreshRedditSession(config, session) {
  if (!session.refreshToken) throw providerError(401, "Reddit-istunto vanheni. Yhdistä tili uudelleen.");
  const refreshed = await requestToken(config, new URLSearchParams({
    grant_type: "refresh_token", refresh_token: session.refreshToken
  }));
  return { ...session, ...refreshed, refreshToken: refreshed.refreshToken || session.refreshToken };
}

export async function getRedditApplicationSession(config) {
  const cached = applicationSessions.get(config.clientId);
  if (cached?.expiresAt > Date.now()) return cached;
  const session = await requestToken(config, new URLSearchParams({ grant_type: "client_credentials" }));
  applicationSessions.set(config.clientId, session);
  return session;
}

export async function fetchRedditHome(config, session, { limit = 40 } = {}) {
  const params = new URLSearchParams({ limit: String(Math.min(limit, 100)), raw_json: "1" });
  const response = await fetch(`${API_ORIGIN}/best?${params}`, {
    headers: { authorization: `Bearer ${session.accessToken}`, "user-agent": config.userAgent }, signal: AbortSignal.timeout(10_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, data.message || data.error || "Reddit-feedin haku epäonnistui.");
  return (data.data?.children || []).map(child => normalizeRedditPost(child.data)).filter(item => item.text);
}

export async function searchRedditPosts(config, session, queries, { limitPerQuery = 12 } = {}) {
  const cleanQueries = [...new Set((queries || []).map(query => String(query).trim()).filter(Boolean))].slice(0, 3);
  const responses = await Promise.allSettled(cleanQueries.map(async query => {
    const params = new URLSearchParams({ q: query.slice(0, 120), limit: String(Math.min(limitPerQuery, 25)), raw_json: "1", sort: "relevance", t: "month", type: "link" });
    const response = await fetch(`${API_ORIGIN}/search?${params}`, {
      headers: { authorization: `Bearer ${session.accessToken}`, "user-agent": config.userAgent }, signal: AbortSignal.timeout(10_000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw providerError(response.status, data.message || data.error || "Reddit-haun suoritus epäonnistui.");
    return (data.data?.children || []).map(child => ({ ...normalizeRedditPost(child.data), feedLayer: "discovery", socialContext: `Reddit-haku · ${query}` }));
  }));
  const unique = new Map();
  for (const item of responses.flatMap(result => result.status === "fulfilled" ? result.value : [])) if (item.text && !unique.has(item.id)) unique.set(item.id, item);
  return [...unique.values()].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

async function requestToken(config, body) {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": config.userAgent
    },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw providerError(response.status || 400, `Reddit-valtuutus epäonnistui: ${data.error || "tuntematon virhe"}.`);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000,
    scope: data.scope || ""
  };
}

function normalizeRedditPost(post) {
  const selfText = post.selftext && post.selftext !== "[removed]" && post.selftext !== "[deleted]" ? post.selftext : "";
  return {
    id: `reddit:${post.name || post.id}`,
    sourceType: "reddit",
    sourceName: "Reddit",
    canonicalUrl: `https://www.reddit.com${post.permalink || ""}`,
    author: { id: post.author_fullname || post.author, name: `u/${post.author || "unknown"}`, handle: `r/${post.subreddit || "reddit"}`, avatar: null },
    text: [post.title, selfText].filter(Boolean).join("\n\n").slice(0, 6000),
    language: null,
    publishedAt: new Date(Number(post.created_utc || 0) * 1000).toISOString(),
    indexedAt: new Date().toISOString(),
    engagement: { likes: post.score || 0, replies: post.num_comments || 0, reposts: 0 },
    socialContext: `Tilauksistasi · r/${post.subreddit || "reddit"}`,
    reply: null,
    labels: post.over_18 ? ["adult"] : [],
    media: extractPreview(post)
  };
}

function extractPreview(post) {
  const image = post.preview?.images?.[0]?.source;
  if (!image?.url) return [];
  return [{ type: "image", url: decodeEntities(image.url), thumbnailUrl: decodeEntities(post.thumbnail?.startsWith("http") ? post.thumbnail : image.url), alt: post.title || "" }];
}

function decodeEntities(value) {
  return value.replaceAll("&amp;", "&");
}

function providerError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
