import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

test('standalone modules build and serve platform public assets and the canonical favicon', () => {
  const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
  const artifactRoot = resolve(projectRoot, '.artifacts')
  mkdirSync(artifactRoot, { recursive: true })
  const fixtureRoot = mkdtempSync(join(artifactRoot, 'module-public-assets-'))
  try {
    writeFileSync(
      join(fixtureRoot, 'index.html'),
      '<!doctype html><html><head><link rel="icon" href="@/assets/images/favicon.ico" /></head><body>资源验收</body></html>'
    )
    const factoryUrl = pathToFileURL(join(projectRoot, 'scripts/module-vite-config.mjs')).href
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
          import assert from 'node:assert/strict'
          import { readFile, readdir } from 'node:fs/promises'
          import path from 'node:path'
          import { build, createServer } from 'vite'
          const { createModuleViteConfig } = await import(${JSON.stringify(factoryUrl)})
          console.info('Module configuration factory loaded')
          const root = ${JSON.stringify(fixtureRoot)}
          const platformRoot = ${JSON.stringify(projectRoot)}
          const config = await createModuleViteConfig({
            appCode: 'smis', applicationRoot: root, defaultPort: 0,
            mode: 'test', platformRoot
          })
          assert.equal(config.publicDir, path.join(platformRoot, 'public'))
          console.info('Module configuration created')
          await build({
            ...config, root, configFile: false, logLevel: 'silent',
            build: { ...config.build, outDir: path.join(root, 'dist') }
          })
          console.info('Module public assets built')
          const builtAssets = await readdir(path.join(root, 'dist/assets'))
          const faviconAsset = builtAssets.find((asset) => /^favicon-.*[.]ico$/.test(asset))
          assert.ok(faviconAsset, '站点图标必须由平台素材打包，不能保留未解析的别名')
          const faviconBytes = await readFile(path.join(platformRoot, 'src/assets/images/favicon.ico'))
          assert.deepEqual(await readFile(path.join(root, 'dist/assets', faviconAsset)), faviconBytes)
          const builtHtml = await readFile(path.join(root, 'dist/index.html'), 'utf8')
          assert.ok(builtHtml.includes(faviconAsset))
          assert.ok(!builtHtml.includes('@/assets/images/favicon.ico'))
          for (const asset of [
            'data/pca-code.json',
            'fonts/HarmonyOS-Sans-LICENSE.txt'
          ]) {
            assert.deepEqual(
              await readFile(path.join(root, 'dist', asset)),
              await readFile(path.join(platformRoot, 'public', asset))
            )
          }
          const server = await createServer({
            ...config, root, configFile: false, logLevel: 'silent',
            plugins: config.plugins.filter((plugin) => plugin?.name === 'module-platform-favicon'),
            optimizeDeps: { noDiscovery: true, include: [] },
            server: { ...config.server, host: '127.0.0.1', port: 0, watch: null, hmr: false }
          })
          try {
            await server.listen()
            console.info('Module public server started')
            const url = server.resolvedUrls?.local[0]
            assert.ok(url, '未启动模块资源服务器')
            const response = await fetch(new URL('data/pca-code.json', url))
            assert.equal(response.status, 200)
            assert.deepEqual(
              Buffer.from(await response.arrayBuffer()),
              await readFile(path.join(platformRoot, 'public/data/pca-code.json'))
            )
            const htmlResponse = await fetch(url)
            const servedHtml = await htmlResponse.text()
            const faviconHref = servedHtml.match(/rel="icon"[^>]*href="([^"]+)"/)?.[1]
            assert.ok(faviconHref)
            const faviconResponse = await fetch(new URL(faviconHref, url))
            assert.equal(faviconResponse.status, 200)
            assert.ok(faviconResponse.headers.get('content-type')?.startsWith('image/'))
            assert.deepEqual(Buffer.from(await faviconResponse.arrayBuffer()), faviconBytes)
          } finally {
            await server.close()
          }
          console.info('Shared module public assets verified')
        `
      ],
      { cwd: projectRoot, encoding: 'utf8', timeout: 60_000 }
    )
    assert.ifError(
      result.error && new Error(`${result.error.message}\n${result.stdout}\n${result.stderr}`)
    )
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /Shared module public assets verified/)
  } finally {
    assert.equal(dirname(resolve(fixtureRoot)), artifactRoot)
    assert.ok(fixtureRoot.startsWith(join(artifactRoot, 'module-public-assets-')))
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
