import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class PersonalConnectionStore {
  constructor({ path, encryptionKey = "", persistEncryptionKey }) {
    if (!path) throw new Error("A local connection-store path is required.");
    this.path = path;
    this.key = encryptionKey ? parseKey(encryptionKey) : null;
    this.persistEncryptionKey = persistEncryptionKey;
  }

  get configured() { return Boolean(this.key); }

  async load() {
    if (!this.key) return {};
    try {
      const envelope = JSON.parse(await readFile(this.path, "utf8"));
      if (envelope.version !== 1) throw new Error("Unsupported local connection-store version.");
      return decryptJson(envelope, this.key);
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw new Error(`Could not open the encrypted local connection store: ${error.message}`);
    }
  }

  async save(value) {
    if (!this.key) {
      this.key = randomBytes(32);
      if (typeof this.persistEncryptionKey !== "function") throw new Error("No way to persist the local connection-store key.");
      await this.persistEncryptionKey(this.key.toString("base64url"));
    }
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temporary, `${JSON.stringify(encryptJson(value, this.key))}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.path);
    await chmod(this.path, 0o600);
  }
}

function parseKey(value) {
  const input = String(value || "");
  const key = /^[a-f0-9]{64}$/i.test(input) ? Buffer.from(input, "hex") : Buffer.from(input, "base64url");
  if (key.length !== 32) throw new Error("LOCAL_DATA_KEY must contain exactly 32 bytes.");
  return key;
}

function encryptJson(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url")
  };
}

function decryptJson(value, key) {
  if (value.algorithm !== "aes-256-gcm") throw new Error("Unsupported local connection-store algorithm.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64url"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64url")),
    decipher.final()
  ]).toString("utf8"));
}
