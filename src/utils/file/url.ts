/** Resolve browser file actions without allowing executable or opaque URL schemes. */
export function resolveFileActionUrl(
  value: string | null | undefined,
  baseUrl: string
): string | null {
  if (typeof value !== 'string') return null
  const input = value.trim()
  if (!input || input.startsWith('#')) return null

  try {
    const base = new URL(baseUrl)
    const url = new URL(input, base)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
    if (url.protocol !== 'blob:' || base.origin === 'null' || url.origin !== base.origin)
      return null

    const objectUrl = new URL(url.pathname)
    return objectUrl.origin === base.origin && objectUrl.pathname.split('/').at(-1)
      ? url.href
      : null
  } catch {
    return null
  }
}
