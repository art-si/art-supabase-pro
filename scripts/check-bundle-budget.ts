import { readFile, readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { isLazyCapabilityAsset, isLazyCapabilityStyle } from './bundle-boundaries'

const KIB = 1024
const MIB = 1024 * KIB
const outputDirectory = resolve(process.env.VITE_OUT_DIR || process.argv[2] || 'docs')

interface BundleAsset {
  path: string
  size: number
  transferredSize?: number
}

const relativePaths = await readdir(outputDirectory, { recursive: true })
const assets: BundleAsset[] = []

for (const relativePath of relativePaths) {
  const assetPath = resolve(outputDirectory, relativePath)
  const metadata = await stat(assetPath)
  if (metadata.isFile()) {
    const normalizedPath = relativePath.replace(/\\/g, '/')
    assets.push({
      path: normalizedPath,
      size: metadata.size,
      transferredSize: /\.(?:css|js)$/.test(normalizedPath)
        ? gzipSync(await readFile(assetPath), { level: 9 }).byteLength
        : undefined
    })
  }
}

const javascriptAssets = assets.filter((asset) => asset.path.endsWith('.js'))
const cssAssets = assets.filter((asset) => asset.path.endsWith('.css'))
const applicationChunks = javascriptAssets.filter((asset) => !isLazyCapabilityAsset(asset.path))
const lazyCapabilityChunks = javascriptAssets.filter((asset) => isLazyCapabilityAsset(asset.path))
const applicationCssChunks = cssAssets.filter((asset) => !isLazyCapabilityStyle(asset.path))
const lazyStyleChunks = cssAssets.filter((asset) => isLazyCapabilityStyle(asset.path))
const initialAssetPaths = await getInitialAssetPaths()
const initialJavascriptAssets = javascriptAssets.filter((asset) =>
  initialAssetPaths.has(asset.path)
)
const initialCssAssets = cssAssets.filter((asset) => initialAssetPaths.has(asset.path))
const routeCssChunks = applicationCssChunks.filter((asset) => !initialAssetPaths.has(asset.path))
const violations: string[] = []

checkLargest('单个 JavaScript 文件', javascriptAssets, 7 * MIB)
checkLargest('普通应用/路由 JavaScript 分包', applicationChunks, 900 * KIB)
checkLargest('单个 CSS 文件', cssAssets, 360 * KIB)
// The platform deployment aggregates independently deployable business repositories.
// Keep the first-screen and per-JS-chunk gates strict, while allowing complete hosted route assets.
checkLargest('普通页面 CSS 分包', routeCssChunks, 96 * KIB)
// A format parser is only fetched when its renderer opens. Keep route and optional-tool
// budgets separate so a rarely used document format does not masquerade as app startup cost.
checkTotal('普通应用/路由 JavaScript 发布总体积', applicationChunks, 26 * MIB)
checkTotal('按需能力 JavaScript gzip 传输总体积', lazyCapabilityChunks, 6 * MIB, true)
checkTotal('JavaScript 发布总体积', javascriptAssets, 48 * MIB)
checkTotal('JavaScript gzip 传输总体积', javascriptAssets, 14 * MIB, true)
checkTotal('普通应用/路由 CSS 发布总体积', applicationCssChunks, 3 * MIB)
checkTotal('普通应用/路由 CSS gzip 传输总体积', applicationCssChunks, 520 * KIB, true)
checkTotal('按需工具 CSS 总体积', lazyStyleChunks, 500 * KIB)
checkTotal('首屏 JavaScript', initialJavascriptAssets, 1.5 * MIB)
checkTotal('首屏 CSS', initialCssAssets, 420 * KIB)

if (violations.length) {
  console.error('[bundle:check] 构建体积预算未通过：')
  violations.forEach((violation) => console.error(`- ${violation}`))
  console.error('请优先检查同步导入、重复依赖和未按路由懒加载的重型能力。')
  process.exitCode = 1
} else {
  const largestApplicationChunk = [...applicationChunks].sort((a, b) => b.size - a.size)[0]
  console.log(
    `[bundle:check] 通过 · 首屏 JS ${formatBytes(
      sumSize(initialJavascriptAssets)
    )} · 首屏 CSS ${formatBytes(sumSize(initialCssAssets))} · 应用 CSS ${formatBytes(
      sumSize(applicationCssChunks)
    )} / gzip ${formatBytes(sumSize(applicationCssChunks, true))} · JS 总量 ${formatBytes(
      sumSize(javascriptAssets)
    )} · 最大普通分包 ${
      largestApplicationChunk?.path || '-'
    } ${formatBytes(largestApplicationChunk?.size || 0)}`
  )
}

async function getInitialAssetPaths(): Promise<Set<string>> {
  const html = await readFile(resolve(outputDirectory, 'index.html'), 'utf8')
  const paths = new Set<string>()

  for (const match of html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)) {
    const assetPath = match[1]?.split('/assets/')[1]
    if (assetPath) paths.add(`assets/${assetPath}`)
  }

  return paths
}

function checkLargest(label: string, source: BundleAsset[], limit: number): void {
  const oversizedAssets = source.filter((asset) => asset.size > limit)
  oversizedAssets.forEach((asset) => {
    violations.push(
      `${label} ${asset.path} 为 ${formatBytes(asset.size)}，上限 ${formatBytes(limit)}`
    )
  })
}

function checkTotal(
  label: string,
  source: BundleAsset[],
  limit: number,
  transferred = false
): void {
  const total = sumSize(source, transferred)
  if (total > limit) violations.push(`${label}为 ${formatBytes(total)}，上限 ${formatBytes(limit)}`)
}

function sumSize(source: BundleAsset[], transferred = false): number {
  return source.reduce(
    (total, asset) => total + (transferred ? (asset.transferredSize ?? asset.size) : asset.size),
    0
  )
}

function formatBytes(value: number): string {
  return value >= MIB ? `${(value / MIB).toFixed(2)} MiB` : `${(value / KIB).toFixed(1)} KiB`
}
