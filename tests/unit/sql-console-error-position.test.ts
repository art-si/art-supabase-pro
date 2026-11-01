import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mapSqlErrorPosition,
  type SqlErrorSource
} from '../../supabase/functions/execute-sql-with-columns/error-position'
import { prepareSqlInput } from '../../supabase/functions/execute-sql-with-columns/sql-input'

function source(rawQuery: string, prefix = '', suffix = ''): SqlErrorSource {
  const queryText = prepareSqlInput(rawQuery).query
  return { rawQuery, queryText, prefix, suffix, executedQuery: prefix + queryText + suffix }
}

test('maps character positions through leading trim, Unicode, CRLF and trailing delimiter removal', () => {
  const rawQuery = " \t\r\n/* 中文😀 */\r\nSELECT '😀' AS 文本,\r\n missing_value ; -- 尾注\r\n"
  const input = source(rawQuery, 'SELECT * FROM (', '\n) AS result LIMIT 201')
  const before = input.queryText.split('missing_value')[0]
  const position = Array.from(input.prefix + before).length + 1
  const expected = Array.from(rawQuery.split('missing_value')[0]).length + 1
  assert.deepEqual(mapSqlErrorPosition({ position: String(position) }, input), {
    errorPosition: expected,
    errorQuery: rawQuery
  })
  assert.notEqual(position, (input.prefix + before).length + 1, 'Emoji counts as one code point')
})

test('direct and explain EOF map immediately after the prepared query, including trimmed source', () => {
  for (const prefix of ['', 'EXPLAIN (FORMAT JSON, ANALYZE FALSE) ']) {
    const input = source(' \r\nUPDATE   ', prefix)
    const position = Array.from(input.executedQuery).length + 1
    assert.deepEqual(mapSqlErrorPosition({ position }, input), {
      errorPosition: Array.from(' \r\nUPDATE').length + 1,
      errorQuery: input.rawQuery
    })
  }
  const input = source('UPDATE')
  assert.equal(mapSqlErrorPosition({ position: 7 }, input)?.errorPosition, 7)
})

test('only original user characters map when the submitted query has a wrapper suffix', () => {
  const input = source("\nSELECT '😀'", 'SELECT * FROM (', '\n) AS result LIMIT 201')
  const prefixLength = Array.from(input.prefix).length
  const queryLength = Array.from(input.queryText).length
  assert.equal(mapSqlErrorPosition({ position: prefixLength }, input), undefined)
  assert.equal(mapSqlErrorPosition({ position: 1 }, input), undefined)
  assert.equal(mapSqlErrorPosition({ position: prefixLength + 1 }, input)?.errorPosition, 2)
  assert.equal(
    mapSqlErrorPosition({ position: prefixLength + queryLength }, input)?.errorPosition,
    queryLength + 1
  )
  for (const offset of [1, 2, input.suffix.length, input.suffix.length + 1])
    assert.equal(
      mapSqlErrorPosition({ position: prefixLength + queryLength + offset }, input),
      undefined
    )
})

test('rejects changed or noncontiguous query text and mismatched executed wrappers', () => {
  const input = source(' \nSELECT 1 /* SELECT 2 */;')
  for (const changed of [
    { ...input, queryText: 'SELECT 2', executedQuery: 'SELECT 2' },
    { ...input, queryText: 'SELECT 1', executedQuery: 'SELECT 1' + input.queryText },
    { ...input, executedQuery: input.queryText + ' LIMIT 10' },
    { ...input, queryText: '' }
  ])
    assert.equal(mapSqlErrorPosition({ position: 1 }, changed), undefined)
})

test('rejects invalid protocol positions instead of coercing null, booleans or internal positions', () => {
  const input = source('SELECT 1')
  for (const value of [
    undefined,
    null,
    true,
    false,
    '',
    ' 1',
    '+1',
    '1.0',
    '1e0',
    '0',
    '-1',
    0,
    -1,
    1.5,
    Infinity,
    NaN,
    10,
    Number.MAX_SAFE_INTEGER + 1,
    '9007199254740993'
  ])
    assert.equal(mapSqlErrorPosition({ position: value, internal_position: '1' }, input), undefined)
  for (const error of [null, 'position: 1', { internal_position: '1', internal_query: 'SELECT' }])
    assert.equal(mapSqlErrorPosition(error, input), undefined)
})

test('does not invoke accessors or accept inherited error coordinates', () => {
  const input = source('SELECT 1')
  const error = Object.defineProperty({}, 'position', {
    get() {
      throw new Error('must not read a protocol position getter')
    }
  })
  assert.equal(mapSqlErrorPosition(error, input), undefined)
  assert.equal(mapSqlErrorPosition(Object.create({ position: '1' }), input), undefined)
})
