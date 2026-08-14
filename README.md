# dsh-plugin-browser

DSH 插件**市场入口 + 运维面板**：浏览 awesome-dsh-plugin 目录（252+ 插件），
直接看到每个插件在本 profile 的**已装 / 加载状态**，并经由 dshmarket 一键
**安装 / 更新 / 卸载**。同时提供 `list_plugins` 与 `browse_plugin_market` 两个
agent 工具。

- **Agent 工具 `list_plugins`**：问「当前装了什么插件 / 哪些挂了」，返回完整清单：
  模块名、版本、启用状态、Cordis 加载阶段、entry id、bundle 层栈。
- **Agent 工具 `browse_plugin_market`**：问「帮我找 xx 插件」，返回 awesome 目录
  匹配项 + 各自在本 profile 的已装/加载状态与安装命令。
- **GUI 页签「插件浏览器」**：位于 **设置 → 插件 → 插件浏览器**，内含两个页签：
  - **市场**：awesome 目录卡片（分类过滤 / 搜索 / 星标排序），每张卡片标注
    已装版本与加载状态，操作按钮：安装 / 更新 / 卸载 / 打开仓库。动作通过
    dshmarket 的 `/dsh-market/*` 端点执行（未装 dshmarket 时按钮禁用并提示）。
  - **已装插件**：当前 profile 的 loader 快照（版本 / 来源 / 加载状态 / 主页）。

## 安装

```bash
# 从 GitHub 安装到目标 profile（例如 web）
dsh plugin --profile web add github:CriscolTheCoder/dsh-plugin-browser
# 本地开发也可以用 file: 指向源码目录（注意路径中不要有空格）
dsh plugin --profile web add file:C:/Users/xxx/dsh-plugin-browser
# 推荐同时安装 dshmarket，市场页签的操作按钮才能用
dsh plugin --profile web add dshmarket
# 重启 dsh 生效后：
#   - 会话里问 agent：`列出当前加载的所有插件` 或 `帮我找一下 TUI 相关的插件`
#   - 或到 设置 → 插件 → 插件浏览器 浏览市场并一键安装
```

## 工作原理

- `lib/index.js`：注册 `list_plugins` / `browse_plugin_market` 两个工具，并挂载
  HTTP 路由。
- `lib/registry.js`：加载 awesome-dsh-plugin 目录（在线 → 内置快照
  `data/registry-snapshot.json` → dshmarket 快照，三级回退，进程内缓存 10 分钟）。
- `lib/routes.js`：
  - `GET /dsh-plugin-browser/list` 本地 loader 快照；
  - `GET /dsh-plugin-browser/catalog` 目录 + 已装/加载状态合并视图；
  - `POST /dsh-plugin-browser/refresh` 清目录缓存。
- `client/client.js`：设置页「插件浏览器」（`settings.plugins.tab` 槽位），
  手写 CJS 零构建；动作按钮直接调用 dshmarket 的 `/dsh-market/install`、
  `/dsh-market/update`、`/dsh-market/uninstall`（同源）。

数据全部来自本机 + awesome 目录 JSON，不额外访问网络。

## 卸载

```bash
dsh plugin --profile web remove dsh-plugin-browser
```
