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

/** Copy only after a confirmed write; an aborted owner cannot fall back or accept a late acknowledgement. */
export async function copyTextToClipboard(
  value: string,
  options: { legacyFallback?: boolean; signal?: AbortSignal } = {}
): Promise<void> {
  options.signal?.throwIfAborted()
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
    options.signal?.throwIfAborted()
    if (options.legacyFallback) return copyTextWithSelection(value)
    throw new Error('当前浏览器不支持复制，请手动选择文字复制')
  }
  try {
    await navigator.clipboard.writeText(value)
    options.signal?.throwIfAborted()
  } catch (cause) {
    options.signal?.throwIfAborted()
    if (options.legacyFallback) return copyTextWithSelection(value)
    throw new Error('复制失败，请检查浏览器剪贴板权限或手动复制', { cause })
  }
}

export interface ClipboardTextRepresentations {
  html: string
  text: string
}

function supportsClipboardItems(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.write === 'function' &&
    typeof ClipboardItem === 'function'
  )
}

function supportsClipboardType(type: string): boolean {
  if (!supportsClipboardItems()) return false
  try {
    return typeof ClipboardItem.supports !== 'function' || ClipboardItem.supports(type)
  } catch {
    return false
  }
}

/** Capability only: permission and focus are checked by the actual native write. */
export function supportsFormattedClipboard(): boolean {
  return supportsClipboardType('text/html') && supportsClipboardType('text/plain')
}

/** Keep the native write in the click gesture while deferred content is being prepared. */
export async function copyFormattedTextToClipboard(
  prepare: () => Promise<ClipboardTextRepresentations>,
  format: 'table' | 'text' = 'table'
): Promise<void> {
  if (format === 'table' && !supportsFormattedClipboard())
    throw new Error('当前浏览器不支持表格复制，可选择复制 TSV，或使用导出结果')
  if (!supportsClipboardType('text/plain')) {
    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function')
      throw new Error('当前浏览器不支持复制，请使用导出结果')
    const content = await prepare()
    await copyTextToClipboard(content.text)
    return
  }

  let preparationFailed = false
  let preparationError: unknown
  const prepared = Promise.resolve()
    .then(prepare)
    .catch((cause: unknown) => {
      preparationFailed = true
      preparationError = cause
      throw cause
    })
  const representations: Record<string, Promise<Blob>> = {}
  if (format === 'table')
    representations['text/html'] = prepared.then(
      (content) => new Blob([content.html], { type: 'text/html' })
    )
  representations['text/plain'] = prepared.then(
    (content) => new Blob([content.text], { type: 'text/plain' })
  )
  // A permission rejection can happen before the browser consumes these promises.
  // Keep late preparation failures handled, without changing what the native item receives.
  for (const value of Object.values(representations)) void value.catch(() => undefined)
  try {
    await navigator.clipboard.write([new ClipboardItem(representations)])
  } catch (cause) {
    if (preparationFailed) throw preparationError
    throw new Error('复制失败，请检查浏览器剪贴板权限，或使用导出结果', { cause })
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
