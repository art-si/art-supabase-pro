import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

test('两财务应收来源允许跳过零行且阻断全零收款', async ({ page }, info) => {
  const tenant = '11111111-1111-4111-8111-111111111111'
  const records = [1, 2].map((index) => ({
    id: `financial-${index}`,
    tenant_id: tenant,
    document_no: `QA-ALLOCATION-${index}`,
    kind: 'financial',
    status: 'approved',
    customer_id: 'customer',
    customer_name: '分配验收客户',
    settlement_organization_id: 'company',
    organization_name: '分配验收公司',
    currency_code: 'CNY',
    total_amount: index * 300,
    available_amount: index * 300,
    lines: [1, 2].map((line) => ({
      id: `financial-${index}-line-${line}`,
      line_no: line * 10,
      available_amount: index * line * 100,
      entered_gross_amount: index * line * 100,
      material_description: `验收服务${line}`
    }))
  }))
  const saved: Array<{
    tenantId: string
    lines: Array<{ financialLineId: string; amount: number }>
  }> = []
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const values =
        code === 'arDocumentStatus'
          ? [['approved', '已审核']]
          : code === 'arSettlementMethod'
            ? [['bank_transfer', '电汇']]
            : code === 'mdmCurrency'
              ? [['CNY', '人民币']]
              : []
      return route.fulfill({
        json: values.map(([value, label]) => ({
          id: value,
          code: value,
          value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (name === 'mdm_organization')
      return route.fulfill({
        json: [
          {
            id: 'company',
            tenant_id: tenant,
            organization_name: '分配验收公司',
            organization_type: 'company',
            parent_id: null,
            status: '1'
          }
        ]
      })
    if (name === 'fms_ar_options_secure')
      return route.fulfill({
        json:
          body.p_type === 'company'
            ? [{ id: 'company', tenant_id: tenant, name: '分配验收公司' }]
            : body.p_type === 'customer'
              ? [{ id: 'customer', tenant_id: tenant, name: '分配验收客户' }]
              : []
      })
    if (name === 'fms_receivable_workspace_secure')
      return route.fulfill({
        json: {
          records: body.p_query?.id ? records.filter((row) => row.id === body.p_query.id) : records,
          total: records.length
        }
      })
    if (name === 'fms_save_receipt_secure') {
      saved.push(body.p_payload)
      return route.fulfill({ json: `receipt-${saved.length}` })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=financial&theme=${theme}&permissions=FinanceFinancialReceivable:View,FinanceFinancialReceivable:Push,FinanceReceipt:Add`
  )
  if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
  for (const index of [1, 2]) {
    const row = page.getByRole('row').filter({ hasText: `QA-ALLOCATION-${index}` })
    await row.locator('label.el-checkbox').click()
    await page.getByRole('button', { name: '下推', exact: true }).click()
    await page.getByRole('menuitem', { name: '收款', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '新增收款单', exact: true })
    const first = drawer.getByRole('spinbutton', { name: '第10行本次收款金额' })
    const second = drawer.getByRole('spinbutton', { name: '第20行本次收款金额' })
    await expect(first).toHaveValue((index * 100).toFixed(2))
    await expect(second).toHaveValue((index * 200).toFixed(2))
    await first.fill('0')
    await second.fill('0')
    await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(page.locator('.el-message--warning')).toContainText(
      '请至少填写一行大于0的收款金额'
    )
    expect(saved).toHaveLength(index - 1)
    const chosen = index === 1 ? first : second
    await chosen.fill(String(index * 80))
    await chosen.blur()
    await chosen.scrollIntoViewIfNeeded()
    await drawer.screenshot({ path: info.outputPath(`source-allocation-${index}.png`) })
    await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(drawer).not.toBeVisible()
    expect(saved[index - 1]).toMatchObject({
      tenantId: tenant,
      lines: [{ financialLineId: `financial-${index}-line-${index}`, amount: index * 80 }]
    })
    expect(saved[index - 1].lines).toHaveLength(1)
    await expect(page.locator('.el-message')).toHaveCount(0)
  }
})
