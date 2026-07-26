import pg from "pg";
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const { Pool } = pg;
const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 30;
const migrations = [
  [1, `
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
  `],
  [2, `
    CREATE TABLE IF NOT EXISTS account_connections (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (account_id, provider)
    );
  `]
];

export class AuthStore {
  constructor(connectionString, encryptionKey = "") {
    if (!connectionString) throw new Error("DATABASE_URL is required for Outention accounts.");
    this.pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
    this.encryptionKey = parseEncryptionKey(encryptionKey);
  }

  async initialize() {
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext('outention_schema_migrations'))");
      await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
      const applied = new Set((await client.query("SELECT version FROM schema_migrations")).rows.map(row => row.version));
      for (const [version, sql] of migrations) {
        if (applied.has(version)) continue;
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('outention_schema_migrations'))").catch(() => null);
      client.release();
    }
  }

  async register(emailValue, passwordValue) {
    const email = normalizeEmail(emailValue);
    validatePassword(passwordValue);
    const salt = randomBytes(16);
    const passwordHash = await derivePassword(passwordValue, salt);
    const account = { id: randomBytes(16).toString("base64url"), email, createdAt: new Date() };
    try {
      await this.pool.query(
        "INSERT INTO accounts (id, email, password_hash, password_salt) VALUES ($1, $2, $3, $4)",
        [account.id, account.email, passwordHash.toString("base64url"), salt.toString("base64url")]
      );
    } catch (error) {
      if (error.code === "23505") throw authError(409, "Tällä sähköpostilla on jo Outention-tili.");
      throw error;
    }
    return { account: publicAccount(account), ...await this.createSession(account.id) };
  }

  async login(emailValue, passwordValue) {
    const email = normalizeEmail(emailValue);
    const { rows } = await this.pool.query(
      "SELECT id, email, password_hash, password_salt, created_at FROM accounts WHERE email = $1",
      [email]
    );
    const row = rows[0];
    if (!row) {
      await derivePassword(String(passwordValue || ""), Buffer.alloc(16));
      throw authError(401, "Sähköposti tai salasana on väärin.");
    }
    const actual = await derivePassword(String(passwordValue || ""), Buffer.from(row.password_salt, "base64url"));
    const expected = Buffer.from(row.password_hash, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw authError(401, "Sähköposti tai salasana on väärin.");
    return { account: publicAccount({ id: row.id, email: row.email, createdAt: row.created_at }), ...await this.createSession(row.id) };
  }

  async createSession(accountId) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await this.pool.query(
      "INSERT INTO auth_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)",
      [hashToken(token), accountId, expiresAt]
    );
    return { token, expiresAt: expiresAt.getTime() };
  }

  async accountForToken(token) {
    if (!token) return null;
    const { rows } = await this.pool.query(`
      SELECT accounts.id, accounts.email, accounts.created_at
      FROM auth_sessions JOIN accounts ON accounts.id = auth_sessions.account_id
      WHERE auth_sessions.token_hash = $1 AND auth_sessions.expires_at > NOW()
    `, [hashToken(token)]);
    const row = rows[0];
    return row ? publicAccount({ id: row.id, email: row.email, createdAt: row.created_at }) : null;
  }

  async logout(token) {
    if (token) await this.pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [hashToken(token)]);
  }

  async changePassword(accountId, currentPassword, newPassword, currentToken) {
    validatePassword(newPassword);
    const row = await this.passwordRow(accountId);
    await verifyPassword(row, currentPassword);
    const salt = randomBytes(16);
    const passwordHash = await derivePassword(newPassword, salt);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE accounts SET password_hash = $1, password_salt = $2 WHERE id = $3", [passwordHash.toString("base64url"), salt.toString("base64url"), accountId]);
      await client.query("DELETE FROM auth_sessions WHERE account_id = $1 AND token_hash <> $2", [accountId, hashToken(currentToken)]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
  }

  async exportAccount(accountId) {
    const accountResult = await this.pool.query("SELECT id, email, created_at FROM accounts WHERE id = $1", [accountId]);
    if (!accountResult.rows[0]) throw authError(404, "Outention-tiliä ei löytynyt.");
    const connectionResult = await this.pool.query("SELECT provider, updated_at FROM account_connections WHERE account_id = $1 ORDER BY provider", [accountId]);
    return {
      account: publicAccount({ id: accountResult.rows[0].id, email: accountResult.rows[0].email, createdAt: accountResult.rows[0].created_at }),
      connections: connectionResult.rows.map(row => ({ provider: row.provider, updatedAt: new Date(row.updated_at).toISOString() })),
      exportedAt: new Date().toISOString(),
      note: "Connector credentials are intentionally excluded from the export."
    };
  }

  async deleteAccount(accountId, password) {
    const row = await this.passwordRow(accountId);
    await verifyPassword(row, password);
    await this.pool.query("DELETE FROM accounts WHERE id = $1", [accountId]);
  }

  async passwordRow(accountId) {
    const { rows } = await this.pool.query("SELECT id, password_hash, password_salt FROM accounts WHERE id = $1", [accountId]);
    if (!rows[0]) throw authError(404, "Outention-tiliä ei löytynyt.");
    return rows[0];
  }

  get connectionsEnabled() { return Boolean(this.encryptionKey); }

  async saveConnection(accountId, provider, value) {
    if (!this.encryptionKey) throw new Error("DATA_ENCRYPTION_KEY is required for persistent connections.");
    validateProvider(provider);
    if (value == null) {
      await this.deleteConnection(accountId, provider);
      return;
    }
    const encrypted = encryptJson(value, this.encryptionKey);
    await this.pool.query(`
      INSERT INTO account_connections (account_id, provider, ciphertext, iv, auth_tag, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (account_id, provider) DO UPDATE SET
        ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, auth_tag = EXCLUDED.auth_tag, updated_at = NOW()
    `, [accountId, provider, encrypted.ciphertext, encrypted.iv, encrypted.authTag]);
  }

  async loadConnections(accountId) {
    if (!this.encryptionKey) return {};
    const { rows } = await this.pool.query(
      "SELECT provider, ciphertext, iv, auth_tag FROM account_connections WHERE account_id = $1",
      [accountId]
    );
    return Object.fromEntries(rows.map(row => [row.provider, decryptJson({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag }, this.encryptionKey)]));
  }

  async deleteConnection(accountId, provider) {
    validateProvider(provider);
    await this.pool.query("DELETE FROM account_connections WHERE account_id = $1 AND provider = $2", [accountId, provider]);
  }

  async sweep() { await this.pool.query("DELETE FROM auth_sessions WHERE expires_at <= NOW()"); }
  async close() { await this.pool.end(); }
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw authError(400, "Anna kelvollinen sähköpostiosoite.");
  return email;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 12) throw authError(400, "Salasanassa pitää olla vähintään 12 merkkiä.");
  if (password.length > 512) throw authError(400, "Salasana on liian pitkä.");
}

function derivePassword(password, salt) {
  return scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

async function verifyPassword(row, password) {
  const actual = await derivePassword(String(password || ""), Buffer.from(row.password_salt, "base64url"));
  const expected = Buffer.from(row.password_hash, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw authError(401, "Sähköposti tai salasana on väärin.");
}

function parseEncryptionKey(value) {
  if (!value) return null;
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64url");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must contain exactly 32 bytes.");
  return key;
}

function validateProvider(provider) {
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(String(provider))) throw new Error("Invalid connection provider.");
}

function encryptJson(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64url"), iv: iv.toString("base64url"), authTag: cipher.getAuthTag().toString("base64url") };
}

function decryptJson(value, key) {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64url")), decipher.final()]).toString("utf8"));
}

function hashToken(token) { return createHash("sha256").update(String(token)).digest("base64url"); }
function publicAccount(account) { return { id: account.id, email: account.email, createdAt: new Date(account.createdAt).toISOString() }; }
function authError(status, message) { const error = new Error(message); error.status = status; return error; }
