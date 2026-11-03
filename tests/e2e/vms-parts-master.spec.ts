import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(300_000)

const categories = [
  { id: 'cat-root', parent_id: null, category_name: '车辆配件', category_code: 'VEH', sort: 1 },
  { id: 'cat-child', parent_id: 'cat-root', category_name: '轮胎', category_code: 'TIRE', sort: 1 },
  { id: 'cat-other', parent_id: null, category_name: '车载用品', category_code: 'GOODS', sort: 2 }
]
const parts = [
  {
    id: 'part-root',
    part_name: '刹车片',
    part_code: 'M-001',
    category_id: 'cat-root',
    brand: '测试品牌',
    model: 'A1',
    unit: '片',
    material_id: 'mat-1',
    unit_id: 'unit-piece'
  },
  {
    id: 'part-child',
    part_name: '轮胎',
    part_code: 'M-002',
    category_id: 'cat-child',
    brand: '测试品牌',
    model: 'B2',
    unit: '条',
    material_id: 'mat-2',
    unit_id: 'unit-strip'
  },
  {
    id: 'part-other',
    part_name: '车载箱',
    part_code: 'M-003',
    category_id: 'cat-other',
    brand: '测试品牌',
    model: 'C3',
    unit: '个',
    material_id: 'mat-3',
    unit_id: 'unit-piece'
  }
]
const materials = [
  {
    id: 'mat-1',
    tenant_id: '11111111-1111-4111-8111-111111111111',
    material_code: 'M-001',
    material_name: '刹车片',
    description: '前制动刹车片',
    specification_model: 'A1',
    brand: '测试品牌',
    category_id: 'material-root',
    status: 'enabled',
    base_unit_id: 'unit-piece',
    baseUnit: { id: 'unit-piece', unit_name: '片' }
  },
  {
    id: 'mat-2',
    tenant_id: '11111111-1111-4111-8111-111111111111',
    material_code: 'M-002',
    material_name: '轮胎',
    description: '测试轮胎',
    specification_model: 'B2',
    brand: '测试品牌',
    category_id: 'material-child',
    status: 'enabled',
    base_unit_id: 'unit-strip',
    baseUnit: { id: 'unit-strip', unit_name: '条' }
  }
]
const units = [
  {
    id: 'unit-piece',
    tenant_id: '11111111-1111-4111-8111-111111111111',
    unit_code: 'PIECE',
    unit_name: '片',
    status: 'enabled'
  },
  {
    id: 'unit-strip',
    tenant_id: '11111111-1111-4111-8111-111111111111',
    unit_code: 'STRIP',
    unit_name: '条',
    status: 'enabled'
  }
]

async function installFixture(page: Page, options?: { failCategories?: boolean }) {
  const listQueries: URL[] = []
  const categoryQueries: URL[] = []
  const supplierOptionRequests: Array<Record<string, unknown>> = []
  const writes: unknown[] = []
  let failCategories = options?.failCategories ?? false
  let emptyParts = false
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-ckbftoopuyophiebamwy-auth-token',
      JSON.stringify({
        access_token: 'a.b.c',
        refresh_token: 'fixture-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'authenticated' }
      })
    )
  })
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const table = url.pathname.split('/').at(-1)
    if (table === 'mdm_part_category') {
      categoryQueries.push(url)
      if (failCategories)
        return route.fulfill({ status: 403, json: { message: 'fixture unavailable' } })
      return route.fulfill({ json: categories })
    }
    if (table === 'vms_list_vehicle_supplier_options_for_tenant_secure') {
      supplierOptionRequests.push(request.postDataJSON() as Record<string, unknown>)
      return route.fulfill({
        json: {
          records: [
            {
              id: 'supplier-1',
              tenant_id: '11111111-1111-4111-8111-111111111111',
              supplier_name: '验收供应商'
            }
          ],
          total: 1
        }
      })
    }
    if (table === 'mdm_part') {
      if (request.method() === 'POST') {
        writes.push(request.postDataJSON())
        return route.fulfill({ status: 201, json: [] })
      }
      listQueries.push(url)
      const categoryFilter = url.searchParams.get('category_id')
      const ids = categoryFilter?.startsWith('in.(')
        ? categoryFilter.slice(4, -1).split(',')
        : undefined
      const selected = emptyParts
        ? []
        : ids
          ? parts.filter((part) => ids.includes(part.category_id))
          : parts
      const data = selected.map((part) => ({
        ...part,
        category: {
          id: part.category_id,
          category_name: categories.find((category) => category.id === part.category_id)
            ?.category_name
        }
      }))
      return route.fulfill({
        json: data,
        headers: {
          'content-range': `0-${Math.max(0, data.length - 1)}/${data.length}`,
          'access-control-expose-headers': 'content-range'
        }
      })
    }
    if (table === 'mdm_material')
      return route.fulfill({ json: materials, headers: { 'content-range': '0-1/2' } })
    if (table === 'mdm_material_category')
      return route.fulfill({
        json: [
          {
            id: 'material-root',
            parent_id: null,
            category_code: 'ROOT',
            category_name: '全部物料'
          },
          {
            id: 'material-child',
            parent_id: 'material-root',
            category_code: 'CHILD',
            category_name: '轮胎物料'
          }
        ]
      })
    if (table === 'mdm_unit_of_measure') return route.fulfill({ json: units })
    if (table === 'rpc' || url.pathname.includes('/rpc/')) return route.fulfill({ json: [] })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/vms-parts-master.html', { waitUntil: 'domcontentloaded' })
  return {
    listQueries,
    categoryQueries,
    supplierOptionRequests,
    writes,
    setCategoryFailure: (value: boolean) => (failCategories = value),
    setEmptyParts: (value: boolean) => (emptyParts = value)
  }
}

test('类别树筛选包含下级，全部入口可恢复列表与焦点模式', async ({ page }, info) => {
  const { listQueries } = await installFixture(page)
  const panel = page.locator('.parts-category-filter')
  await expect(panel.getByText('轮胎', { exact: true })).toBeVisible()
  await panel.getByText('车辆配件', { exact: true }).click()
  await expect
    .poll(() => listQueries.at(-1)?.searchParams.get('category_id'))
    .toContain('cat-child')
  await expect(page.getByRole('cell', { name: '车载箱' })).toHaveCount(0)
  await expect(page.getByRole('cell', { name: '轮胎' })).toBeVisible()
  await panel.getByRole('button', { name: '全部零部件' }).click()
  await expect(page.getByRole('cell', { name: '车载箱' })).toBeVisible()
  await page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
    .click()
  await expect(page.locator('.business-workspace-header')).toBeHidden()
  await expect(panel).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '零部件名称' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.business-workspace-header')).toBeVisible()
  await page.screenshot({ path: info.outputPath('parts-list.png') })
})

test('类别树失败可重试，窄屏保留类别与列表', async ({ page }, info) => {
  await page.setViewportSize({ width: 860, height: 760 })
  const fixture = await installFixture(page, { failCategories: true })
  const panel = page.locator('.parts-category-filter')
  await expect(panel.getByText('零部件类别加载失败，请重试', { exact: true })).toBeVisible()
  fixture.setCategoryFailure(false)
  await panel.getByRole('button', { name: '重新加载' }).click()
  await expect(panel.getByText('车辆配件', { exact: true })).toBeVisible()
  fixture.setEmptyParts(true)
  await panel.getByText('车载用品', { exact: true }).click()
  await expect(page.getByText('当前类别暂无零部件')).toBeVisible()
  fixture.setEmptyParts(false)
  await panel.getByRole('button', { name: '全部零部件' }).click()
  await expect(page.getByRole('columnheader', { name: '零部件名称' })).toBeVisible()
  await page.getByRole('columnheader', { name: '零部件名称' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('columnheader', { name: '零部件名称' })).toBeInViewport()
  const bounds = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }))
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1)
  await page.screenshot({ path: info.outputPath('parts-narrow.png') })
})

test('参选多项 MDM 物料后带入属性，修改单位并批量保存', async ({ page }, info) => {
  const { writes } = await installFixture(page)
  await page.getByRole('button', { name: '新增', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增零部件' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.art-data-select__multiple-input')).toBeEnabled()
  await dialog.locator('.art-data-select__multiple-input').click()
  const picker = page.getByRole('dialog', { name: '参选物料编码' })
  await expect(picker.locator('.art-data-select-dialog__navigation')).toContainText('轮胎物料')
  await expect(picker.getByRole('columnheader', { name: '物料编码' })).toBeVisible()
  await picker.getByRole('row').filter({ hasText: 'M-001' }).locator('.el-checkbox').click()
  await picker.getByRole('row').filter({ hasText: 'M-002' }).locator('.el-checkbox').click()
  await expect(picker.locator('.art-data-select-dialog__selected')).toContainText('刹车片')
  await expect(picker.locator('.art-data-select-dialog__selected')).toContainText('轮胎')
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog.getByRole('columnheader', { name: '计量单位' })).toBeVisible()
  await expect(dialog.getByText('M-001', { exact: true })).toBeVisible()
  await expect(dialog.getByText('M-002', { exact: true })).toBeVisible()
  await expect(dialog.getByText('A1', { exact: true })).toBeVisible()
  const firstDraft = dialog.locator('.el-table__row').filter({ hasText: 'M-001' })
  await firstDraft.getByRole('combobox', { name: '刹车片计量单位' }).click()
  await page.locator('.el-select-dropdown:visible').getByText('条', { exact: true }).click()
  await dialog.locator('.art-data-select__multiple-input').click()
  await picker.getByRole('row').filter({ hasText: 'M-002' }).locator('.el-checkbox').click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    dialog
      .locator('.el-form-item')
      .filter({ hasText: '计量单位' })
      .locator('.el-select__selected-item')
      .filter({ hasText: '条' })
  ).toBeVisible()
  await dialog.locator('.art-data-select__multiple-input').click()
  await picker.getByRole('row').filter({ hasText: 'M-002' }).locator('.el-checkbox').click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    firstDraft.locator('.el-select__selected-item').filter({ hasText: '条' })
  ).toBeVisible()
  await page.screenshot({ path: info.outputPath('parts-batch-draft.png') })
  await dialog.getByRole('combobox', { name: '零部件类别' }).click()
  await page
    .locator('.el-tree-select__popper:visible')
    .getByText('车辆配件', { exact: true })
    .click()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  const batch = writes[0] as Array<Record<string, unknown>>
  expect(batch.map((row) => row.material_id)).toEqual(['mat-1', 'mat-2'])
  expect(batch.map((row) => row.part_code)).toEqual(['M-001', 'M-002'])
  expect(batch.map((row) => row.unit_id)).toEqual(['unit-strip', 'unit-strip'])
  expect(batch.map((row) => row.unit)).toEqual(['条', '条'])
})

test('参选单项物料自动带入编码品牌型号与单位，单位可改', async ({ page }) => {
  const { writes, categoryQueries, supplierOptionRequests } = await installFixture(page)
  await page.getByRole('button', { name: '新增', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增零部件' })
  await dialog.locator('.art-data-select__multiple-input').click()
  const picker = page.getByRole('dialog', { name: '参选物料编码' })
  await picker.getByRole('row').filter({ hasText: 'M-001' }).locator('.el-checkbox').click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(
    dialog.locator('.el-form-item').filter({ hasText: '零部件编码' }).locator('input')
  ).toHaveValue('M-001')
  await expect(
    dialog.locator('.el-form-item').filter({ hasText: '品牌' }).locator('input')
  ).toHaveValue('测试品牌')
  await expect(
    dialog.locator('.el-form-item').filter({ hasText: '型号' }).locator('input')
  ).toHaveValue('A1')
  await dialog.getByRole('combobox', { name: '计量单位' }).click()
  await page.locator('.el-select-dropdown:visible').getByText('条', { exact: true }).click()
  await dialog.getByRole('combobox', { name: '零部件类别' }).click()
  await page
    .locator('.el-tree-select__popper:visible')
    .getByText('车辆配件', { exact: true })
    .click()
  await expect
    .poll(() =>
      categoryQueries.some(
        (url) => url.searchParams.get('tenant_id') === 'eq.11111111-1111-4111-8111-111111111111'
      )
    )
    .toBe(true)
  await dialog.getByRole('tab', { name: '供应信息' }).click()
  await dialog.getByRole('combobox', { name: '供应厂商' }).click()
  await expect(page.locator('.el-select-dropdown:visible').getByText('验收供应商')).toBeVisible()
  await expect
    .poll(() => supplierOptionRequests.at(-1)?.p_tenant_id)
    .toBe('11111111-1111-4111-8111-111111111111')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  const [saved] = writes[0] as Array<Record<string, unknown>>
  expect(saved).toMatchObject({
    material_id: 'mat-1',
    part_code: 'M-001',
    part_name: '刹车片',
    brand: '测试品牌',
    model: 'A1',
    unit_id: 'unit-strip',
    unit: '条'
  })
})
