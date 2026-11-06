import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

async function openReminderContract(
  page: import('@playwright/test').Page,
  empty: boolean,
  allocationsFail = false
) {
  const writes: Record<string, unknown>[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/rpc/scm_quote_line_allocations_secure') && allocationsFail)
      return route.fulfill({
        status: 503,
        json: { code: 'PGRST003', message: 'temporary unavailable' }
      })
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
    if (url.pathname.endsWith('/scm_sales_document')) {
      if (route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON()
        writes.push(payload)
        return route.fulfill({ json: { id: 'contract-reminder', ...payload } })
      }
      if (url.searchParams.get('kind') === 'eq.sales_quotation')
        return route.fulfill({
          json: [
            {
              id: 'quote-a',
              tenant_id: 'tenant-a',
              kind: 'sales_quotation',
              document_no: 'TEST-A',
              status: 'effective',
              lines: [{ line_id: 'line-a', quantity: 2 }]
            }
          ],
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
  await page.goto(
    `/tests/e2e/fixtures/quotation-conversion.html${empty ? '?contractScenario=empty' : ''}`
  )
  await page.getByRole('button', { name: '编辑待提醒合同', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑销售合同 · CONTRACT-REMINDER' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0)
  return { dialog, writes, errors }
}

test('销售合同超出报价余量且计划、条款部分填写时提醒并保存', async ({ page }, info) => {
  const { dialog, writes, errors } = await openReminderContract(page, false)
  await dialog.getByRole('tab', { name: '收款计划', exact: true }).click()
  await expect(dialog.getByRole('tab', { name: '收款计划', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await dialog.screenshot({
    path: info.outputPath('sales-contract-partial-payment-plan.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('tab', { name: '合同条款', exact: true }).click()
  await expect(dialog.locator('[data-art-form-item-key="clauses.0.content"] textarea')).toHaveValue(
    ''
  )
  await dialog.screenshot({
    path: info.outputPath('sales-contract-partial-clause.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  await expect(page.getByText(/已保存。提醒：/)).toContainText('1 行合同数量超过报价待转数量')
  await expect(page.getByText(/已保存。提醒：/)).toContainText('收款计划尚未填完整')
  await expect(page.getByText(/已保存。提醒：/)).toContainText('合同条款尚未填完整')
  await page.screenshot({
    path: info.outputPath('sales-contract-saved-with-reminders.png'),
    animations: 'disabled'
  })
  expect(writes[0]).toMatchObject({
    payment_plans: [{ due_date: '', amount: 30 }],
    clauses: [{ title: '验收条款', content: '' }]
  })
  await expect(page.getByTestId('success-count')).toHaveText('1')
  expect(errors).toEqual([])
})

test('销售合同计划和条款留空可保存，缺少物料明细仍拦截', async ({ page }, info) => {
  const { dialog, writes, errors } = await openReminderContract(page, true)
  await dialog.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]).toMatchObject({ payment_plans: [], clauses: [] })
  await expect(page.getByTestId('success-count')).toHaveText('1')
  await page.getByRole('button', { name: '编辑待提醒合同', exact: true }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0)
  await dialog.getByRole('tab', { name: '合同明细', exact: true }).click()
  await dialog.getByRole('button', { name: '移除明细', exact: true }).click()
  await dialog.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect(page.getByText('请添加至少一行物料明细')).toBeVisible()
  expect(writes).toHaveLength(1)
  await dialog.screenshot({
    path: info.outputPath('sales-contract-missing-line-blocked.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})

test('报价余量预检失败仍保存销售合同并只显示提醒', async ({ page }, info) => {
  const { dialog, writes, errors } = await openReminderContract(page, true, true)
  await dialog.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  await expect(page.getByTestId('success-count')).toHaveText('1')
  await expect(page.getByText(/已保存。提醒：/)).toContainText('报价待转数量暂未核对，请稍后检查')
  await expect(page.locator('.el-message--error:visible')).toHaveCount(0)
  await page.screenshot({
    path: info.outputPath('sales-contract-allocation-check-failed-but-saved.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})
