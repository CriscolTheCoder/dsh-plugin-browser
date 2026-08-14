/**
 * dsh-plugin-browser — HTTP routes.
 *
 * - GET  /dsh-plugin-browser/list     local loader snapshot (versions, specs, phases)
 * - GET  /dsh-plugin-browser/catalog  awesome-dsh-plugin catalog merged with the
 *                                     profile's installed/loaded state (market view)
 * - POST /dsh-plugin-browser/refresh  invalidate the catalog cache and re-resolve
 *
 * Install / update / uninstall actions are intentionally NOT re-implemented here:
 * when dshmarket is installed, the client posts to its /dsh-market/* endpoints so
 * there is a single source of truth for pnpm runs and hot-mounting.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCatalog, invalidateCatalog } from './registry.js';

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function readJson(response, request, callback) {
  let body = '';
  request.on('data', (chunk) => { body += chunk; if (body.length > 1e6) request.destroy(); });
  request.on('end', () => {
    try { callback(JSON.parse(body.length === 0 ? '{}' : body)); }
    catch { sendJson(response, 400, { error: 'invalid json body' }); }
  });
  request.on('error', () => { sendJson(response, 400, { error: 'request error' }); });
}

/** Read a package manifest from <profile>/node_modules/<name>. */
function readPackage(profile, name) {
  if (name === null || name === undefined || name === '') return null;
  try {
    return JSON.parse(readFileSync(join(profile, 'node_modules', name, 'package.json'), 'utf8'));
  }
  catch {
    return null;
  }
}

function readManifest(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  }
  catch {
    return null;
  }
}

/** Normalize a repository URL to `https://github.com/owner/repo`. */
export function normalizeRepo(value) {
  if (typeof value !== 'string') return null;
  let url = value.trim().replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/$/, '');
  if (url.startsWith('git://')) url = 'https://' + url.slice('git://'.length);
  const match = /^https:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)$/i.exec(url);
  if (match === null) return null;
  return `https://github.com/${match[1]}/${match[2]}`.toLowerCase();
}

/**
 * Map of installed dependencies: name -> { spec, version, homepage, repo }.
 * Reads the profile manifest's dependency specs and the materialized
 * node_modules for versions and repository URLs (which let us match catalog
 * entries whose npm name differs from the repo name).
 */
export function installedMap(profile) {
  const manifest = readManifest(profile);
  const deps = manifest?.dependencies ?? {};
  const map = new Map();
  for (const name of Object.keys(deps)) {
    const pkg = readPackage(profile, name);
    map.set(name, {
      spec: deps[name] ?? null,
      version: pkg?.version ?? null,
      homepage: pkg?.homepage ?? null,
      repo: normalizeRepo(pkg?.repository?.url ?? pkg?.repository ?? null),
      name,
    });
  }
  return map;
}

/** Candidate dependency names for a catalog entry (npm name first, repo base last). */
function depCandidates(entry) {
  const names = [];
  if (typeof entry.npm === 'string' && entry.npm.length > 0) names.push(entry.npm);
  const repo = normalizeRepo(entry.url);
  if (repo !== null) {
    const base = repo.split('/').pop();
    if (base) names.push(base);
  }
  return names;
}

/** Merge a catalog entry with the profile's installed state. */
function mergeEntry(entry, installed) {
  const repo = normalizeRepo(entry.url);
  let found = null;
  for (const name of depCandidates(entry)) {
    if (installed.has(name)) { found = installed.get(name); break; }
  }
  if (found === null && repo !== null) {
    for (const item of installed.values()) {
      if (item.repo === repo) { found = item; break; }
    }
  }
  return {
    ...entry,
    repo,
    depName: found?.name ?? null,
    installed: found !== null,
    spec: found?.spec ?? null,
    version: found?.version ?? null,
    homepage: found?.homepage ?? null,
  };
}

/** Loader entries keyed by module name for phase/enabled lookups. */
function entryByName(entries) {
  const map = new Map();
  for (const entry of entries) {
    if (entry.moduleName !== null && entry.moduleName !== undefined) map.set(entry.moduleName, entry);
  }
  return map;
}

/**
 * Register the browser's HTTP routes.
 * @param host - Acquired webServer service.
 * @param profile - The profile directory this plugin lives under.
 * @param collect - Callback returning the current loader entries.
 * @returns Disposer removing the registered routes.
 */
export function mountBrowserRoutes(host, profile, collect) {
  const disposers = [
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-browser/list',
      handler: (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' });
          response.end();
          return;
        }
        try {
          const manifest = readManifest(profile);
          const installed = installedMap(profile);
          const entries = collect().map((entry) => {
            const pkg = readPackage(profile, entry.moduleName);
            const spec = entry.moduleName !== null ? (installed.get(entry.moduleName)?.spec ?? null) : null;
            return {
              ...entry,
              version: pkg?.version ?? null,
              homepage: pkg?.homepage ?? null,
              repo: normalizeRepo(pkg?.repository?.url ?? pkg?.repository ?? null),
              spec,
            };
          });
          sendJson(response, 200, {
            profile: manifest?.name ?? null,
            bundles: manifest?.dsh?.profile?.bundles ?? [],
            entries,
            count: entries.length,
          });
        }
        catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    }),
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-browser/catalog',
      handler: async (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET' });
          response.end();
          return;
        }
        try {
          const manifest = readManifest(profile);
          const deps = manifest?.dependencies ?? {};
          const { source, registry } = await loadCatalog(profile);
          const installed = installedMap(profile);
          const byName = entryByName(collect());
          const plugins = registry.plugins.map((entry) => {
            const merged = mergeEntry(entry, installed);
            const loaderEntry = merged.depName !== null ? byName.get(merged.depName) : null;
            return {
              ...merged,
              loaded: loaderEntry !== null && loaderEntry !== undefined,
              enabled: loaderEntry?.enabled ?? null,
              fiberPhase: loaderEntry?.fiberPhase ?? null,
            };
          });
          sendJson(response, 200, {
            profile: manifest?.name ?? null,
            bundles: manifest?.dsh?.profile?.bundles ?? [],
            categories: registry.categories ?? null,
            source,
            updated: registry.updated ?? null,
            marketInstalled: deps.dshmarket !== undefined || deps['dsh-market'] !== undefined,
            plugins,
            count: plugins.length,
          });
        }
        catch (error) {
          sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
        }
      },
    }),
    host.webServer.register({
      kind: 'exact',
      path: '/dsh-plugin-browser/refresh',
      handler: (request, response) => {
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' });
          response.end();
          return;
        }
        invalidateCatalog();
        sendJson(response, 200, { ok: true });
      },
    }),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}
