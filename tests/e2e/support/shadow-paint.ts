import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

export interface PaintRect {
  x: number
  y: number
  width: number
  height: number
}

const nodeRequire = createRequire(import.meta.url)
const testRequire = createRequire(nodeRequire.resolve('@playwright/test'))
const playwrightRequire = createRequire(testRequire.resolve('playwright'))
const { PNG } = nodeRequire(
  join(dirname(playwrightRequire.resolve('playwright-core')), 'lib/utilsBundle.js')
) as {
  PNG: { sync: { read: (buffer: Buffer) => { width: number; height: number; data: Uint8Array } } }
}

export function shadowPaintRegion(rects: readonly PaintRect[]): PaintRect {
  if (
    !rects.length ||
    rects.some(
      (rect) => !Object.values(rect).every(Number.isInteger) || rect.width <= 0 || rect.height <= 0
    )
  )
    throw new Error('Shadow samples require positive integer pixel rectangles')
  const x = Math.min(...rects.map((rect) => rect.x))
  const y = Math.min(...rects.map((rect) => rect.y))
  return {
    x,
    y,
    width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x,
    height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y
  }
}

export function compareShadowPaint(
  first: Buffer,
  second: Buffer,
  region: PaintRect,
  samples: readonly PaintRect[]
) {
  shadowPaintRegion([region])
  const a = PNG.sync.read(first)
  const b = PNG.sync.read(second)
  if ([a, b].some((image) => image.width !== region.width || image.height !== region.height))
    throw new Error('Shadow screenshots must match the CSS pixel capture region')
  shadowPaintRegion(samples)
  if (
    samples.some(
      (sample) =>
        sample.x < region.x ||
        sample.y < region.y ||
        sample.x + sample.width > region.x + region.width ||
        sample.y + sample.height > region.y + region.height
    )
  )
    throw new Error('Shadow samples must stay inside the capture region')
  let samplePixels = 0
  let changedPixels = 0
  let maxChannelDelta = 0
  for (const sample of samples) {
    for (let y = 0; y < sample.height; y++) {
      for (let x = 0; x < sample.width; x++) {
        const index = ((sample.y - region.y + y) * a.width + sample.x - region.x + x) * 4
        let delta = 0
        for (let channel = 0; channel < 4; channel++)
          delta = Math.max(delta, Math.abs(a.data[index + channel] - b.data[index + channel]))
        samplePixels++
        if (delta > 1) changedPixels++
        maxChannelDelta = Math.max(maxChannelDelta, delta)
      }
    }
  }
  return { samplePixels, changedPixels, maxChannelDelta }
}
