/**
 * dsh-plugin-browser — awesome-dsh-plugin catalog loading with fallbacks.
 *
 * Load order:
 *   1. live fetch of https://awesome-dsh-plugin.com/plugins.json (bounded timeout)
 *   2. this package's bundled snapshot (data/registry-snapshot.json) — offline safe
 *   3. the dshmarket package's bundled snapshot, if dshmarket is installed
 * The result is cached in-process for CATALOG_TTL_MS; a failed refresh keeps the
 * previous value instead of dropping it.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CATALOG_URL = 'https://awesome-dsh-plugin.com/plugins.json';
const FETCH_TIMEOUT_MS = 6000;
const CATALOG_TTL_MS = 10 * 60 * 1000;

let cache = null;
let cacheTime = 0;

/** The directory this package lives in (works for file:/link:/npm installs). */
function packageDir() {
  return dirname(fileURLToPath(import.meta.url));
}

/** Read a plugins.json-shaped payload from disk; null when absent or invalid. */
function readSnapshotFile(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed && Array.isArray(parsed.plugins)) return parsed;
    return null;
  }
  catch {
    return null;
  }
}

/** Bundled snapshot shipped inside this package. */
function bundledSnapshot() {
  return readSnapshotFile(join(packageDir(), '..', 'data', 'registry-snapshot.json'));
}

/**
 * dshmarket bundles its own registry snapshot; reuse it when present so this
 * plugin works even without network and without a stale local copy.
 * @param profileDir - the profile directory (resolves the hoisted node_modules).
 */
function marketSnapshot(profileDir) {
  return readSnapshotFile(join(profileDir, 'node_modules', 'dshmarket', 'data', 'registry-snapshot.json'));
}

async function fetchLive() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(CATALOG_URL, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
    const parsed = await response.json();
    if (!parsed || !Array.isArray(parsed.plugins)) throw new Error('catalog payload has no plugins array');
    return { source: CATALOG_URL, registry: parsed };
  }
  finally {
    clearTimeout(timer);
  }
}

/**
 * Load the awesome-dsh-plugin catalog with fallbacks.
 * @param profileDir - profile directory, used for the dshmarket fallback.
 * @returns {Promise<{source: string, registry: object}>}
 */
export async function loadCatalog(profileDir) {
  const now = Date.now();
  if (cache !== null && now - cacheTime < CATALOG_TTL_MS) return cache;
  let loaded = null;
  try {
    loaded = await fetchLive();
  }
  catch {
    loaded = null;
  }
  if (loaded === null) {
    const bundled = bundledSnapshot();
    if (bundled !== null) loaded = { source: 'bundled snapshot', registry: bundled };
  }
  if (loaded === null) {
    const market = marketSnapshot(profileDir);
    if (market !== null) loaded = { source: 'dshmarket snapshot', registry: market };
  }
  if (loaded === null) {
    throw new Error('catalog unavailable: live fetch failed and no snapshot is readable');
  }
  cache = loaded;
  cacheTime = now;
  return loaded;
}

/** Drop the cache so the next call re-resolves (used by the refresh route). */
export function invalidateCatalog() {
  cache = null;
  cacheTime = 0;
}
