# Project Instructions

This file provides context for AI assistants working on this project.

## Project Type: Node.js (Electron + Vue 3)

### Commands
- Install: `npm install`
- Test: `npm test` (暂无正式测试脚本)
- Build: `npm run build` (Vite 前端构建)
- Dev: `npm run dev` (Vite 开发服务器)
- Electron Dev: `npm run electron:dev`
- Electron Build (Windows): `npm run electron:build`
- Electron Build (macOS): `npm run electron:build:mac`

### Framework: Vite 6 + Vue 3 + Electron 42

### Documentation
See README.md for project overview and feature list.

### Version Control
This project uses Git. See .gitignore for excluded files. Push version tags (`v*`) to master to trigger CI release.

## Agent Guidance

- **CodeWhale reads this file as:** AGENTS.md
- **Read-only surface:** `node_modules/`, `dist/`, `release/`, `.git/`, `package-lock.json`
- **Never edit:** `package-lock.json`, `.github/workflows/*.yml` (without explicit request), generated `src/auto-imports.d.ts`, `src/components.d.ts`
- **Always test with:** `npm run build` (验证前端构建通过); `npm run electron:build` (验证打包)

## Architecture

### 项目结构概览

```
├── electron/
│   ├── main.cjs          # 主进程（IPC 处理、PDF/图片渲染导出、窗口管理）
│   └── preload.cjs       # 预加载桥接（contextBridge + 拖入文件处理）
├── src/
│   ├── App.vue           # 主布局（视图切换、全局快捷键、导出流程）
│   ├── components/
│   │   ├── FileList.vue          # 文件树 + 文件列表（右键菜单、搜索、排序）
│   │   ├── FileTreeItem.vue      # 树形节点递归组件
│   │   ├── MarkdownEditor.vue    # 编辑器面板（工具栏、代码补全、查找替换、撤销栈）
│   │   ├── MarkdownPreview.vue   # 预览面板（marked 渲染、Mermaid 流程图、WYSIWYG）
│   │   └── OutlinePanel.vue      # 大纲侧边栏（标题提取、跳转、高亮动画）
│   ├── composables/
│   │   ├── useMarkdownFiles.ts   # 核心状态管理（文件读写、目录树、脏状态）
│   │   └── useTheme.ts           # 主题管理（亮/暗色切换、localStorage 持久化）
│   ├── styles/
│   │   ├── variables.scss        # Material Design 色彩/字体/间距/阴影令牌
│   │   └── theme.scss            # CSS 变量注入 + Element Plus 深色主题覆写
│   ├── types/
│   │   └── index.ts              # TypeScript 类型定义（MarkdownFile, ElectronAPI 等）
│   ├── main.ts                   # Vue 应用入口（Element Plus + 图标注册）
│   └── env.d.ts                  # 环境类型声明
├── vite.config.ts                # Vite 构建配置（别名、SCSS 注入、分块策略）
├── package.json                  # 依赖 + electron-builder 打包配置
└── .github/workflows/
    └── build-macos.yml           # CI/CD: Windows + macOS 双平台自动构建发布
```

### Entry Points

- **Electron 主进程**: `electron/main.cjs` — app 启动入口，创建 BrowserWindow，注册所有 IPC handler（文件 CRUD、导出、对话框）
- **渲染进程**: `src/main.ts` — Vue 3 应用挂载，Element Plus 中文语言包 + 图标注册
- **Vue 根组件**: `src/App.vue` — 加载/初始化，视图模式切换（分栏/编辑/预览），全局快捷键绑定，导出协调

### Key Modules

| 模块 | 文件 | 职责 |
|------|------|------|
| **状态管理层** | `src/composables/useMarkdownFiles.ts` | 文件列表、活跃文件、目录树、脏状态、撤销栈；所有 IPC 调用封装在此 |
| **编辑器** | `src/components/MarkdownEditor.vue` | 文本编辑区（textarea）、格式化工具栏、查找替换、撤销/重做、统计、快捷键 |
| **预览渲染** | `src/components/MarkdownPreview.vue` | marked + highlight.js 渲染 Markdown，Mermaid 流程图预渲染缓存，WYSIWYG 编辑 |
| **文件管理** | `src/components/FileList.vue` + `FileTreeItem.vue` | 文件树形目录、搜索过滤、排序、右键菜单（新建/复制/重命名/删除） |
| **大纲导航** | `src/components/OutlinePanel.vue` | 提取标题层级结构、点击跳转 + 高亮动画 |
| **主题系统** | `src/composables/useTheme.ts` + `theme.scss` + `variables.scss` | 亮/暗色主题切换，CSS 变量驱动，Element Plus 深色覆写 |
| **IPC 桥接** | `electron/main.cjs` + `electron/preload.cjs` | 文件 CRUD、目录树扫描、拖入处理、"打开方式"竞态处理、导出 (HTML/PDF/PNG) |
| **CI/CD** | `.github/workflows/build-macos.yml` | tag push 触发 Windows + macOS 双平台构建 + GitHub Release |

### Data Flow

```
用户操作（点击/快捷键/拖入）
  └─→ Vue 组件（App / Editor / FileList / Preview）
        └─→ useMarkdownFiles composable（单例状态）
              ├─→ IPC invoke → electron/main.cjs handler → fs 操作 → 结果回渲染进程
              └─→ 响应式状态更新 → 各组件自动重渲染

导出流程:
  MarkdownEditor 触发 export → MarkdownPreview.getRenderedHtml()
  → App.vue.wrapHtml() 包装完整 HTML
  → IPC invoke → electron/main.cjs
      ├─ export:html → dialog.showSaveDialog → fs.writeFileSync
      ├─ export:pdf  → win.webContents.printToPDF → fs.writeFileSync
      └─ export:png  → win.capturePage → 合成全页长图 → fs.writeFileSync

Mermaid 流程图渲染:
  MarkdownEditor 内容变化
  → MarkdownPreview.compile() → marked.parse() 生成 HTML
  → replaceMermaidInHtml() 提取 ```mermaid 代码块
  → mermaid.render() 异步生成 SVG → 替换 HTML 中对应占位 → 设置 renderedHtml
  → 缓存已渲染的 SVG，重复代码块不再重新渲染

主题切换:
  useTheme().toggleTheme()
  → 更新 theme ref → watch 触发 applyTheme()
  → document.documentElement 添加/移除 dark class
  → theme.scss CSS 变量切换（亮/暗两套变量集）
  → Element Plus 深色覆写规则生效（--el-* 变量）
  → localStorage 持久化选择
```

## Cache Stability

- **Frequently-rebuilt files:** `dist/`, `release/`, `package-lock.json`, `src/auto-imports.d.ts`, `src/components.d.ts` — 这些都是生成文件，避免缓存依赖
- **Stable scaffolding:** `AGENTS.md`, `vite.config.ts`, `tsconfig.json`, `electron/main.cjs`, `electron/preload.cjs`, `src/types/index.ts`, `src/styles/variables.scss` — 配置和基座文件，保持字节稳定以利用 DeepSeek 前缀缓存
- **Append, don't reorder:** 新上下文追加在消息末尾；重排或改写早期消息会破坏缓存

## Guidelines

- 遵循现有代码风格：Vue 3 `<script setup lang="ts">` + SCSS scoped 样式
- Vue 组件命名使用 PascalCase，文件使用 PascalCase.vue
- composable 函数使用 `use` 前缀，文件名小驼峰
- IPC handler 名称使用 `namespace:method` 格式（如 `file:list`, `export:html`）
- SCSS 变量优先使用 `variables.scss` 中定义的令牌，不要硬编码颜色/间距值
- 新增功能需同时处理亮色和深色主题
- 所有 Electron IPC 调用需在 `electron/main.cjs` 注册 handler，`electron/preload.cjs` 暴露到 `window.electronAPI`
- 导出功能需在 `electron/main.cjs` 实现主进程逻辑，`electron/preload.cjs` 桥接，MarkdownPreview 提供渲染内容
- 修改 composable 状态时注意单例模式 — 组件通过 `useMarkdownFiles()` 共享同一状态
- 提交前运行 `npm run build` 验证构建无报错
- 更新此文件当项目架构或约定发生变化时
