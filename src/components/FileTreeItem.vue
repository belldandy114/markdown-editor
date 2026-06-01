<script setup lang="ts">
import { computed } from 'vue'
import type { FileTreeNode } from '@/types'
import { Document, FolderOpened } from '@element-plus/icons-vue'

const props = defineProps<{
  node: FileTreeNode
  depth: number
  activeFileId: string | null
  expandedPaths: Set<string>
  parentDir: string
}>()

const emit = defineEmits<{
  toggle: [node: FileTreeNode]
  'file-click': [node: FileTreeNode]
  contextmenu: [event: MouseEvent, node: FileTreeNode, parentDir: string]
}>()

function pathToId(filePath: string): string {
  let hash = 0
  for (let i = 0; i < filePath.length; i++) {
    hash = ((hash << 5) - hash) + filePath.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

const isExpanded = computed(() => props.expandedPaths.has(props.node.path))
const isActive = computed(() => props.node.type === 'file' && pathToId(props.node.path) === props.activeFileId)
</script>

<template>
  <div class="file-tree-node" :style="{ paddingLeft: (depth * 16) + 'px' }">
    <template v-if="node.type === 'directory'">
      <div
        class="dir-row"
        :class="{ 'dir-row--expanded': isExpanded }"
        @click="emit('toggle', node)"
        @contextmenu="emit('contextmenu', $event, node, node.path)"
      >
        <span class="dir-arrow">{{ isExpanded ? '▼' : '▶' }}</span>
        <el-icon class="node-icon"><FolderOpened /></el-icon>
        <span class="dir-name">{{ node.name }}</span>
      </div>
      <div v-if="isExpanded && node.children">
        <FileTreeItem
          v-for="child in node.children"
          :key="child.path"
          :node="child"
          :depth="depth + 1"
          :activeFileId="activeFileId"
          :expandedPaths="expandedPaths"
          :parentDir="node.path"
          @toggle="(...args) => emit('toggle', ...args)"
          @file-click="(...args) => emit('file-click', ...args)"
          @contextmenu="(...args) => emit('contextmenu', ...args)"
        />
        <div v-if="node.children.length === 0" class="empty-dir-hint">
          空文件夹
        </div>
      </div>
    </template>
    <template v-else>
      <div
        class="file-row"
        :class="{ 'file-row--active': isActive }"
        @click="emit('file-click', node)"
        @contextmenu="emit('contextmenu', $event, node, parentDir)"
      >
        <el-icon class="node-icon"><Document /></el-icon>
        <span class="file-name">{{ node.name }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.file-tree-node {
  user-select: none;
}

/* 目录行 */
.dir-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px 5px 8px;
  cursor: pointer;
  border-radius: 4px;
  margin: 1px 4px;
  transition: background 0.15s;
}
.dir-row:hover {
  background: var(--hover);
}
.dir-row--expanded {
  background: var(--primary-container);
}
.dir-row--expanded .dir-name {
  color: var(--primary);
  font-weight: 600;
}

.dir-arrow {
  font-size: 10px;
  width: 14px;
  text-align: center;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.dir-name {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

/* 文件行 */
.file-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 5px 26px;
  cursor: pointer;
  border-left: 3px solid transparent;
  border-radius: 0 4px 4px 0;
  margin: 1px 0;
  transition: all 0.15s;
}
.file-row:hover {
  background: var(--hover);
}
.file-row--active {
  background: var(--primary-container);
  border-left-color: var(--primary);
}
.file-row--active .file-name {
  color: var(--primary);
  font-weight: 600;
}

.file-name {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.node-icon {
  font-size: 16px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

/* 空文件夹提示 */
.empty-dir-hint {
  padding: 4px 0 4px 36px;
  font-size: 12px;
  color: var(--text-hint);
  font-style: italic;
}
</style>
