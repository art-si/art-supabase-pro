export const gitSubmodulePathPattern: string

export function parseGitSubmodulePaths(output: string): Array<{ name: string; path: string }>
