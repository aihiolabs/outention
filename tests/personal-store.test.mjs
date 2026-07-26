import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PersonalConnectionStore } from "../src/personal-store.js";

test("personal connections survive a new encrypted-store instance", async () => {
  const directory = await mkdtemp(join(tmpdir(), "outention-store-test-"));
  const path = join(directory, "connections.enc.json");
  let persistedKey = "";
  try {
    const first = new PersonalConnectionStore({
      path,
      persistEncryptionKey: async key => { persistedKey = key; }
    });
    await first.save({ hackernews: true, bluesky: { accessJwt: "secret-token", handle: "example.test" } });

    const raw = await readFile(path, "utf8");
    assert.doesNotMatch(raw, /secret-token|example\.test|hackernews/);
    assert.equal((await stat(path)).mode & 0o777, 0o600);

    const restarted = new PersonalConnectionStore({ path, encryptionKey: persistedKey });
    assert.deepEqual(await restarted.load(), {
      hackernews: true,
      bluesky: { accessJwt: "secret-token", handle: "example.test" }
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("personal connection store rejects an incorrect encryption key", async () => {
  const directory = await mkdtemp(join(tmpdir(), "outention-store-test-"));
  const path = join(directory, "connections.enc.json");
  try {
    const first = new PersonalConnectionStore({ path, persistEncryptionKey: async () => {} });
    await first.save({ yle: true });
    const wrongKey = Buffer.alloc(32, 7).toString("base64url");
    await assert.rejects(
      () => new PersonalConnectionStore({ path, encryptionKey: wrongKey }).load(),
      /Could not open the encrypted local connection store/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
