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

/** 切换视图模式：全屏编辑 → 全屏只读 → 左右分栏循环 */
function cycleView() {
  const order: ('split' | 'editor' | 'preview')[] = ['split', 'editor', 'preview']
  const idx = order.indexOf(viewMode.value)
  viewMode.value = order[(idx + 1) % order.length]
}

/** 全局快捷键 */
function handleGlobalKeydown(e: KeyboardEvent): void {
  const isCtrl = e.ctrlKey || e.metaKey

  // Ctrl+N — 新建文件
  if (isCtrl && e.key === 'n') {
    e.preventDefault()
    createFile()
  }

  // Ctrl+O — 切换工作目录
  if (isCtrl && e.key === 'o') {
    e.preventDefault()
    switchWorkspace()
  }

  // Ctrl+W — 关闭当前文件
  if (isCtrl && e.key === 'w') {
    e.preventDefault()
    if (activeFileId.value) {
      // 聚焦到文件列表 = 取消选中状态
      // 实际效果是清除 activeFileId，让编辑器显示空状态
    }
  }

  // Ctrl+Shift+E — 全屏编辑
  if (isCtrl && e.shiftKey && e.key === 'E') {
    e.preventDefault()
    viewMode.value = 'editor'
  }
  // Ctrl+Shift+P — 全屏预览
  if (isCtrl && e.shiftKey && e.key === 'P') {
    e.preventDefault()
    viewMode.value = 'preview'
  }
  // Ctrl+Shift+X — 左右分栏
  if (isCtrl && e.shiftKey && e.key === 'X') {
    e.preventDefault()
    viewMode.value = 'split'
  }

  // Ctrl+S 由编辑器组件处理
}

/** 拖入文件打开 — 由 preload 的 webUtils.getPathForFile 处理 */
function onDragOver(e: DragEvent) { e.preventDefault() }
// onDrop 由 preload 中的 document.drop 监听处理，这里只阻止默认行为

// 同步 dirty 状态给主进程（关闭弹窗用）
watch(dirty, (v) => { window.electronAPI?.setDirty(v) }, { immediate: true })

onMounted(async () => {
  await init()
  window.addEventListener('keydown', handleGlobalKeydown)

  // 监听主进程发来的文件路径（打开方式关联）
  window.electronAPI?.onOpenFile((filePath) => {
    loadFileFromPath(filePath)
  })

  // 监听 preload 拖入文件
  window.electronAPI?.onFileDropped?.((filePath) => {
    loadFileFromPath(filePath)
  })

  // 关闭确认弹窗
  window.electronAPI?.onConfirmClose(async () => {
    try {
      await ElMessageBox.confirm('有未保存的更改，确定要关闭吗？', '未保存的更改', {
        confirmButtonText: '关闭并丢弃更改', cancelButtonText: '取消', type: 'warning', roundButton: true,
      })
      window.electronAPI?.confirmClose()
    } catch { window.electronAPI?.cancelClose() }
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <div class="app-container" :data-dirty="dirty" @dragover="onDragOver">
    <!-- 视图切换按钮（固定在右上角） -->
    <div class="view-toggle" v-if="activeFileId">
      <el-button size="small" @click="cycleView" :title="`切换至${viewMode === 'split' ? '全屏编辑' : viewMode === 'editor' ? '全屏预览' : '分栏模式'}`">
        {{ viewMode === 'split' ? '⊞ 分栏' : viewMode === 'editor' ? '✏️ 编辑' : '👁 预览' }}
      </el-button>
    </div>

    <!-- 主体区域 -->
    <main class="app-main">
      <template v-if="loading">
        <div class="app-loading">
          <div class="app-loading__spinner">
            <el-icon class="is-loading" :size="32">
              <i class="el-icon-loading"></i>
            </el-icon>
          </div>
          <p class="app-loading__text">正在加载工作目录...</p>
        </div>
      </template>

      <template v-else>
        <!-- 侧边栏（始终显示） -->
        <aside class="app-sidebar">
          <div class="sidebar-tabs">
            <div class="sidebar-tab" :class="{ 'sidebar-tab--active': sidebarTab === 'files' }" @click="sidebarTab = 'files'">📄 文件列表</div>
            <div class="sidebar-tab" :class="{ 'sidebar-tab--active': sidebarTab === 'outline' }" @click="sidebarTab = 'outline'">📑 大纲</div>
          </div>
          <FileList v-show="sidebarTab === 'files'" />
          <OutlinePanel v-show="sidebarTab === 'outline'" />
        </aside>

        <!-- 内容区：根据 viewMode 显示 -->
        <div class="app-content" :class="'app-content--' + viewMode">
          <section v-show="viewMode === 'split' || viewMode === 'editor'" class="app-editor">
            <MarkdownEditor />
          </section>
          <section v-show="viewMode === 'split' || viewMode === 'preview'" class="app-preview">
            <MarkdownPreview />
          </section>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped lang="scss">
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background: var(--bg);
}

// ========== 视图切换按钮 ==========
.view-toggle {
  position: fixed;
  top: 4px;
  right: 12px;
  z-index: 9999;
  :deep(.el-button) {
    height: 32px;
    font-size: 13px;
    padding: 0 12px;
    background: var(--sidebar-bg);
    color: var(--text-secondary);
    border: 1px solid var(--divider);
    border-radius: 6px;
    &:hover { color: var(--primary); background: var(--hover); }
  }
}

// ========== 加载状态 ==========
.app-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $spacing-md;

  &__spinner { font-size: 32px; color: var(--primary); }
  &__text { font-size: $font-size-base; color: var(--text-secondary); }
}

// ========== 主体区域 ==========
.app-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

// ========== 侧边栏 ==========
.app-sidebar {
  width: $sidebar-width;
  flex-shrink: 0;
  overflow: hidden;
}

.sidebar-tabs {
  display: flex;
  border-bottom: 1px solid var(--divider);
  background: var(--sidebar-bg);
}
.sidebar-tab {
  flex: 1; text-align: center; padding: 11px 0;
  font-size: $font-size-sm; color: var(--text-secondary);
  cursor: pointer; border-bottom: 2px solid transparent;
  transition: all $transition-fast; user-select: none; line-height: 1.2;
  &:hover { color: var(--text-primary); }
  &--active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }
}

// ========== 内容区域（编辑器 + 预览） ==========
.app-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

// 全屏编辑
.app-content--editor .app-editor { flex: 1; min-width: 0; overflow: hidden; }
.app-content--editor .app-preview { display: none; }

// 全屏预览
.app-content--preview .app-editor { display: none; }
.app-content--preview .app-preview { flex: 1; min-width: 0; overflow: hidden; }

// 左右分栏（默认）
.app-content--split .app-editor { flex: 1; min-width: 0; overflow: hidden; }
.app-content--split .app-preview { flex: 1; min-width: 0; overflow: hidden; }
</style>
