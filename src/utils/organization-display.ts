const ORGANIZATION_TYPE_ICONS: Record<Api.SystemManage.OrganizationType, string> = {
  company: 'ri:building-4-line',
  division: 'ri:git-branch-line',
  department: 'ri:team-line',
  team: 'ri:group-2-line'
}

export function getOrganizationTypeIcon(
  type: string | null | undefined,
  fallback = 'ri:node-tree'
): string {
  return type && Object.hasOwn(ORGANIZATION_TYPE_ICONS, type)
    ? ORGANIZATION_TYPE_ICONS[type as Api.SystemManage.OrganizationType]
    : fallback
}

export function matchesOrganizationKeyword(keyword: string, name: unknown, code: unknown): boolean {
  const normalized = keyword.trim().toLocaleLowerCase('zh-CN')
  if (!normalized) return true
  return [name, code].some((value) =>
    String(value ?? '')
      .toLocaleLowerCase('zh-CN')
      .includes(normalized)
  )
}

export function matchesOrganizationNodeKeyword(
  keyword: string,
  node: { organizationName?: unknown; organizationCode?: unknown }
): boolean {
  return matchesOrganizationKeyword(keyword, node.organizationName, node.organizationCode)
}
