import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(180000)

for (const document of [
  { kind: '采购', tab: '付款计划', remove: '移除付款计划', prefix: 'PC' },
  { kind: '销售', tab: '收款计划', remove: '移除收款计划', prefix: 'SC' }
] as const) {
  test(`${document.kind}合同重开后旧行操作不能移除新合同的最后一期`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    const writes: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (
        path.startsWith('/rest/v1/') &&
        (['PATCH', 'PUT', 'DELETE'].includes(request.method()) ||
          (request.method() === 'POST' && !path.includes('/rpc/')))
      )
        writes.push(`${request.method()} ${path}`)
    })
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto('/tests/e2e/fixtures/scm-stale-row.html', { waitUntil: 'commit' })
    await expect(page.getByRole('button', { name: `打开${document.kind}合同 A` })).toBeVisible({
      timeout: 120000
    })
    await page.getByRole('button', { name: `打开${document.kind}合同 A` }).click()
    const dialog = page.locator('.el-dialog:visible')
    await expect(dialog).toContainText(`${document.prefix}-A`)
    await dialog.getByRole('tab', { name: document.tab, exact: true }).click()
    const removeButtons = dialog.locator(`.el-table button[aria-label="${document.remove}"]`)
    await expect(removeButtons).toHaveCount(2)
    await page
      .getByRole('button', { name: `捕获${document.kind}旧操作` })
      .evaluate((button) => (button as HTMLButtonElement).click())
    await expect(page.getByTestId('stale-captured')).toContainText(
      `"${document.kind === '采购' ? 'purchase' : 'sales'}":true`
    )
    await page
      .getByRole('button', { name: `重开${document.kind}合同 B` })
      .evaluate((button) => (button as HTMLButtonElement).click())
    await expect(dialog).toContainText(`${document.prefix}-B`)
    await dialog.getByRole('tab', { name: document.tab, exact: true }).click()
    await expect(removeButtons).toHaveCount(2)
    await page
      .getByRole('button', { name: `触发${document.kind}旧操作` })
      .evaluate((button) => (button as HTMLButtonElement).click())
    await expect(page.getByTestId('stale-invoked')).toContainText(
      `"${document.kind === '采购' ? 'purchase' : 'sales'}":1`
    )
    await expect(removeButtons).toHaveCount(2)
    await removeButtons.last().scrollIntoViewIfNeeded()
    await expect(removeButtons.last()).toBeInViewport({ ratio: 1 })
    await dialog.screenshot({
      path: info.outputPath(`${document.prefix}-stale-row.png`),
      animations: 'disabled'
    })
    await removeButtons.first().click()
    await expect(removeButtons).toHaveCount(1)
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}
