/** Temporary account passwords always contain cryptographic randomness, even with minimal policy. */
export function createSecureTemporaryPassword(minLength: number, requireComplex: boolean): string {
  const prefix = requireComplex ? 'Aa1!' : ''
  const targetLength = Math.max(minLength, 16)
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*'
  const randomValues = new Uint32Array(targetLength - prefix.length)
  globalThis.crypto.getRandomValues(randomValues)
  return (
    prefix + Array.from(randomValues, (value) => characters[value % characters.length]).join('')
  )
}
