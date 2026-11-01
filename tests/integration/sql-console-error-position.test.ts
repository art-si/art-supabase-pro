import assert from 'node:assert/strict'
import test from 'node:test'
import postgres from 'postgres'
import { mapSqlErrorPosition } from '../../supabase/functions/execute-sql-with-columns/error-position'
import { prepareSqlInput } from '../../supabase/functions/execute-sql-with-columns/sql-input'

test(
  'real PostgreSQL positions map only proven user SQL characters and unwrapped EOF',
  { skip: process.env.SQL_CONSOLE_ERROR_DB_TEST !== '1', timeout: 15000 },
  async (t) => {
    // Fixed disposable local server, with every statement inside a read-only transaction.
    const db = postgres({
      host: '127.0.0.1',
      port: 18543,
      database: 'console_test',
      username: 'postgres',
      password: 'sql_console_test_only',
      prepare: false,
      max: 1,
      connect_timeout: 3
    })
    const fail = async (rawQuery: string, prefix = '', suffix = '') => {
      const queryText = prepareSqlInput(rawQuery).query
      const executedQuery = prefix + queryText + suffix
      try {
        await db.begin('READ ONLY', (tx) => tx.unsafe(executedQuery))
        assert.fail('The fixture SQL must fail')
      } catch (error) {
        assert.ok(error instanceof postgres.PostgresError)
        return {
          error,
          location: mapSqlErrorPosition(error, {
            rawQuery,
            queryText,
            executedQuery,
            prefix,
            suffix
          }),
          executedQuery
        }
      }
    }
    try {
      await t.test(
        'SELECT wrapper maps CJK, emoji, CRLF and stripped delimiter to the raw source',
        async () => {
          const raw =
            " \t\r\n/* 中文😀 */\r\nSELECT '中文😀' AS label,\r\n no_such_value ; -- 尾注\r\n"
          const result = await fail(raw, 'SELECT * FROM (', '\n) AS _sql_console_result LIMIT 201')
          assert.equal(result.error.code, '42703')
          assert.deepEqual(result.location, {
            errorPosition: Array.from(raw.split('no_such_value')[0]).length + 1,
            errorQuery: raw
          })
          assert.equal(Array.from(result.executedQuery)[Number(result.error.position) - 1], 'n')
        }
      )

      await t.test(
        'EXPLAIN preserves original leading whitespace and non-ASCII position',
        async () => {
          const raw = "\n\tSELECT '😀中文' AS 文本,\r\n no_such_value\r\n"
          const result = await fail(raw, 'EXPLAIN (FORMAT JSON, ANALYZE FALSE) ')
          assert.equal(result.error.code, '42703')
          assert.deepEqual(result.location, {
            errorPosition: Array.from(raw.split('no_such_value')[0]).length + 1,
            errorQuery: raw
          })
        }
      )

      await t.test(
        'direct and EXPLAIN syntax EOF are accepted, including raw trailing whitespace',
        async () => {
          for (const prefix of ['', 'EXPLAIN (FORMAT JSON, ANALYZE FALSE) ']) {
            const raw = ' \r\nUPDATE   '
            const result = await fail(raw, prefix)
            assert.equal(result.error.code, '42601')
            assert.equal(Number(result.error.position), Array.from(result.executedQuery).length + 1)
            assert.deepEqual(result.location, {
              errorPosition: Array.from(' \r\nUPDATE').length + 1,
              errorQuery: raw
            })
          }
        }
      )

      await t.test('SELECT wrapper closing parenthesis is not attributed to user EOF', async () => {
        const result = await fail(
          " \r\nSELECT '😀中文',   ",
          'SELECT * FROM (',
          '\n) AS _sql_console_result LIMIT 201'
        )
        assert.equal(result.error.code, '42601')
        assert.equal(Array.from(result.executedQuery)[Number(result.error.position) - 1], ')')
        assert.equal(result.location, undefined)
      })

      await t.test(
        'RETURNING mutation wrapper suffix is likewise excluded without executing a write',
        async () => {
          const result = await fail(
            "\nUPDATE pg_catalog.pg_class SET relname = '😀' RETURNING",
            'WITH _sql_console_mutation AS (',
            '\n) SELECT * FROM _sql_console_mutation LIMIT 201'
          )
          assert.equal(result.error.code, '42601')
          assert.equal(Array.from(result.executedQuery)[Number(result.error.position) - 1], ')')
          assert.equal(result.location, undefined)
        }
      )

      await t.test(
        'server-generated PL/pgSQL internal position is not a submitted-query position',
        async () => {
          const result = await fail('DO $$ BEGIN PERFORM no_such_internal_value; END $$')
          assert.equal(result.error.code, '42703')
          assert.equal(result.error.position, undefined)
          assert.ok(result.error.internal_position)
          assert.ok(result.error.internal_query)
          assert.equal(result.location, undefined)
        }
      )
    } finally {
      await db.end({ timeout: 0 })
    }
  }
)
