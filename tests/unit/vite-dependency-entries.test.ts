import assert from 'node:assert/strict'
import { globSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { resolveConfig } from 'vite'
import createHostConfig from '../../vite.config'
import { createModuleViteConfig } from '../../scripts/module-vite-config.mjs'

test('dependency discovery includes the application entry and excludes generated HTML', async () => {
  const config = await resolveConfig(
    { ...(await createHostConfig({ mode: 'e2e' })), configFile: false, mode: 'e2e' },
    'serve'
  )
  const configured = config.environments.client.optimizeDeps.entries
  assert.ok(configured, 'Dependency discovery must use explicit application entries')
  const entries = typeof configured === 'string' ? [configured] : configured
  assert.ok(entries.length > 0, 'The application dependency entries must not be empty')
  const root = fileURLToPath(new URL('../..', import.meta.url))
  const discovered = globSync(entries, { cwd: root }).map((entry) => entry.replaceAll('\\', '/'))
  assert.ok(discovered.includes('index.html'))
  assert.ok(
    discovered.every((entry) => !/(^|\/)(\.artifacts|docs|dist|node_modules)\//.test(entry)),
    'Generated previews and deployment HTML must not become dependency entries'
  )
})

test('host and standalone apps prebundle the lazy virtual-table dependency', async () => {
  const host = await createHostConfig({ mode: 'e2e' })
  const root = fileURLToPath(new URL('../..', import.meta.url))
  const standalone = await createModuleViteConfig({
    appCode: 'mes',
    applicationRoot: `${root}/modules/art-supabase-mes`,
    defaultPort: 0,
    mode: 'e2e',
    platformRoot: root
  })
  for (const config of [host, standalone]) {
    assert.ok(
      config.optimizeDeps?.include?.includes('element-plus/es/components/table-v2/index.mjs')
    )
  }
})

test("dev servers on different hosts or ports cannot overwrite each other's optimized dependencies", async () => {
  const host = await createHostConfig({ mode: 'e2e' })
  const cacheDirs: string[] = []
  for (const server of [
    { host: true, port: 3006 },
    { host: '127.0.0.1', port: 3006 },
    { host: '127.0.0.1', port: 41738 }
  ]) {
    const resolved = await resolveConfig(
      { ...host, configFile: false, mode: 'e2e', server },
      'serve'
    )
    cacheDirs.push(resolved.cacheDir)
  }
  assert.equal(new Set(cacheDirs).size, 3)
  assert.ok(cacheDirs.every((directory) => directory.includes('node_modules/.vite/e2e-')))
})
