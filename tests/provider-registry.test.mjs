import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fetchConnectorCandidates, loadConnectorDirectory } from "../src/providers/registry.js";

test("loads trusted local connector modules and rejects broken ones", async () => {
  const directory = await mkdtemp(join(tmpdir(), "outention-connectors-"));
  await writeFile(join(directory, "working.mjs"), `export const connector={apiVersion:1,id:"working",name:"Working",capabilities:["discovery"],async fetchCandidates(){return []}};`);
  await writeFile(join(directory, "broken.mjs"), `export const connector={apiVersion:9,id:"broken"};`);
  const loaded = await loadConnectorDirectory(directory);
  assert.deepEqual(loaded.connectors.map(item => item.id), ["working"]);
  assert.equal(loaded.errors.length, 1);
  assert.deepEqual(await fetchConnectorCandidates(loaded.connectors[0], { limit: 2 }), []);
});
