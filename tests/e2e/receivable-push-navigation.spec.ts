import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)

for (const config of [
  {
    target: 'financial',
    menu: '财务应收',
    dialog: '财务应收单',
    permission: 'FinanceFinancialReceivable',
    rpc: 'fms_push_financial_receivable_secure'
  },
  {
    target: 'revenue',
    menu: '收入成本确认',
    dialog: '收入成本确认详情',
    permission: 'FinanceRevenueCost',
    rpc: 'fms_push_revenue_cost_secure'
  }
]) {
  for (const delayed of [true, false]) {
    test(`暂估应收-${config.target} ${delayed ? '下推等待期间离开或返回' : '两条失败重试并打开目标详情'}`, async ({
      page
    }, info) => {
      const sources = [1, 2].map((index) => ({
        id: `ar-source-${index}`,
        record_key: `ar-source-${index}`,
        document_no: `QA-AR-SOURCE-${index}`,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        kind: 'estimate',
        status: 'approved',
        customer_id: 'customer',
        customer_name: '隔离应收客户',
        currency_code: 'CNY',
        business_date: '2026-10-24',
        accounting_date: '2026-10-24',
        amount: index * 100,
        tax_amount: 0,
        total_amount: index * 100,
        available_amount: index * 100,
        outstanding_amount: index * 100,
        unreversed_amount: index * 100,
        lines: []
      }))
      const targets: Array<Record<string, unknown>> = []
      const calls: string[] = []
      const targetReads: string[] = []
      let release: (() => void) | undefined
      let fail = !delayed
      await page.route('**/rest/v1/**', async (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1)
        const input = route.request().postDataJSON() || {}
        if (name === 'fms_receivable_workspace_secure') {
          const id = input.p_query?.id
          const source = input.p_kind === 'estimate'
          if (!source && id) targetReads.push(id)
          const records = (source ? sources : targets).filter((row) => !id || row.id === id)
          return route.fulfill({ json: { records, total: records.length } })
        }
        if (name === config.rpc) {
          calls.push(input.p_estimate_id)
          if (delayed)
            await new Promise<void>((resolve) => {
              release = resolve
            })
          if (fail) {
            fail = false
            return route.fulfill({
              status: 409,
              json: { code: 'P0001', message: '应收下推失败，请重试' }
            })
          }
          const source = sources.find((row) => row.id === input.p_estimate_id)
          expect(source).toBeDefined()
          const id = `created-${input.p_estimate_id}`
          targets.push({
            ...source,
            id,
            record_key: id,
            document_no: `QA-AR-TARGET-${input.p_estimate_id}`,
            kind: config.target,
            status: 'draft',
            revenue_amount: 100,
            cost_amount: 50
          })
          return route.fulfill({ json: id })
        }
        return route.fulfill({ json: [] })
      })
      const permissions = [
        'FinanceEstimatedReceivable:View',
        'FinanceEstimatedReceivable:Push',
        `${config.permission}:Add`,
        `${config.permission}:View`
      ].join(',')
      const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
      for (const index of [1, 2]) {
        release = undefined
        await page.goto(
          `/tests/e2e/fixtures/receivable-workspace.html?kind=estimate&arNavigation=1&theme=${theme}&permissions=${permissions}`
        )
        await expect(page.getByRole('heading', { name: '暂估应收单', exact: true })).toBeVisible({
          timeout: 60000
        })
        if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
        await page
          .getByRole('row')
          .filter({ hasText: `QA-AR-SOURCE-${index}` })
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
              name: index === 1 ? '其他业务页面' : '暂估应收单',
              exact: true
            })
          ).toBeVisible()
          expect(targetReads).toHaveLength(0)
        } else {
          if (index === 1) {
            await expect(page.locator('.el-message--error').last()).toContainText('应收下推失败')
            expect(targets).toHaveLength(0)
            await expect(
              page.getByRole('heading', { name: '暂估应收单', exact: true })
            ).toBeVisible()
            await invoke()
          }
          const dialog = page.getByRole('dialog', { name: config.dialog, exact: true })
          await expect(dialog).toContainText(`QA-AR-TARGET-ar-source-${index}`)
          await expect(dialog).not.toContainText(`QA-AR-TARGET-ar-source-${index === 1 ? 2 : 1}`)
          expect(targetReads).toContain(`created-ar-source-${index}`)
          if (index === 2) {
            await expect(page.locator('.el-message')).toHaveCount(0)
            await dialog.screenshot({ path: info.outputPath('target-detail.png') })
          }
        }
      }
      expect(calls).toEqual(
        delayed ? ['ar-source-1', 'ar-source-2'] : ['ar-source-1', 'ar-source-1', 'ar-source-2']
      )
      expect(targets).toHaveLength(2)
    })
  }
}
