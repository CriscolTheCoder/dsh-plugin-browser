/**
 * dsh-plugin-browser — market entry point + plugin dashboard for a DSH profile.
 *
 * Host side:
 *   - `list_plugins`        agent tool: loader entries + bundle layer stack
 *   - `browse_plugin_market` agent tool: search the awesome-dsh-plugin catalog
 *     merged with this profile's installed/loaded state
 *   - HTTP routes: /dsh-plugin-browser/list, /catalog, /refresh
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { mountBrowserRoutes, installedMap, normalizeRepo } from './routes.js';
import { loadCatalog } from './registry.js';

export const name = 'dsh-plugin-browser';
export const inject = ['tools', 'loader'];

/**
 * The profile directory this plugin lives under:
 * <profile>/node_modules/dsh-plugin-browser/lib  ->  up 3 = <profile>
 */
export function profileDir() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

/** Cordis Fiber state -> phase label (mirrors dsh-host-plugin-inventory). */
const PHASE = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: null,
  5: 'unloading',
};

/** Read-only projection of the current Loader entries (group rows skipped). */
export function collectEntries(loader) {
  const entries = [];
  for (const entry of loader.entries()) {
    if (entry.options?.group) continue;
    entries.push({
      entryId: entry.id,
      moduleName: entry.options?.name ?? null,
      enabled: !entry.disabled,
      fiberPhase: entry.fiber === undefined ? null : (PHASE[entry.fiber.state] ?? null),
    });
  }
  return entries;
}

function renderText(value) {
  if (value.count === 0) {
    return `当前 profile「${value.profile ?? '?'}」没有已加载的插件条目。`;
  }
  const lines = [
    `当前 DSH profile: ${value.profile ?? '?'}（${value.bundles.length} 个 bundle 层 · ${value.count} 个加载条目）`,
    '',
  ];
  for (const entry of value.entries) {
    const status = entry.enabled ? (entry.fiberPhase ?? 'unknown') : 'disabled';
    const version = entry.version === null ? '' : ` v${entry.version}`;
    lines.push(`- ${entry.moduleName}${version}  [${status}]  ${entry.entryId}`);
  }
  if (value.bundles.length > 0) {
    lines.push('', 'bundle 层栈: ' + value.bundles.join(' > '));
  }
  return lines.join('\n');
}

function renderMarket(value) {
  const lines = [
    `awesome-dsh-plugin 目录（${value.source}，${value.count} 条 · 已装 ${value.plugins.filter((p) => p.installed).length}）`,
    '',
  ];
  for (const plugin of value.plugins) {
    const state = plugin.installed
      ? `已装${plugin.version ? ` v${plugin.version}` : ''}${plugin.loaded ? ' · 已加载' : ' · 未加载'}`
      : '未安装';
    const desc = plugin.description?.zh ?? plugin.description?.en ?? '';
    lines.push(`- ${plugin.name}（${plugin.category}，${plugin.stars ?? '?'}★）[${state}] ${desc}`);
    lines.push(`    ${plugin.install}`);
  }
  return lines.join('\n');
}

function apply(ctx) {
  const profile = profileDir();

  ctx.tools.register(defineTool({
    name: 'list_plugins',
    description: 'List every plugin currently loaded in this DSH profile: loader entries (module name, enabled/disabled, ' +
      'Cordis fiber phase, entry id, installed version, homepage) plus the profile bundle layer stack. Use when the user asks ' +
      'what plugins are installed, loaded, enabled or disabled.',
    parameters: {
      detail: {
        type: 'boolean',
        description: 'Include installed versions per entry (default true)',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderText(value) }],
    },
    execute: async (args) => {
      const manifest = readProfileManifest(profile);
      const includeVersion = args.detail !== false;
      const entries = collectEntries(ctx.loader).map((entry) => ({
        ...entry,
        version: includeVersion ? readVersion(profile, entry.moduleName) : null,
      }));
      return {
        profile: manifest?.name ?? null,
        bundles: manifest?.dsh?.profile?.bundles ?? [],
        entries,
        count: entries.length,
      };
    },
    timeoutMs: 5000,
  }));

  ctx.tools.register(defineTool({
    name: 'browse_plugin_market',
    description: 'Search the awesome-dsh-plugin catalog (the same list behind dshmarket / the Plugin Market page) and report ' +
      'which entries are already installed or loaded in this profile. Filters: query (name/repo substring), category ' +
      '(ui|theme|session|memory|tools|skill|workflow|notify|model|dev|fun), installed (true/false). Use when the user asks ' +
      'to find, install, or compare community plugins.',
    parameters: {
      query: { type: 'string', description: 'Substring to match against plugin name, owner or repo url (default: all)' },
      category: { type: 'string', description: 'Category filter (default: all)' },
      installed: { type: 'boolean', description: 'Only entries installed in this profile when true' },
      limit: { type: 'number', description: 'Max entries to return (default 25)' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderMarket(value) }],
    },
    execute: async (args) => {
      const manifest = readProfileManifest(profile);
      const { source, registry } = await loadCatalog(profile);
      const installed = installedMap(profile);
      const byName = new Map(collectEntries(ctx.loader).map((e) => [e.moduleName, e]));
      const q = (args.query ?? '').toString().trim().toLowerCase();
      const category = (args.category ?? '').toString().trim().toLowerCase();
      const installedOnly = args.installed === true;
      const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 200);
      const plugins = [];
      for (const entry of registry.plugins) {
        const repo = normalizeRepo(entry.url);
        let found = null;
        const candidates = [];
        if (typeof entry.npm === 'string' && entry.npm) candidates.push(entry.npm);
        if (repo !== null) candidates.push(repo.split('/').pop());
        for (const candidate of candidates) {
          if (installed.has(candidate)) { found = installed.get(candidate); break; }
        }
        if (found === null && repo !== null) {
          for (const item of installed.values()) {
            if (item.repo === repo) { found = item; break; }
          }
        }
        if (category && (entry.category ?? '').toLowerCase() !== category) continue;
        if (q.length > 0 && ![entry.name, entry.owner, entry.url].some((v) => v && v.toLowerCase().includes(q))) continue;
        if (installedOnly && found === null) continue;
        const loaderEntry = found !== null ? byName.get(found.name) : null;
        plugins.push({
          name: entry.name,
          owner: entry.owner,
          url: entry.url,
          category: entry.category,
          description: entry.description?.zh ?? entry.description?.en ?? null,
          stars: entry.stars ?? null,
          npm: entry.npm ?? null,
          install: entry.install ?? null,
          installed: found !== null,
          spec: found?.spec ?? null,
          version: found?.version ?? null,
          loaded: loaderEntry !== null && loaderEntry !== undefined,
          fiberPhase: loaderEntry?.fiberPhase ?? null,
        });
        if (plugins.length >= limit) break;
      }
      return {
        profile: manifest?.name ?? null,
        bundles: manifest?.dsh?.profile?.bundles ?? [],
        source,
        plugins,
        count: plugins.length,
      };
    },
    timeoutMs: 10000,
  }));

  ctx.inject(['webServer'], (host) => {
    host.effect(() => mountBrowserRoutes(host, profile, () => collectEntries(ctx.loader)), 'dsh-plugin-browser: http routes');
  });
}

function readProfileManifest(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  }
  catch {
    return null;
  }
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

export { apply };
