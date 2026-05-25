const { contextBridge, ipcRenderer, webUtils } = require('electron')

// ========== 拖入文件处理（在 preload 上下文中获取完整路径） ==========
let _onDroppedFile = null

document.addEventListener('drop', (e) => {
  // 检查拖入的是否为 .md 文件
  const file = e.dataTransfer?.files?.[0]
  if (file && file.name.endsWith('.md')) {
    e.preventDefault()
    try {
      const path = webUtils.getPathForFile(file)
      if (path && _onDroppedFile) {
        _onDroppedFile(path)
      }
    } catch {
      // fallback: 通过 IPC 传递
    }
  }
})

// ========== contextBridge ==========

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  createWindow: () => ipcRenderer.invoke('window:create'),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  getDefaultWorkspace: () => ipcRenderer.invoke('file:get-default-workspace'),
  listFiles: (dirPath) => ipcRenderer.invoke('file:list', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('file:save', filePath, content),
  saveAs: (defaultName, content) => ipcRenderer.invoke('file:save-as', defaultName, content),
  createFile: (dirPath, name) => ipcRenderer.invoke('file:create', dirPath, name),
  deleteFile: (filePath) => ipcRenderer.invoke('file:delete', filePath),
  renameFile: (filePath, newName) => ipcRenderer.invoke('file:rename', filePath, newName),
  statFile: (filePath) => ipcRenderer.invoke('file:stat', filePath),
  saveImage: (dirPath, fileName, base64Data) => ipcRenderer.invoke('file:save-image', dirPath, fileName, base64Data),
  saveImageAs: (base64Data) => ipcRenderer.invoke('file:save-image-as', base64Data),
  copyImageFromBase64: (base64) => ipcRenderer.invoke('clipboard:copy-image-base64', base64),
  readFileAsBase64: (filePath) => ipcRenderer.invoke('file:read-as-base64', filePath),
  setDirty: (d) => ipcRenderer.send('app:dirty', d),
  showInFolder: (filePath) => ipcRenderer.invoke('file:show-in-folder', filePath),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openPath: (filePath) => ipcRenderer.invoke('shell:open-path', filePath),
  openFileDialog: () => ipcRenderer.invoke('dialog:select-file'),
  onOpenFile: (fn) => ipcRenderer.on('file:opened', (_e, fp) => fn(fp)),
  onConfirmClose: (fn) => ipcRenderer.on('app:confirm-close', () => fn()),
  confirmClose: () => ipcRenderer.send('app:close-confirmed'),
  cancelClose: () => ipcRenderer.send('app:close-cancelled'),
  /** 注册拖入文件回调（preload 监听 drop 事件后调用） */
  onFileDropped: (fn) => { _onDroppedFile = fn },
  // 导出功能
  exportHtml: (title, html, filePath) => ipcRenderer.invoke('export:html', title, html, filePath),
  exportPdf: (title, html, filePath) => ipcRenderer.invoke('export:pdf', title, html, filePath),
  exportImage: (title, html, filePath) => ipcRenderer.invoke('export:image', title, html, filePath),
})
