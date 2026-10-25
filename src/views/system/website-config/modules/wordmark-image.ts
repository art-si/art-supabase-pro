export const WORDMARK_IMAGE_WIDTH = 1008
export const WORDMARK_IMAGE_HEIGHT = 240

export interface WordmarkPixelBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WordmarkPlacement {
  x: number
  y: number
  width: number
  height: number
}

export const normalizeWordmarkText = (siteName: string): string =>
  siteName.trim().replace(/\s+/g, ' ')

const pixelLuminance = (red: number, green: number, blue: number): number =>
  Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722)

/**
 * Normalize either a transparent provider image or a high-contrast opaque preview into a white
 * alpha mask. NVIDIA's hosted visual models return opaque RGB images, while OpenAI can return a
 * transparent PNG; keeping this conversion in the browser lets both routes produce identical
 * theme colorways without persisting provider-specific backgrounds.
 */
export function createWordmarkMaskPixels(
  source: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(source.length)
  if (width <= 0 || height <= 0 || source.length < width * height * 4) return output

  let hasTransparency = false
  for (let index = 3; index < source.length; index += 4) {
    if ((source[index] ?? 255) < 250) {
      hasTransparency = true
      break
    }
  }

  const cornerOffsets = [0, (width - 1) * 4, (height - 1) * width * 4, (height * width - 1) * 4]
  const backgroundLuminance =
    cornerOffsets.reduce(
      (total, offset) =>
        total +
        pixelLuminance(source[offset] ?? 0, source[offset + 1] ?? 0, source[offset + 2] ?? 0),
      0
    ) / cornerOffsets.length
  const lightForeground = backgroundLuminance < 128

  for (let offset = 0; offset < source.length; offset += 4) {
    const sourceAlpha = source[offset + 3] ?? 0
    let alpha = sourceAlpha
    if (!hasTransparency) {
      const luminance = pixelLuminance(
        source[offset] ?? 0,
        source[offset + 1] ?? 0,
        source[offset + 2] ?? 0
      )
      const contrast = lightForeground
        ? luminance - backgroundLuminance
        : backgroundLuminance - luminance
      alpha = Math.max(0, Math.min(255, Math.round((contrast - 12) * 1.45)))
    }
    output[offset] = 255
    output[offset + 1] = 255
    output[offset + 2] = 255
    output[offset + 3] = alpha
  }
  return output
}

export function findOpaqueBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 8
): WordmarkPixelBounds | null {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) return null

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3] ?? 0
      if (alpha <= alphaThreshold) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  if (maxX < minX || maxY < minY) return null
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  }
}

export function fitWordmarkBounds(
  source: Pick<WordmarkPixelBounds, 'width' | 'height'>,
  targetWidth = WORDMARK_IMAGE_WIDTH,
  targetHeight = WORDMARK_IMAGE_HEIGHT,
  horizontalPadding = 36,
  verticalPadding = 24
): WordmarkPlacement {
  const availableWidth = Math.max(targetWidth - horizontalPadding * 2, 1)
  const availableHeight = Math.max(targetHeight - verticalPadding * 2, 1)
  const sourceWidth = Math.max(source.width, 1)
  const sourceHeight = Math.max(source.height, 1)
  const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight)
  const width = Math.max(Math.round(sourceWidth * scale), 1)
  const height = Math.max(Math.round(sourceHeight * scale), 1)

  return {
    x: Math.round((targetWidth - width) / 2),
    y: Math.round((targetHeight - height) / 2),
    width,
    height
  }
}

const loadImage = async (source: string): Promise<HTMLImageElement> =>
  await new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('生成的品牌字图无法读取'))
    image.src = source
  })

const canvasToBlob = async (canvas: HTMLCanvasElement): Promise<Blob> =>
  await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('品牌字图处理失败'))
    }, 'image/png')
  })

function createThemedWordmarkCanvas(
  maskCanvas: HTMLCanvasElement,
  theme: Api.SystemManage.WebsiteWordmarkTheme,
  styleTextureCanvas?: HTMLCanvasElement
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = WORDMARK_IMAGE_WIDTH
  canvas.height = WORDMARK_IMAGE_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法导出品牌字图')

  context.drawImage(maskCanvas, 0, 0)
  context.globalCompositeOperation = 'source-in'
  const gradient = context.createLinearGradient(0, 0, WORDMARK_IMAGE_WIDTH, 0)
  if (theme === 'light') {
    gradient.addColorStop(0, '#071c4c')
    gradient.addColorStop(0.55, '#0b3b82')
    gradient.addColorStop(1, '#1768c4')
  } else {
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(0.58, '#d9efff')
    gradient.addColorStop(1, '#8fcfff')
  }
  context.fillStyle = gradient
  context.fillRect(0, 0, WORDMARK_IMAGE_WIDTH, WORDMARK_IMAGE_HEIGHT)
  if (styleTextureCanvas) {
    context.globalCompositeOperation = 'source-atop'
    context.globalAlpha = theme === 'light' ? 0.1 : 0.14
    context.filter = 'blur(6px)'
    context.drawImage(styleTextureCanvas, 0, 0)
    context.filter = 'none'
    context.globalAlpha = 1
  }
  context.globalCompositeOperation = 'source-over'
  return canvas
}

async function createExactWordmarkMask(siteName: string): Promise<HTMLCanvasElement> {
  const text = normalizeWordmarkText(siteName)
  if (!text) throw new Error('系统名称不能为空')

  const canvas = document.createElement('canvas')
  canvas.width = WORDMARK_IMAGE_WIDTH
  canvas.height = WORDMARK_IMAGE_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法排版品牌字图')

  const fontFamily =
    '"HarmonyOS Sans SC", "HarmonyOS Sans", "PingFang SC", "Microsoft YaHei", sans-serif'
  const maxWidth = WORDMARK_IMAGE_WIDTH - 72
  const maxHeight = WORDMARK_IMAGE_HEIGHT - 28
  let fontSize = 204
  await document.fonts?.load(`800 ${fontSize}px "HarmonyOS Sans SC"`, text)
  await document.fonts?.load(`800 ${fontSize}px "HarmonyOS Sans"`, text)

  const applyFont = (): void => {
    context.font = `800 ${fontSize}px ${fontFamily}`
    const typographicContext = context as CanvasRenderingContext2D & { letterSpacing?: string }
    if ('letterSpacing' in typographicContext) {
      typographicContext.letterSpacing = `${Math.max(fontSize * 0.018, 1)}px`
    }
  }
  applyFont()
  while (fontSize > 54) {
    const metrics = context.measureText(text)
    const glyphHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
    if (metrics.width <= maxWidth && glyphHeight <= maxHeight) break
    fontSize -= 4
    applyFont()
  }

  const metrics = context.measureText(text)
  const baseline =
    (WORDMARK_IMAGE_HEIGHT + metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2
  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'
  context.lineJoin = 'round'
  context.miterLimit = 2
  context.strokeStyle = '#ffffff'
  context.fillStyle = '#ffffff'
  context.lineWidth = Math.max(2, fontSize * 0.014)
  context.strokeText(text, WORDMARK_IMAGE_WIDTH / 2, baseline)
  context.fillText(text, WORDMARK_IMAGE_WIDTH / 2, baseline)
  return canvas
}

export async function createGeneratedWordmarkFiles(
  response: Api.SystemManage.WebsiteWordmarkGenerateResponse,
  siteName: string
): Promise<Record<Api.SystemManage.WebsiteWordmarkTheme, File>> {
  const source = `data:${response.mimeType};base64,${response.imageBase64}`
  const image = await loadImage(source)
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = image.naturalWidth
  sourceCanvas.height = image.naturalHeight
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('当前浏览器无法处理品牌字图')
  sourceContext.drawImage(image, 0, 0)

  const pixels = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height)
  const maskPixels = createWordmarkMaskPixels(pixels.data, sourceCanvas.width, sourceCanvas.height)
  const normalizedSourceCanvas = document.createElement('canvas')
  normalizedSourceCanvas.width = sourceCanvas.width
  normalizedSourceCanvas.height = sourceCanvas.height
  const normalizedSourceContext = normalizedSourceCanvas.getContext('2d')
  if (!normalizedSourceContext) throw new Error('当前浏览器无法提取品牌字形')
  const imageDataPixels = new Uint8ClampedArray(maskPixels.length)
  imageDataPixels.set(maskPixels)
  normalizedSourceContext.putImageData(
    new ImageData(imageDataPixels, sourceCanvas.width, sourceCanvas.height),
    0,
    0
  )
  const bounds =
    findOpaqueBounds(maskPixels, sourceCanvas.width, sourceCanvas.height) ??
    ({
      x: 0,
      y: 0,
      width: sourceCanvas.width,
      height: sourceCanvas.height
    } satisfies WordmarkPixelBounds)
  const placement = fitWordmarkBounds(bounds)

  const styleTextureCanvas = document.createElement('canvas')
  styleTextureCanvas.width = WORDMARK_IMAGE_WIDTH
  styleTextureCanvas.height = WORDMARK_IMAGE_HEIGHT
  const outputContext = styleTextureCanvas.getContext('2d')
  if (!outputContext) throw new Error('当前浏览器无法导出品牌字图')
  outputContext.imageSmoothingEnabled = true
  outputContext.imageSmoothingQuality = 'high'
  outputContext.drawImage(
    normalizedSourceCanvas,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    placement.x,
    placement.y,
    placement.width,
    placement.height
  )

  // Image models are useful for visual direction but cannot guarantee exact Chinese glyphs.
  // Always typeset the configured system name with a real font, then use the AI result only as
  // a subtle clipped texture so the exported wordmark stays legible at the 109×26px menu size.
  const maskCanvas = await createExactWordmarkMask(siteName)

  const safeName = siteName.trim().replace(/[\\/:*?"<>|\s]+/g, '-') || 'website'
  const [lightBlob, darkBlob] = await Promise.all([
    canvasToBlob(createThemedWordmarkCanvas(maskCanvas, 'light', styleTextureCanvas)),
    canvasToBlob(createThemedWordmarkCanvas(maskCanvas, 'dark', styleTextureCanvas))
  ])
  return {
    light: new File([lightBlob], `${safeName}-wordmark-light.png`, { type: 'image/png' }),
    dark: new File([darkBlob], `${safeName}-wordmark-dark.png`, { type: 'image/png' })
  }
}
