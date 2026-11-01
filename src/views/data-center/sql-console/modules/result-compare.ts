import { cloneDeep, isEqual, isPlainObject, truncate, uniq } from 'lodash-es'
import { getOwnRecordValue } from '@/utils/record'

export interface SqlResultCompareColumn {
  name: string
  property?: string
  type?: string | null
  fullType?: string | null
}
export interface SqlResultSnapshotInput {
  rows: readonly Record<string, unknown>[]
  columns: readonly SqlResultCompareColumn[]
  query?: string
  label?: string
  truncated?: boolean
}
export interface SqlResultSnapshot {
  rows: Record<string, unknown>[]
  columns: SqlResultCompareColumn[]
  capturedAt: string
  query: string
  label: string
  truncated: boolean
  estimatedBytes: number
}
export interface SqlResultCompareOptions {
  signal?: AbortSignal
  yieldControl?: () => Promise<void>
}
export interface SqlResultRowDifference {
  key: string
  identity: string
  baselineIndex?: number
  currentIndex?: number
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  changedFields: string[]
}
export interface SqlResultSchemaChange {
  name: string
  kind: 'added' | 'removed' | 'type-changed'
  beforeType: string | null
  afterType: string | null
}
export type SqlResultProvenance = Omit<SqlResultSnapshot, 'rows'> & { rowCount: number }
export interface SqlResultComparison {
  baseline: SqlResultProvenance
  current: SqlResultProvenance
  keyFields: string[]
  schemaChanges: SqlResultSchemaChange[]
  added: SqlResultRowDifference[]
  removed: SqlResultRowDifference[]
  modified: SqlResultRowDifference[]
  unchanged: SqlResultRowDifference[]
  addedCount: number
  removedCount: number
  modifiedCount: number
  unchangedCount: number
}
export class SqlResultCompareError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_COLUMNS'
      | 'SNAPSHOT_LIMIT'
      | 'UNSUPPORTED_VALUE'
      | 'INVALID_KEYS'
      | 'INVALID_KEY_VALUE'
      | 'DUPLICATE_KEY',
    message: string,
    public readonly side?: 'baseline' | 'current',
    public readonly rowNumber?: number,
    public readonly duplicateRowNumber?: number
  ) {
    super(message)
    this.name = 'SqlResultCompareError'
  }
}

const maxBytes = 8 * 1024 * 1024
const maxRows = 1000
const maxColumns = 4096
const maxNodes = 100_000
const maxDepth = 32
const hugeBigint = 10n ** 4096n
const columnProperty = (column: SqlResultCompareColumn) => column.property ?? column.name
const columnType = (column?: SqlResultCompareColumn) => column?.fullType ?? column?.type ?? null
const own = (row: Record<string, unknown>, property: string) => Object.hasOwn(row, property)

async function checkpoint(
  index: number,
  options: SqlResultCompareOptions,
  interval = 128
): Promise<void> {
  if (index % interval === 0) {
    options.signal?.throwIfAborted()
    if (options.yieldControl) await options.yieldControl()
    options.signal?.throwIfAborted()
  }
}

function validateColumns(columns: readonly SqlResultCompareColumn[]): void {
  if (
    !columns.length ||
    columns.length > maxColumns ||
    columns.some((column) => !column.name.trim() || !columnProperty(column).trim()) ||
    uniq(columns.map((column) => column.name)).length !== columns.length ||
    uniq(columns.map(columnProperty)).length !== columns.length
  )
    throw new SqlResultCompareError(
      'INVALID_COLUMNS',
      '结果字段为空、过多或存在重名，请使用 AS 指定唯一字段名（最多 4096 列）。'
    )
}

/** Validate only the declared authorized fields, preserving own-undefined versus missing. */
export async function createSqlResultSnapshot(
  input: SqlResultSnapshotInput,
  options: SqlResultCompareOptions = {}
): Promise<SqlResultSnapshot> {
  options.signal?.throwIfAborted()
  validateColumns(input.columns)
  if (input.rows.length > maxRows)
    throw new SqlResultCompareError(
      'SNAPSHOT_LIMIT',
      '结果快照最多保存 1000 行，请缩小查询范围后重试。'
    )
  let bytes = 0
  let nodes = 0
  const charge = (count: number) => {
    bytes += count
    if (bytes > maxBytes || nodes > maxNodes)
      throw new SqlResultCompareError(
        'SNAPSHOT_LIMIT',
        '结果快照超过 8 MiB 或 100000 个值，请缩小查询范围后重试。'
      )
  }
  const unsupported = () =>
    new SqlResultCompareError(
      'UNSUPPORTED_VALUE',
      '结果包含不支持的对象、循环引用、特殊属性或过深结构，无法建立可靠快照。'
    )
  const inspect = async (
    value: unknown,
    depth: number,
    ancestors: WeakSet<object>
  ): Promise<unknown> => {
    nodes++
    charge(32)
    await checkpoint(nodes, options, 1024)
    if (depth > maxDepth) throw unsupported()
    if (value == null || typeof value === 'boolean') return value
    if (typeof value === 'string') {
      charge(value.length * 2)
      return value
    }
    if (typeof value === 'number') return value
    if (typeof value === 'bigint') {
      if (value >= hugeBigint || value <= -hugeBigint) throw unsupported()
      charge(value.toString().length * 2)
      return value
    }
    if (typeof value !== 'object') throw unsupported()
    if (ancestors.has(value) || Object.getOwnPropertySymbols(value).length) throw unsupported()
    const array = Array.isArray(value)
    if (!array && !isPlainObject(value)) throw unsupported()
    if (array && value.length > maxNodes) throw unsupported()
    ancestors.add(value)
    const keys = Object.getOwnPropertyNames(value)
    if (array && keys.length !== value.length + 1) throw unsupported()
    const entries: Array<[string, unknown]> = []
    for (const key of keys) {
      if (array && key === 'length') continue
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw unsupported()
      if (array) {
        const index = Number(key)
        if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key)
          throw unsupported()
      }
      charge(key.length * 2)
      entries.push([key, await inspect(descriptor.value, depth + 1, ancestors)])
    }
    ancestors.delete(value)
    // Build from the same data descriptors we validated; proxy getters may expose Vue internals.
    return array ? entries.map(([, item]) => item) : Object.fromEntries(entries)
  }
  charge((input.query?.length ?? 0) * 2 + (input.label?.length ?? 0) * 2)
  const columns = input.columns.map(({ name, property, type, fullType }) => ({
    name,
    property,
    type,
    fullType
  }))
  for (const column of columns) await inspect(column, 0, new WeakSet())
  const rows: Record<string, unknown>[] = []
  for (let index = 0; index < input.rows.length; index++) {
    await checkpoint(index, options)
    const row = input.rows[index]
    if (Object.getOwnPropertySymbols(row).length || !isPlainObject(row)) throw unsupported()
    const entries: Array<[string, unknown]> = []
    for (const column of columns) {
      const property = columnProperty(column)
      const descriptor = Object.getOwnPropertyDescriptor(row, property)
      if (!descriptor) continue
      if (!('value' in descriptor)) throw unsupported()
      charge(property.length * 2)
      entries.push([property, await inspect(descriptor.value, 0, new WeakSet())])
    }
    rows.push(Object.fromEntries(entries))
  }
  options.signal?.throwIfAborted()
  return {
    rows,
    columns: cloneDeep(columns),
    capturedAt: new Date().toISOString(),
    query: input.query ?? '',
    label: input.label ?? '',
    truncated: Boolean(input.truncated),
    estimatedBytes: bytes
  }
}

function provenance(snapshot: SqlResultSnapshot): SqlResultProvenance {
  const { rows, ...metadata } = snapshot
  return { ...metadata, rowCount: rows.length }
}

function typedScalar(value: unknown): [string, string | number | boolean] | undefined {
  if (typeof value === 'string' || typeof value === 'boolean') return [typeof value, value]
  if (typeof value === 'bigint') return ['bigint', value.toString()]
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= Number.MAX_SAFE_INTEGER
  )
    return ['number', value]
  return undefined
}

/** Snapshots are immutable comparison inputs; row differences retain references, not copies. */
export async function compareSqlResults(
  baseline: SqlResultSnapshot,
  current: SqlResultSnapshot,
  keyFields: readonly string[],
  options: SqlResultCompareOptions = {}
): Promise<SqlResultComparison> {
  options.signal?.throwIfAborted()
  validateColumns(baseline.columns)
  validateColumns(current.columns)
  const beforeColumns = new Map(baseline.columns.map((column) => [column.name, column]))
  const afterColumns = new Map(current.columns.map((column) => [column.name, column]))
  if (
    !keyFields.length ||
    uniq(keyFields).length !== keyFields.length ||
    keyFields.some((name) => !beforeColumns.has(name) || !afterColumns.has(name))
  )
    throw new SqlResultCompareError(
      'INVALID_KEYS',
      '请选择两次结果共有且不重复的唯一键字段，不能按行序对比。'
    )
  const indexRows = async (snapshot: SqlResultSnapshot, side: 'baseline' | 'current') => {
    const columnMap = side === 'baseline' ? beforeColumns : afterColumns
    const indexed = new Map<
      string,
      { row: Record<string, unknown>; index: number; identity: string }
    >()
    for (let index = 0; index < snapshot.rows.length; index++) {
      await checkpoint(index, options)
      const row = snapshot.rows[index]
      const parts = keyFields.map((field) => {
        const property = columnProperty(columnMap.get(field)!)
        const value = getOwnRecordValue(row, property)
        const scalar = typedScalar(value)
        if (!scalar)
          throw new SqlResultCompareError(
            'INVALID_KEY_VALUE',
            `${side === 'baseline' ? '基线' : '当前'}第 ${index + 1} 行的唯一键为空、复杂值或不安全数值，请选择可靠的唯一键。`,
            side,
            index + 1
          )
        return scalar
      })
      const key = JSON.stringify(parts)
      const previous = indexed.get(key)
      if (previous)
        throw new SqlResultCompareError(
          'DUPLICATE_KEY',
          `${side === 'baseline' ? '基线' : '当前'}第 ${previous.index + 1}、${index + 1} 行的唯一键重复，请重新选择唯一键。`,
          side,
          index + 1,
          previous.index + 1
        )
      const identity = truncate(
        parts
          .map(([type, value], part) => `${keyFields[part]} (${type}) = ${JSON.stringify(value)}`)
          .join(' · '),
        { length: 240 }
      )
      indexed.set(key, { row, index, identity })
    }
    return indexed
  }
  const beforeRows = await indexRows(baseline, 'baseline')
  const afterRows = await indexRows(current, 'current')
  const fields = uniq([...beforeColumns.keys(), ...afterColumns.keys()])
  const schemaChanges: SqlResultSchemaChange[] = fields.flatMap((name) => {
    const before = beforeColumns.get(name),
      after = afterColumns.get(name)
    const kind = !before
      ? 'added'
      : !after
        ? 'removed'
        : columnType(before) !== columnType(after)
          ? 'type-changed'
          : undefined
    return kind
      ? [{ name, kind, beforeType: columnType(before), afterType: columnType(after) }]
      : []
  })
  const result: SqlResultComparison = {
    baseline: provenance(baseline),
    current: provenance(current),
    keyFields: [...keyFields],
    schemaChanges,
    added: [],
    removed: [],
    modified: [],
    unchanged: [],
    addedCount: 0,
    removedCount: 0,
    modifiedCount: 0,
    unchangedCount: 0
  }
  let compared = 0
  for (const [key, entry] of afterRows) {
    await checkpoint(compared++, options)
    const before = beforeRows.get(key)
    if (!before) {
      result.added.push({
        key,
        identity: entry.identity,
        currentIndex: entry.index,
        after: entry.row,
        changedFields: []
      })
      continue
    }
    const changedFields = fields.filter((field) => {
      const left = beforeColumns.get(field),
        right = afterColumns.get(field)
      const leftProperty = left && columnProperty(left),
        rightProperty = right && columnProperty(right)
      const leftPresent = leftProperty !== undefined && own(before.row, leftProperty)
      const rightPresent = rightProperty !== undefined && own(entry.row, rightProperty)
      return (
        leftPresent !== rightPresent ||
        (leftPresent &&
          rightPresent &&
          !isEqual(
            getOwnRecordValue(before.row, leftProperty!),
            getOwnRecordValue(entry.row, rightProperty!)
          ))
      )
    })
    const difference = {
      key,
      identity: entry.identity,
      baselineIndex: before.index,
      currentIndex: entry.index,
      before: before.row,
      after: entry.row,
      changedFields
    }
    if (changedFields.length) result.modified.push(difference)
    else result.unchanged.push(difference)
  }
  for (const [key, entry] of beforeRows)
    if (!afterRows.has(key))
      result.removed.push({
        key,
        identity: entry.identity,
        baselineIndex: entry.index,
        before: entry.row,
        changedFields: []
      })
  result.addedCount = result.added.length
  result.removedCount = result.removed.length
  result.modifiedCount = result.modified.length
  result.unchangedCount = result.unchanged.length
  options.signal?.throwIfAborted()
  return result
}

/** Every exported value is tagged, including object entries, so tags cannot collide with data. */
function exportValue(value: unknown): unknown {
  if (value === null) return { type: 'null' }
  if (value === undefined) return { type: 'undefined' }
  if (typeof value === 'bigint') return { type: 'bigint', value: value.toString() }
  if (typeof value === 'number')
    return { type: 'number', value: Object.is(value, -0) ? '-0' : String(value) }
  if (typeof value !== 'object') return { type: typeof value, value }
  if (Array.isArray(value))
    return {
      type: 'array',
      value: Array.from({ length: value.length }, (_, index) =>
        exportValue(getOwnRecordValue(value, String(index)))
      )
    }
  return {
    type: 'object',
    entries: Object.keys(value).map((key) => [key, exportValue(getOwnRecordValue(value, key))])
  }
}

export function formatComparisonValue(value: unknown, present = true): string {
  if (!present) return '（字段缺失）'
  if (value === undefined) return 'undefined'
  if (value === null) return 'NULL'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value !== 'object') return String(value)
  return JSON.stringify(exportValue(value), null, 2)
}

export function exportSqlResultComparison(result: SqlResultComparison): string {
  const encodeRows = (rows: SqlResultRowDifference[]) =>
    rows.map((row) => {
      const before = getOwnRecordValue(row, 'before')
      const after = getOwnRecordValue(row, 'after')
      return {
        key: row.key,
        identity: row.identity,
        baselineIndex: row.baselineIndex,
        currentIndex: row.currentIndex,
        changedFields: row.changedFields,
        ...(before ? { before: exportValue(before) } : {}),
        ...(after ? { after: exportValue(after) } : {})
      }
    })
  return JSON.stringify(
    {
      format: 'sql-result-comparison',
      version: 1,
      scope: 'loaded-authorized-results',
      baseline: result.baseline,
      current: result.current,
      keyFields: result.keyFields,
      schemaChanges: result.schemaChanges,
      addedCount: result.addedCount,
      removedCount: result.removedCount,
      modifiedCount: result.modifiedCount,
      unchangedCount: result.unchangedCount,
      added: encodeRows(result.added),
      removed: encodeRows(result.removed),
      modified: encodeRows(result.modified)
    },
    null,
    2
  )
}

/** Export a validated, authorized snapshot with the same value encoding as comparisons. */
export function exportSqlResultSnapshot(snapshot: SqlResultSnapshot): string {
  return JSON.stringify(
    {
      format: 'sql-result-snapshot',
      version: 1,
      scope: 'loaded-authorized-results',
      capturedAt: snapshot.capturedAt,
      label: snapshot.label,
      query: snapshot.query,
      truncated: snapshot.truncated,
      rowCount: snapshot.rows.length,
      columns: snapshot.columns,
      estimatedBytes: snapshot.estimatedBytes,
      rows: snapshot.rows.map(exportValue)
    },
    null,
    2
  )
}
