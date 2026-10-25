import assert from 'node:assert/strict'
import test from 'node:test'
import { extractSqlAliases, getSqlCompletionContext } from '../../src/utils/sql-workbench'

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
