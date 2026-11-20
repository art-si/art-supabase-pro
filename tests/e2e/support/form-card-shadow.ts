import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'
import { compareShadowPaint, shadowPaintRegion } from './shadow-paint'

/** Compare the real form paint with a paint-only, unclipped reference. */
export async function expectFormCardShadow(
  page: Page,
  card: Locator,
  info: TestInfo,
  label: string
): Promise<void> {
  await card.scrollIntoViewIfNeeded()
  const form = card.locator(
    'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " art-form ")][1]'
  )
  await expect(form).toHaveCount(1)
  const settle = async () => {
    const stable = await card.evaluate(async (element) => {
      await document.fonts.ready
      let previous = ''
      let frames = 0
      for (let attempt = 0; attempt < 120 && frames < 6; attempt++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        const bounds = element.getBoundingClientRect()
        const current = JSON.stringify([bounds.x, bounds.y, bounds.width, bounds.height])
        frames = current === previous ? frames + 1 : 0
        previous = current
      }
      return frames
    })
    expect(stable).toBe(6)
  }
  const inspect = () =>
    card.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const ancestors = []
      for (let node = element.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        const bounds = node.getBoundingClientRect()
        const scaleX = node.offsetWidth ? bounds.width / node.offsetWidth : 1
        const scaleY = node.offsetHeight ? bounds.height / node.offsetHeight : 1
        const margin =
          style.overflowX === 'clip' && style.overflowY === 'clip'
            ? Number(style.overflowClipMargin.match(/([\d.]+)px/)?.[1] ?? 0)
            : 0
        const paintContain = /(^|\s)(paint|strict|content)(\s|$)/.test(style.contain)
        const left = bounds.left + node.clientLeft * scaleX - margin * scaleX
        const top = bounds.top + node.clientTop * scaleY - margin * scaleY
        const right = bounds.left + (node.clientLeft + node.clientWidth + margin) * scaleX
        const bottom = bounds.top + (node.clientTop + node.clientHeight + margin) * scaleY
        ancestors.push({
          className: node.className,
          scrollContainer: [style.overflowX, style.overflowY].some((value) =>
            ['hidden', 'auto', 'scroll'].includes(value)
          ),
          clipX: paintContain || ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX),
          clipY: paintContain || ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY),
          leftRoom: rect.left - left,
          rightRoom: right - rect.right,
          top,
          bottom,
          geometry: [
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height,
            node.clientWidth,
            node.clientHeight,
            node.scrollWidth,
            node.scrollHeight,
            node.scrollLeft,
            node.scrollTop
          ]
        })
      }
      const verticalClips = ancestors.filter(({ clipY }) => clipY)
      const top = Math.ceil(
        Math.max(6, rect.top + 24, ...verticalClips.map((node) => node.top + 6))
      )
      const bottom = Math.floor(
        Math.min(innerHeight - 6, rect.bottom - 24, ...verticalClips.map((node) => node.bottom - 6))
      )
      const samples = [
        {
          x: Math.ceil(rect.left - 6),
          y: top,
          width: Math.floor(rect.left) - Math.ceil(rect.left - 6),
          height: bottom - top
        },
        {
          x: Math.ceil(rect.right),
          y: top,
          width: Math.floor(rect.right + 6) - Math.ceil(rect.right),
          height: bottom - top
        }
      ]
      return {
        rect: [rect.x, rect.y, rect.width, rect.height],
        ancestors,
        samples,
        shadow: getComputedStyle(element).boxShadow
      }
    })
  await settle()
  const before = await inspect()
  expect(before.shadow).not.toBe('none')
  const region = shadowPaintRegion(before.samples)
  const capture = () => page.screenshot({ clip: region, scale: 'css', animations: 'disabled' })
  const actual = await capture()
  const repeat = await capture()
  const formStyle = await form.getAttribute('style')
  const cardStyle = await card.getAttribute('style')
  try {
    await form.evaluate((element) => {
      element.style.setProperty('overflow', 'clip', 'important')
      element.style.setProperty('overflow-clip-margin', '40px', 'important')
    })
    await settle()
    const referenceGeometry = await inspect()
    expect(referenceGeometry.rect).toEqual(before.rect)
    expect(referenceGeometry.samples).toEqual(before.samples)
    const layout = (state: typeof before) =>
      state.ancestors.map(({ geometry, scrollContainer }) => [
        ...geometry.slice(0, 6),
        ...geometry.slice(8),
        ...(scrollContainer ? geometry.slice(6, 8) : [])
      ])
    // A visible, non-scrolling ElForm can report its negative gutter as overflow once exposed.
    // Keep actual scrollports and every box/scroll position unchanged in the reference.
    expect(layout(referenceGeometry)).toEqual(layout(before))
    const reference = await capture()
    await card.evaluate((element) => element.style.setProperty('box-shadow', 'none', 'important'))
    await settle()
    expect((await inspect()).rect).toEqual(before.rect)
    const background = await capture()
    const stability = compareShadowPaint(actual, repeat, region, before.samples)
    const paint = compareShadowPaint(actual, reference, region, before.samples)
    const shadow = compareShadowPaint(reference, background, region, before.samples)
    await info.attach(`${label}-proof`, {
      body: JSON.stringify({ before, referenceGeometry, stability, paint, shadow }, null, 2),
      contentType: 'application/json'
    })
    for (const [stage, body] of [
      ['actual', actual],
      ['reference', reference],
      ['background', background]
    ] as const)
      await info.attach(`${label}-${stage}`, { body, contentType: 'image/png' })
    expect(stability.maxChannelDelta).toBeLessThanOrEqual(1)
    expect(
      shadow.changedPixels,
      `${label}: sample must contain visible shadow ink`
    ).toBeGreaterThan(0)
    expect
      .soft(paint.maxChannelDelta, `${label}: painted shadow must match unclipped reference`)
      .toBeLessThanOrEqual(1)
    for (const ancestor of before.ancestors.filter(({ clipX }) => clipX)) {
      expect
        .soft(ancestor.leftRoom, `${label}: ${ancestor.className} left clearance`)
        .toBeGreaterThanOrEqual(5.5)
      expect
        .soft(ancestor.rightRoom, `${label}: ${ancestor.className} right clearance`)
        .toBeGreaterThanOrEqual(5.5)
    }
  } finally {
    for (const [target, style] of [
      [card, cardStyle],
      [form, formStyle]
    ] as const)
      await target.evaluate((element, original) => {
        if (original === null) element.removeAttribute('style')
        else element.setAttribute('style', original)
      }, style)
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
}
