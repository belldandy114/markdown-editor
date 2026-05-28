/** Markdown 文件条目 */
export interface MarkdownFile {
  /** 文件唯一标识（使用 path 的哈希） */
  id: string
  /** 文件名（含 .md 后缀） */
  name: string
  /** 文件完整路径 */
  path: string
  /** 文件内容 */
  content: string
  /** 创建时间 */
  createdAt: number
  /** 最后修改时间 */
  updatedAt: number
}

/** Electron 文件信息（来自 IPC） */
export interface FileInfo {
  name: string
  path: string
  createdAt: number
  updatedAt: number
}

/** 主题模式 */
export type ThemeMode = 'light' | 'dark'

/** Electron API 桥接类型 */
export interface ElectronAPI {
  platform: string
  selectDirectory: () => Promise<string | null>
  getDefaultWorkspace: () => Promise<string>
  listFiles: (dirPath: string) => Promise<FileInfo[]>
  readFile: (filePath: string) => Promise<string>
  saveFile: (filePath: string, content: string) => Promise<boolean>
  createFile: (dirPath: string, name: string) => Promise<string>
  deleteFile: (filePath: string) => Promise<boolean>
  renameFile: (filePath: string, newName: string) => Promise<string | null>
  statFile: (filePath: string) => Promise<{ size: number; createdAt: number; updatedAt: number } | null>
  saveImage: (dirPath: string, fileName: string, base64Data: string) => Promise<string | null>
  saveImageAs: (base64Data: string) => Promise<string | null>
  copyImageFromBase64: (base64: string) => Promise<boolean>
  readFileAsBase64: (filePath: string) => Promise<string | null>
  saveAs: (defaultName: string, content: string) => Promise<string | null>
  createWindow: () => void
  setDirty: (d: boolean) => void
  showInFolder: (filePath: string) => void
  openExternal: (url: string) => Promise<boolean>
  openPath: (filePath: string) => Promise<boolean>
  openFileDialog: () => Promise<string | null>
  onOpenFile: (fn: (filePath: string) => void) => void
  onConfirmClose: (fn: () => void) => void
  confirmClose: () => void
  cancelClose: () => void
  onFileDropped?: (fn: (filePath: string) => void) => void
  /** 轮询获取"打开方式"传入的待打开文件 */
  pollOpenFile?: () => Promise<string | null>
  // 导出功能
  exportHtml: (title: string, html: string, filePath?: string) => Promise<string | null>
  exportPdf: (title: string, html: string, filePath?: string) => Promise<string | null>
  exportImage: (title: string, html: string, filePath?: string) => Promise<string | null>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
