/**
 * Build a PostgREST OR search from application-owned column names.
 * Values are quoted before the SDK URL-encodes them, so punctuation cannot
 * become another filter. Existing LIKE wildcard semantics are preserved.
 * https://docs.postgrest.org/en/stable/references/api/url_grammar.html#reserved-characters
 */
export function buildOrIlikeFilter(columns: readonly string[], keyword: string): string {
  if (!columns.length || columns.some((column) => !/^[a-z_][a-z0-9_]*$/i.test(column))) {
    throw new Error('搜索字段配置不正确')
  }

  const pattern = `%${keyword}%`.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return columns.map((column) => `${column}.ilike."${pattern}"`).join(',')
}
