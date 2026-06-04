# markdown-editor

跨平台 Markdown 编辑器，基于 Electron + Vue 3，支持实时预览、文件管理、图片粘贴等功能。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Vue 3 + Composition API + TypeScript |
| UI 库 | Element Plus (含图标库) |
| 构建 | Vite 6 + vue-tsc |
| 桌面壳 | Electron 42 (main.cjs / preload.cjs, contextBridge IPC) |
| 打包 | electron-builder 26 (NSIS for Windows, DMG for macOS) |
| Markdown | marked (渲染) + highlight.js (代码高亮) + mermaid (图表) + Turndown (HTML→MD) |
| 样式 | SCSS + CSS 自定义属性 (Material Design 色彩系统) |

## 项目结构

```
markdown-editor/
├── electron/
│   ├── main.cjs          # Electron 主进程：窗口创建、IPC 处理、文件I/O、导出
│   └── preload.cjs       # preload 脚本：contextBridge 暴露 electronAPI、拖入文件处理
├── src/
│   ├── main.ts           # Vue 入口：安装 Element Plus + 图标
│   ├── App.vue           # 根组件：视图切换、缩放、拖入、导出、全局快捷键
│   ├── types/index.ts    # TypeScript 接口定义 (MarkdownFile, FileTreeNode, ElectronAPI...)
│   ├── composables/
│   │   ├── useMarkdownFiles.ts  # 全局单例状态：文件 CRUD、工作目录、树结构、滚动同步
│   │   └── useTheme.ts          # 主题管理 (light/dark, localStorage 持久化)
│   ├── components/
│   │   ├── MarkdownEditor.vue   # 编辑器面板：工具栏、右键菜单、查找替换、撤销重做
│   │   ├── MarkdownPreview.vue  # 预览面板：marked 渲染、WYSIWYG、Mermaid、滚动同步
│   │   ├── FileList.vue         # 文件树：排序、搜索、右键菜单、新建/删除/重命名
│   │   ├── FileTreeItem.vue     # 递归树节点组件
│   │   └── OutlinePanel.vue     # 大纲面板：标题解析、点击滚动、高亮
│   └── styles/
│       ├── variables.scss       # SCSS 变量：色彩、字体、间距、阴影、过渡
│       └── theme.scss           # CSS 自定义属性：light/dark 主题、Element Plus 覆写
├── .github/workflows/
│   └── build-macos.yml          # CI：Windows + macOS 构建 + GitHub Release
├── icon.ico / icon.png          # 应用图标
├── package.json                 # electron-builder 配置 (NSIS/DMG)
├── vite.config.ts               # Vite + Element Plus 自动导入、SCSS 变量注入
└── tsconfig.json                # 路径别名 @/ → src/
```

## 架构要点

### 状态管理
- `useMarkdownFiles.ts` 是模块级单例（不是 provide/inject），所有组件直接 import
- 文件列表、活跃文件、工作目录、滚动比例等全部在此管理
- 文件名 ID 使用 `pathToId()` 哈希生成 (base-36)
- 工作目录和活跃文件 ID 保存在 `localStorage`

### 视图模式
- 三种模式：`split`（分栏） | `editor`（仅编辑） | `preview`（仅预览）
- `App.vue` 中的 `viewMode` ref 控制；两个 storage key：
  - `md-view-mode`：当前模式（每次切换都保存）
  - `md-default-view-mode`：启动默认（只在"设为启动默认"时保存）
- 快捷键 `Ctrl+Shift+!`(编辑) / `V`(预览) / `X`(分栏) 切换

### 滚动同步
- 编辑器和预览通过 `editorScrollRatio` / `previewScrollRatio` 两个 ref 双向同步
- 使用 `lockScroll` 防止循环触发（30ms 锁）
- 编辑器使用 `scrollTop / (scrollHeight - clientHeight)` 计算比例
- 预览使用 `scrollTop / (scrollHeight - clientHeight)` 计算比例

### 导出
- 支持 HTML / PDF / PNG 三种格式
- 最后导出格式和路径保存在 localStorage
- 快捷键：`Ctrl+Shift+H`(HTML) / `P`(PDF) / `G`(PNG) / `E`(上次设置) / `O`(覆盖)
- 导出路径可选，传 `filePath` 则直接写入跳过对话框（覆盖模式）

### 图片粘贴
- 通过 `clipboardData.files` / `clipboardData.items` / `data:image` URL 三级检测
- 自动保存到工作目录的 `.assets/` 文件夹
- 限制 10MB 大小

### 文件树
- 递归扫描目录树（跳过 `node_modules` / `.git` / 隐藏目录）
- 三种排序：按修改时间 / 按创建时间 / 按文件名
- 右键菜单支持新建文件/文件夹、复制、重命名、删除
- 支持搜索（按文件名过滤）

### 编辑器功能
- 撤销/重做栈（最多 50 条）
- 查找/替换（正则匹配）
- 工具栏菜单：文件、插入、代码块、格式、列表、表格、工具
- 右键菜单（含格式、列表、插入、表格、工具子菜单）
- 智能回车：列表/任务/引用自动续行，空行退出
- 清除样式（去除加粗/斜体/删除线/代码/链接/图片语法）

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+S` | 保存 |
| `Ctrl+N` | 新建文件 |
| `Ctrl+O` | 切换工作目录 |
| `Ctrl+F` / `Ctrl+H` | 查找 / 替换 |
| `Ctrl+B` / `Ctrl+I` | 加粗 / 斜体 |
| `Ctrl+Shift+S` | 删除线 |
| `` Ctrl+` `` | 行内代码 |
| `Ctrl+Shift+K` | 代码块 |
| `Ctrl+K` / `Ctrl+Shift+I` | 链接 / 图片 |
| `Ctrl+1~6` / `Ctrl+0` | 标题 / 段落 |
| `Ctrl+Shift+U/O/T/Q` | 无序/有序/任务/引用 |
| `Ctrl+Shift+M` | 公式 |
| `Ctrl+Shift+E/D` | 移除空行 / 删除重复行 |
| `Ctrl+Z/Y` | 撤销 / 重做 |
| `Ctrl+D` | 复制行 |
| `Tab` / `Shift+Tab` | 缩进 / 取消缩进 |
| `Ctrl+Shift+! / V / X` | 编辑 / 预览 / 分栏模式 |
| `Ctrl+Shift+H / P / G` | 导出 HTML / PDF / PNG |
| `Ctrl+Shift+E / O` | 上次设置导出 / 覆盖导出 |

## 主题
- light / dark 切换，保存在 `localStorage` (`markdown-editor-theme`)
- 通过 `<html class="dark">` + CSS 自定义属性实现
- 深色主题自动适配 Element Plus、highlight.js、mermaid

## 构建 & 发布

```bash
# 开发
npm run dev                    # Vite 开发服务器
npm run electron:dev           # Vite + Electron 并行

# 构建
npm run electron:build         # Windows NSIS 安装包
npm run electron:build:mac     # macOS DMG
npm run electron:build:all     # 同时构建 Windows + macOS

# CI (GitHub Actions)
# 推送 tag v* 自动构建并创建 Release:
#   - Windows: Markdown编辑器-v{version}-安装包.exe
#   - macOS:   Markdown编辑器-v{version}-macOS-{arch}.{ext}
```

## IPC 通信

`preload.cjs` 通过 `contextBridge.exposeInMainWorld` 暴露 `window.electronAPI`：

- **文件操作**：listFiles, readFile, saveFile, createFile, deleteFile, renameFile, copyFile
- **目录操作**：selectDirectory, createDir, deleteDir, listTree
- **导出**：exportHtml, exportPdf, exportImage
- **图片**：saveImage, saveImageAs, copyImageFromBase64, readFileAsBase64
- **事件**：onOpenFile, onFileDropped, onDropReject, onConfirmClose
- **其他**：setDirty, showInFolder, openExternal, openPath, openFileDialog, createWindow

## 发布版本

- 更新 `package.json` 中 `version` 字段
- 提交后打 tag：`git tag v{version}` && `git push origin v{version}`
- CI 自动构建并在 Release 页面发布
