import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)
const tenant = '11111111-1111-4111-8111-111111111111'

for (const kind of ['estimate', 'financial'])
  test(`${kind} 两条空白新增服务草稿、必填与失败重试`, async ({ page }, info) => {
    const attempts: Array<{
      requestId: string
      id: string | null
      lines: Array<{ materialDescription: string; enteredGrossAmount: number }>
    }> = []
    const saved: typeof attempts = []
    let fail = true
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (name === 'sys_dictionary') {
        const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
        const dictionaries: Record<string, string[][]> = {
          arTaxRate: [['0', '0%']],
          arBasis: [['amount', '金额']],
          arDiscountMethod: [['none', '无']],
          arSettlementMethod: [['cash', '现金']],
          mdmCurrency: [['CNY', '人民币']],
          arDocumentStatus: [['draft', '草稿']]
        }
        return route.fulfill({
          json: (dictionaries[code] || []).map(([value, label]) => ({
            id: `${code}-${value}`,
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
              id: 'group',
              tenant_id: tenant,
              organization_code: 'G',
              organization_name: '新增验收集团',
              parent_id: null,
              status: '1'
            },
            {
              id: 'company',
              tenant_id: tenant,
              organization_code: 'C',
              organization_name: '新增验收公司',
              parent_id: 'group',
              status: '1'
            }
          ]
        })
      if (name === 'fms_ar_options_secure')
        return route.fulfill({
          json: body.p_type.endsWith('_type')
            ? [{ id: 'type', tenant_id: tenant, name: '新增验收单据类型' }]
            : body.p_type === 'customer'
              ? [{ id: 'customer', tenant_id: tenant, name: '新增验收客户' }]
              : body.p_type === 'company'
                ? [{ id: 'company', tenant_id: tenant, name: '新增验收公司' }]
                : []
        })
      if (name === 'fms_receivable_workspace_secure')
        return route.fulfill({
          json: {
            records: saved.map((row, index) => ({
              id: `new-${index + 1}`,
              tenant_id: tenant,
              document_no: `QA-BLANK-${index + 1}`,
              kind,
              status: 'draft',
              currency_code: 'CNY',
              lines: [],
              total_amount: (index + 1) * 100
            })),
            total: saved.length
          }
        })
      if (name === 'fms_save_receivable_document_secure') {
        attempts.push(body.p_payload)
        if (fail)
          return route.fulfill({
            status: 409,
            json: { code: '40001', message: '验收保存冲突，请重试' }
          })
        saved.push(body.p_payload)
        return route.fulfill({ json: `new-${saved.length}` })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const permission =
      kind === 'estimate' ? 'FinanceEstimatedReceivable' : 'FinanceFinancialReceivable'
    await page.goto(
      `/tests/e2e/fixtures/receivable-workspace.html?kind=${kind}&theme=${theme}&permissionControls=1&permissions=${permission}:View,${permission}:Add`
    )
    for (const index of [1, 2]) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      await page.getByRole('button', { name: '新增', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: '保存应收单', exact: true }).click()
      expect(attempts).toHaveLength(index === 1 ? 0 : 2)
      await dialog.getByRole('textbox', { name: '结算客户' }).click()
      const picker = page.getByRole('dialog', { name: '参选结算客户', exact: true })
      await picker.getByText('新增验收客户', { exact: true }).click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      await dialog.getByRole('combobox', { name: '收款组织' }).click()
      const group = page.getByRole('treeitem', { name: '新增验收集团' })
      await expect(group).toHaveAttribute('aria-disabled', 'true')
      await group.locator('.el-tree-node__expand-icon').first().click()
      await page.getByRole('treeitem', { name: '新增验收公司', exact: true }).click()
      await dialog.getByRole('button', { name: '新增服务行', exact: true }).click()
      await dialog
        .getByRole('textbox', { name: '物料或服务描述 第10行', exact: true })
        .fill(`空白新增服务${index}`)
      await dialog.getByRole('combobox', { name: '税率 第10行', exact: true }).press('Enter')
      await page.getByRole('option', { name: '0%', exact: true }).click()
      const amount = dialog.getByRole('spinbutton', {
        name: '录入价税合计(元) 第10行',
        exact: true
      })
      await amount.fill(String(index * 100))
      await amount.blur()
      const beforeRevocation = attempts.length
      await page.keyboard.press('Alt+Shift+4')
      await dialog.getByRole('button', { name: '保存应收单', exact: true }).click()
      await expect(
        page.getByText('操作范围或权限已变化，请重新打开应收单', { exact: true })
      ).toBeVisible()
      expect(attempts).toHaveLength(beforeRevocation)
      await page.keyboard.press('Alt+Shift+5')
      await dialog.getByRole('button', { name: '保存应收单', exact: true }).click()
      if (index === 1) {
        await expect(page.locator('.el-message--error')).toHaveCount(1)
        await expect(amount).toHaveValue('100.00')
        fail = false
        await dialog.getByRole('button', { name: '保存应收单', exact: true }).click()
      }
      await expect(dialog).toBeHidden()
      await expect(page.getByText(`QA-BLANK-${index}`, { exact: true })).toBeVisible()
    }
    expect(saved).toHaveLength(2)
    expect(attempts[0].requestId).toBe(attempts[1].requestId)
    saved.forEach((row, index) => {
      expect(row).toMatchObject({
        tenantId: tenant,
        kind,
        customerId: 'customer',
        settlementOrganizationId: 'company'
      })
      expect(row.lines[0]).toMatchObject({
        materialDescription: `空白新增服务${index + 1}`,
        basis: 'amount',
        taxRate: 0,
        enteredGrossAmount: (index + 1) * 100
      })
      expect(row.id).toBeUndefined()
    })
  })
