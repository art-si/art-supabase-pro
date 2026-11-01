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
    'metadata/functions.json': '[]',
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
  const run: UpdateCommand = async (command, args) => {
    commands.push(command)
    if (command === 'powershell.exe' && args.includes('-VerifyBackupOnly')) {
      const destination = args[args.indexOf('-VerificationReportPath') + 1]
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
    throw new Error('Unexpected source query in isolated backup update test')
  })
  t.mock.method(
    sql,
    'begin',
    async (mode: string, callback: (transaction: ReturnType<typeof postgres>) => Promise<void>) => {
      assert.match(mode, /read only/)
      await callback(sql)
    }
  )
  return sql
}

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
