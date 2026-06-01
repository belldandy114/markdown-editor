<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMarkdownFiles } from '@/composables/useMarkdownFiles'

interface HItem { level: number; text: string; anchorId: string }

const { activeFile, jumpToHeading } = useMarkdownFiles()

// 使用一个内部 ref 显式追踪内容变化，确保 computed 在内容首次载入时也能触发
const contentSnapshot = ref('')
// 高亮超时句柄，用于多次点击时清除上一次的定时器
let _highlightTimer: ReturnType<typeof setTimeout> | null = null

watch(() => activeFile.value?.content ?? '', (val) => {
  contentSnapshot.value = val
}, { immediate: true })

const headings = computed<HItem[]>(() => {
  const c = contentSnapshot.value
  if (!c) return []
  return c.split('\n')
    .map((l) => l.match(/^(#{1,6})\s+(.+)$/))
    .filter(Boolean)
    .map((m) => ({
      level: m![1].length,
      text: m![2],
      anchorId: m![2].toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, ''),
    }))
})

function scrollTo(id: string): void {
  // 预览高亮：滚动 + 临时高亮样式
  const previewPanel = document.querySelector('.preview-panel__content.markdown-body')
  if (previewPanel) {
    const el = previewPanel.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      // 清除上一次的高亮定时器，避免多次点击导致高亮提前消失
      if (_highlightTimer) clearTimeout(_highlightTimer)
      el.classList.add('outline-highlight')
      _highlightTimer = setTimeout(() => {
        el.classList.remove('outline-highlight')
        _highlightTimer = null
      }, 2000)
    }
  }
  // 编辑器跳转：通过 composable 的 jumpToHeading 回调系统协调
  // 由 MarkdownEditor 内部的 onHeadingJump 回调处理滚动（不抢焦点）
  jumpToHeading(id)
}
</script>

<template>
  <div class="outline-panel">
    <div class="outline-panel__header">
      <span class="outline-panel__title">大纲</span>
      <span class="outline-panel__count">{{ headings.length }} 项</span>
    </div>
    <div class="outline-panel__body">
      <template v-if="headings.length">
        <div v-for="(h, i) in headings" :key="i"
          class="outline-item" :style="{ paddingLeft: (h.level - 1) * 16 + 12 + 'px' }"
          :class="'outline-item--h' + h.level" :title="h.text" @click="scrollTo(h.anchorId)">
          <span class="outline-item__text">{{ h.text }}</span>
        </div>
      </template>
      <div v-else class="outline-empty">当前文档没有标题</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.outline-panel{display:flex;flex-direction:column;height:100%;background:var(--sidebar-bg);border-right:1px solid var(--divider)}
.outline-panel__header{display:flex;align-items:center;justify-content:space-between;padding:$spacing-md;height:56px;border-bottom:1px solid var(--divider)}
.outline-panel__title{font-size:$font-size-lg;font-weight:600;color:var(--text-primary)}
.outline-panel__count{font-size:$font-size-xs;color:var(--text-hint)}
.outline-panel__body{flex:1;overflow-y:auto;padding:$spacing-md 0}
.outline-item{padding:6px $spacing-md;cursor:pointer;border-left:2px solid transparent;transition:all $transition-fast;user-select:none;
  &:hover{background:var(--hover);border-left-color:var(--primary)}
  &__text{font-size:$font-size-sm;color:var(--text-primary);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  &--h1{font-weight:600;font-size:15px}
  &--h2{font-weight:600;font-size:14px}
  &--h3,&--h4,&--h5,&--h6{font-weight:500;font-size:13px}}
.outline-empty{display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-hint);font-size:$font-size-sm}
</style>

<style>
/* 预览区域标题高亮动画（全局样式，因为 .markdown-body 可能在组件外） */
.outline-highlight {
  animation: outline-highlight-pulse 2s ease-out;
  border-radius: 4px;
}
@keyframes outline-highlight-pulse {
  0%   { background-color: rgba(64, 158, 255, 0.3); box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2); }
  50%  { background-color: rgba(64, 158, 255, 0.15); box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.1); }
  100% { background-color: transparent; box-shadow: none; }
}
</style>
