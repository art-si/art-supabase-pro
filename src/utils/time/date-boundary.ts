/** Build a wall-clock timestamp without converting the caller's date or timezone. */
export function toDateStartTimestamp(date?: string | null): string | null {
  return date ? `${date}T00:00:00` : null
}

/** Inclusive millisecond end used by existing list filters and RPC parameters. */
export function toDateEndTimestamp(date?: string | null): string | null {
  return date ? `${date}T23:59:59.999` : null
}
