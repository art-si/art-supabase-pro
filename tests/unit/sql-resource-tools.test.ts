import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildColumnQuery,
  buildForeignKeyQueries,
  buildStructureMarkdown,
  buildTableNullQuery,
  supportsSqlDistribution
} from '../../src/views/data-center/sql-console/modules/resource-sql'
import { prepareReadOnlyQuery, querySqlConnection } from '../../scripts/sql-gateway-driver'
import { validateSqlConnection } from '../../src/utils/sql-connections'
import type { SqlTableRef, SqlForeignKeyRef } from '../../src/utils/sql-workbench'

const table: SqlTableRef = {
  tableSchema: 'sales',
  tableName: 'orders',
  columns: [
    { name: 'id', dataType: 'integer', isNullable: false, isPrimaryKey: true },
    { name: 'status', dataType: 'varchar', isNullable: true },
    { name: 'payload', dataType: 'json', isNullable: true }
  ]
}

for (const dialect of ['postgres', 'mysql', 'dm'] as const) {
  test(`${dialect}: generated statistics quote identifiers and remain read-only`, () => {
    for (const kind of [
      'select-column',
      'column-nulls',
      'column-distinct',
      'column-frequency',
      'column-range'
    ] as const) {
      const query = buildColumnQuery(table, table.columns[0], kind, dialect)
      assert.ok(query.includes(dialect === 'mysql' ? '`sales`' : '"sales"'))
      assert.doesNotThrow(() => prepareReadOnlyQuery(query, dialect))
    }
    assert.doesNotThrow(() => prepareReadOnlyQuery(buildTableNullQuery(table, dialect), dialect))
  })
}
test('JSON and LOB distribution queries are unavailable instead of generating unsupported comparisons', () => {
  assert.equal(supportsSqlDistribution(table.columns[2]), false)
  assert.equal(buildColumnQuery(table, table.columns[2], 'column-frequency', 'postgres'), '')
  assert.equal(supportsSqlDistribution({ name: 'x', dataType: 'CLOB', isNullable: true }), false)
})
test('foreign-key templates preserve composite constraints and cross-schema references', () => {
  const key: SqlForeignKeyRef = {
    sourceSchema: 'sales',
    sourceTable: 'orders',
    sourceColumn: 'customer_id',
    targetSchema: 'crm',
    targetTable: 'customers',
    targetColumn: 'id',
    constraintName: 'customer_fk'
  }
  const sql = buildForeignKeyQueries(
    [key, { ...key, sourceColumn: 'tenant_id', targetColumn: 'tenant_id' }],
    'dm'
  )
  assert.equal(sql.match(/LEFT JOIN/g)?.length, 1)
  assert.match(sql, /"crm"\."customers"/)
  assert.match(sql, /src\."customer_id" = rel\."id"\n {2}AND src\."tenant_id" = rel\."tenant_id"/)
  assert.doesNotThrow(() => prepareReadOnlyQuery(sql, 'dm'))
})
test('structure Markdown keeps nullable, primary-key and default metadata and escapes table delimiters', () => {
  const markdown = buildStructureMarkdown({
    ...table,
    columns: [
      {
        name: 'a|b',
        dataType: 'text',
        isNullable: false,
        isPrimaryKey: true,
        defaultValue: "'ready'",
        description: '第一行\n第二行'
      }
    ]
  })
  assert.match(markdown, /a\\\|b/)
  assert.match(markdown, /是 \| 否 \| 'ready' \| 第一行 第二行/)
})
test('DM8 validation accepts the account default schema and preserves unquoted identifier case', async () => {
  const connection = validateSqlConnection({
    name: 'DM8',
    dialect: 'dm',
    host: '127.0.0.1',
    port: 5236,
    database: '',
    username: 'reader',
    password: 'synthetic',
    tls: false,
    enabled: true,
    tenantId: 'test',
    allowedUserIds: []
  })
  assert.equal(connection.database, '')
  assert.equal(
    prepareReadOnlyQuery('select * from MixedCase; -- trailing comment', 'dm'),
    'select * from MixedCase'
  )
  assert.throws(() => prepareReadOnlyQuery('DELETE FROM MixedCase', 'dm'))
  await assert.rejects(
    querySqlConnection({ ...connection, id: 'test', updatedAt: '' }, 'synthetic', {
      query: 'SELECT 1 FROM DUAL',
      maxRows: 1,
      timeoutMs: 1000,
      action: 'explain'
    }),
    /执行计划/
  )
})
