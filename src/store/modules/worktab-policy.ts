export const MAX_OPENED_WORKTABS = 18

export interface WorktabPolicyItem {
  path: string
  fixedTab?: boolean
}

export interface WorktabLimitResult<T extends WorktabPolicyItem> {
  kept: T[]
  removed: T[]
}

/**
 * Enforces the global worktab limit while preserving fixed tabs and the active tab.
 * Paths near the end of `recentPaths` are considered more recently used.
 */
export function limitWorktabs<T extends WorktabPolicyItem>(
  tabs: T[],
  recentPaths: string[],
  activePath?: string,
  maxTabs = MAX_OPENED_WORKTABS
): WorktabLimitResult<T> {
  const normalizedMax = Math.max(1, Math.floor(maxTabs))
  const overflow = tabs.length - normalizedMax

  if (overflow <= 0) {
    return { kept: tabs, removed: [] }
  }

  const recency = new Map(recentPaths.map((path, index) => [path, index]))
  const candidates = tabs
    .map((tab, index) => ({ tab, index }))
    .filter(({ tab }) => !tab.fixedTab && tab.path !== activePath)
    .sort((left, right) => {
      const leftRank = recency.get(left.tab.path) ?? left.index - tabs.length
      const rightRank = recency.get(right.tab.path) ?? right.index - tabs.length
      return leftRank - rightRank
    })

  const removedPaths = new Set(candidates.slice(0, overflow).map(({ tab }) => tab.path))
  const removed = tabs.filter((tab) => removedPaths.has(tab.path))
  const kept = tabs.filter((tab) => !removedPaths.has(tab.path))

  return { kept, removed }
}
