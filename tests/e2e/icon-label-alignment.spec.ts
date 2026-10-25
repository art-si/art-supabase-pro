import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

test('失败结果提示图文对齐且保持分行', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/upload-source-label.html?result')
  const labels = page.locator('p.art-icon-label')
  await expect(labels).toHaveCount(2)
  for (const label of await labels.all()) {
    const geometry = await label.evaluate((element) => {
      const icon = element.querySelector('.art-svg-icon')!.getBoundingClientRect()
      const text = element.querySelector('span')!.getBoundingClientRect()
      return {
        gap: text.left - icon.right,
        center: Math.abs((icon.top + icon.bottom - text.top - text.bottom) / 2)
      }
    })
    expect(geometry.gap).toBeCloseTo(8, 1)
    expect(geometry.center).toBeLessThanOrEqual(0.5)
  }
  const first = await labels.first().boundingBox()
  const second = await labels.last().boundingBox()
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height)
  await page.screenshot({ path: info.outputPath('result.png') })
})

for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`资源分类图文对齐 ${theme} ${width}`, async ({ page }, info) => {
      await prepareIsolatedSession(page)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.setViewportSize({ width, height: 900 })
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      await page.goto(
        `/tests/e2e/fixtures/upload-source-label.html?icons&theme=${theme}&box=border-mode`
      )
      const options = page.locator('[data-icon-panel] .el-segmented__item-label .art-icon-label')
      await expect(options).toHaveCount(5)
      await expect(options.locator('svg path')).toHaveCount(5)
      const controls = page.locator('[data-icon-controls] .art-svg-icon')
      await expect(controls).toHaveCount(5)
      for (const control of await controls.all()) {
        const measured = await control.evaluate((element) => {
          const icon = element.getBoundingClientRect()
          const label = element.nextElementSibling!.getBoundingClientRect()
          return {
            gap: label.left - icon.right,
            center: Math.abs((icon.top + icon.bottom - label.top - label.bottom) / 2),
            small: Boolean(element.closest('.el-button--small'))
          }
        })
        expect(measured.center).toBeLessThanOrEqual(0.5)
        expect(measured.gap).toBeCloseTo(measured.small ? 6 : 8, 1)
      }
      for (const option of await options.all()) {
        const geometry = await option.evaluate((element) => {
          const icon = element.querySelector('.art-svg-icon')!.getBoundingClientRect()
          const text = element.querySelector('span')!.getBoundingClientRect()
          return {
            gap: text.left - icon.right,
            center: Math.abs((icon.top + icon.bottom - text.top - text.bottom) / 2),
            iconSize: icon.width,
            textSize: Number.parseFloat(getComputedStyle(element.querySelector('span')!).fontSize)
          }
        })
        expect(geometry.gap).toBeCloseTo(8, 1)
        expect(geometry.center).toBeLessThanOrEqual(0.5)
        expect(geometry.iconSize / geometry.textSize).toBeCloseTo(16 / 14, 1)
      }
      await page.getByText('图片', { exact: true }).click()
      await expect(page.locator('[data-icon-panel] .el-segmented__item.is-selected')).toContainText(
        '图片'
      )
      await page
        .locator('[data-icon-panel]')
        .screenshot({ path: info.outputPath('categories.png') })
      expect(errors).toEqual([])
    })
  }
}
