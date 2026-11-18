import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, rmdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { dumpBackupComponent, exists, runUpdateCommand } from '../../scripts/lib/backup-update-io'

test('update command returns a successful child process result', async () => {
  const result = await runUpdateCommand(process.execPath, ['-e', 'process.stdout.write("ready")'])
  assert.equal(result.code, 0)
  assert.equal(result.stdout, 'ready')
  assert.equal(result.stderr, '')
})

test('update command timeout has a stable diagnostic code', async () => {
  await assert.rejects(
    runUpdateCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      timeoutMs: 100
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal('code' in error && error.code, 'BACKUP_COMMAND_TIMEOUT')
      assert.match(error.message, /当前步骤等待超时/)
      return true
    }
  )
})

test('update command launch failure retains its cause and stable diagnostic code', async () => {
  await assert.rejects(
    runUpdateCommand('missing-backup-command-for-test-927ffb4e', []),
    (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal('code' in error && error.code, 'BACKUP_COMMAND_START_FAILED')
      assert.ok(error.cause instanceof Error)
      assert.match(error.message, /无法启动本机更新步骤/)
      return true
    }
  )
})

test('schema export recovers from one connection failure', { timeout: 30_000 }, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'backup-schema-retry-'))
  const target = path.join(directory, 'schema.sql')
  t.after(async () => {
    await rm(target, { force: true })
    await rmdir(directory)
  })
  const complete = '-- fixture schema\n-- PostgreSQL database dump complete\n'
  const stages: string[] = []
  let attempts = 0

  await dumpBackupComponent(
    'schema.sql',
    target,
    'fixture-only',
    async (command, args, options) => {
      assert.equal(command, 'supabase')
      assert.deepEqual(args, ['db', 'dump', '--linked', '--keep-comments', '--file', target])
      assert.equal(options?.timeoutMs, 45 * 60_000)
      if (++attempts === 1) {
        await writeFile(target, '-- abandoned partial export\n')
        return { code: 1, stdout: '', stderr: 'connection to server timed out secret=private' }
      }
      assert.equal(await exists(target), false, 'retry must clear the first partial output')
      await writeFile(target, complete)
      return { code: 0, stdout: '', stderr: '' }
    },
    (stage) => stages.push(stage)
  )

  assert.equal(attempts, 2)
  assert.equal(await readFile(target, 'utf8'), complete)
  assert.deepEqual(stages, [
    '校对结构文件 schema.sql',
    '结构文件 schema.sql 连接中断，清理暂存文件后重试'
  ])
})
