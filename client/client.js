window.__ModuleLoader__.load({ id: "dsh-plugin-browser", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
'use strict'

/**
 * dsh-plugin-browser client: registers a "已装插件" settings section that
 * browses every plugin currently loaded in this DSH profile. Hand-authored
 * CJS bundle (no build step); the only external is the loader module table's
 * `react`.
 */

const React = require('react')
const h = React.createElement
const { useState, useEffect, useMemo, useCallback } = React

const NS = 'dsh-plugin-browser'

const zh = {
  nav: '已装插件',
  subtitle: '当前 DSH profile 中已加载的全部插件：版本、来源与加载状态',
  profile: 'Profile',
  bundles: 'bundle 层',
  entries: '加载条目',
  searchPh: '搜索插件名 / 版本 / entryId…',
  filterAll: '全部',
  filterEnabled: '已启用',
  filterDisabled: '已停用',
  filterFailed: '挂载失败',
  enabledTag: '已启用',
  disabledTag: '已停用',
  loading: '正在读取插件…',
  error: '暂时无法读取插件。',
  retry: '重试',
  refresh: '刷新',
  empty: '当前 profile 没有加载任何插件条目。',
  emptySearch: '没有匹配的插件。',
  phase: '加载状态',
  config: '配置状态',
  source: '来源',
  entryId: 'Entry ID',
  moduleName: '模块名',
  version: '版本',
  unobserved: '未挂载',
  pending: '等待依赖',
  loadingPhase: '加载中',
  active: '已挂载',
  failed: '挂载失败',
  unloading: '卸载中',
}

const en = {
  nav: 'Installed plugins',
  subtitle: 'Every plugin currently loaded in this DSH profile: versions, sources and load status',
  profile: 'Profile',
  bundles: 'bundle layers',
  entries: 'entries',
  searchPh: 'Search plugin / version / entryId…',
  filterAll: 'All',
  filterEnabled: 'Enabled',
  filterDisabled: 'Disabled',
  filterFailed: 'Failed',
  enabledTag: 'Enabled',
  disabledTag: 'Disabled',
  loading: 'Reading plugins…',
  error: 'Plugins are temporarily unavailable.',
  retry: 'Retry',
  refresh: 'Refresh',
  empty: 'No plugin entries are loaded in this profile.',
  emptySearch: 'No matching plugins.',
  phase: 'Load status',
  config: 'Configuration',
  source: 'Source',
  entryId: 'Entry ID',
  moduleName: 'Module',
  version: 'Version',
  unobserved: 'Not mounted',
  pending: 'Waiting for dependencies',
  loadingPhase: 'Loading',
  active: 'Mounted',
  failed: 'Mount failed',
  unloading: 'Unloading',
}

const CSS = `
.dshpb-root{height:100%;display:flex;flex-direction:column;min-width:0;gap:12px;color:var(--dsw-alias-label-primary,#1f2328)}
.dshpb-head{padding:4px 4px 0}
.dshpb-title{font-size:16px;font-weight:700;margin:0}
.dshpb-sub{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);margin-top:2px}
.dshpb-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);margin-top:6px}
.dshpb-meta b{color:var(--dsw-alias-label-primary,#1f2328);font-variant-numeric:tabular-nums}
.dshpb-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dshpb-search{flex:1;min-width:220px;position:relative}
.dshpb-search input{box-sizing:border-box;width:100%;height:34px;border:1px solid var(--dsw-alias-border-l2,#d0d7de);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:13px;padding:0 12px;outline:none}
.dshpb-search input:focus-visible{border-color:var(--dsw-alias-state-business-primary,#0969da);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary,#0969da) 18%,transparent)}
.dshpb-filters{display:flex;gap:6px}
.dshpb-chip{border:1px solid var(--dsw-alias-border-l2,#d0d7de);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#6b7280);border-radius:999px;padding:4px 12px;font:inherit;font-size:12px;cursor:pointer}
.dshpb-chip[data-on=true]{border-color:var(--dsw-alias-state-business-primary,#0969da);color:var(--dsw-alias-state-business-primary,#0969da);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#0969da) 8%,transparent)}
.dshpb-status{font-size:12px;color:var(--dsw-alias-label-tertiary,#8c959f)}
.dshpb-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none}
.dshpb-card{border:1px solid var(--dsw-alias-border-l2,#d0d7de);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:10px;min-width:0;overflow:hidden}
.dshpb-card[data-open=true]{border-color:var(--dsw-alias-border-l1,#eaeef2)}
.dshpb-cardHead{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;padding:10px 12px;cursor:pointer;text-align:left;font:inherit}
.dshpb-cardTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dshpb-cardTitle code{font-size:12px;font-weight:400}
.dshpb-dot{width:8px;height:8px;border-radius:50%;flex:none}
.dshpb-dot[data-phase=active]{background:#1f883d}
.dshpb-dot[data-phase=loading]{background:#9a6700}
.dshpb-dot[data-phase=pending]{background:#bf8700}
.dshpb-dot[data-phase=failed]{background:#cf222e}
.dshpb-dot[data-phase=unloading],.dshpb-dot[data-phase=null],.dshpb-dot[data-unobserved=true]{background:#8c959f}
.dshpb-tag{border-radius:6px;padding:1px 8px;font-size:11px;flex:none}
.dshpb-tag[data-enabled=true]{background:color-mix(in srgb,#1f883d 12%,transparent);color:#1a7f37}
.dshpb-tag[data-enabled=false]{background:color-mix(in srgb,#8c959f 14%,transparent);color:#59636e}
.dshpb-chev{margin-left:auto;color:var(--dsw-alias-label-tertiary,#8c959f);font-size:12px}
.dshpb-details{padding:0 12px 12px;display:flex;flex-direction:column;gap:6px}
.dshpb-row{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);word-break:break-all}
.dshpb-row b{color:var(--dsw-alias-label-primary,#1f2328);font-weight:600;margin-right:6px}
.dshpb-fail{color:var(--dsw-alias-state-error-primary,#cf222e);align-items:center;gap:10px;display:flex;font-size:13px}
.dshpb-fail button{border:1px solid var(--dsw-alias-border-l2,#d0d7de);color:var(--dsw-alias-label-primary,#1f2328);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}
`

function injectCss() {
  const tagId = NS + '/browser.css'
  if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = NS
    tag.dataset.pluginCss = tagId
    tag.textContent = CSS
    document.head.appendChild(tag)
  }
}

function shortName(moduleName) {
  return (moduleName || '')
    .replace(/^cordis:/, '')
    .replace(/^cordis-plugin-/, '')
    .replace(/^@deepseek-ai\//, '')
}

const PHASE_KEY = {
  pending: 'pending',
  loading: 'loadingPhase',
  active: 'active',
  failed: 'failed',
  unloading: 'unloading',
}

function BrowserSection({ t }) {
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let current = true
    fetch('/dsh-plugin-browser/list', { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      })
      .then((data) => { if (current) setState({ status: 'ready', data }) })
      .catch(() => { if (current) setState({ status: 'error' }) })
    return () => { current = false }
  }, [request])

  const retry = useCallback(() => { setState({ status: 'loading' }); setRequest((v) => v + 1) }, [])

  const q = query.trim().toLocaleLowerCase()
  const entries = state.status === 'ready' ? (state.data.entries || []) : []
  const filtered = useMemo(() => entries.filter((e) => {
    if (filter === 'enabled' && !e.enabled) return false
    if (filter === 'disabled' && e.enabled) return false
    if (filter === 'failed' && !(e.enabled && e.fiberPhase === 'failed')) return false
    if (q.length === 0) return true
    return [e.moduleName, e.entryId, e.version, e.spec].some((v) => v && String(v).toLocaleLowerCase().includes(q))
  }), [entries, filter, q])

  useEffect(() => {
    if (expanded !== null && !filtered.some((e) => e.entryId === expanded)) setExpanded(null)
  }, [expanded, filtered])

  const phaseLabel = (phase) => (phase === null || phase === undefined) ? t('unobserved') : t(PHASE_KEY[phase] || 'unobserved')

  return h('div', { className: 'dshpb-root', 'aria-busy': state.status === 'loading' },
    h('div', { className: 'dshpb-head' },
      h('h3', { className: 'dshpb-title' }, t('nav')),
      h('div', { className: 'dshpb-sub' }, t('subtitle')),
      state.status === 'ready' ? h('div', { className: 'dshpb-meta' },
        h('span', null, t('profile') + ': ', h('b', null, state.data.profile || '?')),
        h('span', null, t('bundles') + ': ', h('b', null, String((state.data.bundles || []).length))),
        h('span', null, t('entries') + ': ', h('b', null, String(entries.length)))
      ) : null
    ),
    state.status === 'loading' ? h('p', { className: 'dshpb-status' }, t('loading')) : null,
    state.status === 'error' ? h('div', { className: 'dshpb-fail' },
      h('p', { role: 'alert' }, t('error')),
      h('button', { type: 'button', onClick: retry }, t('retry'))
    ) : null,
    state.status === 'ready' ? h('div', null,
      h('div', { className: 'dshpb-bar' },
        h('div', { className: 'dshpb-search' },
          h('input', { type: 'search', value: query, placeholder: t('searchPh'), 'aria-label': t('searchPh'), onChange: (e) => setQuery(e.currentTarget.value) })
        ),
        h('button', { type: 'button', className: 'dshpb-chip', onClick: retry }, t('refresh')),
        h('div', { className: 'dshpb-filters' },
          [['all', t('filterAll')], ['enabled', t('filterEnabled')], ['disabled', t('filterDisabled')], ['failed', t('filterFailed')]].map(([key, label]) =>
            h('button', { key, type: 'button', className: 'dshpb-chip', 'data-on': filter === key, onClick: () => setFilter(key) }, label)
          )
        )
      ),
      entries.length === 0 ? h('p', { className: 'dshpb-status' }, t('empty')) : null,
      entries.length > 0 && filtered.length === 0 ? h('p', { className: 'dshpb-status' }, t('emptySearch')) : null,
      filtered.length > 0 ? h('ul', { className: 'dshpb-cards' }, filtered.map((entry) => {
        const open = expanded === entry.entryId
        const title = shortName(entry.moduleName)
        const status = phaseLabel(entry.fiberPhase)
        return h('li', { key: entry.entryId, className: 'dshpb-card', 'data-open': open ? 'true' : undefined },
          h('button', { type: 'button', className: 'dshpb-cardHead', 'aria-expanded': open, onClick: () => setExpanded(open ? null : entry.entryId) },
            entry.enabled ? h('span', { className: 'dshpb-dot', 'data-phase': entry.fiberPhase ?? 'null', role: 'img', 'aria-label': status, title: status }) : null,
            h('span', { className: 'dshpb-cardTitle', title: entry.moduleName }, title),
            h('span', { className: 'dshpb-tag', 'data-enabled': entry.enabled ? 'true' : 'false' }, entry.enabled ? t('enabledTag') : t('disabledTag')),
            h('span', { className: 'dshpb-chev' }, open ? '▾' : '▸')
          ),
          open ? h('div', { className: 'dshpb-details' },
            entry.version ? h('div', { className: 'dshpb-row' }, h('b', null, t('version') + ':'), entry.version) : null,
            h('div', { className: 'dshpb-row' }, h('b', null, t('phase') + ':'), status),
            entry.spec ? h('div', { className: 'dshpb-row' }, h('b', null, t('source') + ':'), entry.spec) : null,
            h('div', { className: 'dshpb-row' }, h('b', null, t('moduleName') + ':'), entry.moduleName),
            h('div', { className: 'dshpb-row' }, h('b', null, t('entryId') + ':'), h('code', null, entry.entryId))
          ) : null
        )
      })) : null
    ) : null
  )
}

exports.name = NS
exports.inject = ['slots', 'locale']
exports.apply = function apply(ctx) {
  injectCss()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-browser: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'browser',
    order: 20,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({ t }),
  }, () => h(BrowserSection, { t })))
}

return module.exports; } });
