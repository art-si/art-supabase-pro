import { expect, type Locator } from '@playwright/test'

/** A wrapped field error must stay readable without occupying the following field. */
export async function expectStackedFormErrorFlow(field: Locator, followingField: Locator) {
  const error = field.locator(
    ':scope > .el-form-item__content > .el-form-item__error:not(.el-form-item__error--inline)'
  )
  await expect(error).toBeVisible()
  await error.scrollIntoViewIfNeeded()
  await error.evaluate(async (element) => {
    await document.fonts.ready
    await Promise.allSettled(
      element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished)
    )
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
  })
  const [geometry, followingLabel] = await Promise.all([
    error.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const owner = element.closest('.el-form-item')!.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(element)
      const text = range.getBoundingClientRect()
      return {
        error: {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          height: bounds.height
        },
        field: { left: owner.left, right: owner.right, top: owner.top, bottom: owner.bottom },
        text: { left: text.left, right: text.right, bottom: text.bottom },
        lines: range.getClientRects().length,
        pageOverflow: document.documentElement.scrollWidth - innerWidth
      }
    }),
    followingField.locator(':scope > .el-form-item__label').boundingBox()
  ])
  const measured = JSON.stringify({ geometry, followingLabel })
  expect(followingLabel, measured).not.toBeNull()
  expect(geometry.lines, '真实业务提示须在该宽度发生换行').toBeGreaterThanOrEqual(2)
  expect(geometry.error.bottom, measured).toBeLessThanOrEqual(geometry.field.bottom + 1)
  expect(geometry.text.left, measured).toBeGreaterThanOrEqual(geometry.error.left - 1)
  expect(geometry.text.right, measured).toBeLessThanOrEqual(geometry.error.right + 1)
  expect(geometry.text.bottom, measured).toBeLessThanOrEqual(geometry.error.bottom + 1)
  expect(followingLabel!.y - geometry.error.bottom, measured).toBeGreaterThanOrEqual(8)
  expect(geometry.pageOverflow, measured).toBeLessThanOrEqual(1)
  return { ...geometry, followingLabel }
}
