export interface SqlColumnRef {
  name: string
  dataType: string
  isNullable: boolean
}

export interface SqlTableRef {
  tableSchema: string
  tableName: string
  columns: SqlColumnRef[]
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

const SYSTEM_SCHEMAS = new Set(['pg_catalog', 'information_schema', 'pg_toast'])
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
function maskSql(sql: string) {
  let masked = ''
  let state: 'code' | 'single' | 'double' | 'line' | 'block' = 'code'

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1]

    if (state === 'code') {
      if (char === "'") state = 'single'
      else if (char === '"') state = 'double'
      else if (char === '-' && next === '-') state = 'line'
      else if (char === '/' && next === '*') state = 'block'
      else {
        masked += char
        continue
      }
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
    else if (state === 'line' && char === '\n') state = 'code'
    else if (state === 'block' && char === '*' && next === '/') {
      masked += '  '
      index += 1
      state = 'code'
      continue
    }

    masked += char === '\n' ? '\n' : ' '
  }

  return { masked, state }
}

export function getSqlCompletionContext(sql: string, cursorOffset: number): SqlCompletionContext {
  const offset = Math.max(0, Math.min(cursorOffset, sql.length))
  const before = maskSql(sql.slice(0, offset))
  if (before.state !== 'code') return { statement: '', kind: 'none' }

  const masked = maskSql(sql).masked
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
    .filter((table) => !SYSTEM_SCHEMAS.has(table.tableSchema))
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
