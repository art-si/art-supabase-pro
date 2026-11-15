import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import codepages, {
  decodeRtfCodepages,
  loadRtfCodepages,
  packRtfCodepages
} from '../../scripts/file-viewer-rtf-codepages'
import { createFileViewerRtfCompactPlugin } from '../../scripts/file-viewer-rtf-compact'

test('RTF build emits every upstream decoding mapping without the original bundle', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const platformRequire = createRequire(path.resolve(root, 'package.json'))
  const presetRequire = createRequire(
    platformRequire.resolve('@file-viewer/preset-all/package.json')
  )
  const manifest = presetRequire.resolve('@file-viewer/capability-rtf/package.json')
  const capabilityRequire = createRequire(manifest)
  const rtfRequire = createRequire(capabilityRequire.resolve('rtf.js/package.json'))
  const input = path.join(path.dirname(manifest), 'dist/index.js')
  const source = rtfRequire('codepage/cptable.js') as Parameters<typeof packRtfCodepages>[0]

  const result = await build({
    configFile: false,
    root,
    base: '/rtf-proof/',
    publicDir: false,
    logLevel: 'silent',
    plugins: [createFileViewerRtfCompactPlugin(root)],
    build: { write: false, rolldownOptions: { input } }
  })

  assert.ok(!Array.isArray(result) && 'output' in result)
  const asset = result.output.find((file) => /rtf-codepages-.*\.bin$/.test(file.fileName))
  assert.ok(asset?.type === 'asset' && asset.source instanceof Uint8Array)
  assert.equal(asset.source.byteLength, 733_578)
  assert.equal(
    createHash('sha256').update(asset.source).digest('hex'),
    '2049aea6cc7dfb91f40c2b07d409deb9e3e9e6bcf81b02340238e0758b1027c8'
  )
  assert.ok(
    result.output.every(
      (file) =>
        file.type !== 'chunk' || !file.moduleIds.some((id) => id.endsWith('/RTFJS.bundle.js'))
    )
  )

  const decoded = decodeRtfCodepages(new Uint8Array(asset.source).buffer)
  const expected = Object.fromEntries(
    Object.entries(source).flatMap(([id, table]) =>
      typeof table === 'string' || !table.dec ? [] : [[id, { dec: table.dec }]]
    )
  )
  assert.deepEqual(decoded, expected)
})

test('a failed decoding table request can be retried and concurrent callers share the retry', async (context) => {
  const table = packRtfCodepages({ 1252: { dec: ['\0', 'é'] } })
  let requests = 0
  const responses = [new Response(null, { status: 404 }), new Response(), new Response(table)]
  context.mock.method(globalThis, 'fetch', async () => {
    return responses[requests++]
  })

  await assert.rejects(loadRtfCodepages('/rtf.bin', table.byteLength), /404/)
  await assert.rejects(loadRtfCodepages('/rtf.bin', table.byteLength), /Invalid RTF codepage data/)
  const retry = loadRtfCodepages('/rtf.bin', table.byteLength)
  assert.equal(loadRtfCodepages('/rtf.bin', table.byteLength), retry)
  await retry
  assert.equal(requests, 3)
  assert.deepEqual(codepages[1252].dec, ['\0', 'é'])
})
