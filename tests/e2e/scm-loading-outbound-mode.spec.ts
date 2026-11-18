import { expect, test } from '@playwright/test'
import {
  prepareScmLoadingOutboundSession,
  scmLoadingOutboundPath
} from './support/scm-document-session'

test.use({ storageState: { cookies: [], origins: [] } })

test('装车出库切换模式及缩小范围保持行完整性', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const tenant = await prepareScmLoadingOutboundSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const documents = Array.from({ length: 30 }, (_, index) => ({
    id: `loading-${index}`,
    tenant_id: tenant.id,
    kind: 'loading',
    document_no: `LOAD-${String(index).padStart(4, '0')}`,
    status: 'loaded',
    lines: [0, 1].map((line) => ({
      line_id: `line-${index}-${line}`,
      line_no: line + 1,
      source_document_id: 'notice-1',
      source_line_id: `source-${line}`,
      material_code: `MAT-${index}-${line}`,
      material_description: `测试物料 ${index}-${line}`,
      quantity: 1,
      base_unit: ''
    }))
  }))
  await page.route('**/rest/v1/scm_sales_document?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    if (!params.has('kind')) return route.fulfill({ json: [] })
    expect(params.get('kind')).toBe('eq.loading')
    expect(params.get('tenant_id')).toBe(`eq.${tenant.id}`)
    return route.fulfill({ json: documents })
  })
  await page.goto(`#${scmLoadingOutboundPath}`)
  await expect(page.getByRole('heading', { name: '装车出库', exact: true })).toBeVisible({
    timeout: 90_000
  })
  const outboundStatus = page
    .locator('.el-form-item')
    .filter({ has: page.getByText('出库状态', { exact: true }) })
  await expect(outboundStatus.getByText('未出库', { exact: true })).toBeVisible()
  const body = page.locator('.el-table__body-wrapper').first()
  const rows = body.locator('tr.el-table__row')
  await expect(rows).toHaveCount(20)
  const documentMode = page.getByRole('radio', { name: '按单据', exact: true })
  if (!(await documentMode.isVisible())) {
    await page.getByRole('button', { name: '展开', exact: true }).click()
  }
  await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
  await expect(page.getByRole('radio', { name: '按明细', exact: true })).toBeChecked()
  await expect(rows).toHaveCount(20)
  await expect(body).toContainText('测试物料 9-1')
  await expect(page.getByRole('button', { name: '出库', exact: true })).toHaveCount(0)
  await page.locator('.el-radio-button').filter({ hasText: '按单据' }).click()
  await expect(documentMode).toBeChecked()
  await expect(rows).toHaveCount(20)
  await expect(rows.nth(19)).toContainText('LOAD-0019')
  const numbers = (await rows.allTextContents()).map((text) => text.match(/LOAD-\d{4}/)?.[0])
  expect(numbers.every(Boolean)).toBe(true)
  expect(new Set(numbers).size).toBe(20)
  const loadingNo = page.getByRole('textbox', { name: '装车单号', exact: true })
  if (!(await loadingNo.isVisible())) {
    await page.getByRole('button', { name: '展开', exact: true }).click()
  }
  await expect(loadingNo).toBeVisible()
  await loadingNo.fill('LOAD-0000')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('LOAD-0000')
  await expect(body).not.toContainText('LOAD-0001')
  await page.screenshot({
    path: testInfo.outputPath('loading-filtered.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})
