# Markdown 编辑器

跨平台 Markdown 编辑器，基于 Electron + Vue 3 构建，支持实时预览、文件管理、图片粘贴、流程图渲染、多格式导出。

## 功能

### 编辑
- Markdown 实时预览（marked + highlight.js）
- WYSIWYG 所见即所得编辑模式
- 代码块语法高亮（支持 17 种语言）
- **Mermaid 流程图**：支持 flowchart / sequence / class / gantt / pie 等所有 Mermaid 图表类型
- 文件管理（新建、重命名、删除）
- 拖拽打开 .md 文件
- 表格操作（插入行列、移动、删除）
- 查找替换（正则支持）
- 暗色/亮色主题切换
- 大纲导航面板（点击跳转标题）

### 导出

导出功能位于编辑器工具栏 → **文件 ▾ → 导出文档** 分组：

| 格式 | 快捷键 | 说明 |
|------|--------|------|
| 🌐 HTML | `Ctrl+Shift+H` | 导出为完整 HTML 页面，内联样式 |
| 📄 PDF | `Ctrl+Shift+P` | 主进程渲染 → `printToPDF`，保持排版 |
| 🖼️ PNG 图像 | `Ctrl+Shift+G` | 主进程 `capturePage` 全页长截图 |
| ⚡ 上次设置导出 | `Ctrl+Shift+E` | 使用上次选择的格式一键导出 |
| 🔄 覆盖上次导出 | `Ctrl+Shift+O` | 直接覆盖上一次导出的文件 |

### 图片处理
- 粘贴图片自动保存到 `.assets/` 目录
- 图片右键：复制、另存为
- 相对路径自动解析为 `file://`

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+N` | 新建文件 |
| `Ctrl+S` | 保存 |
| `Ctrl+O` | 切换工作目录 |
| `Ctrl+F` | 查找 |
| `Ctrl+D` | 复制当前行 |
| `Ctrl+Shift+1` | 全屏编辑 |
| `Ctrl+Shift+V` | 全屏预览 |
| `Ctrl+Shift+X` | 左右分栏 |
| `Ctrl+Shift+E` | 上次设置导出 |
| `Ctrl+Shift+H` | 导出 HTML |
| `Ctrl+Shift+P` | 导出 PDF |
| `Ctrl+Shift+G` | 导出图像 |
| `Ctrl+Shift+O` | 覆盖上次导出 |

## 下载安装

从 [Releases](https://github.com/belldandy114/markdown-editor/releases) 页面下载最新安装包：

| 平台 | 架构 | 格式 |
|------|------|------|
| Windows | x64 | `.exe` 安装包 |
| macOS | Intel / Apple Silicon | `.dmg` / `.zip` |

## 自动构建

推送版本 tag（`v*`）到 master 分支时，GitHub Actions 自动执行：

1. 分别在 **Windows** 和 **macOS** 环境中构建前端
2. 用 electron-builder 打包：
   - Windows → NSIS 安装包（`.exe`）
   - macOS → DMG + ZIP（x64 & arm64 双架构）
3. 创建 GitHub Release 并上传所有安装包

### 手动发布步骤

```bash
git tag v1.0.7
git push origin v1.0.7
```

等待 Actions 完成后，前往 [Releases](https://github.com/belldandy114/markdown-editor/releases) 即可下载。

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 启动 Electron 开发模式
npm run electron:dev

# 本地打包 Windows
npm run electron:build

# 本地打包 macOS（需在 Mac 上执行）
npm run electron:build:mac
```

## 技术栈

- **前端框架**：Vue 3 + TypeScript
- **构建工具**：Vite 6
- **桌面框架**：Electron 42
- **UI 组件库**：Element Plus
- **Markdown 渲染**：marked + highlight.js
- **流程图**：Mermaid 11
- **打包工具**：electron-builder
- **CI/CD**：GitHub Actions

## 项目结构

```
├── electron/
│   ├── main.cjs          # 主进程（IPC 处理、PDF/图片渲染导出）
│   └── preload.cjs       # 预加载桥接
├── src/
│   ├── App.vue           # 主布局、视图切换、快捷键
│   ├── components/
│   │   ├── FileList.vue           # 文件列表
│   │   ├── MarkdownEditor.vue     # 编辑器（工具栏、文件菜单）
│   │   ├── MarkdownPreview.vue    # 预览（Mermaid 渲染）
│   │   └── OutlinePanel.vue       # 大纲面板
│   ├── composables/
│   │   ├── useMarkdownFiles.ts    # 文件状态管理
│   │   └── useTheme.ts            # 主题切换
│   ├── styles/                    # 主题变量
│   └── types/index.ts             # TypeScript 类型定义
├── build/
│   ├── icon.png                   # 1024×1024 应用图标
│   └── entitlements.mac.plist     # macOS 沙箱权限
├── .github/workflows/
│   └── build-macos.yml            # CI/CD 自动构建
└── package.json
```

## 版本历史

- **v1.0.7** — Mermaid 流程图、多格式导出（HTML/PDF/PNG）、导出覆盖、快捷键、导出快捷键
- **v1.0.6** — Windows/macOS 双平台 CI、GitHub Release 自动发布
- **v1.0.2** — Windows 打包配置
- **v1.0.0** — 初始版本
