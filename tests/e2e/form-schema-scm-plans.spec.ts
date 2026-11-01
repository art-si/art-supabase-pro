import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

test('销售合同配置化计划模式与动态条款跨页保留并保存', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  const writes: Record<string, unknown>[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/sys_dictionary')) {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      const value =
        code === 'scmTaxRate' ? '0' : code === 'commonContractClauseType' ? '验收条款' : ''
      return route.fulfill({
        json: value
          ? [{ id: `${code}-a`, name: value, label: value, value, status: '1', sort: 0 }]
          : []
      })
    }
    if (url.pathname.endsWith('/scm_sales_document') && route.request().method() === 'PATCH') {
      const payload = route.request().postDataJSON()
      writes.push(payload)
      return route.fulfill({
        json: { id: 'quote-a', ...payload },
        headers: { 'content-range': '0-0/1' }
      })
    }
    if (url.pathname.endsWith('/mdm_document_type'))
      return route.fulfill({
        json: [
          {
            id: 'type-a',
            document_type_name: '验收类型',
            document_type_code: 'TYPE-A',
            kind: 'sales_contract',
            enabled: true
          }
        ]
      })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/quotation-conversion.html')
  await page.getByRole('button', { name: '编辑合同计划', exact: true }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog.getByRole('textbox', { name: /合同名称/ })).toBeVisible()
  await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0)
  const contractAmount = dialog.getByRole('spinbutton', { name: '合同总金额', exact: true })
  await expect(contractAmount).toHaveValue('100.00')
  await dialog.getByRole('button', { name: '按明细重算', exact: true }).click()
  await expect(contractAmount).toHaveValue('2.00')
  await contractAmount.fill('100')
  await contractAmount.press('Tab')
  await dialog.getByRole('tab', { name: '收款计划', exact: true }).click()
  const mode = dialog.locator('[data-art-form-item-key="details.paymentPlanMode"]')
  await expect(mode.getByRole('switch')).toBeChecked()
  await mode.locator('.el-switch').click()
  await expect(mode.getByRole('switch')).not.toBeChecked()
  await dialog.getByRole('tab', { name: '合同条款', exact: true }).click()
  const first = dialog.locator('[data-art-form-item-key="clauses.0.content"] textarea')
  await expect(first).toHaveValue('原条款内容')
  await first.fill('配置化条款修改')
  await dialog.getByRole('button', { name: '添加条款', exact: true }).click()
  await dialog.locator('[data-art-form-item-key="clauses.1.title"] .el-select').click()
  await page.getByRole('option', { name: '验收条款', exact: true }).click()
  const second = dialog.locator('[data-art-form-item-key="clauses.1.content"] textarea')
  await second.fill('新增动态条款')
  await dialog.getByRole('tab', { name: '收款计划', exact: true }).click()
  await expect(mode.getByRole('switch')).not.toBeChecked()
  await dialog.getByRole('tab', { name: '合同条款', exact: true }).click()
  await expect(first).toHaveValue('配置化条款修改')
  await expect(second).toHaveValue('新增动态条款')
  await dialog.screenshot({ path: info.outputPath('contract-clauses.png'), animations: 'disabled' })
  await dialog.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toMatchObject({
    details: { payment_plan_mode: 'amount' },
    clauses: [{ content: '配置化条款修改' }, { content: '新增动态条款' }]
  })
  expect(errors).toEqual([])
})
