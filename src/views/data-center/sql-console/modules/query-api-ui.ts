import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import type { SqlQueryApiDefinition, SqlQueryApiParameter } from '@/types/sql-query-api'
import { getOwnRecordValue } from '@/utils/record'
import { getSqlQueryApiSample } from './query-api-samples'

dayjs.extend(customParseFormat)

export const isSqlQueryApiParameterType = (value: unknown): value is SqlQueryApiParameter['type'] =>
  typeof value === 'string' && ['string', 'number', 'boolean', 'date', 'uuid'].includes(value)

/** Preserve number text so precision is decided at the typed database boundary. */
export function sqlQueryApiParameters(
  definitions: SqlQueryApiParameter[],
  values: Record<string, unknown>
): Record<string, string | boolean> {
  const entries: [string, string | boolean][] = []
  for (const parameter of definitions) {
    const value = getOwnRecordValue(values, parameter.name)
    const text = typeof value === 'string' ? value.trim() : ''
    if (value === undefined || value === null || value === '') {
      if (parameter.required) throw new Error(`请填写参数 ${parameter.name}`)
      continue
    }
    if (parameter.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`参数 ${parameter.name} 请选择 true 或 false`)
      entries.push([parameter.name, value])
      continue
    }
    if (typeof value !== 'string') throw new Error(`参数 ${parameter.name} 的格式无效`)
    if (
      parameter.type === 'number' &&
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)
    )
      throw new Error(`参数 ${parameter.name} 请输入有效数值`)
    if (parameter.type === 'date' && !dayjs(text, 'YYYY-MM-DD', true).isValid())
      throw new Error(`参数 ${parameter.name} 请输入有效日期`)
    if (
      parameter.type === 'uuid' &&
      !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(text)
    )
      throw new Error(`参数 ${parameter.name} 请输入有效 UUID`)
    entries.push([parameter.name, parameter.type === 'string' ? value : text])
  }
  return Object.fromEntries(entries)
}

export function sqlQueryApiExampleValues(
  definition: SqlQueryApiDefinition
): Record<string, string | boolean> {
  const sample = getSqlQueryApiSample(definition)
  if (sample) return { ...sample.values }
  return Object.fromEntries(
    definition.parameters.map((parameter) => [
      parameter.name,
      parameter.type === 'boolean'
        ? true
        : parameter.type === 'number'
          ? '100.50'
          : parameter.type === 'date'
            ? '2026-01-01'
            : parameter.type === 'uuid'
              ? '00000000-0000-4000-8000-000000000001'
              : '示例值'
    ])
  )
}

/** Examples contain placeholders only, never the application's live session. */
export function sqlQueryApiExamples(definition: SqlQueryApiDefinition, url: string) {
  const json = JSON.stringify({ params: sqlQueryApiExampleValues(definition) }, null, 2)
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  return {
    body: json,
    curl: [
      `curl --request POST ${quote(url)}`,
      "  --header 'Authorization: Bearer YOUR_ACCESS_TOKEN'",
      "  --header 'apikey: YOUR_PUBLISHABLE_KEY'",
      "  --header 'Content-Type: application/json'",
      `  --data ${quote(json)}`
    ].join(' \\\n'),
    javascript: `const response = await fetch(${JSON.stringify(url)}, {\n  method: 'POST',\n  headers: {\n    Authorization: 'Bearer YOUR_ACCESS_TOKEN',\n    apikey: 'YOUR_PUBLISHABLE_KEY',\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify(${json})\n});\nconst result = await response.json();\nif (!response.ok) throw new Error(result.message || '查询 API 调用失败');\nconsole.log(result.rows);`
  }
}
