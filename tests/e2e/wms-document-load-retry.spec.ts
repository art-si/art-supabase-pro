import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const family of ['销售', '采购'] as const) {
  test(`${family}单据读取失败隐藏旧数据并可重试恢复`, async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    let reads = 0
    let failReads = true
    let writes = 0
    const table = family === '销售' ? 'wms_sales_document' : 'wms_purchase_document'
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().method() !== 'GET') writes += 1
      if (new URL(route.request().url()).pathname.endsWith(`/${table}`)) {
        reads += 1
        await route.fulfill(
          failReads
            ? { status: 503, json: { message: 'fixture temporary read failure' } }
            : {
                json: {
                  id: '22222222-2222-4222-8222-222222222222',
                  document_no: 'TEST-RECOVERED-002',
                  kind: family === '销售' ? 'initial_outbound' : 'initial_inbound',
                  status: 'draft',
                  lines: []
                }
              }
        )
        return
      }
      await route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/wms-document-serials.html')
    await page.getByRole('button', { name: `打开${family}单据`, exact: true }).click()
    const drawer = page.locator('.el-drawer')
    await expect(drawer.getByRole('button', { name: '序列号 0', exact: true })).toBeVisible()
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: `读取${family}单据`, exact: true }).click()
    await expect(drawer.getByText('单据加载失败', { exact: true })).toBeVisible()
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
    await expect(drawer.getByRole('button', { name: '序列号 0', exact: true })).toHaveCount(0)
    await page.screenshot({ path: testInfo.outputPath(`${family}-load-error.png`) })
    const failedReads = reads
    failReads = false
    await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(drawer.getByText('单据加载失败', { exact: true })).toHaveCount(0)
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    await expect(drawer.getByText('TEST-RECOVERED-002', { exact: true }).first()).toBeVisible()
    await expect(drawer.locator('.el-form-item__error')).toHaveCount(0)
    expect(reads).toBe(failedReads + 1)
    expect(writes).toBe(0)
    await page.screenshot({ path: testInfo.outputPath(`${family}-load-recovered.png`) })
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
  })
}
