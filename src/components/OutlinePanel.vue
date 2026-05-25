<script setup lang="ts">
import { computed } from 'vue'
import { useMarkdownFiles } from '@/composables/useMarkdownFiles'

interface HItem { level: number; text: string; anchorId: string }

const { activeFile } = useMarkdownFiles()

const headings = computed<HItem[]>(() => {
  if (!activeFile.value?.content) return []
  return activeFile.value.content.split('\n')
    .map((l) => l.match(/^(#{1,6})\s+(.+)$/))
    .filter(Boolean)
    .map((m) => ({
      level: m![1].length,
      text: m![2],
      anchorId: m![2].toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, ''),
    }))
})

function scrollTo(id: string): void {
  const preview = document.querySelector('.preview-panel__content.markdown-body')
  if (preview) {
    const el = preview.querySelector(`#${CSS.escape(id)}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const ta = document.querySelector('.editor-panel .ta') as HTMLTextAreaElement | null
  if (ta && activeFile.value?.content) {
    const lines = activeFile.value.content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^#{1,6}\s+(.+)$/)
      if (m) {
        const h = m[1].toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '')
        if (h === id) { ta.scrollTop = Math.max(0, i * 22 - 100); break }
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
