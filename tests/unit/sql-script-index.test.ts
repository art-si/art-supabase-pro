import assert from 'node:assert/strict'
import test from 'node:test'
import { createSqlScriptIndex } from '../../src/utils/sql-workbench'

test('indexed cursor targets preserve statement boundaries, comment gaps and trailing delimiters', () => {
  const sql = "-- heading;\n SELECT 'a;b';\n/* gap ; */ SELECT $$c;d$$;  -- tail;\n"
  const index = createSqlScriptIndex(sql)
  const first = sql.indexOf('SELECT')
  const second = sql.indexOf('SELECT $$')
  assert.equal(index.statements.length, 2)
  for (const offset of [0, first, sql.indexOf('a;b'), sql.indexOf("';") + 1, sql.indexOf("';") + 2])
    assert.deepEqual(index.getExecutionTarget(offset), {
      sql: "SELECT 'a;b';",
      startOffset: first,
      source: 'statement'
    })
  for (const offset of [sql.indexOf('/* gap'), second, sql.indexOf('c;d'), sql.length])
    assert.deepEqual(index.getExecutionTarget(offset), {
      sql: 'SELECT $$c;d$$;',
      startOffset: second,
      source: 'statement'
    })
  assert.equal(createSqlScriptIndex('SELECT 1; ; SELECT 2;').getExecutionTarget(10).sql, ';')
  assert.deepEqual(createSqlScriptIndex('-- comment only;').getExecutionTarget(5), {
    sql: '',
    startOffset: 0,
    source: 'statement'
  })
})

test('selection remains independent of whole-script lexical state and model revisions have separate indexes', () => {
  const sql = "SELECT 'embedded SELECT 2;'; SELECT 3;"
  const index = createSqlScriptIndex(sql)
  const start = sql.indexOf('SELECT 2')
  const end = start + 'SELECT 2;'.length
  assert.deepEqual(index.getExecutionTarget(0, { start, end }), {
    sql: 'SELECT 2;',
    startOffset: start,
    source: 'selection'
  })
  const changed = createSqlScriptIndex('SELECT 44;')
  assert.equal(changed.getExecutionTarget(0).sql, 'SELECT 44;')
  assert.equal(index.getExecutionTarget(sql.length).sql, 'SELECT 3;')
})

test('MySQL escapes and hash comments use the selected dialect without leaking a different index', () => {
  const sql = "# comment;\nSELECT `field;name`, 'a\\';b'; SELECT 2;"
  const mysql = createSqlScriptIndex(sql, 'mysql')
  const postgres = createSqlScriptIndex(sql, 'postgres')
  assert.equal(mysql.statements.length, 2)
  assert.equal(mysql.getExecutionTarget(sql.indexOf('name')).sql, "SELECT `field;name`, 'a\\';b';")
  assert.notDeepEqual(postgres.statements, mysql.statements)
})
