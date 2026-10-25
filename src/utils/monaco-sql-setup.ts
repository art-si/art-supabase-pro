import { monaco } from './monaco-runtime'
import {
  conf as pgsqlConfiguration,
  language as pgsqlLanguage
} from 'monaco-sql-languages/esm/languages/pgsql/pgsql.js'
import {
  buildJoinSuggestions,
  buildSqlTemplateSuggestions,
  extractSqlAliases,
  getColumnsForSqlContext,
  getSqlCompletionContext,
  resolveTableRef
} from './sql-workbench'

const PGSQL_LANGUAGE_ID = 'pgsql'

if (!monaco.languages.getLanguages().some(({ id }) => id === PGSQL_LANGUAGE_ID)) {
  monaco.languages.register({
    id: PGSQL_LANGUAGE_ID,
    aliases: ['PgSQL', 'PostgreSQL', 'postgresql'],
    extensions: ['.pgsql']
  })
}
monaco.languages.setLanguageConfiguration(PGSQL_LANGUAGE_ID, pgsqlConfiguration)
monaco.languages.setMonarchTokensProvider(PGSQL_LANGUAGE_ID, pgsqlLanguage)

const pgsqlKeywords = Array.isArray(pgsqlLanguage.keywords)
  ? pgsqlLanguage.keywords.filter(
      (keyword: unknown): keyword is string => typeof keyword === 'string'
    )
  : []

let dbMetadata: Api.DataCenter.SqlConsole.DatabaseMetadata = {
  schemas: [],
  tables: [],
  functions: [],
  columns: [],
  foreignKeys: []
}

export function registerSqlMetadata(
  metadata: Api.DataCenter.SqlConsole.DatabaseMetadata | Api.DataCenter.SqlConsole.TableMetadata[]
) {
  if (!metadata) return

  if (Array.isArray(metadata)) {
    dbMetadata.tables = metadata
    return
  }

  dbMetadata = {
    schemas: metadata.schemas || [],
    tables: metadata.tables || [],
    functions: metadata.functions || [],
    columns: metadata.columns || [],
    foreignKeys: metadata.foreignKeys || []
  }
}

function createRange(model: monaco.editor.ITextModel, position: monaco.Position) {
  const word = model.getWordUntilPosition(position)
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn
  }
}

function buildTableCompletionItems(range: monaco.IRange, schemaFilter?: string) {
  return dbMetadata.tables
    .filter(
      (table) => !schemaFilter || table.tableSchema.toLowerCase() === schemaFilter.toLowerCase()
    )
    .flatMap((table) => {
      const schemaName = table.tableSchema || 'public'
      const columnsPreview = table.columns
        .slice(0, 6)
        .map((column) => `${column.name} ${column.dataType}`)
        .join(', ')
      const alias = table.tableName
        .split('_')
        .filter(Boolean)
        .map((item) => item[0])
        .join('')
        .toLowerCase()

      const items = [
        {
          label: table.tableName,
          kind: monaco.languages.CompletionItemKind.Class,
          detail: `TABLE ${schemaName}`,
          insertText: table.tableName,
          documentation: {
            value: `**${schemaName}.${table.tableName}**\n\n${columnsPreview || 'No columns loaded'}`
          },
          range,
          sortText: `30_${table.tableName}`
        },
        {
          label: `${schemaName}.${table.tableName}`,
          kind: monaco.languages.CompletionItemKind.Class,
          detail: 'Qualified table',
          insertText: `${schemaName}.${table.tableName} ${alias || 't'}`,
          range,
          sortText: `31_${table.tableName}`
        }
      ]
      return schemaFilter ? items.slice(0, 1) : items
    })
}

function buildFunctionCompletionItems(range: monaco.IRange) {
  return dbMetadata.functions.map((fn) => ({
    label: fn.routineName,
    kind: monaco.languages.CompletionItemKind.Function,
    detail: `${fn.routineSchema}.${fn.routineName}() -> ${fn.returnType}`,
    insertText: `${fn.routineName}($1)`,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
    sortText: `40_${fn.routineName}`
  }))
}

function buildSchemaCompletionItems(range: monaco.IRange) {
  return dbMetadata.schemas.map((schema) => ({
    label: schema,
    kind: monaco.languages.CompletionItemKind.Module,
    detail: 'Schema',
    insertText: schema,
    range,
    sortText: `50_${schema}`
  }))
}

function buildKeywordCompletionItems(range: monaco.IRange, keywords: string[] = []) {
  return keywords.map((keyword) => ({
    label: keyword,
    kind: monaco.languages.CompletionItemKind.Keyword,
    detail: 'Keyword',
    insertText: keyword,
    range,
    sortText: `80_${keyword}`
  }))
}

function buildColumnCompletionItems(
  range: monaco.IRange,
  sql: string,
  aliasOnly?: string
): monaco.languages.CompletionItem[] {
  const aliases = extractSqlAliases(sql)

  if (aliasOnly) {
    const table = resolveTableRef(aliasOnly, dbMetadata, aliases)
    if (!table) return []

    return table.columns.map((column) => ({
      label: column.name,
      kind: monaco.languages.CompletionItemKind.Field,
      detail: `${table.tableName}.${column.name} ${column.dataType}`,
      insertText: column.name,
      documentation: `Table: ${table.tableSchema}.${table.tableName}\nColumn: ${column.name}\nType: ${column.dataType}`,
      range,
      sortText: `00_${column.name}`
    }))
  }

  const columns = getColumnsForSqlContext(sql, dbMetadata)
  const counts = new Map<string, number>()
  columns.forEach(({ column }) => {
    const key = column.name.toLowerCase()
    counts.set(key, (counts.get(key) || 0) + 1)
  })

  return columns.flatMap(({ alias, table, column }) => {
    const qualified = `${alias}.${column.name}`
    const base = {
      kind: monaco.languages.CompletionItemKind.Field,
      detail: `${table.tableName}.${column.name} ${column.dataType}`,
      documentation: `Table: ${table.tableSchema}.${table.tableName}\nColumn: ${column.name}\nType: ${column.dataType}`,
      range
    }
    const suggestions: monaco.languages.CompletionItem[] = [
      { ...base, label: qualified, insertText: qualified, sortText: `05_${qualified}` }
    ]
    if (counts.get(column.name.toLowerCase()) === 1) {
      suggestions.unshift({
        ...base,
        label: column.name,
        insertText: column.name,
        sortText: `00_${column.name}`
      })
    }
    return suggestions
  })
}

function buildJoinCompletionItems(range: monaco.IRange, sql: string) {
  return buildJoinSuggestions(sql, dbMetadata).map((item, index) => ({
    label: item.label,
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: item.detail,
    documentation: item.documentation,
    insertText: item.insertText.replace(/^JOIN\s+/i, ''),
    range,
    sortText: `10_${index}`,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
  }))
}

function buildTemplateCompletionItems(range: monaco.IRange) {
  return buildSqlTemplateSuggestions(dbMetadata).map((item, index) => ({
    label: item.label,
    kind: monaco.languages.CompletionItemKind.Snippet,
    detail: item.detail,
    documentation: item.documentation,
    insertText: item.insertText,
    range,
    sortText: `01_${index}`,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
  }))
}

monaco.languages.registerCompletionItemProvider(PGSQL_LANGUAGE_ID, {
  triggerCharacters: [' ', '.', '('],
  provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position) {
    const range = createRange(model, position)
    const fullSql = model.getValue()
    const completion = getSqlCompletionContext(fullSql, model.getOffsetAt(position))
    const items: monaco.languages.CompletionItem[] = []

    if (completion.kind === 'none') return { suggestions: [] }

    if (completion.kind === 'qualified' && completion.qualifier) {
      const table = resolveTableRef(
        completion.qualifier,
        dbMetadata,
        extractSqlAliases(completion.statement)
      )
      return {
        suggestions: table
          ? buildColumnCompletionItems(range, completion.statement, completion.qualifier)
          : buildTableCompletionItems(range, completion.qualifier)
      }
    }

    if (completion.kind === 'start') {
      items.push(...buildTemplateCompletionItems(range))
    }

    if (completion.kind === 'table') {
      if (completion.isJoin && !completion.qualifier) {
        items.push(...buildJoinCompletionItems(range, completion.statement))
      }
      items.push(...buildTableCompletionItems(range, completion.qualifier))
      if (!completion.qualifier) items.push(...buildSchemaCompletionItems(range))
      return { suggestions: items }
    }

    if (completion.kind === 'column') {
      items.push(...buildColumnCompletionItems(range, completion.statement))
      items.push(...buildFunctionCompletionItems(range))
    }

    items.push(...buildKeywordCompletionItems(range, pgsqlKeywords))

    return { suggestions: items }
  }
})

monaco.languages.registerHoverProvider(PGSQL_LANGUAGE_ID, {
  provideHover(model, position) {
    const word = model.getWordAtPosition(position)
    if (!word) return null

    const completion = getSqlCompletionContext(model.getValue(), model.getOffsetAt(position))
    if (completion.kind === 'none') return null
    const statement = completion.statement
    const aliases = extractSqlAliases(statement)
    const linePrefix = model.getLineContent(position.lineNumber).slice(0, word.startColumn - 1)
    const qualifier = linePrefix.match(/\b([a-zA-Z_][\w]*)\.$/)?.[1]
    const table = qualifier ? resolveTableRef(qualifier, dbMetadata, aliases) : undefined
    const column = table?.columns.find(
      (item) => item.name.toLowerCase() === word.word.toLowerCase()
    )
    const visibleColumns = qualifier
      ? []
      : getColumnsForSqlContext(statement, dbMetadata).filter(
          (item) => item.column.name.toLowerCase() === word.word.toLowerCase()
        )
    const columnMatch =
      table && column
        ? { table, column }
        : visibleColumns.length === 1
          ? visibleColumns[0]
          : undefined

    const range = new monaco.Range(
      position.lineNumber,
      word.startColumn,
      position.lineNumber,
      word.endColumn
    )

    if (columnMatch) {
      return {
        range,
        contents: [
          {
            value: `**${columnMatch.table.tableSchema}.${columnMatch.table.tableName}.${columnMatch.column.name}**`
          },
          {
            value: `类型：\`${columnMatch.column.dataType}\`  ·  ${columnMatch.column.isNullable ? '可为空' : '不可为空'}`
          }
        ]
      }
    }

    if (qualifier) return null
    const matchedTable = resolveTableRef(word.word, dbMetadata, aliases)
    if (!matchedTable) return null
    return {
      range,
      contents: [
        { value: `**${matchedTable.tableSchema}.${matchedTable.tableName}**` },
        {
          value:
            matchedTable.columns
              .slice(0, 12)
              .map((item) => `\`${item.name}\` ${item.dataType}`)
              .join('  \n') || '暂无字段元数据'
        }
      ]
    }
  }
})
