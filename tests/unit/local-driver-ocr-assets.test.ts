import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

const root = process.cwd()
const core = 'node_modules/.pnpm/tesseract.js-core@7.0.0/node_modules/tesseract.js-core'
const assets: Array<[string, string]> = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'public/ocr/driver/worker.min.js'],
  [join(core, 'tesseract-core-lstm.wasm.js'), 'public/ocr/driver/core/tesseract-core-lstm.wasm.js'],
  [
    join(core, 'tesseract-core-simd-lstm.wasm.js'),
    'public/ocr/driver/core/tesseract-core-simd-lstm.wasm.js'
  ],
  [
    join(core, 'tesseract-core-relaxedsimd-lstm.wasm.js'),
    'public/ocr/driver/core/tesseract-core-relaxedsimd-lstm.wasm.js'
  ],
  [
    'node_modules/@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz',
    'public/ocr/driver/langs/chi_sim.traineddata.gz'
  ]
]

test('self-hosted driver OCR assets match pinned dependency bytes', async () => {
  for (const [dependencyPath, publicPath] of assets) {
    const [dependency, deployed] = await Promise.all([
      readFile(join(root, dependencyPath)),
      readFile(join(root, publicPath))
    ])
    const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
    assert.equal(hash(deployed), hash(dependency), publicPath)
  }
})
