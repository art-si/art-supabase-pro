import assert from 'node:assert/strict'
import path from 'node:path'
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
  })
}
