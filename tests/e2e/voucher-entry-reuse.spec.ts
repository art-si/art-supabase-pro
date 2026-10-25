import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const mode of ['voucher', 'template']) {
  test(`公共凭证分录 ${mode} 只读编辑与校验`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto(`/tests/e2e/fixtures/statement-label-reuse.html?mode=entries&entryMode=${mode}`)
    const panel = page.getByRole('region', { name: '凭证分录' })
    await expect(panel).toBeVisible({ timeout: 60_000 })
    await expect(panel.locator('.art-table__required-marker')).toHaveCount(0)
    await expect(panel.locator('input')).toHaveCount(0)
    await expect(panel).toContainText('借方 ¥10.00')
    await expect(panel).toContainText('贷方 ¥10.00')
    await expect(panel).toContainText('借贷平衡')
    await expect
      .poll(() =>
        panel.locator('.el-table__body-wrapper').evaluate((e) => e.getBoundingClientRect().height)
      )
      .toBeGreaterThan(70)
    await page.screenshot({ path: info.outputPath('voucher-readonly.png'), animations: 'disabled' })
    await page.getByRole('button', { name: '切换分录编辑', exact: true }).click()
    await expect(panel.locator('.art-table__required-marker')).toHaveCount(
      mode === 'voucher' ? 4 : 3
    )
    await panel.getByRole('combobox', { name: '第 1 条分录会计科目', exact: true }).click()
    await expect(page.getByRole('option', { name: '1001 测试现金科目', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: '1000 测试父级科目', exact: true })).toHaveCount(
      0
    )
    await page.keyboard.press('Escape')
    const summary = panel.getByRole('textbox', { name: '第 1 条分录摘要', exact: true })
    await summary.fill('')
    await summary.blur()
    await page.getByRole('button', { name: '验证分录', exact: true }).click()
    await expect(page.getByLabel('分录验证结果')).toHaveText('false')
    await summary.fill('复用校验分录摘要')
    await summary.blur()
    await page.getByRole('button', { name: '验证分录', exact: true }).click()
    await expect(page.getByLabel('分录验证结果')).toHaveText('true')
    const currencyGrid = panel.locator('[class*="grid-cols-"]').first()
    const layout = await currencyGrid.evaluate((element) => {
      const children = [...element.children].map((child) => child.getBoundingClientRect())
      return {
        display: getComputedStyle(element).display,
        gap: getComputedStyle(element).gap,
        overlap: children[0].right - children[1].left,
        overflow: children[1].right - element.getBoundingClientRect().right
      }
    })
    expect(layout.display).toBe('grid')
    expect(layout.gap).toBe('6px')
    expect(layout.overlap).toBeLessThanOrEqual(0)
    expect(layout.overflow).toBeLessThanOrEqual(1)
    await panel
      .getByRole('combobox', { name: '第 1 条分录币种', exact: true })
      .scrollIntoViewIfNeeded()
    await page.screenshot({
      path: info.outputPath('voucher-currency-edit.png'),
      animations: 'disabled'
    })
    for (const theme of ['light', 'dark']) {
      for (const box of ['border-mode', 'shadow-mode']) {
        await page.evaluate(
          ({ theme, box }) => {
            document.documentElement.classList.toggle('dark', theme === 'dark')
            document.documentElement.dataset.boxMode = box
          },
          { theme, box }
        )
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
          .toBeLessThanOrEqual(1)
        await page.screenshot({
          path: info.outputPath(`voucher-edit-${theme}-${box}.png`),
          animations: 'disabled'
        })
      }
    }
    await page.getByRole('button', { name: '切换分录编辑', exact: true }).click()
    await expect(panel.locator('.art-table__required-marker')).toHaveCount(0)
    await expect(panel.locator('input')).toHaveCount(0)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
