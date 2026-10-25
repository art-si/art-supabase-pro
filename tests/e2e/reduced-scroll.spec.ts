import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('form error focus stays inside the requested pane and skips unavailable controls', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/tests/e2e/fixtures/reduced-scroll.html')
  await page.getByRole('button', { name: '定位当前页签错误' }).click()
  await expect(page.getByRole('textbox', { name: '当前错误字段' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: '当前错误字段' })).toBeInViewport()
  await expect(page.getByRole('textbox', { name: '其他页签字段' })).not.toBeFocused()
})

test('programmatic scrolling honors reduced motion and live preference changes', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/tests/e2e/fixtures/reduced-scroll.html')
  await page.getByRole('button', { name: '定位目标' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-behavior', 'auto')
  expect(
    Number(await page.locator('body').getAttribute('data-immediate-position'))
  ).toBeGreaterThan(1000)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: '定位目标' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-behavior', 'smooth')
  await expect(page.getByText('目标位置')).toBeInViewport()
})
