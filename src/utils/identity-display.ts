/** Treat serialized null sentinels as missing when composing user-facing identities. */
export function normalizeIdentityDisplayText(value: unknown): string {
  const text = String(value ?? '').trim()
  return /^(?:null|undefined)$/i.test(text) ? '' : text
}
