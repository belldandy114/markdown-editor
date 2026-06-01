<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useMarkdownFiles } from '@/composables/useMarkdownFiles'
import { ElMessageBox } from 'element-plus'
import type { FileTreeNode } from '@/types'
import FileTreeItem from '@/components/FileTreeItem.vue'
import {
  Plus,
  Document,
  FolderOpened,
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
  deleteFileByPath,
  renameFileByPath,
  deleteFile,
  renameFile,
  switchWorkspace,
  toggleExpand,
  expandedPaths,
  loading,
  treeLoading,
} = useMarkdownFiles()

// ========== 排序 ==========
type SortBy = 'name' | 'time'
const sortBy = ref<SortBy>('name')
const sortAsc = ref(true)
function toggleSort(by: SortBy) {
  if (sortBy.value === by) {
    sortAsc.value = !sortAsc.value
  } else {
    sortBy.value = by
    sortAsc.value = by === 'name'
  }
}

// ========== 右键菜单 ==========

interface CtxMenu {
  visible: boolean
  x: number
  y: number
  node: FileTreeNode | null
  parentDir: string
}

const ctxMenu = ref<CtxMenu>({
  visible: false, x: 0, y: 0, node: null, parentDir: '',
})

function showCtxMenu(e: MouseEvent, node: FileTreeNode, parentDir: string) {
  e.preventDefault()
  e.stopPropagation()

  // 计算菜单位置，防止溢出
  const menuW = 180
  const menuH = node.type === 'directory' ? 180 : 220
  let x = e.clientX
  let y = e.clientY
  if (x + menuW > window.innerWidth) x = window.innerWidth - menuW - 8
  if (y + menuH > window.innerHeight) y = window.innerHeight - menuH - 8

  ctxMenu.value = { visible: true, x, y, node, parentDir }
}

function hideCtxMenu() { ctxMenu.value.visible = false }

function onDocumentClick() { if (ctxMenu.value.visible) hideCtxMenu() }

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))

// ========== 上下文菜单操作 ==========
async function contextCreateFile(targetDir: string) {
  hideCtxMenu()
  try {
    const { value } = await ElMessageBox.prompt('请输入文件名', '新建文件', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /^.+\.md$/,
      inputErrorMessage: '文件名必须以 .md 结尾',
    })
    if (value) {
      await createFile(value, targetDir)
    }
  } catch {
    // 用户取消
  }
}

const ctxActions = computed(() => {
  const n = ctxMenu.value.node
  if (!n) return []
  if (n.type === 'directory') {
    return [
      { label: '📄 新建文件', action: () => { contextCreateFile(n.path) } },
      { label: '📁 新建文件夹', action: () => { hideCtxMenu(); createDir(n.path) } },
      { type: 'divider' as const },
      { label: '📂 打开文件所在位置', action: () => { hideCtxMenu(); window.electronAPI?.showInFolder(n.path) } },
      { type: 'divider' as const },
      { label: '🗑️ 删除文件夹', danger: true, action: () => { hideCtxMenu(); deleteDirFromTree(n.path) } },
    ]
  }
  return [
    { label: '📄 新建文件', action: () => { contextCreateFile(ctxMenu.value.parentDir) } },
    { label: '📄 复制文件', action: () => { hideCtxMenu(); copyFileItem(n.path) } },
    { label: '✏️ 重命名', action: () => { hideCtxMenu(); renameFileByPath(n.path) } },
    { type: 'divider' as const },
    { label: '📂 打开文件所在位置', action: () => { hideCtxMenu(); window.electronAPI?.showInFolder(n.path) } },
    { type: 'divider' as const },
    { label: '🗑️ 删除', danger: true, action: () => { hideCtxMenu(); deleteFileByPath(n.path) } },
  ]
})

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

function isExpanded(path: string): boolean { return expandedPaths.value.has(path) }

function onFileClick(node: FileTreeNode) { openFileByPath(node.path) }
function onDirClick(node: FileTreeNode) { toggleExpand(node.path) }

// ========== 搜索：遍历整个树构建可搜索列表 ==========

/** 从树节点递归收集所有 md 文件 */
function collectTreeFiles(nodes: FileTreeNode[]): { path: string; name: string; updatedAt?: number }[] {
  const result: { path: string; name: string; updatedAt?: number }[] = []
  for (const n of nodes) {
    if (n.type === 'file') {
      result.push({ path: n.path, name: n.name, updatedAt: n.updatedAt })
    } else if (n.children) {
      result.push(...collectTreeFiles(n.children))
    }
  }
  return result
}

/** 全部文件（树中所有文件） */
const allTreeFiles = computed(() => collectTreeFiles(treeData.value))

/** 排序后的全部文件 */
const sortedTreeFiles = computed(() => {
  const list = [...allTreeFiles.value]
  if (sortBy.value === 'name') {
    list.sort((a, b) => sortAsc.value ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name))
  } else {
    list.sort((a, b) => sortAsc.value
      ? (a.updatedAt || 0) - (b.updatedAt || 0)
      : (b.updatedAt || 0) - (a.updatedAt || 0))
  }
  return list
})

/** 搜索结果 */
const searchResults = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return []
  return sortedTreeFiles.value.filter(f => f.name.toLowerCase().includes(q))
})

function onSearchResultClick(f: { path: string }) {
  openFileByPath(f.path)
}

// ========== 树形排序：将 treeData 按当前排序设置递归排序 ==========

function sortTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  const sorted = [...nodes]
  sorted.sort((a, b) => {
    // 目录始终排在文件前面
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    if (sortBy.value === 'name') {
      return sortAsc.value
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name)
    }
    // 按时间排序
    const ta = a.updatedAt || 0
    const tb = b.updatedAt || 0
    return sortAsc.value ? ta - tb : tb - ta
  })
  // 递归排序子节点
  return sorted.map(n => {
    if (n.type === 'directory' && n.children) {
      return { ...n, children: sortTreeNodes(n.children) }
    }
    return n
  })
}

const sortedTreeData = computed(() => sortTreeNodes(treeData.value))

// ========== 排序按钮文本 ==========

const sortLabel = computed(() => {
  const label = sortBy.value === 'name' ? '名称' : '时间'
  const arrow = sortAsc.value ? '↑' : '↓'
  return `${label} ${arrow}`
})


</script>

<template>
  <div class="file-list">
    <!-- 头部 -->
    <div class="file-list__header">
      <div class="file-list__header-info">
        <span class="file-list__title">文件列表</span>
        <span class="file-list__count">{{ sortedTreeFiles.length }} 项</span>
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

    <!-- 新建 + 排序 -->
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
      <div class="file-list__sort-row">
        <span class="file-list__sort-label" @click="toggleSort('name')"
          :class="{ 'file-list__sort-label--active': sortBy === 'name' }">
          名称{{ sortBy === 'name' ? (sortAsc ? ' ↑' : ' ↓') : '' }}
        </span>
        <span class="file-list__sort-label" @click="toggleSort('time')"
          :class="{ 'file-list__sort-label--active': sortBy === 'time' }">
          时间{{ sortBy === 'time' ? (sortAsc ? ' ↑' : ' ↓') : '' }}
        </span>
      </div>
    </div>

    <!-- 内容 -->
    <div class="file-list__items">
      <!-- 搜索模式 -->
      <template v-if="searchQuery.trim()">
        <div
          v-for="f in searchResults"
          :key="f.path"
          class="file-list__file-row"
          :class="{ 'file-list__file-row--active': pathToId(f.path) === activeFileId }"
          @click="onSearchResultClick(f)"
        >
          <el-icon class="file-list__item-icon"><Document /></el-icon>
          <span class="file-list__file-name">{{ f.name }}</span>
          <span class="file-list__item-time" v-if="f.updatedAt">{{ formatTime(f.updatedAt) }}</span>
        </div>
        <div v-if="searchResults.length === 0" class="file-list__empty">
          未找到匹配的文件
        </div>
      </template>

      <!-- 树形模式 -->
      <template v-else>
        <template v-if="treeLoading">
          <div class="file-list__empty">加载中...</div>
        </template>
        <template v-else>
          <!-- 递归渲染树节点（按当前排序设置） -->
          <template v-for="node in sortedTreeData" :key="node.path">
            <FileTreeItem
              :node="node"
              :depth="0"
              :activeFileId="activeFileId"
              :expandedPaths="expandedPaths"
              :parentDir="workspaceDir"
              @toggle="onDirClick"
              @file-click="onFileClick"
              @contextmenu="showCtxMenu"
            />
          </template>
        </template>
      </template>

      <!-- 空状态 -->
      <div v-if="!treeLoading && treeData.length === 0 && !searchQuery.trim()" class="file-list__empty">
        <el-empty :image-size="60">
          <template #description>
            <template v-if="!window?.electronAPI">
              <p>Electron API 未连接</p>
              <p style="font-size:12px;color:var(--text-hint);margin-top:4px">请通过 Electron 环境运行此应用</p>
            </template>
            <template v-else>
              <p>暂无文件，点击上方「新建文件」开始</p>
            </template>
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

<!-- 原普通< script>块中的 FileTreeItem 已迁移到 <script setup> 中 -->

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
  &__title { font-size: $font-size-lg; font-weight: 600; color: var(--text-primary); }
  &__count { font-size: $font-size-xs; color: var(--text-hint); }
  &__workspace-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
  }
  &__workspace {
    font-size: $font-size-xs; color: var(--text-hint);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    cursor: default; flex: 1; min-width: 0;
  }
  &__dir-btn {
    font-size: $font-size-xs; color: var(--text-secondary);
    flex-shrink: 0; padding: 2px 6px; height: auto;
    &:hover { color: var(--primary); }
  }
  &__search { padding: $spacing-sm $spacing-md; }
  &__actions {
    padding: 0 $spacing-md $spacing-sm;
    display: flex; flex-direction: column; gap: 4px;
  }
  &__add-btn { width: 100%; }
  &__sort-row {
    display: flex; gap: 8px; justify-content: flex-end;
  }
  &__sort-label {
    font-size: 11px; color: var(--text-hint); cursor: pointer;
    padding: 2px 6px; border-radius: 4px; user-select: none;
    &:hover { color: var(--primary); background: var(--hover); }
    &--active { color: var(--primary); font-weight: 600; background: var(--primary-container); }
  }
  &__items {
    flex: 1; overflow-y: auto; padding: $spacing-xs 0;
  }
  &__empty {
    padding: $spacing-lg 0;
    :deep(.el-empty__description) p { font-size: 13px; color: var(--text-hint); }
  }
  &__empty-dir {
    padding: 4px 0 4px 28px; font-size: 12px; color: var(--text-hint); font-style: italic;
  }
}

// ========== 树节点 ==========

.file-tree-node { user-select: none; }

.file-list__dir-row {
  display: flex; align-items: center; gap: 4px;
  padding: 5px $spacing-md 5px 8px;
  cursor: pointer; transition: background $transition-fast;
  &:hover { background: var(--hover); }
  &--expanded {
    background: var(--primary-container);
    .file-list__dir-name { color: var(--primary); font-weight: 600; }
  }
}
.file-list__arrow {
  font-size: 10px; width: 14px; text-align: center;
  color: var(--text-secondary); flex-shrink: 0;
}
.file-list__dir-name {
  font-size: $font-size-sm; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;
}
.file-list__file-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px $spacing-md 5px 28px;
  cursor: pointer; border-left: 3px solid transparent;
  transition: all $transition-fast; user-select: none;
  &:hover { background: var(--hover); }
  &--active {
    background: var(--primary-container); border-left-color: var(--primary);
    .file-list__file-name { color: var(--primary); font-weight: 600; }
  }
}
.file-list__file-name {
  font-size: $font-size-sm; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;
}
.file-list__item-icon {
  font-size: 16px; color: var(--text-secondary); flex-shrink: 0;
}
.file-list__item-time {
  font-size: 11px; color: var(--text-hint); flex-shrink: 0; margin-left: auto; padding-right: 4px;
}
</style>

<style>
/* 右键菜单（全局样式） */
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
.ctx-menu__item:hover { background: var(--hover, #f5f7fa); }
.ctx-menu__item--danger { color: var(--el-color-danger, #f56c6c); }
.ctx-menu__item--danger:hover { background: #fef0f0; }
.ctx-menu__divider {
  height: 1px;
  background: var(--divider, #e4e7ed);
  margin: 4px 0;
}
</style>