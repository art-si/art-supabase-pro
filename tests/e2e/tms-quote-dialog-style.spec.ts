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
  const writes: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/tms_expense_item')) return route.fulfill({ json: expenseItems })
    if (path.endsWith('/tms_save_order_quote_secure')) writes.push(path)
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
  const header = card.locator('.el-table__header-wrapper')
  for (const label of ['费用项目', '金额（元）', '费用说明', '操作']) {
    await expect(header.getByRole('columnheader', { name: label })).toBeVisible()
  }
  await page.screenshot({ path: info.outputPath('quote-tree-fees.png'), animations: 'disabled' })

  await page.setViewportSize({ width: 390, height: 844 })
  await card.getByText('等候补费', { exact: true }).scrollIntoViewIfNeeded()
  await expect(header).toBeHidden()
  const tableViewport = card.locator('.el-table__body-wrapper .el-scrollbar__wrap')
  await expect
    .poll(() =>
      tableViewport.evaluate((viewport) => {
        const left = viewport.getBoundingClientRect().left
        const right = left + viewport.clientWidth
        const rows = Array.from(viewport.querySelectorAll('.el-table__row'), (row) => {
          const editors = [
            row.querySelector('.el-input-number'),
            row.querySelector('.quote-dialog__expense-remark .el-input'),
            row.querySelector('.quote-dialog__expense-remove')
          ]
          if (!editors.every((editor) => editor !== null)) return null
          const [amount, remark, remove] = editors.map((editor) => editor.getBoundingClientRect())
          return {
            insideContent: [amount, remark, remove].every(
              (bounds) => bounds.width > 0 && bounds.left >= left - 1 && bounds.right <= right + 1
            ),
            remarkGap: remove.left - remark.right >= 6,
            amountAligned:
              Math.abs(amount.left - remark.left) <= 1 && Math.abs(amount.right - remove.right) <= 1
          }
        })
        return {
          overflow: viewport.scrollWidth - viewport.clientWidth > 1,
          rows
        }
      })
    )
    .toEqual({
      overflow: false,
      rows: Array.from({ length: 2 }, () => ({
        insideContent: true,
        remarkGap: true,
        amountAligned: true
      }))
    })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)

  const amount = card.getByRole('spinbutton', { name: '装卸补费金额（元）' })
  const remark = card.getByRole('textbox', { name: '装卸补费备注' })
  await dialog.getByRole('button', { name: '保存报价', exact: true }).click()
  await expect(amount).toBeFocused()
  expect(writes).toEqual([])
  await amount.fill('123.45')
  await page.keyboard.press('Tab')
  await expect(remark).toBeFocused()
  await remark.fill('夜间装卸确认')
  await expect(amount).toHaveValue('123.45')
  await expect(remark).toHaveValue('夜间装卸确认')
  await expect(card.getByText('¥123.45', { exact: true })).toBeVisible()

  await expect(page.locator('.el-message--warning')).toHaveCount(0, { timeout: 7000 })
  await remark.blur()
  await page.setViewportSize({ width: 390, height: 960 })
  await card.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'nearest' }))
  await page.screenshot({
    path: info.outputPath('quote-tree-fees-narrow.png'),
    animations: 'disabled'
  })
  await card.getByRole('button', { name: '移除等候补费' }).click()
  await expect(card.getByText('等候补费', { exact: true })).toHaveCount(0)
  await expect(card.getByText('已添加 1 项', { exact: true })).toBeVisible()
  await expect(remark).toHaveValue('夜间装卸确认')
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
