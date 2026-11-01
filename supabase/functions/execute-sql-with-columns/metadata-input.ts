export type SqlMetadataMode = 'catalog' | 'tables' | 'functions' | 'search'
export interface MetadataRpcInput {
  p_mode: SqlMetadataMode
  p_tables: { schema: string; name: string }[]
  p_schema: string | null
  p_keyword: string | null
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && !/\p{Cc}/u.test(value)

/** null preserves the deployed full-metadata contract for existing browsers. */
export function metadataRpcInput(body: unknown): MetadataRpcInput | null {
  const input = object(body)
  if (input.mode === undefined) return null
  if (
    typeof input.mode !== 'string' ||
    !['catalog', 'tables', 'functions', 'search'].includes(input.mode)
  )
    throw new Error('数据库结构加载模式无效，请刷新页面后重试')
  const mode = input.mode as SqlMetadataMode
  if (input.schema !== undefined && !identifier(input.schema))
    throw new Error('数据库 schema 无效，请重新选择')
  let tables: MetadataRpcInput['p_tables'] = []
  if (mode === 'tables') {
    if (!Array.isArray(input.tables) || !input.tables.length || input.tables.length > 32)
      throw new Error('每次可加载 1 至 32 个数据库对象')
    tables = input.tables.map((value) => {
      const row = object(value)
      if (!identifier(row.schema) || !identifier(row.name))
        throw new Error('数据库对象名称无效，请重新选择')
      return { schema: row.schema, name: row.name }
    })
  }
  if (mode === 'functions' && !identifier(input.schema)) throw new Error('请先选择函数所属 schema')
  if (
    mode === 'search' &&
    (typeof input.keyword !== 'string' ||
      !input.keyword.trim() ||
      input.keyword.trim().length > 120 ||
      /\p{Cc}/u.test(input.keyword))
  )
    throw new Error('请输入 1 至 120 个字符的数据库搜索词')
  return {
    p_mode: mode,
    p_tables: tables,
    p_schema: typeof input.schema === 'string' ? input.schema : null,
    p_keyword: mode === 'search' ? String(input.keyword).trim() : null
  }
}
