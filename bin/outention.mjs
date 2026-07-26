#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:net";
import { homedir, platform } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("-") ? args.shift() : "start";
const port = integerOption("--port", Number(process.env.PORT || 4173));
const host = valueOption("--host", process.env.HOST || "127.0.0.1");
const dataDirInput = valueOption("--data-dir", process.env.OUTENTION_DATA_DIR || join(homedir(), ".outention"));
const dataDir = isAbsolute(dataDirInput) ? dataDirInput : resolve(process.cwd(), dataDirInput);
const appUrl = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`;

if (args.includes("--help") || command === "help") {
  printHelp();
  process.exit(0);
}

if (command === "doctor") {
  const healthy = await doctor();
  process.exit(healthy ? 0 : 1);
}

if (command === "connector") {
  await createConnector();
  process.exit(0);
}

if (command !== "start") {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

if (Number(process.versions.node.split(".")[0]) < 20) {
  console.error(`Outention requires Node.js 20 or newer. Current: ${process.version}`);
  process.exit(1);
}

await mkdir(dataDir, { recursive: true, mode: 0o700 });
const existing = await health(appUrl);
if (existing) {
  console.log(`Outention is already running at ${appUrl}`);
  if (!args.includes("--no-open")) openBrowser(appUrl);
  process.exit(0);
}

if (!(await portAvailable(port, host))) {
  console.error(`Port ${port} is already in use. Try: outention --port ${port + 1}`);
  process.exit(1);
}

const child = spawn(process.execPath, [join(packageRoot, "dist", "server.js")], {
  env: {
    ...process.env,
    OUTENTION_PACKAGE_ROOT: packageRoot,
    OUTENTION_MODE: "personal",
    OUTENTION_IGNORE_PROJECT_ENV: "1",
    OUTENTION_CONFIG_PATH: join(dataDir, ".env.local"),
    OUTENTION_CONFIG_LABEL: join(dataDir, ".env.local"),
    OUTENTION_CONNECTIONS_PATH: join(dataDir, "connections.enc.json"),
    OUTENTION_CONNECTORS_DIR: join(dataDir, "connectors"),
    HOST: host,
    PORT: String(port),
    PUBLIC_BASE_URL: appUrl
  },
  stdio: "inherit"
});

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
});

const ready = await waitForHealth(appUrl, 12_000);
if (ready) {
  console.log(`Open ${appUrl}`);
  console.log(`Local data: ${dataDir}`);
  if (!args.includes("--no-open")) openBrowser(appUrl);
} else {
  console.error("Outention did not become ready. Run `outention doctor` and inspect the error above.");
  child.kill("SIGTERM");
}

child.on("exit", code => process.exitCode = code ?? 0);

async function doctor() {
  const checks = [];
  checks.push(["Node.js 20+", Number(process.versions.node.split(".")[0]) >= 20, process.version]);
  try {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    await access(dataDir, constants.R_OK | constants.W_OK);
    checks.push(["Local data directory", true, dataDir]);
  } catch (error) {
    checks.push(["Local data directory", false, error.message]);
  }
  const running = await health(appUrl);
  const available = running || await portAvailable(port, host);
  checks.push(["Local port", available, running ? `${appUrl} is healthy` : available ? `${host}:${port} is available` : `${host}:${port} is in use`]);
  const ollama = await fetchOk("http://127.0.0.1:11434/api/tags");
  checks.push(["Local model (optional)", true, ollama ? "Ollama detected" : "not detected; BYOK remains available"]);
  for (const [label, ok, detail] of checks) console.log(`${ok ? "✓" : "✗"} ${label}: ${detail}`);
  const required = checks.filter(([label]) => label !== "Local model (optional)");
  const healthy = required.every(([, ok]) => ok);
  console.log(healthy ? "\nOutention is ready to start." : "\nFix the failed checks before starting Outention.");
  return healthy;
}

async function createConnector() {
  const action = args.shift();
  const id = String(args.shift() || "").trim().toLowerCase();
  if (action !== "create" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    console.error("Usage: outention connector create <source-id> [--data-dir <path>]");
    process.exit(1);
  }
  const connectorDir = join(dataDir, "connectors");
  await mkdir(connectorDir, { recursive: true, mode: 0o700 });
  const path = join(connectorDir, `${id}.mjs`);
  const name = id.split("-").map(part => part[0].toUpperCase() + part.slice(1)).join(" ");
  const source = `// Trusted local code: this module runs with the same permissions as Outention.\nexport const connector = {\n  apiVersion: 1,\n  id: ${JSON.stringify(id)},\n  name: ${JSON.stringify(name)},\n  capabilities: ["discovery"],\n  async fetchCandidates({ intent, program, limit = 25 }) {\n    // Fetch a bounded source-native set and return normalized original content.\n    // See docs/CONNECTORS.md for the candidate shape.\n    return [];\n  }\n};\n`;
  try { await writeFile(path, source, { encoding: "utf8", flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (error.code === "EEXIST") { console.error(`Connector already exists: ${path}`); process.exit(1); }
    throw error;
  }
  console.log(`Created ${path}`);
  console.log("Restart Outention to load it. Review connector code before running it.");
}

function valueOption(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    console.error(`${name} requires a value.`);
    process.exit(1);
  }
  args.splice(index, 2);
  return value;
}

function integerOption(name, fallback) {
  const value = Number(valueOption(name, String(fallback)));
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    console.error(`${name} must be a port between 1 and 65535.`);
    process.exit(1);
  }
  return value;
}

async function health(url) {
  return fetchOk(`${url.replace(/\/$/, "")}/api/health`);
}

async function fetchOk(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await health(url)) return true;
    await new Promise(resolveWait => setTimeout(resolveWait, 150));
  }
  return false;
}

async function portAvailable(candidatePort, candidateHost) {
  return await new Promise(resolveCheck => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => resolveCheck(false));
    probe.listen(candidatePort, candidateHost, () => probe.close(() => resolveCheck(true)));
  });
}

function openBrowser(url) {
  const spec = platform() === "darwin"
    ? ["open", [url]]
    : platform() === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
  const opener = spawn(spec[0], spec[1], { detached: true, stdio: "ignore" });
  opener.unref();
  opener.on("error", () => console.log(`Open ${url} in your browser.`));
}

function printHelp() {
  console.log(`Outention — an open-source, intention-driven social feed

Usage:
  outention                       Start and open Outention
  outention --no-open             Start without opening a browser
  outention --port 4180           Use another local port
  outention --data-dir <path>     Store local configuration at a custom path
  outention doctor                Check the local installation
  outention connector create <id> Create a trusted local connector
  outention help                  Show this help`);
}
