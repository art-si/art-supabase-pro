import { getNodeValue, parseTree, type ParseError } from 'jsonc-parser'
import type { JSONSchema } from 'monaco-editor/languages/features/json/register'

export type JsonObjectParseResult =
  { value: Record<string, unknown>; error?: never } | { value?: never; error: 'syntax' | 'object' }

/** 接受注释，拒绝尾随逗号和其他 JavaScript 表达式。 */
export function parseJsonObjectDraft(source: string): JsonObjectParseResult {
  const errors: ParseError[] = []
  const node = parseTree(source, errors, { allowTrailingComma: false })
  if (errors.length || !node) return { error: 'syntax' }
  if (node.type !== 'object') return { error: 'object' }
  const value: unknown = getNodeValue(node)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'object' }
  return { value: value as Record<string, unknown> }
}

const typeLabels: Record<string, string> = {
  array: '数组',
  boolean: '布尔值',
  null: 'null',
  number: '数字',
  object: '对象',
  string: '字符串'
}

function describeField(value: unknown, schema?: JSONSchema): string {
  const parts = [schema?.description || '自定义参数']
  const types = Array.isArray(schema?.type)
    ? schema.type
    : schema?.type
      ? [schema.type]
      : [Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value]
  if (schema?.enum?.length) {
    parts.push(`可选值：${schema.enum.map((item) => JSON.stringify(item)).join('、')}`)
  } else if (types.includes('boolean')) {
    parts.push(`可选值：true、false${types.includes('null') ? '、null' : ''}`)
  }
  if (schema?.minimum !== undefined || schema?.maximum !== undefined) {
    parts.push(`范围：${schema.minimum ?? '不限'}–${schema.maximum ?? '不限'}`)
  }
  parts.push(`类型：${types.map((type) => typeLabels[type] || type).join('或')}`)
  return parts.join('；')
}

function renderValue(value: unknown, schema: JSONSchema | undefined, depth: number): string {
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const itemSchema =
      typeof schema?.items === 'object' && !Array.isArray(schema.items) ? schema.items : undefined
    const indent = '  '.repeat(depth)
    const childIndent = '  '.repeat(depth + 1)
    return `[\n${value.map((item) => `${childIndent}${renderValue(item, itemSchema, depth + 1)}`).join(',\n')}\n${indent}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    if (!entries.length) return '{}'
    const indent = '  '.repeat(depth)
    const childIndent = '  '.repeat(depth + 1)
    return `{\n${entries
      .map(([key, item]) => {
        const childSchema = schema?.properties?.[key]
        const fieldSchema = typeof childSchema === 'object' ? childSchema : undefined
        return `${childIndent}// ${describeField(item, fieldSchema)}\n${childIndent}${JSON.stringify(key)}: ${renderValue(item, fieldSchema, depth + 1)}`
      })
      .join(',\n')}\n${indent}}`
  }
  return JSON.stringify(value)
}

/** 只生成编辑态注释，应用时应通过 parseJsonObjectDraft 后转为严格 JSON。 */
export function formatJsonWithGuides(source: string, schema?: JSONSchema): string {
  const parsed: unknown = JSON.parse(source)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return source
  return renderValue(parsed, schema, 0)
}
