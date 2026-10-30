import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSqlTableTemplates,
  extractSqlAliases,
  flattenSqlPlan,
  getSqlCompletionContext,
  getSqlExecutionTarget,
  getSqlStatements,
  filterSqlWorkbenchMetadata,
  isSqlSystemSchema,
  quoteSqlIdentifier
} from '../../src/utils/sql-workbench'

test('SQL completion recognizes table, schema, column and alias prefixes', () => {
  assert.deepEqual(getSqlCompletionContext('SELECT * FROM pub', 17), {
    statement: 'SELECT * FROM pub',
    kind: 'table',
    qualifier: undefined,
    isJoin: false
  })
  assert.equal(getSqlCompletionContext('SELECT * FROM public.us', 23).qualifier, 'public')
  assert.deepEqual(getSqlCompletionContext('SELECT u.na FROM public.users u', 11), {
    statement: 'SELECT u.na FROM public.users u',
    kind: 'qualified',
    qualifier: 'u'
  })
  assert.equal(getSqlCompletionContext('SELECT * FROM users u WHERE na', 30).kind, 'column')
  assert.equal(getSqlCompletionContext('SELECT * FROM users u JOIN ', 27).isJoin, true)
})

test('SQL metadata hides PostgreSQL internal namespaces across every metadata collection', () => {
  const schemas = [
    'public',
    'app_private',
    'auth',
    'pg_temp_0',
    'pg_temp_11',
    'pg_toast_temp_11',
    'pg_catalog',
    'information_schema',
    'pg_toast'
  ]
  const metadata = {
    schemas,
    tables: schemas.map((tableSchema) => ({ tableSchema, tableName: 'sample', columns: [] })),
    columns: schemas.map((tableSchema) => ({
      tableSchema,
      tableName: 'sample',
      columnName: 'id',
      dataType: 'uuid',
      isNullable: 'NO',
      ordinalPosition: 1
    })),
    functions: schemas.map((routineSchema) => ({
      routineSchema,
      routineName: 'sample',
      returnType: 'void'
    })),
    foreignKeys: [
      {
        sourceSchema: 'public',
        sourceTable: 'orders',
        sourceColumn: 'user_id',
        targetSchema: 'auth',
        targetTable: 'users',
        targetColumn: 'id',
        constraintName: 'orders_user'
      },
      {
        sourceSchema: 'pg_temp_11',
        sourceTable: 'temp_orders',
        sourceColumn: 'user_id',
        targetSchema: 'public',
        targetTable: 'users',
        targetColumn: 'id',
        constraintName: 'temp_user'
      },
      {
        sourceSchema: 'public',
        sourceTable: 'orders',
        sourceColumn: 'user_id',
        targetSchema: 'pg_toast_temp_11',
        targetTable: 'temp_users',
        targetColumn: 'id',
        constraintName: 'temp_target'
      }
    ]
  }
  const filtered = filterSqlWorkbenchMetadata(metadata)
  assert.deepEqual(filtered.schemas, ['public', 'app_private', 'auth'])
  assert.equal(filtered.tables.length, 3)
  assert.equal(filtered.columns.length, 3)
  assert.equal(filtered.functions.length, 3)
  assert.deepEqual(
    filtered.foreignKeys.map((key) => key.constraintName),
    ['orders_user']
  )
  assert.equal(metadata.schemas.length, 9)
  assert.equal(isSqlSystemSchema('pg_temp_archive'), false)
  assert.equal(isSqlSystemSchema('business_temp_11'), false)
})

test('metadata filtering retains table details and column annotations', () => {
  const table = {
    tableSchema: 'public',
    tableName: 'orders',
    kind: 'table' as const,
    description: '订单',
    indexes: [{ name: 'orders_pkey', columns: ['id'], isUnique: true, isPrimary: true }],
    columns: [{ name: 'id', dataType: 'uuid', isNullable: false, isPrimaryKey: true }]
  }
  const metadata = {
    schemas: ['public', 'pg_temp_11'],
    tables: [table, { ...table, tableSchema: 'pg_temp_11' }],
    columns: [
      {
        tableSchema: 'public',
        tableName: 'orders',
        columnName: 'id',
        dataType: 'uuid',
        isNullable: 'NO',
        ordinalPosition: 1,
        description: '编号',
        isPrimaryKey: true,
        defaultValue: 'gen_random_uuid()'
      }
    ],
    functions: []
  }
  const filtered = filterSqlWorkbenchMetadata(metadata)
  assert.equal(filtered.tables.length, 1)
  assert.equal(filtered.tables[0].description, '订单')
  assert.equal(filtered.tables[0].indexes?.[0].name, 'orders_pkey')
  assert.equal(filtered.columns[0].defaultValue, 'gen_random_uuid()')
})

test('table templates quote PostgreSQL identifiers and handle composite keys', () => {
  const templates = buildSqlTableTemplates({
    tableSchema: 'odd"schema',
    tableName: 'Order Items',
    columns: [
      { name: 'tenant id', dataType: 'uuid', isNullable: false, isPrimaryKey: true },
      { name: 'Order"No', dataType: 'text', isNullable: false, isPrimaryKey: true }
    ]
  })
  assert.equal(quoteSqlIdentifier('Order"No'), '"Order""No"')
  assert.match(templates[0].sql, /FROM "odd""schema"\."Order Items"\nLIMIT 100;/)
  assert.match(templates[0].sql, /"tenant id",\n {2}"Order""No"/)
  assert.match(templates[1].sql, /COUNT\(\*\)/)
  assert.match(
    templates[2].sql,
    /WHERE "tenant id" = NULL \/\* 输入主键值 \*\/\n {2}AND "Order""No" = NULL/
  )
  assert.equal(
    buildSqlTableTemplates({ tableSchema: 'public', tableName: 'view', columns: [] }).length,
    2
  )
})

test('PostgreSQL JSON plan flattens nested operations and ignores malformed entries', () => {
  const steps = flattenSqlPlan([
    {
      Plan: {
        'Node Type': 'Nested Loop',
        'Total Cost': 12.5,
        'Plan Rows': 4,
        Plans: [
          { 'Node Type': 'Index Scan', 'Relation Name': 'orders', 'Index Name': 'orders_pkey' },
          { 'Node Type': 'Seq Scan', 'Relation Name': 'customers', Filter: 'active' }
        ]
      }
    },
    null
  ])
  assert.deepEqual(
    steps.map(({ id, depth, nodeType }) => ({ id, depth, nodeType })),
    [
      { id: '0', depth: 0, nodeType: 'Nested Loop' },
      { id: '0.0', depth: 1, nodeType: 'Index Scan' },
      { id: '0.1', depth: 1, nodeType: 'Seq Scan' }
    ]
  )
  assert.equal(steps[0].totalCost, 12.5)
  assert.equal(steps[1].indexName, 'orders_pkey')
  assert.equal(steps[2].filter, 'active')
  assert.deepEqual(flattenSqlPlan({ Plan: {} }), [])
})

test('SQL completion stays within the active statement and ignores literals and comments', () => {
  const sql = "SELECT 'a;b' FROM old_table o; SELECT n. FROM new_table n"
  const context = getSqlCompletionContext(sql, sql.indexOf('n.') + 2)
  assert.equal(context.statement.trim(), 'SELECT n. FROM new_table n')
  assert.equal(context.qualifier, 'n')
  assert.equal(getSqlCompletionContext("SELECT 'FROM users'", 16).kind, 'none')
  assert.equal(getSqlCompletionContext('SELECT 1 -- FROM users', 22).kind, 'none')
})

test('SQL clause words are not treated as table aliases', () => {
  assert.deepEqual(extractSqlAliases('SELECT * FROM users WHERE id = 1'), [
    { alias: 'users', tableSchema: 'public', tableName: 'users' }
  ])
  assert.deepEqual(
    extractSqlAliases('SELECT * FROM public.users AS u JOIN orders o ON o.id = u.id'),
    [
      { alias: 'u', tableSchema: 'public', tableName: 'users' },
      { alias: 'o', tableSchema: 'public', tableName: 'orders' }
    ]
  )
})

test('current SQL statement preserves PostgreSQL literal and nested-comment boundaries', () => {
  const sql = 'SELECT $$a;b$$;\n/* outer /* ; */ comment */ SELECT $tag$c;d$tag$;\nSELECT 3;'
  const target = getSqlExecutionTarget(sql, sql.indexOf('$tag$') + 6)
  assert.equal(target.sql, 'SELECT $tag$c;d$tag$;')
  assert.equal(target.startOffset, sql.indexOf('SELECT $tag$'))
  assert.equal(getSqlExecutionTarget(sql, sql.length).sql, 'SELECT 3;')
  assert.equal(getSqlExecutionTarget(sql, 0).sql, 'SELECT $$a;b$$;')
  assert.equal(getSqlCompletionContext('SELECT $$FROM x;$$', 14).kind, 'none')
})

test('SQL statement navigation shares execution boundaries and skips empty or comment-only sections', () => {
  const sql =
    "-- title;\nSELECT 'a;b';\n/* nested /* ; */ note */ SELECT $$x;y$$;\n; -- trailing\nSELECT 3;"
  const statements = getSqlStatements(sql)
  assert.deepEqual(
    statements.map((statement) => [statement.command, statement.lineNumber]),
    [
      ['SELECT', 2],
      ['SELECT', 3],
      ['SELECT', 5]
    ]
  )
  for (const statement of statements) {
    assert.equal(getSqlExecutionTarget(sql, statement.startOffset).sql, statement.sql)
    assert.equal(sql.slice(statement.startOffset, statement.endOffset).trimEnd(), statement.sql)
  }
  assert.deepEqual(getSqlStatements('-- comments only;\n/* ; */'), [])
})

test('execution prefers the explicit selection and maps its origin after whitespace/comments', () => {
  const sql = 'SELECT 1;\n-- detail\n  SELECT missing;\nSELECT 3;'
  const start = sql.indexOf('-- detail')
  const end = sql.indexOf('\nSELECT 3;')
  assert.deepEqual(getSqlExecutionTarget(sql, 0, { start, end }), {
    sql: 'SELECT missing;',
    startOffset: sql.indexOf('SELECT missing'),
    source: 'selection'
  })
  assert.equal(getSqlExecutionTarget('-- comment only', 5).sql, '')
  const escaped = "SELECT E'a\\';b'; SELECT 2;"
  assert.equal(getSqlExecutionTarget(escaped, 4).sql, "SELECT E'a\\';b';")
  assert.equal(getSqlExecutionTarget('SELECT 1;   ', 12).sql, 'SELECT 1;')
})
