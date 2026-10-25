import assert from 'node:assert/strict'
import test from 'node:test'
import {
  extractAiProviderJson,
  extractAiProviderText
} from '../../supabase/functions/_shared/ai-provider-json'

test('AI provider JSON parser accepts direct and parsed objects', () => {
  assert.deepEqual(extractAiProviderJson({ content: { invoice: { invoiceNo: '001' } } }), {
    invoice: { invoiceNo: '001' }
  })
  assert.deepEqual(extractAiProviderJson({ parsed: { invoice: { invoiceNo: '002' } } }), {
    invoice: { invoiceNo: '002' }
  })
})

test('AI provider JSON parser accepts segmented text content', () => {
  const message = {
    content: [
      { type: 'text', text: '识别结果如下：' },
      { type: 'output_text', text: { value: '{"invoice":{"invoiceNo":"003"}}' } }
    ]
  }
  assert.match(extractAiProviderText(message), /识别结果如下/)
  assert.deepEqual(extractAiProviderJson(message), { invoice: { invoiceNo: '003' } })
})

test('AI provider JSON parser isolates the largest balanced object from prose', () => {
  const message = {
    content:
      '格式示例：{"ok":true}。结果是：```json\n{"summary":"含 } 字符","invoice":{"invoiceNo":"004"}}\n```。'
  }
  assert.deepEqual(extractAiProviderJson(message), {
    summary: '含 } 字符',
    invoice: { invoiceNo: '004' }
  })
})

test('AI provider JSON parser falls back to reasoning content when content is empty', () => {
  assert.deepEqual(
    extractAiProviderJson({ content: null, reasoning_content: '{"invoice":{"invoiceNo":"005"}}' }),
    { invoice: { invoiceNo: '005' } }
  )
})

test('AI provider JSON parser repairs common JSON-like model output', () => {
  assert.deepEqual(
    extractAiProviderJson({
      content:
        "{summary: '识别完成', confidence: 0.9, invoice: {'invoiceNo': '006', 'issueDate': None,}, warnings: [],}"
    }),
    {
      summary: '识别完成',
      confidence: 0.9,
      invoice: { invoiceNo: '006', issueDate: null },
      warnings: []
    }
  )
})

test('AI provider JSON parser unwraps double-encoded JSON strings', () => {
  assert.deepEqual(
    extractAiProviderJson({ content: '"{\\"invoice\\":{\\"invoiceNo\\":\\"007\\"}}"' }),
    { invoice: { invoiceNo: '007' } }
  )
})

test('AI provider JSON parser checks reasoning content after invalid visible content', () => {
  assert.deepEqual(
    extractAiProviderJson({
      content: '无法生成结构化结果',
      reasoning_content: '{"invoice":{"invoiceNo":"008"}}'
    }),
    { invoice: { invoiceNo: '008' } }
  )
})
