import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

for (const kind of ['estimated', 'financial'])
  for (const allowed of ['none', 'add', 'source', 'both'])
    test(`${kind} 导入所需新增与来源查看权限 ${allowed}`, async ({ page }) => {
      await page.route('**/rest/v1/**', (route) =>
        route.fulfill({
          json: new URL(route.request().url()).pathname.endsWith(
            '/fms_purchase_payable_list_secure'
          )
            ? { data: [], total: 0 }
            : []
        })
      )
      const permission = kind === 'estimated' ? 'FinanceEstimatedPayable' : 'FinancePurchasePayable'
      const rights = [
        `${permission}:View`,
        `${permission}:Import`,
        ...(['add', 'both'].includes(allowed) ? [`${permission}:Add`] : []),
        ...(['source', 'both'].includes(allowed) ? ['FinanceCarrierSettlement:View'] : [])
      ]
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&permissions=${rights.join(',')}`
      )
      const button = page.getByRole('button', { name: '导入TMS', exact: true })
      await expect(button).toBeVisible()
      if (allowed === 'both') await expect(button).toBeEnabled()
      else await expect(button).toBeDisabled()
    })

for (const kind of ['estimated', 'financial'])
  test(`${kind} 两承运结算导入、失败重试与选择期间撤权`, async ({ page }, info) => {
    const attempts: Array<{ p_kind: string; p_statement_id: string }> = []
    const records: Array<Record<string, unknown>> = []
    let fail = true
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (name === 'fms_purchase_payable_list_secure')
        return route.fulfill({ json: { data: records, total: records.length } })
      if (name === 'fms_payable_options_secure')
        return route.fulfill({
          json: [1, 2].map((index) => ({
            id: `statement-${index}`,
            name: `QA-CARRIER-${index}`,
            description: `验收承运商${index}`
          }))
        })
      if (name === 'fms_import_carrier_payable_secure') {
        attempts.push(body)
        if (fail)
          return route.fulfill({
            status: 409,
            json: { code: '40001', message: '承运结算已变化，请重试' }
          })
        const index = body.p_statement_id.endsWith('1') ? 1 : 2
        const record = {
          id: `import-${index}`,
          kind,
          document_no: `QA-IMPORT-${index}`,
          status: 'draft',
          currency_code: 'CNY',
          total_amount: index * 100,
          business_date: '2026-10-25',
          supplier_name: `验收承运商${index}`,
          lines: []
        }
        records.push(record)
        return route.fulfill({ json: record })
      }
      return route.fulfill({ json: [] })
    })
    const permission = kind === 'estimated' ? 'FinanceEstimatedPayable' : 'FinancePurchasePayable'
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}&permissionControls=1&permissions=${permission}:View,${permission}:Import,${permission}:Add,FinanceCarrierSettlement:View`
    )
    const choose = async (index: number) => {
      await page.getByRole('button', { name: '导入TMS', exact: true }).click()
      const picker = page.getByRole('dialog', { name: '导入TMS承运结算', exact: true })
      await picker.getByText(`QA-CARRIER-${index}`, { exact: true }).click()
      return picker
    }
    for (const index of [1, 2]) {
      await expect(page.locator('.el-message')).toHaveCount(0)
      const picker = await choose(index)
      const before = attempts.length
      await page.keyboard.press('Alt+Shift+7')
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      await expect(
        page.getByText('操作范围或权限已变化，请重新选择承运结算', { exact: true })
      ).toBeVisible()
      expect(attempts).toHaveLength(before)
      await page.keyboard.press('Alt+Shift+5')
      const next = await choose(index)
      if (index === 2) {
        await expect(page.locator('.el-message')).toHaveCount(0)
        await next.screenshot({ path: info.outputPath('carrier-import-picker.png') })
      }
      await next.getByRole('button', { name: '确定', exact: true }).click()
      if (index === 1) {
        await expect(page.locator('.el-message--error')).toHaveCount(1)
        fail = false
        const retry = await choose(index)
        await retry.getByRole('button', { name: '确定', exact: true }).click()
      }
      await expect(page.getByText(`QA-IMPORT-${index}`, { exact: true })).toBeVisible()
    }
    expect(attempts).toEqual(
      [1, 1, 2].map((index) => ({ p_kind: kind, p_statement_id: `statement-${index}` }))
    )
  })
