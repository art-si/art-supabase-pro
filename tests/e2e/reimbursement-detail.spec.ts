import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90000)

for (const theme of ['light', 'dark']) {
  test(`报销详情 ${theme} 失败可重试且两张单据互不混淆`, async ({ page }, info) => {
    let fail = true
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const resource = url.pathname.split('/').at(-1)
      if (resource === 'sys_dictionary') {
        const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
        return route.fulfill({
          json:
            code === 'tmsReimbursementApprovalStatus'
              ? [
                  {
                    id: 'reimbursement-draft',
                    code: 'draft',
                    value: 'draft',
                    label: '草稿',
                    status: '1',
                    sort: 1,
                    dict_type_table: { code, name: '报销状态' }
                  }
                ]
              : []
        })
      }
      if (resource !== 'tms_get_expense_reimbursement_secure') return route.fulfill({ json: [] })
      if (fail)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '报销详情加载失败，请稍后重试' }
        })
      const id = route.request().postDataJSON().p_id as string
      const index = id.endsWith('2') ? 2 : 1
      return route.fulfill({
        json: {
          id,
          tenant_id: '11111111-1111-4111-8111-111111111111',
          reimbursement_no: `FYBX-DETAIL-${index}`,
          source_type: 'travel',
          status: 'draft',
          is_demo: true,
          applicant_name_snapshot: `验收员工${index}`,
          expense_department_name_snapshot: '验收公司 / 费用部门',
          reimbursement_date: '2026-10-23',
          reason: `详情验收事由${index}`,
          total_amount: index * 100,
          approved_amount: 0,
          paid_amount: 0,
          cash_payable_amount: index * 100,
          item_count: 1,
          field_access: {
            reimbursementAmounts: 'read',
            payeeDetails: 'read',
            reimbursementEvidence: 'read',
            paymentExecution: 'read'
          },
          loan_offset_amount: 0,
          attachment_urls: [],
          items: [],
          payees: [],
          payments: [],
          travel_lines: [
            {
              id: `detail-line-${index}`,
              expense_item_name_snapshot: `验收费用项目${index}`,
              gross_amount: index * 100,
              net_amount: index * 100,
              tax_amount: 0,
              tax_rate: 0,
              occurred_on: '2026-10-23',
              attachment_urls: []
            }
          ]
        }
      })
    })
    for (const index of [1, 2]) {
      fail = true
      await page.goto(
        `/tests/e2e/fixtures/receivable-workspace.html?kind=expense_reimbursement_detail&theme=${theme}&recordId=detail-${index}`
      )
      const retry = page.getByRole('button', { name: /重新加载|重试/ }).first()
      await expect(retry).toBeVisible()
      await expect(
        page.getByText('未找到该费用报销单，或当前账号无权查看', { exact: true })
      ).not.toBeVisible()
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      fail = false
      await retry.click()
      await expect(
        page.getByRole('heading', { name: `FYBX-DETAIL-${index}`, exact: true })
      ).toBeVisible()
      await expect(page.getByText('草稿', { exact: true }).first()).toBeVisible()
      await expect(page.getByText(`详情验收事由${index}`, { exact: true })).toBeVisible()
      await expect(page.getByText(`验收费用项目${index}`, { exact: true })).toBeVisible()
      await expect(
        page.getByText(`详情验收事由${index === 1 ? 2 : 1}`, { exact: true })
      ).not.toBeVisible()
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true)
      await page.screenshot({
        path: info.outputPath(`reimbursement-detail-${index}.png`),
        fullPage: true
      })
    }
  })
}

test('报销详情复用页面时读取新单据，旧请求晚到不能覆盖当前单据', async ({ page }) => {
  const calls: string[] = []
  let releaseSecond: (() => void) | undefined
  await page.route('**/rest/v1/**', async (route) => {
    const resource = new URL(route.request().url()).pathname.split('/').at(-1)
    if (resource !== 'tms_get_expense_reimbursement_secure') return route.fulfill({ json: [] })
    const id = route.request().postDataJSON().p_id
    calls.push(id)
    if (id === 'detail-2')
      await new Promise<void>((resolve) => {
        releaseSecond = resolve
      })
    return route.fulfill({
      json: {
        id,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        reimbursement_no: `QA-${id}`,
        source_type: 'travel',
        status: 'draft',
        is_demo: true,
        reason: `事由-${id}`,
        field_access: {
          reimbursementAmounts: 'read',
          payeeDetails: 'read',
          reimbursementEvidence: 'read',
          paymentExecution: 'read'
        },
        attachment_urls: [],
        payees: [],
        payments: [],
        items: [],
        travel_lines: []
      }
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/receivable-workspace.html?kind=expense_reimbursement_detail&recordId=detail-1&detailNavigation=1'
  )
  await expect(page.getByRole('heading', { name: 'QA-detail-1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '切换详情2', exact: true }).click()
  await expect.poll(() => Boolean(releaseSecond)).toBe(true)
  await page.getByRole('button', { name: '切换详情1', exact: true }).click()
  await expect.poll(() => calls.filter((id) => id === 'detail-1').length).toBe(2)
  await expect(page.getByRole('heading', { name: 'QA-detail-1', exact: true })).toBeVisible()
  releaseSecond?.()
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('事由-detail-1', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'QA-detail-2', exact: true })).toHaveCount(0)
  expect(calls).toEqual(['detail-1', 'detail-2', 'detail-1'])
})

test('报销详情缓存返回重新读取当前单据，离开后的旧请求不污染缓存', async ({ page }) => {
  const calls: string[] = []
  let releaseSecond: (() => void) | undefined
  await page.route('**/rest/v1/**', async (route) => {
    if (!route.request().url().endsWith('/tms_get_expense_reimbursement_secure'))
      return route.fulfill({ json: [] })
    const id = route.request().postDataJSON().p_id
    calls.push(id)
    const number = calls.filter((value) => value === id).length
    if (id === 'detail-2')
      await new Promise<void>((resolve) => {
        releaseSecond = resolve
      })
    return route.fulfill({
      json: {
        id,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        reimbursement_no: `QA-${id}-v${number}`,
        source_type: 'travel',
        status: 'draft',
        is_demo: true,
        attachment_urls: [],
        payees: [],
        payments: [],
        items: [],
        travel_lines: []
      }
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/receivable-workspace.html?kind=expense_reimbursement_detail&recordId=detail-1&detailNavigation=1&detailKeepAlive=1'
  )
  await expect(page.getByRole('heading', { name: 'QA-detail-1-v1', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '切换详情2', exact: true }).click()
  await expect.poll(() => Boolean(releaseSecond)).toBe(true)
  await page.getByRole('button', { name: '切换详情1', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'QA-detail-1-v2', exact: true })).toBeVisible()
  releaseSecond?.()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'QA-detail-1-v2', exact: true })).toBeVisible()
  expect(calls).toEqual(['detail-1', 'detail-2', 'detail-1'])
})
