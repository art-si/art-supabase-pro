import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)
const tenant = '11111111-1111-4111-8111-111111111111'

test('两收款草稿编辑金额、撤权阻断及失败重试回读', async ({ page }, info) => {
  const attempts: Array<{
    id: string
    lines: Array<{ id: string; amount: number }>
    remark: string
  }> = []
  const records = [1, 2].map((index) => ({
    id: `receipt-${index}`,
    document_no: `QA-RECEIPT-${index}`,
    tenant_id: tenant,
    status: 'draft',
    customer_id: 'customer',
    customer_name: '编辑收款客户',
    settlement_organization_id: 'company',
    organization_name: '编辑收款公司',
    business_date: '2026-10-25',
    currency_code: 'CNY',
    payment_method: 'cash',
    amount: index * 100,
    remark: `原备注${index}`,
    lines: [
      { id: `line-${index}`, line_no: 10, financial_line_id: null, amount: index * 100, remark: '' }
    ]
  }))
  let fail = true
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (name === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const values =
        code === 'arSettlementMethod'
          ? [['cash', '现金']]
          : code === 'arDocumentStatus'
            ? [['draft', '草稿']]
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
            parent_id: null,
            tenant_id: tenant,
            organization_name: '编辑收款公司',
            organization_type: 'company',
            status: '1'
          }
        ]
      })
    if (name === 'fms_ar_options_secure')
      return route.fulfill({
        json:
          body.p_type === 'company'
            ? [{ id: 'company', tenant_id: tenant, name: '编辑收款公司' }]
            : body.p_type === 'customer'
              ? [{ id: 'customer', tenant_id: tenant, name: '编辑收款客户' }]
              : []
      })
    if (name === 'fms_receivable_workspace_secure')
      return route.fulfill({ json: { records, total: records.length } })
    if (name === 'fms_save_receipt_secure') {
      attempts.push(body.p_payload)
      if (fail)
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '收款保存失败，请重试' }
        })
      const record = records.find((row) => row.id === body.p_payload.id)
      expect(record).toBeDefined()
      if (record) {
        record.amount = body.p_payload.lines.reduce(
          (total: number, row: { amount: number }) => total + row.amount,
          0
        )
        record.remark = body.p_payload.remark
        record.lines[0].amount = record.amount
      }
      return route.fulfill({ json: record?.id })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=receipt&theme=${theme}&permissionControls&permissions=FinanceReceipt:View,FinanceReceipt:Edit`
  )
  await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
  for (const index of [1, 2]) {
    await expect(page.locator('.el-message')).toHaveCount(0)
    const row = page.getByRole('row').filter({ hasText: `QA-RECEIPT-${index}` })
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '编辑收款单', exact: true })
    const amount = drawer.getByRole('spinbutton', { name: '第10行本次收款金额', exact: true })
    await expect(amount).toHaveValue(`${index}00.00`)
    await amount.fill(`${index * 80}`)
    await amount.press('Tab')
    await drawer.getByRole('textbox', { name: '备注', exact: true }).fill(`修改备注${index}`)
    if ((info.project.use.viewport?.width ?? 1440) <= 640)
      await expect
        .poll(() =>
          amount.evaluate((element) => {
            const input = element.getBoundingClientRect()
            const table = element.closest('.el-table__body-wrapper')?.getBoundingClientRect()
            return (
              input.left >= Math.max(0, table?.left ?? 0) &&
              input.right <= Math.min(innerWidth, table?.right ?? innerWidth)
            )
          })
        )
        .toBe(true)
    const before = attempts.length
    await page.keyboard.press('Alt+Shift+4')
    await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
    await expect(
      page.getByText('操作范围或权限已变化，请重新打开收款单', { exact: true })
    ).toBeVisible()
    expect(attempts).toHaveLength(before)
    await page.keyboard.press('Alt+Shift+5')
    if (index === 2) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      await amount.scrollIntoViewIfNeeded()
      await drawer.screenshot({ path: info.outputPath('receipt-edit.png') })
    }
    await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
    if (index === 1) {
      await expect(page.getByText('收款保存失败，请重试', { exact: true })).toBeVisible()
      await expect(amount).toHaveValue('80.00')
      fail = false
      await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
    }
    await expect(drawer).not.toBeVisible()
    await expect(row).toContainText(`修改备注${index}`)
    await expect(row).toContainText(`${index * 80}.00`)
    expect(attempts.at(-1)).toMatchObject({
      id: `receipt-${index}`,
      tenantId: tenant,
      settlementOrganizationId: 'company',
      lines: [{ id: `line-${index}`, amount: index * 80 }]
    })
  }
  expect(attempts).toHaveLength(3)
})
