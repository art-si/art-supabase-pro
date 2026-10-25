import { trim } from 'lodash-es'

/** Keep the detail field free of the longest region prefix supplied by the map or selector. */
export function stripRegionPrefix(address: string, path: readonly string[]): string {
  const normalizedAddress = trim(address)
  if (!normalizedAddress || !path.length) return normalizedAddress
  const prefixes = path.filter(Boolean).reduce<string[]>((result, item) => {
    result.push(`${result.at(-1) ?? ''}${item}`)
    return result
  }, [])
  const matchedPrefix = prefixes.reverse().find((prefix) => normalizedAddress.startsWith(prefix))
  return trim(matchedPrefix ? normalizedAddress.slice(matchedPrefix.length) : normalizedAddress)
}
