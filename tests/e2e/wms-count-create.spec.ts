import { expect, test, type Page } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

async function installCountMenu(page: Page, canCreate: boolean, canCount = false): Promise<void> {
  await installFixtures(page)
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'ordinary-count-user',
        auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
        user_name: '盘点普通用户',
        user_email: 'count@example.invalid',
        user_type: '2',
        user_roles: ['R_USER'],
        status: '1',
        tenant_id: tenantId,
        tenant: { id: tenantId, tenant_code: 'DEMO', tenant_name: '示例工厂' }
      }
    })
  )
  await mockApplicationMenus(page, {
    wms: [
      {
        id: 'count-menu',
        parentId: null,
        name: 'WmsCount',
        path: '/wms/count-business/count',
        component: '/wms/count-business/count',
        type: 'menu',
        sort: 1,
        meta: meta('库存盘点')
      },
      ...['View', ...(canCreate ? ['Create'] : []), ...(canCount ? ['Count'] : [])].map(
        (action) => ({
          id: `count-${action}`,
          parentId: 'count-menu',
          name: `WmsCount:${action}`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta(action)
        })
      )
    ]
  })
  await page.route('**/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '平台', baseUrl: '/' },
        { code: 'wms', name: '仓储', baseUrl: '/wms/' }
      ]
    })
  )
}

test('盘点普通用户仅查看权限没有新增入口', async ({ page }) => {
  await installCountMenu(page, false)
  await page.goto('#/wms/count-business/count')
  await expect(page.getByRole('heading', { name: '库存盘点', exact: true })).toBeVisible({
    timeout: 30_000
  })
  await expect(page.getByRole('button', { name: '生成盘点方案', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '切换租户', exact: true })).toHaveCount(0)
})

for (const canCount of [false, true]) {
  test(`盘点${canCount ? '普通录入' : '仅查看'}详情控件符合权限`, async ({ page }, testInfo) => {
    await installCountMenu(page, false, canCount)
    await page.route('**/rest/v1/wms_count_plan?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'readonly-plan',
            tenant_id: tenantId,
            document_no: 'COUNT-READONLY',
            warehouse_id: 'warehouse-test',
            status: 'counting',
            snapshot_at: '2026-10-07T01:00:00Z',
            created_at: '2026-10-07T01:00:00Z',
            warehouse: { warehouse_name: '盘点测试仓库' }
          }
        ],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    )
    await page.route('**/rest/v1/wms_count_line?*', (route) =>
      route.fulfill({
        json: [false, true].map((serial, index) => ({
          id: `readonly-${index}`,
          plan_id: 'readonly-plan',
          batch_id: `batch-${index}`,
          material_id: `material-${index}`,
          expected_quantity: 2,
          counted_quantity: 1,
          expected_serial_ids: serial ? ['sn-test'] : [],
          counted_serial_ids: serial ? ['sn-test'] : [],
          new_serial_nos: [],
          material: {
            material_code: `MAT-${index}`,
            material_name: `只读盘点物料${index}`,
            serial_management_enabled: serial
          },
          batch: { batch_no: `BATCH-${index}` }
        }))
      })
    )
    await page.goto('#/wms/count-business/count')
    await page.getByRole('button', { name: '盘点表', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '盘点表', exact: true })
    await expect(drawer.getByText('只读盘点物料1', { exact: true })).toBeVisible()
    await expect(drawer.getByRole('spinbutton')).toHaveCount(canCount ? 1 : 0)
    await expect(drawer.getByRole('combobox')).toHaveCount(canCount ? 1 : 0)
    await expect(drawer.getByPlaceholder('新增 SN，逗号分隔')).toHaveCount(canCount ? 1 : 0)
    await expect(drawer.getByRole('button', { name: '保存实盘', exact: true })).toHaveCount(
      canCount ? 2 : 0
    )
    await expect(drawer.getByRole('button', { name: '确认盘盈盘亏', exact: true })).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath('count-readonly-detail.png'),
      animations: 'disabled'
    })
  })
}

test('盘点普通用户实际菜单候选加载及失败重试期间不可打开空方案', async ({ page }, testInfo) => {
  await installCountMenu(page, true)
  let release = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let started = false
  let failed = true
  await page.route('**/rest/v1/mdm_project_construction?*', async (route) => {
    started = true
    await pending
    await route.fulfill(
      failed ? { status: 400, json: { code: 'P0001', message: '测试范围读取失败' } } : { json: [] }
    )
  })
  await page.goto('#/wms/count-business/count')
  const create = page.getByRole('button', { name: '生成盘点方案', exact: true })
  await expect.poll(() => started).toBe(true)
  await expect(create).toBeDisabled()
  release()
  await expect(page.getByText('仓库或项目选项加载失败。', { exact: false })).toBeVisible()
  await expect(create).toBeDisabled()
  failed = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(create).toBeEnabled()
  await create.click()
  const dialog = page.getByRole('dialog', { name: '生成盘点方案', exact: true })
  await expect(dialog).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('count-menu-recovered.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
})

test('盘点新增范围切换、取消重开及保存失败保留范围', async ({ page }, testInfo) => {
  const payloads: unknown[] = []
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rpc/wms_create_count_plan_v2_secure', (route) => {
    payloads.push(route.request().postDataJSON())
    return route.fulfill(
      payloads.length === 1
        ? { status: 400, json: { code: 'P0001', message: '测试盘点方案创建失败' } }
        : { json: true }
    )
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html?countScope&sectionProjects')
  const open = page.getByRole('button', { name: '测试盘点创建', exact: true })
  await open.click()
  const dialog = page.getByRole('dialog', { name: '生成盘点方案', exact: true })
  await expect(dialog).toBeVisible()
  const organization = dialog.getByRole('combobox', { name: '* 库存组织', exact: true })
  const warehouse = dialog
    .locator('.el-form-item')
    .filter({ hasText: '仓库' })
    .locator('.el-select')
    .first()
  const project = dialog.getByRole('combobox', { name: '项目范围', exact: true })
  const section = dialog.getByRole('combobox', { name: '施工号范围', exact: true })
  const confirm = dialog.getByRole('button', { name: '确定', exact: true })
  await organization.click()
  await page.getByRole('option', { name: '测试库存组织 · ORG-TEST', exact: true }).click()
  await expect(project).toBeEnabled()
  await warehouse.click()
  await page.getByRole('option', { name: '测试盘点仓库 first · FIRST', exact: true }).click()
  await project.click()
  await page.getByRole('option', { name: '测试项目 active · PROJECT-ACTIVE', exact: true }).click()
  await section.click()
  await page.getByRole('option', { name: 'COUNT-SECTION · 测试盘点施工号', exact: true }).click()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await open.click()
  await expect(dialog).toBeVisible()
  await warehouse.click()
  await page.getByRole('option', { name: '测试盘点仓库 first · FIRST', exact: true }).click()
  await project.click()
  await page.getByRole('option', { name: '测试项目 active · PROJECT-ACTIVE', exact: true }).click()
  await section.click()
  await page.getByRole('option', { name: 'COUNT-SECTION · 测试盘点施工号', exact: true }).click()
  await dialog.getByRole('textbox', { name: '盘点说明', exact: true }).fill('范围验收说明')
  await confirm.click()
  await expect(page.getByText('测试盘点方案创建失败', { exact: false })).toBeVisible()
  await expect(dialog.getByText('COUNT-SECTION · 测试盘点施工号', { exact: true })).toBeVisible()
  await expect(confirm).toBeEnabled()
  await page.screenshot({
    path: testInfo.outputPath('count-create-retry.png'),
    animations: 'disabled'
  })
  await confirm.click()
  await expect(dialog).toBeHidden()
  expect(payloads).toHaveLength(2)
  expect(payloads[1]).toEqual(payloads[0])
  expect(payloads[1]).toMatchObject({
    p_payload: {
      organization_id: 'org-test',
      warehouse_ids: ['warehouse-first'],
      project_id: 'project-active',
      construction_no: 'COUNT-SECTION',
      remark: '范围验收说明'
    }
  })
  await open.click()
  await warehouse.click()
  await page.getByRole('option', { name: '测试盘点仓库 first · FIRST', exact: true }).click()
  await project.click()
  await page.getByRole('option', { name: '测试项目 active · PROJECT-ACTIVE', exact: true }).click()
  await section.click()
  await page.getByRole('option', { name: 'COUNT-SECTION · 测试盘点施工号', exact: true }).click()
  await project.hover()
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '项目范围' })
    .locator('.el-select__clear')
    .click()
  await expect(project).toHaveValue('')
  await expect(section).toHaveValue('')
  await expect(section).toBeDisabled()
  await confirm.click()
  await expect(dialog).toBeHidden()
  expect(payloads).toHaveLength(3)
  expect(payloads[2]).toMatchObject({
    p_payload: {
      organization_id: 'org-test',
      warehouse_ids: ['warehouse-first'],
      project_id: null,
      construction_no: null
    }
  })
})

test('截止日期库存自动填入当天并禁用零库存参数', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await installFixtures(page)
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html?countScope')
  await page.getByRole('button', { name: '测试盘点创建', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '生成盘点方案', exact: true })
  await expect(dialog).toBeVisible()
  const zeroStock = dialog.locator('.el-form-item').filter({ hasText: '零库存参与盘点' })
  await zeroStock.locator('.el-switch').click()
  await expect(zeroStock.getByRole('switch')).toBeChecked()
  await dialog.locator('.el-radio-button').filter({ hasText: '截止日期库存' }).click()
  await expect(dialog.getByText('截止日期', { exact: true })).toBeVisible()
  const businessDate = dialog.locator('.el-date-editor input').first()
  const cutoffDate = dialog.locator('.el-date-editor input').last()
  await expect(cutoffDate).toHaveValue(await businessDate.inputValue())
  await expect(cutoffDate).toHaveValue(/^\d{4}-\d{2}-\d{2}$/)
  await expect(cutoffDate).toBeEnabled()
  await expect(zeroStock.getByRole('switch')).toBeDisabled()
  await expect(zeroStock.getByRole('switch')).not.toBeChecked()
  await page.screenshot({
    path: testInfo.outputPath('count-plan-cutoff.png'),
    animations: 'disabled'
  })
})

test('盘点物料弹窗可从即时库存多选两条记录', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await installFixtures(page)
  const optionPayloads: unknown[] = []
  await page.route('**/rest/v1/rpc/wms_count_material_options_secure', (route) => {
    optionPayloads.push(route.request().postDataJSON())
    return route.fulfill({
      json: [
        {
          id: 'count-material-one',
          tenant_id: 'tenant-test',
          material_code: 'COUNT-M01',
          material_name: '盘点物料一',
          description: '盘点物料一描述',
          specification_model: 'M10',
          drawing_no: null,
          category_id: null,
          serial_management_enabled: false,
          total_count: 2
        },
        {
          id: 'count-material-two',
          tenant_id: 'tenant-test',
          material_code: 'COUNT-M02',
          material_name: '盘点物料二',
          description: '盘点物料二描述',
          specification_model: 'M20',
          drawing_no: null,
          category_id: null,
          serial_management_enabled: false,
          total_count: 2
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html?countScope')
  await page.getByRole('button', { name: '测试盘点创建', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '生成盘点方案', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder('留空盘点全部物料').click()
  const picker = page.getByRole('dialog', { name: '参选盘点物料', exact: true })
  await expect(picker.getByText('盘点物料一描述', { exact: true })).toBeVisible()
  await picker.getByRole('row').filter({ hasText: 'COUNT-M01' }).click()
  await picker.getByRole('row').filter({ hasText: 'COUNT-M02' }).click()
  await page.screenshot({
    path: testInfo.outputPath('count-plan-material-picker.png'),
    animations: 'disabled'
  })
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog.getByText('盘点物料一描述', { exact: true })).toBeVisible()
  await expect(dialog.getByText('盘点物料二描述', { exact: true })).toBeVisible()
  expect(optionPayloads[0]).toMatchObject({
    p_organization_id: 'org-test',
    p_include_unstocked: false
  })
})
