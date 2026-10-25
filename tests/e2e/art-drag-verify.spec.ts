import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('滑块只接管自身的拖动手势，并保留回退和完成反馈', async ({ page }, testInfo) => {
  await page.goto('/tests/e2e/fixtures/art-drag-verify.html')
  await expect(page.locator('.dv_handler')).toBeVisible()

  const gesture = async (selector: string, distance: number, finish: boolean) =>
    page.locator(selector).evaluate(
      (element, { distance, finish }) => {
        const rect = element.getBoundingClientRect()
        const touch = (offset: number) =>
          new Touch({
            identifier: 1,
            target: element,
            pageX: rect.left + 10 + offset,
            pageY: rect.top + 10,
            clientX: rect.left + 10 + offset,
            clientY: rect.top + 10
          })
        element.dispatchEvent(
          new TouchEvent('touchstart', {
            bubbles: true,
            cancelable: true,
            targetTouches: [touch(0)],
            changedTouches: [touch(0)]
          })
        )
        const move = new TouchEvent('touchmove', {
          bubbles: true,
          cancelable: true,
          targetTouches: [touch(distance)],
          changedTouches: [touch(distance)]
        })
        element.dispatchEvent(move)
        if (finish)
          element.dispatchEvent(
            new TouchEvent('touchend', {
              bubbles: true,
              cancelable: true,
              changedTouches: [touch(distance)]
            })
          )
        return move.defaultPrevented
      },
      { distance, finish }
    )

  expect(await gesture('[data-testid="outside"]', 80, true)).toBe(false)
  expect(await gesture('.drag_verify', 80, true)).toBe(false)
  expect(await gesture('.dv_handler', 80, false)).toBe(true)
  await expect(page.locator('.dv_handler')).toHaveCSS('left', '80px')
  await page.locator('.dv_handler').dispatchEvent('touchcancel', { bubbles: true })
  await expect(page.locator('.dv_handler')).toHaveCSS('left', '0px')
  await expect(page.locator('output')).toHaveText('待验证')
  expect(await gesture('.dv_handler', 300, true)).toBe(true)
  await expect(page.locator('output')).toHaveText('已通过')
  await expect(page.locator('.dv_text')).toHaveText('验证通过')
  expect(await gesture('[data-testid="outside"]', 80, true)).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('drag-verified.png') })
})
