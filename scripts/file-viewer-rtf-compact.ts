import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizePath, type Plugin } from 'vite'
import { packRtfCodepages } from './file-viewer-rtf-codepages.ts'

const upstreamImport = "import('rtf.js/dist/RTFJS.bundle.js')"
const runtimeId = 'virtual:art-file-viewer-rtf'
const virtualRuntimeId = `\0${runtimeId}`
const decoderPath = normalizePath(
  fileURLToPath(new URL('./file-viewer-rtf-codepages.ts', import.meta.url))
)

function readPackageVersion(manifest: string): unknown {
  return JSON.parse(readFileSync(manifest, 'utf8')).version
}

function resolveRtfPackage(root: string) {
  const projectRequire = createRequire(path.join(root, 'package.json'))
  const presetRequire = createRequire(
    projectRequire.resolve('@file-viewer/preset-all/package.json')
  )
  const capabilityManifest = presetRequire.resolve('@file-viewer/capability-rtf/package.json')
  const capabilityRequire = createRequire(capabilityManifest)
  const rtfManifest = capabilityRequire.resolve('rtf.js/package.json')
  const rtfRequire = createRequire(rtfManifest)
  const codepageManifest = rtfRequire.resolve('codepage/package.json')

  if (
    readPackageVersion(capabilityManifest) !== '3.1.2' ||
    readPackageVersion(rtfManifest) !== '3.0.9' ||
    readPackageVersion(codepageManifest) !== '1.15.0'
  ) {
    return
  }

  const capability = normalizePath(path.join(path.dirname(capabilityManifest), 'dist/index.js'))
  const rtfRoot = path.dirname(rtfManifest)
  const rtfSource = normalizePath(path.join(rtfRoot, 'src/rtfjs'))
  const documentFacade = `${rtfSource}/DocumentFacade.ts`
  const helper = `${rtfSource}/Helper.ts`
  const emf = normalizePath(path.join(rtfRoot, 'dist/EMFJS.bundle.min.js'))
  const wmf = normalizePath(path.join(rtfRoot, 'dist/WMFJS.bundle.min.js'))
  const codepageRoot = path.dirname(codepageManifest)
  const sourceTable = path.join(codepageRoot, 'cptable.js')
  if (![capability, documentFacade, helper, emf, wmf, sourceTable].every(existsSync)) return
  if (readFileSync(capability, 'utf8').split(upstreamImport).length !== 2) return

  return {
    capability,
    rtfSource,
    rtfRoot,
    codepageRoot,
    documentFacade,
    helper,
    emf,
    wmf,
    sourceTable,
    rtfRequire
  }
}

export function createFileViewerRtfCompactPlugin(root: string): Plugin {
  let resolved: ReturnType<typeof resolveRtfPackage>

  return {
    name: 'art-file-viewer-compact-rtf',
    apply: 'build',
    enforce: 'pre',
    buildStart() {
      try {
        resolved = resolveRtfPackage(root)
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED')
        ) {
          throw error
        }
        resolved = undefined
      }
    },
    resolveId(source, importer) {
      if (!resolved) return
      if (source === runtimeId) return virtualRuntimeId
      if (!importer || !normalizePath(importer).startsWith(`${resolved.rtfSource}/`)) return
      if (source === 'codepage') return decoderPath
      if (source === 'EMFJS') return resolved.emf
      if (source === 'WMFJS') return resolved.wmf
    },
    transform(source, id) {
      if (resolved && normalizePath(id) === resolved.capability) {
        return source.replace(upstreamImport, `import('${runtimeId}').then(({ load }) => load())`)
      }
    },
    load(id) {
      if (id !== virtualRuntimeId || !resolved) return
      const source = packRtfCodepages(resolved.rtfRequire(resolved.sourceTable))
      const dataAsset = this.emitFile({
        type: 'asset',
        name: 'rtf-codepages.bin',
        source
      })
      this.emitFile({
        type: 'asset',
        fileName: 'vendor/rtf/LICENSE-rtf-js.txt',
        source: readFileSync(path.join(resolved.rtfRoot, 'LICENSE'))
      })
      this.emitFile({
        type: 'asset',
        fileName: 'vendor/rtf/LICENSE-sheetjs-codepage.txt',
        source: readFileSync(path.join(resolved.codepageRoot, 'LICENSE'))
      })
      // The package's TypeScript index re-exports a type as a value. Load the runtime exports directly.
      return `
import { loadRtfCodepages } from ${JSON.stringify(decoderPath)};
import { DocumentFacade } from ${JSON.stringify(resolved.documentFacade)};
import { loggingEnabled } from ${JSON.stringify(resolved.helper)};
export async function load() {
  await loadRtfCodepages(import.meta.ROLLUP_FILE_URL_${dataAsset}, ${source.byteLength});
  return { Document: DocumentFacade, loggingEnabled };
}
`
    }
  }
}
