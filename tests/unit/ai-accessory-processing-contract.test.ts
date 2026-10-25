import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  classifyAccessoryOcrFailure,
  normalizeAccessoryOcr,
  validateAccessoryOcr
} from '../../supabase/functions/_shared/ai-accessory-processing-contract'

test('同一表格行的两个长度形成两个独立加工件，并共用该行草图边界', () => {
  const response = {
    rawText: '雨篷上泛水 500 2.7 1 4.8 1',
    confidence: 0.94,
    projectName: '107加荷装置及采样冷却器厂房雨篷',
    drawingName: '配件加工图',
    rows: [
      {
        rowNo: 1,
        name: '雨篷上泛水',
        widthMm: 500,
        materialColor: '蓝色彩钢板',
        remark: '雨篷顶板与墙面',
        sketch: { page: 1, x: 180, y: 120, width: 250, height: 80 },
        variants: [
          { lengthM: 2.7, quantity: 1 },
          { lengthM: 4.8, quantity: 1 }
        ]
      }
    ]
  }
  assert.equal(validateAccessoryOcr(response).valid, true)
  const result = normalizeAccessoryOcr(response)
  assert.deepEqual(
    result.items.map(({ lengthM, quantity }) => ({ lengthM, quantity })),
    [
      { lengthM: 2.7, quantity: 1 },
      { lengthM: 4.8, quantity: 1 }
    ]
  )
  assert.deepEqual(result.items[0].sketch, result.items[1].sketch)
})

test('缺少长度或数量时拒绝生成有效识别结果', () => {
  const validation = validateAccessoryOcr({
    rawText: '',
    rows: [{ rowNo: 1, name: '雨篷上泛水', variants: [{ lengthM: 2.7 }] }]
  })
  assert.equal(validation.valid, false)
  assert.equal(classifyAccessoryOcrFailure(validation.errors)?.code, 'no_processing_items')
  assert.equal(classifyAccessoryOcrFailure(['缺少 rows 数组', ...validation.errors]), null)
})
