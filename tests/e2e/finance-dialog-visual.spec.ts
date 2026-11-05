import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const fixture = '/tests/e2e/fixtures/finance-dialog-visual.html'
const expenseItems = [
  {
    id: 'expense-group-1',
    parent_id: null,
    item_code: 'ABN',
    item_name: '异常运费',
    is_selectable: false,
    is_enabled: true,
    sort: 1
  },
  {
    id: 'expense-item-1',
    parent_id: 'expense-group-1',
    item_code: 'ABN-01',
    item_name: '异常搬运费',
    is_selectable: true,
    is_enabled: true,
    sort: 10
  },
  {
    id: 'expense-item-2',
    parent_id: 'expense-group-1',
    item_code: 'ABN-02',
    item_name: '异常等待费',
    is_selectable: true,
    is_enabled: true,
    sort: 20
  },
  {
    id: 'expense-item-disabled',
    parent_id: 'expense-group-1',
    item_code: 'ABN-03',
    item_name: '停用费用',
    is_selectable: true,
    is_enabled: false,
    sort: 30
  }
]

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'tms_list_abnormal_freight_secure')
      return route.fulfill({
        json: [
          {
            id: '11111111-1111-4111-8111-111111111401',
            documentNo: 'YC-202611-001',
            ownership: 'customer_receivable',
            status: 'approved',
            totalAmount: 80
          },
          {
            id: '11111111-1111-4111-8111-111111111402',
            documentNo: 'YC-202611-002',
            ownership: 'carrier_deduction',
            status: 'pending_approval',
            totalAmount: 25
          }
        ]
      })
    if (endpoint === 'tms_expense_item') return route.fulfill({ json: expenseItems })
    if (endpoint === 'tms_list_waybill_cost_options_secure')
      return route.fulfill({
        json: {
          records: [
            {
              id: '11111111-1111-4111-8111-111111111301',
              tenantId: '11111111-1111-4111-8111-111111111111',
              waybillNo: 'YD-LOADED-001',
              status: 'accepted',
              orderId: '11111111-1111-4111-8111-111111111201',
              originCity: '上海',
              destinationCity: '苏州',
              plateNo: '测A12345',
              driver: { id: 'driver-1', driverName: '验收司机甲', phone: '13800000000' },
              order: {
                id: '11111111-1111-4111-8111-111111111201',
                orderNo: 'DD-ABNORMAL-001',
                dispatchPlateNo: '测A12345',
                dispatchDriverName: '验收司机甲'
              }
            }
          ],
          total: 1
        }
      })
    if (endpoint === 'sys_dictionary') {
      const code = new URL(route.request().url()).searchParams
        .get('dict_type_table.code')
        ?.replace(/^eq\./, '')
      const labels: Record<string, Array<[string, string]>> = {
        tmsAbnormalFreightOwnership: [
          ['customer_receivable', '客户应收'],
          ['carrier_deduction', '承运商扣减']
        ],
        tmsAbnormalFreightStatus: [
          ['draft', '草稿'],
          ['submitted', '已提交'],
          ['pending_approval', '审批中'],
          ['approved', '已通过'],
          ['rejected', '已驳回']
        ],
        tmsOrderQuoteStatus: [
          ['draft', '草稿'],
          ['submitted', '已提交'],
          ['pending_approval', '审批中'],
          ['approved', '已通过'],
          ['rejected', '已驳回']
        ],
        tmsExpenseClassification: [
          ['normal', '正常费用'],
          ['abnormal', '异常费用']
        ]
      }
      return route.fulfill({
        json: (labels[code || ''] || []).map(([value, label], index) => ({
          id: `${code}-${index}`,
          code: value,
          label,
          value,
          sort: index,
          status: '1',
          dict_type_table: { code, name: code }
        }))
      })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
})

async function captureVariants(
  page: Page,
  info: import('@playwright/test').TestInfo,
  prefix: string
) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.classList.toggle('dark', value === 'dark')
    }, theme)
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
      { width: 390, height: 844 }
    ]) {
      await page.setViewportSize(viewport)
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      await page.screenshot({
        path: info.outputPath(`${prefix}-${viewport.width}-${theme}.png`),
        animations: 'disabled'
      })
    }
  }
}

test('异常运费从树形费用项目批量添加事件，金额初始为空', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('button', { name: '打开异常运费' }).click()
  const dialog = page.getByRole('dialog', { name: '异常运费' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('DD-ABNORMAL-001').first()).toBeVisible()
  await expect(dialog.getByText('YD-LOADED-001')).toBeVisible()
  await expect(dialog.getByText('验收司机甲')).toBeVisible()
  await expect(dialog.getByText('YC-202611-001')).toBeVisible()
  await expect(dialog.getByText('YC-202611-002')).toBeVisible()
  await expect(dialog.getByRole('spinbutton', { name: '异常金额' })).toHaveCount(0)
  const eventsCard = dialog.locator('.art-section-card').filter({ hasText: '异常事件' })
  await expect(
    eventsCard.locator('.art-section-card__actions').getByRole('button', { name: '添加事件' })
  ).toBeVisible()
  const expenseRequest = page.waitForRequest((request) =>
    new URL(request.url()).pathname.endsWith('/tms_expense_item')
  )
  await dialog.getByRole('button', { name: '添加事件' }).click()
  const expenseUrl = new URL((await expenseRequest).url())
  expect(expenseUrl.searchParams.get('tenant_id')).toBe('eq.11111111-1111-4111-8111-111111111111')
  expect(expenseUrl.searchParams.get('is_enabled')).toBe('eq.true')
  expect(expenseUrl.searchParams.has('is_selectable')).toBe(false)
  const picker = page.getByRole('dialog', { name: '选择费用项目' })
  await expect(picker).toBeVisible()
  await expect(picker.locator('.el-tree')).toBeVisible()
  await expect(picker.getByText('异常运费', { exact: true })).toBeVisible()
  await expect(picker.getByText('异常搬运费', { exact: true })).toBeVisible()
  await expect(picker.getByText('异常等待费', { exact: true })).toBeVisible()
  await picker.screenshot({ path: info.outputPath('expense-picker-tree-1440-light.png') })
  await expect(
    picker
      .locator('.el-tree-node__content')
      .filter({ hasText: '异常运费' })
      .first()
      .locator('.el-checkbox')
  ).toHaveClass(/is-disabled/)
  await picker
    .locator('.el-tree-node__content')
    .filter({ hasText: '异常搬运费' })
    .locator('.el-checkbox')
    .click()
  await picker.getByRole('button', { name: '取消', exact: true }).click()
  await expect(picker).toBeHidden()
  await expect(dialog.getByRole('spinbutton', { name: '异常金额' })).toHaveCount(0)

  await dialog.getByRole('button', { name: '添加事件' }).click()
  await expect(picker.locator('.art-data-select-dialog__selected-header')).toContainText('已选 0')
  await picker
    .locator('.el-tree-node__content')
    .filter({ hasText: '异常搬运费' })
    .locator('.el-checkbox')
    .click()
  await picker
    .locator('.el-tree-node__content')
    .filter({ hasText: '异常等待费' })
    .locator('.el-checkbox')
    .click()
  await expect(picker.locator('.art-data-select-dialog__selected-header')).toContainText('已选 2')
  await picker.screenshot({ path: info.outputPath('expense-picker-selected-1440-light.png') })
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(picker).toBeHidden()
  await expect(dialog.getByRole('spinbutton', { name: '异常金额' })).toHaveCount(2)
  await expect(dialog.getByText('异常搬运费', { exact: true }).first()).toBeVisible()
  await expect(dialog.getByText('异常等待费', { exact: true }).first()).toBeVisible()
  for (const amount of await dialog.getByRole('spinbutton', { name: '异常金额' }).all()) {
    await expect(amount).toBeEmpty()
  }
  await dialog.getByRole('button', { name: '添加事件' }).click()
  await expect(picker.locator('.art-data-select-dialog__selected-header')).toContainText('已选 0')
  for (const itemName of ['异常搬运费', '异常等待费']) {
    await expect(
      picker.locator('.el-tree-node__content').filter({ hasText: itemName }).locator('.el-checkbox')
    ).toHaveClass(/is-disabled/)
  }
  await picker.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog.getByRole('spinbutton', { name: '异常金额' })).toHaveCount(2)
  await expect(dialog.getByText(/[¥￥]0\.00/)).toBeVisible()
  await captureVariants(page, info, 'abnormal-freight')
  expect(errors).toEqual([])
})

test('异常运费要求填写正数金额，并以选中的费用项目提交', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined
  await page.route('**/rest/v1/rpc/tms_save_abnormal_freight_secure', (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({ json: { status: 'submitted' } })
  })
  await page.getByRole('button', { name: '打开异常运费' }).click()
  const dialog = page.getByRole('dialog', { name: '异常运费' })
  await dialog.getByRole('button', { name: '添加事件' }).click()
  const picker = page.getByRole('dialog', { name: '选择费用项目' })
  await picker
    .locator('.el-tree-node__content')
    .filter({ hasText: '异常搬运费' })
    .locator('.el-checkbox')
    .click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  const amount = dialog.getByRole('spinbutton', { name: '异常金额' })
  await expect(amount).toBeEmpty()
  await dialog.getByRole('textbox', { name: '异常说明' }).fill('装卸额外搬运')
  await dialog.getByRole('button', { name: '提交异常运费' }).click()
  await expect(dialog).toBeVisible()
  expect(submitted).toBeUndefined()
  await amount.fill('0')
  await dialog.getByRole('button', { name: '提交异常运费' }).click()
  await expect(dialog).toBeVisible()
  expect(submitted).toBeUndefined()
  await amount.fill('25.50')
  await dialog.getByRole('button', { name: '提交异常运费' }).click()
  await expect.poll(() => submitted).toBeDefined()
  expect(submitted?.p_order_id).toBe('11111111-1111-4111-8111-111111111201')
  expect(submitted?.p_payload).toMatchObject({
    ownership: 'customer_receivable',
    lines: [{ expense_item_id: 'expense-item-1', amount: 25.5, description: '装卸额外搬运' }]
  })
})

test('费用项目树加载失败可重试，空数据给出引导', async ({ page }) => {
  let failRequest = true
  await page.route('**/rest/v1/tms_expense_item*', (route) => {
    return failRequest
      ? route.fulfill({ status: 503, json: { code: 'PGRST503', message: 'Unavailable' } })
      : route.fulfill({ json: [] })
  })
  await page.getByRole('button', { name: '打开异常运费' }).click()
  const dialog = page.getByRole('dialog', { name: '异常运费' })
  await dialog.getByRole('button', { name: '添加事件' }).click()
  const picker = page.getByRole('dialog', { name: '选择费用项目' })
  await expect(picker.getByText('可选数据加载失败', { exact: true })).toBeVisible()
  failRequest = false
  await picker.getByRole('button', { name: '重新加载' }).click()
  await expect(picker.getByText('暂无可用费用项目')).toBeVisible()
  await expect(picker.getByText('请先在费用项目中维护当前工作台租户的启用项目。')).toBeVisible()
  await picker.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog.getByRole('spinbutton', { name: '异常金额' })).toHaveCount(0)
})

test('平台超级管理员按工作台租户读取费用项目', async ({ page }) => {
  for (const [scope, expectedTenantId] of [
    ['all', '11111111-1111-4111-8111-111111111111'],
    ['selected', '22222222-2222-4222-8222-222222222222']
  ] as const) {
    await page.goto(`${fixture}?tenantScope=${scope}`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '打开异常运费' }).click()
    const expenseRequest = page.waitForRequest((request) =>
      new URL(request.url()).pathname.endsWith('/tms_expense_item')
    )
    await page
      .getByRole('dialog', { name: '异常运费' })
      .getByRole('button', { name: '添加事件' })
      .click()
    const url = new URL((await expenseRequest).url())
    expect(url.searchParams.get('tenant_id')).toBe(`eq.${expectedTenantId}`)
    await expect(page.getByRole('dialog', { name: '选择费用项目' })).toBeVisible()
  }
})

test('运单费用新增表单显示两条追加费用行', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('button', { name: '打开运单费用' }).click()
  const dialog = page.getByRole('dialog', { name: '新增运单费用' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('YD-LOADED-001')).toBeVisible()
  await expect(dialog.getByText('验收司机甲')).toBeVisible()
  await dialog.getByText('YD-LOADED-001').scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('waybill-cost-identity-1440-light.png') })
  await dialog.getByRole('button', { name: '添加费用行' }).click()
  await dialog.getByRole('button', { name: '添加费用行' }).click()
  await expect(dialog.getByText('费用明细', { exact: true })).toBeVisible()
  const lines = dialog.locator('.el-table__body tbody tr')
  await expect(lines).toHaveCount(3)
  for (const lineNo of ['10', '20', '30'])
    await expect(lines.filter({ hasText: lineNo })).toHaveCount(1)
  await captureVariants(page, info, 'waybill-cost')
  await dialog.getByText('YD-LOADED-001').scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('waybill-cost-identity-390-dark.png') })
  expect(errors).toEqual([])
})
