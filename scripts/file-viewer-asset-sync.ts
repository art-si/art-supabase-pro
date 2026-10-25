import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { Plugin, ResolvedConfig } from 'vite'

const ASSET_MANIFEST = 'flyfish-viewer-assets.json'
const RETRYABLE_FS_ERROR_CODES = new Set(['EACCES', 'EBUSY', 'EPERM', 'UNKNOWN'])
const MAX_FS_ATTEMPTS = 6

// Current CAD clients resolve the versioned runtime directory. The unversioned
// copies and workers already emitted by Vite add bytes without another consumer.
export const REDUNDANT_FILE_VIEWER_ASSETS = [
  'vendor/pptx/pptx.worker.js',
  'vendor/libarchive/worker-bundle.js',
  'wasm/cad/dwg-worker.js',
  'wasm/cad/libredwg-web.js',
  'wasm/cad/libredwg-web.wasm',
  'wasm/cad/dwfv-render.wasm'
] as const

interface FileViewerAssetManifest {
  assets?: unknown[]
  [key: string]: unknown
}

export interface FileViewerAssetSyncResult {
  copied: number
  pruned: number
  total: number
  unchanged: number
}

interface FileViewerAssetSyncPluginOptions {
  enabled: boolean
  sourceRoot: string
  excludedFiles?: readonly string[]
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function listFiles(root: string, relativeDirectory = ''): Promise<string[]> {
  const directory = path.join(root, relativeDirectory)
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, relativePath)))
    } else if (entry.isFile()) {
      files.push(relativePath)
    }
  }

  return files
}

async function filesAreEqual(source: string, target: string): Promise<boolean> {
  try {
    const [sourceInfo, targetInfo] = await Promise.all([stat(source), stat(target)])
    if (sourceInfo.size !== targetInfo.size) return false

    const [sourceContent, targetContent] = await Promise.all([readFile(source), readFile(target)])
    return sourceContent.equals(targetContent)
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false
    throw error
  }
}

async function retryTransientFsOperation<T>(
  operation: () => Promise<T>,
  failureMessage: string
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      const shouldRetry =
        isNodeError(error) &&
        Boolean(error.code && RETRYABLE_FS_ERROR_CODES.has(error.code)) &&
        attempt < MAX_FS_ATTEMPTS

      if (!shouldRetry) {
        throw new Error(failureMessage, { cause: error })
      }

      await delay(100 * 2 ** (attempt - 1))
    }
  }
}

async function copyFileWithRetry(source: string, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true })
  await retryTransientFsOperation(
    () => copyFile(source, target),
    `复制 File Viewer 构建资源失败：${target}`
  )
}

async function writeFileIfChanged(target: string, content: Buffer): Promise<boolean> {
  try {
    const currentContent = await readFile(target)
    if (currentContent.equals(content)) return false
  } catch (error) {
    if (!isNodeError(error) || error.code !== 'ENOENT') throw error
  }

  await mkdir(path.dirname(target), { recursive: true })
  await retryTransientFsOperation(
    () => writeFile(target, content),
    `写入 File Viewer 构建清单失败：${target}`
  )
  return true
}

const normalizeRelativePath = (relativePath: string): string => relativePath.replace(/\\/g, '/')

function normalizeExcludedFilePath(relativePath: string): string {
  const normalizedPath = normalizeRelativePath(path.normalize(relativePath))
  if (
    !normalizedPath ||
    normalizedPath === '.' ||
    path.isAbsolute(relativePath) ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../')
  ) {
    throw new Error(`File Viewer 排除资源路径无效：${relativePath}`)
  }

  return normalizedPath
}

async function removeFileIfPresent(target: string): Promise<boolean> {
  try {
    const targetInfo = await stat(target)
    if (!targetInfo.isFile()) {
      throw new Error(`File Viewer 排除资源不是文件：${target}`)
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return false
    throw error
  }

  await rm(target, { force: true })
  return true
}

async function createOutputManifest(
  sourceRoot: string,
  targetRoot: string,
  excludedFiles: ReadonlySet<string>
): Promise<Buffer> {
  const sourceManifest = path.join(sourceRoot, ASSET_MANIFEST)
  const parsed: unknown = JSON.parse(await readFile(sourceManifest, 'utf8'))
  if (!isRecord(parsed)) {
    throw new Error('File Viewer 构建资源清单格式无效')
  }

  const manifest = parsed as FileViewerAssetManifest
  const assets = Array.isArray(manifest.assets)
    ? manifest.assets
        .filter((asset) => {
          if (!isRecord(asset) || typeof asset.to !== 'string') return true
          const relativeTarget = normalizeRelativePath(path.relative(sourceRoot, asset.to))
          return !excludedFiles.has(relativeTarget)
        })
        .map((asset) => {
          if (!isRecord(asset) || typeof asset.to !== 'string') return asset

          const relativeTarget = path.relative(sourceRoot, asset.to)
          if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) return asset

          return {
            ...asset,
            to: path.join(targetRoot, relativeTarget)
          }
        })
    : manifest.assets

  return Buffer.from(`${JSON.stringify({ ...manifest, assets }, null, 2)}\n`)
}

/**
 * Incrementally synchronizes File Viewer assets into the Vite output directory.
 * Existing byte-identical files are never removed or overwritten, which avoids
 * Windows EBUSY failures when antivirus or a preview process temporarily holds
 * a generated font file open. Explicitly excluded compatibility files are
 * pruned from the final output so Vite's public directory cannot reintroduce a
 * duplicate of an asset already emitted by the application bundle.
 */
export async function syncFileViewerAssets(
  sourceRoot: string,
  targetRoot: string,
  excludedFilePaths: readonly string[] = []
): Promise<FileViewerAssetSyncResult> {
  const sourceInfo = await stat(sourceRoot)
  if (!sourceInfo.isDirectory()) {
    throw new Error(`File Viewer 构建资源目录不存在：${sourceRoot}`)
  }

  const excludedFiles = new Set(excludedFilePaths.map(normalizeExcludedFilePath))
  const relativeFiles = (await listFiles(sourceRoot)).filter((relativePath) => {
    const normalizedPath = normalizeRelativePath(relativePath)
    return normalizedPath !== ASSET_MANIFEST && !excludedFiles.has(normalizedPath)
  })
  let copied = 0
  let pruned = 0
  let unchanged = 0

  for (const relativeFile of relativeFiles) {
    const source = path.join(sourceRoot, relativeFile)
    const target = path.join(targetRoot, relativeFile)

    if (await filesAreEqual(source, target)) {
      unchanged += 1
      continue
    }

    await copyFileWithRetry(source, target)
    copied += 1
  }

  const manifestChanged = await writeFileIfChanged(
    path.join(targetRoot, ASSET_MANIFEST),
    await createOutputManifest(sourceRoot, targetRoot, excludedFiles)
  )
  if (manifestChanged) copied += 1
  else unchanged += 1

  for (const excludedFile of excludedFiles) {
    const target = path.resolve(targetRoot, excludedFile)
    if (await removeFileIfPresent(target)) pruned += 1
  }

  return {
    copied,
    pruned,
    unchanged,
    total: relativeFiles.length + 1
  }
}

export function createFileViewerAssetSyncPlugin(options: FileViewerAssetSyncPluginOptions): Plugin {
  let resolvedConfig: ResolvedConfig | undefined
  let outputWritten = false

  return {
    name: 'file-viewer-asset-sync',
    apply: 'build',
    // Vite 8 also runs closeBundle for nested Web Worker builds. Syncing from
    // there races the top-level vite:prepare-out-dir cleanup on Windows.
    applyToEnvironment: (environment) => !environment.config.isWorker,
    configResolved(config) {
      resolvedConfig = config
    },
    buildStart() {
      outputWritten = false
    },
    writeBundle() {
      outputWritten = true
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        // closeBundle also runs after a failed build; never recreate partial output.
        if (!options.enabled || !outputWritten) return
        if (!resolvedConfig) throw new Error('Vite 配置尚未完成，无法同步 File Viewer 资源')

        const targetRoot = path.resolve(resolvedConfig.root, resolvedConfig.build.outDir)
        const result = await syncFileViewerAssets(
          options.sourceRoot,
          targetRoot,
          options.excludedFiles
        )
        console.log(
          `[vite] File Viewer 资源同步完成：复制 ${result.copied}，跳过未变化 ${result.unchanged}，移除重复 ${result.pruned}`
        )
      }
    }
  }
}
