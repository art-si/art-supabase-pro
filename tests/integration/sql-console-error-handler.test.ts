import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { prepareSqlInput } from '../../supabase/functions/execute-sql-with-columns/sql-input'

test(
  'actual SQL Edge handler returns original-query positions from the real local Postgres driver',
  { skip: process.env.SQL_CONSOLE_ERROR_DB_TEST !== '1', timeout: 20000 },
  async (t) => {
    const authUserId = '00000000-0000-4000-8000-000000000001'
    const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: authUserId, aud: 'authenticated', role: 'authenticated' })).toString('base64url')}.fixture`
    let controlCalls = 0
    let cancelAfterControlCall: number | undefined
    let auditCalls = 0
    const mockAuth = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      if (req.url === '/auth/v1/user' && req.headers.authorization === `Bearer ${token}`) {
        res.end(
          JSON.stringify({
            id: authUserId,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'sql-position-fixture@example.invalid',
            app_metadata: {},
            user_metadata: {},
            identities: [],
            created_at: '2026-01-01T00:00:00Z'
          })
        )
      } else if (req.url === '/rest/v1/rpc/current_is_super') {
        res.end('true')
      } else if (req.url === '/rest/v1/rpc/sql_console_request_control') {
        controlCalls++
        res.end(
          JSON.stringify({
            state:
              cancelAfterControlCall !== undefined && controlCalls >= cancelAfterControlCall
                ? 'cancel_requested'
                : 'running'
          })
        )
      } else if (req.url === '/rest/v1/sys_audit_log') {
        auditCalls++
        res.writeHead(201)
        res.end('')
      } else {
        res.writeHead(404)
        res.end('{"message":"Unexpected fixture endpoint"}')
      }
      req.resume()
    })
    await new Promise<void>((resolve) => mockAuth.listen(0, '127.0.0.1', resolve))
    const address = mockAuth.address()
    assert.ok(address && typeof address === 'object')

    type Handler = (req: Request) => Promise<Response>
    let handler: Handler | undefined
    const runtime = globalThis as typeof globalThis & { Deno?: unknown }
    const previousRuntime = runtime.Deno
    const environment: Record<string, string> = {
      SUPABASE_URL: `http://127.0.0.1:${address.port}`,
      SUPABASE_ANON_KEY: 'fixture-public-key',
      SUPABASE_SERVICE_ROLE_KEY: 'fixture-audit-key',
      // Fixed disposable server only; no production URL or database credentials are read.
      SUPABASE_DB_URL: 'postgres://postgres:sql_console_test_only@127.0.0.1:18543/console_test'
    }
    try {
      const artifacts = path.resolve('.artifacts/sql-error-location-handler')
      await mkdir(artifacts, { recursive: true })
      for (const name of ['index.ts', 'sql-input.ts', 'metadata-input.ts', 'error-position.ts']) {
        let source = await readFile(`supabase/functions/execute-sql-with-columns/${name}`, 'utf8')
        if (name === 'index.ts')
          source = source
            .replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";', '')
            .replace('"jsr:@supabase/supabase-js@2"', '"@supabase/supabase-js"')
            .replace('"npm:postgres@3.4.3"', '"postgres"')
            .replace(
              '"../_shared/query-cancellation.ts"',
              '"../../supabase/functions/_shared/query-cancellation.ts"'
            )
        await writeFile(path.join(artifacts, name), source)
      }
      runtime.Deno = {
        env: { get: (key: string) => environment[key] },
        serve: (value: Handler) => {
          handler = value
        }
      }
      await import(`${pathToFileURL(path.join(artifacts, 'index.ts')).href}?run=${Date.now()}`)
      const invokeHandler = handler
      assert.ok(invokeHandler)

      const call = async (query: string, action = 'execute', requestId?: string) => {
        const response = await invokeHandler(
          new Request('http://fixture/functions/v1/execute-sql-with-columns', {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ action, query, ...(requestId ? { requestId } : {}) })
          })
        )
        const payload: unknown = await response.json()
        assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload))
        return { status: response.status, body: payload as Record<string, unknown> }
      }
      const assertLocation = (
        response: Awaited<ReturnType<typeof call>>,
        rawQuery: string,
        position: number
      ) => {
        assert.equal(response.status, 500)
        assert.equal(response.body.status, 'error')
        assert.equal(response.body.errorPosition, position)
        assert.equal(response.body.errorQuery, rawQuery)
        assert.equal(response.body.query_text, prepareSqlInput(rawQuery).query)
        assert.doesNotMatch(String(response.body.message), /\nLINE \d+:|\n\s*\^/)
      }

      await t.test(
        'wrapped SELECT keeps leading whitespace, CJK, emoji and CRLF coordinates',
        async () => {
          const raw =
            " \t\r\n/* 中文😀 */\r\nSELECT '中文😀' AS label,\r\n no_such_value ; -- 尾注\r\n"
          const result = await call(raw)
          assertLocation(result, raw, Array.from(raw.split('no_such_value')[0]).length + 1)
        }
      )

      await t.test('EXPLAIN returns a position relative to the submitted source', async () => {
        const raw = "\n\tSELECT '😀中文' AS 文本,\r\n no_such_value\r\n"
        const result = await call(raw, 'explain')
        assertLocation(result, raw, Array.from(raw.split('no_such_value')[0]).length + 1)
      })

      await t.test(
        'direct and EXPLAIN EOF map after the prepared text, before removed whitespace',
        async () => {
          const raw = ' \r\nUPDATE   '
          for (const action of ['execute', 'explain'])
            assertLocation(await call(raw, action), raw, Array.from(' \r\nUPDATE').length + 1)
        }
      )

      await t.test(
        'SELECT and RETURNING wrapper suffix errors do not invent source coordinates',
        async () => {
          for (const raw of [
            " \r\nSELECT '😀中文',   ",
            "\nUPDATE pg_catalog.pg_class SET relname = '😀' RETURNING"
          ]) {
            const result = await call(raw)
            assert.equal(result.status, 500)
            assert.equal(result.body.status, 'error')
            assert.equal(Object.hasOwn(result.body, 'errorPosition'), false)
            assert.equal(Object.hasOwn(result.body, 'errorQuery'), false)
            assert.match(String(result.body.message), /syntax error/i)
          }
        }
      )

      await t.test('internal PL/pgSQL error positions remain unlocated', async () => {
        const result = await call('DO $$ BEGIN PERFORM no_such_internal_value; END $$')
        assert.equal(result.status, 500)
        assert.equal(result.body.status, 'error')
        assert.equal(Object.hasOwn(result.body, 'errorPosition'), false)
        assert.equal(Object.hasOwn(result.body, 'errorQuery'), false)
      })

      await t.test(
        'request registry preserves the real query error identity through cancellation wrapper',
        async () => {
          const callsBefore = controlCalls
          const raw = " \nSELECT '😀', no_such_value"
          const result = await call(raw, 'execute', crypto.randomUUID())
          assertLocation(result, raw, Array.from(raw.split('no_such_value')[0]).length + 1)
          assert.equal(Object.hasOwn(result.body, 'errorCode'), false)
          assert.ok(
            controlCalls >= callsBefore + 3,
            'begin, status and finish must all use the registry'
          )
        }
      )

      await t.test(
        'first registry poll cancels a real sleeping query without an error location',
        async () => {
          // Begin and the pre-query status are running; the first active poll requests cancellation.
          cancelAfterControlCall = controlCalls + 3
          const started = Date.now()
          try {
            const result = await call('SELECT pg_sleep(10)', 'execute', crypto.randomUUID())
            assert.ok(
              Date.now() - started < 5000,
              'The ten-second sleep must be interrupted promptly'
            )
            assert.equal(result.status, 500)
            assert.equal(result.body.status, 'error')
            assert.equal(result.body.errorCode, 'SQL_QUERY_CANCELLED')
            assert.equal(result.body.message, '查询已取消')
            assert.equal(Object.hasOwn(result.body, 'errorPosition'), false)
            assert.equal(Object.hasOwn(result.body, 'errorQuery'), false)
          } finally {
            cancelAfterControlCall = undefined
          }
        }
      )

      await t.test('successful SELECT still returns real rows and type metadata', async () => {
        const result = await call("SELECT '中文😀' AS label, 1 AS value")
        assert.equal(result.status, 200)
        assert.equal(result.body.status, 'ok')
        assert.deepEqual(result.body.rows, [{ label: '中文😀', value: 1 }])
        assert.ok(Array.isArray(result.body.columns))
        assert.deepEqual(
          result.body.columns.map((column: { name: string }) => column.name),
          ['label', 'value']
        )
        assert.equal(Object.hasOwn(result.body, 'errorPosition'), false)
        assert.equal(Object.hasOwn(result.body, 'errorQuery'), false)
      })
      assert.equal(
        auditCalls,
        10,
        'Each execution records its original success or error audit path'
      )
    } finally {
      runtime.Deno = previousRuntime
      await new Promise<void>((resolve, reject) => {
        mockAuth.close((error) => (error ? reject(error) : resolve()))
        mockAuth.closeAllConnections()
      })
    }
  }
)
