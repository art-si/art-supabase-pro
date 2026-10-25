import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)

for (const [kind, title, permission] of [
  ['estimated', '暂估应付单', 'FinanceEstimatedPayable'],
  ['financial', '财务应付单', 'FinancePurchasePayable']
]) {
  test(`${kind} 制证与凭证查看权限四组合，两条单据分别处理`, async ({ page }, info) => {
    const makeRecords = () =>
      [1, 2].map((index) => ({
        id: `permission-${index}`,
        record_key: `permission-${index}`,
        document_no: `QA-VOUCHER-PERM-${index}`,
        kind,
        status: 'approved',
        amount: index * 100,
        tax_amount: 0,
        total_amount: index * 100,
        currency_code: 'CNY',
        business_date: '2026-10-24',
        voucher_id: '',
        lines: []
      }))
    let records = makeRecords()
    let generated: string[] = []
    let reads = 0
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const input = route.request().postDataJSON() || {}
      if (name === 'fms_purchase_payable_list_secure') {
        reads++
        const data = input.p_id ? records.filter((row) => row.id === input.p_id) : records
        return route.fulfill({ json: { data, total: data.length } })
      }
      if (name === 'fms_payable_voucher_secure') {
        generated.push(input.p_id)
        const row = records.find((record) => record.id === input.p_id)
        expect(row).toBeDefined()
        if (!row) throw new Error('没有对应隔离单据')
        row.voucher_id = `voucher-${row.id}`
        return route.fulfill({
          json: {
            voucher_id: row.voucher_id,
            event_id: `event-${row.id}`,
            status: 'generated',
            message: '凭证已生成'
          }
        })
      }
      return route.fulfill({ json: [] })
    })
    for (const grant of [
      { source: false, target: false },
      { source: false, target: true },
      { source: true, target: false },
      { source: true, target: true }
    ]) {
      records = makeRecords()
      generated = []
      const permissions = [
        `${permission}:View`,
        ...(grant.source ? [`${permission}:Voucher`] : []),
        ...(grant.target ? ['FinanceVoucherCenter:View'] : [])
      ]
      for (const index of [1, 2]) {
        await page.goto(
          `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&keepAlive=1&permissions=${permissions.join(',')}`
        )
        await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
          timeout: 60000
        })
        if (info.project.use.colorScheme === 'dark')
          await expect(page.locator('html')).toHaveClass(/dark/)
        await page
          .getByRole('row')
          .filter({ hasText: `QA-VOUCHER-PERM-${index}` })
          .locator('label.el-checkbox')
          .click()
        const action = page.getByRole('button', { name: '生成凭证', exact: true })
        if (!grant.source) {
          await expect(action).toHaveCount(0)
          continue
        }
        const previousReads = reads
        await action.click()
        await page.getByRole('menuitem', { name: '生成凭证', exact: true }).click()
        await expect(page.locator('.el-message--success').last()).toContainText('记账凭证已生成')
        if (grant.target) {
          await expect(
            page.getByRole('heading', { name: '凭证中心导航目标', exact: true })
          ).toBeVisible()
          await expect(page.getByText(`voucher-permission-${index}`, { exact: true })).toBeVisible()
        } else {
          await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
          await expect(
            page.getByRole('heading', { name: '凭证中心导航目标', exact: true })
          ).toHaveCount(0)
          await expect.poll(() => reads).toBeGreaterThan(previousReads)
          if (index === 2) {
            await expect(page.locator('.el-message--success')).toHaveCount(0)
            await page.screenshot({
              path: info.outputPath('generated-without-voucher-view.png'),
              fullPage: true
            })
          }
        }
      }
      expect(generated).toEqual(grant.source ? ['permission-1', 'permission-2'] : [])
      expect(records.map((row) => row.voucher_id)).toEqual(
        grant.source ? ['voucher-permission-1', 'voucher-permission-2'] : ['', '']
      )
    }
  })
}
