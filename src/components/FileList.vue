<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMarkdownFiles } from '@/composables/useMarkdownFiles'
import type { FileTreeNode } from '@/types'
import {
  Plus,
  Delete,
  Edit,
  Document,
  FolderOpened,
  Folder,
  Search,
} from '@element-plus/icons-vue'

const {
  treeData,
  filteredFiles,
  activeFileId,
  searchQuery,
  workspaceDir,
  selectFile,
  openFileByPath,
  createFile,
  copyFileItem,
  createDir,
  deleteDirFromTree,
  deleteFile,
  renameFile,
  switchWorkspace,
  toggleExpand,
  expandedPaths,
  loading,
  treeLoading,
} = useMarkdownFiles()

// ========== 右键菜单状态 ==========

interface CtxMenu {
  visible: boolean
  x: number
  y: number
  node: FileTreeNode | null
  /** 所在目录路径（新建文件/文件夹时使用） */
  parentDir: string
}

const ctxMenu = ref<CtxMenu>({
  visible: false, x: 0, y: 0, node: null, parentDir: '',
})

function showCtxMenu(e: MouseEvent, node: FileTreeNode, parentDir: string) {
  e.preventDefault()
  e.stopPropagation()
  ctxMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    node,
    parentDir,
  }
}

function hideCtxMenu() {
  ctxMenu.value.visible = false
}

function onDocumentClick() {
  if (ctxMenu.value.visible) hideCtxMenu()
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))

// ========== 上下文菜单操作 ==========

const ctxActions = computed(() => {
  const n = ctxMenu.value.node
  if (!n) return []
  if (n.type === 'directory') {
    return [
      { label: '📄 新建文件', action: () => { hideCtxMenu(); createFile(n.path) } },
      { label: '📁 新建文件夹', action: () => { hideCtxMenu(); createDir(n.path) } },
      { type: 'divider' as const },
      { label: '📂 打开文件所在位置', action: () => { hideCtxMenu(); window.electronAPI?.showInFolder(n.path) } },
      { type: 'divider' as const },
      { label: '🗑️ 删除文件夹', danger: true, action: () => { hideCtxMenu(); deleteDirFromTree(n.path) } },
    ]
  }
  return [
    { label: '📄 新建文件', action: () => { hideCtxMenu(); createFile(ctxMenu.value.parentDir) } },
    { label: '📄 复制文件', action: () => { hideCtxMenu(); copyFileItem(n.path) } },
    { label: '✏️ 重命名', action: () => { hideCtxMenu(); renameFileById(n.path) } },
    { type: 'divider' as const },
    { label: '📂 打开文件所在位置', action: () => { hideCtxMenu(); window.electronAPI?.showInFolder(n.path) } },
    { type: 'divider' as const },
    { label: '🗑️ 删除', danger: true, action: () => { hideCtxMenu(); deleteFileById(n.path) } },
  ]
})

/** 通过路径找 file id 并重命名 */
function renameFileById(filePath: string) {
  const id = pathToId(filePath)
  renameFile(id)
}
function deleteFileById(filePath: string) {
  const id = pathToId(filePath)
  deleteFile(id)
}

// ========== 工具 ==========

function pathToId(filePath: string): string {
  let hash = 0
  for (let i = 0; i < filePath.length; i++) {
    hash = ((hash << 5) - hash) + filePath.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function formatTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function basename(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || ''
}

function isExpanded(path: string): boolean {
  return expandedPaths.value.has(path)
}

// ========== 文件点击 ==========

function onFileClick(node: FileTreeNode) {
  openFileByPath(node.path)
}

function onDirClick(node: FileTreeNode) {
  toggleExpand(node.path)
}

// ========== 节点渲染（递归组件） ==========

// 通过模板渲染递归树
</script>

<template>
  <div class="file-list">
    <!-- 头部 -->
    <div class="file-list__header">
      <div class="file-list__header-info">
        <span class="file-list__title">文件列表</span>
        <span class="file-list__count">{{ filteredFiles.length }} 项</span>
      </div>
      <div class="file-list__workspace-row">
        <div class="file-list__workspace" :title="workspaceDir">
          📁 {{ basename(workspaceDir) || '未选择目录' }}
        </div>
        <el-button text size="small" class="file-list__dir-btn" @click="switchWorkspace()">
          📂 更改
        </el-button>
      </div>
    </div>

    <!-- 搜索 -->
    <div class="file-list__search">
      <el-input
        v-model="searchQuery"
        placeholder="搜索文件..."
        :prefix-icon="Search"
        size="small"
        clearable
      />
    </div>

    <!-- 新建按钮 -->
    <div class="file-list__actions">
      <el-button
        type="primary"
        size="small"
        :icon="Plus"
        class="file-list__add-btn"
        @click="createFile()"
      >
        新建文件
      </el-button>
    </div>

    <!-- 树形文件列表 -->
    <div class="file-list__items">
      <!-- 搜索模式：扁平列表 -->
      <template v-if="searchQuery.trim()">
        <div
          v-for="file in filteredFiles"
          :key="file.id"
          class="file-list__item"
          :class="{ 'file-list__item--active': file.id === activeFileId }"
          @click="selectFile(file.id)"
          @contextmenu.prevent="openFileLocation(file.path)"
        >
          <div class="file-list__item-main">
            <el-icon class="file-list__item-icon"><Document /></el-icon>
            <div class="file-list__item-info">
              <span class="file-list__item-name">{{ file.name }}</span>
              <span class="file-list__item-time">{{ formatTime(file.updatedAt) }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 树形模式 -->
      <template v-else>
        <template v-if="treeLoading">
          <div class="file-list__empty">加载中...</div>
        </template>
        <template v-else>
          <!-- 递归树节点 -->
          <template v-for="node in treeData" :key="node.path">
            <!-- 目录节点 -->
            <div
              v-if="node.type === 'directory'"
              class="file-list__tree-node"
            >
              <div
                class="file-list__dir-row"
                :class="{ 'file-list__dir-row--expanded': isExpanded(node.path) }"
                @click="onDirClick(node)"
                @contextmenu="showCtxMenu($event, node, node.path)"
              >
                <span class="file-list__arrow">{{ isExpanded(node.path) ? '▼' : '▶' }}</span>
                <el-icon class="file-list__item-icon"><FolderOpened /></el-icon>
                <span class="file-list__dir-name">{{ node.name }}</span>
              </div>
              <div v-if="isExpanded(node.path) && node.children" class="file-list__children">
                <template v-for="child in node.children" :key="child.path">
                  <!-- 子目录 -->
                  <div
                    v-if="child.type === 'directory'"
                    class="file-list__tree-node file-list__tree-node--nested"
                  >
                    <div
                      class="file-list__dir-row"
                      :class="{ 'file-list__dir-row--expanded': isExpanded(child.path) }"
                      @click="onDirClick(child)"
                      @contextmenu="showCtxMenu($event, child, child.path)"
                    >
                      <span class="file-list__arrow">{{ isExpanded(child.path) ? '▼' : '▶' }}</span>
                      <el-icon class="file-list__item-icon"><FolderOpened /></el-icon>
                      <span class="file-list__dir-name">{{ child.name }}</span>
                    </div>
                    <div v-if="isExpanded(child.path) && child.children" class="file-list__children">
                      <div
                        v-for="gc in child.children"
                        :key="gc.path"
                        class="file-list__file-row file-list__tree-node--nested2"
                        :class="{ 'file-list__file-row--active': pathToId(gc.path) === activeFileId }"
                        @click="onFileClick(gc)"
                        @contextmenu="showCtxMenu($event, gc, child.path)"
                      >
                        <el-icon class="file-list__item-icon"><Document /></el-icon>
                        <span class="file-list__file-name">{{ gc.name }}</span>
                      </div>
                    </div>
                  </div>
                  <!-- 子文件 -->
                  <div
                    v-else
                    class="file-list__file-row file-list__tree-node--nested"
                    :class="{ 'file-list__file-row--active': pathToId(child.path) === activeFileId }"
                    @click="onFileClick(child)"
                    @contextmenu="showCtxMenu($event, child, node.path)"
                  >
                    <el-icon class="file-list__item-icon"><Document /></el-icon>
                    <span class="file-list__file-name">{{ child.name }}</span>
                  </div>
                </template>
                <!-- 空目录提示 -->
                <div v-if="!node.children || node.children.length === 0" class="file-list__empty-dir">
                  空文件夹
                </div>
              </div>
            </div>
            <!-- 根级别文件 -->
            <div
              v-else
              class="file-list__file-row"
              :class="{ 'file-list__file-row--active': pathToId(node.path) === activeFileId }"
              @click="onFileClick(node)"
              @contextmenu="showCtxMenu($event, node, workspaceDir)"
            >
              <el-icon class="file-list__item-icon"><Document /></el-icon>
              <span class="file-list__file-name">{{ node.name }}</span>
            </div>
          </template>
        </template>
      </template>

      <!-- 空状态 -->
      <div v-if="!treeLoading && treeData.length === 0 && !searchQuery.trim()" class="file-list__empty">
        <el-empty :image-size="60">
          <template #description>
            <p>暂无文件，点击上方「新建文件」开始</p>
          </template>
        </el-empty>
      </div>
    </div>

    <!-- ========== 右键菜单 ========== -->
    <Teleport to="body">
      <div
        v-if="ctxMenu.visible"
        class="ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      >
        <template v-for="(item, i) in ctxActions" :key="i">
          <div v-if="item.type === 'divider'" class="ctx-menu__divider" />
          <div
            v-else
            class="ctx-menu__item"
            :class="{ 'ctx-menu__item--danger': item.danger }"
            @click="item.action"
          >
            {{ item.label }}
          </div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.file-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--sidebar-bg);

  &__header {
    padding: $spacing-sm $spacing-md;
    border-bottom: 1px solid var(--divider);
  }
  &__header-info {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    min-width: 0;
  }
  &__title {
    font-size: $font-size-lg;
    font-weight: 600;
    color: var(--text-primary);
  }
  &__count {
    font-size: $font-size-xs;
    color: var(--text-hint);
  }
  &__workspace-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
  }
  &__workspace {
    font-size: $font-size-xs;
    color: var(--text-hint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: default;
    flex: 1;
    min-width: 0;
  }
  &__dir-btn {
    font-size: $font-size-xs;
    color: var(--text-secondary);
    flex-shrink: 0;
    padding: 2px 6px;
    height: auto;
    &:hover { color: var(--primary); }
  }
  &__search {
    padding: $spacing-sm $spacing-md;
  }
  &__actions {
    padding: 0 $spacing-md $spacing-sm;
  }
  &__add-btn {
    width: 100%;
  }
  &__items {
    flex: 1;
    overflow-y: auto;
    padding: $spacing-xs 0;
  }
  &__empty {
    padding: $spacing-lg 0;
    :deep(.el-empty__description) p {
      font-size: 13px;
      color: var(--text-hint);
    }
  }
  &__empty-dir {
    padding: 4px 0 4px 52px;
    font-size: 12px;
    color: var(--text-hint);
    font-style: italic;
  }
}

// ========== 树节点 ==========

.file-list__tree-node {
  user-select: none;
}
.file-list__tree-node--nested {
  padding-left: 16px;
}
.file-list__tree-node--nested2 {
  padding-left: 32px !important;
}

.file-list__dir-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px $spacing-md 5px 8px;
  cursor: pointer;
  transition: background $transition-fast;
  &:hover {
    background: var(--hover);
  }
  &--expanded {
    background: var(--primary-container);
    .file-list__dir-name { color: var(--primary); font-weight: 600; }
  }
}
.file-list__arrow {
  font-size: 10px;
  width: 14px;
  text-align: center;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.file-list__dir-name {
  font-size: $font-size-sm;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.file-list__children {
  // children indented via nested classes above
}

.file-list__file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px $spacing-md 5px 28px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all $transition-fast;
  user-select: none;
  &:hover {
    background: var(--hover);
  }
  &--active {
    background: var(--primary-container);
    border-left-color: var(--primary);
    .file-list__file-name { color: var(--primary); font-weight: 600; }
  }
}
.file-list__file-name {
  font-size: $font-size-sm;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}
.file-list__item-icon {
  font-size: 16px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

// ========== 旧兼容样式（搜索模式） ==========
.file-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $spacing-sm $spacing-md;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all $transition-fast;
  user-select: none;
  &:hover { background: var(--hover); }
  &--active {
    background: var(--primary-container);
    border-left-color: var(--primary);
    .file-list__item-name { color: var(--primary); font-weight: 600; }
  }
}
.file-list__item-main {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  min-width: 0;
  flex: 1;
}
.file-list__item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.file-list__item-name {
  font-size: $font-size-sm;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-list__item-time {
  font-size: $font-size-xs;
  color: var(--text-hint);
  margin-top: 1px;
}
</style>

<style>
/* 右键菜单（全局样式，无 scoped 限制） */
.ctx-menu {
  position: fixed;
  z-index: 99999;
  background: var(--bg, #fff);
  border: 1px solid var(--divider, #e4e7ed);
  border-radius: 8px;
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  font-size: 13px;
}
.ctx-menu__item {
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.12s;
  color: var(--text-primary, #303133);
}
.ctx-menu__item:hover {
  background: var(--hover, #f5f7fa);
}
.ctx-menu__item--danger {
  color: var(--el-color-danger, #f56c6c);
}
.ctx-menu__item--danger:hover {
  background: #fef0f0;
}
.ctx-menu__divider {
  height: 1px;
  background: var(--divider, #e4e7ed);
  margin: 4px 0;
}
</style>
