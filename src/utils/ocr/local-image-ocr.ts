export interface LocalImageOcrResult {
  text: string
  confidence: number
}

/** Run OCR entirely in this browser using self-hosted WASM and language assets. */
export async function recognizeImageTextLocally(image: Blob): Promise<LocalImageOcrResult> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.type)) {
    throw new Error('本地识别仅支持 PNG、JPG、WebP 图片')
  }
  const { createWorker } = await import('tesseract.js')
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  const assetRoot = new URL(`${base}ocr/driver/`, window.location.origin).href.replace(/\/$/, '')
  const worker = await createWorker('chi_sim', 1, {
    workerPath: `${assetRoot}/worker.min.js`,
    corePath: `${assetRoot}/core`,
    langPath: `${assetRoot}/langs`,
    workerBlobURL: false,
    cacheMethod: 'none'
  })
  try {
    const { data } = await worker.recognize(image)
    return { text: data.text.trim(), confidence: Math.max(0, Math.min(data.confidence / 100, 1)) }
  } finally {
    await worker.terminate()
  }
}
