import { uniq } from 'lodash-es'
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat'
import { toObjectRecord } from '@/utils/record'
import {
  quoteSqlIdentifier,
  type SqlColumnRef,
  type SqlMetadataRef,
  type SqlTableRef
} from '@/utils/sql-workbench'
import type { SqlDialect } from '@/types/sql-connections'
import type { TableEditRecordset } from '@/types/table-edit'

export type SqlDraftRow = Record<string, unknown>
dayjs.extend(customParseFormat)
export type SqlCellEditorKind =
  'json' | 'boolean' | 'date' | 'time' | 'datetime' | 'number' | 'text' | 'enum'

export function getSqlCellEditorKind(column?: SqlColumnRef): SqlCellEditorKind {
  const type = column?.dataType || ''
  if (column?.enumValues?.length) return 'enum'
  if (/^jsonb?\b/i.test(type)) return 'json'
  if (/^bool(?:ean)?\b/i.test(type) || /^bit(?:\(1\))?$/i.test(type.trim())) return 'boolean'
  if (/(?:timestamp|datetime)/i.test(type)) return 'datetime'
  if (/^date(?:\b|\()/i.test(type)) return 'date'
  if (/^time(?:\b|\()/i.test(type)) return 'time'
  if (numericType.test(type)) return 'number'
  return 'text'
}

function isValidSqlDate(value: string, kind: 'date' | 'time' | 'datetime'): boolean {
  if (kind === 'date') return dayjs(value, 'YYYY-MM-DD', true).isValid()
  const match =
    kind === 'time'
      ? value.match(/^(\d{2}:\d{2}:\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2})(?::?(\d{2}))?)?$/)
      : value.match(
          /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2})(?::?(\d{2}))?)?$/
        )
  if (!match) return false
  const offset = kind === 'time' ? 2 : 3
  if (Number(match[offset] || 0) > 15 || Number(match[offset + 1] || 0) > 59) return false
  return kind === 'time'
    ? dayjs(match[1], 'HH:mm:ss', true).isValid()
    : dayjs(`${match[1]} ${match[2]}`, 'YYYY-MM-DD HH:mm:ss', true).isValid()
}
export interface SqlEditSource {
  table?: SqlTableRef
  mapping: Record<string, string>
  keys: string[]
  reason: string
}
const numericType =
  /^(?:smallint|integer|int\d*|bigint|tinyint|mediumint|decimal|numeric|number|float\d*|double|real|dec|binary_float|binary_double)(?:\b|\()/i
const jsonType = /^jsonb?\b/i
const unsupportedType =
  /(?:\b(?:blob|clob|bytea|binary|varbinary|geometry|geography|xml|image|raw)\b|\[\])/i
const numberLiteral = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
export const isSqlDraftJson = (column?: SqlColumnRef): boolean =>
  Boolean(column && jsonType.test(column.dataType))
export const isSqlDraftNumber = (column?: SqlColumnRef): boolean =>
  Boolean(column && numericType.test(column.dataType))

export function containsUnsafeSqlNumber(value: unknown): boolean {
  if (typeof value === 'number')
    return !Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))
  if (Array.isArray(value)) return value.some(containsUnsafeSqlNumber)
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.values(value).some(containsUnsafeSqlNumber)
  )
}

const astName = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  const row = toObjectRecord(value)
  const expr = toObjectRecord(row.expr)
  return typeof expr.value === 'string' ? expr.value : undefined
}

/** Only direct columns of one base table can be turned back into UPDATE statements. */
export async function resolveSqlEditSource(input: {
  query: string
  columns: string[]
  metadata?: SqlMetadataRef | null
  dialect: SqlDialect
  defaultSchema?: string
}): Promise<SqlEditSource> {
  const blocked = (reason: string): SqlEditSource => ({ mapping: {}, keys: [], reason })
  if (!input.query.trim())
    return blocked('没有本次结果对应的原始 SQL，可继续编辑副本并导出变更 JSON。')
  try {
    const { default: sqlParser } =
      input.dialect === 'mysql'
        ? await import('node-sql-parser/build/mysql.js')
        : await import('node-sql-parser/build/postgresql.js')
    const parsed: unknown = new sqlParser.Parser().astify(input.query, {
      database: input.dialect === 'mysql' ? 'MySQL' : 'PostgreSQL'
    })
    if (Array.isArray(parsed) && parsed.length !== 1)
      return blocked('多语句结果不能生成更新 SQL，请单独执行一条单表 SELECT。')
    const ast = toObjectRecord(Array.isArray(parsed) ? parsed[0] : parsed)
    const from = Array.isArray(ast.from) ? ast.from : []
    if (
      ast.type !== 'select' ||
      from.length !== 1 ||
      ast.with ||
      ast.groupby ||
      ast.having ||
      ast.window ||
      ast._next ||
      ast.set_op ||
      toObjectRecord(ast.distinct).type
    )
      return blocked('联合查询、聚合、去重、CTE 或多表结果不能可靠定位原始行；可导出变更 JSON。')
    const relation = toObjectRecord(from[0])
    const tableName = astName(relation.table)
    const schema = astName(relation.db) || input.defaultSchema
    if (!schema) return blocked('未指定来源 schema，请使用 schema.表名 重新查询后生成更新 SQL。')
    if (!tableName || relation.expr || relation.join || relation.on)
      return blocked('请使用直接读取单张表的 SELECT 后再生成更新 SQL。')
    const candidates = (input.metadata?.tables || []).filter(
      (table) =>
        (table.tableName === tableName ||
          (input.dialect === 'dm' && table.tableName === tableName.toUpperCase())) &&
        (!schema ||
          table.tableSchema === schema ||
          (input.dialect === 'dm' && table.tableSchema === schema.toUpperCase()))
    )
    if (candidates.length !== 1)
      return blocked(
        '尚未加载或无法唯一确定来源表。请展开对应 schema 加载结构，并使用 schema.表名重新查询。'
      )
    const table = candidates[0]
    if (table.kind && table.kind !== 'table')
      return blocked('视图结果不生成更新 SQL，请查询其基础表。')
    const columns = Array.isArray(ast.columns) ? ast.columns : []
    const mapping: Record<string, string> = Object.create(null)
    for (const raw of columns) {
      const item = toObjectRecord(raw)
      const expr = toObjectRecord(item.expr)
      if (expr.type !== 'column_ref')
        return blocked('结果包含计算列或函数，请只查询来源表的直接字段后再生成更新 SQL。')
      const columnName = astName(expr.column)
      if (columnName === '*') {
        for (const name of input.columns) {
          const column = table.columns.find((column) => column.name === name)
          if (!column) return blocked('结果字段与当前表结构不一致，请刷新结构后重新查询。')
          mapping[name] = column.name
        }
      } else {
        const column = table.columns.find(
          (column) =>
            column.name === columnName ||
            (input.dialect === 'dm' && column.name === columnName?.toUpperCase())
        )
        const resultName = astName(item.as) || column?.name
        if (
          !column ||
          !resultName ||
          !input.columns.includes(resultName) ||
          Object.hasOwn(mapping, resultName)
        )
          return blocked('字段映射有歧义，请去掉重复或无法识别的列别名后重试。')
        mapping[resultName] = column.name
      }
    }
    if (
      input.columns.length !== Object.keys(mapping).length ||
      uniq(Object.values(mapping)).length !== Object.keys(mapping).length
    )
      return blocked('结果包含重复字段或多次映射同一列，请调整查询列后重试。')
    const primary = table.columns
      .filter((column) => column.isPrimaryKey)
      .map((column) => column.name)
    const keys = primary
      .map((name) => Object.keys(mapping).find((resultName) => mapping[resultName] === name))
      .filter((value): value is string => Boolean(value))
    const reason = !primary.length
      ? '来源表没有已知主键，可编辑副本及导出变更 JSON；更新 SQL 需要完整主键。'
      : keys.length !== primary.length
        ? '结果缺少完整主键。请将全部主键列加入 SELECT 后重新查询。'
        : ''
    return { table, mapping, keys, reason }
  } catch {
    return blocked('当前 SQL 无法可靠解析为单表直接查询，可继续编辑副本并导出变更 JSON。')
  }
}

export function sqlDraftColumn(source: SqlEditSource, field: string): SqlColumnRef | undefined {
  return source.table?.columns.find((column) => column.name === source.mapping[field])
}

export function prepareSqlDraftRows(
  rows: SqlDraftRow[],
  source: SqlEditSource,
  fallback?: (field: string) => SqlColumnRef | undefined
): SqlDraftRow[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([field, value]) => {
        const column = sqlDraftColumn(source, field) || fallback?.(field)
        return [
          field,
          value === null
            ? null
            : isSqlDraftJson(column)
              ? JSON.stringify(value)
              : isSqlDraftNumber(column)
                ? String(value)
                : value
        ]
      })
    )
  )
}

export function validateSqlDraftValue(value: unknown, column?: SqlColumnRef): string | undefined {
  if (value === null) return column?.isNullable === false ? '此字段不能为 NULL' : undefined
  if (value === undefined) return '字段值缺失，请输入有效值或明确设为 NULL'
  const kind = getSqlCellEditorKind(column)
  if (
    kind === 'boolean' &&
    ![true, false, 0, 1, 'true', 'false', 'TRUE', 'FALSE', '0', '1'].some(
      (allowed) => allowed === value
    )
  )
    return '请选择 TRUE 或 FALSE'
  if (kind === 'enum' && !column?.enumValues?.includes(String(value)))
    return '请选择此字段允许的枚举值'
  if (kind === 'date' || kind === 'time' || kind === 'datetime') {
    if (!isValidSqlDate(String(value), kind))
      return kind === 'time'
        ? '请输入有效时间，例如 12:30:00.123456'
        : kind === 'date'
          ? '请输入有效日期，格式为 YYYY-MM-DD'
          : '请输入有效日期时间，可保留小数秒和时区偏移'
    const precision = column?.dataType.match(/\((\d+)\)/)?.[1]
    const fraction = String(value).match(/\.(\d+)/)?.[1]
    if (precision && fraction && fraction.length > Number(precision))
      return `此字段的小数秒最多 ${precision} 位`
  }
  if (isSqlDraftNumber(column)) {
    if (!numberLiteral.test(String(value))) return '请输入有效数字，不能留空或填写非数值'
    if (
      /^(?:smallint|integer|int\d*|bigint|tinyint|mediumint)\b/i.test(column!.dataType) &&
      !/^[+-]?\d+$/.test(String(value))
    )
      return '此字段只接受整数'
  }
  if (isSqlDraftJson(column)) {
    try {
      JSON.parse(String(value))
    } catch {
      return 'JSON 格式不正确，请检查引号、逗号和括号'
    }
  }
  if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
  )
    return '数字超出安全精度，请重新查询并以文本形式返回该值'
  if (typeof value === 'string' && value.includes('\0')) return '文本不能包含空字符'
  return undefined
}

function textLiteral(value: string, dialect: SqlDialect): string {
  if (value.includes('\0')) throw new Error('文本包含空字符，无法生成 SQL')
  if (dialect === 'mysql') {
    if (!value) return "''"
    const hex = Array.from(new TextEncoder().encode(value), (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('')
    return `CONVERT(0x${hex} USING utf8mb4)`
  }
  if (dialect === 'postgres')
    return `E'${value.replaceAll('\\', '\\\\').replaceAll("'", "''").replaceAll('\r', '\\r').replaceAll('\n', '\\n').replaceAll('\t', '\\t')}'`
  // Keep backslashes out of quoted fragments, independently of DM compatibility settings.
  return value
    .split('\\')
    .map((part) => `'${part.replaceAll("'", "''")}'`)
    .join(' || CHR(92) || ')
}

function valueLiteral(value: unknown, column: SqlColumnRef, dialect: SqlDialect): string {
  const invalid = validateSqlDraftValue(value, column)
  if (invalid) throw new Error(`${column.name}：${invalid}`)
  if (value === null) return 'NULL'
  if (typeof value === 'object' && !isSqlDraftJson(column))
    throw new Error(`${column.name} 的结构化值无法可靠转换为更新 SQL，可导出变更 JSON`)
  if (unsupportedType.test(column.dataType))
    throw new Error(`${column.name} 是二进制、LOB、XML 或数组类型，请通过专用工具处理`)
  if (isSqlDraftNumber(column)) return String(value)
  if (typeof value === 'boolean')
    return dialect === 'dm' ? (value ? '1' : '0') : value ? 'TRUE' : 'FALSE'
  const literal = textLiteral(typeof value === 'string' ? value : JSON.stringify(value), dialect)
  if (isSqlDraftJson(column)) {
    if (dialect === 'dm') throw new Error('当前达梦 JSON 类型暂不支持生成更新 SQL，可导出变更 JSON')
    return `CAST(${literal} AS ${dialect === 'postgres' ? 'JSONB' : 'JSON'})`
  }
  return literal
}

/** Generate a reviewable, rollback-by-default script; this module never executes it. */
export function buildSqlDraftUpdate(
  source: SqlEditSource,
  records: TableEditRecordset<SqlDraftRow>,
  allRows: SqlDraftRow[],
  dialect: SqlDialect
): { sql: string; reason: string } {
  const blocked = (reason: string) => ({ sql: '', reason })
  if (source.reason || !source.table) return blocked(source.reason || '缺少来源表结构')
  if (!source.keys.length || !allRows.length)
    return blocked('缺少完整主键或结果副本尚未准备好，请重新查询。')
  if (records.insertRecords.length || records.removeRecords.length)
    return blocked('SQL 结果编辑仅导出已有行的字段修改，不生成插入或删除语句。')
  if (!records.changes.length) return blocked('还没有已修改字段。')
  const signatures = allRows.map((row) => source.keys.map((key) => row[key]))
  if (
    signatures.some((values) =>
      values.some((value) => value == null || typeof value === 'object')
    ) ||
    new Set(signatures.map((values) => JSON.stringify(values))).size !== signatures.length
  )
    return blocked('结果主键为空、重复或不可识别，请重新查询能唯一定位行的结果。')
  try {
    const quote = (name: string) => quoteSqlIdentifier(name, dialect)
    const table = source.table
    const relation = `${quote(table.tableSchema)}.${quote(table.tableName)}`
    const tenantField = Object.keys(source.mapping).find(
      (key) => source.mapping[key].toLowerCase() === 'tenant_id'
    )
    const statements = records.changes.map(({ row, original, fields }) => {
      if (fields.some((field) => source.keys.includes(field) || field === tenantField))
        throw new Error('主键与租户字段不可修改，请还原这些字段')
      const assignments = fields.map((field) => {
        const column = sqlDraftColumn(source, field)
        if (!column) throw new Error('变更字段不在来源表结构中，请重新查询')
        return `  ${quote(column.name)} = ${valueLiteral(row[field], column, dialect)}`
      })
      const conditions = uniq([
        ...source.keys,
        ...fields,
        ...(tenantField ? [tenantField] : [])
      ]).map((field) => {
        const column = sqlDraftColumn(source, field)!
        let lhs = quote(column.name)
        const rhs = valueLiteral(original[field], column, dialect)
        if (isSqlDraftJson(column) && dialect === 'postgres') lhs = `CAST(${lhs} AS JSONB)`
        if (dialect === 'postgres') return `${lhs} IS NOT DISTINCT FROM ${rhs}`
        if (dialect === 'mysql')
          return `${!isSqlDraftNumber(column) && !isSqlDraftJson(column) && typeof original[field] === 'string' ? `BINARY ${lhs} <=> BINARY ${rhs}` : `${lhs} <=> ${rhs}`}`
        return original[field] === null ? `${lhs} IS NULL` : `${lhs} = ${rhs}`
      })
      return `UPDATE ${relation}\nSET\n${assignments.join(',\n')}\nWHERE ${conditions.join('\n  AND ')};`
    })
    return {
      sql: `-- 本地编辑副本生成：${records.changes.length} 行变更。当前数据库尚未写入。\n-- WHERE 包含完整主键、已修改字段的原值，以及已返回的租户字段。\n-- 请逐条核对影响行数是否为 1；出现 0 行或多行时停止并回滚。\n-- 默认回滚；确认结果后再由有权限的操作者调整提交方式。\n${dialect === 'mysql' ? 'START TRANSACTION;' : dialect === 'dm' ? 'SET TRANSACTION READ WRITE;' : 'BEGIN;'}\n\n${statements.join('\n\n')}\n\nROLLBACK;\n`,
      reason: ''
    }
  } catch (error) {
    return blocked(
      error instanceof Error ? error.message : '无法生成更新 SQL，请检查字段类型与主键'
    )
  }
}
