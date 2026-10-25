import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const theme of ['light', 'dark']) {
  for (const boxMode of ['border-mode', 'shadow-mode']) {
    test(`三栏参选分页和多列限高表格 ${theme} ${boxMode}`, async ({ page }, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/sys_dictionary?*', (route) => route.fulfill({ json: [] }))
      await page.goto('/tests/e2e/fixtures/table-scroll-layout.html')
      await page.evaluate(
        ({ theme, boxMode }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.body.classList.remove('border-mode', 'shadow-mode')
          document.body.classList.add(boxMode)
        },
        { theme, boxMode }
      )
      await page.setViewportSize({ width: 1920, height: 900 })
      await page.getByRole('button', { name: '打开三栏物料参选' }).click()
      const picker = page.getByRole('dialog', { name: '参选物料布局验收', exact: true })
      await expect(picker.getByRole('row').filter({ hasText: 'MAT-0' })).toBeVisible()
      expect((await picker.locator('.el-dialog').boundingBox())!.width).toBeGreaterThanOrEqual(1400)
      for (const width of [1920, 1440, 1024, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await expect
          .poll(async () =>
            picker.locator('.art-data-select-dialog__pager').evaluate((pager) => {
              const items = Array.from(
                pager.querySelectorAll<HTMLElement>('.el-pagination > *')
              ).filter((item) => item.offsetWidth > 0)
              const tops = items.map((item) => item.getBoundingClientRect().top)
              return Math.max(...tops) - Math.min(...tops)
            })
          )
          .toBeLessThanOrEqual(8)
        expect(await picker.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
        await picker.screenshot({
          path: testInfo.outputPath(`picker-${width}.png`),
          animations: 'disabled'
        })
      }
      await picker.getByRole('button', { name: /next page|下一页/i }).click()
      await expect(picker.getByRole('row').filter({ hasText: 'MAT-10' })).toBeVisible()
      await picker
        .getByRole('row')
        .filter({ hasText: 'MAT-10' })
        .getByRole('checkbox')
        .locator('..')
        .click()
      await expect(picker.getByText('已选 1', { exact: true })).toBeVisible()
      await picker.getByRole('button', { name: '取消', exact: true }).click()

      await page.setViewportSize({ width: 1024, height: 900 })
      await page.getByRole('button', { name: '打开多列明细' }).click()
      const dialog = page.getByRole('dialog', { name: '多列明细布局验收', exact: true })
      const table = dialog.locator('.art-table')
      const horizontal = table.locator('.el-scrollbar__bar.is-horizontal')
      for (const count of [20, 6, 20]) {
        await dialog
          .getByRole('button', { name: count === 6 ? '减少到六行' : '恢复二十行' })
          .click()
        await expect(table.locator('.el-table__body-wrapper tbody tr')).toHaveCount(count)
        await expect
          .poll(async () =>
            horizontal.evaluate((bar) => {
              const bounds = bar.getBoundingClientRect()
              const tableBounds = bar.closest('.el-table')!.getBoundingClientRect()
              const style = getComputedStyle(bar)
              return (
                bounds.height > 0 &&
                bounds.bottom <= tableBounds.bottom + 1 &&
                style.display !== 'none' &&
                style.opacity === '1'
              )
            })
          )
          .toBe(true)
        expect((await table.locator('.el-table').boundingBox())!.height).toBeLessThanOrEqual(281)
        const wrap = table.locator('.el-table__body-wrapper .el-scrollbar__wrap')
        await wrap.evaluate((el) => (el.scrollLeft = el.scrollWidth))
        await expect.poll(() => wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(1000)
        await wrap.evaluate((el) => (el.scrollLeft = 0))
      }
      const thumbBounds = await horizontal.locator('.el-scrollbar__thumb').boundingBox()
      const barBounds = await horizontal.boundingBox()
      await page.mouse.move(
        thumbBounds!.x + thumbBounds!.width / 2,
        thumbBounds!.y + thumbBounds!.height / 2
      )
      await page.mouse.down()
      await page.mouse.move(
        barBounds!.x + barBounds!.width - 8,
        thumbBounds!.y + thumbBounds!.height / 2,
        { steps: 12 }
      )
      await page.mouse.up()
      await expect
        .poll(() =>
          table
            .locator('.el-table__body-wrapper .el-scrollbar__wrap')
            .evaluate((el) => el.scrollLeft)
        )
        .toBeGreaterThan(1000)
      await table
        .locator('.el-table__body-wrapper .el-scrollbar__wrap')
        .evaluate((el) => (el.scrollLeft = 0))
      await dialog.screenshot({
        path: testInfo.outputPath('table-both-scrollbars.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '全屏', exact: true }).click()
      await expect(horizontal).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
      expect(errors).toEqual([])
    })
  }
}

test('业务指定的参选宽度仍然优先', async ({ page }) => {
  await page.route('**/rest/v1/sys_dictionary?*', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/table-scroll-layout.html?width=1000')
  await page.getByRole('button', { name: '打开三栏物料参选' }).click()
  const picker = page.getByRole('dialog', { name: '参选物料布局验收', exact: true })
  await expect(picker.getByRole('row').filter({ hasText: 'MAT-0' })).toBeVisible()
  expect((await picker.locator('.el-dialog').boundingBox())!.width).toBe(1000)
})
