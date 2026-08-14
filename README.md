# dsh-plugin-browser

浏览当前 DSH profile 中**已加载的全部插件**：agent 工具 + Web 设置页。

- **Agent 工具 `list_plugins`**：在会话里直接问「当前装了什么插件 / 哪些插件挂了」，
  模型会返回完整清单：模块名、版本、启用状态、Cordis 加载阶段、entry id，以及 bundle 层栈。
- **GUI 页签「已装插件」**：位于 **设置 → 插件 → 已装插件**（与内置「插件列表」并排），
  搜索、按启用/停用/挂载失败过滤、一键刷新，卡片展示版本、来源（npm spec / git spec）、
  加载状态与 entry id。

## 安装

```bash
# 从本目录安装到目标 profile（例如 web）
dsh plugin --profile web add file:/绝对路径/dsh-plugin-browser
# 重启 dsh 生效后：
#   - 会话里问 agent：`列出当前加载的所有插件`
#   - 或到 设置 → 插件 → 已装插件 页签浏览
```

## 工作原理

- `lib/index.js`：注册 `list_plugins` 工具（读 Cordis loader 的实时条目 + profile
  manifest 的 bundle 层栈 + node_modules 里的已装版本），并挂载只读 HTTP 路由。
- `lib/routes.js`：`GET /dsh-plugin-browser/list` 返回 JSON 快照（只读，无写端点）。
- `client/client.js`：Web 设置页「已装插件」（`settings.section` 槽位），
  手写 CJS 零构建，仅依赖注入的 react 与 settings/locale 客户端包。

数据全部来自本机（loader 状态 + profile 目录），不访问网络。

## 卸载

```bash
dsh plugin --profile web remove dsh-plugin-browser
```
