import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const fixtures = '/tests/e2e/fixtures'
const treeNode = (tree: Locator, label: string) =>
  tree.getByText(label, { exact: true }).locator('xpath=ancestor::*[@role="treeitem"][1]')
const pickerTree = (dialog: Locator) => dialog.locator('.art-data-select-dialog__tree')

async function openOrganizationPicker(page: Page, mode: 'single' | 'strict' | 'cascade') {
  await page.goto(`${fixtures}/data-select-loading.html?tree=${mode}`)
  const open = page.getByRole('button', { name: '打开组织选择器', exact: true })
  await open.press('Enter')
  const dialog = page.getByRole('dialog', { name: '组织键盘选择', exact: true })
  const tree = pickerTree(dialog)
  await expect(tree).toBeVisible()
  return {
    open,
    dialog,
    tree,
    confirm: dialog.getByRole('button', { name: '确定', exact: true }),
    cancel: dialog.getByRole('button', { name: '取消', exact: true }),
    value: page.getByTestId('tree-value'),
    records: page.getByTestId('tree-confirmed-records')
  }
}

test('数据选择器主树：远程列表到达后可按 Tab，窄弹窗显示完整待确认名称', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const fullLabel = '华东生产运营中心装配检验与质量追溯联合工作组第一车间'
  let notifyRequest: (route: Route) => void = () => {}
  const requested = new Promise<Route>((resolve) => (notifyRequest = resolve))
  await page.route('**/__test/data-select-tree', (route) => notifyRequest(route))
  await page.goto(`${fixtures}/data-select-loading.html?tree=remote`)
  await page.getByRole('button', { name: '打开组织选择器', exact: true }).press('Enter')
  const dialog = page.getByRole('dialog', { name: '组织键盘选择', exact: true })
  const content = dialog.locator('.art-data-select-dialog__content')
  const tree = pickerTree(dialog)
  const search = dialog.getByRole('textbox', { name: '请输入关键词', exact: true })
  const first = treeNode(tree, fullLabel)
  await expect(content).toHaveAttribute('aria-busy', 'true')
  await search.focus()
  await expect(search).toBeFocused()
  const route = await requested
  await route.fulfill({
    json: [
      { id: 'remote-a', label: fullLabel },
      { id: 'remote-b', label: '远程乙车间' }
    ]
  })
  await expect(content).toHaveAttribute('aria-busy', 'false')
  await expect(first).toBeVisible()
  await expect(search).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(first).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('tree-value')).toHaveText('null')
  const summary = dialog.getByRole('status').filter({ hasText: fullLabel })
  await expect(summary).toHaveText(`当前选择：${fullLabel}`)
  const geometry = await summary.evaluate((element) => {
    const area = element.closest('.art-dialog__footer-left')
    if (!area) throw new Error('未找到参选摘要容器')
    const box = area.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(element)
    const lines = Array.from(range.getClientRects())
    return (
      lines.length > 0 &&
      lines.every(
        (line) =>
          line.left >= box.left - 1 && line.right <= box.right + 1 && line.bottom <= box.bottom + 1
      )
    )
  })
  expect(geometry).toBe(true)
  const confirm = dialog.getByRole('button', { name: '确定', exact: true })
  await expect(confirm).toBeInViewport()
  const footer = dialog.locator('.art-dialog__footer')
  expect(
    await footer.evaluate((element) => {
      const summary = element.querySelector('.art-dialog__footer-left')
      const actions = element.querySelector('.art-dialog__footer-actions')
      return Boolean(
        summary &&
        actions &&
        actions.getBoundingClientRect().top >= summary.getBoundingClientRect().bottom
      )
    })
  ).toBe(true)
  await page.screenshot({
    path: info.outputPath('narrow-selection-summary.png'),
    animations: 'disabled'
  })
})

test('数据选择器主树：单选方向键不改草稿、Enter 与指针选择一致', async ({ page }, info) => {
  const { open, dialog, tree, confirm, cancel, value, records } = await openOrganizationPicker(
    page,
    'single'
  )
  const branch = treeNode(tree, '生产部门')
  const leaf = treeNode(tree, '甲车间')
  const disabled = treeNode(tree, '停用车间')
  const drafts = tree.locator('.art-data-select-dialog__tree-node.is-selected')

  await leaf.getByText('甲车间', { exact: true }).click()
  await expect(drafts).toHaveText(['甲车间'])
  await expect(value).toHaveText('null')
  await cancel.click()
  await expect(dialog).toBeHidden()
  await expect(value).toHaveText('null')
  await expect(records).toHaveText('[]')
  await open.press('Enter')
  await expect(tree).toBeVisible()
  await expect(drafts).toHaveCount(0)

  await branch.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(branch).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowRight')
  await expect(branch).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(leaf).toBeFocused()
  await expect(drafts).toHaveCount(0)
  await expect(value).toHaveText('null')
  await page.keyboard.press('Enter')
  await expect(drafts).toHaveText(['甲车间'])
  await expect(leaf).toBeFocused()
  await expect(leaf).toHaveCSS('outline-style', 'none')
  await expect(dialog).toBeVisible()
  await expect(value).toHaveText('null')
  const focusedContent = leaf.locator(':scope > .el-tree-node__content')
  await expect(focusedContent).toHaveCSS('outline-style', 'solid')
  await expect(focusedContent).toHaveCSS('outline-width', '2px')
  await dialog.screenshot({
    path: info.outputPath('data-select-tree-focused.png'),
    animations: 'disabled'
  })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await dialog.screenshot({
    path: info.outputPath('data-select-tree-focused-dark.png'),
    animations: 'disabled'
  })
  await page.evaluate(() => document.documentElement.classList.remove('dark'))

  await expect(disabled).toHaveAttribute('aria-disabled', 'true')
  await disabled.press('Enter')
  await expect(drafts).toHaveText(['甲车间'])
  await confirm.click()
  await expect(dialog).toBeHidden()
  await expect(value).toHaveText('"workshop-a"')
  await expect(records).toHaveText('["workshop-a"]')
})

for (const mode of ['strict', 'cascade'] as const) {
  test(`数据选择器主树：多选 ${mode} 方向键不勾选，Space 保留父子规则`, async ({ page }) => {
    const { dialog, open, tree, confirm, cancel, value, records } = await openOrganizationPicker(
      page,
      mode
    )
    const branch = treeNode(tree, '生产部门')
    const first = treeNode(tree, '甲车间')
    const second = treeNode(tree, '乙车间')
    const disabled = treeNode(tree, '停用车间')
    const selected = dialog.locator('.art-data-select-dialog__selected-item strong')
    const cascade = mode === 'cascade'
    const committed = cascade ? ['department', 'workshop-a', 'workshop-b'] : ['department']

    await first.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(branch).toBeFocused()
    await expect(first).toHaveAttribute('aria-checked', 'false')
    await expect(selected).toHaveCount(0)
    await page.keyboard.down('Space')
    await page.keyboard.down('Space')
    await page.keyboard.up('Space')
    await expect(branch).toHaveAttribute('aria-checked', 'true')
    await expect(first).toHaveAttribute('aria-checked', String(cascade))
    await expect(second).toHaveAttribute('aria-checked', String(cascade))
    await expect(selected).toHaveText(cascade ? ['生产部门', '甲车间', '乙车间'] : ['生产部门'])
    await expect(dialog).toBeVisible()
    await expect(value).toHaveText('[]')

    await expect(disabled).toHaveAttribute('aria-disabled', 'true')
    await disabled.press('Space')
    await expect(disabled).toHaveAttribute('aria-checked', 'false')
    await expect(selected).toHaveCount(committed.length)
    await confirm.click()
    await expect(dialog).toBeHidden()
    await expect(value).toHaveText(JSON.stringify(committed))
    await expect(records).toHaveText(JSON.stringify(committed))

    await open.press('Enter')
    await expect(branch).toHaveAttribute('aria-checked', 'true')
    await branch.press('Space')
    await expect(branch).toHaveAttribute('aria-checked', 'false')
    await expect(selected).toHaveCount(0)
    await cancel.click()
    await expect(dialog).toBeHidden()
    await expect(value).toHaveText(JSON.stringify(committed))
    await expect(records).toHaveText(JSON.stringify(committed))
  })
}

test('TMS 报价费用主树：键盘勾选只在确认后加入原费用项', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rpc/tms_get_order_quote_secure', (route) =>
    route.fulfill({
      json: {
        order: { id: 'quote-order', order_no: 'ORDER-TEST' },
        quote: {
          status: 'draft',
          transport_fee: 100,
          supplementary_items: [],
          attachment_urls: []
        }
      }
    })
  )
  await page.route('**/rest/v1/tms_expense_item?*', (route) =>
    route.fulfill({
      json: [
        { id: 'fee-group', item_name: '运输费用分组', item_code: 'FEE-ROOT', is_selectable: false },
        {
          id: 'valid-fee',
          parent_id: 'fee-group',
          item_name: '加急运费',
          item_code: 'FEE-EXPRESS',
          is_selectable: true
        },
        {
          id: 'other-fee',
          parent_id: 'fee-group',
          item_name: '夜间运费',
          item_code: 'FEE-NIGHT',
          is_selectable: true
        }
      ].map((row, sort) => ({ ...row, is_enabled: true, sort }))
    })
  )
  const writes: string[] = []
  await page.route('**/rpc/tms_save_order_quote_secure', (route) => {
    writes.push(route.request().url())
    return route.abort()
  })
  await page.goto(`${fixtures}/order-quote-state.html`)
  await page.getByRole('button', { name: '打开报价', exact: true }).click()
  const quote = page.getByRole('dialog', { name: '报价 · ORDER-TEST', exact: true })
  const add = quote.getByRole('button', { name: '添加费用', exact: true })
  const picker = page.getByRole('dialog', { name: '选择补充费用项目', exact: true })
  const tree = pickerTree(picker)
  const group = treeNode(tree, '运输费用分组')
  const fee = treeNode(tree, '加急运费')
  const otherFee = treeNode(tree, '夜间运费')
  const selected = picker.locator('.art-data-select-dialog__selected-item strong')

  await expect(add).toBeEnabled({ timeout: 20_000 })
  await add.click()
  await expect(group).toHaveAttribute('aria-disabled', 'true')
  await picker.getByRole('textbox', { name: '搜索费用项目名称或编码', exact: true }).focus()
  await page.keyboard.press('Tab')
  await expect(tree.locator('[role="treeitem"]:focus')).toHaveCount(1)
  await group.press('ArrowLeft')
  await expect(group).toHaveAttribute('aria-expanded', 'false')
  await expect(fee).toBeHidden()
  await group.press('ArrowRight')
  await expect(group).toHaveAttribute('aria-expanded', 'true')
  await expect(fee).toBeVisible()
  await expect(group).toHaveAttribute('aria-checked', 'false')
  await expect(selected).toHaveCount(0)
  await group.press('Space')
  await expect(selected).toHaveCount(0)
  await fee.press('ArrowLeft')
  await expect(fee).toHaveAttribute('aria-checked', 'false')
  await fee.press('Space')
  await expect(selected).toHaveText(['加急运费'])
  await expect(otherFee).toHaveAttribute('aria-checked', 'false')
  await picker.getByRole('button', { name: '取消', exact: true }).click()
  await expect(picker).toBeHidden()
  await expect(quote.getByText('暂无补充费用', { exact: true })).toBeVisible()

  await add.click()
  await fee.press('Space')
  await expect(selected).toHaveText(['加急运费'])
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(picker).toBeHidden()
  await expect(quote.getByText('FEE-EXPRESS', { exact: true })).toBeVisible()
  await expect(quote.getByText('FEE-NIGHT', { exact: true })).toHaveCount(0)
  expect(writes).toEqual([])
})
