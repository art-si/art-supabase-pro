import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)

for (const mode of [
  { action: 'Special', label: '特殊核销', switchLabel: '', revoke: 'Alt+Shift+1' },
  {
    action: 'CrossCustomer',
    label: '跨往来单位核销',
    switchLabel: '允许往来单位不同',
    revoke: 'Alt+Shift+Minus'
  },
  {
    action: 'CrossCurrency',
    label: '异币别核销',
    switchLabel: '异币别核销',
    revoke: 'Alt+Shift+Equal'
  }
]) {
  test(`两组${mode.label}确认期间撤权阻断、恢复后失败重试`, async ({ page }, info) => {
    const special = mode.action === 'Special'
    const organization = '33333333-3333-4333-8333-333333333333'
    const tenant = '11111111-1111-4111-8111-111111111111'
    const writes: Array<{
      requestId: string
      relationKind: string
      reason: string
      sides: unknown[]
    }> = []
    let group = 1
    let fail = true
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (name === 'mdm_organization')
        return route.fulfill({
          json: [
            {
              id: organization,
              tenant_id: tenant,
              parent_id: null,
              organization_name: '特殊核销结算公司',
              organization_type: 'company',
              status: '1'
            }
          ]
        })
      if (name === 'fms_ar_options_secure')
        return route.fulfill({
          json:
            body.p_type === 'initialized_organization'
              ? [{ id: organization, tenant_id: tenant, name: '特殊核销结算公司' }]
              : []
        })
      if (name === 'sys_dictionary') {
        const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
        const values =
          code === 'arWriteoffRelation'
            ? [['receivable_receipt', '应收收款核销']]
            : code === 'arCounterpartyType'
              ? [['customer', '客户']]
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
      if (name === 'fms_receivable_writeoff_candidates_secure')
        return route.fulfill({
          json: {
            records: ['financial', 'receipt'].map((sourceType) => ({
              id: `${sourceType}-${group}`,
              documentId: `doc-${group}`,
              documentNo: `QA-${sourceType}-${group}`,
              tenantId: tenant,
              sourceType,
              status: sourceType === 'receipt' ? 'confirmed' : 'approved',
              organizationId: organization,
              customerId: mode.action === 'CrossCustomer' ? `customer-${sourceType}` : 'customer',
              customerName: '特殊核销客户',
              currencyCode:
                mode.action === 'CrossCurrency' && sourceType === 'receipt' ? 'USD' : 'CNY',
              exchangeRate: 1,
              businessDate: '2026-10-25',
              amount: group * 100,
              availableAmount: group * 100
            })),
            summary: {}
          }
        })
      if (name === 'fms_execute_receivable_writeoff_secure') {
        writes.push(body.p_payload)
        if (fail)
          return route.fulfill({
            status: 409,
            json: { code: 'P0001', message: '特殊核销失败，请重试' }
          })
        group++
        return route.fulfill({ json: `writeoff-${group - 1}` })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const permissions = ['View', ...(special ? ['Special'] : ['Writeoff', mode.action])]
      .map((action) => `FinanceReceiptWriteoff:${action}`)
      .join(',')
    if (!special) {
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=writeoff&permissions=FinanceReceiptWriteoff:View,FinanceReceiptWriteoff:Writeoff`
      )
      await expect(page.getByRole('switch', { name: mode.switchLabel, exact: true })).toBeDisabled()
      expect(writes).toHaveLength(0)
    }
    for (const index of [1, 2]) {
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=writeoff&theme=${theme}&permissionControls&permissions=${permissions}`
      )
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
      await page.getByLabel('结算组织', { exact: true }).click()
      await page.getByRole('treeitem', { name: '特殊核销结算公司', exact: true }).click()
      await page.getByRole('button', { name: '查询待核销单据' }).click()
      if (!special) {
        await expect(page.getByText(`QA-financial-${index}`, { exact: true })).toHaveCount(0)
        const toggle = page.getByRole('switch', { name: mode.switchLabel, exact: true })
        await expect(toggle).toBeEnabled()
        await toggle.locator('..').click()
        await expect(toggle).toBeChecked()
      }
      await expect(page.getByText(`QA-financial-${index}`, { exact: true })).toBeVisible()
      await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
      if (!special) await page.locator('.el-table__header-wrapper .el-checkbox').nth(1).click()
      await page.getByRole('button', { name: special ? '特殊核销' : '核销', exact: true }).click()
      const dialog = page.getByRole('dialog', {
        name: special ? '特殊核销确认' : '核销确认',
        exact: true
      })
      if (special) {
        await dialog.getByRole('button', { name: '执行核销', exact: true }).click()
        await expect(page.getByText('请填写特殊核销原因', { exact: true })).toBeVisible()
      }
      await dialog.getByLabel('业务原因 / 核销备注').fill(`特殊核销原因${index}`)
      if (index === 2) {
        await expect(page.locator('.el-message')).toHaveCount(0)
        await dialog.screenshot({ path: info.outputPath(`${mode.action}-confirm.png`) })
      }
      const before = writes.length
      await page.keyboard.press(mode.revoke)
      await dialog.getByRole('button', { name: '执行核销', exact: true }).click()
      await expect(
        page.getByText('操作范围或权限已变化，请重新打开核销确认', { exact: true })
      ).toBeVisible()
      expect(writes).toHaveLength(before)
      await page.keyboard.press('Alt+Shift+5')
      await dialog.getByRole('button', { name: '执行核销', exact: true }).click()
      if (index === 1) {
        await expect(page.getByText('特殊核销失败，请重试', { exact: true })).toBeVisible()
        fail = false
        await dialog.getByRole('button', { name: '执行核销', exact: true }).click()
        expect(writes[0].requestId).toBe(writes[1].requestId)
      }
      await expect(dialog).not.toBeVisible()
      expect(writes.at(-1)).toMatchObject({
        relationKind: special ? 'special' : 'receivable_receipt',
        crossCustomer: mode.action === 'CrossCustomer',
        crossCurrency: mode.action === 'CrossCurrency',
        reason: `特殊核销原因${index}`,
        sides: [
          {
            id: `financial-${index}`,
            sourceType: 'financial',
            side: 'primary',
            amount: index * 100
          },
          ...(special
            ? []
            : [
                {
                  id: `receipt-${index}`,
                  sourceType: 'receipt',
                  side: 'secondary',
                  amount: index * 100
                }
              ])
        ]
      })
      expect(writes.at(-1)?.sides).toHaveLength(special ? 1 : 2)
    }
    expect(writes).toHaveLength(3)
    expect(writes[1].requestId).not.toBe(writes[2].requestId)
  })
}
