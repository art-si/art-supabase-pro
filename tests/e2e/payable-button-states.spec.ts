import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

for (const kind of ['application', 'payment', 'refund']) {
  test(`${kind} 每种状态的工具栏与行操作可用性`, async ({ page }, info) => {
    let state = { status: 'draft', frozen: false, payment_status: 'none' }
    let mixed = false
    const writes: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_settlement_list_secure')
        return route.fulfill({
          json: {
            data: [1, 2].map((index) => ({
              id: `state-${index}`,
              record_key: `state-${index}`,
              document_no: `QA-STATE-${index}`,
              kind,
              ...state,
              status: index === 2 && mixed ? 'draft' : state.status,
              amount: index * 100,
              currency_code: 'CNY',
              business_date: '2026-10-24',
              counterparty_name: `隔离状态供应商${index}`,
              lines: []
            })),
            total: 2
          }
        })
      if (name === 'fms_act_payable_settlement_secure') writes.push(name)
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}`)
    const cases = [
      { status: 'draft', frozen: false, payment_status: 'none' },
      { status: 'submitted', frozen: false, payment_status: 'none' },
      { status: 'submitted', frozen: true, payment_status: 'none' },
      { status: 'approved', frozen: false, payment_status: 'partial' },
      { status: 'approved', frozen: true, payment_status: 'partial' },
      { status: 'approved', frozen: false, payment_status: 'full' },
      { status: 'confirmed', frozen: false, payment_status: 'full' },
      { status: 'processing', frozen: false, payment_status: 'partial' },
      { status: 'closed', frozen: false, payment_status: 'none' },
      { status: 'cancelled', frozen: false, payment_status: 'none' }
    ]
    const enabled = async (name: string, value: boolean) => {
      const button = page.getByRole('button', { name, exact: true })
      await expect(
        button,
        `${kind}/${state.status}/${state.frozen}: ${name} 必须可见`
      ).toBeVisible()
      if (value) await expect(button).toBeEnabled()
      else await expect(button).toBeDisabled()
    }
    for (const entry of cases) {
      state = entry
      await page.getByRole('button', { name: '查询', exact: true }).click()
      const row = page.getByRole('row').filter({ hasText: 'QA-STATE-1' })
      await expect(row).toBeVisible()
      await expect(row.getByRole('button', { name: '查看', exact: true })).toBeVisible()
      await expect(row.getByRole('button', { name: '编辑', exact: true })).toHaveCount(
        state.status === 'draft' && !state.frozen ? 1 : 0
      )
      await row.locator('label.el-checkbox').click()
      await enabled('提交', state.status === 'draft' && !state.frozen)
      await enabled('审核', state.status === 'submitted' && !state.frozen)
      await enabled('删除', state.status === 'draft' && !state.frozen)
      await enabled('打印', true)
      if (kind === 'application') {
        const active =
          ['submitted', 'approved'].includes(state.status) && state.payment_status !== 'full'
        await enabled('冻结', active && !state.frozen)
        await enabled('解冻', active && state.frozen)
        await enabled('关闭', active)
        await enabled(
          '下推',
          state.status === 'approved' && !state.frozen && state.payment_status !== 'full'
        )
      } else {
        const canConfirm = state.status === 'approved' && !state.frozen
        const canCancel = state.status === 'confirmed' && !state.frozen
        const title = kind === 'refund' ? '确认到账' : '确认付款'
        await enabled(title, canConfirm || canCancel)
        if (canConfirm || canCancel) {
          await page.getByRole('button', { name: title, exact: true }).click()
          const confirm = page.getByRole('menuitem', { name: title, exact: true })
          const cancel = page.getByRole('menuitem', {
            name: kind === 'refund' ? '取消到账' : '取消付款',
            exact: true
          })
          if (canConfirm) await expect(confirm).toBeEnabled()
          else await expect(confirm).toBeDisabled()
          if (canCancel) await expect(cancel).toBeEnabled()
          else await expect(cancel).toBeDisabled()
          await page.keyboard.press('Escape')
        }
        await enabled(
          kind === 'refund' ? '作废未到账单' : '作废未付款单',
          ['draft', 'submitted', 'approved'].includes(state.status)
        )
        if (kind === 'payment') await enabled('下推', state.status === 'confirmed' && !state.frozen)
      }
      if (state.status === 'approved' && !state.frozen && state.payment_status === 'partial') {
        await page.screenshot({
          path: info.outputPath(`${kind}-approved-buttons.png`),
          fullPage: true
        })
        await page
          .getByRole('row')
          .filter({ hasText: 'QA-STATE-2' })
          .locator('label.el-checkbox')
          .click()
        if (kind !== 'refund') await enabled('下推', false)
      }
    }
    state = { status: 'approved', frozen: false, payment_status: 'partial' }
    mixed = true
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    for (const name of ['提交', '审核', '删除']) await enabled(name, false)
    if (kind !== 'refund') await enabled('下推', false)
    if (kind !== 'application') await enabled(kind === 'refund' ? '确认到账' : '确认付款', false)
    await enabled('打印', true)
    expect(writes).toEqual([])
  })
}

for (const kind of ['estimated', 'financial']) {
  test(`${kind} 两张应付提交失败重试及审核回读`, async ({ page }, info) => {
    const documents = [1, 2].map((index) => ({
      id: `purchase-action-${index}`,
      document_no: `QA-PURCHASE-ACTION-${index}`,
      kind,
      status: 'draft',
      is_reversal: false,
      currency_code: 'CNY',
      total_amount: index * 100,
      business_date: '2026-10-24',
      supplier_name: '隔离应付操作供应商',
      lines: [
        {
          id: `purchase-action-line-${index}`,
          line_no: 10,
          material_description: '隔离应付验收物料',
          quantity: 1,
          unit_price: index * 100,
          amount: index * 100,
          tax_amount: 0,
          total_amount: index * 100
        }
      ]
    }))
    const actions: Array<{ p_ids: string[]; p_action: string }> = []
    let fail = true
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_purchase_payable_list_secure')
        return route.fulfill({ json: { data: documents, total: 2 } })
      if (name === 'fms_act_purchase_payable_secure') {
        const body = route.request().postDataJSON()
        actions.push({ p_ids: body.p_ids, p_action: body.p_action })
        if (fail)
          return route.fulfill({
            status: 409,
            json: { code: '40001', message: '单据已变化，请核对后重试' }
          })
        for (const document of documents) {
          if (body.p_ids.includes(document.id))
            document.status = body.p_action === 'submit' ? 'submitted' : 'approved'
        }
        return route.fulfill({ json: { affected: 2 } })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}`)
    const selectAll = async () => {
      const checkbox = page.getByRole('checkbox', { name: '选择所有行', exact: true })
      if (!(await checkbox.isChecked()))
        await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
    }
    const first = page.getByRole('row').filter({ hasText: 'QA-PURCHASE-ACTION-1' })
    const second = page.getByRole('row').filter({ hasText: 'QA-PURCHASE-ACTION-2' })
    await expect(second).toBeVisible()
    await selectAll()
    await page.getByRole('button', { name: '提交', exact: true }).click()
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    await expect(first).toContainText('暂存')
    await expect(second).toContainText('暂存')
    fail = false
    await selectAll()
    await page.getByRole('button', { name: '提交', exact: true }).click()
    await expect(first).toContainText('已提交')
    await expect(second).toContainText('已提交')
    await selectAll()
    await expect(page.getByRole('button', { name: '提交', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: '审核', exact: true }).click()
    await expect(first).toContainText('已审核')
    await expect(second).toContainText('已审核')
    await selectAll()
    await expect(page.getByRole('button', { name: '审核', exact: true })).toBeDisabled()
    expect(actions).toEqual(
      ['submit', 'submit', 'approve'].map((action) => ({
        p_ids: ['purchase-action-1', 'purchase-action-2'],
        p_action: action
      }))
    )
    await expect(page.locator('.el-message')).toHaveCount(0)
  })

  test(`${kind} 暂存提交审核与冲回单的按钮状态`, async ({ page }, info) => {
    let status = 'draft'
    let reversal = false
    let standard = false
    let credit = false
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_purchase_payable_list_secure')
        return route.fulfill({
          json: {
            data: [1, 2].map((index) => ({
              id: `purchase-state-${index}`,
              document_no: `QA-PURCHASE-STATE-${index}`,
              kind,
              status,
              is_reversal: reversal,
              is_credit: credit,
              standard_purchase: standard,
              source_type: 'manual',
              currency_code: 'CNY',
              total_amount: 100,
              unlinked_amount: 100,
              unpaid_amount: 100,
              frozen_amount: 0,
              business_date: '2026-10-24',
              supplier_name: '隔离应付状态供应商',
              lines: []
            })),
            total: 2
          }
        })
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}`)
    for (const entry of [
      { status: 'draft', reversal: false, standard: false, credit: false },
      { status: 'submitted', reversal: false, standard: false, credit: false },
      { status: 'approved', reversal: false, standard: false, credit: false },
      { status: 'approved', reversal: true, standard: false, credit: false },
      { status: 'draft', reversal: true, standard: false, credit: false },
      { status: 'approved', reversal: false, standard: true, credit: false },
      { status: 'approved', reversal: false, standard: false, credit: true }
    ]) {
      status = entry.status
      reversal = entry.reversal
      standard = entry.standard
      credit = entry.credit
      await page.getByRole('button', { name: '查询', exact: true }).click()
      const row = page.getByRole('row').filter({ hasText: 'QA-PURCHASE-STATE-1' })
      await expect(row).toBeVisible()
      await expect(row.getByRole('button', { name: '编辑', exact: true })).toHaveCount(
        status === 'draft' && !reversal ? 1 : 0
      )
      await row.locator('label.el-checkbox').click()
      for (const [name, allowed] of [
        ['提交', status === 'draft' && !reversal],
        ['审核', status === 'submitted' && !reversal],
        ['删除', status === 'draft' && !reversal],
        [
          '下推',
          status === 'approved' && !reversal && !credit && (kind !== 'estimated' || !standard)
        ],
        ['打印', true]
      ] as const) {
        const button = page.getByRole('button', { name, exact: true })
        await expect(button).toBeVisible()
        if (allowed) await expect(button).toBeEnabled()
        else await expect(button).toBeDisabled()
      }
      await page.getByRole('button', { name: '生成凭证', exact: true }).click()
      await expect(page.getByRole('menuitem', { name: '预览凭证', exact: true })).toBeEnabled()
      const generate = page.getByRole('menuitem', { name: '生成凭证', exact: true })
      if (status === 'approved') await expect(generate).toBeEnabled()
      else await expect(generate).toBeDisabled()
      await page.keyboard.press('Escape')
      if (status === 'approved' && !reversal && !standard)
        await page.screenshot({
          path: info.outputPath(`${kind}-approved-buttons.png`),
          fullPage: true
        })
    }
  })
}
