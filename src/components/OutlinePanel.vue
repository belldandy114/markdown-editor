<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMarkdownFiles } from '@/composables/useMarkdownFiles'

interface HItem { level: number; text: string; anchorId: string }

const { activeFile } = useMarkdownFiles()

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

/** 根据 heading anchorId 查找该标题在 DOM 中的位置偏移 */
function findHeadingOffset(container: Element, id: string): number {
  const el = container.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null
  if (!el) return -1
  // 计算该元素相对于可滚动容器的 offsetTop
  let offset = el.offsetTop
  let parent = el.offsetParent
  while (parent && parent !== container) {
    offset += (parent as HTMLElement).offsetTop || 0
    parent = (parent as HTMLElement).offsetParent
  }
  return offset
}

function scrollTo(id: string): void {
  // 预览滚动 + 高亮（用 scrollTop 避免 scrollIntoView 对页面布局的副作用）
  const previewPanel = document.querySelector('.preview-panel__content.markdown-body') as HTMLElement | null
  if (previewPanel) {
    const offset = findHeadingOffset(previewPanel, id)
    if (offset >= 0) {
      previewPanel.scrollTop = Math.max(0, offset - 60)
      // 高亮
      const el = previewPanel.querySelector(`#${CSS.escape(id)}`) as HTMLElement | null
      if (el) {
        if (_highlightTimer) clearTimeout(_highlightTimer)
        el.classList.add('outline-highlight')
        _highlightTimer = setTimeout(() => {
          el.classList.remove('outline-highlight')
          _highlightTimer = null
        }, 2000)
      }
    }
  }
  // 编辑器滚动：直接操作 DOM 滚动 textarea，不调用 focus（抢焦点会导致顶部导航消失）
  const ta = document.querySelector('.editor-panel .ta') as HTMLTextAreaElement | null
  if (ta && activeFile.value?.content) {
    const lines = activeFile.value.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(#{1,6})\s+(.+)$/)
      if (m) {
        const h = m[2].toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '')
        if (h === id) {
          ta.scrollTop = Math.max(0, i * 22 - 100)
          break
        }
      }
    }
  }
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
