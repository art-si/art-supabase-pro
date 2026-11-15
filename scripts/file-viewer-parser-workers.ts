import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { normalizePath, type Plugin } from 'vite'

const HANGUL_CFB_DYNAMIC_IMPORT = "const CFB = await import('cfb');"

const DOCUMENT_PARSERS = [
  {
    format: 'iwork',
    parserName: 'parseIworkDocument',
    parserArguments: 'buffer, type, limits',
    clientName: 'parseIworkWithWorker',
    loadFailure: 'iWork Worker failed to load.',
    workerError: `{
      name: error instanceof Error ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
      actualRendererId: error && typeof error === 'object' && 'actualRendererId' in error
        ? String(error.actualRendererId)
        : undefined
    }`
  },
  {
    format: 'hangul',
    parserName: 'parseHangulDocument',
    parserArguments: 'buffer, type, undefined, limits',
    clientName: 'parseHangulWithWorker',
    loadFailure: 'Hangul Worker failed to load.',
    workerError: 'error instanceof Error ? error.message : String(error)'
  }
] as const

export function matchFileViewerIworkParser(id: string): boolean {
  const moduleId = normalizePath(id)
  return (
    moduleId.endsWith('/node_modules/@file-viewer/renderer-iwork/dist/parser.js') ||
    moduleId.includes('/node_modules/keynote-archives/') ||
    moduleId.includes('/node_modules/@protobuf-ts/runtime/')
  )
}

export function createFileViewerParserWorkersPlugin(packageRequire: NodeJS.Require): Plugin {
  const presetRequire = createRequire(packageRequire.resolve('@file-viewer/preset-all'))
  const renderers = DOCUMENT_PARSERS.flatMap((config) => {
    const packageName = `@file-viewer/renderer-${config.format}`
    const rendererManifest = presetRequire.resolve(`${packageName}/package.json`)
    const rendererVersion: { version?: unknown } = JSON.parse(
      readFileSync(rendererManifest, 'utf8')
    )
    // These internal source paths and message contracts were verified in 3.1.2.
    if (rendererVersion.version !== '3.1.2') return []

    const parserEntry = `${packageName}/parser`
    const bundledParser = normalizePath(presetRequire.resolve(parserEntry))
    const directory = path.posix.dirname(bundledParser)
    const parserSource = path.posix.join(directory, 'parser.js')
    const workerClient = path.posix.join(directory, 'workerClient.js')
    if (!existsSync(workerClient)) return []
    const isShareable =
      existsSync(parserSource) &&
      (config.format !== 'hangul' ||
        readFileSync(parserSource, 'utf8').includes(HANGUL_CFB_DYNAMIC_IMPORT))

    return [
      {
        ...config,
        directory,
        parserEntry,
        parser: isShareable ? parserSource : bundledParser,
        workerClient,
        bundledImport: `./${path.posix.basename(bundledParser)}`,
        workerPath: `vendor/${config.format}/${config.format}.worker.js`,
        workerModule: `\0platform:file-viewer-${config.format}-worker`,
        clientModule: `\0platform:file-viewer-${config.format}-client`
      }
    ]
  })

  return {
    name: 'share-file-viewer-parser-workers',
    apply: 'build',
    enforce: 'pre',
    buildStart() {
      // One build graph lets the browser fallback and module worker import identical named chunks.
      for (const { workerModule, workerPath } of renderers) {
        this.emitFile({ type: 'chunk', id: workerModule, fileName: workerPath })
      }
    },
    resolveId(source, importer) {
      const importerDirectory = importer && path.posix.dirname(normalizePath(importer))
      for (const renderer of renderers) {
        if (source === renderer.workerModule || source === renderer.clientModule) return source
        if (source === renderer.parserEntry) return renderer.parser
        if (importerDirectory !== renderer.directory) continue
        if (source === renderer.bundledImport) return renderer.parser
        if (source === './workerClient.js') return renderer.clientModule
      }
    },
    transform(code, id) {
      const hangul = renderers.find(({ format }) => format === 'hangul')
      if (normalizePath(id) !== hangul?.parser || !code.includes(HANGUL_CFB_DYNAMIC_IMPORT)) return
      // Vite's dynamic-import preload helper accesses document. Bind the same CFB
      // namespace statically, as the standalone prebundle does inside its worker.
      return {
        code: `import * as CFB from 'cfb';\n${code.replace(HANGUL_CFB_DYNAMIC_IMPORT, '')}`,
        map: null
      }
    },
    load(id) {
      const renderer = renderers.find(
        ({ workerModule, clientModule }) => id === workerModule || id === clientModule
      )
      if (!renderer) return
      if (id === renderer.workerModule) {
        return `
          import { ${renderer.parserName} as parse } from ${JSON.stringify(renderer.parser)};
          self.addEventListener('message', async ({ data: { id, buffer, type, limits } }) => {
            try {
              const document = await parse(${renderer.parserArguments});
              self.postMessage({ id, ok: true, document });
            } catch (error) {
              self.postMessage({ id, ok: false, error: ${renderer.workerError} });
            }
          });
        `
      }
      return `
        import { ${renderer.clientName} as parse } from ${JSON.stringify(renderer.workerClient)};
        export async function ${renderer.clientName}(buffer, type, options, signal) {
          try {
            return await parse(buffer, type, options, signal);
          } catch (error) {
            const workerLoadFailed = error instanceof Error && error.message === ${JSON.stringify(renderer.loadFailure)};
            const workerUnavailable = error instanceof DOMException &&
              (error.name === 'SecurityError' || error.name === 'NotSupportedError');
            if (options?.useWorker === false || signal?.aborted || (!workerLoadFailed && !workerUnavailable)) {
              throw error;
            }
            return parse(buffer, type, { ...options, useWorker: false }, signal);
          }
        }
      `
    }
  }
}
