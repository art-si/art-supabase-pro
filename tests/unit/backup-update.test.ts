import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import postgres from 'postgres'
import { runBackupUpdate } from '../../scripts/backup-update'
import {
  UPDATE_REPOSITORY_ROOT,
  exists,
  fileHash,
  readJson,
  runUpdateCommand,
  writeJson,
  type UpdateCommand
} from '../../scripts/lib/backup-update-io'
import { BACKUP_SOURCE_PROJECT, digestValue } from '../../scripts/lib/backup-update-source'
import type { BackupVerificationReport } from '../../src/types/supabase-operations'
import { isBackupUpdateReport } from '../../src/utils/supabase/operations-update'

const options = { skip: process.platform !== 'win32', timeout: 30_000 }
const catalogHash = 'a'.repeat(32)
const cacheParent = path.join(
  UPDATE_REPOSITORY_ROOT,
  '.artifacts/supabase-operations/backup-update-cache'
)
const cachePath = (root: string) => path.join(cacheParent, digestValue(root.toLowerCase()))
const dump = (schema: string) =>
  `COPY "${schema}"."fixture" ("id") FROM stdin;\n\\.\n-- PostgreSQL database dump complete\n\nRESET ALL;\n`

async function fixture(t: TestContext) {
  const parent = await mkdtemp(path.join(tmpdir(), 'backup-update-flow-'))
  const root = path.join(parent, '20261030-215709')
  const caches = new Set([cachePath(root)])
  t.after(async () => {
    assert.equal(path.dirname(parent), path.resolve(tmpdir()))
    await rm(parent, { recursive: true, force: true })
    for (const cache of caches) {
      assert.equal(path.dirname(cache), cacheParent)
      await rm(cache, { recursive: true, force: true })
    }
  })
  await mkdir(path.join(root, 'database'), { recursive: true })
  await mkdir(path.join(root, 'metadata'))
  const contents = {
    'database/data.sql': dump('public'),
    'database/migration-history-data.sql': dump('supabase_migrations'),
    'database/schema.sql': '-- fixture schema\n',
    'database/roles.sql': '-- fixture roles\n',
    'database/managed-project-objects.sql':
      '-- Project-owned policies and triggers in managed schemas.\n-- Review managed-schema-snapshot.sql for platform base-schema differences.\n\n\n',
    'metadata/functions.json': '[]',
    'metadata/storage-buckets.json': '[]',
    'metadata/storage-object-counts.json': '[]',
    'metadata/realtime-publication-tables.json': '[]',
    'metadata/database-connection.json': JSON.stringify({
      Host: `db.${BACKUP_SOURCE_PROJECT}.supabase.co`,
      Port: 5432,
      User: 'postgres',
      Database: 'postgres'
    })
  }
  const files = []
  for (const [relative, text] of Object.entries(contents)) {
    const file = path.join(root, relative)
    await writeFile(file, text)
    files.push({ path: relative, bytes: Buffer.byteLength(text), sha256: await fileHash(file) })
  }
  await writeFile(
    path.join(root, 'README.md'),
    `# Supabase backup 20261030-215709\n\n-BackupPath '${root}'\n`
  )
  await writeJson(path.join(root, 'manifest.json'), {
    format_version: 1,
    project_ref: BACKUP_SOURCE_PROJECT,
    files
  })
  const hash = await fileHash(path.join(root, 'manifest.json'))
  await writeJson(path.join(cachePath(root), 'index.json'), {
    formatVersion: 1,
    algorithm: 'copy-text-sha256-eight-lane-sum-v1',
    manifestSha256: hash,
    catalog: {
      schema: catalogHash,
      roles: catalogHash,
      managedSchema: catalogHash,
      migrationHistory: catalogHash
    },
    storage: []
  })

  const commands: string[] = []
  const run: UpdateCommand = async (command, args, invocation) => {
    commands.push(command)
    if (command === 'powershell.exe' && args[args.indexOf('-Operation') + 1] === 'verify') {
      assert.equal(path.basename(args[args.indexOf('-File') + 1]), 'operations-task.ps1')
      const parameters: unknown = JSON.parse(invocation?.input || '{}')
      assert.ok(typeof parameters === 'object' && parameters !== null && 'BackupPath' in parameters)
      const destination = invocation?.env?.SUPABASE_OPS_REPORT_PATH
      assert.ok(destination)
      const now = new Date().toISOString()
      const report: BackupVerificationReport = {
        formatVersion: 1,
        status: 'passed',
        backupPath: root,
        sourceProjectRef: BACKUP_SOURCE_PROJECT,
        snapshotCreatedAt: null,
        startedAt: now,
        completedAt: now,
        summary: { files: 4, verifiedFiles: 4, totalBytes: 1, issueCount: 0 },
        checks: [{ id: 'manifest', label: '清单', status: 'passed', detail: '隔离测试' }],
        groups: [{ id: 'database', label: '数据库', files: 4, verifiedFiles: 4, bytes: 1 }],
        issues: [],
        limitations: ['隔离测试，不读取真实备份']
      }
      await writeJson(destination, report)
      return { code: 0, stdout: '', stderr: '' }
    }
    assert.equal(command, 'supabase', 'unexpected export or network command')
    assert.deepEqual(args.slice(0, 2), ['functions', 'list'])
    return { code: 0, stdout: '[]', stderr: '' }
  }
  const input = {
    UpdateBackupPath: root,
    DbPassword: 'fixture-only',
    PlanOnly: false,
    ApplyUpdate: true
  }
  return { parent, root, hash, caches, run, input, commands }
}

function unchangedSource(t: TestContext): ReturnType<typeof postgres> {
  // Use the real client shape without opening a connection; every query and
  // transaction is intercepted, and an unexpected SQL shape fails this test.
  const sql = postgres({ host: '127.0.0.1', port: 1, ssl: false, max: 1, prepare: false })
  t.mock.method(sql, 'unsafe', async (query: string, parameters: unknown[] = []) => {
    if (query === 'select 1') return []
    if (query.startsWith('set local ')) return []
    if (query.includes('pg_export_snapshot()'))
      return [{ snapshot: '00000001-00000001-1', version: '160000' }]
    if (query.includes('with ns as'))
      return [
        { schema: catalogHash, roles: catalogHash, managed: catalogHash, migration: catalogHash }
      ]
    if (query.startsWith('select n.nspname from pg_namespace')) return [{ nspname: 'public' }]
    if (query.includes('array_agg(a.attname')) {
      const schemas: unknown = JSON.parse(String(parameters[0]))
      assert.ok(Array.isArray(schemas))
      return [
        {
          schema: schemas.includes('supabase_migrations') ? 'supabase_migrations' : 'public',
          name: 'fixture',
          columns: ['id'],
          outputs: ['pg_catalog.int4out']
        }
      ]
    }
    if (query.startsWith('WITH row_hashes AS MATERIALIZED'))
      return [
        { rows: '0', ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`sum_${i}`, '0'])) }
      ]
    if (query.includes("where c.relkind='S'")) return []
    if (query.includes('from storage.objects order by')) return []
    if (
      query.includes("select 'policy' kind") ||
      query.includes('from storage.buckets order by') ||
      query.includes('from storage.objects group by') ||
      query.includes("where pubname='supabase_realtime'")
    )
      return []
    throw new Error('Unexpected source query in isolated backup update test')
  })
  t.mock.method(
    sql,
    'begin',
    async (
      mode: string,
      callback: (transaction: ReturnType<typeof postgres>) => Promise<unknown>
    ) => {
      assert.match(mode, /read only/)
      return await callback(sql)
    }
  )
  return sql
}

function sourceWithSchemaChanges(t: TestContext, rolesChanged = true) {
  const sql = unchangedSource(t)
  const query = sql.unsafe
  const settings: string[] = []
  let heartbeats = 0
  t.mock.method(sql, 'unsafe', async (text: string, parameters: unknown[] = []) => {
    if (text.startsWith('set local ')) settings.push(text)
    if (text === 'select 1') heartbeats++
    if (text.includes('pg_export_snapshot()'))
      return [{ snapshot: '00000001-00000001-1', version: '170000' }]
    if (text.includes('with ns as'))
      return [
        {
          schema: 'b'.repeat(32),
          roles: rolesChanged ? 'b'.repeat(32) : catalogHash,
          managed: catalogHash,
          migration: catalogHash
        }
      ]
    if (
      text.includes('from storage.buckets') ||
      text.includes('from storage.objects group by') ||
      text.includes('from pg_publication_tables')
    )
      return []
    return query(text, parameters)
  })
  return { sql, settings, heartbeats: () => heartbeats }
}

test(
  'multi-component exports longer than fifteen minutes retain one live read-only snapshot',
  options,
  async (t) => {
    const state = await fixture(t)
    const source = sourceWithSchemaChanges(t)
    const started = Array.from({ length: 2 }, () => Promise.withResolvers<void>())
    let exports = 0
    const run: UpdateCommand = async (command, args, options) => {
      if (command !== 'supabase' || !args.includes('dump')) return state.run(command, args, options)
      assert.ok(source.settings.includes('set local transaction_timeout=0'))
      assert.ok(source.settings.some((query) => query.includes("statement_timeout='120s'")))
      assert.ok(
        source.settings.some((query) =>
          query.includes("idle_in_transaction_session_timeout='15min'")
        )
      )
      const index = exports++
      assert.equal(
        options?.timeoutMs,
        index === 0 ? 45 * 60_000 : 15 * 60_000,
        'schema and other exports retain separate deadlines'
      )
      const completed = new Promise<void>((resolve) => setTimeout(resolve, 8 * 60_000))
      started[index].resolve()
      await completed
      assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
      const destination = args[args.indexOf('--file') + 1]
      await writeFile(
        destination,
        index === 0
          ? '-- fixture schema\nCREATE SCHEMA IF NOT EXISTS fixture_update;\n-- PostgreSQL database dump complete\n'
          : '-- fixture roles\nCREATE ROLE fixture_export_role NOLOGIN;\nRESET ALL;\n'
      )
      return { code: 0, stdout: '', stderr: '' }
    }
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const pending = runBackupUpdate(state.input, run, () => source.sql)
    for (const signal of started) {
      await signal.promise
      for (let tick = 0; tick < 16; tick++) {
        t.mock.timers.tick(30_000)
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }
    const report = await pending
    state.caches.add(cachePath(report.backupPath))
    assert.equal(report.status, 'updated', report.error || '')
    assert.equal(exports, 2)
    assert.ok(source.heartbeats() >= 30, 'snapshot stays active throughout external work')
    assert.ok(report.historyPath, 'verified changes commit after the source transaction ends')
    assert.equal(state.input.DbPassword, '')
  }
)

test(
  'a heartbeat failure during export stops later exports and preserves the original backup',
  options,
  async (t) => {
    const state = await fixture(t)
    const source = sourceWithSchemaChanges(t)
    const query = source.sql.unsafe
    t.mock.method(source.sql, 'unsafe', async (text: string, parameters: unknown[] = []) => {
      if (text === 'select 1')
        throw Object.assign(new Error('private transport detail'), { code: 'CONNECTION_CLOSED' })
      return query(text, parameters)
    })
    const started = Promise.withResolvers<void>()
    const finishExport = Promise.withResolvers<void>()
    let exports = 0
    const run: UpdateCommand = async (command, args, options) => {
      if (command !== 'supabase' || !args.includes('dump')) return state.run(command, args, options)
      exports++
      started.resolve()
      await finishExport.promise
      await writeFile(
        args[args.indexOf('--file') + 1],
        '-- fixture schema\n-- PostgreSQL database dump complete\n'
      )
      return { code: 0, stdout: '', stderr: '' }
    }
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const pending = runBackupUpdate(state.input, run, () => source.sql)
    await started.promise
    t.mock.timers.tick(30_000)
    await new Promise<void>((resolve) => setImmediate(resolve))
    finishExport.resolve()
    const report = await pending
    assert.equal(report.status, 'failed')
    assert.equal(report.errorCode, 'CONNECTION_CLOSED')
    assert.equal(report.errorStage, '校对结构文件 schema.sql')
    assert.equal(exports, 1, 'a late successful child result must not start another export')
    assert.equal(report.historyPath, undefined)
    assert.equal(report.resultManifestSha256, undefined)
    assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
    assert.equal(report.backupPath, state.root)
    assert.doesNotMatch(JSON.stringify(report), /private transport detail|fixture-only/)
    assert.equal(state.input.DbPassword, '')
  }
)

for (const { diagnostic, code } of [
  { diagnostic: 'FATAL: password authentication failed for user secret=private', code: '28P01' },
  { diagnostic: 'ERROR: permission denied for schema public secret=private', code: '42501' },
  {
    diagnostic: 'connection to server timed out secret=private',
    code: 'BACKUP_DUMP_CONNECTION_FAILED'
  },
  {
    diagnostic: 'cache lookup failed for function 123 secret=private',
    code: 'BACKUP_DUMP_SOURCE_CHANGED'
  },
  {
    diagnostic: 'ERROR: canceling statement due to statement timeout secret=private',
    code: '57014'
  },
  { diagnostic: 'unknown CLI failure secret=private', code: 'BACKUP_DUMP_FAILED' }
]) {
  test(
    `failed schema export reports ${code} without exposing CLI diagnostics`,
    options,
    async (t) => {
      const state = await fixture(t)
      const source = sourceWithSchemaChanges(t, false)
      let attempts = 0
      const run: UpdateCommand = async (command, args, invocation) => {
        if (command !== 'supabase' || !args.includes('dump'))
          return state.run(command, args, invocation)
        attempts++
        assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
        return { code: 1, stdout: '', stderr: diagnostic }
      }
      const report = await runBackupUpdate(state.input, run, () => source.sql)
      assert.equal(attempts, code === 'BACKUP_DUMP_CONNECTION_FAILED' ? 2 : 1)
      assert.equal(report.status, 'failed')
      assert.equal(report.errorCode, code)
      assert.equal(
        report.errorStage,
        code === 'BACKUP_DUMP_CONNECTION_FAILED'
          ? '结构文件 schema.sql 连接中断，清理暂存文件后重试'
          : '校对结构文件 schema.sql'
      )
      assert.match(report.error || '', /结构导出|来源数据库/)
      assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
      assert.equal(report.backupPath, state.root)
      assert.doesNotMatch(JSON.stringify(report), /secret=private|fixture-only/)
    }
  )
}

test(
  'schema export subprocess timeout retains its diagnostic code and the original backup',
  options,
  async (t) => {
    const state = await fixture(t)
    const source = sourceWithSchemaChanges(t, false)
    const run: UpdateCommand = async (command, args, invocation) => {
      if (command !== 'supabase' || !args.includes('dump'))
        return state.run(command, args, invocation)
      assert.equal(invocation?.timeoutMs, 45 * 60_000)
      return runUpdateCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        timeoutMs: 100
      })
    }
    const report = await runBackupUpdate(state.input, run, () => source.sql)
    assert.equal(report.status, 'failed')
    assert.equal(report.errorCode, 'BACKUP_COMMAND_TIMEOUT')
    assert.equal(report.errorStage, '校对结构文件 schema.sql')
    assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
    assert.equal(report.backupPath, state.root)
    assert.doesNotMatch(JSON.stringify(report), /fixture-only/)
  }
)

for (const writePartial of [false, true]) {
  test(
    `schema export rejects ${writePartial ? 'partial' : 'missing'} output`,
    options,
    async (t) => {
      const state = await fixture(t)
      const source = sourceWithSchemaChanges(t, false)
      const run: UpdateCommand = async (command, args, invocation) => {
        if (command !== 'supabase' || !args.includes('dump'))
          return state.run(command, args, invocation)
        if (writePartial)
          await writeFile(
            args[args.indexOf('--file') + 1],
            '-- incomplete schema\nCREATE TABLE fixture (id int);\n'
          )
        return { code: 0, stdout: '', stderr: '' }
      }
      const report = await runBackupUpdate(state.input, run, () => source.sql)
      assert.equal(report.status, 'failed')
      assert.equal(report.errorCode, 'BACKUP_DUMP_INCOMPLETE')
      assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
      assert.equal(report.backupPath, state.root)
      assert.doesNotMatch(JSON.stringify(report), /fixture-only/)
    }
  )
}

for (const recover of [true, false]) {
  test(
    `schema export ${recover ? 'recovers from one' : 'stops after two'} connection failure${recover ? '' : 's'}`,
    options,
    async (t) => {
      const state = await fixture(t)
      const source = sourceWithSchemaChanges(t, false)
      let attempts = 0
      const complete =
        '-- fixture schema\nCREATE SCHEMA IF NOT EXISTS fixture_update;\n-- PostgreSQL database dump complete\n'
      const run: UpdateCommand = async (command, args, invocation) => {
        if (command !== 'supabase' || !args.includes('dump'))
          return state.run(command, args, invocation)
        attempts++
        assert.equal(invocation?.timeoutMs, 45 * 60_000)
        const destination = args[args.indexOf('--file') + 1]
        if (attempts === 1) {
          await writeFile(destination, '-- abandoned partial export\n')
          return { code: 1, stdout: '', stderr: 'connection to server timed out secret=private' }
        }
        assert.equal(await exists(destination), false, 'retry must clear the first partial output')
        if (recover) {
          await writeFile(destination, complete)
          return { code: 0, stdout: '', stderr: '' }
        }
        return { code: 1, stdout: '', stderr: 'connection to server timed out secret=private' }
      }
      const report = await runBackupUpdate(state.input, run, () => source.sql)
      assert.equal(attempts, 2)
      assert.doesNotMatch(JSON.stringify(report), /secret=private|fixture-only/)
      if (recover) {
        state.caches.add(cachePath(report.backupPath))
        assert.equal(report.status, 'updated', report.error || '')
        assert.equal(
          await readFile(path.join(report.backupPath, 'database/schema.sql'), 'utf8'),
          complete
        )
        assert.ok(report.historyPath)
        assert.equal(await fileHash(path.join(report.historyPath, 'manifest.json')), state.hash)
      } else {
        assert.equal(report.status, 'failed')
        assert.equal(report.errorCode, 'BACKUP_DUMP_CONNECTION_FAILED')
        assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
        assert.equal(report.backupPath, state.root)
      }
    }
  )
}

test('complete schema export updates a verified snapshot', options, async (t) => {
  const state = await fixture(t)
  const source = sourceWithSchemaChanges(t, false)
  const complete =
    '-- fixture schema\nCREATE SCHEMA IF NOT EXISTS fixture_update;\n-- PostgreSQL database dump complete\n'
  const run: UpdateCommand = async (command, args, invocation) => {
    if (command !== 'supabase' || !args.includes('dump'))
      return state.run(command, args, invocation)
    await writeFile(args[args.indexOf('--file') + 1], complete)
    return { code: 0, stdout: '', stderr: '' }
  }
  const report = await runBackupUpdate(state.input, run, () => source.sql)
  state.caches.add(cachePath(report.backupPath))
  assert.equal(report.status, 'updated', report.error || '')
  assert.equal(
    await readFile(path.join(report.backupPath, 'database/schema.sql'), 'utf8'),
    complete
  )
  assert.ok(report.historyPath)
  assert.equal(await fileHash(path.join(report.historyPath, 'manifest.json')), state.hash)
  assert.doesNotMatch(JSON.stringify(report), /fixture-only/)
})

test(
  'apply with no remote changes still refreshes the directory and preserves its data',
  options,
  async (t) => {
    const state = await fixture(t)
    const sql = unchangedSource(t)
    const report = await runBackupUpdate(state.input, state.run, () => sql)
    state.caches.add(cachePath(report.backupPath))
    assert.equal(report.status, 'unchanged', report.error || '')
    assert.notEqual(report.backupPath, state.root)
    assert.equal(path.dirname(report.backupPath), state.parent)
    assert.match(path.basename(report.backupPath), /^\d{8}-\d{6}(?:-\d+)?$/)
    assert.equal(await exists(state.root), false)
    assert.equal(await fileHash(path.join(report.backupPath, 'manifest.json')), state.hash)
    assert.equal(
      await readFile(path.join(report.backupPath, 'database/data.sql'), 'utf8'),
      dump('public')
    )
    assert.match(
      await readFile(path.join(report.backupPath, 'README.md'), 'utf8'),
      new RegExp(path.basename(report.backupPath))
    )
    assert.deepEqual(
      await readJson(path.join(cachePath(report.backupPath), 'index.json')),
      await readJson(path.join(cachePath(state.root), 'index.json'))
    )
    assert.equal(state.input.DbPassword, '')
  }
)

test('preview of an unchanged backup retains the original directory', options, async (t) => {
  const state = await fixture(t)
  const sql = unchangedSource(t)
  const report = await runBackupUpdate(
    { ...state.input, PlanOnly: true, ApplyUpdate: false },
    state.run,
    () => sql
  )
  assert.equal(report.mode, 'preview')
  assert.equal(report.status, 'unchanged', report.error || '')
  assert.equal(report.backupPath, state.root)
  assert.deepEqual(await readdir(state.parent), [path.basename(state.root)])
  assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
})

test(
  'recovery without a pending commit retains its directory and never connects remotely',
  options,
  async (t) => {
    const state = await fixture(t)
    const report = await runBackupUpdate(
      { ...state.input, RecoverUpdate: true, DbPassword: '' },
      state.run,
      () => assert.fail('recovery must not create a database connection')
    )
    assert.equal(report.status, 'unchanged', report.error || '')
    assert.equal(report.backupPath, state.root)
    assert.deepEqual(await readdir(state.parent), [path.basename(state.root)])
    assert.deepEqual(state.commands, [])
  }
)

test(
  'a source connection failure retains the original directory and manifest',
  options,
  async (t) => {
    const state = await fixture(t)
    const report = await runBackupUpdate(state.input, state.run, () => {
      throw new Error('fixture source connection unavailable')
    })
    assert.equal(report.status, 'failed')
    assert.equal(report.backupPath, state.root)
    assert.ok(report.error)
    assert.doesNotMatch(report.error, /fixture source connection unavailable/)
    assert.deepEqual(await readdir(state.parent), [path.basename(state.root)])
    assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
    assert.equal(state.input.DbPassword, '')
  }
)

test(
  'an async connection retry is awaited and a failed snapshot is never replayed',
  options,
  async (t) => {
    const state = await fixture(t)
    const sql = unchangedSource(t)
    const failure = Object.assign(new Error('private connection details'), {
      code: 'CONNECT_TIMEOUT'
    })
    const begin = t.mock.method(sql, 'begin', async () => {
      throw failure
    })
    const end = t.mock.method(sql, 'end', async () => {})
    let connections = 0
    const report = await runBackupUpdate(
      state.input,
      state.run,
      async (_connection, _password, onRetry) => {
        connections++
        onRetry?.(2, 3, 'CONNECT_TIMEOUT')
        await Promise.resolve()
        return sql
      }
    )
    assert.equal(connections, 1)
    assert.equal(begin.mock.callCount(), 1)
    assert.equal(end.mock.callCount(), 1)
    assert.equal(report.status, 'failed')
    assert.equal(report.errorCode, 'CONNECT_TIMEOUT')
    assert.equal(report.errorStage, '建立来源只读快照')
    assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
    assert.deepEqual(await readdir(state.parent), [path.basename(state.root)])
    assert.doesNotMatch(JSON.stringify(report), /private connection details|fixture-only/)
    assert.equal(state.input.DbPassword, '')
  }
)

test(
  'a silent catalog read expires without replaying work or changing the backup',
  options,
  async (t) => {
    const state = await fixture(t)
    const sql = unchangedSource(t)
    const originalQuery = sql.unsafe
    let reading!: () => void
    const started = new Promise<void>((resolve) => {
      reading = resolve
    })
    let rejectLate!: (cause: Error) => void
    t.mock.method(
      sql,
      'unsafe',
      (query: string, parameters: Parameters<typeof sql.unsafe>[1] = []) => {
        if (!query.includes('with ns as')) return originalQuery(query, parameters)
        reading()
        return new Promise<never>((_resolve, reject) => {
          rejectLate = reject
        })
      }
    )
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const pending = runBackupUpdate(state.input, state.run, () => sql)
    await started
    t.mock.timers.tick(150_000)
    const report = await pending
    assert.equal(report.status, 'failed')
    assert.equal(report.errorCode, 'BACKUP_SOURCE_READ_TIMEOUT')
    assert.equal(report.errorStage, '读取来源结构与策略指纹')
    assert.match(report.error || '', /读取.*超时/)
    assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
    assert.deepEqual(await readdir(state.parent), [path.basename(state.root)])
    assert.deepEqual(state.commands, ['powershell.exe', 'supabase'])
    assert.equal(state.input.DbPassword, '')
    rejectLate(new Error('late private transport failure'))
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
)

test(
  'a missing transaction completion acknowledgement cannot rename the backup',
  options,
  async (t) => {
    const state = await fixture(t)
    const sql = unchangedSource(t)
    let completed!: () => void
    const callbackDone = new Promise<void>((resolve) => {
      completed = resolve
    })
    const begin = t.mock.method(
      sql,
      'begin',
      async (
        _mode: string,
        callback: (transaction: ReturnType<typeof postgres>) => Promise<void>
      ) => {
        await callback(sql)
        completed()
        return new Promise<never>(() => {})
      }
    )
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const pending = runBackupUpdate(state.input, state.run, () => sql)
    await callbackDone
    await new Promise<void>((resolve) => setImmediate(resolve))
    t.mock.timers.tick(30_000)
    const report = await pending
    assert.equal(report.status, 'failed')
    assert.equal(report.errorCode, 'BACKUP_SOURCE_READ_TIMEOUT')
    assert.equal(begin.mock.callCount(), 1)
    assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
    assert.deepEqual(await readdir(state.parent), [path.basename(state.root)])
    assert.equal(state.input.DbPassword, '')
  }
)

test(
  'unsupported local baseline fails before a source connection and reports safe diagnostics',
  options,
  async (t) => {
    const state = await fixture(t)
    await writeFile(
      path.join(state.root, 'database/data.sql'),
      `${dump('public')}DELETE FROM public.fixture;\n`
    )
    const report = await runBackupUpdate(state.input, state.run, () =>
      assert.fail('invalid local data must not open a remote connection')
    )
    assert.equal(report.status, 'failed')
    assert.equal(report.errorCode, 'BACKUP_COPY_FORMAT')
    assert.equal(report.errorStage, '读取本地 data.sql 比较基线')
    assert.match(report.error || '', /本地备份数据格式/)
    assert.doesNotMatch(JSON.stringify(report), /DELETE FROM|fixture-only|Unsupported non-COPY/)
    assert.deepEqual(state.commands, ['powershell.exe'])
    assert.equal(await fileHash(path.join(state.root, 'manifest.json')), state.hash)
    assert.equal(isBackupUpdateReport(report), true)
    assert.equal(isBackupUpdateReport({ ...report, errorCode: 'password=private' }), false)
    assert.equal(isBackupUpdateReport({ ...report, errorStage: {} }), false)
    assert.equal(state.input.DbPassword, '')
  }
)
