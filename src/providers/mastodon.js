import { fetchPublicUrl, publicHttpsUrl } from "../security.js";

const SCOPES = "read:statuses read:accounts write:statuses";

export async function createMastodonAuthorization({ instance, redirectUri, state, network = {} }) {
  const origin = mastodonOrigin(instance);
  const registration = await postForm(`${origin}/api/v1/apps`, {
    client_name: "Outention",
    redirect_uris: redirectUri,
    scopes: SCOPES,
    website: ""
  }, network);
  if (!registration.client_id || !registration.client_secret) throw providerError(502, "Mastodon-instanssi ei palauttanut sovellustunnuksia.");
  const params = new URLSearchParams({
    client_id: registration.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    state
  });
  return {
    authorizationUrl: `${origin}/oauth/authorize?${params}`,
    instance: origin,
    clientId: registration.client_id,
    clientSecret: registration.client_secret
  };
}

export async function exchangeMastodonCode(pending, code, redirectUri) {
  const token = await postForm(`${pending.instance}/oauth/token`, {
    client_id: pending.clientId,
    client_secret: pending.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code,
    scope: SCOPES
  });
  if (!token.access_token) throw providerError(502, "Mastodon ei palauttanut käyttöoikeustunnusta.");
  const profile = await requestJson(`${pending.instance}/api/v1/accounts/verify_credentials`, token.access_token);
  return {
    instance: pending.instance,
    accessToken: token.access_token,
    handle: profile.acct ? `@${profile.acct}` : new URL(pending.instance).hostname,
    displayName: plainText(profile.display_name) || profile.username || "Mastodon"
  };
}

export async function fetchMastodonHome(session, { limit = 40, network = {} } = {}) {
  const params = new URLSearchParams({ limit: String(Math.min(limit, 40)) });
  const statuses = await requestJson(`${session.instance}/api/v1/timelines/home?${params}`, session.accessToken, network);
  return statuses.map(status => ({ ...normalizeStatus(status), feedLayer: "personal" })).filter(item => item.text);
}

export async function fetchMastodonHashtags(tags, { instance = "https://mastodon.social", accessToken = null, limitPerTag = 15, network = {} } = {}) {
  const origin = mastodonOrigin(instance);
  const cleanTags = [...new Set((tags || []).map(tag => String(tag).replace(/^#/, "").trim()).filter(tag => /^[\p{L}\p{N}_-]+$/u.test(tag)))].slice(0, 3);
  const responses = await Promise.allSettled(cleanTags.map(async tag => {
    const headers = { accept: "application/json" };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    const response = await fetchPublicUrl(`${origin}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=${Math.min(limitPerTag, 40)}`, { headers }, network);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw providerError(response.status, data.error || "Mastodon-hashtag-feedin haku epäonnistui.");
    return data.map(status => ({ ...normalizeStatus(status), feedLayer: "discovery", socialContext: `Mastodon-haku · #${tag}` }));
  }));
  const unique = new Map();
  for (const item of responses.flatMap(result => result.status === "fulfilled" ? result.value : [])) if (item.text && !unique.has(item.id)) unique.set(item.id, item);
  return [...unique.values()].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
}

export async function publishMastodonStatus(session, { text, visibility = "public", network = {} }) {
  const value = String(text || "").trim();
  if (!value) throw providerError(400, "Julkaisu ei voi olla tyhjä.");
  if (value.length > 5000) throw providerError(400, "Julkaisu on liian pitkä.");
  const result = await postForm(`${session.instance}/api/v1/statuses`, {
    status: value,
    visibility: ["public", "unlisted", "private"].includes(visibility) ? visibility : "public"
  }, network, session.accessToken);
  return { destination: "mastodon", id: result.id, url: result.url || result.uri || session.instance };
}

function normalizeStatus(status) {
  const boost = status.reblog;
  const post = boost || status;
  const account = post.account || {};
  const text = [plainText(post.spoiler_text), plainText(post.content)].filter(Boolean).join("\n\n");
  return {
    id: `mastodon:${post.uri || post.id}`,
    sourceType: "mastodon",
    sourceName: new URL(post.url || status.url).hostname,
    canonicalUrl: post.url || status.url,
    author: {
      id: account.id || account.acct,
      name: plainText(account.display_name) || account.username || account.acct || "Mastodon",
      handle: account.acct ? `@${account.acct}` : "Mastodon",
      avatar: account.avatar_static || account.avatar || null
    },
    text: text.slice(0, 6000),
    language: post.language || null,
    publishedAt: post.created_at,
    indexedAt: new Date().toISOString(),
    engagement: { likes: post.favourites_count || 0, replies: post.replies_count || 0, reposts: post.reblogs_count || 0 },
    socialContext: boost ? `${status.account?.acct || "Seuraamasi käyttäjä"} boostasi` : "Mastodon Home",
    reply: post.in_reply_to_id ? { id: post.in_reply_to_id } : null,
    labels: post.sensitive ? ["sensitive"] : [],
    media: (post.media_attachments || []).map(media => ({
      type: media.type || "image",
      url: media.url,
      thumbnailUrl: media.preview_url || media.url,
      alt: media.description || "",
      mimeType: media.mime_type || null,
      aspectRatio: media.meta?.original?.aspect || null
    }))
  };
}

async function requestJson(url, accessToken, network = {}) {
  const response = await fetchPublicUrl(url, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } }, network);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, data.error || "Mastodon-pyyntö epäonnistui.");
  return data;
}

async function postForm(url, values, network = {}, accessToken = null) {
  const headers = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  const response = await fetchPublicUrl(url, {
    method: "POST",
    headers,
    body: new URLSearchParams(values)
  }, network);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw providerError(response.status, data.error_description || data.error || "Mastodon-valtuutus epäonnistui.");
  return data;
}

function mastodonOrigin(value) {
  let url;
  try { url = publicHttpsUrl(value.includes("://") ? value : `https://${value}`); }
  catch { throw providerError(400, "Anna kelvollinen Mastodon-instanssi, esimerkiksi mastodon.social."); }
  return url.origin;
}

function plainText(value = "") {
  return decodeEntities(value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, " ").replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim());
}

function decodeEntities(value) {
  return value.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function providerError(status, message) { const error = new Error(message); error.status = status; return error; }
