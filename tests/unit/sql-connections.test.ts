import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SqlConnectionVault } from '../../scripts/sql-gateway-vault'
import { canUseSqlConnection, createSqlGateway } from '../../scripts/sql-gateway-server'
import { prepareReadOnlyQuery, validateGatewayQuery } from '../../scripts/sql-gateway-driver'
import {
  isSqlConnectionMetadata,
  normalizeExternalPlan,
  validateSqlConnection
} from '../../src/utils/sql-connections'
import {
  getSqlStatements,
  getSqlExecutionTarget,
  quoteSqlIdentifier
} from '../../src/utils/sql-workbench'
import type { SqlConnectionInput, SqlGatewayResult } from '../../src/types/sql-connections'

const tenantA = '00000000-0000-4000-8000-000000000001'
const tenantB = '00000000-0000-4000-8000-000000000002'
const user = '00000000-0000-4000-8000-000000000003'
const input: SqlConnectionInput = {
  name: '测试连接',
  dialect: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'test',
  username: 'reader',
  password: 'test-secret-for-vault',
  tls: false,
  enabled: true,
  tenantId: tenantA,
  allowedUserIds: [user]
}
function temporaryDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), 'art-sql-gateway-test-'))
  return {
    directory,
    cleanup() {
      assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
      assert.ok(path.basename(directory).startsWith('art-sql-gateway-test-'))
      rmSync(directory, { recursive: true, force: true })
    }
  }
}
test('credentials stay encrypted, edits retain secrets, and a wrong key cannot decrypt', () => {
  const temporary = temporaryDirectory()
  try {
    const vault = new SqlConnectionVault(temporary.directory)
    const connection = vault.save(validateSqlConnection(input))
    assert.equal('password' in connection, false)
    assert.equal(
      readFileSync(path.join(temporary.directory, 'connections.json'), 'utf8').includes(
        input.password!
      ),
      false
    )
    assert.equal(vault.get(connection.id).password, input.password)
    vault.save({ ...connection, password: '', name: '改名' })
    assert.equal(
      new SqlConnectionVault(temporary.directory).get(connection.id).password,
      input.password
    )
    assert.throws(() => vault.save({ ...connection, tenantId: tenantB }), /不能更换所属租户/)
  } finally {
    temporary.cleanup()
  }
})
test('external connection grants preserve all, selected, own and forged-scope boundaries', () => {
  const connection = { ...input, id: 'id', updatedAt: '' }
  const ordinary = { id: user, tenantId: tenantA, platformSuper: false, selectedTenant: tenantB }
  assert.equal(canUseSqlConnection(connection, ordinary), true)
  assert.equal(canUseSqlConnection({ ...connection, tenantId: tenantB }, ordinary), false)
  assert.equal(canUseSqlConnection({ ...connection, allowedUserIds: [] }, ordinary), false)
  assert.equal(
    canUseSqlConnection(connection, { ...ordinary, platformSuper: true, selectedTenant: null }),
    true
  )
  assert.equal(
    canUseSqlConnection(connection, { ...ordinary, platformSuper: true, selectedTenant: tenantB }),
    false
  )
  assert.equal(
    canUseSqlConnection(
      { ...connection, enabled: false },
      { ...ordinary, platformSuper: true, selectedTenant: null }
    ),
    false
  )
})
test('both dialects reject writes, multi statements, output files, executable comments and writable CTEs', () => {
  for (const dialect of ['postgres', 'mysql'] as const) {
    assert.match(prepareReadOnlyQuery("SELECT 'a;b' AS example", dialect), /SELECT/i)
    assert.match(
      prepareReadOnlyQuery('WITH value AS (SELECT 1 AS id) SELECT id FROM value', dialect),
      /WITH/i
    )
    for (const sql of [
      'DELETE FROM users',
      'SELECT 1; SELECT 2',
      'SELECT * INTO new_table FROM users',
      "SELECT 1 INTO OUTFILE '/tmp/out'",
      'WITH changed AS (DELETE FROM users RETURNING *) SELECT * FROM changed',
      'SELECT 1 /*! INTO OUTFILE x */',
      'SELECT * FROM users FOR UPDATE'
    ])
      assert.throws(() => prepareReadOnlyQuery(sql, dialect), /只读|SELECT/)
  }
  assert.throws(
    () =>
      validateGatewayQuery({
        query: 'SELECT 1',
        maxRows: 1001,
        timeoutMs: 10000,
        action: 'execute'
      }),
    /1000/
  )
})
test('MySQL statement navigation preserves quoted semicolons, escaped strings and hash comments', () => {
  const sql = "# first; ignored\nSELECT `a;b`, 'a\\';b'; SELECT 2;"
  const statements = getSqlStatements(sql, 'mysql')
  assert.equal(statements.length, 2)
  assert.equal(statements[0].lineNumber, 2)
  assert.equal(
    getSqlExecutionTarget(sql, sql.indexOf('SELECT 2') + 2, undefined, 'mysql').sql,
    'SELECT 2;'
  )
  assert.equal(quoteSqlIdentifier('a`b', 'mysql'), '`a``b`')
  assert.equal(getSqlStatements('SELECT "a\\";b"; SELECT 2;', 'mysql').length, 2)
})
test('MySQL plans keep original JSON while exposing table/index/cost navigation', () => {
  const raw = {
    query_block: {
      cost_info: { query_cost: '1.2' },
      table: {
        table_name: 'orders',
        access_type: 'ref',
        key: 'idx_customer',
        rows_produced_per_join: 12
      }
    }
  }
  const result: SqlGatewayResult = {
    status: 'ok',
    rows: [{ EXPLAIN: JSON.stringify(raw) }],
    columns: [{ name: 'EXPLAIN' }],
    commandTag: 'EXPLAIN',
    rowCount: 1,
    truncated: false,
    durationMs: 5,
    maxRows: 200,
    timeoutMs: 10000
  }
  const plan = normalizeExternalPlan(result, 'mysql')
  assert.deepEqual(plan.rawPlan, raw)
  assert.equal((plan.plan?.[0].Plan as Record<string, unknown>)['Relation Name'], 'orders')
  assert.equal(
    isSqlConnectionMetadata({
      schemas: [],
      tables: [],
      columns: [],
      functions: [],
      foreignKeys: []
    }),
    true
  )
  assert.equal(
    isSqlConnectionMetadata({
      schemas: [],
      tables: [{ tableSchema: 'db', tableName: 'bad', columns: [{}] }],
      columns: [],
      functions: [],
      foreignKeys: []
    }),
    false
  )
})
test('gateway rejects missing authentication, foreign origins, ordinary management and forged tenant grants', async () => {
  const temporary = temporaryDirectory()
  const origin = 'http://localhost:3006'
  const adminAuth = '00000000-0000-4000-8000-000000000004'
  const ordinaryAuth = '00000000-0000-4000-8000-000000000005'
  const server = createSqlGateway({
    directory: temporary.directory,
    origins: [origin],
    identity: async (token, route) => {
      if (route === '/auth/v1/user') return { id: token === 'admin' ? adminAuth : ordinaryAuth }
      if (route.includes('current_is_super')) return token === 'admin'
      if (route.includes('auth_user_id='))
        return [
          {
            id: user,
            tenant_id: token === 'foreign' ? tenantB : tenantA,
            status: '1',
            deleted_at: null
          }
        ]
      return [{ id: user, tenant_id: tenantA, nick_name: '测试账号', user_name: 'reader' }]
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const call = (
    route: string,
    token?: string,
    body?: unknown,
    selected = 'all',
    requestOrigin = origin
  ) =>
    fetch(`${base}${route}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Origin: requestOrigin,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
        'x-art-tenant-scope': selected
      },
      body: body ? JSON.stringify(body) : undefined
    })
  try {
    assert.equal((await call('/snapshot')).status, 401)
    assert.equal(
      (await call('/snapshot', 'admin', undefined, 'all', 'https://untrusted.invalid')).status,
      403
    )
    assert.equal((await call('/connections/save', 'ordinary', input)).status, 403)
    assert.equal((await call('/connections/save', 'admin', input, tenantB)).status, 403)
    const saved = await call('/connections/save', 'admin', input)
    assert.equal(saved.status, 200)
    const connection = (await saved.json()) as { id: string }
    assert.equal(
      (
        await call(
          `/connections/${connection.id}/query`,
          'foreign',
          { query: 'SELECT 1', action: 'execute', maxRows: 1, timeoutMs: 1000 },
          tenantA
        )
      ).status,
      403
    )
    const own = (await (await call('/snapshot', 'ordinary', undefined, tenantB)).json()) as {
      connections: unknown[]
    }
    assert.equal(own.connections.length, 1)
    const outside = (await (await call('/snapshot', 'foreign', undefined, tenantA)).json()) as {
      connections: unknown[]
    }
    assert.equal(outside.connections.length, 0)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    temporary.cleanup()
  }
})
