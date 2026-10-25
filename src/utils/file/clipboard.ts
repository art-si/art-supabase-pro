import dayjs from 'dayjs'

/** Prefer clipboard items so pasted screenshots work in browsers with an empty files list. */
export function getClipboardFiles(clipboardData: DataTransfer | null): File[] {
  const itemFiles = Array.from(clipboardData?.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)

  return itemFiles.length ? itemFiles : Array.from(clipboardData?.files ?? [])
}

function getClipboardFileExtension(mimeType: string): string {
  const knownExtensions: Record<string, string> = {
    'application/msword': 'doc',
    'application/pdf': 'pdf',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'audio/mpeg': 'mp3',
    'image/jpeg': 'jpg',
    'image/svg+xml': 'svg',
    'image/x-icon': 'ico',
    'text/plain': 'txt',
    'video/quicktime': 'mov'
  }
  return knownExtensions[mimeType] ?? mimeType.split('/')[1]?.split('+')[0] ?? 'bin'
}

/** Clipboard screenshots often have only a generic browser-generated name. */
export function createNamedClipboardFile(file: File, index: number, total: number): File {
  const originalName = file.name.trim()
  if (originalName && !/^(?:image|blob)(?:\.[^.]+)?$/i.test(originalName)) return file

  const timestamp = dayjs().format('YYYYMMDD_HHmmss')
  const sequence = total > 1 ? `_${index + 1}` : ''
  const extension = getClipboardFileExtension(file.type)
  const prefix = file.type.startsWith('image/') ? '粘贴图片' : '粘贴文件'
  return new File([file], `${prefix}_${timestamp}${sequence}.${extension}`, {
    type: file.type,
    lastModified: Date.now()
  })
}

/** Copy only after a confirmed native write; unsupported or denied writes must reject. */
export async function copyTextToClipboard(
  value: string,
  options: { legacyFallback?: boolean } = {}
): Promise<void> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
    if (options.legacyFallback) return copyTextWithSelection(value)
    throw new Error('当前浏览器不支持复制，请手动选择文字复制')
  }
  try {
    await navigator.clipboard.writeText(value)
  } catch (cause) {
    if (options.legacyFallback) return copyTextWithSelection(value)
    throw new Error('复制失败，请检查浏览器剪贴板权限或手动复制', { cause })
  }
}

/** Explicit compatibility mode; a failed browser command must never report success. */
function copyTextWithSelection(value: string): void {
  const previousFocus = document.activeElement
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.readOnly = true
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  document.body.appendChild(textarea)
  try {
    textarea.focus({ preventScroll: true })
    textarea.select()
    if (!document.execCommand('copy')) throw new Error('复制失败，请手动选择文字复制')
  } finally {
    textarea.remove()
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true })
    }
  }
}
