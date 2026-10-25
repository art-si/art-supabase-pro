import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)

for (const config of [
  {
    kind: 'estimated',
    title: '暂估应付单',
    source: 'FinanceEstimatedPayable',
    targetKind: 'financial',
    targetTitle: '财务应付单',
    menu: '财务应付',
    target: 'FinancePurchasePayable',
    rpc: 'fms_push_estimated_payable_secure'
  },
  {
    kind: 'financial',
    title: '财务应付单',
    source: 'FinancePurchasePayable',
    targetKind: 'application',
    targetTitle: '付款申请单',
    menu: '付款申请',
    target: 'FinancePayableApplication',
    rpc: 'fms_push_payable_settlement_secure'
  },
  {
    kind: 'financial',
    title: '财务应付单',
    source: 'FinancePurchasePayable',
    targetKind: 'payment',
    targetTitle: '付款单',
    menu: '付款单',
    target: 'FinancePayablePayment',
    rpc: 'fms_push_payable_settlement_secure'
  }
]) {
  const records = () =>
    [1, 2].map((index) => ({
      id: `source-${index}`,
      record_key: `source-${index}`,
      document_no: `QA-PURCHASE-PUSH-${index}`,
      kind: config.kind,
      status: 'approved',
      source_type: 'manual',
      standard_purchase: false,
      is_credit: false,
      is_reversal: false,
      currency_code: 'CNY',
      base_currency_code: 'CNY',
      business_date: '2026-10-24',
      amount: index * 100,
      tax_amount: 0,
      total_amount: index * 100,
      payment_status: 'none',
      details: {},
      lines: [],
      payment_plans: []
    }))
  const permissions = (target: string[] = ['Add', 'View']) =>
    [
      `${config.source}:View`,
      `${config.source}:Push`,
      ...target.map((action) => `${config.target}:${action}`)
    ].join(',')

  test(`${config.kind}-${config.targetKind} 下推目标权限四组合`, async ({ page }, info) => {
    let writes = 0
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_purchase_payable_list_secure')
        return route.fulfill({ json: { data: records(), total: 2 } })
      if (name === config.rpc) writes++
      return route.fulfill({ json: [] })
    })
    for (const grants of [[], ['Add'], ['View'], ['Add', 'View']]) {
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=${config.kind}&permissions=${permissions(grants)}`
      )
      await expect(page.getByRole('heading', { name: config.title, exact: true })).toBeVisible({
        timeout: 60000
      })
      if (info.project.use.colorScheme === 'dark')
        await expect(page.locator('html')).toHaveClass(/dark/)
      for (const index of [1, 2]) {
        const checkbox = page
          .getByRole('row')
          .filter({ hasText: `QA-PURCHASE-PUSH-${index}` })
          .locator('label.el-checkbox')
        await checkbox.click()
        const push = page.getByRole('button', { name: '下推', exact: true })
        if (grants.length === 2) {
          await expect(push).toBeEnabled()
          await push.click()
          await expect(page.getByRole('menuitem', { name: config.menu, exact: true })).toBeVisible()
          if (config.kind === 'financial')
            await expect(
              page.getByRole('menuitem', {
                name: config.targetKind === 'application' ? '付款单' : '付款申请',
                exact: true
              })
            ).toHaveCount(0)
          await page.keyboard.press('Escape')
        } else await expect(push).toBeDisabled()
        await checkbox.click()
      }
    }
    expect(writes).toBe(0)
  })

  for (const delayed of [true, false]) {
    test(`${config.kind}-${config.targetKind} ${delayed ? '等待期间离开及返回' : '两条失败重试与新单定位'}`, async ({
      page
    }, info) => {
      const sources = records()
      const targets: Array<Record<string, unknown>> = []
      const calls: string[] = []
      const targetReads: string[] = []
      let release: (() => void) | undefined
      let fail = !delayed
      await page.route('**/rest/v1/**', async (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1)
        const input = route.request().postDataJSON() || {}
        if (
          name === 'fms_purchase_payable_list_secure' ||
          name === 'fms_payable_settlement_list_secure'
        ) {
          const id = name === 'fms_purchase_payable_list_secure' ? input.p_id : input.p_query?.id
          const source = name === 'fms_purchase_payable_list_secure' && input.p_kind === config.kind
          if (!source && id) targetReads.push(id)
          const data = (source ? sources : targets).filter((row) => !id || row.id === id)
          return route.fulfill({ json: { data, total: data.length } })
        }
        if (name === config.rpc) {
          calls.push(input.p_id)
          if (config.kind === 'financial') {
            expect(input.p_kind).toBe(config.targetKind)
            expect(input.p_source).toBe('payable')
          }
          if (delayed)
            await new Promise<void>((resolve) => {
              release = resolve
            })
          if (fail) {
            fail = false
            return route.fulfill({
              status: 409,
              json: { code: 'P0001', message: '下推余额已变化，请重试' }
            })
          }
          const source = sources.find((row) => row.id === input.p_id)
          expect(source).toBeDefined()
          const created = {
            ...source,
            id: `target-${input.p_id}`,
            record_key: `target-${input.p_id}`,
            document_no: `QA-NEW-${input.p_id}`,
            kind: config.targetKind,
            status: 'draft'
          }
          targets.push(created)
          return route.fulfill({ json: created })
        }
        return route.fulfill({ json: [] })
      })
      for (const index of [1, 2]) {
        release = undefined
        await page.goto(
          `/tests/e2e/fixtures/purchase-payable.html?kind=${config.kind}&navigationTest=1&keepAlive=1&permissions=${permissions()}`
        )
        await expect(page.getByRole('heading', { name: config.title, exact: true })).toBeVisible({
          timeout: 60000
        })
        if (info.project.use.colorScheme === 'dark')
          await expect(page.locator('html')).toHaveClass(/dark/)
        await page
          .getByRole('row')
          .filter({ hasText: `QA-PURCHASE-PUSH-${index}` })
          .locator('label.el-checkbox')
          .click()
        const invoke = async () => {
          await page.getByRole('button', { name: '下推', exact: true }).click()
          await page.getByRole('menuitem', { name: config.menu, exact: true }).click()
        }
        await invoke()
        if (delayed) {
          await expect.poll(() => Boolean(release)).toBe(true)
          await page.getByRole('button', { name: '打开其他页面', exact: true }).click()
          await expect(
            page.getByRole('heading', { name: '其他业务页面', exact: true })
          ).toBeVisible()
          if (index === 2)
            await page.getByRole('button', { name: '返回来源页面', exact: true }).click()
          release?.()
          await page.waitForLoadState('networkidle')
          await expect(
            page.getByRole('heading', {
              name: index === 1 ? '其他业务页面' : config.title,
              exact: true
            })
          ).toBeVisible()
          expect(targetReads).toHaveLength(0)
        } else {
          if (index === 1) {
            await expect(page.locator('.el-message--error').last()).toContainText('下推余额已变化')
            expect(targets).toHaveLength(0)
            await expect(
              page.getByRole('heading', { name: config.title, exact: true })
            ).toBeVisible()
            await invoke()
          }
          await expect(
            page.getByRole('heading', { name: config.targetTitle, exact: true })
          ).toBeVisible()
          await expect(page.getByText(`QA-NEW-source-${index}`, { exact: true })).toBeVisible()
          expect(targetReads).toContain(`target-source-${index}`)
        }
      }
      expect(calls).toEqual(
        delayed ? ['source-1', 'source-2'] : ['source-1', 'source-1', 'source-2']
      )
      expect(targets).toHaveLength(2)
      if (!delayed) {
        await expect(page.locator('.el-message')).toHaveCount(0)
        await page.screenshot({ path: info.outputPath('new-target.png'), fullPage: true })
      }
    })
  }
}
