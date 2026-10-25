export interface AccessorySketchBounds {
  page: number
  x: number
  y: number
  width: number
  height: number
}

export interface AccessoryRecognizedItem {
  rowNo: number
  name: string
  widthMm: number | null
  lengthM: number
  quantity: number
  materialColor: string
  remark: string
  sketch: AccessorySketchBounds | null
}

export interface AccessoryOcrResult {
  rawText: string
  confidence: number
  fieldConfidence: Record<string, number>
  warnings: string[]
  projectName: string
  drawingName: string
  items: AccessoryRecognizedItem[]
}

type RecordValue = Record<string, unknown>

const isRecord = (value: unknown): value is RecordValue =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const number = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function parseSketch(value: unknown): AccessorySketchBounds | null {
  if (!isRecord(value)) return null
  const page = number(value.page)
  const x = number(value.x)
  const y = number(value.y)
  const width = number(value.width)
  const height = number(value.height)
  if (
    page === null ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 3 ||
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > 1000 ||
    y + height > 1000
  ) return null
  return { page, x, y, width, height }
}

export function normalizeAccessoryOcr(value: RecordValue): AccessoryOcrResult {
  const warnings = Array.isArray(value.warnings) ? value.warnings.map(text).filter(Boolean) : []
  const rows = Array.isArray(value.rows) ? value.rows : []
  const items: AccessoryRecognizedItem[] = []
  for (const rowValue of rows) {
    if (!isRecord(rowValue)) continue
    const rowNo = number(rowValue.rowNo)
    const name = text(rowValue.name)
    const variants = Array.isArray(rowValue.variants) ? rowValue.variants : []
    if (!name || rowNo === null || !Number.isInteger(rowNo) || rowNo <= 0) continue
    for (const variant of variants) {
      if (!isRecord(variant)) continue
      const lengthM = number(variant.lengthM)
      const quantity = number(variant.quantity)
      if (
        lengthM === null || lengthM <= 0 ||
        quantity === null || !Number.isInteger(quantity) || quantity <= 0
      ) continue
      items.push({
        rowNo,
        name,
        widthMm: number(rowValue.widthMm),
        lengthM,
        quantity,
        materialColor: text(rowValue.materialColor),
        remark: text(rowValue.remark),
        sketch: parseSketch(rowValue.sketch)
      })
    }
  }
  if (!items.length) warnings.push('未识别出完整的加工件长度与数量，请核对原件')
  if (items.some((item) => !item.sketch)) warnings.push('部分加工草图位置未识别，生成前需人工补充')
  return {
    rawText: text(value.rawText),
    confidence: Math.min(1, Math.max(0, number(value.confidence) ?? 0)),
    fieldConfidence: isRecord(value.fieldConfidence)
      ? Object.fromEntries(Object.entries(value.fieldConfidence).flatMap(([key, item]) => {
          const confidence = number(item)
          return confidence === null ? [] : [[key, Math.min(1, Math.max(0, confidence))]]
        }))
      : {},
    warnings,
    projectName: text(value.projectName),
    drawingName: text(value.drawingName),
    items
  }
}

export function validateAccessoryOcr(value: unknown): { valid: boolean; errors: string[] } {
  if (!isRecord(value)) return { valid: false, errors: ['响应不是对象'] }
  const result = normalizeAccessoryOcr(value)
  const errors: string[] = []
  if (!Array.isArray(value.rows)) errors.push('缺少 rows 数组')
  if (!result.items.length) errors.push('未找到有效的加工件')
  if (result.items.length > 100) errors.push('加工件数量超过 100')
  if (typeof value.rawText !== 'string') errors.push('缺少 rawText')
  return { valid: errors.length === 0, errors }
}

export function classifyAccessoryOcrFailure(errors: string[]): {
  code: string
  message: string
  status: number
} | null {
  if (errors.length !== 1 || errors[0] !== '未找到有效的加工件') return null
  return {
    code: 'no_processing_items',
    message: '未识别到完整加工件。请确认上传的是配件加工清单，且名称、长度和数量清晰可见。',
    status: 422
  }
}
