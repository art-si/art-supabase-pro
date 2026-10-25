export const DICTIONARY_CACHE_TTL_MS = 5 * 60 * 1000

/** A successful empty result is cached for the same interval as a populated dictionary. */
export function isDictionaryCacheFresh(
  codeFetchedAt: number | undefined,
  listFetchedAt: number,
  now = Date.now()
): boolean {
  const fetchedAt = Math.max(codeFetchedAt ?? 0, listFetchedAt)
  return fetchedAt > 0 && now >= fetchedAt && now - fetchedAt < DICTIONARY_CACHE_TTL_MS
}
