export const CONNECTOR_API_VERSION = 1;

export function defineConnector(manifest) {
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

export function validateCandidate(candidate, connectorId = "connector") {
  if (!candidate || typeof candidate !== "object") throw candidateError(connectorId, "candidate must be an object");
  for (const key of ["id", "sourceType", "sourceName", "text", "publishedAt"]) {
    if (typeof candidate[key] !== "string" || !candidate[key].trim()) throw candidateError(connectorId, `${key} is required`);
  }
  if (!candidate.author || typeof candidate.author !== "object" || typeof candidate.author.name !== "string" || !candidate.author.name.trim()) {
    throw candidateError(connectorId, "author.name is required");
  }
  if (candidate.canonicalUrl != null) {
    let url;
    try { url = new URL(candidate.canonicalUrl); } catch { throw candidateError(connectorId, "canonicalUrl must be a valid URL"); }
    if (url.protocol !== "https:") throw candidateError(connectorId, "canonicalUrl must use HTTPS");
  }
  if (Number.isNaN(Date.parse(candidate.publishedAt))) throw candidateError(connectorId, "publishedAt must be an ISO-compatible date");
  if (candidate.feedLayer && !["personal", "discovery", "editorial"].includes(candidate.feedLayer)) throw candidateError(connectorId, "feedLayer is invalid");
  return candidate;
}

export function validateCandidateBatch(candidates, connectorId = "connector") {
  if (!Array.isArray(candidates)) throw candidateError(connectorId, "fetchCandidates must return an array");
  return candidates.map(candidate => validateCandidate(candidate, connectorId));
}

function validId(value) { return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value); }
function candidateError(connectorId, detail) { return new TypeError(`Connector ${connectorId}: ${detail}.`); }
