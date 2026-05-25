<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useMarkdownFiles } from '@/composables/useMarkdownFiles'
import FileList from '@/components/FileList.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import MarkdownPreview from '@/components/MarkdownPreview.vue'
import OutlinePanel from '@/components/OutlinePanel.vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const { loading, init, createFile, switchWorkspace, workspaceDir, saveFile, flushSave, activeFileId, dirty, loadFileFromPath } = useMarkdownFiles()

const sidebarTab = ref<'files' | 'outline'>('files')
const viewMode = ref<'split' | 'editor' | 'preview'>('split')
const previewComp = ref<InstanceType<typeof MarkdownPreview> | null>(null)

function cycleView() {
  const order: ('split' | 'editor' | 'preview')[] = ['split', 'editor', 'preview']
  const idx = order.indexOf(viewMode.value)
  viewMode.value = order[(idx + 1) % order.length]
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
  if (isCtrl && e.shiftKey && e.key === '!') { e.preventDefault(); viewMode.value = 'editor' }
  if (isCtrl && e.shiftKey && e.key === 'V') { e.preventDefault(); viewMode.value = 'preview' }
  if (isCtrl && e.shiftKey && e.key === 'X') { e.preventDefault(); viewMode.value = 'split' }
  // 导出快捷键
  if (isCtrl && e.shiftKey && e.key === 'H') { e.preventDefault(); doExport('html') }
  if (isCtrl && e.shiftKey && e.key === 'P') { e.preventDefault(); doExport('pdf') }
  if (isCtrl && e.shiftKey && e.key === 'G') { e.preventDefault(); doExport('png') }
  if (isCtrl && e.shiftKey && e.key === 'E') { e.preventDefault(); exportWithLastSettings() }
  if (isCtrl && e.shiftKey && e.key === 'O') { e.preventDefault(); exportWithLastSettings(true) }
}

function onDragOver(e: DragEvent) { e.preventDefault() }

watch(dirty, (v) => { window.electronAPI?.setDirty(v) }, { immediate: true })

onMounted(async () => {
  await init()
  window.addEventListener('keydown', handleGlobalKeydown)
  window.electronAPI?.onOpenFile((filePath) => { loadFileFromPath(filePath) })
  window.electronAPI?.onFileDropped?.((filePath) => { loadFileFromPath(filePath) })
  window.electronAPI?.onConfirmClose(async () => {
    try {
      await ElMessageBox.confirm('有未保存的更改，确定要关闭吗？', '未保存的更改', {
        confirmButtonText: '关闭并丢弃更改', cancelButtonText: '取消', type: 'warning', roundButton: true,
      })
      window.electronAPI?.confirmClose()
    } catch { window.electronAPI?.cancelClose() }
  })
})

onUnmounted(() => { window.removeEventListener('keydown', handleGlobalKeydown) })
</script>

<template>
  <div class="app-container" :data-dirty="dirty" @dragover="onDragOver">
    <!-- 视图切换按钮 -->
    <div class="view-toggle" v-if="activeFileId">
      <el-button size="small" @click="cycleView" :title="`切换至${viewMode === 'split' ? '全屏编辑' : viewMode === 'editor' ? '全屏预览' : '分栏模式'}`">
        {{ viewMode === 'split' ? '⊞ 分栏' : viewMode === 'editor' ? '✏️ 编辑' : '👁 预览' }}
      </el-button>
    </div>

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

        <div class="app-content" :class="'app-content--' + viewMode">
          <section v-show="viewMode === 'split' || viewMode === 'editor'" class="app-editor">
            <MarkdownEditor @export="(fmt: string) => doExport(fmt as 'html'|'pdf'|'png')" @export-last="(ov: boolean) => exportWithLastSettings(ov)" />
          </section>
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
  :deep(.el-button) {
    height: 32px; font-size: 13px; padding: 0 14px; white-space: nowrap; min-width: 90px;
    background: var(--sidebar-bg); color: var(--text-secondary); border: 1px solid var(--divider); border-radius: 6px;
    &:hover { color: var(--primary); background: var(--hover); }
  }
}

.app-loading { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1rem; &__spinner{font-size:32px;color:var(--primary)} &__text{font-size:14px;color:var(--text-secondary)} }

.app-main { display: flex; flex: 1; overflow: hidden; }

.app-sidebar { width: $sidebar-width; min-width: $sidebar-width; display: flex; flex-direction: column; background: var(--sidebar-bg); border-right: 1px solid var(--divider); }
.sidebar-tabs { display: flex; border-bottom: 1px solid var(--divider); }
.sidebar-tab { flex:1; text-align:center; padding:10px 4px; font-size:12px; font-weight:500; color:var(--text-secondary); cursor:pointer; transition:color .15s,background .15s; user-select:none; &--active{color:var(--primary);background:var(--primary-container)} &:hover{color:var(--primary)} }

.app-content { flex:1; display:flex; overflow:hidden;
  &--split { .app-editor{width:50%} .app-preview{width:50%} }
  &--editor { .app-editor{width:100%} .app-preview{display:none} }
  &--preview { .app-editor{display:none} .app-preview{width:100%} }
}
.app-editor,.app-preview { overflow:hidden; display:flex; flex-direction:column; }
.app-editor { border-right:1px solid var(--divider); }
</style>
