import { trim } from 'lodash-es'
import type { AddressRegionOption } from './types'

/** Match old municipality paths to an unambiguous branch in the picker. */
export function resolveAddressPickerRegionPath(
  path: string[],
  options: readonly AddressRegionOption[]
): string[] {
  const [province, city, district] = path
  if (path.length !== 3 || !province || province !== city || !district) return path

  const cities = options.find(({ name }) => name === province)?.children ?? []
  const hasDistrict = (branch: AddressRegionOption) =>
    branch.children?.some(({ name }) => name === district)
  if (cities.some((branch) => branch.name === city && hasDistrict(branch))) return path

  const branches = cities.filter(
    (branch) => ['市辖区', '县'].includes(branch.name) && hasDistrict(branch)
  )
  return branches.length === 1 ? [province, branches[0].name, district] : path
}

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
