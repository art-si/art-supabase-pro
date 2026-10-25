import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
for (const cache of [false, true])
  for (const empty of [false, true])
    test(`顶部区域高度变化与重新挂载保持表格边界：缓存 ${cache} 空数据 ${empty}`, async ({
      page
    }, testInfo) => {
      await page.goto(
        `/tests/e2e/fixtures/table-query-header.html?${cache ? 'cache&' : ''}${empty ? 'empty' : ''}`
      )
      const table = page.locator('.art-table')
      await expect(
        page.getByText(empty ? '暂无验收记录' : '验收记录', { exact: true })
      ).toBeVisible()
      if (!empty) await expect(page.locator('.el-pagination')).toBeVisible()
      const initialHeight = await table.evaluate(
        (element) => element.getBoundingClientRect().height
      )
      await page.getByRole('button', { name: '切换顶部高度' }).click()
      await expect
        .poll(() => table.evaluate((element) => element.getBoundingClientRect().height))
        .toBeLessThan(initialHeight - 70)
      if (cache)
        await page.locator('.art-table-query').evaluate((element) => {
          element.setAttribute('data-cache-marker', 'retained')
        })
      await page.getByRole('button', { name: '切换表格挂载' }).click()
      await expect(table).toHaveCount(0)
      await page.getByRole('button', { name: '切换表格挂载' }).click()
      await expect(
        page.getByText(empty ? '暂无验收记录' : '验收记录', { exact: true })
      ).toBeVisible()
      if (cache)
        await expect(page.locator('.art-table-query')).toHaveAttribute(
          'data-cache-marker',
          'retained'
        )
      await page.getByRole('button', { name: '切换顶部高度' }).click()
      await expect
        .poll(() => table.evaluate((element) => element.getBoundingClientRect().height))
        .toBeCloseTo(initialHeight, 0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        testInfo.project.use.viewport!.width
      )
      await page.screenshot({
        path: testInfo.outputPath('header-region.png'),
        animations: 'disabled'
      })
    })
