const LAZY_CAPABILITY_NAMES = [
  'worker',
  'monaco',
  'RTFJS',
  'heic2any',
  'maplibre-gl',
  'rich-editor',
  'data-tools',
  'charts',
  'media',
  'cytoscape',
  'pdf-',
  'element-plus',
  '3d-runtime',
  'exceljs',
  'file-viewer',
  'local-ocr',
  'iwork[.]parser'
] as const

const LAZY_CAPABILITY_PATTERN = new RegExp(`(?:${LAZY_CAPABILITY_NAMES.join('|')})`, 'i')
const LAZY_STYLE_PATTERN =
  /(?:^|\/)(?:assets\/(?:monaco|rich-editor|art-file-viewer|art-settings-panel|art-global-search|art-chat-window|art-fireworks-effect)[.-]|vendor\/pdf\/)/i

/** Public worker scripts are fetched by local OCR, never imported as Vite application chunks. */
export const SELF_HOSTED_OCR_JAVASCRIPT_PATHS: readonly string[] = [
  'ocr/driver/worker.min.js',
  'ocr/driver/core/tesseract-core-lstm.wasm.js',
  'ocr/driver/core/tesseract-core-simd-lstm.wasm.js',
  'ocr/driver/core/tesseract-core-relaxedsimd-lstm.wasm.js'
]

export const isSelfHostedOcrJavascriptAsset = (assetPath: string): boolean =>
  SELF_HOSTED_OCR_JAVASCRIPT_PATHS.includes(assetPath)

export const isLazyCapabilityAsset = (assetPath: string): boolean =>
  LAZY_CAPABILITY_PATTERN.test(assetPath)

/** Avoid repeating long route/component names in thousands of import URLs. */
export const platformChunkFileName = ({ name }: { name: string }): string =>
  isLazyCapabilityAsset(`assets/${name}-[hash].js`) ? 'assets/[name]-[hash].js' : 'assets/[hash].js'

export const isLazyCapabilityStyle = (assetPath: string): boolean =>
  LAZY_STYLE_PATTERN.test(assetPath)

export const shouldPreloadHtmlDependency = (dependency: string): boolean =>
  !LAZY_CAPABILITY_PATTERN.test(dependency)
