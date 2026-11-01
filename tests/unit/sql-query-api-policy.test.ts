import assert from 'node:assert/strict'
import test from 'node:test'
import parser from 'node-sql-parser'
import {
  bindParameters,
  compileNamedParameters,
  validateDefinition,
  validateReadOnlyAst
} from '../../supabase/functions/sql-query-api/policy'
const sqlParser = new parser.Parser()

test('named values preserve comments, quoted identifiers, dollar bodies, escaped strings and casts', () => {
  const parameters = [{ name: 'q', type: 'string' as const, required: true }]
  const source =
    "SELECT :q::text, :q, ':ignored', \"name:quoted\", $$:dollar$$, $tag$:body$tag$, E'\\':escaped' /* :block /* :nested */ */ -- :comment\n"
  const compiled = compileNamedParameters(source, parameters)
  assert.deepEqual(compiled.names, ['q'])
  assert.ok(compiled.sql.startsWith('SELECT CAST($1 AS text)::text, CAST($1 AS text)'))
  for (const literal of [
    "':ignored'",
    '"name:quoted"',
    '$$:dollar$$',
    '$tag$:body$tag$',
    '/* :block /* :nested */ */',
    '-- :comment'
  ])
    assert.ok(compiled.sql.includes(literal))
  const attack = "x' UNION SELECT secret FROM credentials --"
  assert.deepEqual(bindParameters(parameters, compiled.names, { q: attack }), [attack])
  assert.ok(!compiled.sql.includes(attack))
  assert.throws(() => compileNamedParameters('SELECT $1', parameters), /位置参数/)
  assert.throws(() => compileNamedParameters("SELECT ':q", parameters), /未闭合/)
})

test('parameter types reject coercion, unknown keys and invalid dates while keeping numeric precision', () => {
  const defs = [
    { name: 'n', type: 'number' as const, required: true },
    { name: 'day', type: 'date' as const, required: false },
    { name: 'flag', type: 'boolean' as const, required: false }
  ]
  assert.deepEqual(
    bindParameters(defs, ['n', 'day', 'flag'], {
      n: '900719925474099312345.1234567890123456789',
      day: '2024-02-29',
      flag: false
    }),
    ['900719925474099312345.1234567890123456789', '2024-02-29', false]
  )
  for (const input of [
    { n: '1; SELECT 2' },
    { n: Infinity },
    { n: true },
    { n: 3, extra: 4 },
    { n: 1, day: '2025-02-29' },
    { n: 1, flag: 'false' },
    {}
  ])
    assert.throws(() => bindParameters(defs, ['n', 'day', 'flag'], input))
  assert.deepEqual(bindParameters(defs, ['n', 'day', 'flag'], {}, true), [null, null, null])
})

test('read-only API AST rejects multi-statement, modifying CTE, locks and session or arbitrary RPC functions', () => {
  for (const query of [
    'SELECT 1; SELECT 2',
    'DELETE FROM t',
    'WITH x AS (DELETE FROM t RETURNING id) SELECT * FROM x',
    'SELECT * FROM t FOR UPDATE',
    'SELECT pg_sleep(10)',
    "SELECT set_config('role','postgres',true)",
    'SELECT public.my_mutation()',
    "SELECT nextval('seq')"
  ]) {
    assert.throws(
      () => validateReadOnlyAst(sqlParser.astify(query, { database: 'Postgresql' })),
      undefined,
      query
    )
  }
  for (const query of [
    'SELECT count(*) AS count, sum(amount) FROM t',
    'SELECT * FROM t WHERE name=CAST($1 AS text)',
    'WITH x AS (SELECT 1 AS id) SELECT * FROM x',
    "SELECT coalesce(name,'') FROM t",
    "SELECT date_trunc('day',created_at), jsonb_build_object('a',1) FROM t"
  ]) {
    validateReadOnlyAst(sqlParser.astify(query, { database: 'Postgresql' }))
  }
})

test('definition validation enforces immutable contract shapes and bounded grants/limits', () => {
  const value = {
    slug: 'daily-sales',
    name: '日报',
    description: '',
    sql: 'SELECT :n',
    tenantId: '',
    allowedUserIds: [],
    parameters: [{ name: 'n', type: 'number', required: true }],
    maxRows: 200,
    timeoutMs: 10000,
    enabled: true
  }
  assert.equal(validateDefinition(value).slug, 'daily-sales')
  for (const patch of [
    { slug: '../other' },
    { maxRows: 1001 },
    { timeoutMs: 0 },
    { allowedUserIds: ['bad'] },
    { parameters: [value.parameters[0], value.parameters[0]] }
  ])
    assert.throws(() => validateDefinition({ ...value, ...patch }))
})
