export type UploadModelValue = string | string[] | null | undefined

/** 将上传组件的单双值模型统一为独立的 URL 快照。 */
export function normalizeUploadModelUrls(value: UploadModelValue): string[] {
  if (!value) return []
  return Array.isArray(value) ? [...value] : [value]
}

/** Use only the URL path for UI labels; signed query tokens must never enter accessible names. */
export function getSafeUploadDisplayName(url: string, fallback = '附件'): string {
  try {
    const parsed = new URL(url, 'https://upload.local.invalid')
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback
    const pathname = parsed.pathname
    const segment = pathname.split('/').at(-1)
    const name = segment ? decodeURIComponent(segment) : ''
    return name && name.length <= 120 ? name : fallback
  } catch {
    return fallback
  }
}

/** 只有 URL 内容或顺序真正变化时才重建上传列表。 */
export function shouldSyncUploadFileList(
  value: UploadModelValue,
  lastSyncedUrls: readonly string[]
): boolean {
  const nextUrls = normalizeUploadModelUrls(value)
  return (
    nextUrls.length !== lastSyncedUrls.length ||
    nextUrls.some((url, index) => url !== lastSyncedUrls[index])
  )
}
