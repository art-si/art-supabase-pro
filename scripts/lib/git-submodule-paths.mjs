const prefix = 'submodule.'
const suffix = '.path'

export const gitSubmodulePathPattern = '^submodule\\..*\\.path$'

export function parseGitSubmodulePaths(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(' ')
      const key = line.slice(0, separator)
      return {
        name: key.slice(prefix.length, -suffix.length),
        path: line.slice(separator + 1).trim()
      }
    })
}
