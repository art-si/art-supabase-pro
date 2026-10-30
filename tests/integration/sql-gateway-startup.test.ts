import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { inspectSqlGateway } from '../../scripts/sql-gateway-process'
import { toObjectRecord } from '../../src/utils/record'
import { createServer as createViteServer } from 'vite'
import { createSqlGatewayPlugin } from '../../scripts/sql-gateway-vite-plugin'

test(
  'SQL gateway survives its launcher, reuses the same daemon, and preserves origin/auth gates',
  { skip: process.env.SQL_GATEWAY_STARTUP_TEST !== '1', timeout: 90000 },
  async () => {
    const reservation = createServer()
    const listening = once(reservation, 'listening')
    reservation.listen(0, '127.0.0.1')
    await listening
    const address = reservation.address()
    assert.ok(address && typeof address === 'object')
    const port = address.port
    const closed = once(reservation, 'close')
    reservation.close()
    await closed
    const directory = mkdtempSync(path.join(tmpdir(), 'art-sql-startup-'))
    const root = path.resolve(import.meta.dirname, '../..')
    const runtimeFile = path.join(root, `.artifacts/sql-gateway/runtime-${port}.json`)
    let pid: number | undefined
    try {
      const launch = () =>
        promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/start-sql-gateway.ts'], {
          cwd: root,
          env: { ...process.env, SQL_GATEWAY_PORT: String(port), SQL_GATEWAY_STATE_DIR: directory },
          windowsHide: true,
          timeout: 45000
        })
      const vite = await createViteServer({
        root,
        configFile: false,
        plugins: [
          createSqlGatewayPlugin(root, {
            SQL_GATEWAY_PORT: String(port),
            SQL_GATEWAY_STATE_DIR: directory
          })
        ],
        server: { port: 0, host: '127.0.0.1', watch: null },
        optimizeDeps: { noDiscovery: true },
        logLevel: 'silent'
      })
      let applicationOrigin = ''
      try {
        await vite.listen()
        applicationOrigin = new URL(vite.resolvedUrls!.local[0]).origin
        const deadline = Date.now() + 40000
        while (!(await inspectSqlGateway(port)) && Date.now() < deadline) await delay(250)
        assert.equal(await inspectSqlGateway(port), true, 'Vite cold-starts the gateway')
      } finally {
        await vite.close()
      }
      const runtime = toObjectRecord(JSON.parse(readFileSync(runtimeFile, 'utf8')))
      assert.equal(typeof runtime.pid, 'number')
      pid = Number(runtime.pid)
      assert.equal(
        await inspectSqlGateway(port),
        true,
        'daemon remains reachable after the project dev server exited'
      )
      assert.equal(
        (
          await fetch(`http://127.0.0.1:${port}/health`, {
            headers: { Origin: applicationOrigin }
          })
        ).status,
        200,
        'the actual Vite origin is allowed'
      )
      const again = await Promise.all([launch(), launch()])
      again.forEach((result) => assert.match(result.stdout, /已在运行/))
      assert.equal(toObjectRecord(JSON.parse(readFileSync(runtimeFile, 'utf8'))).pid, pid)
      assert.equal(
        (
          await fetch(`http://127.0.0.1:${port}/snapshot`, {
            headers: { Origin: 'http://127.0.0.1:3006' }
          })
        ).status,
        401
      )
      assert.equal(
        (
          await fetch(`http://127.0.0.1:${port}/health`, {
            headers: { Origin: 'https://untrusted.invalid' }
          })
        ).status,
        403
      )
    } finally {
      if (pid) {
        try {
          process.kill(pid, 'SIGTERM')
        } catch {
          /* Already exited. */
        }
      }
      for (let attempt = 0; attempt < 20 && (await inspectSqlGateway(port)); attempt++)
        await delay(100)
      assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
      assert.ok(path.basename(directory).startsWith('art-sql-startup-'))
      rmSync(directory, { recursive: true, force: true })
      if (pid) unlinkSync(runtimeFile)
    }
  }
)
