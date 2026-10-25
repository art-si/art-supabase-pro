import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

for (const config of [
  {
    kind: 'receipt',
    rpc: 'fms_act_receipt_secure',
    final: '确认收款',
    action: 'confirm',
    status: 'confirmed'
  },
  {
    kind: 'refund',
    rpc: 'fms_act_receivable_refund_secure',
    final: '确认付款',
    action: 'pay',
    status: 'paid'
  },
  {
    kind: 'revenue',
    rpc: 'fms_act_revenue_cost_secure',
    final: '刷新实际成本',
    action: 'refresh',
    status: 'approved'
  },
  {
    kind: 'payment_request',
    rpc: 'fms_act_receivable_payment_request_secure',
    final: '确认付款',
    action: 'pay',
    status: 'paid'
  }
]) {
  test(`${config.kind} 两张单据提交审核、失败恢复及终态限制`, async ({ page }, info) => {
    let fail = true
    const statuses: Record<string, string> = {
      draft: '草稿',
      submitted: '已提交',
      approved: '已审核',
      confirmed: '已收款',
      paid: '已付款'
    }
    const events: Array<{ p_id: string; p_action: string }> = []
    const records = [1, 2].map((index) => ({
      id: `ar-lifecycle-${index}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      document_no: `QA-AR-${index}`,
      status: 'draft',
      business_date: '2026-10-24',
      customer_name: `验收客户${index}`,
      organization_name: '验收结算组织',
      currency_code: 'CNY',
      amount: index * 100,
      revenue_amount: index * 100,
      cost_amount: index * 50,
      source_no: `QA-SOURCE-${index}`,
      lines: [
        {
          id: `line-${index}`,
          line_no: 10,
          description: `验收服务${index}`,
          revenue_amount: index * 100,
          cost_amount: index * 50,
          amount: index * 100
        }
      ]
    }))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const resource = url.pathname.split('/').at(-1)
      if (resource === 'sys_dictionary') {
        const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
        return route.fulfill({
          json:
            code === 'arDocumentStatus'
              ? Object.entries(statuses).map(([value, label]) => ({
                  id: `status-${value}`,
                  code: value,
                  value,
                  label,
                  status: '1',
                  dict_type_table: { code, name: '单据状态' }
                }))
              : []
        })
      }
      const body = route.request().postDataJSON()
      if (resource === config.rpc) {
        events.push(body)
        if (fail)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '验收模拟操作失败，请重试' }
          })
        const record = records.find((row) => row.id === body.p_id)
        expect(record).toBeDefined()
        if (record)
          record.status =
            body.p_action === 'refresh'
              ? record.status
              : body.p_action === 'submit'
                ? 'submitted'
                : body.p_action === 'approve'
                  ? 'approved'
                  : config.status
        return route.fulfill({ json: null })
      }
      if (resource === 'fms_receivable_workspace_secure') {
        const selected = body.p_query?.ids as string[] | undefined
        const rows = selected ? records.filter((row) => selected.includes(row.id)) : records
        return route.fulfill({ json: { records: rows, total: rows.length } })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/receivable-workspace.html?kind=${config.kind}`)
    await expect(page.getByText('QA-AR-2', { exact: true })).toBeVisible()
    const selectRows = async () => {
      await expect(
        page.getByRole('checkbox', { name: '选择所有行', exact: true })
      ).not.toBeChecked()
      await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    }
    await selectRows()
    await expect(page.getByRole('button', { name: '审核', exact: true })).toBeDisabled()
    if (config.kind !== 'revenue')
      await expect(page.getByRole('button', { name: config.final, exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '提交', exact: true }).click()
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    expect(events).toEqual([{ p_id: 'ar-lifecycle-1', p_action: 'submit' }])
    fail = false
    await selectRows()
    await page.getByRole('button', { name: '提交', exact: true }).click()
    await expect(page.getByRole('row').filter({ hasText: 'QA-AR-1' })).toContainText('已提交')
    await expect(page.getByRole('row').filter({ hasText: 'QA-AR-2' })).toContainText('已提交')
    await selectRows()
    await expect(page.getByRole('button', { name: '提交', exact: true })).toBeDisabled()
    if (config.kind === 'revenue') {
      await page.getByRole('button', { name: config.final, exact: true }).click()
      await selectRows()
      await expect(page.getByRole('row').filter({ hasText: 'QA-AR-2' })).toContainText('已提交')
    }
    await page.getByRole('button', { name: '审核', exact: true }).click()
    await expect(page.getByRole('row').filter({ hasText: 'QA-AR-2' })).toContainText('已审核')
    await selectRows()
    await expect(page.getByRole('button', { name: '审核', exact: true })).toBeDisabled()
    if (config.kind === 'revenue')
      await expect(page.getByRole('button', { name: config.final, exact: true })).toBeDisabled()
    else {
      await page.getByRole('button', { name: config.final, exact: true }).click()
      const confirmation = page.getByRole('dialog')
      await expect(confirmation).toContainText(
        config.kind === 'payment_request' ? '实际付款' : '实际资金流水'
      )
      await confirmation.getByRole('button', { name: /确定|确认/, exact: false }).click()
      await expect(page.getByRole('row').filter({ hasText: 'QA-AR-2' })).toContainText(
        statuses[config.status]
      )
      await selectRows()
      await expect(page.getByRole('button', { name: config.final, exact: true })).toBeDisabled()
    }
    expect(
      events.filter((event) => event.p_action === 'approve').map((event) => event.p_id)
    ).toEqual(['ar-lifecycle-1', 'ar-lifecycle-2'])
    expect(
      events.filter((event) => event.p_action === config.action).map((event) => event.p_id)
    ).toEqual(['ar-lifecycle-1', 'ar-lifecycle-2'])
    await expect(page.locator('.el-message')).toHaveCount(0)
    await page.screenshot({ path: info.outputPath(`${config.kind}-lifecycle.png`), fullPage: true })
  })
}
