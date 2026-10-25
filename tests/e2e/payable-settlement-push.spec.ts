import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

for (const config of [
  {
    kind: 'application',
    source: 'FinancePayableApplication',
    target: 'FinancePayablePayment',
    targetKind: 'payment',
    title: '付款申请单',
    targetTitle: '付款单',
    status: 'approved'
  },
  {
    kind: 'payment',
    source: 'FinancePayablePayment',
    target: 'FinancePayableRefund',
    targetKind: 'refund',
    title: '付款单',
    targetTitle: '付款退款单',
    status: 'confirmed'
  }
]) {
  const records = () =>
    [1, 2].map((index) => ({
      id: `source-${index}`,
      record_key: `source-${index}`,
      document_no: `QA-PUSH-SOURCE-${index}`,
      kind: config.kind,
      status: config.status,
      frozen: false,
      payment_status: 'none',
      amount: index * 100,
      currency_code: 'CNY',
      business_date: '2026-10-24',
      counterparty_name: `隔离下推供应商${index}`,
      lines: []
    }))

  test(`${config.kind}下推等待期间离开或离开后返回，不被旧结果跳转`, async ({ page }) => {
    let release: (() => void) | undefined
    let created: Record<string, unknown> | undefined
    let targetReads = 0
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_settlement_list_secure') {
        const input = route.request().postDataJSON()
        if (input.p_kind === config.kind)
          return route.fulfill({ json: { data: records(), total: 2 } })
        targetReads++
        return route.fulfill({ json: { data: created ? [created] : [], total: created ? 1 : 0 } })
      }
      if (name === 'fms_push_payable_settlement_secure') {
        const input = route.request().postDataJSON()
        await new Promise<void>((resolve) => {
          release = resolve
        })
        created = {
          ...records()[0],
          id: `created-${input.p_id}`,
          document_no: 'QA-LATE-PUSH',
          kind: config.targetKind,
          status: 'draft'
        }
        return route.fulfill({ json: created })
      }
      return route.fulfill({ json: [] })
    })
    const permissions = [
      `${config.source}:View`,
      `${config.source}:Push`,
      `${config.target}:View`,
      `${config.target}:Add`
    ]
    for (const index of [1, 2]) {
      release = undefined
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=${config.kind}&navigationTest=1&permissions=${permissions.join(',')}`
      )
      await expect(page.getByRole('heading', { name: config.title, exact: true })).toBeVisible({
        timeout: 60000
      })
      await page
        .getByRole('row')
        .filter({ hasText: `QA-PUSH-SOURCE-${index}` })
        .locator('label.el-checkbox')
        .click()
      await page.getByRole('button', { name: '下推', exact: true }).click()
      await page.getByRole('menuitem', { name: config.targetTitle, exact: true }).click()
      await expect.poll(() => Boolean(release)).toBe(true)
      await page.getByRole('button', { name: '打开其他页面', exact: true }).click()
      await expect(page.getByRole('heading', { name: '其他业务页面', exact: true })).toBeVisible()
      if (index === 2) {
        await page.getByRole('button', { name: '返回来源页面', exact: true }).click()
        await expect(page.getByRole('heading', { name: config.title, exact: true })).toBeVisible()
      }
      release?.()
      await page.waitForLoadState('networkidle')
      await expect(
        page.getByRole('heading', {
          name: index === 1 ? '其他业务页面' : config.title,
          exact: true
        })
      ).toBeVisible()
      expect(created?.id).toBe(`created-source-${index}`)
      expect(targetReads).toBe(0)
    }
  })

  test(`${config.kind}下推要求目标新增及查看权限`, async ({ page }) => {
    let writes = 0
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_settlement_list_secure')
        return route.fulfill({ json: { data: records(), total: 2 } })
      if (name === 'fms_push_payable_settlement_secure') writes++
      return route.fulfill({ json: [] })
    })
    for (const target of [[], ['Add'], ['View'], ['Add', 'View']]) {
      const permissions = [
        `${config.source}:View`,
        `${config.source}:Push`,
        ...target.map((action) => `${config.target}:${action}`)
      ]
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=${config.kind}&permissions=${permissions.join(',')}`
      )
      await expect(page.getByRole('heading', { name: config.title, exact: true })).toBeVisible({
        timeout: 60000
      })
      for (const index of [1, 2]) {
        const row = page.getByRole('row').filter({ hasText: `QA-PUSH-SOURCE-${index}` })
        await row.locator('label.el-checkbox').click()
        const push = page.getByRole('button', { name: '下推', exact: true })
        if (target.length === 2) await expect(push).toBeEnabled()
        else await expect(push).toBeDisabled()
        await row.locator('label.el-checkbox').click()
      }
    }
    expect(writes).toBe(0)
  })

  test(`${config.kind}两张来源下推失败重试并导航到新建目标单据`, async ({ page }, info) => {
    const sources = records()
    const targets: Array<Record<string, unknown>> = []
    const calls: Array<{ p_id: string; p_kind: string; p_source: string }> = []
    const targetReads: string[] = []
    let fail = true
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_settlement_list_secure') {
        const body = route.request().postDataJSON()
        if (body.p_kind === config.kind) return route.fulfill({ json: { data: sources, total: 2 } })
        if (body.p_query.id) targetReads.push(body.p_query.id)
        const data = targets.filter((row) => !body.p_query.id || row.id === body.p_query.id)
        return route.fulfill({ json: { data, total: data.length } })
      }
      if (name === 'fms_push_payable_settlement_secure') {
        const body = route.request().postDataJSON()
        calls.push(body)
        expect(body.p_kind).toBe(config.targetKind)
        expect(body.p_source).toBe(config.kind)
        if (fail) {
          fail = false
          return route.fulfill({
            status: 409,
            json: { code: 'P0001', message: '可下推金额已变化，请刷新后重试' }
          })
        }
        const index = body.p_id.endsWith('1') ? 1 : 2
        const created = {
          ...sources[index - 1],
          id: `target-${index}`,
          record_key: `target-${index}`,
          document_no: `QA-PUSH-TARGET-${index}`,
          kind: config.targetKind,
          status: 'draft'
        }
        targets.push(created)
        return route.fulfill({ json: created })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const permissions = [
      `${config.source}:View`,
      `${config.source}:Push`,
      `${config.target}:View`,
      `${config.target}:Add`
    ]
    for (const index of [1, 2]) {
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=${config.kind}&theme=${theme}&permissions=${permissions.join(',')}`
      )
      await expect(page.getByRole('heading', { name: config.title, exact: true })).toBeVisible({
        timeout: 60000
      })
      const row = page.getByRole('row').filter({ hasText: `QA-PUSH-SOURCE-${index}` })
      await row.locator('label.el-checkbox').click()
      const push = page.getByRole('button', { name: '下推', exact: true })
      await push.click()
      await page.getByRole('menuitem', { name: config.targetTitle, exact: true }).click()
      if (index === 1) {
        await expect(
          page.getByText('可下推金额已变化，请刷新后重试', { exact: true })
        ).toBeVisible()
        await expect(page.getByRole('heading', { name: config.title, exact: true })).toBeVisible()
        expect(targets).toHaveLength(0)
        await expect(push).toBeEnabled()
        await push.click()
        await page.getByRole('menuitem', { name: config.targetTitle, exact: true }).click()
      }
      await expect(
        page.getByRole('heading', { name: config.targetTitle, exact: true })
      ).toBeVisible()
      await expect(page.getByText(`QA-PUSH-TARGET-${index}`, { exact: true })).toBeVisible()
      expect(targetReads).toContain(`target-${index}`)
    }
    expect(calls).toHaveLength(3)
    expect(targets).toHaveLength(2)
    await expect(page.locator('.el-message')).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('new-target-record.png'), fullPage: true })
  })
}
