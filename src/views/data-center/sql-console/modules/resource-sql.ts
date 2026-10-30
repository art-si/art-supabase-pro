import {
  quoteSqlIdentifier,
  type SqlColumnRef,
  type SqlTableRef,
  type SqlForeignKeyRef
} from '@/utils/sql-workbench'
import type { SqlDialect } from '@/types/sql-connections'
import { uniqBy } from 'lodash-es'

export type ColumnQueryKind =
  'select-column' | 'column-nulls' | 'column-distinct' | 'column-frequency' | 'column-range'
export const supportsSqlDistribution = (column: SqlColumnRef) =>
  !/json|clob|blob|xml|\[\]|array|bytea/i.test(column.dataType)
export const isSqlNumericColumn = (column: SqlColumnRef) =>
  /^(?:tinyint|smallint|mediumint|bigint|integer|int\b|int[248]|numeric|decimal|number|real|float|double|money)/i.test(
    column.dataType
  )

export function buildColumnQuery(
  table: SqlTableRef,
  column: SqlColumnRef,
  kind: ColumnQueryKind,
  dialect: SqlDialect
): string {
  const q = (value: string) => quoteSqlIdentifier(value, dialect)
  const from = `${q(table.tableSchema)}.${q(table.tableName)}`
  const field = q(column.name)
  if (kind === 'column-nulls')
    return `SELECT\n  COUNT(*) AS total_count,\n  COUNT(${field}) AS non_null_count,\n  COUNT(*) - COUNT(${field}) AS null_count\nFROM ${from};`
  if (kind === 'column-range' && isSqlNumericColumn(column))
    return `SELECT\n  MIN(${field}) AS min_value,\n  MAX(${field}) AS max_value,\n  AVG(${field}) AS avg_value\nFROM ${from};`
  if (
    (kind === 'column-distinct' || kind === 'column-frequency') &&
    !supportsSqlDistribution(column)
  )
    return ''
  if (kind === 'column-frequency')
    return `SELECT ${field}, COUNT(*) AS frequency\nFROM ${from}\nGROUP BY ${field}\nORDER BY frequency DESC\nLIMIT 100;`
  return `SELECT ${kind === 'column-distinct' ? 'DISTINCT ' : ''}${field}\nFROM ${from}\nLIMIT 100;`
}

export function buildTableNullQuery(table: SqlTableRef, dialect: SqlDialect): string {
  const q = (value: string) => quoteSqlIdentifier(value, dialect)
  return `SELECT\n  COUNT(*) AS total_count${table.columns.map((column, index) => `,\n  COUNT(*) - COUNT(${q(column.name)}) AS ${q(`nulls_${index + 1}_${column.name.slice(0, 32)}`)}`).join('')}\nFROM ${q(table.tableSchema)}.${q(table.tableName)};`
}

/** Match every column of a real constraint, including composite and cross-schema keys. */
export function buildForeignKeyQueries(keys: SqlForeignKeyRef[], dialect: SqlDialect): string {
  const q = (value: string) => quoteSqlIdentifier(value, dialect)
  const constraints = uniqBy(keys, (key) =>
    JSON.stringify([key.sourceSchema, key.sourceTable, key.constraintName])
  )
  return constraints
    .slice(0, 8)
    .map((key) => {
      const parts = keys.filter(
        (part) =>
          part.sourceSchema === key.sourceSchema &&
          part.sourceTable === key.sourceTable &&
          part.constraintName === key.constraintName
      )
      const fields = parts.map(
        (part, index) => `rel.${q(part.targetColumn)} AS ${q(`related_key_${index + 1}`)}`
      )
      return `SELECT src.*,\n  ${fields.join(',\n  ')}\nFROM ${q(key.sourceSchema)}.${q(key.sourceTable)} src\nLEFT JOIN ${q(key.targetSchema)}.${q(key.targetTable)} rel\n  ON ${parts.map((part) => `src.${q(part.sourceColumn)} = rel.${q(part.targetColumn)}`).join('\n  AND ')}\nLIMIT 100;`
    })
    .join('\n\n')
}

export function buildStructureMarkdown(table: SqlTableRef): string {
  const cell = (value: string) => value.replaceAll('|', '\\|').replace(/[\r\n]/g, ' ')
  return [
    `## ${cell(table.tableSchema)}.${cell(table.tableName)}`,
    cell(table.description || ''),
    '| 字段 | 类型 | 主键 | 可空 | 默认值 | 说明 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...table.columns.map(
      (column) =>
        `| ${[column.name, column.dataType, column.isPrimaryKey ? '是' : '', column.isNullable ? '是' : '否', column.defaultValue || '', column.description || ''].map(cell).join(' | ')} |`
    )
  ].join('\n')
}
