const { app, BrowserWindow, dialog, ipcMain, shell, nativeImage, clipboard } = require('electron')
const path = require('path')
const fs = require('fs')

const isDev = !app.isPackaged

/** 创建工作目录（桌面/Markdown笔记） */
function getDefaultWorkspace() {
  const desktop = path.join(app.getPath('home'), 'Desktop', 'Markdown笔记')
  if (!fs.existsSync(desktop)) {
    fs.mkdirSync(desktop, { recursive: true })
  }
  return desktop
}

// ========== IPC 处理 ==========

/** 待打开文件路径（"打开方式"传入，供渲染进程轮询，解决竞态条件） */
let pendingFilePath = null

let isDirty = false
ipcMain.on('app:dirty', (_event, d) => { isDirty = d })

/** 选择工作目录 */
ipcMain.handle('dialog:select-directory', async () => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null

  const result = await dialog.showOpenDialog(win, {
    title: '选择工作目录',
    properties: ['openDirectory'],
  })
  return result.canceled || result.filePaths.length === 0
    ? null
    : result.filePaths[0]
})

/** 选择 md 文件 */
ipcMain.handle('dialog:select-file', async () => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null

  const result = await dialog.showOpenDialog(win, {
    title: '打开文件',
    filters: [{ name: 'Markdown 文件', extensions: ['md'] }],
    properties: ['openFile'],
  })
  return result.canceled || result.filePaths.length === 0
    ? null
    : result.filePaths[0]
})

/** 保存拖入文件（主进程获取完整路径） */
ipcMain.handle('file:resolve-dropped', async (_event, fileName) => {
  // 返回空，实际路径由渲染进程 File.path 提供
  return null
})

/** 获取默认工作目录 */
ipcMain.handle('file:get-default-workspace', () => {
  return getDefaultWorkspace()
})

/** 列出目录下所有 .md 文件 */
ipcMain.handle('file:list', (_event, dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
      return []
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md'))
      .map((e) => {
        const filePath = path.join(dirPath, e.name)
        const stat = fs.statSync(filePath)
        return {
          name: e.name,
          path: filePath,
          createdAt: stat.birthtimeMs,
          updatedAt: stat.mtimeMs,
        }
      })
    files.sort((a, b) => b.updatedAt - a.updatedAt)
    return files
  } catch {
    return []
  }
})

/** 递归列出目录树（文件和文件夹） */
function _scanTree(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const result = []
  for (const e of entries) {
    const fullPath = path.join(dirPath, e.name)
    if (e.isDirectory()) {
      // 跳过 .assets 等隐藏目录
      if (e.name.startsWith('.')) continue
      result.push({
        name: e.name,
        path: fullPath,
        type: 'directory',
        children: _scanTree(fullPath),
      })
    } else if (e.isFile() && e.name.endsWith('.md')) {
      const stat = fs.statSync(fullPath)
      result.push({
        name: e.name,
        path: fullPath,
        type: 'file',
        createdAt: stat.birthtimeMs,
        updatedAt: stat.mtimeMs,
      })
    }
  }
  result.sort((a, b) => { if (a.type !== b.type) return a.type === 'directory' ? -1 : 1; return a.name.localeCompare(b.name) })
  return result
}
ipcMain.handle('file:list-tree', (_event, dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
      return []
    }
    return _scanTree(dirPath)
  } catch { return [] }
})

/** 读取文件内容 */
ipcMain.handle('file:read', (_event, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return ''
  }
})

/** 写入文件 */
ipcMain.handle('file:save', (_event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
  } catch {
    return false
  }
})

/** 创建新 .md 文件，返回完整路径 */
ipcMain.handle('file:create', (_event, dirPath, name) => {
  let fileName = name
  if (!fileName.endsWith('.md')) fileName += '.md'

  const filePath = path.join(dirPath, fileName)
  let finalPath = filePath
  let counter = 1
  while (fs.existsSync(finalPath)) {
    const base = fileName.replace('.md', '')
    finalPath = path.join(dirPath, `${base} (${counter}).md`)
    counter++
  }

  const content = `# ${path.basename(finalPath, '.md')}\n\n`
  fs.writeFileSync(finalPath, content, 'utf-8')
  return finalPath
})

/** 删除文件 */
ipcMain.handle('file:delete', (_event, filePath) => {
  try {
    fs.unlinkSync(filePath)
    return true
  } catch {
    return false
  }
})

/** 重命名文件，返回新路径 */
ipcMain.handle('file:rename', (_event, filePath, newName) => {
  const dir = path.dirname(filePath)
  let newPath = path.join(dir, newName)
  if (!newName.endsWith('.md')) newPath += '.md'

  try {
    fs.renameSync(filePath, newPath)
    return newPath
  } catch {
    return null
  }
})

/** 复制（复制）文件到同目录，自动添加"副本"后缀 */
ipcMain.handle('file:copy', (_event, sourcePath) => {
  try {
    const dir = path.dirname(sourcePath)
    const ext = path.extname(sourcePath)
    const base = path.basename(sourcePath, ext)
    let newPath = path.join(dir, `${base} - 副本${ext}`)
    let counter = 1
    while (fs.existsSync(newPath)) {
      counter++
      newPath = path.join(dir, `${base} - 副本 (${counter})${ext}`)
    }
    fs.copyFileSync(sourcePath, newPath)
    return newPath
  } catch { return null }
})

/** 创建文件夹 */
ipcMain.handle('dir:create', (_event, parentPath, name) => {
  try {
    const dirPath = path.join(parentPath, name)
    if (fs.existsSync(dirPath)) return null
    fs.mkdirSync(dirPath, { recursive: true })
    return dirPath
  } catch { return null }
})

/** 删除文件夹（非递归，仅删除空目录） */
ipcMain.handle('dir:delete', (_event, dirPath) => {
  try {
    // 检查是否为空
    const entries = fs.readdirSync(dirPath)
    if (entries.length > 0) return false
    fs.rmdirSync(dirPath)
    return true
  } catch { return false }
})

/** 另存为图片（通过 save 对话框选择位置） */
ipcMain.handle('file:save-image-as', async (_event, base64Data) => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null
  const result = await dialog.showSaveDialog(win, {
    title: '另存为图片',
    defaultPath: 'image.png',
    filters: [
      { name: 'PNG 图片', extensions: ['png'] },
      { name: 'JPEG 图片', extensions: ['jpg', 'jpeg'] },
      { name: 'WebP 图片', extensions: ['webp'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePath) return null
  try {
    const commaIdx = base64Data.indexOf(',')
    const raw = commaIdx >= 0 ? base64Data.substring(commaIdx + 1) : base64Data
    fs.writeFileSync(result.filePath, Buffer.from(raw, 'base64'))
    return result.filePath
  } catch {
    return null
  }
})

/** 在资源管理器中显示文件 */
ipcMain.handle('file:show-in-folder', (_event, filePath) => {
  shell.showItemInFolder(filePath)
})

// ========== 另存为 ==========

/** 打开另存为对话框，返回 { filePath, content } 或 null */
ipcMain.handle('file:save-as', async (_event, defaultName, content) => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null

  const result = await dialog.showSaveDialog(win, {
    title: '另存为',
    defaultPath: defaultName || '未命名.md',
    filters: [
      { name: 'Markdown 文件', extensions: ['md'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  })

  if (result.canceled || !result.filePath) return null
  try {
    fs.writeFileSync(result.filePath, content, 'utf-8')
    return result.filePath
  } catch {
    return null
  }
})

// ========== 粘贴图片保存 ==========

/** 将 base64 图片保存到工作目录，返回保存路径 */
ipcMain.handle('file:save-image', async (_event, dirPath, fileName, base64Data) => {
  try {
    const assetsDir = path.join(dirPath, '.assets')
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true })
    }
    const filePath = path.join(assetsDir, fileName)
    // 去掉 data:image/...;base64, 前缀（兼容额外参数）
    const commaIdx = base64Data.indexOf(',')
    const raw = commaIdx >= 0 ? base64Data.substring(commaIdx + 1) : base64Data
    fs.writeFileSync(filePath, Buffer.from(raw, 'base64'))
    return filePath
  } catch {
    return null
  }
})

/** 复制图片（通过 base64 data URL 写入剪贴板） */
ipcMain.handle('clipboard:copy-image-base64', async (_event, base64) => {
  try {
    const img = nativeImage.createFromDataURL(base64)
    clipboard.writeImage(img)
    return true
  } catch { return false }
})

/** 使用系统默认程序打开外部链接 */
ipcMain.handle('shell:open-external', async (_event, url) => {
  try {
    await shell.openExternal(url)
    return true
  } catch { return false }
})

/** 使用系统默认程序打开文件 */
ipcMain.handle('shell:open-path', async (_event, filePath) => {
  try {
    const err = await shell.openPath(filePath)
    return err === '' || err === undefined // 空串 = 成功
  } catch { return false }
})

/** 读取文件为 base64 */
ipcMain.handle('file:read-as-base64', async (_event, filePath) => {
  try {
    const data = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase().replace('.', '')
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png'
    return `data:${mime};base64,${data.toString('base64')}`
  } catch { return null }
})

/** 渲染进程轮询获取待打开文件路径 */
ipcMain.handle('file:poll-open-file', () => { const fp = pendingFilePath; pendingFilePath = null; return fp })

/** 读取文件统计信息 */
ipcMain.handle('file:stat', (_event, filePath) => {
  try {
    const stat = fs.statSync(filePath)
    return {
      size: stat.size,
      createdAt: stat.birthtimeMs,
      updatedAt: stat.mtimeMs,
    }
  } catch {
    return null
  }
})

// ========== 窗口创建 ==========

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Markdown 编辑器',
    icon: nativeImage.createFromPath(path.join(__dirname, '../icon.png')),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('close', (e) => {
    if (isDirty) { e.preventDefault(); win.webContents.send('app:confirm-close') }
  })
  ipcMain.on('app:close-confirmed', (_e) => { isDirty = false; const w = BrowserWindow.fromWebContents(_e.sender); if (w && !w.isDestroyed()) w.close() })
  ipcMain.on('app:close-cancelled', () => {})

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html')
    win.loadFile(indexPath)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('file:') || url.startsWith('http://localhost')) {
      return { action: 'allow' }
    }
    shell.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })
}

/** 新建窗口的 IPC 处理 */
ipcMain.handle('window:create', () => {
  createWindow()
})

app.whenReady().then(() => {
  createWindow()
  // Windows：检查命令行参数中的 .md 文件（"打开方式"传入）
  const fileArg = process.argv.find(a => a.endsWith('.md') && fs.existsSync(a))
  if (fileArg) {
    pendingFilePath = fileArg
  }
})
const gotLock = app.requestSingleInstanceLock?.()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
      const fileArg = argv.find(a => a.endsWith('.md') && fs.existsSync(a))
      if (fileArg) {
        pendingFilePath = fileArg
        // 同时推送快速路径（渲染进程已就绪时立即生效）
        win.webContents.send('file:opened', fileArg)
      }
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// ========== 导出 IPC（统一支持 filePath 参数，传则直接写入跳过对话框） ==========

function getSavePath(win, type, title, filePath) {
  if (filePath) return filePath
  return new Promise((resolve) => {
    dialog.showSaveDialog(win, {
      title: `导出 ${type}`,
      defaultPath: `${title}.${type}`,
      filters: [{ name: type.toUpperCase(), extensions: [type] }],
    }).then(r => resolve(r.canceled || !r.filePath ? null : r.filePath))
  })
}

/** 导出 HTML */
ipcMain.handle('export:html', async (_event, title, html, filePath) => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null
  const fp = filePath || await getSavePath(win, 'html', title)
  if (!fp) return null
  try { fs.writeFileSync(fp, html, 'utf-8'); return fp } catch { return null }
})

/** 渲染 HTML → PDF（内部工具） */
async function _htmlToPdf(html) {
  const tmpDir = app.getPath('temp')
  const tmpFile = path.join(tmpDir, `mde-${Date.now()}.html`)
  fs.writeFileSync(tmpFile, html, 'utf-8')
  const bw = new BrowserWindow({
    width: 900, height: 600, show: false,
    webPreferences: { sandbox: false, contextIsolation: true, nodeIntegration: false, offscreen: true }
  })
  await bw.loadFile(tmpFile)
  await new Promise(r => setTimeout(r, 800))
  const buf = await bw.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })
  bw.close()
  try { fs.unlinkSync(tmpFile) } catch {}
  return buf
}

/** 导出 PDF */
ipcMain.handle('export:pdf', async (_event, title, html, filePath) => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null
  const fp = filePath || await getSavePath(win, 'pdf', title)
  if (!fp) return null
  try {
    const buf = await _htmlToPdf(html)
    fs.writeFileSync(fp, buf); return fp
  } catch (e) { console.error('[export:pdf]', e && e.message); return null }
})

/** 渲染 HTML → 图片（内部工具） */
async function _htmlToPng(html) {
  const tmpDir = app.getPath('temp')
  const tmpFile = path.join(tmpDir, `mdi-${Date.now()}.html`)
  fs.writeFileSync(tmpFile, html, 'utf-8')
  const bw = new BrowserWindow({
    width: 900, height: 600, show: false,
    webPreferences: { sandbox: false, contextIsolation: true, nodeIntegration: false }
  })
  await bw.loadFile(tmpFile)
  await new Promise(r => setTimeout(r, 800))
  let h = 600
  try { const ch = await bw.webContents.executeJavaScript('document.documentElement.scrollHeight'); if (ch > 100) h = ch } catch {}
  bw.setSize(900, Math.min(h + 40, 10000))
  await new Promise(r => setTimeout(r, 500))
  const img = await bw.webContents.capturePage()
  bw.close()
  try { fs.unlinkSync(tmpFile) } catch {}
  return img.toPNG()
}

/** 导出图片 */
ipcMain.handle('export:image', async (_event, title, html, filePath) => {
  const win = BrowserWindow.getFocusedWindow()
  if (!win) return null
  const fp = filePath || await getSavePath(win, 'png', title)
  if (!fp) return null
  try {
    const buf = await _htmlToPng(html)
    fs.writeFileSync(fp, buf); return fp
  } catch (e) { console.error('[export:image]', e && e.message); return null }
})

/** 文件关联打开（macOS） */
app.on('open-file', (_event, filePath) => {
  _event.preventDefault()
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send('file:opened', filePath)
    win.focus()
  }
})