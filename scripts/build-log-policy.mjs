const BROWSER_EXTERNALIZATION_PATTERN =
  /Module "([^"]+)" has been externalized for browser compatibility, imported by "([^"]+)"/

const KNOWN_FILE_VIEWER_TRANSITIVE_PACKAGES = [
  '/node_modules/.pnpm/avsc@',
  '/node_modules/.pnpm/@ljheee+xmind-parser@',
  '/node_modules/.pnpm/ag-psd@',
  '/node_modules/.pnpm/jszip@'
]

/**
 * @param {{ message?: string }} log
 * @returns {string | null}
 */
export function getKnownFileViewerExternalization(log) {
  const match = (log.message || '').match(BROWSER_EXTERNALIZATION_PATTERN)
  if (!match) return null

  const [, builtinModule, importer] = match
  const normalizedImporter = importer.replace(/\\/g, '/')
  const knownPackage = KNOWN_FILE_VIEWER_TRANSITIVE_PACKAGES.find((packagePath) =>
    normalizedImporter.includes(packagePath)
  )

  return knownPackage
    ? `${builtinModule}:${knownPackage.slice('/node_modules/.pnpm/'.length, -1)}`
    : null
}

export function createBuildLogPolicy() {
  const knownFileViewerExternalizations = new Set()

  return {
    chunkSizeWarningLimit: 7000,
    rolldownOptions: {
      onLog(level, log, defaultHandler) {
        const knownExternalization =
          level === 'warn' ? getKnownFileViewerExternalization(log) : null
        if (knownExternalization) {
          knownFileViewerExternalizations.add(knownExternalization)
          return
        }
        defaultHandler(level, log)
      },
      checks: {
        invalidAnnotation: false,
        pluginTimings: false
      }
    },
    summaryPlugin: {
      name: 'known-file-viewer-browser-external-summary',
      apply: 'build',
      closeBundle() {
        if (!knownFileViewerExternalizations.size) return
        console.warn(
          `[vite] file-viewer 使用 ${knownFileViewerExternalizations.size} 个已知浏览器 external shim：${[
            ...knownFileViewerExternalizations
          ].join(', ')}`
        )
      }
    }
  }
}
