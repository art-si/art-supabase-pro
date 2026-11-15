import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { normalizePath, type Plugin } from 'vite'
import { fileViewerOptions } from '../src/components/core/media/art-file-viewer/options.ts'

const PRETTY_PRINT_OPT_IN =
  '(textOptions === null || textOptions === void 0 ? void 0 : textOptions.prettyPrint) === true'

export function createFileViewerSourcePreviewPlugin(packageRequire: NodeJS.Require): Plugin {
  const plugin: Plugin = { name: 'file-viewer-source-preview', apply: 'build', enforce: 'pre' }
  if (fileViewerOptions.text.prettyPrint) return plugin

  const presetRequire = createRequire(packageRequire.resolve('@file-viewer/preset-all'))
  const rendererManifest = presetRequire.resolve('@file-viewer/renderer-text/package.json')
  const rendererVersion: { version?: unknown } = JSON.parse(readFileSync(rendererManifest, 'utf8'))
  if (rendererVersion.version !== '3.1.2') return plugin

  const renderer = normalizePath(path.join(path.dirname(rendererManifest), 'dist/code.js'))
  return {
    ...plugin,
    transform(code, id) {
      if (normalizePath(id) !== renderer || !code.includes(PRETTY_PRINT_OPT_IN)) return
      // The shared preview options keep this opt-in branch disabled. Allow tree shaking
      // of its optional formatter while preserving the renderer's original source path.
      return { code: code.replace(PRETTY_PRINT_OPT_IN, 'false'), map: null }
    }
  }
}
