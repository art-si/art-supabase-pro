import assert from 'node:assert/strict'
import test from 'node:test'
import postgres from 'postgres'
import {
  createQueryCancellation,
  SqlQueryCancelledError
} from '../../supabase/functions/_shared/query-cancellation'

test(
  'built-in cancellation interrupts a real Postgres backend and rolls back its transaction',
  { skip: process.env.SQL_CONSOLE_CANCEL_DB_TEST !== '1', timeout: 15000 },
  async () => {
    // Deliberately fixed disposable instance; never use a business connection string.
    const options = {
      host: '127.0.0.1',
      port: 18543,
      database: 'console_test',
      username: 'postgres',
      password: 'sql_console_test_only',
      prepare: false,
      max: 1
    }
    const db = postgres(options)
    const control = postgres(options)
    let cancel = false
    let backend: { pid: number; backend_start: string; transaction_start: string } | undefined
    const name = `builtin_cancel_${Date.now()}`
    const applicationName = `art-test-${name}`
    const changedApplicationName = `changed-${name}`
    await control.unsafe(`CREATE TABLE "${name}" (value integer)`)
    const controller = createQueryCancellation(
      async () => (cancel ? 'cancel_requested' : 'running'),
      async () => {
        assert.ok(backend)
        const observed =
          await control`SELECT pid,backend_start::text AS backend_start,xact_start::text AS transaction_start,application_name FROM pg_stat_activity WHERE pid=${backend.pid}`
        assert.deepEqual(observed[0], { ...backend, application_name: changedApplicationName })
        const acknowledged = await control`SELECT pg_cancel_backend(pid) FROM pg_stat_activity
      WHERE pid=${backend.pid} AND backend_start=${backend.backend_start}::text::timestamptz
      AND xact_start=${backend.transaction_start}::text::timestamptz`
        assert.equal(
          acknowledged.length,
          1,
          'The held transaction must still match its cancellation identity'
        )
      },
      20
    )
    try {
      const started = Date.now()
      const running = db.begin(async (tx) => {
        await tx`SELECT set_config('application_name', ${applicationName}, true)`
        const rows =
          await tx`SELECT pid, backend_start::text AS backend_start, xact_start::text AS transaction_start FROM pg_stat_activity WHERE pid=pg_backend_pid()`
        backend = {
          pid: Number(rows[0].pid),
          backend_start: String(rows[0].backend_start),
          transaction_start: String(rows[0].transaction_start)
        }
        await tx.unsafe(`INSERT INTO "${name}" VALUES (1)`)
        // An administrator's SQL can change a GUC; it cannot change backend/transaction identity.
        await tx`SELECT set_config('application_name', ${changedApplicationName}, true)`
        await controller.run(() => tx`SELECT pg_sleep(10)`)
      })
      const rejected = assert.rejects(running, SqlQueryCancelledError)
      let executing = false
      while (!executing) {
        const rows =
          await control`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name=${changedApplicationName} AND query LIKE '%pg_sleep%' AND state='active'`
        executing = rows[0].count === 1
        if (!executing) await new Promise<void>((resolve) => setTimeout(resolve, 20))
      }
      cancel = true
      await rejected
      assert.ok(Date.now() - started < 5000, 'Cancellation must finish before the 10 second sleep')
      assert.equal(
        (await control.unsafe(`SELECT count(*)::int AS count FROM "${name}"`))[0].count,
        0
      )
      assert.equal(
        (
          await control`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name=${changedApplicationName} AND state='active'`
        )[0].count,
        0
      )
      assert.equal(
        (await db`SELECT 42 AS still_usable`)[0].still_usable,
        42,
        'A late signal must not cancel the next transaction'
      )
    } finally {
      await controller.stop()
      await control.unsafe(`DROP TABLE "${name}"`)
      await Promise.all([db.end({ timeout: 0 }), control.end({ timeout: 0 })])
    }
  }
)
