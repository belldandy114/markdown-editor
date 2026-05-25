# Markdown 编辑器

跨平台 Markdown 编辑器，支持实时预览、文件管理、图片粘贴，基于 Electron + Vue 3 构建。

## 功能

- 实时 Markdown 预览（marked + highlight.js）
- 代码块语法高亮
- 文件管理（新建、重命名、删除）
- 拖拽打开 .md 文件
- 粘贴图片自动保存
- 暗色/亮色主题切换
- 大纲导航面板
- 导出为图片

## 下载安装

从 [Releases](https://github.com/belldandy114/markdown-editor/releases) 页面下载最新安装包：

| 平台 | 格式 |
|------|------|
| macOS Intel | `.dmg` |
| macOS Apple Silicon (M1/M2/M3) | `.dmg` |
| Windows x64 | `.exe` |

## 自动构建

推送版本 tag（`v*`）到 master 分支时，GitHub Actions 自动执行：

1. 分别在 **Windows** 和 **macOS** 环境中构建前端
2. 用 electron-builder 打包：
   - Windows → NSIS 安装包（`.exe`）
   - macOS → DMG + ZIP（x64 & arm64 双架构）
3. 创建 GitHub Release 并上传所有安装包

### 手动发布步骤

```bash
git tag v1.0.6
git push origin v1.0.6
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
- **打包工具**：electron-builder
- **CI/CD**：GitHub Actions
