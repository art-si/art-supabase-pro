import { test, expect } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
for (const kind of [
  'stock',
  'sales',
  'purchase',
  'count',
  'transfer',
  'production',
  'scm-quote',
  'scm-contract',
  'scm-order'
]) {
  test(`${kind} withdraws submission and restores editing`, async ({ page }, info) => {
    test.setTimeout(180_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const scm = kind.startsWith('scm-')
    let withdrawn = false
    let fail = true
    let writes = 0
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    const row = {
      id: 'document-test',
      document_id: 'document-test',
      tenant_id: '11111111-1111-4111-8111-111111111111',
      document_no: 'WITHDRAW-TEST',
      kind:
        kind === 'scm-quote'
          ? 'sales_quotation'
          : kind === 'scm-contract'
            ? 'sales_contract'
            : kind === 'scm-order'
              ? 'sales_order'
              : kind === 'sales'
                ? 'initial_outbound'
                : kind === 'purchase'
                  ? 'initial_inbound'
                  : kind === 'count'
                    ? 'gain'
                    : 'issue',
      material_status: 'pending',
      business_date: '2026-10-09',
      accounting_date: '2026-10-09',
      document_date: '2026-10-09',
      application_date: '2026-10-09',
      details: {},
      lines: [],
      line_no: 10,
      line_id: 'line-test',
      quantity: 10,
      requested_quantity: 10,
      amount: 0,
      total_amount: 0,
      is_initialization: true,
      material_code: 'MAT-TEST',
      material_description: '测试物料',
      status: 'submitted'
    }
    await page.route(
      /\/rest\/v1\/(wms_initial_stock_document|wms_sales_document_list|wms_purchase_document(?:_list)?|wms_count_adjustment_list|wms_transfer_request_list|wms_production_material_list|scm_sales_document)\?/,
      (route) =>
        route.fulfill({
          json: [{ ...row, status: withdrawn || scm ? 'draft' : 'submitted' }],
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
        })
    )
    await page.route('**/rest/v1/wf_instance?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'workflow-test',
            business_id: 'document-test',
            initiator_user_id: 'withdraw-actor',
            status: withdrawn ? 'withdrawn' : 'running'
          }
        ]
      })
    )
    await page.route(
      /\/rest\/v1\/rpc\/(wms_change_.*_status_secure|withdraw_workflow)$/,
      async (route) => {
        writes++
        const payload = route.request().postDataJSON()
        expect(scm ? payload.p_instance_id : payload.p_document_id).toBe(
          scm ? 'workflow-test' : 'document-test'
        )
        if (!scm) expect(payload.p_action).toBe('withdraw')
        if (fail)
          return route.fulfill({
            status: 400,
            json: { code: '23514', message: '已有审批人处理，不能直接撤回' }
          })
        withdrawn = true
        await route.fulfill({ json: null })
      }
    )
    await page.goto(`/tests/e2e/fixtures/withdraw-submission.html?kind=${kind}`)
    await expect(page.getByText('WITHDRAW-TEST', { exact: true }).first()).toBeVisible()
    const focusSwitch = page.getByRole('switch', { name: '进入专注模式', exact: true })
    if (await focusSwitch.count()) {
      await focusSwitch.locator('..').click()
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeHidden()
      await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await focusSwitch.locator('..').click()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    }
    const more = page.getByRole('button', { name: '更多操作', exact: true }).first()
    await more.click()
    await page.getByRole('menuitem', { name: '撤回提交', exact: true }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm.getByText(/撤回后|撤回单据/).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await page.screenshot({ path: info.outputPath(`${kind}-withdraw.png`), animations: 'disabled' })
    await confirm.getByRole('button', { name: /^(确定)?撤回提交$/ }).click()
    await expect(page.getByText('已有审批人处理，不能直接撤回', { exact: true })).toBeVisible()
    expect(withdrawn).toBe(false)
    fail = false
    await more.click()
    await page.getByRole('menuitem', { name: '撤回提交', exact: true }).click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^(确定)?撤回提交$/ })
      .click()
    await expect.poll(() => writes).toBe(2)
    await expect(page.getByRole('dialog')).toBeHidden()
    await more.click()
    await expect(page.getByRole('menuitem', { name: '撤回提交', exact: true })).toBeHidden()
    await expect(page.getByRole('menuitem', { name: /删除/ }).first()).toBeVisible()
    expect(errors).toEqual([])
  })
}
