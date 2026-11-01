import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import postgres from 'postgres'
import mysql from 'mysql2/promise'
import { querySqlConnection } from '../../scripts/sql-gateway-driver'
import {
  SqlQueryCancellation,
  SqlQueryCancelledError
} from '../../scripts/sql-gateway-cancellation'
import { createSqlGateway } from '../../scripts/sql-gateway-server'
import { SqlConnectionVault } from '../../scripts/sql-gateway-vault'
import type { SqlConnection } from '../../src/types/sql-connections'

const enabled = process.env.SQL_GATEWAY_REAL_DATABASES === '1'
const password = 'sql_console_test_only'
const tenant = '00000000-0000-4000-8000-000000000001'
const own = '00000000-0000-4000-8000-000000000002'
const other = '00000000-0000-4000-8000-000000000003'
const base: SqlConnection = {
  id: randomUUID(),
  name: '隔离取消验证',
  dialect: 'postgres',
  host: '127.0.0.1',
  port: 18543,
  database: 'console_test',
  username: 'postgres',
  tls: false,
  enabled: true,
  tenantId: tenant,
  allowedUserIds: [own, other],
  updatedAt: ''
}

async function until(check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(30)
  }
  assert.fail('expected live database activity did not appear')
}

for (const dialect of ['postgres', 'mysql'] as const)
  test(
    `${dialect}: cancel stops the actual server query and protects other requests`,
    {
      skip: !enabled,
      timeout: 60000
    },
    async () => {
      const connection = {
        ...base,
        dialect,
        port: dialect === 'postgres' ? 18543 : 18306,
        username: dialect === 'postgres' ? 'postgres' : 'root'
      }
      const pg =
        dialect === 'postgres'
          ? postgres({
              host: connection.host,
              port: connection.port,
              database: connection.database,
              username: connection.username,
              password,
              max: 1
            })
          : undefined
      const my =
        dialect === 'mysql'
          ? await mysql.createConnection({
              host: connection.host,
              port: connection.port,
              database: connection.database,
              user: connection.username,
              password
            })
          : undefined
      const marker = `cancel-${randomUUID()}`
      const activity = async () => {
        if (pg)
          return (
            await pg`SELECT pid FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND state='active' AND query LIKE ${`%${marker}%`}`
          ).length
        const [rows] = await my!.query(
          'SELECT ID FROM information_schema.PROCESSLIST WHERE ID <> CONNECTION_ID() AND INFO LIKE ?',
          [`%${marker}%`]
        )
        return Array.isArray(rows) ? rows.length : 0
      }
      const slow = `SELECT ${dialect === 'postgres' ? 'pg_sleep' : 'SLEEP'}(25), '${marker}' AS marker`
      const request = { query: slow, action: 'execute' as const, maxRows: 5, timeoutMs: 30000 }
      const control = new SqlQueryCancellation()
      const pending = querySqlConnection(connection, password, request, control).then(
        () => assert.fail('cancelled slow query must not succeed'),
        (error: unknown) => error
      )
      try {
        await until(async () => (await activity()) === 1)
        const started = Date.now()
        await control.cancel()
        assert.ok((await pending) instanceof SqlQueryCancelledError)
        assert.ok(Date.now() - started < 6000)
        assert.equal(await activity(), 0)
        assert.equal(
          (await querySqlConnection(connection, password, { ...request, query: 'SELECT 1 AS ok' }))
            .rows[0].ok,
          1
        )

        const directory = mkdtempSync(path.join(tmpdir(), 'art-sql-cancel-'))
        const vault = new SqlConnectionVault(directory)
        const saved = vault.save({ ...connection, id: undefined, password })
        const server = createSqlGateway({
          directory,
          origins: ['http://localhost:3006'],
          identity: async (token, route) => {
            const actor = token === 'other' ? other : own
            if (route === '/auth/v1/user') return { id: actor }
            if (route.includes('current_is_super')) return false
            return [{ id: actor, tenant_id: tenant, status: '1', deleted_at: null }]
          }
        })
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
        const address = server.address()
        assert.ok(address && typeof address === 'object')
        const call = (action: string, body: object, token = 'own') =>
          fetch(`http://127.0.0.1:${address.port}/connections/${saved.id}/${action}`, {
            method: 'POST',
            headers: {
              Origin: 'http://localhost:3006',
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
          })
        const ids = [randomUUID(), randomUUID()]
        const first = call('query', { ...request, requestId: ids[0] })
        const second = call('query', { ...request, requestId: ids[1] })
        try {
          await until(async () => (await activity()) === 2)
          assert.equal((await call('cancel', { requestId: ids[0] }, 'other')).status, 200)
          assert.equal(
            await activity(),
            2,
            'another authorized account cannot cancel these requests'
          )
          assert.equal(
            (await call('cancel', { requestId: ids[0] })).status,
            200,
            'cancel bypasses occupied per-user slots'
          )
          const cancelled = await first
          assert.equal(cancelled.status, 409)
          assert.equal((await cancelled.json()).code, 'SQL_QUERY_CANCELLED')
          assert.equal(
            (await (await call('cancel', { requestId: ids[0] })).json()).state,
            'not_running'
          )
          assert.equal(await activity(), 1, 'late cancellation must not affect another request')
          await call('cancel', { requestId: ids[1] })
          assert.equal((await second).status, 409)
          assert.equal(await activity(), 0)
          const early = randomUUID()
          await call('cancel', { requestId: early })
          const blocked = await call('query', { ...request, requestId: early })
          assert.equal(blocked.status, 409)
          assert.equal((await blocked.json()).code, 'SQL_QUERY_CANCELLED')
          assert.equal(await activity(), 0)
        } finally {
          server.closeAllConnections()
          await new Promise<void>((resolve) => server.close(() => resolve()))
          assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
          assert.ok(path.basename(directory).startsWith('art-sql-cancel-'))
          rmSync(directory, { recursive: true, force: true })
        }
      } finally {
        await pending
        await pg?.end({ timeout: 0 })
        my?.destroy()
      }
    }
  )
