import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTc3Headers, createSqlBatches } from '../../scripts/apply-cloudbase-transfer'

test('creates bounded transactional SQL batches without reordering statements', () => {
  const statements = ['SELECT 1;', 'SELECT 2;', 'SELECT 3;']
  const batches = createSqlBatches(statements, 0, 12)
  assert.deepEqual(
    batches.map(({ start, end }) => [start, end]),
    [
      [0, 1],
      [1, 2],
      [2, 3]
    ]
  )
  assert.match(
    batches[0].sql,
    /^BEGIN;\nSET LOCAL check_function_bodies = false;\nSELECT 1;\nCOMMIT;$/u
  )
})

test('builds deterministic TC3 headers without exposing the secret key', () => {
  const headers = buildTc3Headers({
    credential: {
      tmpSecretId: 'AKIDEXAMPLE',
      tmpSecretKey: 'secret-value',
      tmpToken: 'token-value'
    },
    action: 'ExecutePGSql',
    payload: '{"EnvId":"example","Sql":"select 1"}',
    region: 'ap-shanghai',
    timestamp: 1_700_000_000
  })
  assert.match(headers.Authorization, /^TC3-HMAC-SHA256 Credential=AKIDEXAMPLE\//u)
  assert.doesNotMatch(headers.Authorization, /secret-value/u)
  assert.equal(headers['X-TC-Token'], 'token-value')
  assert.equal(headers['X-TC-Action'], 'ExecutePGSql')
})
