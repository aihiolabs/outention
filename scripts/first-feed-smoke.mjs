import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appPort = await freePort();
let modelPort;
const origin = `http://127.0.0.1:${appPort}`;
const temporaryDirectory = await mkdtemp(join(tmpdir(), "outention-first-feed-"));
const connectorDirectory = join(temporaryDirectory, "connectors");
await mkdir(connectorDirectory);
await writeFile(join(connectorDirectory, "fixture.mjs"), connectorSource());

const modelServer = createServer(async (request, response) => {
  if (request.url === "/api/tags") return json(response, { models: [{ name: "smoke-model" }] });
  if (request.url === "/api/kunnat") return json(response, []);
  if (request.url?.startsWith("/api/feed")) return json(response, { stories: [] });
  const ollamaRequest = request.url === "/api/chat";
  const compatibleRequest = request.url === "/v1/chat/completions";
  if ((!ollamaRequest && !compatibleRequest) || request.method !== "POST") return json(response, { error: "not found" }, 404);
  const body = await readJson(request);
  const input = JSON.parse(body.messages?.at(-1)?.content || "{}");
  let content;
  if (input.task) content = { ok: true };
  else if (input.current_intent) content = compiledProgram(input.current_intent);
  else if (input.candidates) content = { evaluated: input.candidates.map(candidate => ({ id: candidate.id, semantic_score: 88, tone_score: 80, core_match: true, hard_excluded: false, reasons: ["Personal update"] })) };
  else content = { ok: true };
  return json(response, ollamaRequest
    ? { message: { content: JSON.stringify(content) } }
    : { choices: [{ message: { content: JSON.stringify(content) } }] });
});
await new Promise(resolve => modelServer.listen(0, "127.0.0.1", resolve));
modelPort = modelServer.address().port;

const child = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("..", import.meta.url),
  env: {
    ...process.env,
    OUTENTION_MODE: "personal", OUTENTION_IGNORE_PROJECT_ENV: "1", NODE_ENV: "development",
    HOST: "127.0.0.1", PORT: String(appPort), PUBLIC_BASE_URL: origin,
    OUTENTION_CONFIG_PATH: join(temporaryDirectory, ".env.local"),
    OUTENTION_CONNECTIONS_PATH: join(temporaryDirectory, "connections.enc.json"),
    OUTENTION_CONNECTORS_DIR: connectorDirectory,
    LOCATIONEWS_URL: `http://127.0.0.1:${modelPort}`,
    BETA_ACCESS_CODE: "", DATABASE_URL: "", MODEL_API_KEY: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});
let stderr = ""; child.stderr.on("data", chunk => { stderr += chunk; });

try {
  await waitForHealth();
  const status = await getJson("/api/status");
  assert(status.customConnectors.sources.some(source => source.id === "fixture"), "local connector was not loaded");
  const saved = await requestJson("/api/account/model-key", {
    method: "POST", cookie: status.cookie,
    body: { provider: "local", model: "smoke-model", baseUrl: `http://127.0.0.1:${modelPort}/v1`, apiKey: "", persist: true }
  });
  assert(saved.verified, "model was saved without a successful structured-output probe");
  const feed = await requestJson("/api/feed", { method: "POST", cookie: status.cookie, body: { intent: "Updates from my friends", profileContext: "" } });
  assert(feed.items.length >= 8, `first feed was unexpectedly sparse: ${feed.items.length}`);
  assert(feed.program.languages.length === 0, "UI language leaked into content-language filtering");
  assert(feed.pipeline.triaged <= 40 && feed.pipeline.modelEvaluated <= 40, "onion prefilter did not bound model input");
  console.log(`first-feed-smoke=ok items=${feed.items.length} triaged=${feed.pipeline.triaged} modelCalls=${feed.pipeline.modelCalls}`);
} finally {
  child.kill("SIGTERM");
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 2000))]);
  await new Promise(resolve => modelServer.close(resolve));
  await rm(temporaryDirectory, { recursive: true, force: true });
}

function compiledProgram(intent) {
  return { clarification_needed: false, clarification_question: null, program: {
    intent, selection_mode: "broad_personal", origin_scope: "people", include: ["personal updates"], exclude: [], tone: ["personal"], social_scope: ["friends"], content_forms: ["posts"], languages: ["en"], required_sources: [],
    weights: { relevance: 40, tone: 10, freshness: 20, social: 25, engagement: 5 }, diversity: { max_per_author: 2 }, horizon_hours: 72, familiarity_target: 95, market_context: "US/global",
    discovery: { bluesky_queries: [], reddit_queries: [], mastodon_tags: [] }
  } };
}

function connectorSource() {
  return `export const connector={apiVersion:1,id:"fixture",name:"Fixture friends",capabilities:["personal-feed"],async fetchCandidates(){return Array.from({length:12},(_,i)=>({id:"fixture:"+i,sourceType:"fixture",sourceName:"Fixture friends",feedLayer:"personal",canonicalUrl:"https://example.com/posts/"+i,author:{id:"friend-"+i,name:"Friend "+i,handle:"@friend"+i,avatar:null},text:"A real personal update from friend "+i,language:"en",publishedAt:new Date(Date.now()-i*60000).toISOString(),indexedAt:new Date().toISOString(),engagement:{likes:i,replies:0,reposts:0},socialContext:"Followed person",reply:null,labels:[],media:[]}))}};`;
}
async function waitForHealth() { for (let attempt = 0; attempt < 50; attempt++) { try { if ((await fetch(`${origin}/api/health`)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error(`server did not start: ${stderr.slice(0, 800)}`); }
async function getJson(path) { const response = await fetch(`${origin}${path}`, { headers: { "x-outention-locale": "en" } }); const data = await response.json(); if (!response.ok) throw new Error(data.error || `${path} failed`); return { ...data, cookie: response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ") }; }
async function requestJson(path, { method = "GET", cookie = "", body } = {}) { const response = await fetch(`${origin}${path}`, { method, headers: { "content-type": "application/json", "x-outention-request": "1", "x-outention-locale": "en", origin, cookie }, body: body === undefined ? undefined : JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || `${path} failed`); return data; }
async function readJson(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
function json(response, body, status = 200) { response.writeHead(status, { "content-type": "application/json" }); response.end(JSON.stringify(body)); }
function assert(value, message) { if (!value) throw new Error(message); }
async function freePort() { const probe = createServer(); await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve)); const port = probe.address().port; await new Promise(resolve => probe.close(resolve)); return port; }
