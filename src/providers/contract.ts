import type { Candidate, ConnectorManifest } from "../types.js";

export const CONNECTOR_API_VERSION = 1;

export function defineConnector<T extends ConnectorManifest>(manifest: T): Readonly<T> {
  const value = { ...manifest };
  if (value.apiVersion !== CONNECTOR_API_VERSION) throw new TypeError(`Connector apiVersion must be ${CONNECTOR_API_VERSION}.`);
  if (!validId(value.id)) throw new TypeError("Connector id must use lowercase letters, numbers, and hyphens.");
  if (typeof value.name !== "string" || !value.name.trim()) throw new TypeError("Connector name is required.");
  if (!Array.isArray(value.capabilities) || !value.capabilities.length) throw new TypeError("Connector capabilities are required.");
  const allowed = new Set(["personal-feed", "discovery", "publishing"]);
  if (value.capabilities.some(capability => !allowed.has(capability))) throw new TypeError("Connector capability is not supported.");
  if (typeof value.fetchCandidates !== "function") throw new TypeError("Connector fetchCandidates function is required.");
  return Object.freeze(value);
}

export function validateCandidate(candidate: unknown, connectorId = "connector"): Candidate {
  if (!candidate || typeof candidate !== "object") throw candidateError(connectorId, "candidate must be an object");
  const value = candidate as Record<string, unknown>;
  for (const key of ["id", "sourceType", "sourceName", "text", "publishedAt"]) {
    if (typeof value[key] !== "string" || !(value[key] as string).trim()) throw candidateError(connectorId, `${key} is required`);
  }
  const author = value.author as Record<string, unknown> | null;
  if (!author || typeof author !== "object" || typeof author.name !== "string" || !author.name.trim()) {
    throw candidateError(connectorId, "author.name is required");
  }
  if (value.canonicalUrl != null) {
    let url;
    try { url = new URL(String(value.canonicalUrl)); } catch { throw candidateError(connectorId, "canonicalUrl must be a valid URL"); }
    if (url.protocol !== "https:") throw candidateError(connectorId, "canonicalUrl must use HTTPS");
  }
  if (Number.isNaN(Date.parse(value.publishedAt as string))) throw candidateError(connectorId, "publishedAt must be an ISO-compatible date");
  if (value.feedLayer && !["personal", "discovery", "editorial"].includes(String(value.feedLayer))) throw candidateError(connectorId, "feedLayer is invalid");
  return value as unknown as Candidate;
}

export function validateCandidateBatch(candidates: unknown, connectorId = "connector"): Candidate[] {
  if (!Array.isArray(candidates)) throw candidateError(connectorId, "fetchCandidates must return an array");
  return candidates.map(candidate => validateCandidate(candidate, connectorId));
}

function validId(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value); }
function candidateError(connectorId: string, detail: string): TypeError { return new TypeError(`Connector ${connectorId}: ${detail}.`); }
