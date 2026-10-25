import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { REDUNDANT_FILE_VIEWER_ASSETS } from '../../scripts/file-viewer-asset-sync'

test('installed CAD renderer uses versioned assets before legacy copies are pruned', async () => {
  const require = createRequire(import.meta.url)
  const viewerRequire = createRequire(require.resolve('@file-viewer/vue3'))
  const assets = await import(pathToFileURL(viewerRequire.resolve('@file-viewer/core/assets')).href)
  const urls = assets.resolveFileViewerCadAssetUrls({}, 'https://preview.example.invalid/app/')
  const version = assets.DEFAULT_FILE_VIEWER_CAD_RUNTIME_VERSION
  assert.equal(typeof version, 'string')
  for (const value of [urls.workerUrl, urls.wasmPath, urls.dwfWasmUrl]) {
    assert.ok(new URL(value).pathname.includes(`/wasm/cad/${version}`))
  }
  for (const file of [
    'dwg-worker.js',
    'libredwg-web.js',
    'libredwg-web.wasm',
    'dwfv-render.wasm'
  ]) {
    assert.ok(REDUNDANT_FILE_VIEWER_ASSETS.some((asset) => asset === `wasm/cad/${file}`))
  }
})
