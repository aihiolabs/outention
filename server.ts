import { createServer } from "node:http";
import { chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { AuthStore } from "./src/auth.js";
import { PersonalConnectionStore } from "./src/personal-store.js";
import { mutationAllowed, requestIp, safeEqualSecret, SlidingWindowLimiter } from "./src/security.js";
import { connectBluesky, fetchBlueskyTimeline, isBlueskyAccessTokenError, publishBlueskyPost, refreshBlueskySession, searchBlueskyPosts } from "./src/providers/bluesky.js";
import { createRedditAuthorizationUrl, exchangeRedditCode, fetchRedditHome, getRedditApplicationSession, redditConfigured, refreshRedditSession, searchRedditPosts } from "./src/providers/reddit.js";
import { createMastodonAuthorization, exchangeMastodonCode, fetchMastodonHashtags, fetchMastodonHome, publishMastodonStatus } from "./src/providers/mastodon.js";
import { createThreadsAuthorizationUrl, exchangeThreadsCode, searchThreadsPosts, threadsConfigured } from "./src/providers/threads.js";
import { fetchRssFeed, normalizeFeedConnection, parseOpmlFeeds } from "./src/providers/rss.js";
import { fetchHackerNews } from "./src/providers/hackernews.js";
import { fetchLocationewsStories, resolveLocationewsContext, shouldResolveLocationContext } from "./src/providers/locationews.js";
import { fetchConnectorCandidates, loadConnectorDirectory } from "./src/providers/registry.js";
import { compileIntent, evaluateCandidates, filterCandidatesByLanguage, listLocalModels, probeModelConnection } from "./src/curator/openai.js";
import { filterCandidatesByOriginScope, filterCandidatesByRequiredSources, filterCandidatesBySelectionMode, rankEvaluatedCandidates, selectCandidatePool, summarizeRankingQuality, triageCandidates } from "./src/curator/ranker.js";
import type { Candidate, EvaluationSignal, RankingProgram } from "./src/types.js";

type ModelCredential = { provider: string; apiKey: string; model: string; baseUrl?: string; verified?: boolean; verifiedAt?: string };
type FeedRun = { id?: string; candidates: Candidate[]; evaluated: EvaluationSignal[]; program: RankingProgram; pipeline?: Record<string, unknown> };

const projectRoot = process.env.OUTENTION_PACKAGE_ROOT || process.cwd();
const root = join(projectRoot, "dist", "web");
const localEnvPath = process.env.OUTENTION_CONFIG_PATH || join(projectRoot, ".env.local");
loadLocalEnv(localEnvPath);
if (process.env.OUTENTION_IGNORE_PROJECT_ENV !== "1") loadLocalEnv(join(projectRoot, ".env"));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const basePath = normalizeBasePath(process.env.BASE_PATH || "");
const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}${basePath}`).replace(/\/$/, "");
const expectedOrigin = new URL(publicBaseUrl).origin;
const production = process.env.NODE_ENV === "production" || publicBaseUrl.startsWith("https://");
const trustProxy = process.env.TRUST_PROXY === "1";
const betaAccessCode = process.env.BETA_ACCESS_CODE || "";
const personalMode = process.env.OUTENTION_MODE !== "managed";
const authStore = process.env.DATABASE_URL ? new AuthStore(process.env.DATABASE_URL, process.env.DATA_ENCRYPTION_KEY || "") : null;
const personalConnectionsPath = process.env.OUTENTION_CONNECTIONS_PATH || join(dirname(localEnvPath), "connections.enc.json");
const customConnectorsPath = process.env.OUTENTION_CONNECTORS_DIR || join(dirname(localEnvPath), "connectors");
const personalConnectionStore = personalMode ? new PersonalConnectionStore({
  path: personalConnectionsPath,
  encryptionKey: process.env.LOCAL_DATA_KEY || "",
  persistEncryptionKey: key => updateLocalConfig({ OUTENTION_MODE: "personal", LOCAL_DATA_KEY: key })
}) : null;
let personalConnections = personalConnectionStore ? await personalConnectionStore.load() : {};
const customConnectorRegistry = personalMode ? await loadConnectorDirectory(customConnectorsPath) : { connectors: [], errors: [] };
for (const error of customConnectorRegistry.errors) console.error(`Connector ${error.file}: ${error.error}`);
const sessions = new Map();
const redditOauthStates = new Map();
const mastodonOauthStates = new Map();
const threadsOauthStates = new Map();
const YLE_NEWS_FEED = "https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_UUTISET";
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json; charset=utf-8" };
const accessLimiter = new SlidingWindowLimiter({ limit: envInteger("ACCESS_ATTEMPTS_PER_15_MIN", 10, 3, 100), windowMs: 15 * 60 * 1000 });
const authLimiter = new SlidingWindowLimiter({ limit: envInteger("AUTH_ATTEMPTS_PER_15_MIN", 15, 3, 100), windowMs: 15 * 60 * 1000 });
const apiLimiter = new SlidingWindowLimiter({ limit: envInteger("API_REQUESTS_PER_10_MIN", 180, 30, 2000), windowMs: 10 * 60 * 1000 });
const hourlyFeedLimiter = new SlidingWindowLimiter({ limit: envInteger("FEED_BUILDS_PER_HOUR", 12, 1, 100), windowMs: 60 * 60 * 1000 });
const dailyFeedLimiter = new SlidingWindowLimiter({ limit: envInteger("FEED_BUILDS_PER_DAY", 30, 1, 500), windowMs: 24 * 60 * 60 * 1000 });
const modelProviders = new Set(["openai", "anthropic", "openrouter", "gemini", "local"]);
let serverModelCredential = readServerModelCredential();

if (personalMode) await chmod(localEnvPath, 0o600).catch(error => { if (error.code !== "ENOENT") throw error; });
if (authStore) await authStore.initialize();

const server = createServer(async (request, response) => {
  try {
    applySecurityHeaders(response);
    const incoming = new URL(request.url, `http://${request.headers.host}`);
    if (basePath && incoming.pathname === basePath) {
      response.writeHead(308, { location: `${basePath}/${incoming.search}`, "cache-control": "no-store" });
      return response.end();
    }
    const url = applicationUrl(incoming);
    if (!url) return sendJson(response, 404, { error: localizeMessage("Sivua ei löytynyt.", requestLocale(request)) });
    if (request.method === "GET" && url.pathname === "/api/health") return sendJson(response, 200, { ok: true });
    const { id: sessionId, session } = getSession(request, response);
    if (request.method === "POST" && url.pathname === "/api/access") return await handleAccess(request, response, session, sessionId);
    if (betaAccessCode && !session.betaAccess) {
      if (request.method === "GET" && url.pathname === "/access") return serveStatic(response, "/access.html");
      if (request.method === "GET" && (url.pathname.startsWith("/assets/") || ["/favicon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/manifest.webmanifest", "/sw.js"].includes(url.pathname))) return serveStatic(response, url.pathname);
      if (url.pathname.startsWith("/api/")) return sendJson(response, 401, { error: localizeMessage("Beta-kutsu vaaditaan.", requestLocale(request)), accessRequired: true });
      response.writeHead(302, { location: withBasePath("/access"), "cache-control": "no-store" });
      return response.end();
    }
    if (url.pathname.startsWith("/api/")) {
      enforceRateLimit(apiLimiter, `api:${requestIp(request, trustProxy)}`);
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !mutationAllowed(request, production ? expectedOrigin : null)) throw httpError(403, "Pyyntö estettiin. Päivitä sivu ja yritä uudelleen.");
      return await handleApi(request, response, url, session, sessionId);
    }
    return await serveStatic(response, url.pathname);
  } catch (error) {
    console.error(error.name, error.message);
    sendJson(response, error.status || 500, { error: publicMessage(error, requestLocale(request)) });
  }
});

server.listen(port, host, () => console.log(`Outention käynnissä: ${publicBaseUrl} (${host}:${port})`));
const cleanupTimer = setInterval(cleanupMemory, 15 * 60 * 1000); cleanupTimer.unref();
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(async () => { await authStore?.close(); process.exit(0); }));

function loadLocalEnv(path) {
  try {
    const contents = readFileSync(path, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator < 1) continue;
      const key = line.slice(0, separator).trim();
      let value = line.slice(separator + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      if (value && !process.env[key]) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function handleApi(request, response, url, session, sessionId) {
  const redditConfig = getRedditConfig();
  const threadsConfig = getThreadsConfig();
  const locale = requestLocale(request);
  const cookies = requestCookies(request);
  const account = authStore ? await authStore.accountForToken(cookies.outention_auth) : null;
  if (!account && session.accountId) clearConnectorState(session);
  if (account && session.accountId !== account.id) await hydrateAccountSession(session, account.id);

  if (request.method === "GET" && url.pathname === "/api/account") return sendJson(response, 200, { account });

  if (request.method === "GET" && url.pathname === "/api/models/local") {
    if (!personalMode) throw httpError(400, "Paikallinen malli on käytettävissä vain Personal Modessa.");
    const baseUrl = validateLocalModelUrl(url.searchParams.get("baseUrl") || "http://127.0.0.1:11434/v1");
    return sendJson(response, 200, { models: await listLocalModels({ baseUrl }) });
  }

  if (request.method === "POST" && ["/api/account/register", "/api/account/login"].includes(url.pathname)) {
    if (!authStore) throw httpError(503, "Käyttäjätilit eivät ole vielä käytössä tällä palvelimella.");
    enforceRateLimit(authLimiter, `auth:${requestIp(request, trustProxy)}`);
    const body = await readJson(request);
    const registering = url.pathname.endsWith("/register");
    const result = registering
      ? await authStore.register(body.email, body.password)
      : await authStore.login(body.email, body.password);
    if (registering) {
      session.accountId = result.account.id;
      await persistConnections(session);
    } else {
      clearConnectorState(session);
      await hydrateAccountSession(session, result.account.id);
    }
    response.setHeader("set-cookie", authCookie(result.token, result.expiresAt));
    return sendJson(response, registering ? 201 : 200, { account: result.account });
  }

  if (request.method === "POST" && url.pathname === "/api/account/logout") {
    if (authStore) await authStore.logout(cookies.outention_auth);
    clearConnectorState(session);
    response.setHeader("set-cookie", clearAuthCookie());
    return sendJson(response, 200, { account: null });
  }

  if (request.method === "POST" && url.pathname === "/api/account/model-key") {
    if (!personalMode && (!account || !authStore)) throw httpError(401, "Kirjaudu sisään tallentaaksesi oman malliavaimen.");
    const body = await readJson(request);
    const provider = String(body.provider || "openai").trim().toLowerCase();
    if (!modelProviders.has(provider)) throw httpError(400, "Tätä mallipalvelua ei tueta.");
    const existingCredential = session.modelCredential || (personalMode ? serverModelCredential : null);
    const submittedApiKey = String(body.apiKey || "").trim();
    const apiKey = submittedApiKey || (existingCredential?.provider === provider ? existingCredential.apiKey : "");
    const model = validateModelName(body.model);
    validateModelApiKey(provider, apiKey);
    const baseUrl = provider === "local" ? validateLocalModelUrl(body.baseUrl) : null;
    if (provider === "local" && !personalMode) throw httpError(400, "Paikallinen malli on käytettävissä vain Personal Modessa.");
    if (body.persist && !personalMode && !authStore?.connectionsEnabled) throw httpError(503, "Salattu avaintallennus ei ole käytössä.");
    const candidateCredential: ModelCredential = { provider, apiKey, model, ...(baseUrl ? { baseUrl } : {}) };
    if (process.env.OUTENTION_SKIP_MODEL_PROBE !== "1") await probeModelConnection(candidateCredential);
    session.modelCredential = { ...candidateCredential, verified: true, verifiedAt: new Date().toISOString() };
    session.modelCredentialPersisted = Boolean(body.persist);
    if (personalMode && body.persist) {
      await persistPersonalModelCredential(session.modelCredential);
    } else if (account && authStore) {
      if (body.persist) await authStore.saveConnection(account.id, "model_byok", session.modelCredential);
      else await authStore.deleteConnection(account.id, "model_byok");
      await authStore.deleteConnection(account.id, "model_openai");
    }
    return sendJson(response, 200, modelCredentialStatus(session));
  }

  if (request.method === "DELETE" && url.pathname === "/api/account/model-key") {
    if (!personalMode && (!account || !authStore)) throw httpError(401, "Kirjaudu sisään poistaaksesi oman malliavaimen.");
    if (personalMode && (session.modelCredentialPersisted || serverModelCredential)) await clearPersonalModelCredential();
    delete session.modelCredential; delete session.modelCredentialPersisted;
    if (account && authStore) {
      await authStore.deleteConnection(account.id, "model_byok");
      await authStore.deleteConnection(account.id, "model_openai");
    }
    return sendJson(response, 200, modelCredentialStatus(session));
  }

  if (request.method === "GET" && url.pathname === "/api/account/export") {
    if (!account || !authStore) throw httpError(401, "Kirjaudu sisään viedäksesi tietosi.");
    response.setHeader("content-disposition", `attachment; filename="outention-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return sendJson(response, 200, await authStore.exportAccount(account.id));
  }

  if (request.method === "POST" && url.pathname === "/api/account/password") {
    if (!account || !authStore) throw httpError(401, "Kirjaudu sisään vaihtaaksesi salasanan.");
    enforceRateLimit(authLimiter, `auth:${requestIp(request, trustProxy)}`);
    const body = await readJson(request);
    await authStore.changePassword(account.id, body.currentPassword, body.newPassword, cookies.outention_auth);
    return sendJson(response, 200, { changed: true });
  }

  if (request.method === "DELETE" && url.pathname === "/api/account") {
    if (!account || !authStore) throw httpError(401, "Kirjaudu sisään poistaaksesi tilin.");
    enforceRateLimit(authLimiter, `auth:${requestIp(request, trustProxy)}`);
    const body = await readJson(request);
    await authStore.deleteAccount(account.id, body.password);
    clearConnectorState(session);
    response.setHeader("set-cookie", clearAuthCookie());
    return sendJson(response, 200, { deleted: true });
  }

  if (request.method === "GET" && url.pathname === "/api/status") {
    return sendJson(response, 200, {
      account,
      accountFeatures: {
        personalMode,
        localConfigPath: personalMode ? process.env.OUTENTION_CONFIG_LABEL || localEnvPath : null,
        persistentConnections: personalMode || Boolean(account && authStore?.connectionsEnabled),
        byok: modelCredentialStatus(session)
      },
      bluesky: session.bluesky ? { connected: true, handle: session.bluesky.handle, displayName: session.bluesky.displayName } : { connected: false },
      reddit: session.reddit
        ? { connected: true, configured: true, discovery: true }
        : { connected: false, configured: redditConfigured(redditConfig), discovery: redditConfigured(redditConfig) },
      mastodon: session.mastodon ? { connected: true, handle: session.mastodon.handle, instance: session.mastodon.instance } : { connected: false },
      threads: session.threads
        ? { connected: true, configured: true, discovery: true, username: session.threads.username || null }
        : { connected: false, configured: threadsConfigured(threadsConfig), discovery: false },
      rss: { connected: Boolean(session.rss?.length), feeds: session.rss || [] },
      yle: { connected: Boolean(session.yle) },
      hackernews: { connected: session.hackernews !== false },
      locationews: { connected: session.locationewsEnabled !== false, kunta: session.locationewsKunta || null, placeName: session.locationewsPlaceName || null },
      publicDiscovery: { connected: true, sources: ["bluesky", "mastodon", ...(session.threads ? ["threads"] : [])] },
      customConnectors: {
        path: personalMode ? customConnectorsPath : null,
        sources: customConnectorRegistry.connectors.map(connector => ({ id: connector.id, name: connector.name, capabilities: connector.capabilities })),
        errors: customConnectorRegistry.errors
      },
      publishing: {
        destinations: [
          { id: "bluesky", name: "Bluesky", connected: Boolean(session.bluesky), available: true },
          { id: "mastodon", name: "Mastodon", connected: Boolean(session.mastodon), available: true },
          { id: "eulesia", name: "Eulesia", connected: false, available: false, note: "OAuth/API valmistellaan" }
        ]
      },
      curator: {
        configured: Boolean(session.modelCredential || serverModelCredential),
        provider: session.modelCredential?.provider || serverModelCredential?.provider || null,
        model: session.modelCredential?.model || serverModelCredential?.model || null,
        keySource: session.modelCredential ? "user" : personalMode ? "local-environment" : "outention",
        verified: Boolean((session.modelCredential || serverModelCredential)?.verified)
      }
    });
  }

  if (request.method === "POST" && url.pathname === "/api/publish") {
    const body = await readJson(request);
    const text = String(body.text || "").trim();
    if (!text) throw httpError(400, "Kirjoita ensin julkaisu.");
    if (text.length > 5000) throw httpError(400, "Julkaisu on liian pitkä.");
    const destinations = [...new Set(Array.isArray(body.destinations) ? body.destinations.map(String) : [])].slice(0, 6);
    if (!destinations.length) throw httpError(400, "Valitse vähintään yksi julkaisukohde.");
    const tasks = destinations.map(async destination => {
      if (destination === "bluesky") {
        if (!session.bluesky) throw httpError(409, "Yhdistä Bluesky ennen julkaisemista.");
        try { return await publishBlueskyPost(session.bluesky, { text }); }
        catch (error) {
          if (!isBlueskyAccessTokenError(error)) throw error;
          session.bluesky = await refreshBlueskySession(session.bluesky); await persistConnections(session);
          return publishBlueskyPost(session.bluesky, { text });
        }
      }
      if (destination === "mastodon") {
        if (!session.mastodon) throw httpError(409, "Yhdistä Mastodon uudelleen julkaisuvaltuudella.");
        return publishMastodonStatus(session.mastodon, { text, visibility: body.visibility });
      }
      throw httpError(400, `${destination} ei ole vielä käytettävissä julkaisukohteena.`);
    });
    const settled = await Promise.allSettled(tasks);
    const results = settled.map((result, index) => result.status === "fulfilled"
      ? { destination: destinations[index], ok: true, ...result.value }
      : { destination: destinations[index], ok: false, error: publicMessage(result.reason, locale) });
    return sendJson(response, 200, { results });
  }


  if (request.method === "GET" && url.pathname === "/api/connect/mastodon/start") {
    const instance = url.searchParams.get("instance") || "";
    const state = randomBytes(24).toString("base64url");
    const redirectUri = `${publicBaseUrl}/api/oauth/mastodon/callback`;
    const authorization = await createMastodonAuthorization({ instance, redirectUri, state });
    mastodonOauthStates.set(state, { session, createdAt: Date.now(), ...authorization });
    response.writeHead(302, { location: authorization.authorizationUrl, "cache-control": "no-store" });
    return response.end();
  }

  if (request.method === "GET" && url.pathname === "/api/oauth/mastodon/callback") {
    const state = url.searchParams.get("state");
    const pending = mastodonOauthStates.get(state);
    mastodonOauthStates.delete(state);
    if (url.searchParams.get("error")) throw httpError(400, "Mastodon-yhteys peruttiin.");
    if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) throw httpError(400, "Mastodon OAuth -pyyntö vanheni. Aloita yhdistäminen uudelleen.");
    const redirectUri = `${publicBaseUrl}/api/oauth/mastodon/callback`;
    pending.session.mastodon = await exchangeMastodonCode(pending, url.searchParams.get("code"), redirectUri);
    await persistConnections(pending.session);
    response.writeHead(302, { location: withBasePath("/?mastodon=connected"), "cache-control": "no-store" });
    return response.end();
  }

  if (request.method === "DELETE" && url.pathname === "/api/connect/mastodon") {
    delete session.mastodon;
    await persistConnections(session);
    return sendJson(response, 200, { connected: false });
  }

  if (request.method === "GET" && url.pathname === "/api/connect/threads/start") {
    if (!threadsConfigured(threadsConfig)) throw httpError(503, "Threads OAuth -asetukset puuttuvat .env.local-tiedostosta.");
    const state = randomBytes(24).toString("base64url");
    threadsOauthStates.set(state, { session, createdAt: Date.now() });
    response.writeHead(302, { location: createThreadsAuthorizationUrl(threadsConfig, state), "cache-control": "no-store" });
    return response.end();
  }

  if (request.method === "GET" && url.pathname === "/api/oauth/threads/callback") {
    const state = url.searchParams.get("state");
    const pending = threadsOauthStates.get(state);
    threadsOauthStates.delete(state);
    if (url.searchParams.get("error")) throw httpError(400, "Threads-yhteys peruttiin.");
    if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) throw httpError(400, "Threads OAuth -pyyntö vanheni. Aloita yhdistäminen uudelleen.");
    pending.session.threads = await exchangeThreadsCode(threadsConfig, url.searchParams.get("code"));
    await persistConnections(pending.session);
    response.writeHead(302, { location: withBasePath("/?threads=connected"), "cache-control": "no-store" });
    return response.end();
  }

  if (request.method === "DELETE" && url.pathname === "/api/connect/threads") {
    delete session.threads;
    await persistConnections(session);
    return sendJson(response, 200, { connected: false });
  }

  if (request.method === "POST" && url.pathname === "/api/connect/rss") {
    const body = await readJson(request);
    const connection = normalizeFeedConnection(body);
    const preview = await fetchRssFeed(connection, { limit: 1 });
    if (!preview.length) throw httpError(400, "Syötteestä ei löytynyt luettavia julkaisuja.");
    session.rss ||= [];
    if (!session.rss.some(feed => feed.url === connection.url)) {
      if (session.rss.length >= 24) throw httpError(400, "Syötteitä voi olla enintään 24.");
      session.rss.push({ ...connection, name: connection.name || preview[0].author.handle || new URL(connection.url).hostname });
    }
    await persistConnections(session);
    return sendJson(response, 200, { connected: true, feeds: session.rss });
  }

  if (request.method === "POST" && url.pathname === "/api/connect/opml") {
    const body = await readJson(request);
    session.rss ||= [];
    const remaining = Math.max(0, 24 - session.rss.length);
    if (!remaining) throw httpError(400, "Syötteiden enimmäismäärä on jo käytössä.");
    const feeds = parseOpmlFeeds(body.opml, { limit: remaining });
    const existing = new Set(session.rss.map(feed => feed.url));
    const candidates = feeds.filter(feed => !existing.has(feed.url));
    const settled = await Promise.allSettled(candidates.map(async connection => {
      const preview = await fetchRssFeed(connection, { limit: 1 });
      if (!preview.length) throw new Error("No readable posts");
      return { ...connection, name: connection.name || preview[0].author.handle || new URL(connection.url).hostname };
    }));
    const added = settled.filter(result => result.status === "fulfilled").map(result => result.value);
    session.rss.push(...added.slice(0, remaining));
    await persistConnections(session);
    return sendJson(response, 200, { connected: Boolean(session.rss.length), added: added.length, failed: settled.length - added.length, feeds: session.rss });
  }

  if (request.method === "DELETE" && url.pathname === "/api/connect/rss") {
    const target = url.searchParams.get("url");
    session.rss = (session.rss || []).filter(feed => feed.url !== target);
    await persistConnections(session);
    return sendJson(response, 200, { connected: Boolean(session.rss.length), feeds: session.rss });
  }

  if (request.method === "POST" && url.pathname === "/api/connect/hackernews") {
    session.hackernews = true;
    await persistConnections(session);
    return sendJson(response, 200, { connected: true });
  }

  if (request.method === "DELETE" && url.pathname === "/api/connect/hackernews") {
    session.hackernews = false;
    await persistConnections(session);
    return sendJson(response, 200, { connected: false });
  }

  if (request.method === "POST" && url.pathname === "/api/connect/yle") {
    session.yle = true;
    await persistConnections(session);
    return sendJson(response, 200, { connected: true });
  }

  if (request.method === "DELETE" && url.pathname === "/api/connect/yle") {
    delete session.yle;
    await persistConnections(session);
    return sendJson(response, 200, { connected: false });
  }

  if (request.method === "POST" && url.pathname === "/api/connect/locationews") {
    const body = await readJson(request);
    const context = cleanUserContext(body.context, 500);
    const location = context ? await resolveLocationewsContext(context, { baseUrl: process.env.LOCATIONEWS_URL || undefined }) : null;
    if (context && !location) throw httpError(400, "Paikkakuntaa ei tunnistettu. Kirjoita esimerkiksi “uutisia Rautalammista”.");
    session.locationewsEnabled = true;
    setSessionLocation(session, location);
    await persistConnections(session);
    return sendJson(response, 200, { connected: true, kunta: location?.kuntakoodi || null, placeName: location?.name || null });
  }

  if (request.method === "POST" && url.pathname === "/api/profile/context") {
    const body = await readJson(request);
    const context = cleanUserContext(body.context, 1500);
    const location = context ? await resolveLocationewsContext(context, { baseUrl: process.env.LOCATIONEWS_URL || undefined }) : null;
    if (!body.keepLocation) setSessionLocation(session, location);
    await persistConnections(session);
    return sendJson(response, 200, { accepted: true, location });
  }

  if (request.method === "DELETE" && url.pathname === "/api/connect/locationews") {
    delete session.locationewsKunta;
    delete session.locationewsPlaceName;
    session.locationewsEnabled = false;
    await persistConnections(session);
    return sendJson(response, 200, { connected: false, kunta: null });
  }

  if (request.method === "GET" && url.pathname === "/api/connect/reddit/start") {
    if (!redditConfigured(redditConfig)) throw httpError(503, "Reddit OAuth -asetukset puuttuvat .env-tiedostosta.");
    const state = randomBytes(24).toString("base64url");
    redditOauthStates.set(state, { session, createdAt: Date.now() });
    response.writeHead(302, { location: createRedditAuthorizationUrl(redditConfig, state), "cache-control": "no-store" });
    return response.end();
  }

  if (request.method === "GET" && url.pathname === "/api/oauth/reddit/callback") {
    const pending = redditOauthStates.get(url.searchParams.get("state"));
    redditOauthStates.delete(url.searchParams.get("state"));
    if (url.searchParams.get("error")) throw httpError(400, "Reddit-yhteys peruttiin.");
    if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) throw httpError(400, "Reddit OAuth -pyyntö vanheni. Aloita yhdistäminen uudelleen.");
    pending.session.reddit = await exchangeRedditCode(redditConfig, url.searchParams.get("code"));
    await persistConnections(pending.session);
    response.writeHead(302, { location: withBasePath("/?reddit=connected"), "cache-control": "no-store" });
    return response.end();
  }

  if (request.method === "DELETE" && url.pathname === "/api/connect/reddit") {
    delete session.reddit;
    await persistConnections(session);
    return sendJson(response, 200, { connected: false });
  }

  if (request.method === "POST" && url.pathname === "/api/connect/bluesky") {
    const body = await readJson(request);
    if (!body.identifier || !body.password) throw httpError(400, "Anna Bluesky-tunnus ja salasana.");
    if (process.env.REQUIRE_BLUESKY_APP_PASSWORD === "1" && !/^[a-z2-7]{4}(?:-[a-z2-7]{4}){3}$/i.test(String(body.password).trim())) {
      throw httpError(400, "Internet-betassa Blueskyyn voi yhdistää vain erillisellä app-salasanalla, ei tilin pääsalasanalla.");
    }
    session.bluesky = await connectBluesky({ identifier: body.identifier, password: body.password });
    await persistConnections(session);
    return sendJson(response, 200, { connected: true, handle: session.bluesky.handle, displayName: session.bluesky.displayName });
  }

  if (request.method === "DELETE" && url.pathname === "/api/connect/bluesky") {
    delete session.bluesky;
    await persistConnections(session);
    return sendJson(response, 200, { connected: false });
  }

  if (request.method === "POST" && url.pathname === "/api/rerank") {
    if (!session.lastRun) throw httpError(409, "Hae ensin feedi, jota voidaan säätää.");
    const body = await readJson(request);
    const run = body.runId ? session.runs?.get(body.runId) : session.lastRun;
    if (!run) throw httpError(409, "Valittua feediversiota ei enää ole tässä istunnossa.");
    run.program = mergeProgramControls(run.program, body);
    session.lastRun = run;
    return sendRankedFeed(response, run);
  }

  if (request.method === "POST" && url.pathname === "/api/feed/more") {
    const body = await readJson(request);
    const run = body.runId ? session.runs?.get(body.runId) : session.lastRun;
    if (!run) throw httpError(409, "Tätä feediversiota ei enää ole tässä istunnossa.");
    const offset = Math.min(500, Math.max(0, Math.round(Number(body.offset) || 0)));
    return sendRankedFeed(response, run, { offset, limit: 20 });
  }

  if (request.method === "DELETE" && url.pathname === "/api/feed") {
    delete session.lastRun;
    delete session.runs;
    return sendJson(response, 200, { cleared: true });
  }

  if (request.method === "POST" && url.pathname === "/api/feed") {
    enforceRateLimit(hourlyFeedLimiter, `feed-hour:${sessionId}`);
    enforceRateLimit(dailyFeedLimiter, `feed-day:${sessionId}`);
    if (!session.modelCredential && !serverModelCredential) throw httpError(503, "Kuraattorin malliavain puuttuu.");
    const body = await readJson(request);
    if (!body.intent?.trim()) throw httpError(400, "Kerro ensin, mistä haluaisit kuulla.");
    const profileContext = cleanUserContext(body.profileContext, 1500);
    if (shouldResolveLocationContext(body.intent, profileContext)) {
      try {
        const location = await resolveLocationewsContext(body.intent, { baseUrl: process.env.LOCATIONEWS_URL || undefined })
          || await resolveLocationewsContext(profileContext, { baseUrl: process.env.LOCATIONEWS_URL || undefined });
        if (location) { setSessionLocation(session, location); await persistConnections(session); }
      } catch (error) { console.error("Locationews-paikkakunta", error.message || "tuntematon virhe"); }
    }

    const modelOptions = session.modelCredential || serverModelCredential;
    const compiled = await compileIntent({ ...modelOptions, intent: body.intent, previousProgram: body.previousProgram || null, profileContext, locale });
    modelOptions.verified = true; modelOptions.verifiedAt = new Date().toISOString();
    if (compiled.clarificationNeeded) return sendJson(response, 200, compiled);
    const program = mergeProgramControls(compiled.program, body.controls || {});

    const batches: Candidate[][] = [];
    if (session.bluesky) {
      try { batches.push(await fetchBlueskyTimeline(session.bluesky, { limit: 60 })); }
      catch (error) {
        if (!isBlueskyAccessTokenError(error)) throw error;
        session.bluesky = await refreshBlueskySession(session.bluesky); await persistConnections(session);
        batches.push(await fetchBlueskyTimeline(session.bluesky, { limit: 60 }));
      }
    }
    if (session.mastodon) {
      try { batches.push(await fetchMastodonHome(session.mastodon, { limit: 40 })); }
      catch (error) { console.error("Mastodon Home", error.message || "tuntematon virhe"); }
    }
    if (session.reddit) {
      try { batches.push(await fetchRedditHome(redditConfig, session.reddit, { limit: 40 })); }
      catch (error) {
        if (error.status === 401 && session.reddit.refreshToken) {
          try {
            session.reddit = await refreshRedditSession(redditConfig, session.reddit); await persistConnections(session);
            batches.push(await fetchRedditHome(redditConfig, session.reddit, { limit: 40 }));
          } catch (refreshError) { console.error("Reddit Home", refreshError.message || "tuntematon virhe"); }
        } else console.error("Reddit Home", error.message || "tuntematon virhe");
      }
    }
    const connectedRequests: Array<Promise<Candidate[]>> = [];
    for (const feed of session.rss || []) connectedRequests.push(fetchRssFeed(feed, { limit: 25 }));
    if (session.yle) connectedRequests.push(fetchRssFeed({ url: YLE_NEWS_FEED, name: "Yle Uutiset" }, { limit: 25 }));
    if (session.hackernews !== false) connectedRequests.push(fetchHackerNews({ kind: "best", limit: 25 }));
    if (session.locationewsEnabled !== false) connectedRequests.push(fetchLocationewsStories({
      baseUrl: process.env.LOCATIONEWS_URL || undefined,
      kunta: session.locationewsKunta || undefined,
      limit: 25
    }).then(items => items.map(item => ({
      ...item,
      retrievalContext: session.locationewsPlaceName
        ? `Locationews · ${session.locationewsPlaceName}`
        : "Locationews · Finland"
    }))));
    for (const result of await Promise.allSettled(connectedRequests)) {
      if (result.status === "fulfilled") batches.push(result.value);
      else console.error("Yhdistetty lähde", result.reason?.message || "tuntematon virhe");
    }
    const discoveryRequests: Array<Promise<Candidate[]>> = [searchBlueskyPosts(program.discovery.bluesky_queries, { limitPerQuery: 15 })];
    if (session.threads) discoveryRequests.push(searchThreadsPosts(
      session.threads,
      program.discovery.bluesky_queries?.length ? program.discovery.bluesky_queries : program.discovery.reddit_queries,
      { limitPerQuery: 15, searchType: program.weights?.freshness >= 35 ? "RECENT" : "TOP" }
    ));
    for (const connector of customConnectorRegistry.connectors) {
      if (!connector.capabilities.includes("discovery") && !connector.capabilities.includes("personal-feed")) continue;
      discoveryRequests.push(fetchConnectorCandidates(connector, { intent: body.intent, program, profileContext, limit: 25 }));
    }
    if (redditConfigured(redditConfig)) {
      try {
        const redditApplication = await getRedditApplicationSession(redditConfig);
        discoveryRequests.push(searchRedditPosts(redditConfig, redditApplication, program.discovery.reddit_queries || program.discovery.bluesky_queries, { limitPerQuery: 18 }));
      } catch (error) { console.error("Reddit discovery", error.message || "tuntematon virhe"); }
    }
    if (program.discovery.mastodon_tags.length) discoveryRequests.push(fetchMastodonHashtags(program.discovery.mastodon_tags, {
      instance: session.mastodon?.instance || process.env.MASTODON_DISCOVERY_INSTANCE || "https://mastodon.social",
      accessToken: session.mastodon?.accessToken || null,
      limitPerTag: 12
    }));
    for (const result of await Promise.allSettled(discoveryRequests)) {
      if (result.status === "fulfilled") batches.push(result.value);
      else console.error("Discovery-lähde", result.reason?.message || "tuntematon virhe");
    }
    const retrievedTotal = batches.reduce((sum, batch) => sum + batch.length, 0);
    const retrieved = interleaveBatches(batches, 100);
    const unique = uniqueCandidates(retrieved);
    const excludedIds = new Set((body.excludeIds || []).slice(0, 250).map(String));
    const unseen = unique.filter(item => !excludedIds.has(item.id));
    const languageMatched = filterCandidatesByLanguage(unseen, program.languages);
    const selectionMatched = filterCandidatesBySelectionMode(languageMatched, program.selection_mode);
    const sourceMatched = filterCandidatesByRequiredSources(selectionMatched, program.required_sources);
    const originMatched = filterCandidatesByOriginScope(sourceMatched, program.origin_scope);
    const pooled = selectCandidatePool(originMatched, program.familiarity_target, 60);
    const localModel = modelOptions.provider === "local";
    const triageLimit = localModel ? 24 : program.selection_mode === "broad_personal" ? 40 : 36;
    const candidates = triageCandidates(pooled, program, triageLimit);
    if (!candidates.length && program.selection_mode === "broad_personal") {
      throw httpError(503, "Henkilökohtainen Home-feedi ei vastannut. Tarkista Bluesky-, Mastodon- tai Reddit-yhteys.");
    }
    if (!candidates.length && program.required_sources?.length) {
      throw httpError(503, "Pyydetystä lähteestä ei löytynyt sisältöä juuri nyt.");
    }
    if (!candidates.length) throw httpError(503, "Yksikään sisältölähde ei vastannut. Yhdistä lähde tai yritä hetken päästä uudelleen.");
    const evaluation = await evaluateWithCache({ session, modelOptions, program, candidates, locale });
    const evaluated = evaluation.items;
    const run = storeRun(session, {
      candidates, evaluated, program,
      pipeline: {
        retrieved: retrievedTotal,
        retrievalBounded: retrieved.length,
        unique: unique.length,
        unseen: unseen.length,
        languageMatched: languageMatched.length,
        selectionMatched: selectionMatched.length,
        sourceMatched: sourceMatched.length,
        originMatched: originMatched.length,
        pooled: pooled.length,
        triaged: candidates.length,
        evaluated: evaluated.length,
        cachedEvaluations: evaluation.cached,
        modelEvaluated: evaluation.modelEvaluated,
        evaluationBySource: summarizeEvaluationBySource(candidates, evaluated),
        modelCalls: 1 + evaluation.modelCalls,
        modelCandidateTextLimit: 900
      }
    });
    return sendRankedFeed(response, run);
  }

  throw httpError(404, "Rajapintaa ei löytynyt.");
}

function sendRankedFeed(response, run: FeedRun, { offset = 0, limit = 20 } = {}) {
  const rankedWithLookahead = rankEvaluatedCandidates({ ...run, offset, limit: limit + 1 });
  const hasMore = rankedWithLookahead.length > limit;
  const ranked = rankedWithLookahead.slice(0, limit);
  const byId = new Map<string, Candidate>(run.candidates.map(item => [item.id, item]));
  const items = ranked.flatMap(result => {
    const candidate = byId.get(result.id);
    return candidate ? [{ ...candidate, reasons: result.reasons, score: result.score, components: result.components }] : [];
  });
  return sendJson(response, 200, {
    clarificationNeeded: false, clarificationQuestion: null, runId: run.id, program: run.program, items,
    pagination: { offset, nextOffset: offset + items.length, hasMore },
    pipeline: run.pipeline ? { ...run.pipeline, quality: summarizeRankingQuality(run) } : null
  });
}

function storeRun(session, run: FeedRun): FeedRun & { id: string } {
  run.id = randomBytes(9).toString("base64url");
  session.runs ||= new Map();
  session.runs.set(run.id, run);
  while (session.runs.size > 12) session.runs.delete(session.runs.keys().next().value);
  session.lastRun = run;
  return run as FeedRun & { id: string };
}

function mergeProgramControls(program, controls) {
  const weights = { ...program.weights };
  for (const key of Object.keys(weights)) if (Number.isFinite(Number(controls.weights?.[key]))) weights[key] = Math.min(100, Math.max(0, Number(controls.weights[key])));
  return {
    ...program,
    weights,
    familiarity_target: Number.isFinite(Number(controls.familiarity_target)) ? Math.min(100, Math.max(0, Number(controls.familiarity_target))) : program.familiarity_target,
    horizon_hours: Number.isFinite(Number(controls.horizon_hours)) ? Math.min(336, Math.max(6, Number(controls.horizon_hours))) : program.horizon_hours,
    diversity: { ...program.diversity, max_per_author: Number.isFinite(Number(controls.max_per_author)) ? Math.min(10, Math.max(1, Math.round(Number(controls.max_per_author)))) : program.diversity.max_per_author }
  };
}

function uniqueCandidates(candidates: Candidate[]): Candidate[] {
  return [...new Map<string, Candidate>(candidates.map(item => [item.id, item])).values()];
}

function interleaveBatches(batches: Candidate[][], limit: number): Candidate[] {
  const sorted = batches.filter(batch => batch.length).map(batch => [...batch].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()));
  const result: Candidate[] = [];
  for (let index = 0; result.length < limit && sorted.some(batch => index < batch.length); index++) {
    for (const batch of sorted) {
      if (batch[index]) result.push(batch[index]);
      if (result.length === limit) break;
    }
  }
  return result;
}

async function evaluateWithCache({ session, modelOptions, program, candidates, locale }) {
  if (program.selection_mode === "broad_personal" && !(program.exclude || []).length) {
    return {
      items: candidates.map(candidate => ({
        id: candidate.id,
        semantic_score: 85,
        tone_score: 75,
        core_match: true,
        hard_excluded: false,
        reasons: [locale === "fi" ? "Seuraamasi ihmisen päivitys" : "Update from someone you follow"]
      })),
      cached: 0,
      modelEvaluated: 0,
      modelCalls: 0
    };
  }
  session.evaluationCache ||= new Map();
  const now = Date.now();
  const programFingerprint = hashValue({
    provider: modelOptions.provider,
    model: modelOptions.model,
    intent: program.intent,
    include: program.include,
    exclude: program.exclude,
    tone: program.tone,
    content_forms: program.content_forms,
    languages: program.languages,
    selection_mode: program.selection_mode,
    origin_scope: program.origin_scope
  });
  const items = [];
  const pending = [];
  let cached = 0;
  for (const candidate of candidates) {
    const key = evaluationCacheKey(programFingerprint, candidate);
    const hit = session.evaluationCache.get(key);
    if (hit && now - hit.createdAt < 30 * 60_000) {
      items.push(hit.value); cached += 1;
    } else {
      if (hit) session.evaluationCache.delete(key);
      pending.push({ candidate, key });
    }
  }
  const batchSize = modelOptions.provider === "local" ? 12 : 24;
  let modelCalls = 0;
  for (let index = 0; index < pending.length; index += batchSize) {
    const batch = pending.slice(index, index + batchSize);
    const evaluated = await evaluateCandidates({ ...modelOptions, program, candidates: batch.map(entry => entry.candidate), locale });
    modelCalls += 1;
    const keysById = new Map(batch.map(entry => [entry.candidate.id, entry.key]));
    for (const value of evaluated) {
      const key = keysById.get(value.id);
      if (!key) continue;
      session.evaluationCache.set(key, { createdAt: now, value });
      items.push(value);
    }
  }
  while (session.evaluationCache.size > 500) session.evaluationCache.delete(session.evaluationCache.keys().next().value);
  const byId = new Map(items.map(item => [item.id, item]));
  return {
    items: candidates.map(candidate => byId.get(candidate.id)).filter(Boolean),
    cached,
    modelEvaluated: pending.length,
    modelCalls
  };
}

function evaluationCacheKey(programFingerprint, candidate: Candidate) {
  return `${programFingerprint}:${hashValue({
    id: candidate.id,
    text: candidate.text,
    title: candidate.title,
    publishedAt: candidate.publishedAt,
    sourceType: candidate.sourceType
  })}`;
}

function hashValue(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("base64url").slice(0, 24);
}

function summarizeEvaluationBySource(candidates: Candidate[], evaluated: EvaluationSignal[]) {
  const byId = new Map<string, Candidate>(candidates.map(item => [item.id, item]));
  const summary = {};
  for (const signal of evaluated) {
    const source = byId.get(signal.id)?.sourceType || "unknown";
    const entry = summary[source] ||= { evaluated: 0, coreMismatch: 0, hardExcluded: 0, useful: 0, maxSemantic: 0 };
    entry.evaluated += 1;
    entry.coreMismatch += Number(signal.core_match === false);
    entry.hardExcluded += Number(Boolean(signal.hard_excluded));
    entry.useful += Number(signal.core_match !== false && !signal.hard_excluded && signal.semantic_score >= 60);
    entry.maxSemantic = Math.max(entry.maxSemantic, Number(signal.semantic_score) || 0);
  }
  return summary;
}

function getSession(request, response) {
  const cookies = requestCookies(request);
  let id = cookies.outention_session || cookies.kuule_session;
  if (!id || !sessions.has(id)) {
    id = randomBytes(24).toString("base64url");
    sessions.set(id, { createdAt: Date.now(), lastSeenAt: Date.now(), ...(personalMode ? structuredClone(personalConnections) : {}) });
    response.setHeader("set-cookie", sessionCookie(id));
  }
  const session = sessions.get(id); session.lastSeenAt = Date.now();
  return { id, session };
}

function requestCookies(request) {
  return Object.fromEntries((request.headers.cookie || "").split(";").filter(Boolean).map(part => {
    const clean = part.trim(); const separator = clean.indexOf("=");
    return separator < 0 ? [clean, ""] : [clean.slice(0, separator), clean.slice(separator + 1)];
  }));
}

async function readJson(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 1_000_000) throw httpError(413, "Pyyntö on liian suuri.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw httpError(400, "Virheellinen JSON-pyyntö."); }
}

function cleanUserContext(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, maxLength);
}

function setSessionLocation(session, location) {
  if (location) {
    session.locationewsKunta = location.kuntakoodi;
    session.locationewsPlaceName = location.name;
  } else {
    delete session.locationewsKunta;
    delete session.locationewsPlaceName;
  }
}

const connectorStateKeys = [
  "bluesky", "reddit", "mastodon", "threads", "rss", "yle", "hackernews",
  "locationewsEnabled", "locationewsKunta", "locationewsPlaceName"
];

async function persistConnections(session) {
  const state = {};
  for (const key of connectorStateKeys) if (session[key] !== undefined) state[key] = session[key];
  if (personalConnectionStore) {
    await personalConnectionStore.save(state);
    personalConnections = structuredClone(state);
    return;
  }
  if (!session.accountId || !authStore?.connectionsEnabled) return;
  await authStore.saveConnection(session.accountId, "sources", state);
}

async function hydrateAccountSession(session, accountId) {
  clearConnectorState(session);
  session.accountId = accountId;
  if (!authStore?.connectionsEnabled) return;
  const connections = await authStore.loadConnections(accountId);
  const saved = (connections.sources && typeof connections.sources === "object" ? connections.sources : {}) as Record<string, unknown>;
  for (const key of connectorStateKeys) if (saved[key] !== undefined) session[key] = saved[key];
  const legacyCredential = (connections.model_openai && typeof connections.model_openai === "object" ? connections.model_openai : null) as { apiKey?: string } | null;
  const savedCredential = (connections.model_byok && typeof connections.model_byok === "object" ? connections.model_byok : null) as ModelCredential | null || (legacyCredential?.apiKey
    ? { provider: "openai", apiKey: legacyCredential.apiKey, model: process.env.OPENAI_MODEL || "gpt-5.6-luna" }
    : null);
  if (savedCredential?.apiKey && modelProviders.has(savedCredential.provider) && isValidModelName(savedCredential.model)) {
    session.modelCredential = savedCredential;
    session.modelCredentialPersisted = true;
  }
}

function clearConnectorState(session) {
  for (const key of connectorStateKeys) delete session[key];
  delete session.modelCredential; delete session.modelCredentialPersisted;
  delete session.accountId;
}

function modelCredentialStatus(session) {
  const sessionCredential = session.modelCredential || null;
  const credential = sessionCredential || (personalMode ? serverModelCredential : null);
  return {
    configured: Boolean(credential),
    persisted: sessionCredential ? Boolean(session.modelCredentialPersisted) : Boolean(personalMode && serverModelCredential),
    provider: credential?.provider || null,
    model: credential?.model || null,
    baseUrl: credential?.provider === "local" ? credential.baseUrl : null,
    verified: Boolean(credential?.verified),
    verifiedAt: credential?.verifiedAt || null
  };
}

async function persistPersonalModelCredential(credential) {
  const updates = {
    OUTENTION_MODE: "personal",
    MODEL_PROVIDER: credential.provider,
    MODEL_API_KEY: credential.apiKey,
    MODEL_NAME: credential.model,
    MODEL_BASE_URL: credential.baseUrl || ""
  };
  await updateLocalConfig(updates);
  serverModelCredential = { ...credential };
}

async function updateLocalConfig(updates) {
  const path = localEnvPath;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let contents = "# Outention Personal — local secrets. Never commit this file.\n";
  try { contents = await readFile(path, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const seen = new Set();
  const lines = contents.split(/\r?\n/).map(line => {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]); return `${match[1]}=${updates[match[1]]}`;
  });
  for (const [key, value] of Object.entries(updates)) if (!seen.has(key)) lines.push(`${key}=${value}`);
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, `${lines.join("\n").replace(/\n*$/, "")}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path); await chmod(path, 0o600);
  Object.assign(process.env, updates);
}

async function clearPersonalModelCredential() {
  await persistPersonalModelCredential({ provider: process.env.MODEL_PROVIDER || "openrouter", apiKey: "", model: process.env.MODEL_NAME || "openai/gpt-5.6-luna", baseUrl: "" });
  process.env.MODEL_API_KEY = ""; process.env.OPENAI_API_KEY = ""; process.env.MODEL_BASE_URL = ""; serverModelCredential = null;
}

function readServerModelCredential() {
  const provider = String(process.env.MODEL_PROVIDER || "openai").trim().toLowerCase();
  const apiKey = String(process.env.MODEL_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey && provider !== "local") return null;
  const defaults = {
    openai: "gpt-5.6-luna",
    anthropic: "claude-haiku-4-5-20251001",
    gemini: "gemini-3.6-flash",
    openrouter: "openai/gpt-5.6-luna",
    local: ""
  };
  const model = String(process.env.MODEL_NAME || process.env.OPENAI_MODEL || defaults[provider] || "").trim();
  if (!modelProviders.has(provider)) throw new Error(`Unsupported MODEL_PROVIDER: ${provider}`);
  if (!isValidModelName(model)) throw new Error("MODEL_NAME is missing or invalid.");
  const baseUrl = provider === "local" ? validateLocalModelUrl(process.env.MODEL_BASE_URL || "http://127.0.0.1:11434/v1", false) : null;
  return { provider, apiKey, model, ...(baseUrl ? { baseUrl } : {}), verified: false, verifiedAt: null };
}

function validateModelApiKey(provider, value) {
  if (provider === "local" && !value) return;
  if (value.length < 16 || value.length > 512 || /\s/.test(value)) throw httpError(400, "API-avaimen muoto ei kelpaa.");
  if (provider === "anthropic" && !value.startsWith("sk-ant-")) throw httpError(400, "Anthropic API -avaimen muoto ei kelpaa.");
  if (provider === "openrouter" && !value.startsWith("sk-or-")) throw httpError(400, "OpenRouter API -avaimen muoto ei kelpaa.");
  if (provider === "openai" && value.startsWith("sk-or-")) throw httpError(400, "OpenRouter-avain vaatii mallipalveluksi OpenRouterin.");
}

function validateLocalModelUrl(value, publicError = true) {
  try {
    const url = new URL(String(value || "http://127.0.0.1:11434/v1"));
    const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]", "host.docker.internal"]);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !allowedHosts.has(url.hostname)) throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    if (!publicError) throw new Error("MODEL_BASE_URL must point to localhost or host.docker.internal.");
    throw httpError(400, "Paikallisen mallin osoitteen pitää olla localhost tai host.docker.internal.");
  }
}

function validateModelName(value) {
  const model = String(value || "").trim();
  if (!isValidModelName(model)) throw httpError(400, "Anna kelvollinen mallin nimi.");
  return model;
}

function isValidModelName(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 150 && /^[A-Za-z0-9][A-Za-z0-9._:/~-]*$/.test(value);
}

async function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, safePath);
  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
  } catch (error) {
    if (error.code === "ENOENT") return sendJson(response, 404, { error: "Page not found." });
    throw error;
  }
  let body;
  try { body = await readFile(filePath); }
  catch (error) {
    if (error.code === "ENOENT") return sendJson(response, 404, { error: "Page not found." });
    throw error;
  }
  if (extname(filePath) === ".html") body = Buffer.from(body.toString("utf8").replaceAll("__BASE_PATH__", basePath));
  response.writeHead(200, { "content-type": types[extname(filePath)] || "application/octet-stream", "cache-control": "no-store" });
  response.end(body);
}

function sendJson(response, status, data) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(data));
}

function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function requestLocale(request) {
  return request.headers["x-outention-locale"] === "fi" ? "fi" : "en";
}

const englishErrors = new Map(Object.entries({
  "Beta-kutsu vaaditaan.": "An invite is required.",
  "Sivua ei löytynyt.": "Page not found.",
  "Pyyntö estettiin. Päivitä sivu ja yritä uudelleen.": "Request blocked. Refresh the page and try again.",
  "Kutsukoodi ei täsmää.": "The invite code does not match.",
  "Käyttöraja tuli hetkeksi vastaan. Yritä myöhemmin uudelleen.": "The usage limit was reached. Try again later.",
  "OPENAI_API_KEY puuttuu palvelimen ympäristöstä.": "OPENAI_API_KEY is missing from the server environment.",
  "Kuraattorin malliavain puuttuu.": "The curator model key is missing.",
  "Kerro ensin, mistä haluaisit kuulla.": "First say what you would like to hear about.",
  "Yhdistä tai ota käyttöön vähintään yksi sisältölähde.": "Connect or enable at least one content source.",
  "Yksikään sisältölähde ei vastannut. Yhdistä lähde tai yritä hetken päästä uudelleen.": "No content source responded. Connect a source or try again shortly.",
  "Henkilökohtainen Home-feedi ei vastannut. Tarkista Bluesky-, Mastodon- tai Reddit-yhteys.": "Your personal Home feed did not respond. Check the Bluesky, Mastodon, or Reddit connection.",
  "Pyydetystä lähteestä ei löytynyt sisältöä juuri nyt.": "No content was found from the requested source just now.",
  "Rajapintaa ei löytynyt.": "API endpoint not found.",
  "Pyyntö on liian suuri.": "The request is too large.",
  "Virheellinen JSON-pyyntö.": "Invalid JSON request.",
  "Hae ensin feedi, jota voidaan säätää.": "Build a feed before adjusting it.",
  "Valittua feediversiota ei enää ole tässä istunnossa.": "That feed version is no longer in this session.",
  "Tätä feediversiota ei enää ole tässä istunnossa.": "This feed version is no longer in this session."
  ,"Tällä sähköpostilla on jo Outention-tili.": "An Outention account already exists for this email."
  ,"Sähköposti tai salasana on väärin.": "Incorrect email or password."
  ,"Anna kelvollinen sähköpostiosoite.": "Enter a valid email address."
  ,"Salasanassa pitää olla vähintään 12 merkkiä.": "Password must be at least 12 characters."
  ,"Salasana on liian pitkä.": "Password is too long."
  ,"Tätä mallipalvelua ei tueta.": "This model provider is not supported."
  ,"Salattu avaintallennus ei ole käytössä.": "Encrypted key storage is not enabled."
  ,"API-avaimen muoto ei kelpaa.": "The API key format is invalid."
  ,"Anthropic API -avaimen muoto ei kelpaa.": "The Anthropic API key format is invalid."
  ,"OpenRouter API -avaimen muoto ei kelpaa.": "The OpenRouter API key format is invalid."
  ,"OpenRouter-avain vaatii mallipalveluksi OpenRouterin.": "An OpenRouter key requires OpenRouter as the model provider."
  ,"Anna kelvollinen mallin nimi.": "Enter a valid model name."
  ,"Kirjaudu sisään tallentaaksesi oman malliavaimen.": "Sign in to save your model key."
  ,"Kirjaudu sisään poistaaksesi oman malliavaimen.": "Sign in to remove your model key."
  ,"Kirjaudu sisään viedäksesi tietosi.": "Sign in to export your data."
  ,"Kirjaudu sisään vaihtaaksesi salasanan.": "Sign in to change your password."
  ,"Kirjaudu sisään poistaaksesi tilin.": "Sign in to delete your account."
  ,"Outention-tiliä ei löytynyt.": "Outention account not found."
  ,"Käyttäjätilit eivät ole vielä käytössä tällä palvelimella.": "User accounts are not enabled on this server yet."
  ,"Paikallinen malli on käytettävissä vain Personal Modessa.": "Local models are available only in Personal Mode."
  ,"Kirjoita ensin julkaisu.": "Write a post first."
  ,"Julkaisu on liian pitkä.": "The post is too long."
  ,"Valitse vähintään yksi julkaisukohde.": "Select at least one publishing destination."
  ,"Yhdistä Bluesky ennen julkaisemista.": "Connect Bluesky before posting."
  ,"Yhdistä Mastodon uudelleen julkaisuvaltuudella.": "Reconnect Mastodon with publishing permission."
  ,"Mastodon-yhteys peruttiin.": "Mastodon connection was cancelled."
  ,"Mastodon OAuth -pyyntö vanheni. Aloita yhdistäminen uudelleen.": "The Mastodon authorization expired. Start connecting again."
  ,"Syötteestä ei löytynyt luettavia julkaisuja.": "No readable posts were found in the feed."
  ,"Syötteitä voi olla enintään 24.": "You can add up to 24 feeds."
  ,"Syötteiden enimmäismäärä on jo käytössä.": "The maximum number of feeds is already in use."
  ,"Tiedosto ei ole OPML-tiedosto.": "The file is not an OPML file."
  ,"OPML-tiedostosta ei löytynyt julkisia HTTPS-syötteitä.": "No public HTTPS feeds were found in the OPML file."
  ,"Syötteen pitää olla julkinen HTTPS-osoite.": "The feed must have a public HTTPS address."
  ,"Syötteen haku epäonnistui.": "Could not fetch the feed."
  ,"Syöte on liian suuri.": "The feed is too large."
  ,"Paikkakuntaa ei tunnistettu. Kirjoita esimerkiksi “uutisia Rautalammista”.": "The location was not recognized. Try, for example, ‘news from Brooklyn’."
  ,"Reddit OAuth -asetukset puuttuvat .env-tiedostosta.": "Reddit OAuth settings are missing from the .env file."
  ,"Reddit-yhteys peruttiin.": "Reddit connection was cancelled."
  ,"Reddit OAuth -pyyntö vanheni. Aloita yhdistäminen uudelleen.": "The Reddit authorization expired. Start connecting again."
  ,"Threads OAuth -asetukset puuttuvat .env.local-tiedostosta.": "Threads OAuth settings are missing from the .env.local file."
  ,"Threads-yhteys peruttiin.": "Threads connection was cancelled."
  ,"Threads OAuth -pyyntö vanheni. Aloita yhdistäminen uudelleen.": "The Threads authorization expired. Start connecting again."
  ,"Anna Bluesky-tunnus ja salasana.": "Enter your Bluesky handle and app password."
  ,"Internet-betassa Blueskyyn voi yhdistää vain erillisellä app-salasanalla, ei tilin pääsalasanalla.": "The internet beta accepts only a separate Bluesky app password, not your main account password."
  ,"Paikallisen mallin osoitteen pitää olla localhost tai host.docker.internal.": "The local model address must use localhost or host.docker.internal."
  ,"Paikallisen mallipalvelun mallilistaa ei voitu lukea.": "The local model service did not return its installed models. Check that it is running and the endpoint is correct."
  ,"Malliyhteys ei läpäissyt rakenteisen vastauksen testiä.": "The model connection failed the structured-output test. Choose a compatible model or provider."
  ,"Kuraattorimalli palautti puutteellisen ranking-ohjelman.": "The curator model returned an incomplete ranking program."
  ,"Kuraattorimalli ei arvioinut koko ehdokasjoukkoa.": "The curator model did not evaluate the complete candidate set."
  ,"Kuraattorimalli palautti virheellisen ehdokasarvion.": "The curator model returned an invalid candidate evaluation."
  ,"Anna kelvollinen Mastodon-instanssi, esimerkiksi mastodon.social.": "Enter a valid Mastodon instance, such as mastodon.social."
}));

function localizeMessage(message, locale) {
  if (locale === "fi") return message;
  if (englishErrors.has(message)) return englishErrors.get(message);
  const providerFailure = message.match(/^(OpenAI|Anthropic|OpenRouter|Gemini)-mallikutsu epäonnistui(.*)\.$/);
  if (providerFailure) return `${providerFailure[1]} model request failed${providerFailure[2]}.`;
  const localProviderFailure = message.match(/^Paikallinen mallikutsu epäonnistui(.*)\.$/);
  if (localProviderFailure) return `Local model request failed${localProviderFailure[1]}. Check that the selected model is installed and supports structured output.`;
  if (message === "Kuraattorimalli ei palauttanut rakenteista ohjelmaa.") return "The curator model did not return structured data.";
  if (message === "Kuraattorimalli palautti virheellisen rakenteisen vastauksen.") return "The curator model returned invalid structured data.";
  const unstructuredProvider = message.match(/^(Anthropic|OpenRouter|Gemini|Paikallinen malli) ei palauttanut rakenteista ohjelmaa\.$/);
  if (unstructuredProvider) return `${unstructuredProvider[1] === "Paikallinen malli" ? "The local model" : unstructuredProvider[1]} did not return structured data.`;
  const unavailableDestination = message.match(/^(.+) ei ole vielä käytettävissä julkaisukohteena\.$/);
  if (unavailableDestination) return `${unavailableDestination[1]} is not available as a publishing destination yet.`;
  return message;
}

function publicMessage(error, locale = "en") {
  if (error.status && error.message) return localizeMessage(error.message, locale);
  return locale === "fi" ? "Jokin meni vikaan. Tarkista yhteydet ja yritä uudelleen." : "Something went wrong. Check your connections and try again.";
}

function getRedditConfig() {
  return {
    clientId: process.env.REDDIT_CLIENT_ID || "",
    clientSecret: process.env.REDDIT_CLIENT_SECRET || "",
    redirectUri: process.env.REDDIT_REDIRECT_URI || `${publicBaseUrl}/api/oauth/reddit/callback`,
    userAgent: process.env.REDDIT_USER_AGENT || ""
  };
}

function getThreadsConfig() {
  return {
    appId: process.env.THREADS_APP_ID || "",
    appSecret: process.env.THREADS_APP_SECRET || "",
    redirectUri: process.env.THREADS_REDIRECT_URI || `${publicBaseUrl}/api/oauth/threads/callback`
  };
}

async function handleAccess(request, response, session, sessionId) {
  if (!betaAccessCode) { session.betaAccess = true; return sendJson(response, 200, { granted: true }); }
  enforceRateLimit(accessLimiter, `access:${requestIp(request, trustProxy)}`);
  if (!mutationAllowed(request, production ? expectedOrigin : null)) throw httpError(403, "Pyyntö estettiin. Päivitä sivu ja yritä uudelleen.");
  const body = await readJson(request);
  if (!safeEqualSecret(body.code, betaAccessCode)) throw httpError(401, "Kutsukoodi ei täsmää.");
  session.betaAccess = true;
  session.accessGrantedAt = Date.now();
  return sendJson(response, 200, { granted: true, sessionId: sessionId.slice(0, 8) });
}

function enforceRateLimit(limiter, key) {
  const result = limiter.consume(key);
  if (!result.allowed) throw httpError(429, "Käyttöraja tuli hetkeksi vastaan. Yritä myöhemmin uudelleen.");
}

function sessionCookie(id) {
  const attributes = [`outention_session=${id}`, "HttpOnly", "SameSite=Lax", `Path=${basePath || "/"}`, "Max-Age=86400"];
  if (production) attributes.push("Secure");
  return attributes.join("; ");
}

function authCookie(token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  const attributes = [`outention_auth=${token}`, "HttpOnly", "SameSite=Lax", `Path=${basePath || "/"}`, `Max-Age=${maxAge}`];
  if (production) attributes.push("Secure");
  return attributes.join("; ");
}

function clearAuthCookie() {
  const attributes = ["outention_auth=", "HttpOnly", "SameSite=Lax", `Path=${basePath || "/"}`, "Max-Age=0"];
  if (production) attributes.push("Secure");
  return attributes.join("; ");
}

function applySecurityHeaders(response) {
  response.setHeader("content-security-policy", "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; media-src 'self' https: blob:; frame-src https://www.youtube-nocookie.com; connect-src 'self'");
  response.setHeader("referrer-policy", "no-referrer");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  if (production) response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
}

function applicationUrl(incoming) {
  if (!basePath) return incoming;
  if (!incoming.pathname.startsWith(`${basePath}/`)) return null;
  incoming.pathname = incoming.pathname.slice(basePath.length) || "/";
  return incoming;
}

function withBasePath(pathname) { return `${basePath}${pathname.startsWith("/") ? pathname : `/${pathname}`}` || "/"; }

function normalizeBasePath(value) {
  const clean = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  if (!clean) return "";
  if (!/^[a-zA-Z0-9/_-]+$/.test(clean) || clean.includes("..")) throw new Error("BASE_PATH sisältää virheellisiä merkkejä.");
  return `/${clean}`;
}

function envInteger(name, fallback, minimum, maximum) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, Math.round(value))) : fallback;
}

function cleanupMemory() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, session] of sessions) if ((session.lastSeenAt || 0) < cutoff) sessions.delete(id);
  const oauthCutoff = Date.now() - 10 * 60 * 1000;
  for (const [state, pending] of redditOauthStates) if (pending.createdAt < oauthCutoff) redditOauthStates.delete(state);
  for (const [state, pending] of mastodonOauthStates) if (pending.createdAt < oauthCutoff) mastodonOauthStates.delete(state);
  for (const [state, pending] of threadsOauthStates) if (pending.createdAt < oauthCutoff) threadsOauthStates.delete(state);
  authStore?.sweep().catch(error => console.error("Auth cleanup", error.message));
  accessLimiter.sweep(); authLimiter.sweep(); apiLimiter.sweep(); hourlyFeedLimiter.sweep(); dailyFeedLimiter.sweep();
}
