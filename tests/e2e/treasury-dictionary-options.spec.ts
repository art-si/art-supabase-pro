import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)

for (const scenario of [
  { mode: 'transfer', title: '资金调拨', fields: ['调拨状态'] },
  { mode: 'journal', title: '资金日记账', fields: ['收支方向', '业务来源'] },
  { mode: 'reconciliation', title: '银行对账', fields: ['对账状态'] }
]) {
  test(`${scenario.title}公共字典延迟加载、停用过滤和缓存重载`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let generation = 1
    let writes = 0
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/sys_dictionary')) {
        await gate
        await route.fulfill({
          json: [
            { label: '', name: `公共名称选项${generation}`, value: 'active-test', status: '1' },
            { label: '停用历史选项', value: 'legacy-test', status: '0' }
          ]
        })
        return
      }
      if (route.request().method() !== 'GET' && !url.pathname.includes('/rpc/')) writes++
      await route.fulfill({
        json: url.pathname.includes('/rpc/') ? { records: [], total: 0, fieldAccess: {} } : []
      })
    })
    await page.goto(`/tests/e2e/fixtures/treasury-dictionary-options.html?mode=${scenario.mode}`)
    const header = page.locator('.business-workspace-header')
    await expect(header.getByText(scenario.title, { exact: true })).toBeVisible({
      timeout: 120_000
    })
    release()
    for (const generationValue of [1, 2]) {
      for (const field of scenario.fields) {
        const select = page
          .locator('.el-form-item')
          .filter({ has: page.getByText(field, { exact: true }) })
          .locator('.el-select')
        await select.scrollIntoViewIfNeeded()
        await select.click()
        const dropdown = page.locator('.el-select-dropdown:visible')
        await expect(dropdown.getByRole('option')).toHaveCount(1)
        await expect(dropdown.getByRole('option')).toHaveText(`公共名称选项${generationValue}`)
        await dropdown.getByRole('option').click()
        await expect(select).toContainText(`公共名称选项${generationValue}`)
      }
      if (generationValue === 1) {
        generation = 2
        await page.getByRole('button', { name: '测试清空字典缓存' }).click()
      }
    }
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(header).toBeHidden()
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(header).toBeVisible()
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await page.keyboard.press('Escape')
    await expect(header).toBeVisible()
    await page.screenshot({
      path: info.outputPath('treasury-dictionary-options.png'),
      fullPage: true
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
    expect(writes).toBe(0)
  })
}
