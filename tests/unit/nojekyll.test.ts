import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { build } from 'vite'
import { createNoJekyllPlugin } from '../../src/plugins/nojekyll'

test('emits .nojekyll through Vite into the resolved output directory', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nojekyll-output-'))
  context.after(() => rm(root, { recursive: true, force: true }))
  await build({
    configFile: false,
    root,
    logLevel: 'silent',
    plugins: [
      createNoJekyllPlugin(),
      {
        name: 'test-entry',
        resolveId: (id) => (id === 'test-entry' ? '\0test-entry' : null),
        load: (id) => (id === '\0test-entry' ? 'export const value = 1' : null)
      }
    ],
    build: { outDir: 'isolated-output', rolldownOptions: { input: 'test-entry' } }
  })
  assert.equal(await readFile(path.join(root, 'isolated-output', '.nojekyll'), 'utf8'), '')
})
