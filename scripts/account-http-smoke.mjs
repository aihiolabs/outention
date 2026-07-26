import { AuthStore } from "../src/auth.js";

const origin = process.env.PUBLIC_BASE_URL;
const localUrl = `http://127.0.0.1:${process.env.PORT || 4173}`;
const headers = { "content-type": "application/json", "x-outention-request": "1", "x-outention-locale": "en", origin };
const email = `outention-http-test-${Date.now()}@example.com`;
const modelSecretMarker = `sk-or-smoke-${Date.now()}-not-a-real-key`;
let accountId = null;

if (!origin || !process.env.BETA_ACCESS_CODE || !process.env.DATABASE_URL) throw new Error("Smoke environment is incomplete.");

try {
  const access = await fetch(`${localUrl}/api/access`, {
    method: "POST", headers, body: JSON.stringify({ code: process.env.BETA_ACCESS_CODE })
  });
  if (!access.ok) throw new Error(`access failed ${access.status}`);
  const guestCookie = cookieHeader(access);

  const register = await fetch(`${localUrl}/api/account/register`, {
    method: "POST", headers: { ...headers, cookie: guestCookie },
    body: JSON.stringify({ email, password: "correct-horse-battery-staple-42" })
  });
  const registered = await register.json();
  if (!register.ok) throw new Error(`register failed ${register.status}: ${registered.error || "unknown"}`);
  accountId = registered.account.id;
  const cookies = `${guestCookie}; ${cookieHeader(register)}`;

  const status = await fetch(`${localUrl}/api/status`, { headers: { "x-outention-locale": "en", cookie: cookies } });
  const statusData = await status.json();
  if (statusData.account?.email !== email || !statusData.accountFeatures?.persistentConnections) throw new Error("authenticated status failed");

  const enableYle = await fetch(`${localUrl}/api/connect/yle`, {
    method: "POST", headers: { ...headers, cookie: cookies }, body: "{}"
  });
  if (!enableYle.ok) throw new Error(`source persistence setup failed ${enableYle.status}`);
  const saveModel = await fetch(`${localUrl}/api/account/model-key`, {
    method: "POST", headers: { ...headers, cookie: cookies }, body: JSON.stringify({ provider: "openrouter", model: "openai/test-model", apiKey: modelSecretMarker, persist: true })
  });
  if (!saveModel.ok) throw new Error(`BYOK persistence setup failed ${saveModel.status}`);
  const secondAccess = await fetch(`${localUrl}/api/access`, {
    method: "POST", headers, body: JSON.stringify({ code: process.env.BETA_ACCESS_CODE })
  });
  if (!secondAccess.ok) throw new Error(`second access failed ${secondAccess.status}`);
  const freshSessionCookies = `${cookieHeader(secondAccess)}; ${cookieHeader(register)}`;
  const freshStatus = await fetch(`${localUrl}/api/status`, { headers: { "x-outention-locale": "en", cookie: freshSessionCookies } });
  const freshData = await freshStatus.json();
  if (!freshData.yle?.connected || freshData.account?.email !== email) throw new Error("encrypted source hydration failed");
  if (!freshData.accountFeatures?.byok?.persisted || freshData.accountFeatures.byok.provider !== "openrouter" || freshData.accountFeatures.byok.model !== "openai/test-model") throw new Error("encrypted BYOK hydration failed");
  const freshCookies = freshSessionCookies;

  const exported = await fetch(`${localUrl}/api/account/export`, { headers: { "x-outention-locale": "en", cookie: freshCookies } });
  const exportData = await exported.json();
  if (!exported.ok || JSON.stringify(exportData).includes(modelSecretMarker)) throw new Error("account export exposed secret material");
  if (!exportData.connections?.some(item => item.provider === "model_byok")) throw new Error("account export omitted connection metadata");

  const changePassword = await fetch(`${localUrl}/api/account/password`, {
    method: "POST", headers: { ...headers, cookie: freshCookies },
    body: JSON.stringify({ currentPassword: "correct-horse-battery-staple-42", newPassword: "new-correct-horse-battery-staple-43" })
  });
  if (!changePassword.ok) throw new Error(`password change failed ${changePassword.status}`);

  const logout = await fetch(`${localUrl}/api/account/logout`, {
    method: "POST", headers: { ...headers, cookie: freshCookies }, body: "{}"
  });
  if (!logout.ok) throw new Error(`logout failed ${logout.status}`);
  const after = await fetch(`${localUrl}/api/status`, { headers: { "x-outention-locale": "en", cookie: freshCookies } });
  const afterData = await after.json();
  if (afterData.account || afterData.yle?.connected) throw new Error("account data survived logout");
  console.log("account-http-smoke=ok persistentConnections=true encryptedHydration=true encryptedByok=true safeExport=true passwordChange=true logoutClears=true");
} finally {
  if (accountId) {
    const store = new AuthStore(process.env.DATABASE_URL, process.env.DATA_ENCRYPTION_KEY);
    await store.pool.query("DELETE FROM accounts WHERE id = $1", [accountId]);
    await store.close();
  }
}

function cookieHeader(response) {
  return response.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
}
