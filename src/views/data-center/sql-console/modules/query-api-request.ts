import type { SqlQueryApiParameters } from '@/types/sql-query-api'

export interface SqlQueryApiRequestMetadata {
  readonly name: string
  readonly url: string
  readonly sentAt: string
  readonly definitionVersion: string
}

export interface SqlQueryApiRequestExamples {
  readonly body: string
  readonly curl: string
  readonly javascript: string
}

export interface SqlQueryApiRequestSnapshot
  extends SqlQueryApiRequestMetadata, SqlQueryApiRequestExamples {}

/** Format already normalized parameters; authentication always remains a placeholder. */
export function formatSqlQueryApiRequest(
  url: string,
  params: Readonly<SqlQueryApiParameters>
): SqlQueryApiRequestExamples {
  const json = JSON.stringify({ params }, null, 2)
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
    javascript: `const response = await fetch(${JSON.stringify(url)}, {\n  method: 'POST',\n  headers: {\n    Authorization: 'Bearer YOUR_ACCESS_TOKEN',\n    apikey: 'YOUR_PUBLISHABLE_KEY',\n    'Content-Type': 'application/json'\n  },\n  body: ${JSON.stringify(json)}\n});\nconst result = await response.json();\nif (!response.ok) throw new Error(result.message || '查询 API 调用失败');\nconsole.log(result.rows);`
  }
}

/** Retain only public display metadata and strings, independent of later form edits. */
export function createSqlQueryApiRequestSnapshot(
  metadata: SqlQueryApiRequestMetadata,
  params: Readonly<SqlQueryApiParameters>
): SqlQueryApiRequestSnapshot {
  const { name, url, sentAt, definitionVersion } = metadata
  return Object.freeze({
    name,
    url,
    sentAt,
    definitionVersion,
    ...formatSqlQueryApiRequest(url, params)
  })
}
