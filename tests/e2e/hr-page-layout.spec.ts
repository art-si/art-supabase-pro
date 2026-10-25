import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
for (const feature of ['organization', 'policy', 'contingent', 'review']) {
  for (const width of [570, 1440]) {
    test(`${feature} ${width}px 空态页面导航与底部表格保持可见`, async ({ page }, testInfo) => {
      test.setTimeout(90000)
      await prepareIsolatedSession(page)
      await page.setViewportSize({ width, height: 900 })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      await page.goto(`/tests/e2e/fixtures/hr-page-layout.html?page=${feature}`)
      await expect(page.locator('.business-workspace-page')).toBeVisible({ timeout: 60000 })
      await expect(page.locator('.el-table')).toBeVisible()
      const stages = page.locator('ol[class$="__lifecycle"] > li')
      await expect(stages).toHaveCount(5)
      const stageBounds = await stages.evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect()
          return { left: bounds.left, right: bounds.right }
        })
      )
      for (let index = 1; index < stageBounds.length; index++) {
        expect(stageBounds[index].left).toBeGreaterThanOrEqual(stageBounds[index - 1].right)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
      await page.screenshot({ path: testInfo.outputPath('page-top.png'), animations: 'disabled' })
      if (width === 570) {
        const lifecycleScroll = page.locator('[class$="__lifecycle-scroll"] .el-scrollbar__wrap')
        await lifecycleScroll.evaluate((element) => {
          element.scrollLeft = element.scrollWidth
        })
        const lastStage = await stages.last().boundingBox()
        const scrollBounds = await lifecycleScroll.boundingBox()
        expect(lastStage!.x + lastStage!.width).toBeLessThanOrEqual(
          scrollBounds!.x + scrollBounds!.width + 1
        )
        await page.screenshot({
          path: testInfo.outputPath('page-last-stage.png'),
          animations: 'disabled'
        })
      }
      await page.locator('.el-table').scrollIntoViewIfNeeded()
      expect(
        await page
          .locator('.el-table')
          .evaluate((element) => element.getBoundingClientRect().height)
      ).toBeGreaterThan(150)
      expect(errors).toEqual([])
      await page.screenshot({ path: testInfo.outputPath('page-table.png'), animations: 'disabled' })
    })
  }
}
