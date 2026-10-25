import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)

for (const config of [
  { kind: 'receipt', menu: 'FinanceReceipt' },
  { kind: 'refund', menu: 'FinanceReceiptRefund' },
  { kind: 'revenue', menu: 'FinanceRevenueCost' },
  { kind: 'payment_request', menu: 'FinanceReceivablePaymentRequest' }
]) {
  test(`${config.kind} 两草稿删除检查失败及确认期间撤权`, async ({ page }, info) => {
    const writes: Array<{ p_kind: string; p_ids: string[] }> = []
    let checkFail = true
    let deleted = false
    let concurrent = true
    let blocked = false
    let checks = 0
    const records = [1, 2].map((index) => ({
      id: `delete-${index}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      document_no: `QA-DELETE-${index}`,
      status: 'draft',
      business_date: '2026-10-25',
      customer_name: `删除检查客户${index}`,
      organization_name: '删除检查结算组织',
      currency_code: 'CNY',
      amount: index * 100,
      revenue_amount: index * 100,
      cost_amount: index * 50,
      lines: []
    }))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (name === 'fms_receivable_workspace_secure') {
        const selected = body.p_query?.ids as string[] | undefined
        const rows = deleted
          ? []
          : selected
            ? records.filter((row) => selected.includes(row.id))
            : records
        return route.fulfill({ json: { records: rows, total: rows.length } })
      }
      if (name === 'fms_ar_delete_dependencies_secure') {
        checks++
        expect(body.p_ids).toEqual(['delete-1', 'delete-2'])
        if (checkFail)
          return route.fulfill({ status: 500, json: { message: '关联检查失败，请重试' } })
        return route.fulfill({
          json: blocked
            ? [
                {
                  resource_id: 'delete-1',
                  dependency_code: 'financial',
                  record_id: 'financial-1',
                  target_id: 'financial-1',
                  record_no: 'QA-DELETE-BLOCK-001',
                  record_summary: '并发新增的财务应收引用',
                  record_status: 'approved',
                  cleanup_allowed: false
                }
              ]
            : []
        })
      }
      if (name === 'fms_delete_ar_records_secure') {
        writes.push(body)
        if (concurrent) {
          blocked = true
          return route.fulfill({
            status: 409,
            json: { code: '23503', message: '单据已被引用，请重新检查' }
          })
        }
        deleted = true
        return route.fulfill({ json: null })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const url = `/tests/e2e/fixtures/receivable-workspace.html?kind=${config.kind}&theme=${theme}&permissionControls&permissions=${config.menu}:View,${config.menu}:Delete`
    await page.goto(url)
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/)
    await expect(page.getByText('QA-DELETE-2', { exact: true })).toBeVisible()
    await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    await page.getByRole('button', { name: '批量删除', exact: true }).click()
    await expect(page.getByText('关联资料未完成核验，删除已停止', { exact: true })).toBeVisible()
    expect(writes).toHaveLength(0)
    checkFail = false
    await page.getByRole('button', { name: '重新检查', exact: true }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    expect(writes).toHaveLength(0)
    await page.getByRole('button', { name: '批量删除', exact: true }).click()
    const confirm = page.locator('.el-message-box')
    await expect(confirm).toBeVisible()
    await page.keyboard.press('Alt+Shift+9')
    await confirm.getByRole('button', { name: '删除', exact: true }).click()
    await expect(
      page.getByText('操作范围或权限已变化，请重新查询后再删除', { exact: true })
    ).toBeVisible()
    expect(writes).toHaveLength(0)
    await page.goto(url)
    await expect(page.getByText('QA-DELETE-2', { exact: true })).toBeVisible()
    await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    await page.getByRole('button', { name: '批量删除', exact: true }).click()
    const checksBeforeDelete = checks
    await confirm.getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.getByText('QA-DELETE-BLOCK-001', { exact: true })).toBeVisible()
    await expect.poll(() => checks).toBeGreaterThan(checksBeforeDelete)
    expect(writes).toHaveLength(1)
    await page.getByRole('dialog').screenshot({ path: info.outputPath('concurrent-reference.png') })
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '关闭此对话框', exact: true })
      .click()
    concurrent = false
    blocked = false
    await page.goto(url)
    await expect(page.getByText('QA-DELETE-2', { exact: true })).toBeVisible()
    await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    await page.getByRole('button', { name: '批量删除', exact: true }).click()
    await confirm.getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.getByText('QA-DELETE-1', { exact: true })).toHaveCount(0)
    await expect(page.getByText('QA-DELETE-2', { exact: true })).toHaveCount(0)
    expect(writes).toEqual([
      { p_kind: config.kind, p_ids: ['delete-1', 'delete-2'] },
      { p_kind: config.kind, p_ids: ['delete-1', 'delete-2'] }
    ])
  })
}
