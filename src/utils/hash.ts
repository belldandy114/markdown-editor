/**
 * 根据文件路径生成唯一 ID（使用路径本身，确保唯一性）
 * 统一所有组件使用的 pathToId 逻辑
 */
export function pathToId(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}
