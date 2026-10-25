import { expect, test } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })

test('溢出标签可滚动并连续关闭，卸载后无延迟错误', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.clock.install()
  await page.goto('/tests/e2e/fixtures/worktab-lifecycle.html')
  const right = page.getByRole('button', { name: '向右滚动已打开页面' })
  await expect(right).toBeVisible()
  const geometry = await page
    .getByRole('tab')
    .first()
    .locator('.art-icon-label')
    .evaluate((element) => {
      const icon = element.querySelector('.art-svg-icon')!.getBoundingClientRect()
      const label = element.querySelector('.work-tab-title')!.getBoundingClientRect()
      return {
        gap: label.left - icon.right,
        center: Math.abs((icon.top + icon.bottom - label.top - label.bottom) / 2),
        ratio: icon.width / Number.parseFloat(getComputedStyle(element).fontSize)
      }
    })
  expect(geometry.gap).toBeCloseTo(6, 1)
  expect(geometry.center).toBeLessThanOrEqual(0.5)
  expect(geometry.ratio).toBeCloseTo(16 / 14, 1)
  await right.click()
  await expect(page.getByRole('button', { name: '向左滚动已打开页面' })).toBeEnabled()
  await page.clock.runFor(300)
  await page.getByRole('button', { name: '关闭业务页面1', exact: true }).click()
  await page.clock.runFor(300)
  await right.click()
  await page.clock.runFor(300)
  await page.getByRole('button', { name: '关闭业务页面2', exact: true }).click()
  await expect(page.getByTestId('tab-count')).toHaveText('10')
  await page.getByRole('button', { name: '向左滚动已打开页面' }).click()
  await page.screenshot({ path: testInfo.outputPath('worktabs.png'), animations: 'disabled' })
  await right.click()
  await page.getByRole('button', { name: '卸载标签页' }).click()
  await page.clock.runFor(500)
  await expect(page.locator('.art-work-tab')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('触摸滑动使用实际事件处理并保持滚动边界', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/worktab-lifecycle.html')
  const tabs = page.getByRole('tablist', { name: '已打开页面' })
  await expect(tabs).toBeVisible()
  const touch = (x: number) => ({ identifier: 1, clientX: x, clientY: 20 })
  await tabs.dispatchEvent('touchstart', { touches: [touch(250)] })
  await tabs.dispatchEvent('touchmove', { touches: [touch(100)] })
  await tabs.dispatchEvent('touchend', { touches: [] })
  await expect(page.getByRole('button', { name: '向左滚动已打开页面' })).toBeEnabled()
  await tabs.dispatchEvent('touchstart', { touches: [touch(100)] })
  await tabs.dispatchEvent('touchmove', { touches: [touch(2000)] })
  await tabs.dispatchEvent('touchend', { touches: [] })
  await expect(page.getByRole('button', { name: '向左滚动已打开页面' })).toBeDisabled()
  await expect
    .poll(async () => tabs.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41))
    .toBe(0)
})

test('关闭再打开标签栏后滚轮和触摸仍绑定到新元素', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/worktab-lifecycle.html')
  const toggle = page.getByRole('button', { name: '切换标签栏显示', exact: true })
  for (let cycle = 0; cycle < 2; cycle++) {
    await toggle.click()
    await expect(page.getByRole('tablist', { name: '已打开页面' })).toHaveCount(0)
    await toggle.click()
    const tabs = page.getByRole('tablist', { name: '已打开页面' })
    await expect(tabs).toBeVisible()
    await tabs.dispatchEvent('touchstart', {
      touches: [{ identifier: 1, clientX: 100, clientY: 20 }]
    })
    await tabs.dispatchEvent('touchmove', {
      touches: [{ identifier: 1, clientX: 2000, clientY: 20 }]
    })
    await tabs.dispatchEvent('touchend', { touches: [] })
    await expect
      .poll(() => tabs.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41))
      .toBe(0)
    await tabs.dispatchEvent('wheel', { deltaY: 140 })
    await expect
      .poll(() => tabs.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41))
      .toBe(-140)
  }
})
