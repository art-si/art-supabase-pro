import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'

async function collectFiles(directory: string, extensions: ReadonlySet<string>): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const resolved = path.join(directory, entry.name)
      if (entry.isDirectory()) return collectFiles(resolved, extensions)
      return extensions.has(path.extname(entry.name)) ? [resolved] : []
    })
  )
  return nested.flat()
}

export async function collectFrontendAuditFiles(
  projectRoot: string,
  extensions: ReadonlySet<string>,
  { allowMissingModules = false } = {}
) {
  const hostFiles = await collectFiles(path.join(projectRoot, 'src'), extensions)
  const modulesRoot = path.join(projectRoot, 'modules')
  const moduleDirectories =
    allowMissingModules && !existsSync(modulesRoot)
      ? []
      : (await readdir(modulesRoot, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => path.join(modulesRoot, entry.name))
  const moduleFiles = await Promise.all(
    moduleDirectories.map(async (directory) => {
      const sourceRoot = path.join(directory, 'src')
      try {
        await stat(sourceRoot)
      } catch (error) {
        // Optional repositories may omit src; unreadable or invalid sources still fail the audit.
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
        throw error
      }
      return collectFiles(sourceRoot, extensions)
    })
  )
  return { hostFiles, moduleFiles: moduleFiles.flat(), moduleDirectories }
}
