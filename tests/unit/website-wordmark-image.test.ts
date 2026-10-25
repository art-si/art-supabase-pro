import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  createWordmarkMaskPixels,
  findOpaqueBounds,
  fitWordmarkBounds,
  normalizeWordmarkText,
  WORDMARK_IMAGE_HEIGHT,
  WORDMARK_IMAGE_WIDTH
} from '../../src/views/system/website-config/modules/wordmark-image'

test('keeps provider transparency when normalizing the wordmark mask', () => {
  const pixels = new Uint8ClampedArray([12, 34, 56, 0, 12, 34, 56, 180])
  const mask = createWordmarkMaskPixels(pixels, 2, 1)
  assert.deepEqual([...mask], [255, 255, 255, 0, 255, 255, 255, 180])
})

test('extracts a light wordmark from an opaque dark provider image', () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255])
  const mask = createWordmarkMaskPixels(pixels, 3, 1)
  assert.equal(mask[3], 0)
  assert.equal(mask[7], 255)
  assert.equal(mask[11], 0)
})

test('finds the non-transparent wordmark bounds', () => {
  const pixels = new Uint8ClampedArray(6 * 4 * 4)
  for (let y = 1; y <= 2; y += 1) {
    for (let x = 2; x <= 4; x += 1) pixels[(y * 6 + x) * 4 + 3] = 255
  }

  assert.deepEqual(findOpaqueBounds(pixels, 6, 4), { x: 2, y: 1, width: 3, height: 2 })
})

test('returns null when the generated image is fully transparent', () => {
  assert.equal(findOpaqueBounds(new Uint8ClampedArray(4 * 4 * 4), 4, 4), null)
})

test('fits a wide wordmark into the historical 1008 by 240 canvas', () => {
  const placement = fitWordmarkBounds({ width: 1200, height: 240 })
  assert.equal(placement.width <= WORDMARK_IMAGE_WIDTH, true)
  assert.equal(placement.height <= WORDMARK_IMAGE_HEIGHT, true)
  assert.equal(placement.x >= 0, true)
  assert.equal(placement.y >= 0, true)
  assert.equal(placement.width, 936)
  assert.equal(placement.height, 187)
})

test('preserves the exact configured Chinese system name', () => {
  assert.equal(normalizeWordmarkText('  应用中台  '), '应用中台')
  assert.equal(normalizeWordmarkText('中科院  信息'), '中科院 信息')
})

test('generates both menu colorways from one AI request', () => {
  const component = readFileSync(
    'src/views/system/website-config/modules/website-wordmark-settings.vue',
    'utf8'
  )
  const imageModule = readFileSync(
    'src/views/system/website-config/modules/wordmark-image.ts',
    'utf8'
  )
  const logoComponent = readFileSync('src/components/core/base/art-logo/index.vue', 'utf8')
  assert.equal(component.match(/AI 艺术字生成/g)?.length, 1)
  assert.match(component, /generateWebsiteWordmark\(\{ siteName \}\)/)
  assert.match(component, /createGeneratedWordmarkFiles\(generated, siteName\)/)
  assert.match(imageModule, /createExactWordmarkMask\(siteName\)/)
  assert.match(logoComponent, /logoSize\.value} \* 3\.02/)
  assert.match(logoComponent, /logoSize\.value} \* 0\.72/)
  assert.match(imageModule, /light: new File/)
  assert.match(imageModule, /dark: new File/)
})
