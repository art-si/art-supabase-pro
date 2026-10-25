import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)

test('报销详情两张单据的费用及运单关联入口遵循各自查看权限和有效标识', async ({ page }, info) => {
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/sys_dictionary')) {
      const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
      return route.fulfill({
        json:
          code === 'tmsReimbursementApprovalStatus'
            ? [
                {
                  id: 'draft',
                  code: 'draft',
                  value: 'draft',
                  label: '草稿',
                  status: '1',
                  dict_type_table: { code }
                }
              ]
            : []
      })
    }
    if (!route.request().url().endsWith('/tms_get_expense_reimbursement_secure'))
      return route.fulfill({ json: [] })
    const id = route.request().postDataJSON().p_id
    return route.fulfill({
      json: {
        id,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        reimbursement_no: `QA-LINK-${id}`,
        source_type: 'waybill',
        status: 'draft',
        applicant_name_snapshot: '隔离报销验收员工',
        planned_payment_date: '2026-10-24',
        item_count: 2,
        waybill_count: 1,
        waybill_nos: `WAYBILL-${id}`,
        attachment_urls: [],
        items: [
          {
            id: `${id}-missing`,
            cost_no_snapshot: '历史费用快照',
            waybill_no_snapshot: '历史运单快照'
          },
          {
            id: `${id}-item`,
            cost_id: `cost-${id}`,
            cost_no_snapshot: `COST-${id}`,
            waybill_id: `waybill-${id}`,
            waybill_no_snapshot: `WAYBILL-${id}`
          }
        ]
      }
    })
  })
  for (const permissions of [
    ['FinanceExpenseReimbursement:View'],
    ['FinanceExpenseReimbursement:View', 'FinanceWaybillCost:View'],
    ['FinanceExpenseReimbursement:View', 'TmsLoadedWaybillList:View'],
    ['FinanceExpenseReimbursement:View', 'FinanceWaybillCost:View', 'TmsPendingWaybillList:View']
  ]) {
    for (const id of ['first', 'second']) {
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_reimbursement_detail&detailLinks=1&theme=${theme}&recordId=${id}&permissions=${permissions.join(',')}`
      )
      await expect(page.getByRole('heading', { name: `QA-LINK-${id}`, exact: true })).toBeVisible()
      const canCost = permissions.includes('FinanceWaybillCost:View')
      const canWaybill = permissions.some((permission) => permission.startsWith('Tms'))
      await expect(page.getByRole('link', { name: '历史费用快照', exact: true })).toHaveCount(0)
      await expect(page.getByRole('link', { name: '历史运单快照', exact: true })).toHaveCount(0)
      await expect(page.getByRole('link', { name: `COST-${id}`, exact: true })).toHaveCount(
        canCost ? 1 : 0
      )
      await expect(page.getByRole('link', { name: `WAYBILL-${id}`, exact: true })).toHaveCount(
        canWaybill ? 1 : 0
      )
      await expect(page.getByRole('button', { name: '查看关联运单', exact: true })).toHaveCount(
        canWaybill ? 1 : 0
      )
      if (id === 'second' && (permissions.length === 1 || (canCost && canWaybill)))
        await page.screenshot({
          path: info.outputPath(canCost ? 'authorized-links.png' : 'readonly-snapshots.png'),
          fullPage: true
        })
      if (canWaybill) {
        await page.getByRole('button', { name: '查看关联运单', exact: true }).click()
        await expect(
          page.getByRole('heading', { name: `关联运单目标 waybill-${id}`, exact: true })
        ).toBeVisible()
        await page.getByRole('button', { name: '返回报销', exact: true }).click()
      }
      if (canCost) {
        await page.getByRole('link', { name: `COST-${id}`, exact: true }).click()
        await expect(
          page.getByRole('heading', { name: `关联费用目标 cost-${id}`, exact: true })
        ).toBeVisible()
      }
    }
  }
})
