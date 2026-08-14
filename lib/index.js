/**
 * dsh-plugin-browser — browse every plugin currently loaded in this DSH profile.
 *
 * Host side: registers the `list_plugins` agent tool (loader entries + bundle
 * layer stack + installed versions) and mounts the read-only HTTP routes the
 * Web settings page consumes.
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { mountBrowserRoutes } from './routes.js';

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

/** Best-effort installed version of a bundle package. */
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

export function apply(ctx) {
  const profile = profileDir();
  ctx.tools.register(defineTool({
    name: 'list_plugins',
    description: 'List every plugin currently loaded in this DSH profile: loader entries (module name, enabled/disabled, ' +
      'Cordis fiber phase, entry id) plus the profile bundle layer stack and installed versions. Use when the user asks ' +
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
