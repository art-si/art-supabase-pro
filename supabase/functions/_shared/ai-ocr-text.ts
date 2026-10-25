export const MAX_OCR_RAW_TEXT_LENGTH = 30_000

export function normalizeOcrRawText(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, MAX_OCR_RAW_TEXT_LENGTH)
}
