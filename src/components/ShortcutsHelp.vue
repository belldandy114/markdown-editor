<template>
  <Teleport to="body">
    <div v-if="visible" class="shortcuts-overlay" @click.self="close">
      <div class="shortcuts-modal">
        <div class="shortcuts-header">
          <span class="shortcuts-title">⌨️ 快捷键速查</span>
          <el-button size="small" text @click="close">✕</el-button>
        </div>
        <div class="shortcuts-body">
          <div v-for="group in shortcutGroups" :key="group.name" class="shortcut-group">
            <div class="shortcut-group__title">{{ group.name }}</div>
            <div v-for="item in group.items" :key="item.keys" class="shortcut-row">
              <span class="shortcut-row__desc">{{ item.desc }}</span>
              <span class="shortcut-row__keys">
                <kbd v-for="k in item.keys.split(' ')" :key="k">{{ k }}</kbd>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()
function close() { emit('close') }

interface ShortcutItem { desc: string; keys: string }
interface ShortcutGroup { name: string; items: ShortcutItem[] }

const shortcutGroups: ShortcutGroup[] = [
  {
    name: '文件操作',
    items: [
      { desc: '新建文件', keys: 'Ctrl N' },
      { desc: '保存', keys: 'Ctrl S' },
      { desc: '切换工作目录', keys: 'Ctrl O' },
      { desc: '查找', keys: 'Ctrl F' },
      { desc: '替换', keys: 'Ctrl H' },
    ],
  },
  {
    name: '编辑',
    items: [
      { desc: '撤销', keys: 'Ctrl Z' },
      { desc: '重做', keys: 'Ctrl Y' },
      { desc: '复制行', keys: 'Ctrl D' },
      { desc: '清除样式', keys: 'Ctrl Shift C' },
      { desc: '移除空行', keys: 'Ctrl Shift E' },
      { desc: '删除重复行', keys: 'Ctrl Shift D' },
    ],
  },
  {
    name: '格式',
    items: [
      { desc: '加粗', keys: 'Ctrl B' },
      { desc: '斜体', keys: 'Ctrl I' },
      { desc: '删除线', keys: 'Ctrl Shift S' },
      { desc: '行内代码', keys: 'Ctrl `' },
      { desc: '标题 1-6', keys: 'Ctrl 1-6' },
      { desc: '段落', keys: 'Ctrl 0' },
      { desc: '链接', keys: 'Ctrl K' },
      { desc: '图片', keys: 'Ctrl Shift I' },
      { desc: '代码块', keys: 'Ctrl Shift K' },
      { desc: '公式', keys: 'Ctrl Shift M' },
      { desc: '分割线', keys: 'Ctrl Shift H' },
    ],
  },
  {
    name: '列表',
    items: [
      { desc: '无序列表', keys: 'Ctrl Shift U' },
      { desc: '有序列表', keys: 'Ctrl Shift O' },
      { desc: '任务列表', keys: 'Ctrl Shift T' },
      { desc: '引用', keys: 'Ctrl Shift Q' },
    ],
  },
  {
    name: '视图',
    items: [
      { desc: '编辑模式', keys: 'Ctrl Shift !' },
      { desc: '预览模式', keys: 'Ctrl Shift V' },
      { desc: '分栏模式', keys: 'Ctrl Shift X' },
    ],
  },
  {
    name: '导出',
    items: [
      { desc: '导出 HTML', keys: 'Ctrl Shift H' },
      { desc: '导出 PDF', keys: 'Ctrl Shift P' },
      { desc: '导出图像', keys: 'Ctrl Shift G' },
      { desc: '上次设置导出', keys: 'Ctrl Shift E' },
      { desc: '覆盖上次导出', keys: 'Ctrl Shift O' },
    ],
  },
]
</script>

<style scoped lang="scss">
.shortcuts-overlay {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}
.shortcuts-modal {
  width: 520px;
  max-height: 80vh;
  background: var(--surface);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.shortcuts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--divider);
}
.shortcuts-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.shortcuts-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.shortcut-group {
  margin-bottom: 16px;
  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--primary);
    margin-bottom: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--divider);
  }
}
.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 4px;
  &__desc {
    font-size: 13px;
    color: var(--text-primary);
  }
  &__keys {
    display: flex;
    gap: 4px;
    kbd {
      display: inline-block;
      padding: 2px 6px;
      font-size: 11px;
      font-family: var(--font-family-mono, monospace);
      color: var(--text-secondary);
      background: var(--bg);
      border: 1px solid var(--divider);
      border-radius: 4px;
      min-width: 20px;
      text-align: center;
    }
  }
}
</style>
