import assert from 'node:assert/strict'
import test from 'node:test'
import parser from 'node-sql-parser'
import {
  bindParameters,
  compileNamedParameters,
  validateDefinition,
  validateReadOnlyAst
} from '../../supabase/functions/sql-query-api/policy'
import {
  getSqlQueryApiSample,
  sqlQueryApiSamples
} from '../../src/views/data-center/sql-console/modules/query-api-samples'
import {
  sqlQueryApiExampleValues,
  sqlQueryApiExamples,
  sqlQueryApiParameters
} from '../../src/views/data-center/sql-console/modules/query-api-ui'
import type { SqlQueryApiDefinition } from '../../src/types/sql-query-api'

const definitions: SqlQueryApiDefinition[] = sqlQueryApiSamples.map((sample, index) => ({
  ...sample,
  id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  tenantId: '00000000-0000-4000-8000-000000000010',
  allowedUserIds: [],
  enabled: true,
  updatedAt: '2026-10-31T00:00:00Z'
}))

test('all three teaching queries pass the same definition, AST and binding policy as published APIs', () => {
  const sqlParser = new parser.Parser()
  assert.deepEqual(
    definitions.map((definition) => definition.slug),
    ['demo-hello', 'demo-order-amount', 'demo-sales-trend']
  )
  for (const definition of definitions) {
    const validated = validateDefinition(definition)
    const compiled = compileNamedParameters(validated.sql, validated.parameters)
    assert.doesNotThrow(() =>
      validateReadOnlyAst(sqlParser.astify(compiled.sql, { database: 'Postgresql' }))
    )
    const values = sqlQueryApiExampleValues(definition)
    const payload = sqlQueryApiParameters(validated.parameters, values)
    assert.deepEqual(
      bindParameters(validated.parameters, compiled.names, payload),
      compiled.names.map((name) => values[name])
    )
    assert.equal(definition.maxRows, 20)
    assert.equal(definition.timeoutMs, 5000)
    assert.deepEqual(validated.allowedUserIds, [])
    assert.doesNotMatch(compiled.sql, /\b(?:public|app_private)\s*\./i)
  }
})

test('teaching values retain decimal text and match the documented greeting, amount and trend inputs', () => {
  assert.deepEqual(definitions.map(sqlQueryApiExampleValues), [
    { name: '亿企工场' },
    { quantity: '3', unit_price: '19.90' },
    { start_date: '2026-01-01', min_amount: '0' }
  ])
  const values = sqlQueryApiExampleValues(definitions[1])
  values.unit_price = 'other'
  assert.equal(sqlQueryApiExampleValues(definitions[1]).unit_price, '19.90')
})

test('template copies match by exact SQL and parameters without requiring a reserved endpoint', () => {
  const copied = { ...definitions[0], slug: 'my-greeting-12345678' }
  assert.equal(getSqlQueryApiSample(copied)?.slug, 'demo-hello')
  assert.equal(getSqlQueryApiSample({ ...copied, sql: 'SELECT :name AS changed' }), undefined)
  assert.equal(getSqlQueryApiSample({ ...copied, parameters: [] }), undefined)
})

test('redacted ordinary views recognize only canonical demo endpoints with the full public parameter contract', () => {
  assert.equal(getSqlQueryApiSample({ ...definitions[0], sql: '' })?.slug, 'demo-hello')
  assert.equal(getSqlQueryApiSample({ ...definitions[0], sql: '', slug: 'other-api' }), undefined)
  assert.equal(getSqlQueryApiSample({ ...definitions[0], sql: '', parameters: [] }), undefined)
  assert.equal(getSqlQueryApiSample({ ...definitions[0], sql: 'SELECT 1' }), undefined)
})

test('sample integration snippets use the same runnable values and credential placeholders only', () => {
  for (const definition of definitions) {
    const snippets = sqlQueryApiExamples(definition, `https://example.invalid/${definition.slug}`)
    assert.deepEqual(JSON.parse(snippets.body).params, sqlQueryApiExampleValues(definition))
    assert.match(snippets.curl, /Bearer YOUR_ACCESS_TOKEN/)
    assert.match(snippets.javascript, /YOUR_PUBLISHABLE_KEY/)
    assert.doesNotMatch(JSON.stringify(snippets), /allowedUserIds|tenantId|updatedAt/)
  }
})
