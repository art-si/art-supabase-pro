import assert from 'node:assert/strict'
import { test } from 'node:test'

const projectUrl = process.env.SQL_CONSOLE_TEST_URL
const publishableKey = process.env.SQL_CONSOLE_TEST_KEY
const superToken = process.env.SQL_CONSOLE_SUPER_TOKEN
const ordinaryToken = process.env.SQL_CONSOLE_ORDINARY_TOKEN
const ready = Boolean(projectUrl && publishableKey && superToken)

async function invoke(
  token: string,
  body: Record<string, unknown>
): Promise<{ httpStatus: number; body: Record<string, unknown> }> {
  const response = await fetch(`${projectUrl}/functions/v1/execute-sql-with-columns`, {
    method: 'POST',
    headers: {
      apikey: publishableKey!,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  const bodyResult: unknown = await response.json()
  assert.ok(bodyResult && typeof bodyResult === 'object' && !Array.isArray(bodyResult))
  return { httpStatus: response.status, body: bodyResult as Record<string, unknown> }
}

test('SQL console metadata includes bounded catalog relationships', { skip: !ready }, async () => {
  const result = await invoke(superToken!, { action: 'metadata' })
  assert.equal(result.httpStatus, 200)
  assert.ok(Array.isArray(result.body.schemas))
  assert.ok(Array.isArray(result.body.tables))
  assert.ok(Array.isArray(result.body.columns))
  assert.ok(Array.isArray(result.body.foreignKeys))
  assert.ok(
    (result.body.schemas as string[]).every((schema) => !/^pg_(?:temp|toast_temp)_/.test(schema))
  )
})

test('SQL console explains without executing the statement', { skip: !ready }, async () => {
  const result = await invoke(superToken!, { action: 'explain', query: 'SELECT 1 AS probe' })
  assert.equal(result.httpStatus, 200)
  assert.equal(result.body.status, 'ok')
  assert.equal(result.body.executionScope, 'database')
  assert.ok(Array.isArray(result.body.plan))
  assert.equal(result.body.executionTimeMs, undefined)
})

test('SQL console limits returned rows and reports truncation', { skip: !ready }, async () => {
  const result = await invoke(superToken!, {
    action: 'execute',
    query: 'SELECT generate_series(1, 130) AS n',
    maxRows: 100
  })
  assert.equal(result.httpStatus, 200)
  assert.equal(result.body.status, 'ok')
  assert.equal((result.body.rows as unknown[]).length, 100)
  assert.equal(result.body.truncated, true)
  assert.equal(result.body.max_rows, 100)
})

test(
  'SQL console enforces database statement timeout',
  { skip: !ready, timeout: 15_000 },
  async () => {
    const started = Date.now()
    const result = await invoke(superToken!, {
      action: 'execute',
      query: 'SELECT pg_sleep(6)',
      timeoutMs: 5_000
    })
    assert.equal(result.body.status, 'error')
    assert.match(String(result.body.message), /超时/)
    assert.ok(Date.now() - started < 10_000, 'Database timeout should cancel the running statement')
  }
)

test(
  'ordinary users cannot execute arbitrary SQL',
  { skip: !ready || !ordinaryToken },
  async () => {
    const result = await invoke(ordinaryToken!, { action: 'execute', query: 'SELECT 1' })
    assert.equal(result.httpStatus, 403)
    assert.equal(result.body.status, 'error')
    const metadata = await invoke(ordinaryToken!, { action: 'metadata' })
    assert.equal(metadata.httpStatus, 200)
    assert.ok(Array.isArray(metadata.body.foreignKeys))
  }
)
