import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

const tenant = '11111111-1111-4111-8111-111111111111'
interface RefundRecord {
  id: string
  document_no: string
  status: string
  payment_status: string
  lines: Array<{
    refund_payment_line_id: string
    amount: number
    purpose_id: string
    fund_account_id: string
  }>
  organization_id: string
  account_set_id: string
}

for (const theme of ['light', 'dark']) {
  test(`付款退款 ${theme} 两张新增、零值阻断、组织树、审核到账及失败恢复`, async ({
    page
  }, info) => {
    const records: RefundRecord[] = []
    const saves: RefundRecord[] = []
    const actions: Array<{ p_ids: string[]; p_action: string }> = []
    let failSave = true
    let failAction = true
    const sourceLines = [1, 2].map((index) => ({
      line_no: 10,
      refund_payment_line_id: `paid-line-${index}`,
      refund_payment_document_no: `QA-PAID-${index}`,
      account_set_id: 'book',
      supplier_id: `supplier-${index}`,
      supplier_name: `验收供应商${index}`,
      payee_supplier_id: `supplier-${index}`,
      payee_supplier_name: `验收供应商${index}`,
      source_purpose_business_type: 'purchase',
      available_refund_amount: index * 100,
      available_refund_discount: 0,
      settlement_method_id: 'bank',
      fund_account_id: 'fund',
      details: {}
    }))
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (name === 'fms_payable_settlement_list_secure') {
        expect(body.p_kind).toBe('refund')
        const rows = body.p_query?.id
          ? records.filter((row) => row.id === body.p_query.id)
          : records
        return route.fulfill({ json: { data: rows, total: rows.length } })
      }
      if (name === 'mdm_organization')
        return route.fulfill({
          json: [
            {
              id: 'company',
              tenant_id: tenant,
              organization_name: '验收公司',
              organization_code: 'C',
              parent_id: null,
              status: '1'
            },
            {
              id: 'finance',
              tenant_id: tenant,
              organization_name: '验收财务部',
              organization_code: 'F',
              parent_id: 'company',
              status: '1'
            }
          ]
        })
      if (name === 'fms_payable_settlement_options_secure')
        return route.fulfill({
          json: {
            tenant_id: tenant,
            document_type: [{ id: 'refund-type', name: '采购付款退款', is_default: true }],
            purpose: [{ id: 'refund-purpose', name: '采购退款', business_type: 'purchase_refund' }],
            method: [{ id: 'bank', name: '电汇', category: 'remittance' }],
            fund: [
              {
                id: 'fund',
                name: '演示退款收款账户',
                account_set_id: 'book',
                category: 'bank',
                currency_code: 'CNY'
              },
              {
                id: 'other-fund',
                name: '其他账套账户',
                account_set_id: 'other-book',
                category: 'bank',
                currency_code: 'CNY'
              }
            ],
            currency: [{ id: 'CNY', code: 'CNY', name: '人民币' }],
            supplier: [1, 2].map((index) => ({
              id: `supplier-${index}`,
              name: `验收供应商${index}`
            })),
            organization: [],
            project: [],
            purchase: [],
            payable: [],
            expense: [],
            bank: [],
            refund_source: sourceLines
          }
        })
      if (name === 'fms_save_payable_settlement_secure') {
        saves.push(body.p_document)
        if (failSave)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '退款保存失败，请重试' }
          })
        const index = records.length + 1
        const record = {
          ...body.p_document,
          id: `refund-${index}`,
          record_key: `refund-${index}`,
          document_no: `QA-REFUND-${index}`,
          status: 'draft',
          payment_status: 'none',
          amount: index * 100,
          organization_name: '验收财务部',
          document_type_name: '采购付款退款',
          counterparty_name: `验收供应商${index}`,
          version: 1
        }
        records.push(record)
        return route.fulfill({ json: record })
      }
      if (name === 'fms_act_payable_settlement_secure') {
        actions.push(body)
        if (failAction)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '退款处理失败，请重试' }
          })
        records
          .filter((row) => body.p_ids.includes(row.id))
          .forEach((row) => {
            row.status =
              body.p_action === 'submit'
                ? 'submitted'
                : body.p_action === 'approve'
                  ? 'approved'
                  : 'confirmed'
            row.payment_status = body.p_action === 'confirm' ? 'full' : 'none'
          })
        return route.fulfill({ json: records })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=refund&theme=${theme}`)
    for (const index of [1, 2]) {
      await page.getByRole('button', { name: '新增', exact: true }).click()
      const drawer = page.getByRole('dialog')
      await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
      await drawer.getByRole('combobox', { name: '退款组织' }).click()
      await page
        .getByRole('treeitem', { name: '验收公司' })
        .locator('.el-tree-node__expand-icon')
        .first()
        .click()
      await page.getByRole('treeitem', { name: '验收财务部', exact: true }).click()
      await drawer.getByRole('textbox', { name: '摘要', exact: true }).fill(`退款验收${index}`)
      await drawer.getByRole('button', { name: '新增明细', exact: true }).click()
      await drawer.getByRole('combobox', { name: '原付款明细', exact: true }).click()
      await page.getByRole('option', { name: new RegExp(`QA-PAID-${index}`) }).click()
      await drawer.getByRole('combobox', { name: '退款收款账户', exact: true }).click()
      await expect(page.getByRole('option', { name: '其他账套账户' })).toHaveCount(0)
      await page.getByRole('option', { name: '演示退款收款账户' }).click()
      const amount = drawer.getByRole('spinbutton', { name: '退款本金', exact: true })
      await amount.fill('0')
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      expect(saves).toHaveLength(index === 1 ? 0 : 2)
      await expect(page.locator('.el-message--warning').last()).toContainText('金额不正确')
      await amount.fill(String(index * 100))
      if (index === 2) {
        await expect(page.locator('.el-message')).toHaveCount(0)
        await drawer.getByRole('combobox', { name: '退款组织' }).scrollIntoViewIfNeeded()
        await drawer.screenshot({ path: info.outputPath(`refund-${theme}-form-header.png`) })
        await amount.scrollIntoViewIfNeeded()
        await drawer.screenshot({ path: info.outputPath(`refund-${theme}-form-lines.png`) })
      }
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      if (index === 1) {
        await expect(page.locator('.el-message--error')).toHaveCount(1)
        await expect(drawer.getByRole('textbox', { name: '摘要', exact: true })).toHaveValue(
          '退款验收1'
        )
        failSave = false
        await drawer.getByRole('button', { name: '保存', exact: true }).click()
      }
      await expect(drawer).not.toBeVisible()
      await expect(page.getByText(`QA-REFUND-${index}`, { exact: true })).toBeVisible()
    }
    records.forEach((row, index) => {
      expect(row).toMatchObject({ organization_id: 'finance', account_set_id: 'book' })
      expect(row.lines[0]).toMatchObject({
        refund_payment_line_id: `paid-line-${index + 1}`,
        purpose_id: 'refund-purpose',
        fund_account_id: 'fund',
        amount: (index + 1) * 100
      })
    })
    const selectAll = async () => {
      const checkbox = page.getByRole('checkbox', { name: '选择所有行', exact: true })
      if (!(await checkbox.isChecked()))
        await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    }
    await expect(page.locator('.el-message')).toHaveCount(0)
    await selectAll()
    await page.getByRole('button', { name: '提交', exact: true }).click()
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    expect(records.every((row) => row.status === 'draft')).toBe(true)
    failAction = false
    for (const action of ['提交', '审核']) {
      await selectAll()
      await page.getByRole('button', { name: action, exact: true }).click()
      await expect(page.getByRole('row').filter({ hasText: 'QA-REFUND-2' })).toContainText(
        action === '提交' ? '已提交' : '已审核'
      )
    }
    await selectAll()
    await page.getByRole('button', { name: '确认到账', exact: true }).click()
    await page.getByRole('menuitem', { name: '确认到账', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('退款已实际到账')
    await page.getByRole('button', { name: '确认登记', exact: true }).click()
    await expect(page.getByRole('row').filter({ hasText: 'QA-REFUND-2' })).toContainText(
      '已确认到账'
    )
    expect(actions.map((row) => row.p_action)).toEqual(['submit', 'submit', 'approve', 'confirm'])
    expect(actions.every((row) => row.p_ids.join(',') === 'refund-1,refund-2')).toBe(true)
    await expect(page.locator('.el-message')).toHaveCount(0)
    await page.screenshot({
      path: info.outputPath(`refund-${theme}-confirmed.png`),
      fullPage: true
    })
  })
}
