export interface ApiParameter {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'uuid'
  required: boolean
}

export interface ApiDefinition {
  id: string
  slug: string
  name: string
  description: string
  sql: string
  tenantId: string
  allowedUserIds: string[]
  parameters: ApiParameter[]
  maxRows: number
  timeoutMs: number
  enabled: boolean
  updatedAt: string
}

export class QueryApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400
  ) {
    super(message)
  }
}

export const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i
const PARAMETER_NAME = /^[A-Za-z_][A-Za-z\d_]{0,39}$/
const TYPES = {
  string: 'text',
  number: 'numeric',
  boolean: 'boolean',
  date: 'date',
  uuid: 'uuid'
} as const
export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function validateDefinition(
  value: unknown
): Omit<ApiDefinition, 'id' | 'updatedAt'> & { id?: string; updatedAt?: string } {
  const row = record(value)
  const text = (key: string, max: number, optional = false): string => {
    const value = row[key]
    if (optional && (value === undefined || value === '')) return ''
    if (typeof value !== 'string' || !value.trim() || value.length > max)
      throw new QueryApiError('INVALID_DEFINITION', '请完整填写接口名称、路径和 SQL')
    return value.trim()
  }
  const slug = text('slug', 80)
  if (!/^[a-z][a-z\d-]{2,63}$/.test(slug))
    throw new QueryApiError(
      'INVALID_SLUG',
      '接口路径须以小写字母开头，仅使用小写字母、数字和连字符'
    )
  if (row.id !== undefined && (typeof row.id !== 'string' || !UUID.test(row.id)))
    throw new QueryApiError('INVALID_DEFINITION', '接口编号无效，请刷新后重试')
  if (
    row.tenantId !== undefined &&
    row.tenantId !== '' &&
    (typeof row.tenantId !== 'string' || !UUID.test(row.tenantId))
  )
    throw new QueryApiError('INVALID_TENANT', '请选择有效的所属租户')
  if (
    !Array.isArray(row.allowedUserIds) ||
    row.allowedUserIds.length > 200 ||
    !row.allowedUserIds.every((id) => typeof id === 'string' && UUID.test(id))
  )
    throw new QueryApiError('INVALID_GRANTS', '请选择有效的授权账号，每个接口最多授权 200 个账号')
  if (!Array.isArray(row.parameters) || row.parameters.length > 20)
    throw new QueryApiError('INVALID_PARAMETERS', '最多定义 20 个命名参数')
  const parameters = row.parameters.map((raw) => {
    const item = record(raw)
    if (
      typeof item.name !== 'string' ||
      !PARAMETER_NAME.test(item.name) ||
      typeof item.type !== 'string' ||
      !Object.hasOwn(TYPES, item.type) ||
      typeof item.required !== 'boolean'
    )
      throw new QueryApiError('INVALID_PARAMETERS', '参数须包含有效名称、类型和必填设置')
    return { name: item.name, type: item.type as ApiParameter['type'], required: item.required }
  })
  if (new Set(parameters.map((p) => p.name)).size !== parameters.length)
    throw new QueryApiError('INVALID_PARAMETERS', '参数名称不能重复')
  if (
    typeof row.maxRows !== 'number' ||
    !Number.isInteger(row.maxRows) ||
    row.maxRows < 1 ||
    row.maxRows > 1000 ||
    typeof row.timeoutMs !== 'number' ||
    !Number.isInteger(row.timeoutMs) ||
    row.timeoutMs < 1000 ||
    row.timeoutMs > 30000 ||
    typeof row.enabled !== 'boolean'
  )
    throw new QueryApiError('INVALID_LIMITS', '最多返回 1000 行，查询超时为 1 至 30 秒')
  return {
    ...(typeof row.id === 'string' ? { id: row.id } : {}),
    ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}),
    slug,
    name: text('name', 80),
    description: text('description', 500, true),
    sql: text('sql', 100000),
    tenantId: typeof row.tenantId === 'string' ? row.tenantId : '',
    allowedUserIds: row.allowedUserIds,
    parameters,
    maxRows: row.maxRows,
    timeoutMs: row.timeoutMs,
    enabled: row.enabled
  }
}

/** Only literal values are substituted; SQL syntax and identifiers remain fixed. */
export function compileNamedParameters(
  sql: string,
  definitions: ApiParameter[]
): { sql: string; names: string[] } {
  const known = new Map(definitions.map((parameter) => [parameter.name, parameter]))
  const names: string[] = []
  let output = ''
  let state: 'code' | 'single' | 'double' | 'line' | 'block' | 'dollar' = 'code'
  let depth = 0
  let tag = ''
  let escaped = false
  let terminated = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i],
      next = sql[i + 1]
    if (state === 'line') {
      output += ch
      if (ch === '\n') state = 'code'
      continue
    }
    if (state === 'block') {
      output += ch
      if (ch === '/' && next === '*') {
        output += next
        i++
        depth++
      } else if (ch === '*' && next === '/') {
        output += next
        i++
        if (--depth === 0) state = 'code'
      }
      continue
    }
    if (state === 'single') {
      output += ch
      if (ch === '\\' && escaped) {
        output += next || ''
        i++
      } else if (ch === "'" && next === "'") {
        output += next
        i++
      } else if (ch === "'") state = 'code'
      continue
    }
    if (state === 'double') {
      output += ch
      if (ch === '"' && next === '"') {
        output += next
        i++
      } else if (ch === '"') state = 'code'
      continue
    }
    if (state === 'dollar') {
      if (sql.startsWith(tag, i)) {
        output += tag
        i += tag.length - 1
        state = 'code'
      } else output += ch
      continue
    }
    if (ch === '-' && next === '-') {
      output += '--'
      i++
      state = 'line'
      continue
    }
    if (ch === '/' && next === '*') {
      output += '/*'
      i++
      depth = 1
      state = 'block'
      continue
    }
    if (ch === ';') {
      if (terminated) throw new QueryApiError('READ_ONLY_REQUIRED', '接口仅支持单条只读查询')
      terminated = true
      continue
    }
    if (terminated && !/\s/.test(ch))
      throw new QueryApiError('READ_ONLY_REQUIRED', '接口仅支持单条只读查询')
    if (ch === "'") {
      output += ch
      escaped = /[eE]/.test(sql[i - 1] || '') && !/[A-Za-z\d_$]/.test(sql[i - 2] || '')
      state = 'single'
      continue
    }
    if (ch === '"') {
      output += ch
      state = 'double'
      continue
    }
    if (ch === '$') {
      const dollar = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z\d_]*)?\$/)?.[0]
      if (dollar) {
        tag = dollar
        output += tag
        i += tag.length - 1
        state = 'dollar'
        continue
      }
      if (/\d/.test(next || ''))
        throw new QueryApiError('INVALID_SQL', '请使用 :参数名，不能混用位置参数')
    }
    if (ch === ':' && next !== ':' && sql[i - 1] !== ':') {
      const name = sql.slice(i + 1).match(/^[A-Za-z_][A-Za-z\d_]*/)?.[0]
      if (name) {
        const definition = known.get(name)
        if (!definition) throw new QueryApiError('INVALID_PARAMETERS', `请定义 SQL 参数 ${name}`)
        let index = names.indexOf(name)
        if (index < 0) {
          index = names.length
          names.push(name)
        }
        output += `CAST($${index + 1} AS ${TYPES[definition.type]})`
        i += name.length
        continue
      }
    }
    output += ch
  }
  if (state !== 'code' && state !== 'line')
    throw new QueryApiError('INVALID_SQL', 'SQL 引号或注释未闭合')
  if (names.length !== known.size)
    throw new QueryApiError('INVALID_PARAMETERS', '参数定义中存在 SQL 未使用的名称')
  return { sql: output, names }
}

export function bindParameters(
  definitions: ApiParameter[],
  names: string[],
  input: unknown,
  preview = false
): (string | number | boolean | null)[] {
  if (!preview && (!input || typeof input !== 'object' || Array.isArray(input)))
    throw new QueryApiError('INVALID_PARAMETERS', '请用 params 对象提供接口参数')
  const values = record(input)
  const known = new Map(definitions.map((parameter) => [parameter.name, parameter]))
  if (!preview && Object.keys(values).some((name) => !known.has(name)))
    throw new QueryApiError('INVALID_PARAMETERS', '调用参数包含未定义的名称')
  return names.map((name) => {
    const parameter = known.get(name)!
    const value = Object.hasOwn(values, name) ? values[name] : undefined
    if (preview) return null
    if (value === undefined || value === null) {
      if (parameter.required)
        throw new QueryApiError('INVALID_PARAMETERS', `请提供必填参数 ${name}`)
      return null
    }
    const invalid = () => new QueryApiError('INVALID_PARAMETERS', `参数 ${name} 与定义类型不符`)
    if (parameter.type === 'string') {
      if (typeof value !== 'string' || value.length > 10000) throw invalid()
      return value
    }
    if (parameter.type === 'number') {
      if (
        typeof value === 'string' &&
        value.length <= 128 &&
        /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d{1,3})?$/.test(value)
      )
        return value
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        Math.abs(value) > Number.MAX_SAFE_INTEGER
      )
        throw invalid()
      return value
    }
    if (parameter.type === 'boolean') {
      if (typeof value !== 'boolean') throw invalid()
      return value
    }
    if (typeof value !== 'string') throw invalid()
    if (parameter.type === 'uuid') {
      if (!UUID.test(value)) throw invalid()
      return value
    }
    if (
      !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      throw invalid()
    return value
  })
}

// Executable routines are deliberately limited to ordinary reporting functions.
// Published APIs cannot call arbitrary RPCs, session controls, sequences or locks.
const SAFE_FUNCTIONS = new Set(
  `count sum avg min max bool_and bool_or every array_agg string_agg json_agg jsonb_agg json_object_agg jsonb_object_agg
  abs ceil ceiling floor round trunc mod power sqrt exp ln log sign greatest least coalesce nullif
  lower upper length char_length character_length octet_length trim btrim ltrim rtrim substring substr left right concat concat_ws replace split_part position strpos regexp_replace regexp_match regexp_matches
  to_char to_date to_timestamp date_trunc date_part extract age now current_date current_timestamp localtimestamp timezone make_date make_interval
  json_build_object jsonb_build_object json_build_array jsonb_build_array json_object jsonb_object json_array_length jsonb_array_length json_extract_path_text jsonb_extract_path_text json_typeof jsonb_typeof json_strip_nulls jsonb_strip_nulls
  row_number rank dense_rank percent_rank cume_dist ntile lag lead first_value last_value nth_value percentile_cont percentile_disc variance var_pop var_samp stddev stddev_pop stddev_samp unnest cardinality array_length array_to_string generate_series`.split(
    /\s+/
  )
)

export function validateReadOnlyAst(ast: unknown): void {
  const statements = Array.isArray(ast) ? ast : [ast]
  if (statements.length !== 1 || record(statements[0]).type !== 'select')
    throw new QueryApiError('READ_ONLY_REQUIRED', '接口仅支持单条 SELECT / WITH 只读查询')
  const inspect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(inspect)
      return
    }
    const row = record(value)
    if (
      [
        'insert',
        'update',
        'delete',
        'replace',
        'create',
        'drop',
        'alter',
        'call',
        'set',
        'transaction',
        'copy'
      ].includes(String(row.type).toLowerCase()) ||
      record(row.into).position ||
      row.locking_read
    )
      throw new QueryApiError('READ_ONLY_REQUIRED', '接口不支持写入、锁定、事务或会话控制语句')
    if (row.type === 'function' || row.type === 'aggr_func') {
      const raw =
        typeof row.name === 'string'
          ? [row.name]
          : Array.isArray(record(row.name).name)
            ? record(row.name).name
            : []
      const parts = (raw as unknown[])
        .map((part) => (typeof part === 'string' ? part : String(record(part).value || '')))
        .map((part) => part.toLowerCase())
      if (
        !parts.length ||
        parts.length > 2 ||
        (parts.length === 2 && parts[0] !== 'pg_catalog') ||
        !SAFE_FUNCTIONS.has(parts[parts.length - 1])
      )
        throw new QueryApiError(
          'READ_ONLY_REQUIRED',
          '接口 SQL 包含不支持的函数，请使用普通统计、文本或日期函数'
        )
    }
    Object.values(row).forEach((child) => {
      if (child && typeof child === 'object') inspect(child)
    })
  }
  inspect(statements[0])
}
