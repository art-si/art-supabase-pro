import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

const expenseItems = [
  {
    id: 'expense-group',
    parent_id: null,
    item_code: 'FEE',
    item_name: '运输补充费用',
    is_selectable: false,
    is_enabled: true,
    sort: 1
  },
  {
    id: 'expense-loading',
    parent_id: 'expense-group',
    item_code: 'FEE-01',
    item_name: '装卸补费',
    is_selectable: true,
    is_enabled: true,
    sort: 10
  },
  {
    id: 'expense-waiting',
    parent_id: 'expense-group',
    item_code: 'FEE-02',
    item_name: '等候补费',
    is_selectable: true,
    is_enabled: true,
    sort: 20
  }
]

test('报价补充费用按订单租户树形多选，新增金额为空且不能重复添加', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/tms_expense_item')) return route.fulfill({ json: expenseItems })
    return route.fulfill({ json: [] })
  })
  await page.route('**/rpc/tms_get_order_quote_secure', (route) =>
    route.fulfill({
      json: {
        order: {
          id: 'quote-order',
          order_no: 'ORDER-TEST',
          origin_station: '测试始发站',
          destination_station: '测试到货站'
        },
        quote: null
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/order-quote-state.html', { waitUntil: 'domcontentloaded' })
  const expenseRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith('/tms_expense_item')
  )
  await page.getByRole('button', { name: '打开报价' }).click()
  const expenseUrl = new URL((await expenseRequest).url())
  expect(expenseUrl.searchParams.get('tenant_id')).toBe('eq.11111111-1111-4111-8111-111111111111')
  expect(expenseUrl.searchParams.get('is_enabled')).toBe('eq.true')

  const dialog = page.getByRole('dialog', { name: '报价 · ORDER-TEST' })
  await expect(dialog).toBeVisible()
  const card = dialog.locator('.art-section-card').filter({ hasText: '补充费用' })
  await expect(
    card.locator('.art-section-card__actions').getByRole('button', { name: '添加费用' })
  ).toBeVisible()
  await expect(dialog.getByRole('spinbutton', { name: '运输费（元）' })).toBeEmpty()

  await dialog.getByRole('button', { name: '添加费用' }).click()
  const picker = page.getByRole('dialog', { name: '选择补充费用项目' })
  await expect(picker.locator('.el-tree')).toBeVisible()
  await picker.screenshot({ path: info.outputPath('quote-picker-tree.png') })
  await expect(
    picker
      .locator('.el-tree-node__content')
      .filter({ hasText: '运输补充费用' })
      .first()
      .locator('.el-checkbox')
  ).toHaveClass(/is-disabled/)
  for (const label of ['装卸补费', '等候补费']) {
    await picker
      .locator('.el-tree-node__content')
      .filter({ hasText: label })
      .locator('.el-checkbox')
      .click()
  }
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(card.getByText('装卸补费', { exact: true })).toBeVisible()
  await expect(card.getByText('FEE-02', { exact: true })).toBeVisible()
  for (const amount of await card.getByRole('spinbutton').all()) await expect(amount).toBeEmpty()

  await dialog.getByRole('button', { name: '添加费用' }).click()
  await expect(
    picker.locator('.el-tree-node__content').filter({ hasText: '装卸补费' }).locator('.el-checkbox')
  ).toHaveClass(/is-disabled/)
  await picker.getByRole('button', { name: '取消', exact: true }).click()
  await page.screenshot({ path: info.outputPath('quote-tree-fees.png'), animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
  await page.screenshot({
    path: info.outputPath('quote-tree-fees-narrow.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})
