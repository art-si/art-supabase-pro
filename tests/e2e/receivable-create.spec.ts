import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

const tenant = '11111111-1111-4111-8111-111111111111'

for (const kind of ['receipt', 'refund'] as const) {
  test(`${kind} 两条新增草稿、必填阻断、失败保留及组织来源字段`, async ({ page }, info) => {
    let fail = true
    const saved: Record<string, unknown>[] = []
    const attempts: Record<string, unknown>[] = []
    const sources = [1, 2].map((index) => ({
      id: `receipt-source-${index}`,
      tenant_id: tenant,
      document_no: `QA-ORIGINAL-${index}`,
      status: 'confirmed',
      customer_name: `来源客户${index}`,
      refundable_amount: index * 100,
      amount: index * 100,
      currency_code: 'CNY'
    }))
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const resource = url.pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (resource === 'sys_dictionary') {
        const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
        const values =
          code === 'arSettlementMethod'
            ? [['bank_transfer', '电汇']]
            : code === 'mdmCurrency'
              ? [['CNY', '人民币']]
              : code === 'arDocumentStatus'
                ? [['draft', '草稿']]
                : []
        return route.fulfill({
          json: values.map(([value, label]) => ({
            id: `${code}-${value}`,
            code: value,
            value,
            label,
            status: '1',
            dict_type_table: { code, name: code }
          }))
        })
      }
      if (resource === 'mdm_organization')
        return route.fulfill({
          json: [
            {
              id: 'group',
              tenant_id: tenant,
              organization_code: 'G',
              organization_name: '验收集团',
              organization_type: 'group',
              parent_id: null,
              status: '1'
            },
            {
              id: 'company',
              tenant_id: tenant,
              organization_code: 'C',
              organization_name: '验收公司',
              organization_type: 'company',
              parent_id: 'group',
              status: '1'
            }
          ]
        })
      if (resource === 'fms_ar_options_secure')
        return route.fulfill({
          json:
            body.p_type === 'company'
              ? [{ id: 'company', tenant_id: tenant, name: '验收公司' }]
              : body.p_type === 'customer'
                ? [{ id: 'customer', tenant_id: tenant, name: '验收客户', code: 'KH' }]
                : body.p_type === 'fund'
                  ? [{ id: 'fund', tenant_id: tenant, name: '演示收款账户', currency_code: 'CNY' }]
                  : []
        })
      if (resource === 'fms_receivable_workspace_secure')
        return route.fulfill({
          json: {
            records:
              body.p_query?.status === 'confirmed'
                ? sources
                : saved.map((row, index) => ({
                    id: `saved-${index}`,
                    document_no: `QA-NEW-${index + 1}`,
                    status: 'draft',
                    tenant_id: tenant,
                    amount: row.amount ?? 100,
                    currency_code: 'CNY'
                  })),
            total: body.p_query?.status === 'confirmed' ? 2 : saved.length
          }
        })
      if (
        resource ===
        (kind === 'receipt' ? 'fms_save_receipt_secure' : 'fms_save_receivable_refund_secure')
      ) {
        attempts.push(body.p_payload)
        if (fail)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '验收保存失败，请重试' }
          })
        saved.push(body.p_payload)
        return route.fulfill({ json: `saved-${saved.length}` })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=${theme}`)
    for (const index of [1, 2]) {
      await page.getByRole('button', { name: '新增', exact: true }).click()
      const drawer = page.getByRole('dialog').filter({ hasText: '保存草稿' })
      await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
      expect(attempts).toHaveLength(index === 1 ? 0 : 2)
      if (kind === 'receipt') {
        await drawer.getByRole('textbox', { name: '结算客户' }).click()
        const picker = page.getByRole('dialog', { name: '选择结算客户' })
        await picker.getByText('验收客户', { exact: true }).click()
        await picker.getByRole('button', { name: '确定', exact: true }).click()
        await drawer.getByRole('combobox', { name: '结算组织' }).click()
        await expect(page.getByRole('treeitem', { name: '验收集团' })).toHaveAttribute(
          'aria-disabled',
          'true'
        )
        await page
          .getByRole('treeitem', { name: '验收集团' })
          .locator('.el-tree-node__expand-icon')
          .first()
          .click()
        await page.getByRole('treeitem', { name: '验收公司', exact: true }).click()
        await drawer
          .getByRole('spinbutton', { name: '第10行本次收款金额' })
          .fill(String(index * 100))
        await drawer
          .getByRole('textbox', { name: '备注', exact: true })
          .fill(`新增收款验收${index}`)
      } else {
        await drawer.getByRole('textbox', { name: '原收款单' }).click()
        const picker = page.getByRole('dialog', { name: '参选原收款单' })
        await picker.getByText(`QA-ORIGINAL-${index}`, { exact: true }).click()
        await picker.getByRole('button', { name: '确定', exact: true }).click()
        await drawer.getByRole('spinbutton', { name: '退款金额' }).fill(String(index * 10))
        await drawer.getByRole('textbox', { name: '退款原因' }).fill(`退款验收${index}`)
      }
      const amount = drawer.getByRole('spinbutton', {
        name: kind === 'receipt' ? '第10行本次收款金额' : '退款金额'
      })
      await amount.fill('0')
      await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
      expect(attempts).toHaveLength(index === 1 ? 0 : 2)
      await expect(drawer).toContainText(
        kind === 'receipt' ? '收款金额须大于0' : '退款金额须大于零'
      )
      await amount.fill(String(index * (kind === 'receipt' ? 100 : 10)))
      await amount.blur()
      if (index === 2) {
        await expect(page.locator('.el-message')).toHaveCount(0)
        await drawer.screenshot({ path: info.outputPath(`${kind}-form.png`) })
      }
      await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
      if (index === 1) {
        await expect(page.locator('.el-message--error')).toHaveCount(1)
        await expect(drawer).toBeVisible()
        await expect(
          drawer.getByRole('textbox', {
            name: kind === 'receipt' ? '备注' : '退款原因',
            exact: kind === 'receipt'
          })
        ).toHaveValue(kind === 'receipt' ? '新增收款验收1' : '退款验收1')
        fail = false
        await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
      }
      await expect(drawer).not.toBeVisible()
      await expect(page.getByText(`QA-NEW-${index}`, { exact: true })).toBeVisible()
    }
    expect(saved).toHaveLength(2)
    expect(attempts[0].requestId).toBe(attempts[1].requestId)
    expect(saved[0].requestId).not.toBe(saved[1].requestId)
    saved.forEach((row, index) => {
      if (kind === 'receipt') {
        expect(row).toMatchObject({
          tenantId: tenant,
          customerId: 'customer',
          settlementOrganizationId: 'company',
          currencyCode: 'CNY',
          paymentMethod: 'bank_transfer',
          id: null
        })
        expect(row.lines).toEqual([
          { lineNo: 10, financialLineId: null, amount: (index + 1) * 100, remark: '' }
        ])
      } else
        expect(row).toMatchObject({
          originalReceiptId: `receipt-source-${index + 1}`,
          amount: (index + 1) * 10,
          remark: `退款验收${index + 1}`
        })
    })
    await expect(page.locator('.el-message')).toHaveCount(0)
    await page.screenshot({ path: info.outputPath(`${kind}-created.png`), fullPage: true })
  })
}

test('应收调整两条来源、零金额阻断及保存恢复', async ({ page }, info) => {
  const records = [1, 2].map((index) => ({
    id: `financial-${index}`,
    tenant_id: tenant,
    kind: 'financial',
    document_no: `QA-FINANCIAL-${index}`,
    status: 'approved',
    currency_code: 'CNY',
    amount: index * 100,
    available_amount: index * 100,
    lines: [
      { id: `financial-line-${index}`, line_no: 10, material_description: `验收服务${index}` }
    ]
  }))
  const saved: Record<string, unknown>[] = []
  const attempts: Record<string, unknown>[] = []
  let fail = true
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const resource = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (resource === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const values =
        code === 'arAdjustmentKind'
          ? [['decrease', '调减应收']]
          : code === 'arDocumentStatus'
            ? [['approved', '已审核']]
            : []
      return route.fulfill({
        json: values.map(([value, label]) => ({
          id: `${code}-${value}`,
          code: value,
          value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (resource === 'fms_receivable_workspace_secure') {
      const rows = body.p_query?.id ? records.filter((row) => row.id === body.p_query.id) : records
      return route.fulfill({ json: { records: rows, total: rows.length } })
    }
    if (resource === 'fms_save_receivable_adjustment_secure') {
      attempts.push(body.p_payload)
      if (fail)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '验收调整保存失败，请重试' }
        })
      saved.push(body.p_payload)
      return route.fulfill({ json: null })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=financial&theme=${theme}`)
  for (const index of [1, 2]) {
    const row = page.getByRole('row').filter({ hasText: `QA-FINANCIAL-${index}` })
    await row.locator('label.el-checkbox').click()
    await page.getByRole('button', { name: '应收调整', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '应收调整', exact: true })
    await dialog.getByRole('textbox', { name: '调整原因' }).fill(`演示调整${index}`)
    const amount = dialog.getByRole('spinbutton', { name: '调整金额' })
    await amount.fill('0')
    await dialog.getByRole('button', { name: '保存调整草稿' }).click()
    expect(attempts).toHaveLength(index === 1 ? 0 : 2)
    await expect(dialog).toContainText('调整金额须大于零')
    await amount.fill(String(index * 10))
    await amount.blur()
    if (index === 2) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      await dialog.screenshot({ path: info.outputPath('adjustment-form.png') })
    }
    await dialog.getByRole('button', { name: '保存调整草稿' }).click()
    if (index === 1) {
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(dialog.getByRole('textbox', { name: '调整原因' })).toHaveValue('演示调整1')
      fail = false
      await dialog.getByRole('button', { name: '保存调整草稿' }).click()
    }
    await expect(dialog).not.toBeVisible()
    await expect(row.getByRole('checkbox')).not.toBeChecked()
  }
  expect(saved).toHaveLength(2)
  expect(attempts[0].requestId).toBe(attempts[1].requestId)
  saved.forEach((row, index) =>
    expect(row).toMatchObject({
      financialLineId: `financial-line-${index + 1}`,
      kind: 'decrease',
      amount: (index + 1) * 10,
      reason: `演示调整${index + 1}`
    })
  )
})

test('贷方付款申请两条来源、账户币种过滤及失败重试', async ({ page }, info) => {
  const sources = [1, 2].map((index) => ({
    id: `credit-${index}`,
    tenant_id: tenant,
    document_no: `QA-CREDIT-${index}`,
    customer_name: `贷方客户${index}`,
    status: 'approved',
    is_credit: true,
    currency_code: index === 1 ? 'CNY' : 'USD',
    available_amount: index * 100
  }))
  const saved: Array<{ p_financial_id: string; p_payload: Record<string, unknown> }> = []
  const attempts: typeof saved = []
  let fail = true
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const resource = url.pathname.split('/').at(-1)
    const body = route.request().postDataJSON()
    if (resource === 'sys_dictionary') {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      const values =
        code === 'arSettlementMethod'
          ? [['bank_transfer', '电汇']]
          : code === 'arDocumentStatus'
            ? [['draft', '草稿']]
            : []
      return route.fulfill({
        json: values.map(([value, label]) => ({
          id: `${code}-${value}`,
          code: value,
          value,
          label,
          status: '1',
          dict_type_table: { code }
        }))
      })
    }
    if (resource === 'fms_receivable_workspace_secure')
      return route.fulfill({
        json: {
          records:
            body.p_kind === 'financial'
              ? sources
              : saved.map((row, index) => ({
                  id: `payment-${index}`,
                  document_no: `QA-PAYMENT-${index + 1}`,
                  status: 'draft',
                  tenant_id: tenant,
                  amount: row.p_payload.amount,
                  currency_code: sources[index].currency_code
                })),
          total: body.p_kind === 'financial' ? 2 : saved.length
        }
      })
    if (resource === 'fms_ar_options_secure') {
      expect(body).toMatchObject({ p_type: 'fund', p_tenant_id: tenant })
      return route.fulfill({
        json: ['CNY', 'USD'].map((currency) => ({
          id: `fund-${currency}`,
          tenant_id: tenant,
          name: `演示${currency}付款账户`,
          currency_code: currency
        }))
      })
    }
    if (resource === 'fms_create_credit_payment_request_secure') {
      attempts.push(body)
      if (fail)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '验收申请生成失败，请重试' }
        })
      saved.push(body)
      return route.fulfill({ json: `payment-${saved.length}` })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=payment_request&theme=${theme}`
  )
  for (const index of [1, 2]) {
    await page.getByRole('button', { name: '新增', exact: true }).click()
    const picker = page.getByRole('dialog', { name: '选择已审核贷方应收' })
    await picker.getByText(`QA-CREDIT-${index}`, { exact: true }).click()
    await picker.getByRole('button', { name: '确定', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '贷方余额生成付款申请' })
    await expect(dialog).toContainText(`贷方客户${index}`)
    await expect(dialog.getByRole('spinbutton', { name: '本次申请金额' })).toHaveValue(
      (index * 100).toFixed(2)
    )
    await dialog.getByRole('button', { name: '生成付款申请', exact: true }).click()
    expect(attempts).toHaveLength(index === 1 ? 0 : 2)
    await dialog.getByRole('combobox', { name: '付款账户' }).click()
    const currency = index === 1 ? 'CNY' : 'USD'
    await expect(page.getByRole('option', { name: `演示${currency}付款账户` })).toBeVisible()
    await expect(
      page.getByRole('option', { name: `演示${index === 1 ? 'USD' : 'CNY'}付款账户` })
    ).toHaveCount(0)
    await page.getByRole('option', { name: `演示${currency}付款账户` }).click()
    await dialog.getByRole('textbox', { name: '付款事由' }).fill(`演示贷方付款申请${index}`)
    const amount = dialog.getByRole('spinbutton', { name: '本次申请金额' })
    await expect(amount).toHaveAttribute('max', String(index * 100))
    await amount.fill('0')
    await dialog.getByRole('button', { name: '生成付款申请', exact: true }).click()
    expect(attempts).toHaveLength(index === 1 ? 0 : 2)
    await expect(dialog).toContainText('付款金额须大于零')
    await amount.fill(String(index * 100))
    await amount.blur()
    if (index === 2) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      await dialog.screenshot({ path: info.outputPath('credit-payment-form.png') })
    }
    await dialog.getByRole('button', { name: '生成付款申请', exact: true }).click()
    if (index === 1) {
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: '付款事由' })).toHaveValue(
        '演示贷方付款申请1'
      )
      fail = false
      await dialog.getByRole('button', { name: '生成付款申请', exact: true }).click()
    }
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText(`QA-PAYMENT-${index}`, { exact: true })).toBeVisible()
  }
  expect(saved).toHaveLength(2)
  expect(attempts[0].p_payload.requestId).toBe(attempts[1].p_payload.requestId)
  saved.forEach((row, index) =>
    expect(row).toMatchObject({
      p_financial_id: `credit-${index + 1}`,
      p_payload: {
        amount: (index + 1) * 100,
        fundAccountId: `fund-${index === 0 ? 'CNY' : 'USD'}`,
        remark: `演示贷方付款申请${index + 1}`
      }
    })
  )
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('credit-payment-created.png'), fullPage: true })
})
