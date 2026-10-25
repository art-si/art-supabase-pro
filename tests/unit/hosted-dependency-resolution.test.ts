import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createServer } from 'vite'
import { createModuleViteConfig } from '../../scripts/module-vite-config.mjs'

const projectRoot = process.cwd()
const moduleImporters = {
  mdm: 'production/work-center/modules/qr-dialog.vue',
  mes: 'components/manufacturing/modules/work-order-qr-label-sheet.vue',
  smis: 'equipment-ledger/equipment-ledger/index.vue',
  tms: 'modules/waybill-print.ts'
}

test('integrated QR and HTML sanitization callers resolve one host dependency', async () => {
  const server = await createServer({
    mode: 'e2e',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { watch: null, hmr: false }
  })
  try {
    const resolver = server.environments.client.pluginContainer
    for (const dependency of ['qrcode.vue', 'dompurify']) {
      const canonical = await resolver.resolveId(dependency, path.join(projectRoot, 'src/App.vue'))
      assert.ok(canonical)
      for (const [code, importer] of Object.entries(moduleImporters)) {
        const resolved = await resolver.resolveId(
          dependency,
          path.join(projectRoot, `modules/art-supabase-${code}/src/views`, importer)
        )
        assert.equal(resolved?.id, canonical.id, `${dependency} in ${code}`)
      }
    }
  } finally {
    await server.close()
  }
})

test('standalone modules share installed peers and preserve platform-relative dependencies', async () => {
  for (const code of ['mdm', 'smis'] as const) {
    const applicationRoot = path.join(projectRoot, `modules/art-supabase-${code}`)
    const config = await createModuleViteConfig({
      appCode: code,
      applicationRoot,
      defaultPort: 0,
      mode: 'e2e',
      platformRoot: projectRoot
    })
    const server = await createServer({
      ...config,
      root: applicationRoot,
      configFile: false,
      logLevel: 'silent',
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { ...config.server, watch: null, hmr: false }
    })
    try {
      const resolver = server.environments.client.pluginContainer
      const platformImporter = path.join(projectRoot, 'src/App.vue')
      const moduleImporter = path.join(applicationRoot, 'src/views', moduleImporters[code])
      const localQr = await resolver.resolveId('qrcode.vue', moduleImporter)
      const platformQr = await resolver.resolveId('qrcode.vue', platformImporter)
      assert.ok(localQr)
      assert.equal(platformQr?.id, localQr.id, code)
      const sanitizer = await resolver.resolveId('dompurify', platformImporter)
      assert.ok(sanitizer, `platform sanitizer resolves in ${code}`)
      if (code === 'smis') {
        const localSanitizer = await resolver.resolveId('dompurify', moduleImporter)
        assert.equal(localSanitizer?.id, sanitizer.id)
      } else {
        assert.equal(config.resolve?.dedupe?.includes('dompurify'), false)
      }
    } finally {
      await server.close()
    }
  }
})
