import { expect, test } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

test('采购来源失败后重试恢复，空数据使用标准状态', async ({ page }) => {
  let failure = true
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ headers: { 'content-range': '*/0' }, json: [] })
  )
  await page.route('**/rest/v1/scm_order_target_document?*', (route) =>
    failure
      ? route.fulfill({ status: 503, json: { code: 'XX000', message: 'temporary failure' } })
      : route.fulfill({
          headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
          json: []
        })
  )
  await page.goto('/tests/e2e/fixtures/purchase-source-picker.html')
  await page.getByRole('button', { name: '承接订单', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('来源单据加载失败', { exact: true })).toBeVisible()
  await expect(dialog.getByText('暂无订单下推单', { exact: true })).toHaveCount(0)
  failure = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('暂无订单下推单', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '承接订单', exact: true })).toHaveCount(0)
  await page.screenshot({
    path: test.info().outputPath('purchase-source-empty.png'),
    animations: 'disabled'
  })
})

test('采购来源关闭重开不接受旧候选', async ({ page }) => {
  let requests = 0
  let releaseOld: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({ headers: { 'content-range': '*/0' }, json: [] })
  )
  await page.route('**/rest/v1/scm_order_target_document?*', async (route) => {
    const request = ++requests
    if (request === 1) await held
    await route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: request === 1 ? 'old-source' : 'new-source',
          document_no: request === 1 ? 'OLD-ORDER' : 'NEW-ORDER',
          status: 'draft',
          source: { document_no: 'PO-TEST' }
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/purchase-source-picker.html')
  await page.getByRole('button', { name: '承接订单', exact: true }).click()
  await expect.poll(() => requests).toBe(1)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^(关闭此对话框|Close this dialog)$/ }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '承接订单', exact: true }).click()
  await expect.poll(() => requests).toBe(2)
  const oldResponse = page.waitForResponse((response) =>
    response.url().includes('/scm_order_target_document')
  )
  releaseOld?.()
  await oldResponse
  await dialog.getByRole('combobox').press('ArrowDown')
  await expect(
    page.getByRole('option', { name: 'NEW-ORDER · PO-TEST · 待入库', exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole('option', { name: 'OLD-ORDER · PO-TEST · 待入库', exact: true })
  ).toHaveCount(0)
})
