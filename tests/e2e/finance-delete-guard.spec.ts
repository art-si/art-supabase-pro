import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(60000)

for (const config of [
  { family: 'ap', kind: 'payment' },
  { family: 'ap', kind: 'refund' },
  { family: 'ar', kind: 'receipt' },
  { family: 'ar', kind: 'refund' },
  { family: 'ar', kind: 'revenue' },
  { family: 'ar', kind: 'payment_request' }
]) {
  for (const bulk of [false, true]) {
    for (const mode of ['blocked', 'error', 'clear', 'concurrent', 'failure'] as const) {
      test(`${config.family}/${config.kind} ${bulk ? '批量' : '单张选择'}删除 ${mode}`, async ({
        page
      }, info) => {
        const ids = bulk ? ['guard-1', 'guard-2'] : ['guard-1']
        const events: string[] = []
        let blocked = mode === 'blocked'
        let deleted = false
        const records = [1, 2].map((index) => ({
          id: `guard-${index}`,
          record_key: `guard-${index}`,
          tenant_id: '11111111-1111-4111-8111-111111111111',
          document_no: `QA-GUARD-${index}`,
          kind: config.kind,
          status: 'draft',
          business_date: '2026-10-24',
          currency_code: 'CNY',
          amount: index * 100,
          lines: []
        }))
        await page.route('**/rest/v1/**', (route) => {
          const name = new URL(route.request().url()).pathname.split('/').at(-1)
          const body = route.request().postDataJSON()
          if (
            name ===
            (config.family === 'ap'
              ? 'fms_payable_settlement_delete_dependencies_secure'
              : 'fms_ar_delete_dependencies_secure')
          ) {
            events.push('inspect')
            expect(body.p_ids).toEqual(ids)
            if (config.family === 'ar') expect(body.p_kind).toBe(config.kind)
            if (mode === 'error')
              return route.fulfill({
                status: 503,
                json: { code: 'XX000', message: 'database unavailable' }
              })
            return route.fulfill({
              json: blocked
                ? [
                    {
                      resource_id: ids.at(-1),
                      dependency_code: config.family === 'ap' ? 'state' : 'document_state',
                      record_id: 'reference',
                      target_id: 'reference',
                      record_no: 'QA-REFERENCE-001',
                      record_summary: '已审核业务记录',
                      record_status: 'approved',
                      cleanup_allowed: false
                    }
                  ]
                : []
            })
          }
          if (
            name ===
            (config.family === 'ap'
              ? 'fms_act_payable_settlement_secure'
              : 'fms_delete_ar_records_secure')
          ) {
            events.push('delete')
            expect(body.p_ids).toEqual(ids)
            if (config.family === 'ap') expect(body.p_action).toBe('delete')
            else expect(body.p_kind).toBe(config.kind)
            if (mode === 'concurrent' || mode === 'failure') {
              blocked = mode === 'concurrent'
              return route.fulfill({
                status: 400,
                json: { code: '23503', message: '删除未完成，请重新检查关联' }
              })
            }
            deleted = true
            return route.fulfill({ json: [] })
          }
          if (
            name === 'fms_payable_settlement_list_secure' ||
            name === 'fms_receivable_workspace_secure'
          ) {
            const selected = body.p_query?.ids as string[] | undefined
            const id = body.p_query?.id as string | undefined
            const rows = records.filter(
              (row) =>
                !(deleted && ids.includes(row.id)) &&
                (!selected || selected.includes(row.id)) &&
                (!id || id === row.id)
            )
            return route.fulfill({
              json:
                config.family === 'ap'
                  ? { data: rows, total: rows.length }
                  : { records: rows, total: rows.length }
            })
          }
          return route.fulfill({ json: [] })
        })
        const fixture = config.family === 'ap' ? 'purchase-payable' : 'receivable-workspace'
        await page.goto(`/tests/e2e/fixtures/${fixture}.html?kind=${config.kind}`)
        for (const id of ids)
          await page
            .getByRole('row')
            .filter({ hasText: `QA-GUARD-${id.endsWith('1') ? 1 : 2}` })
            .locator('label.el-checkbox')
            .click()
        await page
          .getByRole('button', { name: config.family === 'ap' ? '删除' : '批量删除', exact: true })
          .click()
        if (mode === 'error') {
          const dialog = page.getByRole('dialog', { name: '删除检查未完成' })
          await expect(dialog).toContainText('关联资料未完成核验，删除已停止')
          await dialog.getByRole('button', { name: '重新检查', exact: true }).click()
          await expect.poll(() => events.length).toBe(2)
          expect(events).toEqual(['inspect', 'inspect'])
          return
        }
        if (mode !== 'blocked') {
          const confirm = page.locator('.el-message-box')
          await expect(confirm).toContainText(bulk ? '2' : '1')
          await confirm.getByRole('button', { name: '删除', exact: true }).click()
        }
        if (mode === 'clear') {
          await expect(page.getByText('QA-GUARD-1', { exact: true })).toHaveCount(0)
          await expect(page.getByText('QA-GUARD-2', { exact: true })).toHaveCount(bulk ? 0 : 1)
          expect(events).toEqual(['inspect', 'delete'])
        } else if (mode === 'failure') {
          await expect.poll(() => events.length).toBe(3)
          await expect(page.locator('.el-message--error')).toHaveCount(1)
          await expect(page.getByText('QA-GUARD-1', { exact: true })).toBeVisible()
          expect(events).toEqual(['inspect', 'delete', 'inspect'])
        } else {
          await expect(page.getByRole('dialog')).toContainText('QA-REFERENCE-001')
          await expect(page.getByRole('dialog')).toContainText('已审核')
          await expect(page.getByText('QA-GUARD-1', { exact: true })).toBeVisible()
          expect(events).toEqual(
            mode === 'blocked' ? ['inspect'] : ['inspect', 'delete', 'inspect']
          )
          if (bulk && mode === 'concurrent')
            await page.screenshot({ path: info.outputPath('delete-reference.png'), fullPage: true })
        }
      })
    }
  }
}

for (const [kind, permission] of [
  ['application', 'FinancePayableApplication'],
  ['payment', 'FinancePayablePayment'],
  ['refund', 'FinancePayableRefund']
]) {
  test(`ap/${kind} 状态限制导航定位可查看的阻止单据`, async ({ page }, info) => {
    const reads: string[] = []
    const records = [1, 2].map((index) => ({
      id: `navigation-${index}`,
      record_key: `navigation-${index}`,
      document_no: `QA-NAVIGATION-${index}`,
      tenant_id: '11111111-1111-4111-8111-111111111111',
      kind,
      status: 'draft',
      business_date: '2026-10-24',
      amount: index * 100,
      currency_code: 'CNY',
      lines: []
    }))
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (name === 'fms_payable_settlement_list_secure') {
        const id = body.p_query?.id
        if (id) reads.push(id)
        const rows = id ? records.filter((row) => row.id === id) : records
        return route.fulfill({ json: { data: rows, total: rows.length } })
      }
      if (name === 'fms_payable_settlement_delete_dependencies_secure')
        return route.fulfill({
          json: [
            {
              resource_id: 'navigation-1',
              dependency_code: 'state',
              record_id: 'navigation-2',
              target_id: 'navigation-2',
              record_no: 'QA-NAVIGATION-2',
              record_summary: '已审核业务记录',
              record_status: 'approved',
              cleanup_allowed: false
            }
          ]
        })
      expect(name).not.toBe('fms_act_payable_settlement_secure')
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&permissions=${permission}:View,${permission}:Delete`
    )
    await page
      .getByRole('row')
      .filter({ hasText: 'QA-NAVIGATION-1' })
      .locator('label.el-checkbox')
      .click()
    await page.getByRole('button', { name: '删除', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('QA-NAVIGATION-2')
    await dialog.getByRole('button', { name: '查看单据', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByText('QA-NAVIGATION-1', { exact: true })).toHaveCount(0)
    await expect(page.getByText('QA-NAVIGATION-2', { exact: true })).toBeVisible()
    expect(reads).toContain('navigation-2')
    await page.screenshot({
      path: info.outputPath(`${kind}-reference-navigation.png`),
      fullPage: true
    })
  })
}
