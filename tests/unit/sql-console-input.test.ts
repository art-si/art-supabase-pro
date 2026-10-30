import assert from 'node:assert/strict'
import { test } from 'node:test'
import { prepareSqlInput } from '../../supabase/functions/execute-sql-with-columns/sql-input'

test('leading comments still identify a bounded SELECT', () => {
  const input = prepareSqlInput('/* outer /* inner */ done */\n-- note\nSELECT 1')
  assert.equal(input.keyword, 'SELECT')
  assert.equal(input.multipleStatements, false)
})

test('quoted and dollar-quoted semicolons do not split a statement', () => {
  const input = prepareSqlInput(
    `SELECT ';' AS a, E'escaped\\';' AS b, $$;$$ AS c, $tag$;$tag$ AS d;`
  )
  assert.equal(input.keyword, 'SELECT')
  assert.equal(input.multipleStatements, false)
  assert.ok(input.query.endsWith('$tag$ AS d'))
})

test('a trailing delimiter before a comment is removed', () => {
  const input = prepareSqlInput('SELECT 1; -- last comment')
  assert.equal(input.query, 'SELECT 1')
  assert.equal(input.multipleStatements, false)
})

test('a second statement after comments is rejected', () => {
  const input = prepareSqlInput('SELECT 1; /* comment */ SELECT 2')
  assert.equal(input.multipleStatements, true)
})

test('WITH is classified as a query after leading comments', () => {
  const input = prepareSqlInput('-- cte\nWITH q AS (SELECT 1) SELECT * FROM q')
  assert.equal(input.keyword, 'WITH')
})
