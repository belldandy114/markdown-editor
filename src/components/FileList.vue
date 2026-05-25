<script setup lang="ts">
import { computed } from 'vue'
import { useMarkdownFiles } from '@/composables/useMarkdownFiles'
import {
  Plus,
  Delete,
  Edit,
  Document,
  Search,
  FolderOpened,
} from '@element-plus/icons-vue'

const {
  filteredFiles,
  activeFileId,
  searchQuery,
  workspaceDir,
  selectFile,
  createFile,
  deleteFile,
  renameFile,
  switchWorkspace,
  loading,
} = useMarkdownFiles()

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function stopProp(e: MouseEvent): void {
  e.stopPropagation()
}
function openFileLocation(file: any): void {
  if (file.path && window.electronAPI?.showInFolder) {
    window.electronAPI.showInFolder(file.path)
  }
}
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
          📁 {{ workspaceDir?.split('\\')?.pop() || '未选择目录' }}
        </div>
        <el-button text size="small" class="file-list__dir-btn" @click="switchWorkspace()">
          📂 更改目录
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

    <!-- 文件列表 -->
    <div class="file-list__items">
      <div
        v-for="file in filteredFiles"
        :key="file.id"
        class="file-list__item"
        :class="{ 'file-list__item--active': file.id === activeFileId }"
        @click="selectFile(file.id)"
      >
        <div class="file-list__item-main">
          <el-icon class="file-list__item-icon">
            <Document />
          </el-icon>
          <div class="file-list__item-info">
            <span class="file-list__item-name">{{ file.name }}</span>
            <span class="file-list__item-time">{{ formatTime(file.updatedAt) }}</span>
          </div>
        </div>

        <div class="file-list__item-actions" @click="stopProp">
          <el-button
            text
            size="small"
            :icon="Edit"
            class="file-list__action-btn"
            @click="renameFile(file.id)"
          />
          <el-button
            v-if="file.path"
            text
            size="small"
            class="file-list__action-btn"
            title="打开文件位置"
            @click.stop="openFileLocation(file)"
          >📍</el-button>
          <el-button
            text
            size="small"
            type="danger"
            :icon="Delete"
            class="file-list__action-btn"
            @click="deleteFile(file.id)"
          />
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="filteredFiles.length === 0" class="file-list__empty">
        <el-empty :image-size="80">
          <template #description>
            <p v-if="loading">正在加载...</p>
            <p v-else>暂无文件，点击上方「新建文件」开始</p>
          </template>
        </el-empty>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.file-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--sidebar-bg);
  border-right: 1px solid var(--divider);

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

  &__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-sm $spacing-md;
    cursor: pointer;
    border-left: 3px solid transparent;
    transition: all $transition-fast;
    user-select: none;

    &:hover {
      background: var(--hover);

      .file-list__item-actions {
        opacity: 1;
      }
    }

    &--active {
      background: var(--primary-container);
      border-left-color: var(--primary);

      .file-list__item-name {
        color: var(--primary);
        font-weight: 600;
      }
    }
  }

  &__item-main {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    min-width: 0;
    flex: 1;
  }

  &__item-icon {
    font-size: 18px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  &__item-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  &__item-name {
    font-size: $font-size-sm;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__item-time {
    font-size: $font-size-xs;
    color: var(--text-hint);
    margin-top: 1px;
  }

  &__item-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity $transition-fast;
    flex-shrink: 0;
  }

  &__action-btn {
    font-size: 14px;
    padding: 4px;
  }

  &__empty {
    padding: $spacing-xl 0;
  }
}
</style>
