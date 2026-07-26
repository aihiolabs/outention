import { timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function safeEqualSecret(candidate, expected) {
  const left = Buffer.from(String(candidate || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length === right.length && timingSafeEqual(left, right);
}

export class SlidingWindowLimiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.entries = new Map();
  }

  consume(key, now = Date.now()) {
    const cutoff = now - this.windowMs;
    const recent = (this.entries.get(key) || []).filter(timestamp => timestamp > cutoff);
    if (recent.length >= this.limit) {
      this.entries.set(key, recent);
      return { allowed: false, remaining: 0, resetAt: recent[0] + this.windowMs };
    }
    recent.push(now);
    this.entries.set(key, recent);
    return { allowed: true, remaining: this.limit - recent.length, resetAt: recent[0] + this.windowMs };
  }

  sweep(now = Date.now()) {
    const cutoff = now - this.windowMs;
    for (const [key, timestamps] of this.entries) {
      const recent = timestamps.filter(timestamp => timestamp > cutoff);
      if (recent.length) this.entries.set(key, recent);
      else this.entries.delete(key);
    }
  }
}

export function publicHttpsUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw securityError(400, "Anna kelvollinen julkinen HTTPS-osoite."); }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
    throw securityError(400, "Osoitteen pitää olla julkinen HTTPS-osoite ilman käyttäjätietoja.");
  }
  if (isObviouslyPrivateHostname(url.hostname)) throw securityError(400, "Paikallisiin tai yksityisiin verkko-osoitteisiin ei voi yhdistää.");
  return url;
}

export async function assertPublicHostname(hostname, resolveHost = defaultResolveHost) {
  if (isObviouslyPrivateHostname(hostname)) throw securityError(400, "Paikallisiin tai yksityisiin verkko-osoitteisiin ei voi yhdistää.");
  let addresses;
  try { addresses = await resolveHost(hostname); }
  catch { throw securityError(502, "Lähteen verkkotunnusta ei voitu ratkaista."); }
  if (!addresses?.length || addresses.some(entry => !isPublicAddress(typeof entry === "string" ? entry : entry.address))) {
    throw securityError(400, "Lähteen osoite ei saa osoittaa paikalliseen tai yksityiseen verkkoon.");
  }
}

export async function fetchPublicUrl(value, options = {}, { resolveHost = defaultResolveHost, fetchImpl = globalThis.fetch, maxRedirects = 3 } = {}) {
  let url = publicHttpsUrl(value);
  for (let redirect = 0; redirect <= maxRedirects; redirect++) {
    await assertPublicHostname(url.hostname, resolveHost);
    const response = await fetchImpl(url.toString(), { ...options, signal: options.signal || AbortSignal.timeout(10_000), redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    if (redirect === maxRedirects) throw securityError(400, "Lähde uudelleenohjasi liian monta kertaa.");
    const location = response.headers.get("location");
    if (!location) throw securityError(502, "Lähde palautti virheellisen uudelleenohjauksen.");
    url = publicHttpsUrl(new URL(location, url).toString());
  }
  throw securityError(502, "Lähteen haku epäonnistui.");
}

export function requestIp(request, trustProxy = false) {
  if (trustProxy) {
    const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return request.socket?.remoteAddress || "unknown";
}

export function mutationAllowed(request, expectedOrigin) {
  if (request.headers["x-outention-request"] !== "1" && request.headers["x-kuule-request"] !== "1") return false;
  const origin = request.headers.origin;
  if (!expectedOrigin) return true;
  return Boolean(origin && origin === expectedOrigin);
}

function isObviouslyPrivateHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || isIP(host) > 0 && !isPublicAddress(host);
}

function isPublicAddress(address) {
  const value = String(address || "").toLowerCase().split("%")[0];
  if (isIP(value) === 4) {
    const [a, b, c] = value.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 100 && b >= 64 && b <= 127 || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2)) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  if (isIP(value) === 6) {
    if (value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff") || value.startsWith("2001:db8")) return false;
    const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPublicAddress(mapped) : true;
  }
  return false;
}

async function defaultResolveHost(hostname) {
  return lookup(hostname, { all: true, verbatim: true });
}

function securityError(status, message) { const error = new Error(message); error.status = status; return error; }
