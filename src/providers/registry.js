import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineConnector, validateCandidateBatch } from "./contract.js";

export async function loadConnectorDirectory(directory) {
  const connectors = [];
  const errors = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error.code === "ENOENT") return { connectors, errors };
    throw error;
  }
  for (const entry of entries.filter(item => item.isFile() && item.name.endsWith(".mjs")).sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      const module = await import(pathToFileURL(join(directory, entry.name)).href);
      const connector = defineConnector(module.connector || module.default);
      if (connectors.some(item => item.id === connector.id)) throw new TypeError(`Duplicate connector id: ${connector.id}`);
      connectors.push(connector);
    } catch (error) {
      errors.push({ file: entry.name, error: error.message || "Invalid connector" });
    }
  }
  return { connectors, errors };
}

export async function fetchConnectorCandidates(connector, context) {
  const limit = Math.min(40, Math.max(1, Number(context.limit) || 25));
  const items = await connector.fetchCandidates({ ...context, limit });
  return validateCandidateBatch(items, connector.id).slice(0, limit);
}
