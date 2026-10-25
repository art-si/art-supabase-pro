import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

const relations = [
  { value: 'payable_red_blue', label: '应付红蓝对冲' },
  { value: 'payable_receivable', label: '应付应收抵销' },
  { value: 'payment_refund', label: '付款冲退款' }
]

test('红蓝自动核销分币种展示并在切换分配方式后重新预览、拒绝过期计划', async ({ page }, info) => {
  const calls: Array<{
    p_execute: boolean
    p_plan_token: string | null
    p_query: { cross_currency_mode?: string }
  }> = []
  let token = 0
  let execution = 0
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_payable_writeoff_workspace_secure')
      return route.fulfill({
        json: {
          primary: [],
          secondary: [],
          history: [],
          organizations: [],
          relations,
          schemes: [
            { id: 'auto', code: 'QA-AUTO', name: '红蓝自动方案', automatic: true, enabled: true }
          ]
        }
      })
    if (name === 'fms_auto_payable_writeoff_secure') {
      const body = route.request().postDataJSON()
      calls.push(body)
      if (!body.p_execute) token++
      else if (++execution === 1)
        return route.fulfill({
          status: 409,
          json: { code: '40001', message: '余额已变更，请重新预览' }
        })
      return route.fulfill({
        json: {
          items: [1, 2].map((index) => ({
            payableNo: `QA-BLUE-${index}`,
            paymentNo: `QA-RED-${index}`,
            supplierName: '验收蓝字供应商',
            paymentSupplierName: '验收红字供应商',
            currencyCode: index === 1 ? 'CNY' : 'USD',
            secondaryCurrencyCode: index === 1 ? 'CNY' : 'EUR',
            baseCurrencyCode: 'CNY',
            amount: 100,
            creditAmount: index === 1 ? 100 : 90,
            exchangeDifference: index === 1 ? 10 : -10,
            needsVoucher: true
          })),
          totalAmount: null,
          recordCount: 2,
          planToken: `plan-${token}`,
          recordIds: [],
          executed: body.p_execute,
          schemeName: '红蓝自动方案',
          message: body.p_execute ? '核销已完成' : '请核对双方原币金额'
        }
      })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&theme=${theme}`)
  await page.getByRole('radio', { name: '应付红蓝对冲', exact: true }).locator('..').click()
  await page.getByRole('combobox', { name: '核销方案', exact: true }).press('Enter')
  await page.getByRole('option', { name: '红蓝自动方案', exact: true }).click()
  await page.getByRole('button', { name: '按方案自动核销', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '按方案自动核销', exact: true })
  const confirm = dialog.getByRole('button', { name: '确认自动核销', exact: true })
  await expect(confirm).toBeEnabled()
  await expect(dialog.getByText(/核销合计/)).toContainText('USD')
  await expect(dialog.getByText(/核销合计/)).not.toContainText('¥200')
  await expect(dialog.getByRole('row').filter({ hasText: 'QA-BLUE-1' })).toContainText('收益')
  await expect(dialog.getByRole('row').filter({ hasText: 'QA-BLUE-2' })).toContainText('损失')
  for (const mode of [
    { label: '匹配余量全部对冲', value: 'full_pair' },
    { label: '仅同币种', value: 'same_currency' },
    { label: '本位币等值分配', value: 'book_equivalent' }
  ]) {
    await dialog.getByRole('radio', { name: mode.label, exact: true }).locator('..').click()
    await expect.poll(() => calls.at(-1)?.p_query.cross_currency_mode).toBe(mode.value)
    await expect(confirm).toBeEnabled()
    if (mode.value === 'full_pair')
      await expect(
        dialog.getByText('异币匹配双方可用余量将全部对冲，差额计入汇兑损益，请逐行核对原币金额。', {
          exact: true
        })
      ).toBeVisible()
  }
  await dialog.screenshot({ path: info.outputPath('red-blue-auto-preview.png') })
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(
    await dialog
      .locator('.el-dialog__body')
      .evaluate((element) => element.scrollWidth <= element.clientWidth)
  ).toBe(true)
  await confirm.click()
  await expect(confirm).toBeDisabled()
  await expect(dialog).toContainText('核销结果未确认')
  await dialog.getByRole('button', { name: '重新预览', exact: true }).click()
  await expect(confirm).toBeEnabled()
  const lastToken = `plan-${token}`
  await confirm.click()
  await expect(dialog).not.toBeVisible()
  const executions = calls.filter((call) => call.p_execute)
  expect(executions).toHaveLength(2)
  expect(executions.at(-1)?.p_plan_token).toBe(lastToken)
  expect(executions[0].p_plan_token).not.toBe(lastToken)
})

test('已有统一往来单位方案两条规则回填并保存，不丢失匹配字段', async ({ page }, info) => {
  const saved: Array<Record<string, unknown>> = []
  const rules = [
    {
      primaryField: 'counterparty_id',
      secondaryField: 'counterparty_id',
      operator: 'eq',
      emptyMatches: false
    },
    {
      primaryField: 'currency_code',
      secondaryField: 'currency_code',
      operator: 'eq',
      emptyMatches: false
    }
  ]
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_payable_writeoff_workspace_secure')
      return route.fulfill({
        json: {
          primary: [],
          secondary: [],
          history: [],
          organizations: [],
          schemes: [1, 2].map((index) => ({
            id: `scheme-${index}`,
            code: `QA-AR-${index}`,
            name: `统一往来方案${index}`,
            tenantId: '11111111-1111-4111-8111-111111111111',
            enabled: true,
            automatic: false,
            rules
          }))
        }
      })
    if (name === 'fms_save_payable_reference_secure') {
      saved.push(route.request().postDataJSON().p_record)
      return route.fulfill({ json: saved.at(-1)?.id })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&theme=${theme}`)
  await page.getByRole('button', { name: '核销方案', exact: true }).click()
  const list = page.getByRole('dialog', { name: '应付核销方案', exact: true })
  for (const index of [1, 2]) {
    await list
      .getByRole('row')
      .filter({ hasText: `统一往来方案${index}` })
      .getByRole('button', { name: '编辑方案', exact: true })
      .click()
    const editor = page.getByRole('dialog', { name: '编辑核销方案', exact: true })
    await expect(editor.getByText('统一往来单位（主数据已确认）', { exact: true })).toHaveCount(2)
    await expect(page.locator('.dialog-fade-enter-active')).toHaveCount(0)
    await editor.screenshot({ path: info.outputPath(`counterparty-scheme-${index}.png`) })
    await editor.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(editor).not.toBeVisible()
  }
  expect(saved).toHaveLength(2)
  for (const record of saved)
    expect(record.rules).toEqual(
      rules.map((rule) => ({
        primary_field: rule.primaryField,
        secondary_field: rule.secondaryField,
        operator: rule.operator,
        empty_matches: false
      }))
    )
})

for (const relation of relations) {
  test(`${relation.label}两组明细执行失败、保留选择重试与关系切换`, async ({ page }, info) => {
    const writes: Array<{ p_items: Array<Record<string, unknown>>; p_scheme_id: string }> = []
    const queries: Array<{ relation?: string }> = []
    let fail = true
    let completed = false
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (name === 'fms_payable_writeoff_workspace_secure') {
        queries.push(body.p_query)
        const current = body.p_query.relation
        const rows = (side: string) =>
          completed || current !== relation.value
            ? []
            : [1, 2].map((index) => ({
                id: `${side}-${index}`,
                tenantId: '11111111-1111-4111-8111-111111111111',
                documentNo: `QA-${side}-${index}`,
                businessDate: '2026-10-24',
                supplierId: 'supplier',
                supplierName: '关系核销验收单位',
                counterpartyKey: 'party',
                accountSetId: 'book',
                currencyCode: relation.value === 'payable_red_blue' && index === 2 ? 'USD' : 'CNY',
                baseCurrencyCode: 'CNY',
                exchangeRate: index === 2 ? 7 : 1,
                amount: index * 100,
                availableAmount: index * 100
              }))
        return route.fulfill({
          json: {
            primary: rows('primary'),
            secondary: rows('secondary'),
            history: [],
            organizations: [],
            relations: [{ value: 'payable_payment', label: '应付付款核销' }, ...relations],
            schemes: [
              {
                id: 'manual',
                tenantId: '11111111-1111-4111-8111-111111111111',
                code: current === 'payable_receivable' ? 'AP-AR-MANUAL' : 'AP-MANUAL',
                name: '关系核销手工方案',
                enabled: true,
                automatic: false
              }
            ]
          }
        })
      }
      if (name === 'fms_payable_writeoff_secure') {
        writes.push(body)
        if (fail)
          return route.fulfill({
            status: 409,
            json: { code: 'P0001', message: '余额已更新，请核对后重试' }
          })
        completed = true
        return route.fulfill({ json: null })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&theme=${theme}`)
    const execute = page.getByRole('button', { name: '核销', exact: true })
    await expect(execute).toBeDisabled()
    await page.getByRole('radio', { name: relation.label, exact: true }).locator('..').click()
    await expect(page.getByText('QA-primary-2', { exact: true })).toBeVisible()
    await expect(page.getByText('QA-secondary-2', { exact: true })).toBeVisible()
    const headers = page.locator('.el-table__header-wrapper label.el-checkbox')
    await headers.nth(0).click()
    await expect(execute).toBeDisabled()
    await headers.nth(1).click()
    await expect(execute).toBeEnabled()
    await execute.click()
    const confirmation = page.locator('.el-message-box')
    await expect(confirmation).toBeVisible()
    if (relation.value === 'payable_red_blue') {
      await expect(confirmation).toContainText('USD')
      await expect(confirmation).toContainText('汇兑差额')
    }
    await confirmation.getByRole('button', { name: '执行核销', exact: true }).click()
    await expect(page.getByText('余额已更新，请核对后重试', { exact: true })).toBeVisible()
    await expect(execute).toBeEnabled()
    fail = false
    await execute.click()
    await confirmation.getByRole('button', { name: '执行核销', exact: true }).click()
    await expect(page.getByText('QA-primary-2', { exact: true })).toHaveCount(0)
    await expect(execute).toBeDisabled()
    expect(writes).toHaveLength(2)
    const items = [1, 2].map((index) => ({
      relation: relation.value,
      ...(relation.value === 'payment_refund'
        ? { payment_line_id: `primary-${index}`, refund_line_id: `secondary-${index}` }
        : relation.value === 'payable_receivable'
          ? {
              payable_id: `primary-${index}`,
              receivable_line_id: `secondary-${index}`,
              allow_cross_party: false
            }
          : {
              payable_id: `primary-${index}`,
              credit_payable_id: `secondary-${index}`,
              credit_amount: index * 100,
              allow_cross_party: false
            }),
      amount: index * 100
    }))
    for (const write of writes) {
      expect(write.p_scheme_id).toBe('manual')
      expect(write.p_items).toEqual(items)
    }
    await page.getByRole('radio', { name: '应付付款核销', exact: true }).locator('..').click()
    await expect(execute).toBeDisabled()
    await expect.poll(() => queries.at(-1)?.relation).toBe('payable_payment')
    await page.screenshot({
      path: info.outputPath(`${relation.value}-completed.png`),
      fullPage: true
    })
  })
}
