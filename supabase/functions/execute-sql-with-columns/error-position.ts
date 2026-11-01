export interface SqlErrorSource {
  rawQuery: string
  queryText: string
  executedQuery: string
  prefix: string
  suffix: string
}

export interface SqlErrorLocation {
  /** One-based Unicode code point position in the original request query, including whitespace. */
  errorPosition: number
  errorQuery: string
}

/** Only call for errors from the actual user statement, never session or metadata queries. */
export function mapSqlErrorPosition(
  error: unknown,
  source: SqlErrorSource
): SqlErrorLocation | undefined {
  if (error === null || typeof error !== 'object') return undefined
  // PostgreSQL's P field addresses the submitted statement. Internal p/q fields
  // describe a different statement and must never be used as its fallback.
  const descriptor = Object.getOwnPropertyDescriptor(error, 'position')
  const value: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)))
    return undefined
  const position = Number(value)
  if (!Number.isSafeInteger(position) || position < 1) return undefined

  const { rawQuery, queryText, executedQuery, prefix, suffix } = source
  if (!queryText || executedQuery !== prefix + queryText + suffix) return undefined
  const leadingLength = rawQuery.length - rawQuery.trimStart().length
  // prepareSqlInput only removes text at the edges. Verify that invariant rather
  // than finding a similar substring in comments, strings, or a rewritten query.
  if (rawQuery.slice(leadingLength, leadingLength + queryText.length) !== queryText)
    return undefined

  const queryPosition = position - Array.from(prefix).length
  const queryLength = Array.from(queryText).length
  if (queryPosition < 1 || queryPosition > queryLength + (suffix === '' ? 1 : 0)) return undefined

  return {
    errorPosition: Array.from(rawQuery.slice(0, leadingLength)).length + queryPosition,
    errorQuery: rawQuery
  }
}
