import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { createModuleViteConfig } from '../../scripts/module-vite-config.mjs'

const platformRoot = path.resolve(import.meta.dirname, '../..')

for (const appCode of ['tms', 'vms']) {
  test(`${appCode} standalone Vite defines the Supabase build mode`, async () => {
    const config = await createModuleViteConfig({
      appCode,
      applicationRoot: path.join(platformRoot, 'modules', `art-supabase-${appCode}`),
      defaultPort: 3016,
      mode: 'development',
      platformRoot
    })
    assert.equal(config.define.__CLOUDBASE_BUILD__, 'false')
    assert.equal(config.define['import.meta.env.VITE_AUTH_SESSION_MODE'], '"client"')
  })
}

test('server-session consumers own their environment and never expose server credentials', async () => {
  const artifactRoot = path.join(platformRoot, '.artifacts')
  mkdirSync(artifactRoot, { recursive: true })
  const applicationRoot = mkdtempSync(path.join(artifactRoot, 'consumer-config-'))
  try {
    writeFileSync(path.join(applicationRoot, 'package.json'), '{"type":"module"}')
    writeFileSync(
      path.join(applicationRoot, '.env.test'),
      'BFF_SUPABASE_SERVICE_KEY=private-test-marker\nVITE_CONSUMER_LABEL=consumer\n'
    )
    const options = {
      appCode: 'bff',
      applicationRoot,
      defaultPort: 3010,
      mode: 'test',
      platformRoot,
      inheritPlatformEnv: false,
      authSessionMode: 'server'
    }
    const config = await createModuleViteConfig(options)
    assert.equal(config.define['import.meta.env.VITE_AUTH_SESSION_MODE'], '"server"')
    assert.equal(config.define['import.meta.env.VITE_CONSUMER_LABEL'], '"consumer"')
    assert.equal(config.define['import.meta.env.VITE_SUPABASE_URL'], undefined)
    assert.equal(config.define['import.meta.env.BFF_SUPABASE_SERVICE_KEY'], undefined)
    assert.ok(!JSON.stringify(config.define).includes('private-test-marker'))
    assert.equal(config.resolve.alias['@'], path.join(platformRoot, 'src'))
    assert.equal(config.resolve.alias['@bff'], path.join(applicationRoot, 'src'))
    assert.ok(config.optimizeDeps.exclude.includes('@'))
    assert.ok(config.optimizeDeps.exclude.includes('@bff'))
    const anotherPort = await createModuleViteConfig({ ...options, defaultPort: 3020 })
    assert.notEqual(config.cacheDir, anotherPort.cacheDir)
  } finally {
    assert.equal(path.dirname(realpathSync(applicationRoot)), realpathSync(artifactRoot))
    assert.ok(path.basename(applicationRoot).startsWith('consumer-config-'))
    rmSync(applicationRoot, { recursive: true })
  }
})
