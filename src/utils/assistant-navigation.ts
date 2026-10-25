export interface AssistantDestination {
  title: string
  path: string
}

/** Only match the caller's authorized menu inventory; no model-provided URLs. */
export function matchAssistantDestinations(
  content: string,
  destinations: AssistantDestination[]
): AssistantDestination[] | null {
  const match = /^(?:请|帮我|请帮我)?(?:打开|进入|跳转到|前往)\s*(.+?)[。！!]?$/u.exec(
    content.trim()
  )
  if (!match) return null
  const target = match[1].trim()
  const exact = destinations.filter((item) => item.title === target || item.path === target)
  return (exact.length ? exact : destinations.filter((item) => item.title.includes(target))).slice(
    0,
    8
  )
}

export function parseAssistantFilters(content: string): Record<string, string> | null {
  const match = /^筛选[：:]\s*(.+)$/u.exec(content.trim())
  if (!match) return null
  const entries = match[1].split(/[，,；;]/u).map((part) => part.trim().split('='))
  if (entries.some((entry) => entry.length !== 2 || !entry[0].trim() || !entry[1].trim()))
    return null
  return Object.fromEntries(entries.map(([key, value]) => [key.trim(), value.trim()]))
}
