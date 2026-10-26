/** Resolve a user-visible link while allowing only browser HTTP transports. */
export function resolveHttpUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}
