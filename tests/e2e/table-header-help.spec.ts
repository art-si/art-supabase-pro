import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
for (const theme of ['light', 'dark'] as const) {
  test(`表头规则说明在普通、分组和虚拟表中可悬停及键盘查看 ${theme}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await prepareAppearance(page, { theme, boxBorderMode: theme === 'light' })
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.setViewportSize({ width: theme === 'light' ? 1440 : 768, height: 1000 })
    await page.goto('/tests/e2e/fixtures/table-header-help.html')
    for (const kind of ['normal', 'grouped', 'virtual']) {
      const area = page.getByTestId(kind)
      const help = area.getByRole('button', { name: '长度填写说明', exact: true })
      await expect(area.locator('.art-table__required-marker')).toHaveCount(1)
      await help.focus()
      const tooltipId = await help.getAttribute('aria-describedby')
      expect(tooltipId).toBeTruthy()
      const tooltip = page.locator(`[id="${tooltipId}"]`)
      await expect(tooltip).toBeVisible()
      await expect(tooltip).toHaveText('长度必须大于 0 mm')
      await help.blur()
      await help.hover()
      await expect(tooltip).toBeVisible()
      await page.mouse.move(0, 0)
      await help.blur()
    }
    await page.getByTestId('grouped').getByRole('button', { name: '尺寸分组填写说明' }).hover()
    await expect(page.getByRole('tooltip').filter({ hasText: '统一按毫米录入' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await page.screenshot({ path: info.outputPath(`header-help-${theme}.png`), fullPage: true })
  })
}
