export interface FilePreviewTarget {
  url?: string
  name?: string
  fileType?: string
}

interface StoredFilePreview {
  file: FilePreviewTarget
  expiresAt: number
}

type FilePreviewOpenResult = 'opened' | 'missing-url' | 'blocked' | 'storage-unavailable'

const STORAGE_PREFIX = 'art-file-preview:'
const PREVIEW_TTL = 30 * 60 * 1000

const isStoredFilePreview = (value: unknown): value is StoredFilePreview => {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('expiresAt' in value) ||
    typeof value.expiresAt !== 'number' ||
    !Number.isFinite(value.expiresAt) ||
    !('file' in value) ||
    typeof value.file !== 'object' ||
    value.file === null
  )
    return false

  const file = value.file
  return (
    'url' in file &&
    typeof file.url === 'string' &&
    Boolean(file.url.trim()) &&
    (!('name' in file) || typeof file.name === 'string') &&
    (!('fileType' in file) || typeof file.fileType === 'string')
  )
}

const parseStoredFilePreview = (value: string | null): StoredFilePreview | undefined => {
  if (!value) return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    return isStoredFilePreview(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

const cleanupExpiredPreviews = (): void => {
  const now = Date.now()

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(STORAGE_PREFIX)) continue

    try {
      const value = localStorage.getItem(key)
      const preview = parseStoredFilePreview(value)
      if (!preview || preview.expiresAt <= now) localStorage.removeItem(key)
    } catch {
      localStorage.removeItem(key)
    }
  }
}

const createPreviewKey = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const openFilePreview = (file: FilePreviewTarget): FilePreviewOpenResult => {
  if (!file.url?.trim()) return 'missing-url'

  const key = createPreviewKey()
  const storageKey = `${STORAGE_PREFIX}${key}`

  try {
    cleanupExpiredPreviews()
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        file: { ...file },
        expiresAt: Date.now() + PREVIEW_TTL
      } satisfies StoredFilePreview)
    )
  } catch {
    return 'storage-unavailable'
  }

  try {
    const previewUrl = new URL(window.location.href)
    previewUrl.hash = `/file-preview?key=${encodeURIComponent(key)}`
    const previewWindow = window.open(previewUrl.toString(), '_blank')

    if (!previewWindow) {
      localStorage.removeItem(storageKey)
      return 'blocked'
    }

    previewWindow.opener = null
    return 'opened'
  } catch {
    try {
      localStorage.removeItem(storageKey)
    } catch {
      return 'storage-unavailable'
    }
    return 'blocked'
  }
}

export const getFilePreviewTarget = (key?: string): FilePreviewTarget | undefined => {
  if (!key) return undefined

  try {
    const value = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (!value) return undefined

    const preview = parseStoredFilePreview(value)
    if (!preview || preview.expiresAt <= Date.now()) {
      localStorage.removeItem(`${STORAGE_PREFIX}${key}`)
      return undefined
    }

    return preview.file
  } catch {
    return undefined
  }
}
