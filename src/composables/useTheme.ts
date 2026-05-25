import { ref, watch, onMounted } from 'vue'
import type { ThemeMode } from '@/types'

const STORAGE_KEY = 'markdown-editor-theme'

/** 主题管理组合式函数 */
export function useTheme() {
  const theme = ref<ThemeMode>('light')

  /** 应用主题到 html 标签 */
  function applyTheme(mode: ThemeMode): void {
    const html = document.documentElement
    if (mode === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
    html.setAttribute('data-theme', mode)
  }

  /** 切换主题 */
  function toggleTheme(): void {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
  }

  /** 设置指定主题 */
  function setTheme(mode: ThemeMode): void {
    theme.value = mode
  }

  // 监听主题变化
  watch(theme, (newVal) => {
    applyTheme(newVal)
    localStorage.setItem(STORAGE_KEY, newVal)
  })

  // 初始化
  onMounted(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial = saved || (prefersDark ? 'dark' : 'light')
    theme.value = initial
    applyTheme(initial)
  })

  return {
    theme,
    toggleTheme,
    setTheme,
  }
}
