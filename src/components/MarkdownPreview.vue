<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/atom-one-dark.css'
import TurndownService from 'turndown'
import mermaid from 'mermaid'

import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import java from 'highlight.js/lib/languages/java'
import cpp from 'highlight.js/lib/languages/cpp'
import sql from 'highlight.js/lib/languages/sql'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('css', css)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('json', json)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('java', java)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', cpp)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)

// 初始化 mermaid（暗色主题适配）
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: 'var(--font-family, sans-serif)',
})

import { ElMessage } from 'element-plus'
import { useMarkdownFiles } from '@/composables/useMarkdownFiles'

const { activeFile, updateContent, editorScrollRatio, setEditorScrollRatio, previewScrollRatio, setPreviewScrollRatio, lockScroll, isLocked, onHeadingJump, removeHeadingJump, workspaceDir } = useMarkdownFiles()

const previewRef = ref<HTMLDivElement | null>(null)
const wysiwygRef = ref<HTMLDivElement | null>(null)
const renderedHtml = ref('')
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const isEditing = ref(false)

// ========== Turndown: HTML → Markdown ==========

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  bulletListMarker: '-',
  linkStyle: 'inlined',
})

// 自定义规则：处理 .code-block（带语言标签的代码块）
turndownService.addRule('codeBlock', {
  filter: (node) => {
    return node.nodeName === 'DIV' && (node as HTMLElement).classList?.contains('code-block')
  },
  replacement: (content, node) => {
    const langEl = (node as HTMLElement).querySelector('.code-lang')
    const lang = langEl?.textContent?.trim() || ''
    // 找到 pre > code 的实际代码内容
    const codeEl = (node as HTMLElement).querySelector('pre code')
    const code = codeEl?.textContent || (node as HTMLElement).querySelector('pre')?.textContent || content
    const fence = '```'
    return '\n' + fence + lang + '\n' + code + '\n' + fence + '\n'
  }
})

// 自定义规则：处理任务列表
turndownService.addRule('taskList', {
  filter: (node) => {
    return node.nodeName === 'LI' && (node as HTMLElement).querySelector('input[type="checkbox"]') !== null
  },
  replacement: (content, node) => {
    const input = (node as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement | null
    const checked = input?.checked ? 'x' : ' '
    // 去掉开头的 checkbox span
    let text = content.replace(/^☑|^☐/, '').trim()
    if (!text) text = (node.textContent || '').replace(/☑|☐/g, '').trim()
    return '- [' + checked + '] ' + text + '\n'
  }
})

// 自定义规则：图片保留原始 alt 和 src
turndownService.addRule('images', {
  filter: 'img',
  replacement: (content, node) => {
    const el = node as HTMLImageElement
    const alt = el.getAttribute('alt') || ''
    const src = el.getAttribute('src') || ''
    const title = el.getAttribute('title') || ''
    const titlePart = title ? ` "${title}"` : ''
    return `![${alt}](${src}${titlePart})`
  }
})

// 自动链接：保留原始链接文本
turndownService.addRule('strikethrough', {
  filter: ['del', 's', 'strike'],
  replacement: (content) => '~~' + content + '~~'
})

// ========== Markdown 渲染 ==========

marked.setOptions({ gfm: true, breaks: true })
const renderer = new marked.Renderer()

renderer.heading = function ({ text, depth }) {
  const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fff-]/g, '')
  return `<h${depth} id="${id}">${text}</h${depth}>`
}
renderer.code = function ({ text, lang }) {
  const language = lang || ''
  const validLang = language && hljs.getLanguage(language)
  let highlighted: string
  try { if (validLang) highlighted = hljs.highlight(text, { language }).value; else highlighted = hljs.highlightAuto(text).value }
  catch { highlighted = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
  const langLabel = language ? `<span class="code-lang">${language}</span>` : ''
  return `<div class="code-block"><div class="code-block__header">${langLabel}</div><pre><code class="${validLang?'language-'+language:''}">${highlighted}</code></pre></div>`
}
renderer.link = function ({ href, text }) { return `<a href="${href}">${text}</a>` }
// 图片渲染：本地相对路径转为 file:// 绝对路径（预览显示粘贴的图片）
renderer.image = function ({ href, title, text }) {
  let src = href
  if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('file:') && !src.startsWith('/')) {
    // 相对路径 → 基于工作目录解析为 file:// 绝对路径
    const base = workspaceDir.value?.replace(/\\/g, '/') || ''
    src = `file:///${base}/${src.replace(/^\.\//, '')}`
  }
  const titleAttr = title ? ` title="${title}"` : ''
  return `<img src="${src}" alt="${text || ''}"${titleAttr} />`
}
renderer.table = function ({ header, rows }) { let h='<div class="table-wrapper"><table><thead><tr>';for(const c of header)h+=`<th>${c.text}</th>`;h+='</tr></thead><tbody>';for(const r of rows){h+='<tr>';for(const c of r)h+=`<td>${c.text}</td>`;h+='</tr>'};h+='</tbody></table></div>';return h }
renderer.checkbox = function (checked) { return checked?'<span class="task-checked">☑</span> ':'<span class="task-unchecked">☐</span> ' }
marked.use({ renderer })

async function compile(c: string) {
  if (!c) {
    renderedHtml.value = '<div class="preview-empty"><div class="preview-empty__icon">📝</div><p>点击编辑</p></div>'
    return
  }
  try {
    renderedHtml.value = marked.parse(c) as string
    // 渲染 Mermaid 图表
    await renderMermaidDiagrams()
  } catch {
    renderedHtml.value = '<p class="preview-error">渲染错误</p>'
  }
}

/** 查找并渲染所有 Mermaid 代码块 */
let _mermaidId = 0
async function renderMermaidDiagrams(): Promise<void> {
  if (!previewRef.value) return
  const mermaidBlocks = previewRef.value.querySelectorAll<HTMLElement>('.code-block .code-lang')
  const pending: Promise<void>[] = []
  for (const langEl of mermaidBlocks) {
    if (langEl.textContent?.trim().toLowerCase() !== 'mermaid') continue
    const codeBlock = langEl.closest('.code-block') as HTMLElement | null
    if (!codeBlock || codeBlock.dataset.mermaidRendered) continue
    codeBlock.dataset.mermaidRendered = 'true'
    const codeEl = codeBlock.querySelector('pre code')
    if (!codeEl) continue
    const rawCode = codeEl.textContent || ''
    if (!rawCode.trim()) continue
    // 解码 HTML 实体
    const decoded = rawCode.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    const id = `mermaid-${++_mermaidId}`
    pending.push(
      mermaid.render(id, decoded).then(({ svg }) => {
        const wrapper = document.createElement('div')
        wrapper.className = 'mermaid-wrapper'
        wrapper.innerHTML = svg
        // 保留语言标签，替换 pre
        const header = codeBlock.querySelector('.code-block__header')
        const pre = codeBlock.querySelector('pre')
        if (pre && header) {
          pre.replaceWith(wrapper)
        } else {
          codeBlock.innerHTML = ''
          codeBlock.appendChild(header || document.createComment(''))
          codeBlock.appendChild(wrapper)
        }
      }).catch((e) => {
        console.warn('[Mermaid] 渲染失败:', e)
        codeBlock.classList.add('mermaid-error')
        const pre = codeBlock.querySelector('pre')
        if (pre) {
          const errDiv = document.createElement('div')
          errDiv.className = 'mermaid-error-msg'
          errDiv.textContent = '流程图渲染失败: ' + (e?.message || String(e))
          pre.insertAdjacentElement('afterend', errDiv)
        }
      })
    )
  }
  await Promise.all(pending)
}
function debouncedCompile(c:string){
  if(debounceTimer.value)clearTimeout(debounceTimer.value)
  debounceTimer.value=setTimeout(()=>compile(c),100)
}

/** 进入编辑时的 innerHTML 快照 + 原始 markdown（用于检测用户是否真正改了内容） */
let _htmlSnapshot = ''
let _originalContent = ''

/** 比较两个 HTML 是否本质相同（忽略浏览器规范化导致的空白与属性顺序差异） */
function htmlEqualsNorm(a: string, b: string): boolean {
  // 只比较标签结构和文本内容，忽略所有属性值
  const stripAttr = (s: string) => s.replace(/\s+\w+(=(['"]).*?\2)?/g, '').replace(/\s+/g, '')
  return stripAttr(a) === stripAttr(b)
}

/** 将当前 wysiwyg 编辑器的 HTML 转回 Markdown 并同步 */
function syncWysiwygToMarkdown(): void {
  if (!wysiwygRef.value || !activeFile.value) return
  const html = wysiwygRef.value.innerHTML

  // 与进入编辑时的快照比较：如果 HTML 没有实质性变化，直接恢复原始 markdown
  // 避免 turndown 转义/规范化导致的多余字符
  if (htmlEqualsNorm(html, _htmlSnapshot)) {
    if (activeFile.value.content !== _originalContent) {
      updateContent(_originalContent)
    }
    return
  }

  // 空内容处理
  if (html === '<br>' || html === '' || html === '<br>') {
    updateContent('')
    return
  }
  try {
    let md = turndownService.turndown(html)
    // 剥离 turndown 额外添加的转义反斜杠（`\*` → `*`，`\\` → `\` 等）
    // 避免每次编辑往返都翻倍累积斜杠 \
    md = md.replace(/\\([\\*_~`\[\]()#+\-\.!|])/g, '$1')
    if (md !== activeFile.value.content) {
      updateContent(md)
    }
  } catch (e) {
    console.warn('[MarkdownPreview] turndown 转换失败:', e)
  }
}

// ========== RAF 节流同步（跟随显示器刷新率） ==========
let rafPending = false
function onWysiwygInput(): void {
  if (rafPending) return
  rafPending = true
  requestAnimationFrame(() => {
    rafPending = false
    syncWysiwygToMarkdown()
  })
}

// ========== 失焦时立即同步 ==========
function onWysiwygBlur(): void {
  syncWysiwygToMarkdown()
}

// ========== 进入/退出编辑 ==========

/** 点击位置滚动比例缓存 */
let _clickScrollRatio = 0

function enterEdit(clickEvent?: MouseEvent): void {
  if (isEditing.value || !activeFile.value) return

  // 计算点击位置相对于预览内容的滚动比例
  if (clickEvent && previewRef.value) {
    const el = previewRef.value
    const clickY = clickEvent.clientY - el.getBoundingClientRect().top + el.scrollTop
    _clickScrollRatio = clickY / Math.max(el.scrollHeight, 1)
  } else {
    _clickScrollRatio = 0
  }

  // 保存原始 markdown 内容（退出时如果无改动则完整还原）
  _originalContent = activeFile.value.content

  // 从当前内容重新编译，确保编辑时看到最新渲染
  compile(activeFile.value.content)
  isEditing.value = true

  nextTick(() => {
    if (wysiwygRef.value) {
      // 保存 HTML 快照，用于后续检测是否真正改动
      _htmlSnapshot = wysiwygRef.value.innerHTML
      wysiwygRef.value.focus()
      // 恢复滚动到点击位置
      if (_clickScrollRatio > 0) {
        wysiwygRef.value.scrollTop = _clickScrollRatio * (wysiwygRef.value.scrollHeight - wysiwygRef.value.clientHeight)
      }
    }
  })
}

function exitEdit(): void {
  if (!isEditing.value) return
  // 最后一次同步
  syncWysiwygToMarkdown()
  isEditing.value = false
  if (activeFile.value) debouncedCompile(activeFile.value.content)
}

function onPreviewClick(e: MouseEvent): void {
  if (isEditing.value) return
  const t = e.target as HTMLElement
  // 点击链接：通过系统默认浏览器或程序打开
  const link = t.closest('a')
  if (link) {
    e.preventDefault()
    let href = link.getAttribute('href') || ''
    if (!href) return
    if (href.startsWith('http://') || href.startsWith('https://')) {
      window.electronAPI?.openExternal?.(href)
    } else {
      // 文件路径：转成标准 URL 后先用 openExternal 尝试，失败则回退 openPath
      let url = href
      if (href.match(/^[a-zA-Z]:[\\/]/)) {
        url = 'file:///' + href.replace(/\\/g, '/')
      } else if (!href.startsWith('file:')) {
        const base = workspaceDir.value?.replace(/\\/g, '/') || ''
        const rel = href.replace(/\\/g, '/').replace(/^\.\//, '')
        url = 'file:///' + base + '/' + rel
      }
      window.electronAPI?.openExternal?.(url).then(ok => {
        if (!ok && url.startsWith('file:')) {
          let fp = decodeURIComponent(url.replace(/^file:\/\/\//, '')).replace(/\\/g, '/')
          if (fp.startsWith('/')) fp = fp.slice(1)
          window.electronAPI?.openPath?.(fp).then(ok2 => { if (!ok2) ElMessage.warning('打开链接失败') })
        } else if (!ok) {
          ElMessage.warning('打开链接失败')
        }
      })
    }
    return
  }
  // 点击按钮、图片不进入编辑模式
  if (t.closest('button, img')) return
}

// ========== 图片右键菜单 ==========
const imgCtxVisible = ref(false)
const imgCtxX = ref(0)
const imgCtxY = ref(0)
let imgCtxTarget: HTMLImageElement | null = null
let imgCtxSrc = '' // 保存原始 src，供后续操作使用

/** 从 img.src 提取真实文件路径（支持 file:///、data:、http 等） */
function imgToPath(src: string): string {
  if (!src.startsWith('file:')) return src // data:/http: 直接用 src
  let p = decodeURIComponent(src.replace(/^file:\/\/\//, ''))
  if (p.startsWith('/')) p = p.slice(1)
  return p
}

function onContextMenu(e: MouseEvent): void {
  const t = e.target as HTMLElement
  const img = t.closest('img') as HTMLImageElement | null
  if (img) {
    e.preventDefault()
    imgCtxTarget = img
    imgCtxSrc = imgToPath(img.src)
    imgCtxX.value = e.clientX
    const h = window.innerHeight
    const menuH = 90
    imgCtxY.value = h - e.clientY < menuH ? Math.max(0, e.clientY - menuH) : e.clientY
    imgCtxVisible.value = true
    return
  }
}

function closeImgCtx() { imgCtxVisible.value = false; imgCtxTarget = null }

async function copyImageToClipboard() {
  if (!imgCtxTarget) return
  closeImgCtx()
  const src = imgCtxSrc
  try {
    if (src.startsWith('file:')) {
      // file:// 路径：读成 base64，走主进程剪贴板
      const b64 = await window.electronAPI?.readFileAsBase64?.(src)
      if (!b64) { ElMessage.warning('读取图片失败'); return }
      const ok = await window.electronAPI?.copyImageFromBase64?.(b64)
      ElMessage.success(ok ? '图片已复制' : '复制图片失败')
    } else {
      // data:/http: 路径：浏览器端 clipboard API
      const r = await fetch(src)
      const blob = await r.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      ElMessage.success('图片已复制')
    }
  } catch (e) {
    console.warn('[MarkdownPreview] 复制图片失败:', e)
    ElMessage.warning('复制图片失败')
  }
}

async function saveImageAs() {
  if (!imgCtxTarget) return
  closeImgCtx()
  const src = imgCtxSrc
  try {
    let base64 = ''
    if (src.startsWith('file:')) {
      base64 = await window.electronAPI?.readFileAsBase64?.(src) || ''
    } else {
      const resp = await fetch(src)
      const blob = await resp.blob()
      base64 = await new Promise<string>((resolve) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.readAsDataURL(blob)
      })
    }
    if (!base64) { ElMessage.warning('读取图片失败'); return }
    const savedPath = await window.electronAPI?.saveImageAs?.(base64)
    if (savedPath) ElMessage.success('图片已保存')
  } catch (e) {
    console.warn('[MarkdownPreview] 另存图片失败:', e)
    ElMessage.warning('另存图片失败')
  }
}

function onWysiwygKeydown(e: KeyboardEvent): void {
  // Escape 退出编辑
  if (e.key === 'Escape') {
    e.preventDefault()
    exitEdit()
  }
}

/** WYSIWYG 模式下粘贴：拦截 data:image 并保存到 .assets/ */
function onWysiwygPaste(e: ClipboardEvent): void {
  const tx = e.clipboardData?.getData('text/plain') || ''
  if (!tx.startsWith('data:image/')) return // 非图片粘贴放行
  e.preventDefault()
  const m = tx.match(/^data:image\/(\w+)/i)
  const ext = m?.[1]?.toLowerCase() === 'jpeg' ? 'jpg' : m?.[1]?.toLowerCase() || 'png'
  const fn = `image-${Date.now()}.${ext}`
  window.electronAPI?.saveImage(workspaceDir.value, fn, tx).then(fp => {
    if (!fp || !wysiwygRef.value) { ElMessage.warning('粘贴图片保存失败'); return }
    // 在光标位置插入 <img> 标签
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const img = document.createElement('img')
    img.src = `.assets/${fn}`
    img.alt = fn
    range.insertNode(img)
    range.setStartAfter(img)
    range.collapse(true)
    sel.removeAllRanges(); sel.addRange(range)
    // 触发同步到 markdown
    onWysiwygInput()
  })
}

// ========== 滚动同步 ==========

function onPreviewScroll(): void {
  if (isLocked() || !previewRef.value) return
  const el = previewRef.value
  const ratio = el.scrollTop / (el.scrollHeight - el.clientHeight || 1)
  setPreviewScrollRatio(ratio)
}

function onWysiwygScroll(): void {
  if (isLocked() || !wysiwygRef.value) return
  const el = wysiwygRef.value
  const ratio = el.scrollTop / (el.scrollHeight - el.clientHeight || 1)
  setPreviewScrollRatio(ratio)
}

watch(() => activeFile.value?.content, (nc) => {
  if (nc !== undefined && !isEditing.value) debouncedCompile(nc)
}, { immediate: true })

watch(() => activeFile.value?.id, () => {
  isEditing.value = false
  nextTick(() => { if (previewRef.value) previewRef.value.scrollTop = 0 })
})

// 滚动同步：左侧编辑滚动 → 预览按比例跟随
watch(editorScrollRatio, (r) => {
  if (!previewRef.value || isEditing.value) return
  const max = previewRef.value.scrollHeight - previewRef.value.clientHeight
  previewRef.value.scrollTop = r * Math.max(0, max)
})

// 大纲点击回调
onHeadingJump((anchorId) => {
  if (isEditing.value || !previewRef.value) return
  nextTick(() => {
    if (previewRef.value) {
      const el = previewRef.value.querySelector(`#${CSS.escape(anchorId)}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  })
})

// ========== 导出功能 ==========

import { toPng } from 'html-to-image'

const EXPORT_LAST_FORMAT_KEY = 'md-export-last-format'
const EXPORT_LAST_PATH_KEY = 'md-export-last-path'

const showExportDialog = ref(false)
const exportFormat = ref<'html' | 'pdf' | 'png'>('html')
const exportOverwriteLast = ref(false)

function openExportDialog() {
  // 恢复上次设置
  const lastFormat = localStorage.getItem(EXPORT_LAST_FORMAT_KEY)
  if (lastFormat && (lastFormat === 'html' || lastFormat === 'pdf' || lastFormat === 'png')) {
    exportFormat.value = lastFormat
  }
  const lastPath = localStorage.getItem(EXPORT_LAST_PATH_KEY)
  exportOverwriteLast.value = !!lastPath
  showExportDialog.value = true
}

function closeExportDialog() {
  showExportDialog.value = false
}

async function doExport() {
  const title = activeFile.value?.name?.replace('.md', '') || '文档'
  const html = renderedHtml.value
  closeExportDialog()

  // 保存设置
  localStorage.setItem(EXPORT_LAST_FORMAT_KEY, exportFormat.value)

  const lastPath = localStorage.getItem(EXPORT_LAST_PATH_KEY)

  if (exportOverwriteLast.value && lastPath) {
    // 覆盖上次导出的文件
    if (exportFormat.value === 'html') {
      const ok = await window.electronAPI?.writeFile?.(lastPath, wrapHtml(title, html))
      if (ok) { ElMessage.success('已覆盖导出: ' + lastPath); return }
    }
    ElMessage.warning('覆盖失败，将另存为新文件')
  }

  try {
    if (exportFormat.value === 'html') {
      const path = await window.electronAPI?.exportHtml?.(title, html)
      if (path) {
        localStorage.setItem(EXPORT_LAST_PATH_KEY, path)
        ElMessage.success('HTML 已导出')
      }
    } else if (exportFormat.value === 'pdf') {
      const path = await window.electronAPI?.exportPdf?.(title, html)
      if (path) {
        localStorage.setItem(EXPORT_LAST_PATH_KEY, path)
        ElMessage.success('PDF 已导出')
      }
    } else if (exportFormat.value === 'png') {
      if (!previewRef.value) return
      ElMessage.info('正在生成图片…')
      const dataUrl = await toPng(previewRef.value, { backgroundColor: '#ffffff' })
      const path = await window.electronAPI?.exportImage?.(title, dataUrl)
      if (path) {
        localStorage.setItem(EXPORT_LAST_PATH_KEY, path)
        ElMessage.success('图片已导出')
      }
    }
  } catch (e: any) {
    ElMessage.error('导出失败: ' + (e?.message || String(e)))
  }
}

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; line-height: 1.8; color: #333; }
h1, h2, h3 { color: #1a1a1a; }
pre { background: #1e1e2e; color: #e0e0e0; padding: 1rem; border-radius: 8px; overflow-x: auto; }
code { font-family: "Fira Code", monospace; font-size: 0.9em; }
blockquote { border-left: 4px solid #409eff; padding: 0.5rem 1rem; background: #f0f7ff; margin: 1rem 0; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ddd; padding: 0.5rem; text-align: left; }
th { background: #f5f5f5; }
img { max-width: 100%; }
.mermaid-wrapper { text-align: center; margin: 1rem 0; }
.mermaid-wrapper svg { max-width: 100%; }
</style>
</head>
<body>${body}</body>
</html>`
}
</script>

<template>
  <div class="preview-panel">
    <div class="preview-panel__tabs">
      <div class="preview-panel__hint">预览</div>
      <button v-if="!isEditing && renderedHtml" class="preview-panel__export-btn" @click.stop="openExportDialog" title="导出文档">📥 导出</button>
    </div>

    <!-- 只读预览 -->
    <div
      ref="previewRef"
      class="preview-panel__content markdown-body"
      v-html="renderedHtml"
      @click="onPreviewClick"
      @contextmenu="onContextMenu"
      @scroll.passive="onPreviewScroll"
    />

    <!-- 图片右键菜单 -->
    <Teleport to="body">
      <div
        v-if="imgCtxVisible"
        class="preview-img-ctxm"
        :style="{ left: imgCtxX + 'px', top: imgCtxY + 'px' }"
        @mousedown.stop
        @contextmenu.prevent
      >
        <div class="preview-img-ctxm__i" @mousedown.prevent.stop="copyImageToClipboard">📋 复制图片</div>
        <div class="preview-img-ctxm__i" @mousedown.prevent.stop="saveImageAs">💾 另存为图片</div>
      </div>
    </Teleport>
    <div v-if="imgCtxVisible" class="preview-img-ctxm-mask" @mousedown="closeImgCtx" @contextmenu.prevent="closeImgCtx" />

    <!-- 导出对话框 -->
    <Teleport to="body">
      <div v-if="showExportDialog" class="export-dialog-mask" @mousedown.self="closeExportDialog">
        <div class="export-dialog">
          <h3 class="export-dialog__title">导出文档</h3>

          <div class="export-dialog__section">
            <label class="export-dialog__label">导出格式</label>
            <div class="export-dialog__formats">
              <label class="export-fmt" :class="{ 'export-fmt--active': exportFormat === 'html' }">
                <input v-model="exportFormat" type="radio" value="html" />
                <span>🌐 HTML</span>
              </label>
              <label class="export-fmt" :class="{ 'export-fmt--active': exportFormat === 'pdf' }">
                <input v-model="exportFormat" type="radio" value="pdf" />
                <span>📄 PDF</span>
              </label>
              <label class="export-fmt" :class="{ 'export-fmt--active': exportFormat === 'png' }">
                <input v-model="exportFormat" type="radio" value="png" />
                <span>🖼️ 图像 (PNG)</span>
              </label>
            </div>
          </div>

          <div class="export-dialog__section">
            <label class="export-dialog__check">
              <input v-model="exportOverwriteLast" type="checkbox" />
              <span>覆盖上一次导出的文件</span>
            </label>
          </div>

          <div class="export-dialog__actions">
            <button class="export-dialog__btn export-dialog__btn--cancel" @click="closeExportDialog">取消</button>
            <button class="export-dialog__btn export-dialog__btn--confirm" @click="doExport">导出</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.preview-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--preview-bg);
  border-left: 1px solid var(--divider);
}
.preview-panel__tabs {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--divider);
  padding: 0 16px;
  height: 40px;
  background: var(--sidebar-bg);
}
.preview-panel__mode-group {
  flex-shrink: 0;
}
.preview-panel__hint {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}
.preview-panel__content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
  outline: none;
  cursor: pointer;
}
.preview-panel__wysiwyg {
  cursor: text;
  // contenteditable 模式下保留所有 markdown-body 样式
  :deep(img) { cursor: default; }
}

// ========== 图片右键菜单 ==========
.preview-img-ctxm {
  position: fixed;
  z-index: 10001;
  min-width: 160px;
  background: var(--surface);
  border: 1px solid var(--divider);
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0,0,0,.12);
  padding: 4px 0;
  user-select: none;
  animation: fadeIn .12s ease;
}
.preview-img-ctxm__i {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background .1s;
  &:hover { background: var(--primary-container); color: var(--primary); }
}
.preview-img-ctxm-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
}

// ========== 导出按钮 ==========
.preview-panel__export-btn {
  margin-left: auto;
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid var(--divider);
  border-radius: 4px;
  background: var(--sidebar-bg);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all .15s;
  &:hover { background: var(--primary); color: #fff; border-color: var(--primary); }
}

// ========== 导出对话框 ==========
.export-dialog-mask {
  position: fixed; inset: 0; z-index: 10002;
  background: rgba(0,0,0,.35);
  display: flex; align-items: center; justify-content: center;
}
.export-dialog {
  background: var(--surface);
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0,0,0,.15);
  padding: 24px;
  width: 420px;
  max-width: 90vw;
  &__title { margin: 0 0 20px; font-size: 18px; font-weight: 600; color: var(--text-primary); }
  &__section { margin-bottom: 16px; }
  &__label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 8px; }
  &__formats { display: flex; gap: 8px; }
  &__check {
    display: flex; align-items: center; gap: 8px; font-size: 13px;
    color: var(--text-secondary); cursor: pointer;
    input[type="checkbox"] { accent-color: var(--primary); }
  }
  &__actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
  &__btn {
    padding: 8px 20px; border-radius: 6px; font-size: 14px; cursor: pointer; border: none;
    &--cancel { background: var(--hover); color: var(--text-secondary); }
    &--confirm { background: var(--primary); color: #fff; }
    &:hover { opacity: .85; }
  }
}
.export-fmt {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 12px 8px; border: 2px solid var(--divider); border-radius: 8px;
  cursor: pointer; font-size: 13px; color: var(--text-secondary);
  transition: all .15s;
  input { display: none; }
  &:hover { border-color: var(--primary-light); }
  &--active { border-color: var(--primary); color: var(--primary); background: var(--primary-container); }
}
</style>

<style lang="scss">
.markdown-body {
  font-family: $font-family;
  font-size: $font-size-base;
  line-height: 1.8;
  color: var(--text-primary);
  max-width: 100%;
  word-wrap: break-word;

  h1, h2, h3, h4, h5, h6 {
    margin-top: $spacing-lg;
    margin-bottom: $spacing-sm;
    font-weight: 600;
    line-height: 1.4;
    color: var(--text-primary);
    &:first-child { margin-top: 0; }
  }
  h1 { font-size: 28px; padding-bottom: $spacing-sm; border-bottom: 1px solid var(--divider); }
  h2 { font-size: 22px; padding-bottom: $spacing-xs; border-bottom: 1px solid var(--divider); }
  h3 { font-size: 18px; }
  h4 { font-size: 16px; }
  p { margin: $spacing-sm 0; line-height: 1.8; }
  ul, ol {
    margin: $spacing-sm 0;
    padding-left: $spacing-xl;
    li { margin: $spacing-xs 0; line-height: 1.7; }
  }
  blockquote {
    margin: $spacing-md 0;
    padding: $spacing-sm $spacing-md;
    border-left: 4px solid var(--primary);
    background: var(--primary-container);
    border-radius: 0 $radius-sm $radius-sm 0;
    p { margin: $spacing-xs 0; }
  }
  .code-block {
    margin: $spacing-md 0;
    border-radius: $radius-md;
    overflow: hidden;
    box-shadow: $shadow-1;
    &__header {
      display: flex; align-items: center; justify-content: space-between;
      padding: $spacing-xs $spacing-sm;
      background: #1a1a2e;
      font-size: $font-size-xs;
      .code-lang {
        color: #8a8a8a; text-transform: uppercase;
        font-family: $font-family-mono; font-size: 11px; letter-spacing: .5px;
      }
    }
    pre {
      margin: 0; padding: $spacing-md;
      background: #1e1e2e; overflow-x: auto;
      code {
        font-family: $font-family-mono; font-size: $font-size-sm;
        line-height: 1.6; color: #e0e0e0; background: none; padding: 0;
      }
    }
  }
  code {
    font-family: $font-family-mono; font-size: $font-size-sm;
    padding: 2px 6px; border-radius: $radius-sm;
    background: var(--code-bg); color: var(--primary);
  }
  pre code { background: none; color: inherit; padding: 0; }
  a {
    color: var(--primary); text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color $transition-fast;
    &:hover { border-bottom-color: var(--primary); }
    // 编辑模式下链接可点击
    [contenteditable="true"] & { pointer-events: none; }
  }
  img {
    max-width: 100%; height: auto; border-radius: $radius-md;
    margin: $spacing-md 0; box-shadow: $shadow-2;
  }
  .table-wrapper { overflow-x: auto; margin: $spacing-md 0; }
  table {
    width: 100%; border-collapse: collapse; font-size: $font-size-sm;
    th, td {
      padding: $spacing-sm $spacing-md;
      border: 1px solid var(--divider); text-align: left;
    }
    th { background: var(--sidebar-bg); font-weight: 600; color: var(--text-primary); }
    tr:nth-child(even) { background: var(--hover); }
  }
  hr { margin: $spacing-lg 0; border: none; border-top: 1px solid var(--divider); }
  .task-checked { color: var(--success); }
  .task-unchecked { color: var(--text-hint); }
  strong { font-weight: 600; }
  em { font-style: italic; }
  del { color: var(--text-hint); }

  .preview-empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 300px; color: var(--text-hint);
    &__icon { font-size: 48px; margin-bottom: $spacing-md; opacity: .5; }
    p { font-size: $font-size-lg; }
  }
  .preview-error { color: var(--error); padding: $spacing-md; background: rgba(244,54,54,.08); border-radius: $radius-md; }

  // ========== Mermaid 流程图 ==========
  .mermaid-wrapper {
    margin: $spacing-md 0;
    padding: $spacing-md;
    background: #fff;
    border-radius: $radius-md;
    border: 1px solid var(--divider);
    text-align: center;
    overflow-x: auto;
    svg { max-width: 100%; height: auto; }
  }
  .mermaid-error {
    border: 1px solid var(--error);
    .mermaid-error-msg {
      padding: $spacing-sm $spacing-md;
      color: var(--error);
      font-size: $font-size-sm;
    }
  }
}
</style>
