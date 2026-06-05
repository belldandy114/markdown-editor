import { ref, computed } from 'vue'
import type { MarkdownFile, FileTreeNode } from '@/types'
import { ElMessage, ElMessageBox } from 'element-plus'

const WORKSPACE_KEY = 'markdown-editor-workspace'
const ACTIVE_FILE_KEY = 'markdown-editor-active-file'

// ========== 模块级单例状态 ==========

const files = ref<MarkdownFile[]>([])
const activeFileId = ref<string | null>(null)
const workspaceDir = ref('')
const loading = ref(true)
const searchQuery = ref('')
const dirty = ref(false)
const editorScrollRatio = ref(0)
const treeData = ref<FileTreeNode[]>([])
const expandedPaths = ref<Set<string>>(new Set())
const treeLoading = ref(false)
const previewScrollRatio = ref(0)
let _scrollLock = false
function lockScroll() { _scrollLock = true; setTimeout(() => { _scrollLock = false }, 30) }
function isLocked() { return _scrollLock }

function setEditorScrollRatio(r: number) { editorScrollRatio.value = r }
function setPreviewScrollRatio(r: number) { previewScrollRatio.value = r }

// 大纲跳转：全局事件回调（比 reactive watch 可靠）
const headingCallbacks: ((id: string) => void)[] = []
function onHeadingJump(fn: (id: string) => void) { headingCallbacks.push(fn) }
function jumpToHeading(id: string) { headingCallbacks.forEach(fn => fn(id)) }
function removeHeadingJump(fn: (id: string) => void) {
  const i = headingCallbacks.indexOf(fn); if (i >= 0) headingCallbacks.splice(i, 1)
}

// ========== 工具函数 ==========

/** 根据文件路径生成 id */
function pathToId(filePath: string): string {
  let hash = 0
  for (let i = 0; i < filePath.length; i++) {
    hash = ((hash << 5) - hash) + filePath.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

/** 获取窗口 API，返回 null 表示 Electron API 不可用 */
function api() {
  const ea = (window as any).electronAPI
  if (!ea) {
    console.warn('[useMarkdownFiles] electronAPI 不可用，请在 Electron 环境中运行')
    return null
  }
  return ea
}

/** 检查 Electron API 是否可用 */
function hasApi(): boolean {
  return !!(window as any).electronAPI
}

// ========== 计算属性 ==========

const activeFile = computed<MarkdownFile | undefined>(() =>
  files.value.find((f) => f.id === activeFileId.value),
)

const filteredFiles = computed(() => {
  if (!searchQuery.value.trim()) return files.value
  const q = searchQuery.value.toLowerCase()
  return files.value.filter((f) => f.name.toLowerCase().includes(q))
})

// ========== 初始化 ==========

async function init(): Promise<void> {
  loading.value = true
  try {
    const ea = api()
    if (!ea) {
      // Electron API 不可用（浏览器开发模式），显示提示
      workspaceDir.value = '（未连接 Electron）'
      console.warn('[useMarkdownFiles] Electron API 不可用，请在 Electron 环境中运行')
      loading.value = false
      return
    }

    // 1. 读取工作目录
    const saved = localStorage.getItem(WORKSPACE_KEY)
    if (saved) {
      workspaceDir.value = saved
    } else {
      const defaultDir = await ea.getDefaultWorkspace()
      workspaceDir.value = defaultDir || ''
      if (defaultDir) localStorage.setItem(WORKSPACE_KEY, defaultDir)
    }

    // 2. 加载文件列表（不含内容）
    await loadFiles()
    // 3. 加载目录树
    await loadTree()

    // 4. 恢复上次打开的文件
    const savedId = localStorage.getItem(ACTIVE_FILE_KEY)
    if (savedId && files.value.some((f) => f.id === savedId)) {
      activeFileId.value = savedId
      // 读取文件内容
      const file = files.value.find((f) => f.id === savedId)
      if (file) {
        file.content = await ea.readFile(file.path)
      }
    } else if (files.value.length > 0) {
      activeFileId.value = files.value[0].id
      files.value[0].content = await ea.readFile(files.value[0].path)
    }
  } catch (err) {
    ElMessage.error('初始化失败：' + String(err))
  } finally {
    loading.value = false
  }
}

// ========== 工作目录 ==========

/** 切换工作目录 */
async function switchWorkspace(dir?: string): Promise<void> {
  let targetDir = dir

  if (!targetDir) {
    const ea = api()
    if (!ea) { ElMessage.warning('Electron API 不可用'); return }
    targetDir = await ea.selectDirectory()
    if (!targetDir) return
  }

  workspaceDir.value = targetDir
  localStorage.setItem(WORKSPACE_KEY, targetDir)
  activeFileId.value = null
  expandedPaths.value = new Set()
  await loadTree()
  await loadFiles()
}

/** 加载目录树 */
async function loadTree(): Promise<void> {
  treeLoading.value = true
  try {
    const ea = api()
    if (!ea) { treeData.value = []; return }
    treeData.value = await ea.listTree(workspaceDir.value)
  } catch { treeData.value = [] }
  finally { treeLoading.value = false }
}

/** 切换文件夹展开/收起 */
function toggleExpand(path: string): void {
  const s = new Set(expandedPaths.value)
  if (s.has(path)) s.delete(path); else s.add(path)
  expandedPaths.value = s
}

/** 通过文件路径打开文件（树节点点击） */
async function openFileByPath(filePath: string): Promise<void> {
  const id = pathToId(filePath)
  let file = files.value.find(f => f.id === id)
  if (!file) {
    const name = filePath.replace(/\\/g, '/').split('/').pop() || '未命名.md'
    const stat = await api().statFile(filePath)
    file = { id, name, path: filePath, content: '', createdAt: stat?.createdAt || Date.now(), updatedAt: stat?.updatedAt || Date.now() }
    files.value.unshift(file)
  }
  if (!file.content) file.content = await api().readFile(filePath)
  activeFileId.value = id
  dirty.value = false
}

/** 复制文件 */
async function copyFileItem(filePath: string): Promise<void> {
  const newPath = await api().copyFile(filePath)
  if (newPath) {
    await loadTree()
    await loadFiles()
    ElMessage.success(`已复制到 ${newPath.split(/[/\\]/).pop()}`)
  } else {
    ElMessage.error('复制失败')
  }
}

/** 打开文件（从磁盘重新加载） */
async function loadFiles(): Promise<void> {
  try {
    const ea = api()
    if (!ea) { files.value = []; return }
    const fileInfos = await ea.listFiles(workspaceDir.value)
    files.value = fileInfos.map((info) => ({
      id: pathToId(info.path),
      name: info.name,
      path: info.path,
      content: '',
      createdAt: info.createdAt,
      updatedAt: info.updatedAt,
    }))
  } catch {
    files.value = []
  }
}

// ========== 文件操作 ==========

/** 选择文件 */
async function selectFile(fileId: string): Promise<void> {
  if (fileId === activeFileId.value) return

  // 保存当前文件
  await flushSave()

  // 先读取内容，再切换文件，确保大纲/编辑器能立即拿到内容
  const file = files.value.find((f) => f.id === fileId)
  if (file && !file.content) {
    file.content = await api().readFile(file.path)
  }

  // 切换到新文件
  activeFileId.value = fileId
  localStorage.setItem(ACTIVE_FILE_KEY, fileId)
  dirty.value = false
}

/** 通过文件路径直接加载并打开文件（拖入 / 打开方式关联） */
async function loadFileFromPath(filePath: string): Promise<void> {
  try {
    // 提取所在目录
    const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
    const dirPath = idx >= 0 ? filePath.substring(0, idx) : filePath
    workspaceDir.value = dirPath
    localStorage.setItem(WORKSPACE_KEY, dirPath)
    await loadFiles()
    const id = pathToId(filePath)
    const existing = files.value.find(f => f.id === id)
    if (existing) {
      existing.content = await api().readFile(filePath)
      activeFileId.value = id
    } else {
      const name = filePath.substring(idx + 1) || '未命名.md'
      files.value.unshift({ id, name, path: filePath, content: await api().readFile(filePath), createdAt: Date.now(), updatedAt: Date.now() })
      activeFileId.value = id
    }
    dirty.value = false
  } catch (err) {
    ElMessage.error('打开文件失败：' + String(err))
  }
}

/** 创建新文件，支持指定目标目录 */
async function createFile(name?: string, targetDir?: string): Promise<void> {
  const dir = targetDir || workspaceDir.value
  const fileName = name || `未命名-${files.value.length + 1}`
  try {
    const filePath = await api().createFile(dir, fileName)
    const stat = await api().statFile(filePath)

    const newFile: MarkdownFile = {
      id: pathToId(filePath),
      name: fileName.endsWith('.md') ? fileName : fileName + '.md',
      path: filePath,
      content: `# ${fileName.replace('.md', '')}\n\n`,
      createdAt: stat?.createdAt || Date.now(),
      updatedAt: stat?.updatedAt || Date.now(),
    }

    files.value.unshift(newFile)
    activeFileId.value = newFile.id
    localStorage.setItem(ACTIVE_FILE_KEY, newFile.id)
    dirty.value = false
    await loadTree()
    ElMessage.success(`已创建 "${newFile.name}"`)
  } catch {
    ElMessage.error('创建文件失败')
  }
}

/** 删除文件 */
async function deleteFile(fileId: string): Promise<void> {
  const file = files.value.find((f) => f.id === fileId)
  if (!file) return

  try {
    await ElMessageBox.confirm(
      `确定要删除 "${file.name}" 吗？此操作不可恢复。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )

    const ok = await api().deleteFile(file.path)
    if (ok) {
      files.value = files.value.filter((f) => f.id !== fileId)
      if (activeFileId.value === fileId) {
        activeFileId.value = files.value.length > 0 ? files.value[0].id : null
        if (activeFileId.value) {
          const next = files.value.find((f) => f.id === activeFileId.value)
          if (next) next.content = await api().readFile(next.path)
        }
      }
      ElMessage.success(`已删除 "${file.name}"`)
    }
  } catch {
    // 用户取消或失败
  }
}

/** 重命名文件 */
async function renameFile(fileId: string): Promise<void> {
  const file = files.value.find((f) => f.id === fileId)
  if (!file) return

  try {
    const { value } = await ElMessageBox.prompt('请输入新文件名', '重命名', {
      inputValue: file.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /^.+\.md$/,
      inputErrorMessage: '文件名必须以 .md 结尾',
    })

    if (value && value !== file.name) {
      const newPath = await api().renameFile(file.path, value)
      if (newPath) {
        file.name = value
        file.path = newPath
        file.id = pathToId(newPath)
        file.updatedAt = Date.now()
        ElMessage.success(`已重命名为 "${value}"`)
      }
    }
  } catch {
    // 用户取消
  }
}

/** 通过路径重命名文件（不依赖 files 数组，用于树右键菜单） */
async function renameFileByPath(filePath: string): Promise<void> {
  const name = filePath.replace(/\\/g, '/').split('/').pop() || ''
  try {
    const { value } = await ElMessageBox.prompt('请输入新文件名', '重命名', {
      inputValue: name,
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /^.+\.md$/,
      inputErrorMessage: '文件名必须以 .md 结尾',
    })
    if (value && value !== name) {
      const newPath = await api().renameFile(filePath, value)
      if (newPath) {
        // 同步 files 数组中的记录
        const id = pathToId(filePath)
        const existing = files.value.find(f => f.id === id)
        if (existing) {
          existing.name = value
          existing.path = newPath
          existing.id = pathToId(newPath)
          existing.updatedAt = Date.now()
        }
        await loadTree()
        ElMessage.success(`已重命名为 "${value}"`)
      }
    }
  } catch { /* 取消 */ }
}

/** 通过路径删除文件（不依赖 files 数组，用于树右键菜单） */
async function deleteFileByPath(filePath: string): Promise<boolean> {
  const name = filePath.replace(/\\/g, '/').split('/').pop() || ''
  try {
    await ElMessageBox.confirm(
      `确定要删除 "${name}" 吗？此操作不可恢复。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
    const ok = await api().deleteFile(filePath)
    if (ok) {
      const id = pathToId(filePath)
      files.value = files.value.filter(f => f.id !== id)
      if (activeFileId.value === id) {
        activeFileId.value = files.value.length > 0 ? files.value[0].id : null
        if (activeFileId.value) {
          const next = files.value.find(f => f.id === activeFileId.value)
          if (next) next.content = await api().readFile(next.path)
        }
      }
      await loadTree()
      ElMessage.success(`已删除 "${name}"`)
      return true
    }
    return false
  } catch { return false }
}

/** 创建文件夹 */
async function createDir(parentPath: string): Promise<string | null> {
  try {
    const { value } = await ElMessageBox.prompt('请输入文件夹名称', '新建文件夹', {
      confirmButtonText: '创建', cancelButtonText: '取消',
      inputPattern: /^[^\\/:*?"<>|]+$/,
      inputErrorMessage: '名称包含非法字符',
    })
    if (!value) return null
    const dirPath = await api().createDir(parentPath, value)
    if (dirPath) {
      await loadTree()
      toggleExpand(parentPath)
      ElMessage.success(`已创建文件夹 "${value}"`)
      return dirPath
    }
    ElMessage.error('创建失败，可能已存在同名文件夹')
    return null
  } catch { return null }
}

/** 删除目录（仅空目录） */
async function deleteDirFromTree(dirPath: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm('确定要删除此文件夹吗？只能删除空文件夹。', '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    const ok = await api().deleteDir(dirPath)
    if (ok) {
      await loadTree()
      ElMessage.success('文件夹已删除')
      return true
    }
    ElMessage.error('删除失败，文件夹不为空')
    return false
  } catch { return false }
}

// ========== 保存 ==========

/** 保存当前文件到磁盘 */
async function saveFile(content?: string): Promise<void> {
  const file = files.value.find((f) => f.id === activeFileId.value)
  if (!file) return

  const text = content ?? file.content
  file.content = text
  file.updatedAt = Date.now()

  const ok = await api().saveFile(file.path, text)
  if (ok) {
    dirty.value = false
    ElMessage.success('已保存')
  } else {
    ElMessage.error('保存失败')
  }
}

/** 更新当前文件内容（内存中） */
function updateContent(content: string): void {
  const file = files.value.find((f) => f.id === activeFileId.value)
  if (!file) return
  file.content = content
  dirty.value = true
}

/** 保存未保存的内容 */
async function flushSave(): Promise<void> {
  if (!dirty.value) return
  const file = files.value.find((f) => f.id === activeFileId.value)
  if (!file) return
  await api().saveFile(file.path, file.content)
  file.updatedAt = Date.now()
  dirty.value = false
}

// ========== 导出 ==========

export function useMarkdownFiles() {
  return {
    // 状态
    files,
    treeData,
    activeFileId,
    activeFile,
    workspaceDir,
    treeLoading,
    expandedPaths,
    loading,
    searchQuery,
    filteredFiles,
    dirty,

    // 初始化
    init,

    // 工作目录
    switchWorkspace,
    loadTree,
    toggleExpand,

    // 文件操作
    selectFile,
    openFileByPath,
    loadFileFromPath,
    createFile,
    copyFileItem,
    createDir,
    deleteDirFromTree,
    deleteFile,
    deleteFileByPath,
    renameFile,
    renameFileByPath,

    // 滚动同步
    editorScrollRatio,
    setEditorScrollRatio,
    previewScrollRatio,
    setPreviewScrollRatio,
    lockScroll,
    isLocked,
    // 大纲跳转
    onHeadingJump,
    jumpToHeading,
    removeHeadingJump,

    // 保存
    saveFile,
    updateContent,
    flushSave,
  }
}
