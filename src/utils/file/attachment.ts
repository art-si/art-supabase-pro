/** Derive a complete filename from the URL path without retaining signed query parameters. */
export function getAttachmentNameFromUrl(url: string, fallback = '附件'): string {
  if (typeof url !== 'string' || !url.trim()) return fallback
  try {
    const parsed = new URL(url, 'https://upload.local.invalid')
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback
    const segment = parsed.pathname.split('/').at(-1)
    return (segment ? decodeURIComponent(segment) : '') || fallback
  } catch {
    return fallback
  }
}

/** Preserve the upload controls' bounded automatic label without truncating stored filenames. */
export function getAttachmentDisplayName(url: string, fallback = '附件'): string {
  const name = getAttachmentNameFromUrl(url, fallback)
  return name.length <= 120 ? name : fallback
}

/** Prefer resource metadata; a filename without a suffix has no inferred file type. */
export function getFileExtension(fileName?: string, suffix?: string): string {
  const dotIndex = fileName?.lastIndexOf('.') ?? -1
  const inferred = dotIndex >= 0 ? fileName?.slice(dotIndex + 1) : ''
  return (suffix || inferred || '').trim().replace(/^\./, '').toLowerCase()
}

/** Remove one displayed attachment even when legacy rows share a resource URL. */
export function removeAttachmentRow<
  T extends { url?: string; name?: string; fileType?: string; fileSize?: string }
>(attachments: readonly T[], selected: T): T[] {
  let index = attachments.indexOf(selected)
  if (index < 0)
    index = attachments.findIndex(
      (item) =>
        item.url === selected.url &&
        item.name === selected.name &&
        item.fileType === selected.fileType &&
        item.fileSize === selected.fileSize
    )
  if (index < 0 && selected.url) index = attachments.findIndex((item) => item.url === selected.url)
  return attachments.filter((_, itemIndex) => itemIndex !== index)
}
