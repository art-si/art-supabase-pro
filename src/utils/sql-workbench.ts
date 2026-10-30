import type { SqlDialect } from '@/types/sql-connections'

export interface SqlColumnRef {
  name: string
  dataType: string
  isNullable: boolean
  description?: string | null
  isPrimaryKey?: boolean
  defaultValue?: string | null
  enumValues?: string[]
}

export interface SqlIndexRef {
  name: string
  columns: string[]
  isUnique: boolean
  isPrimary: boolean
  definition?: string | null
}

export interface SqlTableRef {
  tableSchema: string
  tableName: string
  description?: string | null
  kind?: 'table' | 'view' | 'materialized_view'
  indexes?: SqlIndexRef[]
  columns: SqlColumnRef[]
}

export interface SqlTableTemplate {
  kind: 'select' | 'count' | 'primary-key'
  label: string
  sql: string
}

export interface SqlPlanStep {
  id: string
  depth: number
  nodeType: string
  relationName?: string
  schema?: string
  alias?: string
  indexName?: string
  filter?: string
  startupCost?: number
  totalCost?: number
  planRows?: number
  planWidth?: number
}

export interface SqlForeignKeyRef {
  sourceSchema: string
  sourceTable: string
  sourceColumn: string
  targetSchema: string
  targetTable: string
  targetColumn: string
  constraintName: string
}

export interface SqlMetadataRef {
  schemas: string[]
  tables: SqlTableRef[]
  columns: Array<{
    tableSchema: string
    tableName: string
    columnName: string
    dataType: string
    isNullable: string
    ordinalPosition: number
    description?: string | null
    isPrimaryKey?: boolean
    defaultValue?: string | null
  }>
  functions: Array<{
    routineSchema: string
    routineName: string
    returnType: string
  }>
  foreignKeys?: SqlForeignKeyRef[]
}

export interface SqlAliasRef {
  alias: string
  tableSchema: string
  tableName: string
}

export interface SqlJoinSuggestion {
  label: string
  insertText: string
  detail: string
  documentation: string
}

export interface SqlErrorLocation {
  lineNumber: number
  startColumn: number
  endColumn: number
}

export interface SqlCompletionContext {
  statement: string
  kind: 'start' | 'table' | 'qualified' | 'column' | 'general' | 'none'
  qualifier?: string
  isJoin?: boolean
}

export interface SqlExecutionTarget {
  sql: string
  startOffset: number
  source: 'selection' | 'statement'
}

export interface SqlStatementRef {
  sql: string
  startOffset: number
  endOffset: number
  lineNumber: number
  command: string
}

const SYSTEM_SCHEMAS = new Set(['pg_catalog', 'information_schema', 'pg_toast'])

export function isSqlSystemSchema(schema: string): boolean {
  return (
    SYSTEM_SCHEMAS.has(schema) || schema === 'pg_temp' || /^pg_(?:toast_)?temp_\d+$/.test(schema)
  )
}

/** Keep connection-local objects out of browsing, completion and AI context alike. */
export function filterSqlWorkbenchMetadata(
  metadata: SqlMetadataRef
): SqlMetadataRef & { foreignKeys: SqlForeignKeyRef[] } {
  return {
    ...metadata,
    schemas: metadata.schemas.filter((schema) => !isSqlSystemSchema(schema)),
    tables: metadata.tables.filter((table) => !isSqlSystemSchema(table.tableSchema)),
    columns: metadata.columns.filter((column) => !isSqlSystemSchema(column.tableSchema)),
    functions: metadata.functions.filter((fn) => !isSqlSystemSchema(fn.routineSchema)),
    foreignKeys: (metadata.foreignKeys || []).filter(
      (key) => !isSqlSystemSchema(key.sourceSchema) && !isSqlSystemSchema(key.targetSchema)
    )
  }
}

/** Quote identifiers individually; schema/table names must never be interpolated as SQL syntax. */
export function quoteSqlIdentifier(identifier: string, dialect: SqlDialect = 'postgres'): string {
  const quote = dialect === 'mysql' ? '`' : '"'
  return `${quote}${identifier.replaceAll(quote, quote + quote)}${quote}`
}

/** Ready-to-edit read templates for the selected relation. No query is run by this helper. */
export function buildSqlTableTemplates(
  table: SqlTableRef,
  dialect: SqlDialect = 'postgres'
): SqlTableTemplate[] {
  const quote = (value: string) => quoteSqlIdentifier(value, dialect)
  const relation = `${quote(table.tableSchema)}.${quote(table.tableName)}`
  const selectedColumns = table.columns.length
    ? table.columns.map((column) => `  ${quote(column.name)}`).join(',\n')
    : '  *'
  const templates: SqlTableTemplate[] = [
    {
      kind: 'select',
      label: '查询前 100 行',
      sql: `SELECT\n${selectedColumns}\nFROM ${relation}\nLIMIT 100;`
    },
    {
      kind: 'count',
      label: '统计行数',
      sql: `SELECT COUNT(*) AS total_count\nFROM ${relation};`
    }
  ]
  const primaryKeys = table.columns.filter((column) => column.isPrimaryKey)
  if (primaryKeys.length) {
    templates.push({
      kind: 'primary-key',
      label: '按主键查询',
      sql: `SELECT\n${selectedColumns}\nFROM ${relation}\nWHERE ${primaryKeys.map((column) => `${quote(column.name)} = NULL /* 输入主键值 */`).join('\n  AND ')}\nLIMIT 100;`
    })
  }
  return templates
}

/** Flatten PostgreSQL EXPLAIN (FORMAT JSON) for a compact, readable plan tree. */
export function flattenSqlPlan(plan: unknown): SqlPlanStep[] {
  if (!Array.isArray(plan)) return []
  const steps: SqlPlanStep[] = []
  const readObject = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  const readText = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined
  const readNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined

  function visit(value: unknown, id: string, depth: number): void {
    const node = readObject(value)
    if (!node) return
    steps.push({
      id,
      depth,
      nodeType: readText(node['Node Type']) ?? '未知节点',
      relationName: readText(node['Relation Name']),
      schema: readText(node.Schema),
      alias: readText(node.Alias),
      indexName: readText(node['Index Name']),
      filter: readText(node.Filter) ?? readText(node['Index Cond']),
      startupCost: readNumber(node['Startup Cost']),
      totalCost: readNumber(node['Total Cost']),
      planRows: readNumber(node['Plan Rows']),
      planWidth: readNumber(node['Plan Width'])
    })
    if (Array.isArray(node.Plans)) {
      node.Plans.forEach((child, index) => visit(child, `${id}.${index}`, depth + 1))
    }
  }

  plan.forEach((item, index) => visit(readObject(item)?.Plan, `${index}`, 0))
  return steps
}
const SQL_CLAUSE_WORDS = new Set([
  'as',
  'on',
  'where',
  'join',
  'left',
  'right',
  'full',
  'inner',
  'outer',
  'cross',
  'natural',
  'group',
  'order',
  'having',
  'limit',
  'offset',
  'union',
  'returning',
  'set',
  'values',
  'using',
  'for',
  'window',
  'fetch'
])

// Mask comments and literals while preserving offsets. Semicolons inside them do not split statements.
function maskSql(sql: string, dialect: SqlDialect = 'postgres') {
  let masked = ''
  let state: 'code' | 'single' | 'double' | 'backtick' | 'line' | 'block' | 'dollar' = 'code'
  let dollarTag = ''
  let blockDepth = 0
  let escapedString = false

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]

    if (state === 'code') {
      const tag = char === '$' ? sql.slice(index).match(/^\$(?:[a-zA-Z_][\w]*)?\$/)?.[0] : undefined
      if (tag) {
        dollarTag = tag
        state = 'dollar'
        masked += ' '.repeat(tag.length)
        index += tag.length - 1
        continue
      }
      if (char === "'") {
        state = 'single'
        escapedString =
          dialect === 'mysql' || /(?:^|[^\w])e$/i.test(sql.slice(Math.max(0, index - 2), index))
      } else if (char === '"') {
        state = 'double'
        escapedString = dialect === 'mysql'
      } else if (char === '`' && dialect === 'mysql') state = 'backtick'
      else if (char === '#' && dialect === 'mysql') state = 'line'
      else if (char === '-' && next === '-') state = 'line'
      else if (char === '/' && next === '*') {
        state = 'block'
        blockDepth = 1
        masked += '  '
        index += 1
        continue
      } else {
        masked += char
        continue
      }
    } else if (state === 'dollar') {
      if (sql.startsWith(dollarTag, index)) {
        masked += ' '.repeat(dollarTag.length)
        index += dollarTag.length - 1
        state = 'code'
        continue
      }
    } else if (
      (state === 'single' || (state === 'double' && dialect === 'mysql')) &&
      escapedString &&
      char === '\\' &&
      next
    ) {
      masked += next === '\n' ? ' \n' : '  '
      index += 1
      continue
    } else if (state === 'single' && char === "'" && next === "'") {
      masked += '  '
      index += 1
      continue
    } else if (state === 'single' && char === "'") state = 'code'
    else if (state === 'double' && char === '"' && next === '"') {
      masked += '  '
      index += 1
      continue
    } else if (state === 'double' && char === '"') state = 'code'
    else if (state === 'backtick' && char === '`' && next === '`') {
      masked += '  '
      index++
      continue
    } else if (state === 'backtick' && char === '`') state = 'code'
    else if (state === 'line' && char === '\n') state = 'code'
    else if (state === 'block' && char === '/' && next === '*') {
      blockDepth += 1
      masked += '  '
      index += 1
      continue
    } else if (state === 'block' && char === '*' && next === '/') {
      masked += '  '
      index += 1
      blockDepth -= 1
      if (blockDepth === 0) state = 'code'
      continue
    }

    masked += char === '\n' ? '\n' : ' '
  }

  return { masked, state }
}

/** The editor runs one statement; delimiters inside PostgreSQL literals/comments stay intact. */
export function getSqlStatements(sql: string, dialect: SqlDialect = 'postgres'): SqlStatementRef[] {
  const masked = maskSql(sql, dialect).masked
  const statements: SqlStatementRef[] = []
  let start = 0
  let lineNumber = 1
  let previousStart = 0
  for (let end = 0; end <= masked.length; end += 1) {
    if (end !== masked.length && masked[end] !== ';') continue
    const firstCode = masked.slice(start, end).search(/\S/)
    if (firstCode !== -1) {
      const startOffset = start + firstCode
      lineNumber += sql.slice(previousStart, startOffset).split('\n').length - 1
      previousStart = startOffset
      const endOffset = end < masked.length ? end + 1 : end
      statements.push({
        sql: sql.slice(startOffset, endOffset).trimEnd(),
        startOffset,
        endOffset,
        lineNumber,
        command: masked.slice(startOffset, end).match(/^\w+/)?.[0].toUpperCase() || 'SQL'
      })
    }
    start = end + 1
  }
  return statements
}

export function getSqlExecutionTarget(
  sql: string,
  cursorOffset: number,
  selection?: { start: number; end: number },
  dialect: SqlDialect = 'postgres'
): SqlExecutionTarget {
  let start = selection?.start ?? 0
  let end = selection?.end ?? sql.length
  if (!selection) {
    const masked = maskSql(sql, dialect).masked
    let offset = Math.max(0, Math.min(cursorOffset, sql.length))
    // At a statement's trailing semicolon (or trailing whitespace), keep that statement active.
    if (!masked.slice(offset).trim()) offset = masked.trimEnd().length
    if (masked[offset - 1] === ';') offset -= 1
    start = masked.lastIndexOf(';', offset - 1) + 1
    const delimiter = masked.indexOf(';', offset)
    end = delimiter === -1 ? sql.length : delimiter + 1
  }
  const text = sql.slice(start, end)
  const firstCode = maskSql(text, dialect).masked.search(/\S/)
  const source = selection ? 'selection' : 'statement'
  if (firstCode === -1) return { sql: '', startOffset: start, source }
  start += firstCode
  return {
    sql: sql.slice(start, end).trimEnd(),
    startOffset: start,
    source
  }
}

export function getSqlCompletionContext(
  sql: string,
  cursorOffset: number,
  dialect: SqlDialect = 'postgres'
): SqlCompletionContext {
  const offset = Math.max(0, Math.min(cursorOffset, sql.length))
  const before = maskSql(sql.slice(0, offset), dialect)
  if (before.state !== 'code') return { statement: '', kind: 'none' }

  const masked = maskSql(sql, dialect).masked
  const start = before.masked.lastIndexOf(';') + 1
  const nextDelimiter = masked.indexOf(';', offset)
  const end = nextDelimiter === -1 ? sql.length : nextDelimiter
  const statement = sql.slice(start, end)
  const prefix = before.masked.slice(start)

  if (!prefix.trim()) return { statement, kind: 'start' }

  const tableMatch = prefix.match(/\b(FROM|JOIN|UPDATE|INTO)\s+(?:([a-zA-Z_][\w]*)\.)?([\w]*)$/i)
  if (tableMatch) {
    return {
      statement,
      kind: 'table',
      qualifier: tableMatch[2],
      isJoin: tableMatch[1].toUpperCase() === 'JOIN'
    }
  }

  const qualifiedMatch = prefix.match(/\b([a-zA-Z_][\w]*)\.([\w]*)$/)
  if (qualifiedMatch) return { statement, kind: 'qualified', qualifier: qualifiedMatch[1] }

  if (/\b(SELECT|WHERE|ON|HAVING|GROUP\s+BY|ORDER\s+BY|SET|RETURNING)\b[\s\S]*$/i.test(prefix)) {
    return { statement, kind: 'column' }
  }

  return { statement, kind: 'general' }
}

export function getTableKey(schema: string, table: string) {
  return `${schema}.${table}`.toLowerCase()
}

export function buildTableIndexes(metadata: SqlMetadataRef) {
  const tableByKey = new Map<string, SqlTableRef>()
  const tableByName = new Map<string, SqlTableRef[]>()

  metadata.tables.forEach((table) => {
    const key = getTableKey(table.tableSchema || 'public', table.tableName)
    tableByKey.set(key, table)

    const nameKey = table.tableName.toLowerCase()
    const current = tableByName.get(nameKey) || []
    current.push(table)
    tableByName.set(nameKey, current)
  })

  return { tableByKey, tableByName }
}

export function extractSqlAliases(sql: string): SqlAliasRef[] {
  const aliases = new Map<string, SqlAliasRef>()
  const aliasPattern =
    /\b(from|join|update|into)\s+((?:"?([a-zA-Z0-9_]+)"?)\.)?"?([a-zA-Z0-9_]+)"?(?:\s+(?:as\s+)?([a-zA-Z0-9_]+))?/gi

  let match: RegExpExecArray | null
  while ((match = aliasPattern.exec(sql)) !== null) {
    const schema = match[3] || 'public'
    const tableName = match[4]
    const candidate = match[5]
    const alias =
      candidate && !SQL_CLAUSE_WORDS.has(candidate.toLowerCase()) ? candidate : tableName

    aliases.set(alias.toLowerCase(), {
      alias,
      tableSchema: schema,
      tableName
    })
  }

  return Array.from(aliases.values())
}

// 把别名、schema.table 和裸表名统一解析成 metadata 里的表对象。
export function resolveTableRef(
  reference: string,
  metadata: SqlMetadataRef,
  aliases?: SqlAliasRef[]
): SqlTableRef | undefined {
  const normalized = reference.replace(/"/g, '').trim().toLowerCase()
  if (!normalized) return undefined

  const { tableByKey, tableByName } = buildTableIndexes(metadata)

  const aliasMatch = aliases?.find((item) => item.alias.toLowerCase() === normalized)
  if (aliasMatch) {
    return tableByKey.get(getTableKey(aliasMatch.tableSchema, aliasMatch.tableName))
  }

  if (normalized.includes('.')) {
    const [schema, tableName] = normalized.split('.', 2)
    return tableByKey.get(getTableKey(schema, tableName))
  }

  const matches = tableByName.get(normalized) || []
  return matches[0]
}

export function getColumnsForSqlContext(sql: string, metadata: SqlMetadataRef) {
  const aliases = extractSqlAliases(sql)
  const tables = aliases
    .map((alias) => {
      const table = resolveTableRef(alias.alias, metadata, aliases)
      return table
        ? {
            alias: alias.alias,
            table
          }
        : null
    })
    .filter(Boolean) as Array<{ alias: string; table: SqlTableRef }>

  return tables.flatMap(({ alias, table }) =>
    table.columns.map((column) => ({
      alias,
      table,
      column
    }))
  )
}

function buildRelationDocumentation(relation: SqlForeignKeyRef) {
  return [
    `Constraint: ${relation.constraintName}`,
    `${relation.sourceSchema}.${relation.sourceTable}.${relation.sourceColumn}`,
    `-> ${relation.targetSchema}.${relation.targetTable}.${relation.targetColumn}`
  ].join('\n')
}

// 没有真实外键时，用常见的 xxx_id 约定兜底，保证 JOIN 补全不完全失效。
function buildFallbackRelation(
  source: SqlTableRef,
  target: SqlTableRef
): SqlForeignKeyRef | undefined {
  const sourceName = source.tableName.toLowerCase()
  const targetName = target.tableName.toLowerCase()

  for (const sourceColumn of source.columns) {
    const normalized = sourceColumn.name.toLowerCase()
    if (normalized === 'id') continue

    const sourceLooksLikeTarget =
      normalized === `${targetName}_id` ||
      normalized === `${targetName.replace(/s$/, '')}_id` ||
      normalized === `${targetName}id`

    if (sourceLooksLikeTarget) {
      const targetId = target.columns.find((item) => item.name.toLowerCase() === 'id')
      if (targetId) {
        return {
          sourceSchema: source.tableSchema,
          sourceTable: source.tableName,
          sourceColumn: sourceColumn.name,
          targetSchema: target.tableSchema,
          targetTable: target.tableName,
          targetColumn: targetId.name,
          constraintName: 'inferred_by_column_name'
        }
      }
    }
  }

  for (const targetColumn of target.columns) {
    const normalized = targetColumn.name.toLowerCase()
    if (normalized === 'id') continue

    const targetLooksLikeSource =
      normalized === `${sourceName}_id` ||
      normalized === `${sourceName.replace(/s$/, '')}_id` ||
      normalized === `${sourceName}id`

    if (targetLooksLikeSource) {
      const sourceId = source.columns.find((item) => item.name.toLowerCase() === 'id')
      if (sourceId) {
        return {
          sourceSchema: target.tableSchema,
          sourceTable: target.tableName,
          sourceColumn: targetColumn.name,
          targetSchema: source.tableSchema,
          targetTable: source.tableName,
          targetColumn: sourceId.name,
          constraintName: 'inferred_by_column_name'
        }
      }
    }
  }

  return undefined
}

// 以当前 SQL 最后一个 FROM/JOIN 表为基准，推导下一跳最可能的 JOIN。
export function buildJoinSuggestions(sql: string, metadata: SqlMetadataRef): SqlJoinSuggestion[] {
  const aliases = extractSqlAliases(sql)
  if (aliases.length === 0) return []

  const baseAlias = aliases[aliases.length - 1]
  const baseTable = resolveTableRef(baseAlias.alias, metadata, aliases)
  if (!baseTable) return []

  const foreignKeys = metadata.foreignKeys || []
  const usedTables = new Set(aliases.map((item) => getTableKey(item.tableSchema, item.tableName)))
  const suggestions: SqlJoinSuggestion[] = []
  const seen = new Set<string>()

  metadata.tables
    .filter((table) => !isSqlSystemSchema(table.tableSchema))
    .forEach((candidate) => {
      if (
        candidate.tableName === baseTable.tableName &&
        candidate.tableSchema === baseTable.tableSchema
      ) {
        return
      }

      const candidateKey = getTableKey(candidate.tableSchema, candidate.tableName)
      const relation =
        foreignKeys.find(
          (item) =>
            (getTableKey(item.sourceSchema, item.sourceTable) ===
              getTableKey(baseTable.tableSchema, baseTable.tableName) &&
              getTableKey(item.targetSchema, item.targetTable) === candidateKey) ||
            (getTableKey(item.targetSchema, item.targetTable) ===
              getTableKey(baseTable.tableSchema, baseTable.tableName) &&
              getTableKey(item.sourceSchema, item.sourceTable) === candidateKey)
        ) || buildFallbackRelation(baseTable, candidate)

      if (!relation) return

      const candidateAlias = suggestAlias(
        candidate.tableName,
        aliases.map((item) => item.alias)
      )
      const baseAliasName = baseAlias.alias

      const joinCondition =
        getTableKey(relation.sourceSchema, relation.sourceTable) ===
        getTableKey(baseTable.tableSchema, baseTable.tableName)
          ? `${baseAliasName}.${relation.sourceColumn} = ${candidateAlias}.${relation.targetColumn}`
          : `${baseAliasName}.${relation.targetColumn} = ${candidateAlias}.${relation.sourceColumn}`

      const insertText = usedTables.has(candidateKey)
        ? `JOIN ${candidate.tableSchema}.${candidate.tableName} ${candidateAlias} ON ${joinCondition}`
        : `JOIN ${candidate.tableSchema}.${candidate.tableName} ${candidateAlias} ON ${joinCondition}`

      if (seen.has(insertText)) return
      seen.add(insertText)

      suggestions.push({
        label: `JOIN ${candidate.tableName}`,
        insertText,
        detail:
          relation.constraintName === 'inferred_by_column_name'
            ? 'JOIN inference'
            : `JOIN via ${relation.constraintName}`,
        documentation: buildRelationDocumentation(relation)
      })
    })

  return suggestions
}

export function suggestAlias(tableName: string, usedAliases: string[] = []) {
  const segments = tableName.split('_').filter(Boolean)
  let candidate =
    segments.length > 1
      ? segments.map((item) => item[0]).join('')
      : tableName.slice(0, Math.min(2, tableName.length))

  candidate = candidate.toLowerCase() || 't'
  const used = new Set(usedAliases.map((item) => item.toLowerCase()))
  if (!used.has(candidate)) return candidate

  let index = 2
  while (used.has(`${candidate}${index}`)) {
    index += 1
  }
  return `${candidate}${index}`
}

// 给语句开头补整句模板，减少只会补关键字不会补结构的问题。
export function buildSqlTemplateSuggestions(metadata: SqlMetadataRef): SqlJoinSuggestion[] {
  const primaryTable =
    metadata.tables.find((item) => item.tableSchema === 'public') || metadata.tables[0]
  const tableName = primaryTable
    ? `${primaryTable.tableSchema}.${primaryTable.tableName}`
    : 'public.table_name'
  const alias = primaryTable ? suggestAlias(primaryTable.tableName) : 't'
  const selectedColumns =
    primaryTable?.columns
      .slice(0, 4)
      .map((item) => `${alias}.${item.name}`)
      .join(',\n  ') || `${alias}.id,\n  ${alias}.name`

  return [
    {
      label: 'SELECT statement',
      insertText: `SELECT\n  ${selectedColumns}\nFROM ${tableName} ${alias}\nLIMIT 100;`,
      detail: 'Template',
      documentation: 'Generate a full SELECT query with alias and limit.'
    },
    {
      label: 'SELECT with WHERE',
      insertText: `SELECT\n  ${selectedColumns}\nFROM ${tableName} ${alias}\nWHERE ${alias}.${primaryTable?.columns[0]?.name || 'id'} = \${1:value}\nLIMIT 100;`,
      detail: 'Template',
      documentation: 'Generate a filtered SELECT query.'
    },
    {
      label: 'INSERT statement',
      insertText: `INSERT INTO ${tableName} (\n  ${
        (primaryTable?.columns || [])
          .slice(0, 3)
          .map((item) => item.name)
          .join(',\n  ') || 'column_a,\n  column_b'
      }\n) VALUES (\n  \${1:value_a},\n  \${2:value_b}\n);`,
      detail: 'Template',
      documentation: 'Generate an INSERT statement.'
    },
    {
      label: 'UPDATE statement',
      insertText: `UPDATE ${tableName}\nSET ${primaryTable?.columns[0]?.name || 'column_name'} = \${1:value}\nWHERE ${primaryTable?.columns[1]?.name || 'id'} = \${2:id};`,
      detail: 'Template',
      documentation: 'Generate an UPDATE statement.'
    },
    {
      label: 'DELETE statement',
      insertText: `DELETE FROM ${tableName}\nWHERE ${primaryTable?.columns[0]?.name || 'id'} = \${1:id};`,
      detail: 'Template',
      documentation: 'Generate a DELETE statement.'
    },
    {
      label: 'CTE statement',
      insertText: `WITH ranked_rows AS (\n  SELECT\n    ${selectedColumns},\n    ROW_NUMBER() OVER (ORDER BY ${alias}.${primaryTable?.columns[0]?.name || 'id'} DESC) AS rn\n  FROM ${tableName} ${alias}\n)\nSELECT *\nFROM ranked_rows\nWHERE rn <= 100;`,
      detail: 'Template',
      documentation: 'Generate a common table expression.'
    }
  ]
}

// 解析 Postgres 报错中的 LINE / Position，供 Monaco marker 和结果面板复用。
export function parseSqlErrorLocation(message: string): SqlErrorLocation | null {
  if (!message) return null

  const lineMatch = message.match(/LINE\s+(\d+):([^\n]*)/i)
  const caretMatch = message.match(/\n([ \t]*)\^/m)

  if (lineMatch && caretMatch) {
    const lineNumber = Number(lineMatch[1])
    const lineText = lineMatch[2] || ''
    const startColumn = Math.min(caretMatch[1].length + 1, lineText.length + 1)
    return {
      lineNumber,
      startColumn,
      endColumn: Math.max(startColumn + 1, startColumn)
    }
  }

  const positionMatch = message.match(/Position:\s*(\d+)/i)
  if (positionMatch) {
    return {
      lineNumber: 1,
      startColumn: Number(positionMatch[1]),
      endColumn: Number(positionMatch[1]) + 1
    }
  }

  return null
}

export function buildCaretDiagnostic(sql: string, location: SqlErrorLocation | null) {
  if (!location) return ''
  const lines = sql.split(/\r?\n/)
  const lineText = lines[location.lineNumber - 1] || ''
  const caretPadding = ' '.repeat(Math.max(location.startColumn - 1, 0))
  return `${lineText}\n${caretPadding}^`
}

// AI 只需要一个可控大小的 schema 摘要，避免把整库信息全塞进 prompt。
export function buildAiSchemaSummary(metadata: SqlMetadataRef, maxTables = 12) {
  return metadata.tables.slice(0, maxTables).map((table) => ({
    schema: table.tableSchema,
    table: table.tableName,
    columns: table.columns.slice(0, 12).map((column) => ({
      name: column.name,
      type: column.dataType
    }))
  }))
}
