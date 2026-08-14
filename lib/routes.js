/**
 * Read-only HTTP routes for the plugin browser Web page.
 *
 * The list route is a pure GET snapshot of the loader state plus the profile
 * manifest (bundle layer stack, dependency specs) — no write endpoints, so
 * there is no same-origin gate beyond what the host webServer already applies.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
}

function readVersion(profile, name) {
  if (name === null || name === undefined) return null;
  try {
    const pkg = JSON.parse(readFileSync(join(profile, 'node_modules', name, 'package.json'), 'utf8'));
    return pkg.version ?? null;
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

/**
 * Register the browser's HTTP routes.
 * @param host - Acquired webServer service.
 * @param profile - The profile directory this plugin lives under.
 * @param collect - Callback returning the current loader entries.
 * @returns Disposer removing the registered route.
 */
export function mountBrowserRoutes(host, profile, collect) {
  return host.webServer.register({
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
        const dependencies = manifest?.dependencies ?? {};
        const entries = collect().map((entry) => ({
          ...entry,
          version: readVersion(profile, entry.moduleName),
          spec: entry.moduleName !== null ? (dependencies[entry.moduleName] ?? null) : null,
        }));
        sendJson(response, 200, {
          profile: manifest?.name ?? null,
          bundles: manifest?.dsh?.profile?.bundles ?? [],
          dependencies,
          entries,
          count: entries.length,
        });
      }
      catch (error) {
        sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
      }
    },
  });
}
