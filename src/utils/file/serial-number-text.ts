/** Normalize manually entered or imported serial numbers into individual values. */
export function parseSerialNumberText(text: string): string[] {
  return text
    .split(/[,\r\n]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}
