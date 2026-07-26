import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 43173;
const origin = `http://127.0.0.1:${port}`;
const temporaryDirectory = await mkdtemp(join(tmpdir(), "outention-personal-smoke-"));
const localConfigPath = join(temporaryDirectory, ".env.local");
const localConnectionsPath = join(temporaryDirectory, "connections.enc.json");
const child = spawn(process.execPath, ["dist/server.js"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    OUTENTION_PACKAGE_ROOT: process.cwd(),
    OUTENTION_MODE: "personal",
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    PORT: String(port),
    PUBLIC_BASE_URL: origin,
    OUTENTION_CONFIG_PATH: localConfigPath,
    BETA_ACCESS_CODE: "",
    DATABASE_URL: "",
    MODEL_PROVIDER: "openrouter",
    MODEL_API_KEY: ["sk", "or", "local-smoke-not-a-real-key"].join("-"),
    OUTENTION_SKIP_MODEL_PROBE: "1",
    MODEL_NAME: "openai/test-model"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let stderr = "";
child.stderr.on("data", chunk => { stderr += chunk; });

try {
  await waitForHealth();
  const first = await getJson("/api/status");
  assert(first.accountFeatures?.personalMode, "personal mode missing from status");
  assert(first.account === null, "personal mode unexpectedly requires an account");
  assert(first.curator?.configured && first.curator.keySource === "local-environment", "environment BYOK is not active");
  assert(first.accountFeatures?.persistentConnections, "local connection persistence is not advertised");
  assert(first.publicDiscovery?.connected && first.publicDiscovery.sources?.includes("bluesky"), "public discovery is not available without a personal source");

  const manifestResponse = await fetch(`${origin}/manifest.webmanifest`);
  const manifest = await manifestResponse.json();
  assert(manifestResponse.headers.get("content-type")?.startsWith("application/manifest+json"), "PWA manifest content type is incorrect");
  assert(manifest.name === "Outention" && manifest.display === "standalone" && manifest.icons?.some(icon => icon.sizes === "512x512"), "PWA manifest is incomplete");
  const iconResponse = await fetch(`${origin}/icon-192.png`);
  assert(iconResponse.ok && iconResponse.headers.get("content-type") === "image/png", "PWA PNG icon is unavailable");
  const serviceWorkerResponse = await fetch(`${origin}/sw.js`);
  assert(serviceWorkerResponse.ok && (await serviceWorkerResponse.text()).includes("outention-shell"), "service worker is unavailable");

  const cookie = first.cookie;
  const sessionOnly = await requestJson("/api/account/model-key", {
    method: "POST", cookie,
    body: { provider: "openai", apiKey: ["sk", "local-smoke-session-only-key"].join("-"), model: "gpt-test", persist: false }
  });
  assert(sessionOnly.data.configured && !sessionOnly.data.persisted, "session-only BYOK was incorrectly reported as persisted");
  const reusedSessionKey = await requestJson("/api/account/model-key", {
    method: "POST", cookie,
    body: { provider: "openai", apiKey: "", model: "gpt-test-updated", persist: false }
  });
  assert(reusedSessionKey.data.model === "gpt-test-updated" && !reusedSessionKey.data.persisted, "existing session key could not be reused for a model-only update");

  const saved = await requestJson("/api/account/model-key", {
    method: "POST", cookie,
    body: { provider: "anthropic", apiKey: ["sk", "ant", "local-smoke-not-a-real-key"].join("-"), model: "claude-test", persist: true }
  });
  assert(saved.data.configured && saved.data.provider === "anthropic" && saved.data.persisted, "persistent local BYOK failed");
  const savedConfig = await readFile(localConfigPath, "utf8");
  assert(savedConfig.includes("MODEL_PROVIDER=anthropic") && savedConfig.includes("MODEL_API_KEY=sk-ant-local"), "local BYOK was not written to .env.local");

  const status = await requestJson("/api/status", { cookie });
  assert(status.data.accountFeatures.byok.provider === "anthropic", "session BYOK was not retained");

  await requestJson("/api/connect/hackernews", { method: "POST", cookie, body: {} });
  const secondBrowser = await getJson("/api/status");
  assert(secondBrowser.hackernews?.connected, "saved personal sources were not hydrated into a new browser session");
  const encryptedConnections = await readFile(localConnectionsPath, "utf8");
  assert(!encryptedConnections.includes("hackernews"), "local connections were stored as plaintext");
  const configWithDataKey = await readFile(localConfigPath, "utf8");
  assert(configWithDataKey.includes("LOCAL_DATA_KEY="), "local connection encryption key was not persisted");

  const removed = await requestJson("/api/account/model-key", { method: "DELETE", cookie, body: {} });
  assert(!removed.data.configured, "session BYOK was not removed");
  const clearedConfig = await readFile(localConfigPath, "utf8");
  assert(!clearedConfig.includes("MODEL_API_KEY=sk-ant-local"), "local BYOK was not removed from .env.local");
  console.log("personal-http-smoke=ok accountless=true environmentByok=true persistentLocalByok=true encryptedSources=true pwa=true");
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 2000))]);
  await rm(temporaryDirectory, { recursive: true, force: true });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try { if ((await fetch(`${origin}/api/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`personal server did not start: ${stderr.slice(0, 500)}`);
}

async function getJson(path) {
  const response = await fetch(`${origin}${path}`, { headers: { "x-outention-locale": "en" } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `${path} failed`);
  return { ...data, cookie: response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ") };
}

async function requestJson(path, { method = "GET", cookie = "", body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-outention-request": "1", "x-outention-locale": "en", origin, cookie },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `${path} failed`);
  return { data, response };
}

function assert(value, message) { if (!value) throw new Error(message); }
