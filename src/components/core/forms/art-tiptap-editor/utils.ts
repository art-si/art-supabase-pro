const ABSOLUTE_PROTOCOL_PATTERN = /^[a-z][a-z\d+.-]*:/i

export function normalizeEditorUrl(rawValue: string, allowedProtocols: string[]): string {
  const value = rawValue.trim()
  if (!value) return ''
  if (value.startsWith('/') || value.startsWith('#')) return value

  const candidate = ABSOLUTE_PROTOCOL_PATTERN.test(value) ? value : `https://${value}`

  try {
    const parsedUrl = new URL(candidate)
    return allowedProtocols.includes(parsedUrl.protocol) ? parsedUrl.href : ''
  } catch {
    return ''
  }
}
