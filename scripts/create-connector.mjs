import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const id = String(process.argv[2] || "").trim().toLowerCase();
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
  console.error("Usage: npm run connector:create -- example-source");
  console.error("Use lowercase letters, numbers, and hyphens.");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const providerPath = join(root, "src", "providers", `${id}.js`);
const testPath = join(root, "tests", `${id}.test.mjs`);
await mkdir(join(root, "src", "providers"), { recursive: true });
await mkdir(join(root, "tests"), { recursive: true });

const provider = `import { CONNECTOR_API_VERSION, defineConnector, validateCandidateBatch } from "./contract.js";

export const connector = defineConnector({
  apiVersion: CONNECTOR_API_VERSION,
  id: "${id}",
  name: "${title(id)}",
  capabilities: ["discovery"],
  async fetchCandidates({ limit = 25 } = {}) {
    // Fetch only a bounded source-native candidate set here.
    const items = [];
    return validateCandidateBatch(items.slice(0, Math.min(limit, 40)), "${id}");
  }
});
`;

const test = `import test from "node:test";
import assert from "node:assert/strict";
import { connector } from "../src/providers/${id}.js";

test("${id} exposes the Outention connector contract", async () => {
  assert.equal(connector.apiVersion, 1);
  assert.equal(connector.id, "${id}");
  assert.ok(connector.capabilities.includes("discovery"));
  assert.deepEqual(await connector.fetchCandidates({ limit: 1 }), []);
});
`;

try {
  await writeFile(providerPath, provider, { encoding: "utf8", flag: "wx" });
  await writeFile(testPath, test, { encoding: "utf8", flag: "wx" });
} catch (error) {
  if (error.code === "EEXIST") {
    console.error(`Connector ${id} already exists.`);
    process.exit(1);
  }
  throw error;
}

console.log(`Created:\n- ${providerPath}\n- ${testPath}`);
console.log("Next: add bounded retrieval, normalize candidates, add a fixture, and run npm test.");

function title(value) { return value.split("-").map(part => part[0].toUpperCase() + part.slice(1)).join(" "); }
