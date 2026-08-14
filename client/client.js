window.__ModuleLoader__.load({ id: "dsh-plugin-browser", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
'use strict'

/**
 * dsh-plugin-browser client — a market entry point + installed-plugin dashboard.
 *
 * Two tabs inside 设置 → 插件 → 插件浏览器:
 *   1. 市场 (Market): the awesome-dsh-plugin catalog merged with this profile's
 *      installed/loaded state; install / update / uninstall actions run through
 *      the dshmarket endpoints (/dsh-market/*) when dshmarket is installed.
 *   2. 已装插件 (Installed): the local loader snapshot (versions, specs, phases).
 *
 * Hand-authored CJS bundle (no build step); the only external is the loader
 * module table's `react`.
 */

const React = require('react')
const h = React.createElement
const { useState, useEffect, useMemo, useCallback } = React

const NS = 'dsh-plugin-browser'

const zh = {
  nav: '插件浏览器',
  subtitle: 'awesome 插件市场 + 当前 profile 的已装/加载状态',
  tabMarket: '市场',
  tabInstalled: '已装插件',
  marketOf: '插件市场',
  installedOf: '已装插件',
  searchPh: '搜索插件名 / 作者 / 仓库…',
  searchPhInstalled: '搜索插件名 / 版本 / entryId…',
  filterAll: '全部',
  filterEnabled: '已启用',
  filterDisabled: '已停用',
  filterFailed: '挂载失败',
  catAll: '全部分类',
  sortStars: '按星标',
  sortNew: '按新增',
  sortName: '按名称',
  loading: '正在读取…',
  error: '暂时无法读取。',
  retry: '重试',
  refresh: '刷新',
  empty: '没有匹配的插件。',
  emptyMarket: '目录为空或无法加载。',
  profile: 'Profile',
  bundles: 'bundle 层',
  entries: '条目',
  installed: '已安装',
  notInstalled: '未安装',
  loaded: '已加载',
  notLoaded: '未加载',
  install: '安装',
  update: '更新',
  uninstall: '卸载',
  homepage: '主页',
  viewRepo: '仓库',
  marketMissing: '未检测到 dshmarket：安装/更新/卸载按钮不可用。',
  marketMissingHint: '请先安装 dshmarket（dsh plugin --profile web add dshmarket）或使用 dsh CLI 管理插件。',
  actionRunning: '正在执行…',
  actionFailed: '操作失败：',
  phase: '加载状态',
  source: '来源',
  entryId: 'Entry ID',
  moduleName: '模块名',
  version: '版本',
  stars: '星标',
  category: '分类',
  unobserved: '未挂载',
  pending: '等待依赖',
  loadingPhase: '加载中',
  active: '已挂载',
  failed: '挂载失败',
  unloading: '卸载中',
  noMarketActions: '无市场',
}

const en = {
  nav: 'Plugin browser',
  subtitle: 'awesome plugin market + installed/loaded state of this profile',
  tabMarket: 'Market',
  tabInstalled: 'Installed',
  marketOf: 'Plugin market',
  installedOf: 'Installed plugins',
  searchPh: 'Search plugin / owner / repo…',
  searchPhInstalled: 'Search plugin / version / entryId…',
  filterAll: 'All',
  filterEnabled: 'Enabled',
  filterDisabled: 'Disabled',
  filterFailed: 'Failed',
  catAll: 'All categories',
  sortStars: 'By stars',
  sortNew: 'By added',
  sortName: 'By name',
  loading: 'Loading…',
  error: 'Temporarily unavailable.',
  retry: 'Retry',
  refresh: 'Refresh',
  empty: 'No matching plugins.',
  emptyMarket: 'Catalog is empty or unavailable.',
  profile: 'Profile',
  bundles: 'bundle layers',
  entries: 'entries',
  installed: 'Installed',
  notInstalled: 'Not installed',
  loaded: 'Loaded',
  notLoaded: 'Not loaded',
  install: 'Install',
  update: 'Update',
  uninstall: 'Uninstall',
  homepage: 'Homepage',
  viewRepo: 'Repo',
  marketMissing: 'dshmarket not detected: install/update/uninstall buttons are disabled.',
  marketMissingHint: 'Install dshmarket first (dsh plugin --profile web add dshmarket) or use the dsh CLI to manage plugins.',
  actionRunning: 'Working…',
  actionFailed: 'Action failed: ',
  phase: 'Load status',
  source: 'Source',
  entryId: 'Entry ID',
  moduleName: 'Module',
  version: 'Version',
  stars: 'Stars',
  category: 'Category',
  unobserved: 'Not mounted',
  pending: 'Waiting for dependencies',
  loadingPhase: 'Loading',
  active: 'Mounted',
  failed: 'Mount failed',
  unloading: 'Unloading',
  noMarketActions: 'No market',
}

const CSS = `
.dshpb-root{height:100%;display:flex;flex-direction:column;min-width:0;gap:12px;color:var(--dsw-alias-label-primary,#1f2328)}
.dshpb-head{padding:4px 4px 0}
.dshpb-title{font-size:16px;font-weight:700;margin:0}
.dshpb-sub{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);margin-top:2px}
.dshpb-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);margin-top:6px}
.dshpb-meta b{color:var(--dsw-alias-label-primary,#1f2328);font-variant-numeric:tabular-nums}
.dshpb-tabs{display:flex;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l2,#d0d7de);padding:0 4px}
.dshpb-tab{border:0;background:none;font:inherit;font-size:13px;padding:8px 12px;cursor:pointer;color:var(--dsw-alias-label-secondary,#6b7280);border-bottom:2px solid transparent;margin-bottom:-1px}
.dshpb-tab[data-on=true]{color:var(--dsw-alias-state-business-primary,#0969da);border-bottom-color:var(--dsw-alias-state-business-primary,#0969da);font-weight:600}
.dshpb-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dshpb-search{flex:1;min-width:220px;position:relative}
.dshpb-search input{box-sizing:border-box;width:100%;height:34px;border:1px solid var(--dsw-alias-border-l2,#d0d7de);border-radius:8px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:13px;padding:0 12px;outline:none}
.dshpb-search input:focus-visible{border-color:var(--dsw-alias-state-business-primary,#0969da);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-business-primary,#0969da) 18%,transparent)}
.dshpb-filters{display:flex;gap:6px;flex-wrap:wrap}
.dshpb-chip{border:1px solid var(--dsw-alias-border-l2,#d0d7de);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#6b7280);border-radius:999px;padding:4px 12px;font:inherit;font-size:12px;cursor:pointer}
.dshpb-chip[data-on=true]{border-color:var(--dsw-alias-state-business-primary,#0969da);color:var(--dsw-alias-state-business-primary,#0969da);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#0969da) 8%,transparent)}
.dshpb-status{font-size:12px;color:var(--dsw-alias-label-tertiary,#8c959f)}
.dshpb-banner{border:1px solid var(--dsw-alias-state-warning-border,#d4a72c);background:color-mix(in srgb,#d4a72c 8%,transparent);color:var(--dsw-alias-label-secondary,#6b7280);border-radius:8px;padding:8px 12px;font-size:12px}
.dshpb-banner b{color:var(--dsw-alias-label-primary,#1f2328)}
.dshpb-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none}
.dshpb-card{border:1px solid var(--dsw-alias-border-l2,#d0d7de);background:var(--dsw-alias-bg-layer-3,#fff);border-radius:10px;min-width:0;overflow:hidden;display:flex;flex-direction:column}
.dshpb-cardHead{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;padding:10px 12px;cursor:pointer;text-align:left;font:inherit}
.dshpb-cardTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary,#1f2328);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
.dshpb-desc{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);padding:0 12px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.dshpb-actions{display:flex;gap:6px;padding:10px 12px;flex-wrap:wrap;margin-top:auto}
.dshpb-btn{border:1px solid var(--dsw-alias-border-l2,#d0d7de);background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#1f2328);font:inherit;font-size:12px;cursor:pointer;border-radius:6px;padding:4px 10px}
.dshpb-btn[data-primary=true]{background:var(--dsw-alias-state-business-primary,#0969da);border-color:var(--dsw-alias-state-business-primary,#0969da);color:#fff}
.dshpb-btn[data-danger=true]{color:var(--dsw-alias-state-error-primary,#cf222e);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary,#cf222e) 40%,transparent)}
.dshpb-btn:disabled{opacity:.5;cursor:not-allowed}
.dshpb-progress{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);padding:0 12px 10px;word-break:break-all}
.dshpb-fail{color:var(--dsw-alias-state-error-primary,#cf222e);align-items:center;gap:10px;display:flex;font-size:13px}
.dshpb-fail button{border:1px solid var(--dsw-alias-border-l2,#d0d7de);color:var(--dsw-alias-label-primary,#1f2328);font:inherit;cursor:pointer;background:0 0;border-radius:6px;padding:4px 10px}
.dshpb-details{padding:0 12px 12px;display:flex;flex-direction:column;gap:6px}
.dshpb-row{font-size:12px;color:var(--dsw-alias-label-secondary,#6b7280);word-break:break-all}
.dshpb-row b{color:var(--dsw-alias-label-primary,#1f2328);font-weight:600;margin-right:6px}
.dshpb-row a{color:var(--dsw-alias-state-business-primary,#0969da);text-decoration:none}
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

function isZh() {
  return typeof document !== 'undefined' && /^zh/i.test(document.documentElement.lang || '')
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

/** Shared tiny fetch helper returning the parsed JSON (throws on !ok). */
async function api(path, options) {
  const res = await fetch(path, { cache: 'no-store', ...options })
  if (!res.ok) {
    let message = 'HTTP ' + res.status
    try {
      const body = await res.json()
      if (body && body.error) message = body.error
    } catch (e) { /* keep http status */ }
    throw new Error(message)
  }
  return res.json()
}

/** Poll dshmarket status until idle (or timeout), then resolve. */
async function waitMarketIdle(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const status = await api('/dsh-market/status')
      if (!status.active) return status
    } catch (e) { /* market may be mid-restart; keep polling */ }
    await new Promise((resolve) => setTimeout(resolve, 800))
  }
  throw new Error('timeout waiting for market')
}

function MarketSection({ t }) {
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('stars')
  const [state, setState] = useState({ status: 'loading' })
  const [busy, setBusy] = useState(null) // plugin name or url currently acting
  const [progress, setProgress] = useState(null)
  const [actionError, setActionError] = useState(null)

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setActionError(null)
    setRequest((v) => v + 1)
  }, [])

  useEffect(() => {
    let current = true
    api('/dsh-plugin-browser/catalog')
      .then((data) => { if (current) setState({ status: 'ready', data }) })
      .catch(() => { if (current) setState({ status: 'error' }) })
    return () => { current = false }
  }, [request])

  const zhLang = isZh()
  const categories = state.status === 'ready' && state.data.categories ? state.data.categories : null
  const plugins = state.status === 'ready' ? (state.data.plugins || []) : []
  const marketInstalled = state.status === 'ready' ? state.data.marketInstalled === true : false

  const q = query.trim().toLocaleLowerCase()
  const filtered = useMemo(() => {
    let list = plugins.filter((p) => {
      if (category !== 'all' && (p.category || '') !== category) return false
      if (q.length === 0) return true
      return [p.name, p.owner, p.url, p.depName].some((v) => v && String(v).toLocaleLowerCase().includes(q))
    })
    if (sort === 'stars') list = [...list].sort((a, b) => (b.stars || 0) - (a.stars || 0))
    else if (sort === 'new') list = [...list].sort((a, b) => String(b.added || '').localeCompare(String(a.added || '')))
    else list = [...list].sort((a, b) => String(a.name).localeCompare(String(b.name)))
    return list
  }, [plugins, category, sort, q])

  const categoryLabel = (key) => {
    if (!categories || !categories[key]) return key
    const c = categories[key]
    return zhLang ? (c.zh || c.en || key) : (c.en || c.zh || key)
  }

  const runAction = async (label, fn) => {
    setBusy(label)
    setActionError(null)
    setProgress(null)
    try {
      setProgress({ line: '…' })
      const result = await fn()
      setProgress({ line: result.stderr && !result.ok ? result.stderr.slice(-600) : null })
      if (result.ok !== true && result.error) throw new Error(result.error)
      if (result.ok === false) throw new Error((result.stderr || '').slice(-400) || 'pnpm failed')
      await waitMarketIdle(30000)
      reload()
    } catch (e) {
      setActionError(e.message || String(e))
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const installPlugin = (plugin) => runAction('install:' + plugin.name, () =>
    api('/dsh-market/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: plugin.url }) }))
  const uninstallPlugin = (plugin) => runAction('uninstall:' + plugin.name, () =>
    api('/dsh-market/uninstall', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: plugin.depName }) }))
  const updatePlugin = (plugin) => runAction('update:' + plugin.name, () =>
    api('/dsh-market/update', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: plugin.depName }) }))

  return h('div', { className: 'dshpb-root', 'aria-busy': state.status === 'loading' },
    h('div', { className: 'dshpb-head' },
      h('h3', { className: 'dshpb-title' }, t('marketOf')),
      h('div', { className: 'dshpb-sub' }, t('subtitle')),
      state.status === 'ready' ? h('div', { className: 'dshpb-meta' },
        h('span', null, t('profile') + ': ', h('b', null, state.data.profile || '?')),
        h('span', null, t('entries') + ': ', h('b', null, String(plugins.length))),
        h('span', null, t('installed') + ': ', h('b', null, String(plugins.filter((p) => p.installed).length))),
        h('span', null, t('source') + ': ', h('b', null, state.data.source || '?'))
      ) : null
    ),
    state.status === 'loading' ? h('p', { className: 'dshpb-status' }, t('loading')) : null,
    state.status === 'error' ? h('div', { className: 'dshpb-fail' },
      h('p', { role: 'alert' }, t('error')),
      h('button', { type: 'button', onClick: reload }, t('retry'))
    ) : null,
    state.status === 'ready' ? h('div', null,
      !marketInstalled ? h('div', { className: 'dshpb-banner' },
        h('b', null, t('marketMissing') + ' '),
        t('marketMissingHint')
      ) : null,
      actionError ? h('div', { className: 'dshpb-fail' }, h('p', { role: 'alert' }, t('actionFailed') + actionError)) : null,
      h('div', { className: 'dshpb-bar' },
        h('div', { className: 'dshpb-search' },
          h('input', { type: 'search', value: query, placeholder: t('searchPh'), 'aria-label': t('searchPh'), onChange: (e) => setQuery(e.currentTarget.value) })
        ),
        h('button', { type: 'button', className: 'dshpb-chip', onClick: reload, disabled: busy !== null }, t('refresh')),
        h('div', { className: 'dshpb-filters' },
          h('button', { key: 'all', type: 'button', className: 'dshpb-chip', 'data-on': sort === 'stars', onClick: () => setSort('stars') }, t('sortStars')),
          h('button', { key: 'new', type: 'button', className: 'dshpb-chip', 'data-on': sort === 'new', onClick: () => setSort('new') }, t('sortNew')),
          h('button', { key: 'name', type: 'button', className: 'dshpb-chip', 'data-on': sort === 'name', onClick: () => setSort('name') }, t('sortName'))
        )
      ),
      categories ? h('div', { className: 'dshpb-bar', style: { marginTop: 6 } },
        h('div', { className: 'dshpb-filters' },
          [['all', t('catAll')]].concat(Object.keys(categories).map((key) => [key, categoryLabel(key)])).map(([key, label]) =>
            h('button', { key, type: 'button', className: 'dshpb-chip', 'data-on': category === key, onClick: () => setCategory(key) }, label)
          )
        )
      ) : null,
      progress && progress.line ? h('p', { className: 'dshpb-progress' }, t('actionRunning') + ' ' + progress.line) : null,
      plugins.length === 0 ? h('p', { className: 'dshpb-status' }, t('emptyMarket')) : null,
      plugins.length > 0 && filtered.length === 0 ? h('p', { className: 'dshpb-status' }, t('empty')) : null,
      filtered.length > 0 ? h('ul', { className: 'dshpb-cards' }, filtered.map((plugin) => {
        const status = plugin.fiberPhase === null || plugin.fiberPhase === undefined ? null : (PHASE_KEY[plugin.fiberPhase] || 'unobserved')
        const phaseLabel = status === null ? t('unobserved') : t(status)
        const desc = zhLang ? (plugin.description && plugin.description.zh) : (plugin.description && plugin.description.en)
        const isBusy = busy === 'install:' + plugin.name || busy === 'uninstall:' + plugin.name || busy === 'update:' + plugin.name
        return h('li', { key: plugin.url, className: 'dshpb-card' },
          h('div', { className: 'dshpb-cardHead', style: { cursor: 'default' } },
            plugin.installed ? h('span', { className: 'dshpb-dot', 'data-phase': plugin.fiberPhase ?? 'null', role: 'img', 'aria-label': phaseLabel, title: phaseLabel }) : null,
            h('span', { className: 'dshpb-cardTitle', title: plugin.name }, plugin.name),
            h('span', { className: 'dshpb-tag', 'data-enabled': plugin.installed ? 'true' : 'false' },
              plugin.installed ? t('installed') + (plugin.version ? ' v' + plugin.version : '') : t('notInstalled'))
          ),
          desc ? h('div', { className: 'dshpb-desc' }, desc) : null,
          h('div', { className: 'dshpb-row', style: { padding: '4px 12px 0' } },
            h('span', null, t('category') + ': ' + categoryLabel(plugin.category) + ' · ' + t('stars') + ': ' + (plugin.stars ?? '—'))
          ),
          plugin.installed ? h('div', { className: 'dshpb-row', style: { padding: '2px 12px 0' } },
            h('span', null, t('source') + ': ', h('code', null, plugin.spec || plugin.depName || plugin.name)),
            h('span', null, ' · '), plugin.loaded ? t('loaded') : t('notLoaded'), plugin.fiberPhase ? ' · ' + phaseLabel : null
          ) : null,
          h('div', { className: 'dshpb-actions' },
            !plugin.installed ? h('button', { type: 'button', className: 'dshpb-btn', 'data-primary': 'true', disabled: !marketInstalled || busy !== null, onClick: () => installPlugin(plugin) },
              isBusy ? t('actionRunning') : t('install')) : null,
            plugin.installed ? h('button', { type: 'button', className: 'dshpb-btn', disabled: !marketInstalled || busy !== null || (plugin.spec || '').startsWith('file:') || (plugin.spec || '').startsWith('link:'), title: (plugin.spec || '').startsWith('file:') || (plugin.spec || '').startsWith('link:') ? 'file:/link: 安装从本地更新' : undefined, onClick: () => updatePlugin(plugin) },
              isBusy ? t('actionRunning') : t('update')) : null,
            plugin.installed ? h('button', { type: 'button', className: 'dshpb-btn', 'data-danger': 'true', disabled: !marketInstalled || busy !== null || plugin.depName === null, onClick: () => uninstallPlugin(plugin) },
              isBusy ? t('actionRunning') : t('uninstall')) : null,
            h('a', { className: 'dshpb-btn', href: plugin.url, target: '_blank', rel: 'noreferrer' }, t('viewRepo'))
          )
        )
      })) : null
    ) : null
  )
}

function InstalledSection({ t }) {
  const [request, setRequest] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let current = true
    api('/dsh-plugin-browser/list')
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
      h('h3', { className: 'dshpb-title' }, t('installedOf')),
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
          h('input', { type: 'search', value: query, placeholder: t('searchPhInstalled'), 'aria-label': t('searchPhInstalled'), onChange: (e) => setQuery(e.currentTarget.value) })
        ),
        h('button', { type: 'button', className: 'dshpb-chip', onClick: retry }, t('refresh')),
        h('div', { className: 'dshpb-filters' },
          [['all', t('filterAll')], ['enabled', t('filterEnabled')], ['disabled', t('filterDisabled')], ['failed', t('filterFailed')]].map(([key, label]) =>
            h('button', { key, type: 'button', className: 'dshpb-chip', 'data-on': filter === key, onClick: () => setFilter(key) }, label)
          )
        )
      ),
      entries.length === 0 ? h('p', { className: 'dshpb-status' }, t('empty')) : null,
      entries.length > 0 && filtered.length === 0 ? h('p', { className: 'dshpb-status' }, t('empty')) : null,
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
            entry.homepage ? h('div', { className: 'dshpb-row' }, h('b', null, t('homepage') + ':'), h('a', { href: entry.homepage, target: '_blank', rel: 'noreferrer' }, entry.homepage)) : null,
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
  }, () => {
    const [tab, setTab] = React.useState('market')
    return h('div', { className: 'dshpb-root' },
      h('div', { className: 'dshpb-tabs' },
        h('button', { type: 'button', className: 'dshpb-tab', 'data-on': tab === 'market', onClick: () => setTab('market') }, t('tabMarket')),
        h('button', { type: 'button', className: 'dshpb-tab', 'data-on': tab === 'installed', onClick: () => setTab('installed') }, t('tabInstalled'))
      ),
      tab === 'market' ? h(MarketSection, { t }) : h(InstalledSection, { t })
    )
  }))
}

return module.exports; } });
