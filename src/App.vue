<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useMarkdownFiles } from '@/composables/useMarkdownFiles'
import type { FileChangeEvent } from '@/types'
import FileList from '@/components/FileList.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import MarkdownPreview from '@/components/MarkdownPreview.vue'
import OutlinePanel from '@/components/OutlinePanel.vue'
import ShortcutsHelp from '@/components/ShortcutsHelp.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const { files, loading, init, createFile, switchWorkspace, workspaceDir, saveFile, flushSave, activeFileId, dirty, loadFileFromPath, reloadFileById, reloadCurrentFile, loadTree, loadFiles } = useMarkdownFiles()

const sidebarTab = ref<'files' | 'outline'>('files')
const VIEW_MODE_KEY = 'md-view-mode'
const DEFAULT_MODE_KEY = 'md-default-view-mode'
type ViewMode = 'split' | 'editor' | 'preview'

/** 用户设置的启动默认模式（只读启动时用，不随切换改变） */
const defaultViewMode = ref<ViewMode>((localStorage.getItem(DEFAULT_MODE_KEY) as ViewMode) || 'split')

/** 当前显示模式：启动时读取默认值 */
const viewMode = ref<ViewMode>(defaultViewMode.value)

/** 切换模式（仅改变当前显示，不影响默认设置） */
function setViewMode(mode: ViewMode) {
  viewMode.value = mode
  localStorage.setItem(VIEW_MODE_KEY, mode)
}

/** 将当前模式设为启动默认 */
function setCurrentAsDefault() {
  defaultViewMode.value = viewMode.value
  localStorage.setItem(DEFAULT_MODE_KEY, viewMode.value)
  ElMessage.success('已设「' + ({ split: '分栏', editor: '编辑', preview: '预览' }[viewMode.value]) + '」为启动默认')
}

const showDefaultMenu = ref(false)
const showShortcuts = ref(false)
const focusMode = ref(false)
const previewComp = ref<InstanceType<typeof MarkdownPreview> | null>(null)

// ========== 缩放 ==========
const zoomLevel = ref(parseFloat(localStorage.getItem('md-zoom-level') || '1'))
watch(zoomLevel, v => localStorage.setItem('md-zoom-level', String(v)))

// ========== 分栏拖拽 ==========
const splitRatio = ref(parseFloat(localStorage.getItem('md-split-ratio') || '0.5'))
const isDragging = ref(false)

watch(splitRatio, v => localStorage.setItem('md-split-ratio', String(v)))

function onDividerMouseDown(e: MouseEvent) {
  e.preventDefault()
  isDragging.value = true
  const container = (e.currentTarget as HTMLElement).parentElement!

  function onMouseMove(e: MouseEvent) {
    const rect = container.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    splitRatio.value = Math.max(0.2, Math.min(0.8, ratio))
  }

  function onMouseUp() {
    isDragging.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function handleWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    zoomLevel.value = Math.max(0.5, Math.min(5.0, +(zoomLevel.value + delta).toFixed(1)))
  }
}

// ========== 拖入文件状态 ==========
const isDragOver = ref(false)

function onDragOver(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.types.includes('Files')) {
    isDragOver.value = true
  }
}

function onDragLeave(e: DragEvent) {
  if (e.currentTarget === e.target || !(e.currentTarget as HTMLElement)?.contains(e.relatedTarget as Node)) {
    isDragOver.value = false
  }
}

function onDropClear() {
  isDragOver.value = false
}

function cycleView() {
  const order: ViewMode[] = ['split', 'editor', 'preview']
  const idx = order.indexOf(viewMode.value)
  setViewMode(order[(idx + 1) % order.length])
}

// ========== 导出 ==========

const EXPORT_LAST_FORMAT_KEY = 'md-export-last-format'
const EXPORT_LAST_PATH_KEY = 'md-export-last-path'

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN" style="overflow:hidden">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
::-webkit-scrollbar { display: none; }
body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; max-width:900px; margin:0 auto; padding:2rem; line-height:1.8; color:#333; background:#fff; overflow:hidden; }
h1,h2,h3,h4,h5,h6 { color:#1a1a1a; margin-top:1.5em; margin-bottom:0.5em; }
pre { background:#1e1e2e; color:#e0e0e0; padding:1rem; border-radius:8px; overflow-x:auto; }
code { font-family:"Fira Code",monospace; font-size:0.9em; }
blockquote { border-left:4px solid #409eff; padding:0.5rem 1rem; background:#f0f7ff; margin:1rem 0; }
table { border-collapse:collapse; width:100%; }
th,td { border:1px solid #ddd; padding:0.5rem; text-align:left; }
th { background:#f5f5f5; }
img { max-width:100%; }
.mermaid-wrapper { text-align:center; margin:1rem 0; }
.mermaid-wrapper svg { max-width:100%; }
.code-block { margin:1rem 0; border-radius:8px; overflow:hidden; }
.code-block__header { padding:4px 12px; background:#1a1a2e; color:#8a8a8a; font-size:11px; text-transform:uppercase; }
</style>
</head>
<body>${body}</body>
</html>`
}

async function doExport(format: 'html' | 'pdf' | 'png', overwrite = false) {
  const pv = previewComp.value
  if (!pv) return
  const title = pv.getActiveFileName()?.replace('.md', '') || '文档'
  const html = pv.getRenderedHtml()
  if (!html || html.includes('preview-empty')) { ElMessage.warning('没有可导出的内容'); return }

  localStorage.setItem(EXPORT_LAST_FORMAT_KEY, format)

  try {
    const lastPath = overwrite ? localStorage.getItem(EXPORT_LAST_PATH_KEY) : null
    const fullHtml = wrapHtml(title, html)

    let path: string | null | undefined

    if (format === 'html') {
      const fp = lastPath || undefined
      path = await window.electronAPI?.exportHtml?.(title, fullHtml, fp)
    } else if (format === 'pdf') {
      const fp = lastPath || undefined
      path = await window.electronAPI?.exportPdf?.(title, fullHtml, fp)
    } else if (format === 'png') {
      ElMessage.info('正在生成图片…')
      const fp = lastPath || undefined
      path = await window.electronAPI?.exportImage?.(title, fullHtml, fp)
    }
    if (path) {
      localStorage.setItem(EXPORT_LAST_PATH_KEY, path)
      ElMessage.success(overwrite ? '已覆盖: ' + path : (format.toUpperCase() + ' 已导出'))
    }
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e?.message || String(e)))
  }
}

/** 使用上次设置导出 */
async function exportWithLastSettings(overwrite = false) {
  const lastFormat = localStorage.getItem(EXPORT_LAST_FORMAT_KEY) || 'html'
  doExport(lastFormat as 'html' | 'pdf' | 'png', overwrite)
}

// ========== 全局快捷键 ==========

function handleGlobalKeydown(e: KeyboardEvent): void {
  const isCtrl = e.ctrlKey || e.metaKey

  if (isCtrl && e.key === 'n') { e.preventDefault(); createFile() }
  if (isCtrl && e.key === 'o') { e.preventDefault(); switchWorkspace() }
  if (isCtrl && e.key === 'w') { e.preventDefault() }
  // 视图切换
  if (isCtrl && e.shiftKey && e.key === '!') { e.preventDefault(); setViewMode('editor') }
  if (isCtrl && e.shiftKey && e.key === 'V') { e.preventDefault(); setViewMode('preview') }
  if (isCtrl && e.shiftKey && e.key === 'X') { e.preventDefault(); setViewMode('split') }
  // 导出快捷键（编辑器聚焦时跳过，避免与编辑器快捷键冲突）
  const inEditor = document.activeElement?.closest('.editor-panel')
  if (isCtrl && e.shiftKey && e.key === 'H' && !inEditor) { e.preventDefault(); doExport('html') }
  if (isCtrl && e.shiftKey && e.key === 'P' && !inEditor) { e.preventDefault(); doExport('pdf') }
  if (isCtrl && e.shiftKey && e.key === 'G' && !inEditor) { e.preventDefault(); doExport('png') }
  if (isCtrl && e.shiftKey && e.key === 'E' && !inEditor) { e.preventDefault(); exportWithLastSettings() }
  if (isCtrl && e.shiftKey && e.key === 'O' && !inEditor) { e.preventDefault(); exportWithLastSettings(true) }
  // 快捷键速查 Ctrl+/
  if (isCtrl && e.key === '/') { e.preventDefault(); showShortcuts.value = !showShortcuts.value }
  // 专注模式 Ctrl+Shift+.
  if (isCtrl && e.shiftKey && e.key === '.') { e.preventDefault(); focusMode.value = !focusMode.value }
}

watch(dirty, (v) => { window.electronAPI?.setDirty(v) }, { immediate: true })

onMounted(async () => {
  await init()
  window.addEventListener('keydown', handleGlobalKeydown)
  window.electronAPI?.onOpenFile((filePath) => { loadFileFromPath(filePath) })
  // 轮询获取"打开方式"传入的待打开文件（解决推送式 IPC 的竞态条件）
  const pendingFile = await window.electronAPI?.pollOpenFile?.()
  if (pendingFile) await loadFileFromPath(pendingFile)
  // 文件加载完成后显示窗口（避免双击打开时的启动闪烁）
  window.electronAPI?.showWindow?.()
  window.electronAPI?.onFileDropped?.((filePath) => { loadFileFromPath(filePath) })
  window.electronAPI?.onDropReject?.((fileName) => {
    ElMessage.warning('不支持的文件格式：' + fileName + '，仅支持 .md 文件')
  })
  window.electronAPI?.onConfirmClose(async () => {
    try {
      await ElMessageBox.confirm('有未保存的更改，确定要关闭吗？', '未保存的更改', {
        confirmButtonText: '关闭并丢弃更改', cancelButtonText: '取消', type: 'warning', roundButton: true,
      })
      window.electronAPI?.confirmClose()
    } catch { window.electronAPI?.cancelClose() }
  })

  // 外部文件变更监听
  window.electronAPI?.onFileChanged?.((data: FileChangeEvent) => {
    const { filePath, type } = data
    const file = files.value.find(f => f.path === filePath)
    if (!file) return

    if (type === 'delete') {
      files.value = files.value.filter(f => f.id !== file.id)
      if (activeFileId.value === file.id) {
        activeFileId.value = files.value.length > 0 ? files.value[0].id : null
      }
      ElMessage.warning(`文件 "${file.name}" 已被外部删除`)
      return
    }

    if (file.id === activeFileId.value) {
      if (!dirty.value) {
        reloadFileById(file.id)
      } else {
        ElMessageBox.confirm(
          `文件 "${file.name}" 已被外部修改。\n重新加载将丢失未保存的更改。`,
          '文件已更改',
          {
            confirmButtonText: '重新加载',
            cancelButtonText: '保留我的版本',
            type: 'warning',
            roundButton: true,
          },
        ).then(() => {
          reloadFileById(file.id)
        }).catch(() => {
          // 用户选择保留当前版本
        })
      }
    } else {
      reloadFileById(file.id)
    }
  })

  // 工作区变更监听（插件/外部工具切换目录时自动刷新）
  window.electronAPI?.onWorkspaceChanged?.((dir: string) => {
    // 防止与 loadFileFromPath / switchWorkspace 中的 setWorkspace 冲突
    // 这些函数在自己调用 setWorkspace 之前已设置 workspaceDir，
    // 如果这里重复执行 loadTree/loadFiles 会清空所有文件的 content，导致预览出现"点击编辑"
    if (workspaceDir.value === dir) return
    workspaceDir.value = dir
    loadTree()
    loadFiles()
  })
})

onUnmounted(() => { window.removeEventListener('keydown', handleGlobalKeydown) })
</script>

<template>
  <div
    class="app-container"
    :class="{ 'app-container--focus': focusMode }"
    :data-dirty="dirty"
    :style="{ '--zoom-scale': String(zoomLevel) }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDropClear"
    @wheel="handleWheel"
  >
    <!-- 视图切换按钮 -->
    <div class="view-toggle" v-if="activeFileId">
      <el-button size="small" :type="viewMode === 'split' ? 'primary' : 'default'" @click="setViewMode('split')">
        <span>⊞</span> 分栏
      </el-button>
      <el-button size="small" :type="viewMode === 'editor' ? 'primary' : 'default'" @click="setViewMode('editor')">
        <span>✏️</span> 编辑
      </el-button>
      <el-button size="small" :type="viewMode === 'preview' ? 'primary' : 'default'" @click="setViewMode('preview')">
        <span>👁</span> 预览
      </el-button>
      <!-- 默认模式设置 -->
      <el-popover
        placement="bottom-end"
        :width="180"
        trigger="click"
        v-model:visible="showDefaultMenu"
      >
        <template #reference>
          <el-button size="small" class="default-btn" :class="{ 'default-btn--active': showDefaultMenu }">
            ⚙️
          </el-button>
        </template>
        <div class="default-menu">
          <div class="default-menu__title">启动时默认模式</div>
          <div class="default-menu__hint">当前：{{ { split: '分栏', editor: '编辑', preview: '预览' }[defaultViewMode] }}</div>
          <el-button size="small" class="default-menu__btn" @click="setCurrentAsDefault(); showDefaultMenu = false" round>
            设为启动默认
          </el-button>
        </div>
      </el-popover>
    </div>

    <!-- 缩放指示器 -->
    <div v-if="zoomLevel !== 1" class="zoom-badge">{{ Math.round(zoomLevel * 100) }}%</div>

    <!-- 拖入覆盖层 -->
    <Transition name="drag-fade">
      <div v-if="isDragOver" class="drag-overlay">
        <div class="drag-overlay__inner">
          <div class="drag-overlay__icon">📄</div>
          <div class="drag-overlay__text">释放以打开 .md 文件</div>
        </div>
      </div>
    </Transition>

    <ShortcutsHelp :visible="showShortcuts" @close="showShortcuts = false" />

    <!-- 主体区域 -->
    <main class="app-main">
      <template v-if="loading">
        <div class="app-loading">
          <div class="app-loading__spinner"><el-icon class="is-loading" :size="32"><i class="el-icon-loading"></i></el-icon></div>
          <p class="app-loading__text">正在加载工作目录...</p>
        </div>
      </template>

      <template v-else>
        <aside class="app-sidebar">
          <div class="sidebar-tabs">
            <div class="sidebar-tab" :class="{ 'sidebar-tab--active': sidebarTab === 'files' }" @click="sidebarTab = 'files'">📄 文件列表</div>
            <div class="sidebar-tab" :class="{ 'sidebar-tab--active': sidebarTab === 'outline' }" @click="sidebarTab = 'outline'">📑 大纲</div>
          </div>
          <FileList v-show="sidebarTab === 'files'" />
          <OutlinePanel v-show="sidebarTab === 'outline'" />
        </aside>

        <div class="app-content" :class="'app-content--' + viewMode" :style="{ '--split-ratio': splitRatio }">
          <section v-show="viewMode === 'split' || viewMode === 'editor'" class="app-editor">
            <MarkdownEditor @export="(fmt: string) => doExport(fmt as 'html'|'pdf'|'png')" @export-last="(ov: boolean) => exportWithLastSettings(ov)" />
          </section>
          <div
            v-show="viewMode === 'split'"
            class="app-divider"
            :class="{ 'app-divider--active': isDragging }"
            @mousedown.prevent="onDividerMouseDown"
          ></div>
          <section v-show="viewMode === 'split' || viewMode === 'preview'" class="app-preview">
            <MarkdownPreview ref="previewComp" />
          </section>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped lang="scss">
.app-container { display: flex; flex-direction: column; height: 100vh; width: 100vw; overflow: hidden; background: var(--bg); }

.view-toggle {
  position: fixed;
  top: 4px;
  right: 12px;
  z-index: 9999;
  display: flex;
  gap: 4px;
  :deep(.el-button) {
    height: 30px; font-size: 12px; padding: 0 10px; white-space: nowrap;
    background: var(--sidebar-bg); color: var(--text-secondary); border: 1px solid var(--divider); border-radius: 6px;
    transition: all 0.15s;
    &:hover { color: var(--primary); background: var(--hover); }
  }
  :deep(.el-button--primary) {
    background: var(--primary); color: #fff; border-color: var(--primary);
  }
}

// 默认模式设置按钮
.default-btn {
  margin-left: 4px !important;
  font-size: 14px !important;
  &--active {
    background: var(--primary-container) !important;
    color: var(--primary) !important;
  }
}

.default-menu {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }
  &__hint {
    font-size: 12px;
    color: var(--text-secondary);
  }
  &__btn {
    width: 100%;
  }
}

// 专注模式：隐藏侧边栏
.app-container--focus {
  .app-sidebar { display: none; }
  .view-toggle { opacity: 0.3; &:hover { opacity: 1; } }
}

// 缩放指示器
.zoom-badge {
  position: fixed;
  bottom: 40px;
  right: 20px;
  z-index: 9998;
  padding: 4px 12px;
  background: var(--surface);
  border: 1px solid var(--divider);
  border-radius: 12px;
  font-size: calc(12px * var(--zoom-scale, 1));
  font-weight: 600;
  color: var(--primary);
  box-shadow: $shadow-2;
  pointer-events: none;
  animation: zoom-pop 0.2s ease;
}
@keyframes zoom-pop {
  0% { transform: scale(0.8); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

// 拖入覆盖层
.drag-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  &__inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 48px 64px;
    border: 3px dashed var(--primary);
    border-radius: 24px;
    background: var(--surface);
    box-shadow: $shadow-4;
  }
  &__icon { font-size: 64px; }
  &__text { font-size: 20px; font-weight: 600; color: var(--text-primary); }
}
.drag-fade-enter-active, .drag-fade-leave-active { transition: opacity 0.2s ease; }
.drag-fade-enter-from, .drag-fade-leave-to { opacity: 0; }

.app-loading { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1rem; &__spinner{font-size:32px;color:var(--primary)} &__text{font-size:14px;color:var(--text-secondary)} }

.app-main { display: flex; flex: 1; overflow: hidden; }

.app-sidebar { width: $sidebar-width; min-width: $sidebar-width; display: flex; flex-direction: column; background: var(--sidebar-bg); border-right: 1px solid var(--divider); }
.sidebar-tabs { display: flex; border-bottom: 1px solid var(--divider); }
.sidebar-tab { flex:1; text-align:center; padding:10px 4px; font-size:12px; font-weight:500; color:var(--text-secondary); cursor:pointer; transition:color .15s,background .15s; user-select:none; &--active{color:var(--primary);background:var(--primary-container)} &:hover{color:var(--primary)} }

.app-content { flex:1; display:flex; overflow:hidden;
  &--split {
    .app-editor { flex: 0 0 calc(var(--split-ratio, 0.5) * 100%); min-width: 0; }
    .app-preview { flex: 1 1 0; min-width: 0; }
  }
  &--editor {
    .app-editor { flex: 1; }
    .app-preview { display: none; }
    .app-divider { display: none; }
  }
  &--preview {
    .app-editor { display: none; }
    .app-preview { flex: 1; }
    .app-divider { display: none; }
  }
}
.app-editor,.app-preview { overflow:hidden; display:flex; flex-direction:column; }
.app-editor { }

.app-divider {
  flex: 0 0 4px;
  cursor: col-resize;
  background: transparent;
  border-right: 1px solid var(--divider);
  transition: background 0.15s, border-color 0.15s;
  &:hover, &--active {
    background: var(--primary);
    border-right-color: var(--primary);
  }
}
</style>