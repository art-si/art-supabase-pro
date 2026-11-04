import assert from 'node:assert/strict'
import test from 'node:test'
import { runUpdateCommand } from '../../scripts/lib/backup-update-io'

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
