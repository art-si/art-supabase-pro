import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveSqlEditSource,
  prepareSqlDraftRows,
  buildSqlDraftUpdate,
  validateSqlDraftValue,
  containsUnsafeSqlNumber
} from '../../src/views/data-center/sql-console/modules/result-edit'
import { getSqlCellEditorKind } from '../../src/views/data-center/sql-console/modules/result-edit'
import {
  formatSqlJsonText,
  sqlJsonTokens
} from '../../src/views/data-center/sql-console/modules/sql-json-text'
import { TableEditModel } from '../../src/utils/table/edit-model'
import { getSqlStatements, type SqlMetadataRef } from '../../src/utils/sql-workbench'

const table = {
  tableSchema: 'public',
  tableName: 'orders',
  kind: 'table' as const,
  columns: [
    { name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true },
    { name: 'tenant_id', dataType: 'text', isNullable: false },
    { name: 'amount', dataType: 'numeric', isNullable: true },
    { name: 'status', dataType: 'text', isNullable: true },
    { name: 'payload', dataType: 'jsonb', isNullable: true }
  ]
}
const metadata: SqlMetadataRef = {
  schemas: ['public'],
  tables: [table],
  columns: [],
  functions: []
}
const columns = table.columns.map((column) => column.name)
const input = {
  query: 'SELECT * FROM public.orders',
  columns,
  metadata,
  dialect: 'postgres' as const,
  defaultSchema: 'public'
}

test('typed date/time validation preserves original precision and rejects invalid calendar values', () => {
  const column = (dataType: string) => ({ name: 'value', dataType, isNullable: true })
  for (const value of [
    '2026-10-02T12:39:32.66889+00:00',
    '2026-10-15 09:15:23.123456789',
    '2026-10-15T09:15:23Z'
  ])
    assert.equal(validateSqlDraftValue(value, column('timestamp with time zone')), undefined)
  for (const value of ['2026-02-30 12:30:00', '2026-10-15 25:15:23', '2026-10-15 09:15:23+08:99'])
    assert.ok(validateSqlDraftValue(value, column('timestamp with time zone')))
  assert.equal(validateSqlDraftValue('12:39:32.123456', column('time(6)')), undefined)
  assert.ok(validateSqlDraftValue('12:39:32.1234', column('time(3)')))
  assert.ok(validateSqlDraftValue('not-a-date', column('date')))
  assert.equal(getSqlCellEditorKind(column('boolean')), 'boolean')
  assert.equal(getSqlCellEditorKind(column('bit(8)')), 'text')
  assert.equal(
    validateSqlDraftValue('wrong', { ...column('text'), enumValues: ['draft', 'ready'] }),
    '请选择此字段允许的枚举值'
  )
})

test('JSON formatting preserves number tokens without introducing a numeric conversion', () => {
  const input = '{"big":12345678901234567890,"decimal":0.1234567890123456789,"string":"1  2"}'
  const output = formatSqlJsonText(input)
  assert.match(output, /12345678901234567890/)
  assert.match(output, /0\.1234567890123456789/)
  assert.equal(sqlJsonTokens(output), sqlJsonTokens(input))
  assert.notEqual(sqlJsonTokens('{"string":"1 2"}'), sqlJsonTokens('{"string":"1  2"}'))
})

test('only direct single-table columns map back to their real fields, including explicit aliases', async () => {
  const source = await resolveSqlEditSource(input)
  assert.equal(source.reason, '')
  assert.deepEqual(source.keys, ['id'])
  const aliased = await resolveSqlEditSource({
    ...input,
    query: 'SELECT o.id AS order_id, o.status FROM public.orders o',
    columns: ['order_id', 'status']
  })
  assert.equal(aliased.reason, '')
  assert.deepEqual(aliased.keys, ['order_id'])
  assert.equal(aliased.mapping.order_id, 'id')
})

test('joins, aggregates, views, CTE, expressions, duplicate source fields and missing keys fail closed', async () => {
  for (const query of [
    'SELECT o.* FROM public.orders o JOIN public.orders x ON o.id=x.id',
    'SELECT COUNT(*) AS total FROM public.orders',
    'SELECT DISTINCT * FROM public.orders',
    'WITH x AS (SELECT * FROM public.orders) SELECT * FROM x',
    'SELECT id + 1 AS id FROM public.orders',
    'SELECT * FROM public.orders UNION ALL SELECT * FROM public.orders',
    'SELECT * FROM public.orders; SELECT * FROM public.orders'
  ])
    assert.ok((await resolveSqlEditSource({ ...input, query })).reason, query)
  assert.ok(
    (
      await resolveSqlEditSource({
        ...input,
        query: 'SELECT status FROM public.orders',
        columns: ['status']
      })
    ).reason
  )
  assert.ok(
    (
      await resolveSqlEditSource({
        ...input,
        query: 'SELECT id AS a, id AS b FROM public.orders',
        columns: ['a', 'b']
      })
    ).reason
  )
  assert.ok(
    (
      await resolveSqlEditSource({
        ...input,
        metadata: { ...metadata, tables: [{ ...table, kind: 'view' }] }
      })
    ).reason
  )
  assert.ok(
    (await resolveSqlEditSource({ ...input, query: 'SELECT * FROM orders', defaultSchema: '' }))
      .reason
  )
})

test('UPDATE scripts preserve numeric precision, escape untrusted text and guard primary key, tenant and original values', async () => {
  const source = await resolveSqlEditSource(input)
  const rows = prepareSqlDraftRows(
    [
      {
        id: 1,
        tenant_id: 't1',
        amount: '12345678901234567890.1200',
        status: 'old',
        payload: { a: 1 }
      }
    ],
    source
  )
  const model = new TableEditModel(rows)
  model.setCellValue(model.rows[0], 'status', "new'\\; DROP TABLE orders;--")
  model.setCellValue(model.rows[0], 'amount', '12345678901234567890.1300')
  const result = buildSqlDraftUpdate(source, model.getRecordset(), model.rows, 'postgres')
  assert.equal(result.reason, '')
  assert.match(result.sql, /12345678901234567890\.1300/)
  assert.match(result.sql, /"id" IS NOT DISTINCT FROM 1/)
  assert.match(result.sql, /"tenant_id" IS NOT DISTINCT FROM E't1'/)
  assert.match(result.sql, /"status" IS NOT DISTINCT FROM E'old'/)
  assert.match(result.sql, /new''\\\\; DROP TABLE orders;--/)
  assert.match(result.sql, /ROLLBACK;\n$/)
  assert.doesNotMatch(result.sql, /COMMIT;/)
  assert.deepEqual(
    getSqlStatements(result.sql).map((statement) => statement.command),
    ['BEGIN', 'UPDATE', 'ROLLBACK']
  )
})

test('NULL is distinct from empty text, JSON is validated and unsafe numbers are rejected', () => {
  const text = table.columns[3]
  assert.equal(validateSqlDraftValue('', text), undefined)
  assert.equal(validateSqlDraftValue(null, text), undefined)
  assert.ok(validateSqlDraftValue(null, table.columns[0]))
  assert.ok(validateSqlDraftValue('1; DELETE FROM t', table.columns[2]))
  assert.ok(validateSqlDraftValue('1.2', table.columns[0]))
  assert.ok(validateSqlDraftValue('{bad}', table.columns[4]))
  assert.equal(validateSqlDraftValue('{"a":1}', table.columns[4]), undefined)
  assert.ok(validateSqlDraftValue(Number.MAX_SAFE_INTEGER + 1, text))
  assert.equal(
    containsUnsafeSqlNumber({ payload: { values: [Number.MAX_SAFE_INTEGER + 1] } }),
    true
  )
  assert.equal(containsUnsafeSqlNumber({ payload: { values: ['12345678901234567890.1'] } }), false)
})

test('duplicate/null primary keys and primary-key or tenant modifications cannot be exported', async () => {
  const source = await resolveSqlEditSource(input)
  const model = new TableEditModel([
    { id: 1, tenant_id: 'a', amount: '1', status: '', payload: null }
  ])
  const row = model.rows[0]
  model.setCellValue(row, 'status', 'ok')
  assert.ok(buildSqlDraftUpdate(source, model.getRecordset(), [row, row], 'postgres').reason)
  assert.ok(
    buildSqlDraftUpdate(source, model.getRecordset(), [{ ...row, id: null }], 'postgres').reason
  )
  model.setCellValue(row, 'id', 2)
  assert.match(buildSqlDraftUpdate(source, model.getRecordset(), [row], 'postgres').reason, /主键/)
  model.revertData(row, 'id')
  model.setCellValue(row, 'tenant_id', 'b')
  assert.match(buildSqlDraftUpdate(source, model.getRecordset(), [row], 'postgres').reason, /租户/)
})

test('MySQL uses mode-independent hexadecimal text and DM keeps its real case and backslashes', async () => {
  for (const dialect of ['mysql', 'dm'] as const) {
    const source = await resolveSqlEditSource({ ...input, dialect })
    assert.equal(source.reason, '')
    const model = new TableEditModel([{ id: 1, tenant_id: 't1', status: 'old' }])
    model.setCellValue(model.rows[0], 'status', "中文'\\new")
    const result = buildSqlDraftUpdate(source, model.getRecordset(), model.rows, dialect)
    assert.equal(result.reason, '')
    assert.match(
      result.sql,
      dialect === 'mysql' ? /CONVERT\(0x[\da-f]+ USING utf8mb4\)/ : /CHR\(92\)/
    )
    assert.match(result.sql, dialect === 'mysql' ? /`public`\.`orders`/ : /"public"\."orders"/)
  }
})
