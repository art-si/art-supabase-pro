import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import postgres from 'postgres'
import { sqlQueryApiSamples } from '../../src/views/data-center/sql-console/modules/query-api-samples'

const enabled = process.env.SQL_GATEWAY_REAL_DATABASES === '1'
test(
  'published API handler enforces authenticated RLS, fixed SQL, tenant grants, precision and immediate disable',
  { skip: !enabled, timeout: 60000 },
  async () => {
    const admin = postgres({
      host: '127.0.0.1',
      port: 18543,
      database: 'console_test',
      username: 'postgres',
      password: 'sql_console_test_only'
    })
    const dbName = `sql_api_${process.pid}_${Date.now()}`
    await admin.unsafe(`CREATE DATABASE ${dbName}`)
    const db = postgres({
      host: '127.0.0.1',
      port: 18543,
      database: dbName,
      username: 'postgres',
      password: 'sql_console_test_only'
    })
    const tenantA = '00000000-0000-4000-8000-000000000001',
      tenantB = '00000000-0000-4000-8000-000000000002'
    const ids = {
      admin: '00000000-0000-4000-8000-000000000010',
      own: '00000000-0000-4000-8000-000000000011',
      ungranted: '00000000-0000-4000-8000-000000000012',
      foreign: '00000000-0000-4000-8000-000000000013',
      inactive: '00000000-0000-4000-8000-000000000014'
    }
    const tokens = new Map(
      Object.entries(ids).map(([name, id]) => [
        name,
        `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated' })).toString('base64url')}.test`
      ])
    )
    const auth = createServer((req, res) => {
      const token = req.headers.authorization?.replace('Bearer ', '')
      const actor = [...tokens.entries()].find(([, value]) => value === token)?.[0]
      res.setHeader('content-type', 'application/json')
      if (!actor) {
        res.writeHead(401)
        res.end('{"message":"invalid test token"}')
        return
      }
      res.end(
        JSON.stringify({
          id: ids[actor as keyof typeof ids],
          aud: 'authenticated',
          role: 'authenticated',
          email: 'fixture@example.invalid',
          app_metadata: {},
          user_metadata: {},
          identities: [],
          created_at: '2026-01-01T00:00:00Z'
        })
      )
    })
    await new Promise<void>((resolve) => auth.listen(0, '127.0.0.1', resolve))
    const address = auth.address()
    assert.ok(address && typeof address === 'object')
    try {
      await db.unsafe(`
      DO $$BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END$$;
      CREATE SCHEMA auth; CREATE SCHEMA app_private;
      CREATE TABLE public.sys_tenant(id uuid primary key,status text);
      CREATE TABLE public.sys_user(id uuid primary key,auth_user_id uuid,tenant_id uuid,status text,deleted_at timestamptz,nick_name text,user_name text,platform_super boolean);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
      CREATE FUNCTION app_private.is_platform_super() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT coalesce((SELECT platform_super FROM public.sys_user WHERE auth_user_id=auth.uid()),false)$$;
      CREATE FUNCTION app_private.current_read_tenant_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT CASE WHEN app_private.is_platform_super() THEN nullif(current_setting('request.headers',true)::jsonb->>'x-art-tenant-scope','')::uuid ELSE (SELECT tenant_id FROM public.sys_user WHERE auth_user_id=auth.uid()) END$$;
      GRANT USAGE ON SCHEMA auth,app_private TO authenticated;
      CREATE TABLE app_private.sql_query_api(id uuid primary key default gen_random_uuid(),slug text unique,name text,description text,sql_text text,tenant_id uuid,parameters jsonb,allowed_user_ids uuid[],max_rows integer,timeout_ms integer,enabled boolean,create_by text,update_by text,create_time timestamptz default clock_timestamp(),update_time timestamptz default clock_timestamp());
      CREATE TABLE app_private.sql_query_api_call(id uuid primary key default gen_random_uuid(),definition_id uuid,tenant_id uuid,actor_id uuid,auth_user_id uuid,started_at timestamptz default clock_timestamp(),expires_at timestamptz,finished_at timestamptz,status text,duration_ms integer,row_count integer,error_code text);
      ALTER TABLE app_private.sql_query_api ENABLE ROW LEVEL SECURITY;
      ALTER TABLE app_private.sql_query_api_call ENABLE ROW LEVEL SECURITY;
      CREATE TABLE public.api_test_data(tenant_id uuid,tag text);
      ALTER TABLE public.api_test_data ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant_read ON public.api_test_data FOR SELECT TO authenticated USING(tenant_id=app_private.current_read_tenant_id());
      GRANT SELECT ON public.api_test_data TO authenticated;
    `)
      await db`INSERT INTO public.sys_tenant VALUES(${tenantA},'1'),(${tenantB},'1')`
      for (const [name, id] of Object.entries(ids))
        await db`INSERT INTO public.sys_user VALUES(${id},${id},${name === 'foreign' ? tenantB : tenantA},${name === 'inactive' ? '0' : '1'},NULL,${name},${name},${name === 'admin'})`
      await db`INSERT INTO public.api_test_data VALUES(${tenantA},'alpha'),(${tenantB},'beta')`
      const artifact = path.resolve('.artifacts/sql-query-api')
      await mkdir(artifact, { recursive: true })
      const source = (await readFile('supabase/functions/sql-query-api/index.ts', 'utf8'))
        .replace("import 'jsr:@supabase/functions-js/edge-runtime.d.ts'", '')
        .replace("'jsr:@supabase/supabase-js@2'", "'@supabase/supabase-js'")
        .replace("'npm:postgres@3.4.9'", "'postgres'")
        .replace("'npm:node-sql-parser@5.4.0'", "'node-sql-parser'")
        .replace("'./policy.ts'", "'../../supabase/functions/sql-query-api/policy.ts'")
        .replace(
          "'../_shared/query-cancellation.ts'",
          "'../../supabase/functions/_shared/query-cancellation.ts'"
        )
      const generated = path.join(artifact, 'handler.generated.ts')
      await writeFile(generated, source)
      let handler: ((req: Request) => Promise<Response>) | undefined
      const environment = {
        SUPABASE_URL: `http://127.0.0.1:${address.port}`,
        SUPABASE_ANON_KEY: 'test-anon',
        SUPABASE_DB_URL: `postgres://postgres:sql_console_test_only@127.0.0.1:18543/${dbName}`
      }
      const runtime = globalThis as typeof globalThis & { Deno?: unknown }
      const original = runtime.Deno
      runtime.Deno = {
        env: { get: (key: string) => environment[key as keyof typeof environment] },
        serve: (value: typeof handler) => {
          handler = value
        }
      }
      try {
        await import(`${pathToFileURL(generated).href}?version=${Date.now()}`)
      } finally {
        runtime.Deno = original
      }
      assert.ok(handler)
      // The captured handler still reads environment per request, as Edge Runtime does.
      runtime.Deno = { env: { get: (key: string) => environment[key as keyof typeof environment] } }
      try {
        const call = async (actor: string, body: object, slug = '', scope?: string) => {
          const response = await handler!(
            new Request(`http://fixture/functions/v1/sql-query-api${slug ? `/${slug}` : ''}`, {
              method: 'POST',
              headers: {
                authorization: `Bearer ${tokens.get(actor)}`,
                'content-type': 'application/json',
                ...(scope ? { 'x-art-tenant-scope': scope } : {})
              },
              body: JSON.stringify(body)
            })
          )
          return { status: response.status, body: await response.json() }
        }
        const input = {
          slug: 'fixture-read-api',
          name: '隔离测试API',
          description: '',
          sql: 'SELECT tenant_id,tag FROM api_test_data WHERE tag ILIKE :q;',
          tenantId: tenantA,
          allowedUserIds: [ids.own],
          parameters: [{ name: 'q', type: 'string', required: true }],
          maxRows: 100,
          timeoutMs: 5000,
          enabled: true
        }
        assert.equal((await call('own', { action: 'save', input })).status, 403)
        const saved = await call('admin', { action: 'save', input })
        assert.equal(saved.status, 200, JSON.stringify(saved.body))
        const listed = await call('own', { action: 'list' })
        assert.equal(listed.body.definitions[0].sql, '')
        assert.deepEqual(listed.body.definitions[0].allowedUserIds, [])
        assert.equal((await call('foreign', { action: 'list' })).body.definitions.length, 0)
        assert.equal(
          (await call('admin', { action: 'list' }, '', tenantB)).body.definitions.length,
          0
        )
        const own = await call('own', { params: { q: '%' } }, input.slug, tenantB)
        assert.equal(own.status, 200, JSON.stringify(own.body))
        assert.deepEqual(own.body.rows, [{ tenant_id: tenantA, tag: 'alpha' }])
        assert.deepEqual((await call('admin', { params: { q: '%' } }, input.slug)).body.rows, [
          { tenant_id: tenantA, tag: 'alpha' }
        ])
        for (const actor of ['foreign', 'ungranted', 'inactive'])
          assert.ok((await call(actor, { params: { q: '%' } }, input.slug)).status >= 400)
        assert.deepEqual(
          (
            await call(
              'own',
              { params: { q: "%' OR true --" }, query: 'SELECT * FROM api_test_data' },
              input.slug
            )
          ).body.rows,
          []
        )
        assert.equal(
          (await call('own', { params: { q: '%', extra: 'x' } }, input.slug)).status,
          400
        )
        assert.equal(
          (
            await call('admin', {
              action: 'save',
              input: { ...saved.body, sql: "SELECT set_config('role','postgres',true)" }
            })
          ).status,
          400
        )
        const numeric = await call('admin', {
          action: 'save',
          input: {
            ...input,
            slug: 'fixture-number-api',
            sql: 'SELECT :n AS exact',
            parameters: [{ name: 'n', type: 'number', required: true }]
          }
        })
        assert.equal(numeric.status, 200, JSON.stringify(numeric.body))
        const precise = '900719925474099312345.123456789'
        assert.equal(
          (await call('own', { params: { n: precise } }, 'fixture-number-api')).body.rows[0].exact,
          precise
        )
        const limited = await call('admin', {
          action: 'save',
          input: {
            ...input,
            slug: 'fixture-limited-api',
            parameters: [],
            sql: 'SELECT id FROM generate_series(1,20) AS data(id)',
            maxRows: 2,
            timeoutMs: 1000
          }
        })
        assert.equal(limited.status, 200, JSON.stringify(limited.body))
        const capped = await call('own', { params: {}, maxRows: 1000 }, 'fixture-limited-api')
        assert.equal(capped.status, 200, JSON.stringify(capped.body))
        assert.equal(capped.body.rows.length, 2)
        assert.equal(capped.body.truncated, true)
        const privateRead = await call('admin', {
          action: 'save',
          input: {
            ...input,
            slug: 'fixture-private-api',
            parameters: [],
            sql: 'SELECT * FROM app_private.sql_query_api'
          }
        })
        assert.equal(
          privateRead.status,
          403,
          'published data SQL cannot inherit control-plane table access'
        )
        let cancelDefinition = (
          await call('admin', {
            action: 'save',
            input: { ...input, slug: 'fixture-cancellable-api' }
          })
        ).body
        for (const scenario of ['ordinary', 'platform-selected', 'revoked']) {
          const requestId = crypto.randomUUID()
          const actor = scenario === 'platform-selected' ? 'admin' : 'own'
          const scope = scenario === 'platform-selected' ? tenantA : tenantB
          const cancelBody = { action: 'cancel', requestId, definitionId: cancelDefinition.id }
          assert.equal((await call(actor, cancelBody, '', scope)).body.state, 'not_running')
          let unlock = () => {}
          let markReady = () => {}
          const readyForCancel = new Promise<void>((resolve) => (markReady = resolve))
          const held = db.begin(async (tx) => {
            await tx.unsafe('LOCK TABLE public.api_test_data IN ACCESS EXCLUSIVE MODE')
            markReady()
            await new Promise<void>((resolve) => (unlock = resolve))
          })
          await readyForCancel
          const invocation = call(
            actor,
            { params: { q: '%' }, requestId },
            cancelDefinition.slug,
            scope
          )
          try {
            const deadline = Date.now() + 4000
            let running = false
            while (Date.now() < deadline) {
              running = Boolean(
                (
                  await db`SELECT pid FROM pg_stat_activity
                WHERE application_name=${`art-sql-api:${requestId}`} AND state='active' AND wait_event_type='Lock'`
                )[0]
              )
              if (running) break
              await delay(20)
            }
            assert.ok(running, 'the actual API data query is blocked in its owning transaction')
            assert.equal((await call('foreign', cancelBody)).body.state, 'not_running')
            assert.equal(
              (await call(actor, { ...cancelBody, definitionId: crypto.randomUUID() }, '', scope))
                .body.state,
              'not_running'
            )
            if (scenario === 'platform-selected')
              assert.equal((await call(actor, cancelBody, '', tenantB)).body.state, 'not_running')
            else
              assert.equal(
                (await call('admin', cancelBody)).body.state,
                'not_running',
                'super cannot cancel another actor'
              )
            if (scenario === 'revoked') {
              const revoked = await call('admin', {
                action: 'save',
                input: { ...cancelDefinition, enabled: false, allowedUserIds: [] }
              })
              assert.equal(revoked.status, 200)
              cancelDefinition = revoked.body
            }
            const acceptedAt = Date.now()
            assert.equal(
              (
                await call(
                  actor,
                  cancelBody,
                  '',
                  scenario === 'platform-selected' ? undefined : scope
                )
              ).body.state,
              'cancel_requested'
            )
            const terminated = await invocation
            assert.equal(terminated.status, 200, JSON.stringify(terminated.body))
            assert.equal(terminated.body.status, 'cancelled', JSON.stringify(terminated.body))
            assert.ok(
              Date.now() - acceptedAt < 3000,
              'cancellation stops the blocked query before its 5s timeout'
            )
            assert.equal(
              (
                await db`SELECT pid FROM pg_stat_activity WHERE application_name=${`art-sql-api:${requestId}`} AND state='active'`
              ).length,
              0
            )
            const audit = (
              await db`SELECT status,error_code,finished_at FROM app_private.sql_query_api_call WHERE id=${requestId}::uuid`
            )[0]
            assert.equal(audit.status, 'error')
            assert.equal(audit.error_code, 'QUERY_CANCELLED')
            assert.ok(audit.finished_at)
            assert.equal(
              (
                await call(
                  actor,
                  cancelBody,
                  '',
                  scenario === 'platform-selected' ? undefined : scope
                )
              ).body.state,
              'finished'
            )
          } finally {
            unlock()
            await held
            await invocation
          }
        }
        let release!: () => void
        let acquired!: () => void
        const ready = new Promise<void>((resolve) => (acquired = resolve))
        const lock = db.begin(async (tx) => {
          await tx.unsafe('LOCK TABLE public.api_test_data IN ACCESS EXCLUSIVE MODE')
          acquired()
          await new Promise<void>((resolve) => (release = resolve))
        })
        await ready
        const inFlight = [
          call('own', { params: { q: '%' } }, input.slug),
          call('own', { params: { q: '%' } }, input.slug)
        ]
        const observer = postgres({
          host: '127.0.0.1',
          port: 18543,
          database: dbName,
          username: 'postgres',
          password: 'sql_console_test_only'
        })
        try {
          const deadline = Date.now() + 4000
          while (Date.now() < deadline) {
            const [{ count }] =
              await observer`SELECT count(*)::int AS count FROM app_private.sql_query_api_call WHERE status='running'`
            if (count === 2) break
            await delay(20)
          }
          assert.equal((await call('own', { params: { q: '%' } }, input.slug)).status, 429)
        } finally {
          await observer.end({ timeout: 0 })
        }
        const stopped = await call('admin', {
          action: 'save',
          input: { ...saved.body, enabled: false }
        })
        assert.equal(stopped.status, 200, JSON.stringify(stopped.body))
        release()
        await lock
        assert.ok(
          (await Promise.all(inFlight)).every((result) => result.status === 409),
          'in-flight results are withheld after disable'
        )
        assert.equal((await call('own', { params: { q: '%' } }, input.slug)).status, 404)
        assert.equal(
          (
            await call('admin', {
              action: 'save',
              input: { ...saved.body, name: 'stale overwrite' }
            })
          ).status,
          409
        )
        for (const sample of sqlQueryApiSamples) {
          const { slug, name, description, sql, parameters, maxRows, timeoutMs } = sample
          const published = await call('admin', {
            action: 'save',
            input: {
              slug,
              name,
              description,
              sql,
              parameters,
              maxRows,
              timeoutMs,
              tenantId: tenantA,
              allowedUserIds: [],
              enabled: true
            }
          })
          assert.equal(published.status, 200, JSON.stringify(published.body))
          const invoked = await call('admin', { params: sample.values }, slug)
          assert.equal(invoked.status, 200, JSON.stringify(invoked.body))
          assert.equal(invoked.body.truncated, false)
          assert.equal((await call('own', { params: sample.values }, slug)).status, 404)
          assert.equal((await call('admin', { params: sample.values }, slug, tenantB)).status, 404)
          if (slug === 'demo-hello') {
            assert.equal(invoked.body.rows[0].message, '你好，亿企工场')
            const granted = await call('admin', {
              action: 'save',
              input: { ...published.body, allowedUserIds: [ids.own] }
            })
            assert.equal(granted.status, 200, JSON.stringify(granted.body))
            const ordinaryDemo = await call('own', { params: sample.values }, slug)
            assert.equal(ordinaryDemo.status, 200, JSON.stringify(ordinaryDemo.body))
            assert.equal(ordinaryDemo.body.rows[0].message, '你好，亿企工场')
          } else if (slug === 'demo-order-amount') {
            assert.equal(invoked.body.rows[0].total_amount, '59.70')
          } else {
            assert.equal(invoked.body.rows.length, 7)
            assert.ok(String(invoked.body.rows[0].sale_date).startsWith('2026-01-01'))
            const filtered = await call(
              'admin',
              {
                params: { ...sample.values, min_amount: '2000' }
              },
              slug
            )
            assert.equal(filtered.status, 200, JSON.stringify(filtered.body))
            assert.deepEqual(
              filtered.body.rows.map((row: { sales_amount: string }) => row.sales_amount),
              ['2100.00', '2600.00']
            )
          }
        }
        const audits = await db`SELECT status,error_code FROM app_private.sql_query_api_call`
        assert.ok(audits.length >= 4)
        assert.ok(audits.every((row) => row.status === 'ok' || row.status === 'error'))
      } finally {
        runtime.Deno = original
      }
    } finally {
      auth.closeAllConnections()
      await new Promise<void>((resolve) => auth.close(() => resolve()))
      await db.end({ timeout: 0 })
      await admin.unsafe(`DROP DATABASE ${dbName} WITH (FORCE)`)
      await admin.end({ timeout: 0 })
    }
  }
)
