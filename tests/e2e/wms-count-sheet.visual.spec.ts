import ExcelJS from 'exceljs'
import { expect, test, type Page } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })

const sheetRows = [
  {
    id: 'count-sheet-gain',
    tenant_id: tenantId,
    plan_id: 'count-plan-gain',
    organization_id: 'count-org',
    warehouse_id: 'count-warehouse',
    document_no: 'PDB202610-001',
    business_date: '2026-10-15',
    backup_condition: 'immediate',
    book_date: '2026-10-15',
    count_method: 'regular',
    quantity_default: 'zero',
    recount_enabled: false,
    keeper_department_id: null,
    keeper_employee_id: null,
    counter_employee_id: 'count-employee',
    status: 'approved',
    created_at: '2026-10-15T08:00:00Z',
    submitted_at: '2026-10-15T08:10:00Z',
    approved_at: '2026-10-15T08:15:00Z',
    plan: { document_no: 'PD-YS-20261015-01', status: 'posted', completion_status: 'completed' },
    organization: { organization_code: 'ROOT', organization_name: '测试库存组织' },
    warehouse: { warehouse_code: 'C1002', warehouse_name: '彩钢区仓库', enable_locations: true },
    keeperDepartment: null,
    keeperEmployee: null,
    counterEmployee: { employee_no: 'EMP-001', employee_name: '测试盘点员' }
  },
  {
    id: 'count-sheet-loss',
    tenant_id: tenantId,
    plan_id: 'count-plan-loss',
    organization_id: 'count-org',
    warehouse_id: 'count-warehouse',
    document_no: 'PDB202610-002',
    business_date: '2026-10-15',
    backup_condition: 'immediate',
    book_date: '2026-10-15',
    count_method: 'regular',
    quantity_default: 'book',
    recount_enabled: true,
    keeper_department_id: null,
    keeper_employee_id: null,
    counter_employee_id: 'count-employee',
    status: 'approved',
    created_at: '2026-10-15T09:00:00Z',
    submitted_at: '2026-10-15T09:10:00Z',
    approved_at: '2026-10-15T09:15:00Z',
    plan: { document_no: 'PD-YS-20261015-02', status: 'posted', completion_status: 'completed' },
    organization: { organization_code: 'ROOT', organization_name: '测试库存组织' },
    warehouse: { warehouse_code: 'C1002', warehouse_name: '彩钢区仓库', enable_locations: true },
    keeperDepartment: null,
    keeperEmployee: null,
    counterEmployee: { employee_no: 'EMP-001', employee_name: '测试盘点员' }
  }
]

const sheetActions = [
  'View',
  'Count',
  'Recount',
  'AddLine',
  'Adjust',
  'ImportSerial',
  'Submit',
  'Approve',
  'Return',
  'Delete'
]

async function installCountSheetMenu(
  page: Page,
  options: { actions?: string[]; ordinary?: boolean; sheets?: typeof sheetRows } = {}
): Promise<void> {
  await installFixtures(page)
  if (options.ordinary) {
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/sys_user?*', (route) =>
      route.fulfill({
        json: {
          id: 'ordinary-count-sheet-user',
          auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
          user_name: '盘点查看用户',
          user_email: 'count-view@example.invalid',
          user_type: '2',
          user_roles: ['R_USER'],
          status: '1',
          tenant_id: tenantId,
          tenant: { id: tenantId, tenant_code: 'DEMO', tenant_name: '示例工厂' }
        }
      })
    )
  }
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '平台', baseUrl: '/' },
        { code: 'wms', name: '仓储', baseUrl: '/wms/' }
      ]
    })
  )
  await mockApplicationMenus(page, {
    wms: [
      {
        id: 'wms-root-menu',
        parentId: null,
        name: 'WmsWarehouseManagement',
        path: '/wms',
        component: '/index/index',
        type: 'folder',
        sort: 1,
        meta: meta('仓储管理')
      },
      {
        id: 'count-business-menu',
        parentId: 'wms-root-menu',
        name: 'WmsCountBusiness',
        path: 'count-business',
        component: '',
        type: 'folder',
        sort: 1,
        meta: meta('盘点业务')
      },
      {
        id: 'count-plan-menu',
        parentId: 'count-business-menu',
        name: 'WmsCount',
        path: 'count',
        component: '/wms/count-business/count/index',
        type: 'menu',
        sort: 1,
        meta: meta('库存盘点')
      },
      {
        id: 'count-sheet-menu',
        parentId: 'count-business-menu',
        name: 'WmsCountSheet',
        path: 'count-sheet',
        component: '/wms/count-business/count-sheet/index',
        type: 'menu',
        sort: 2,
        meta: meta('盘点表')
      },
      ...(options.actions ?? sheetActions).map((action) => ({
        id: `count-sheet-${action}`,
        parentId: 'count-sheet-menu',
        name: `WmsCountSheet:${action}`,
        path: '',
        component: '',
        type: 'button',
        sort: 1,
        meta: meta(action)
      }))
    ]
  })
  const sheets = options.sheets ?? sheetRows
  await page.route('**/rest/v1/wms_count_sheet?*', (route) => {
    const idFilter = new URL(route.request().url()).searchParams.get('id')
    const row = sheets.find((item) => idFilter === `eq.${item.id}`)
    return route.fulfill(
      row
        ? { json: row }
        : {
            json: sheets,
            headers: {
              'content-range': sheets.length ? `0-${sheets.length - 1}/${sheets.length}` : '*/0',
              'access-control-expose-headers': 'content-range'
            }
          }
    )
  })
  await page.route('**/rest/v1/wms_count_line?*', (route) => {
    const sheetId = new URL(route.request().url()).searchParams.get('sheet_id')
    return route.fulfill({
      json: [
        {
          id: `line-${sheetId}`,
          tenant_id: tenantId,
          plan_id: sheetId === 'eq.count-sheet-gain' ? 'count-plan-gain' : 'count-plan-loss',
          sheet_id: sheetId?.replace(/^eq\./, ''),
          line_no: 10,
          batch_id: 'count-batch',
          material_id: 'count-material',
          project_id: null,
          construction_no: null,
          expected_quantity: sheetId === 'eq.count-sheet-gain' ? 20 : 21,
          adjustment_quantity: 0,
          counted_quantity: sheetId === 'eq.count-sheet-gain' ? 21 : 20,
          recount_quantity: sheetId === 'eq.count-sheet-gain' ? null : 20,
          expected_serial_ids: [],
          counted_serial_ids: [],
          new_serial_nos: [],
          recount_serial_ids: [],
          recount_new_serial_nos: [],
          loss_movement_id: sheetId === 'eq.count-sheet-gain' ? null : 'loss-movement',
          gain_movement_id: sheetId === 'eq.count-sheet-gain' ? 'gain-movement' : null,
          counted_at: '2026-10-15T08:05:00Z',
          manual_entry: false,
          bin_id: null,
          material: {
            material_code: 'R00-0013',
            material_name: '彩钢板',
            description: '彩钢板',
            specification_model: '1200×600',
            serial_management_enabled: false
          },
          batch: { batch_no: 'BATCH-001', warehouse_id: 'count-warehouse', bin_id: null }
        }
      ]
    })
  })
  await page.route('**/rest/v1/mdm_organization?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/mdm_project?*', (route) => route.fulfill({ json: [] }))
}

test('盘点表双单据列表与明细可读', async ({ page }, testInfo) => {
  await installCountSheetMenu(page)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('#/wms/count-business/count-sheet')
  await expect(page.getByRole('heading', { name: '盘点表', exact: true })).toBeVisible({
    timeout: 30_000
  })
  const designGuide = page.getByRole('button', { name: '知道了', exact: true })
  if (await designGuide.isVisible()) await designGuide.click()
  await expect(page.getByText('PDB202610-001', { exact: true })).toBeVisible()
  await expect(page.getByText('PDB202610-002', { exact: true })).toBeVisible()
  await expect(
    page.locator('#app-sidebar').getByRole('menuitem', { name: '盘点业务' })
  ).toBeVisible()
  await expect(
    page.locator('#app-sidebar').getByRole('menuitem', { name: '库存盘点' })
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: testInfo.outputPath('count-sheet-list.png'),
    animations: 'disabled'
  })
  const focusSwitch = page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
  await focusSwitch.click()
  await expect(page.getByRole('heading', { name: '盘点表', exact: true })).toBeHidden()
  await expect(page.getByText('PDB202610-001', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('count-sheet-focus.png'),
    animations: 'disabled'
  })
  await page.getByRole('button', { name: '退出专注模式' }).click()
  await expect(page.getByRole('heading', { name: '盘点表', exact: true })).toBeVisible({
    timeout: 30_000
  })
  await focusSwitch.click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: '盘点表', exact: true })).toBeVisible({
    timeout: 30_000
  })
  await page.getByRole('button', { name: '查看盘点表', exact: true }).first().click()
  const drawer = page.getByRole('dialog', { name: '盘点表', exact: true })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('R00-0013', { exact: false })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('count-sheet-detail.png'),
    animations: 'disabled'
  })
  await drawer.getByText('R00-0013', { exact: false }).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('count-sheet-detail-lower.png'),
    animations: 'disabled'
  })
  expect(pageErrors).toEqual([])
})

test('盘点表暗色与阴影模式保持可读', async ({ page }, testInfo) => {
  await installCountSheetMenu(page)
  await prepareAppearance(page, { theme: 'dark', boxBorderMode: false })
  await page.goto('#/wms/count-business/count-sheet')
  await expect(page.getByRole('heading', { name: '盘点表', exact: true })).toBeVisible({
    timeout: 30_000
  })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByText('PDB202610-001', { exact: true })).toBeVisible()
  await expect(page.getByText('即时库存', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('定期盘点', { exact: true }).first()).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('count-sheet-dark-list.png'),
    animations: 'disabled'
  })
  await page.getByRole('button', { name: '查看盘点表', exact: true }).first().click()
  const drawer = page.getByRole('dialog', { name: '盘点表', exact: true })
  await expect(drawer).toBeVisible()
  await drawer.getByText('R00-0013', { exact: false }).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('count-sheet-dark-detail.png'),
    animations: 'disabled'
  })
})

test('盘点表空结果与失败重试保留查询区', async ({ page }, testInfo) => {
  await installCountSheetMenu(page)
  let state: 'empty' | 'error' | 'ready' = 'empty'
  await page.route('**/rest/v1/wms_count_sheet?*', (route) => {
    if (state === 'error')
      return route.fulfill({ status: 500, json: { code: 'P0001', message: '测试盘点表加载失败' } })
    return route.fulfill({
      json: state === 'empty' ? [] : sheetRows,
      headers: {
        'content-range': state === 'empty' ? '*/0' : '0-1/2',
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  await page.goto('#/wms/count-business/count-sheet')
  await expect(page.getByRole('heading', { name: '盘点表', exact: true })).toBeVisible({
    timeout: 30_000
  })
  const designGuide = page.getByRole('button', { name: '知道了', exact: true })
  if (await designGuide.isVisible()) await designGuide.click()
  await expect(page.getByText('全部库存组织', { exact: true })).toBeVisible()
  await expect(page.getByText('当前条件下暂无盘点表')).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('count-sheet-empty.png'),
    animations: 'disabled'
  })
  state = 'error'
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText(/盘点表加载失败|数据加载失败/).first()).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('count-sheet-error.png'),
    animations: 'disabled'
  })
  state = 'ready'
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('PDB202610-001', { exact: true })).toBeVisible()
})

test('盘点表普通查看用户不能执行录入、审核或删除', async ({ page }) => {
  const draft = {
    ...sheetRows[0],
    status: 'draft',
    approved_at: null,
    submitted_at: null,
    plan: { ...sheetRows[0].plan, status: 'counting', completion_status: 'pending' }
  }
  await installCountSheetMenu(page, { ordinary: true, actions: ['View'], sheets: [draft] })
  await page.goto('#/wms/count-business/count-sheet')
  await expect(page.getByRole('heading', { name: '盘点表', exact: true })).toBeVisible({
    timeout: 30_000
  })
  await expect(page.getByText(draft.document_no, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '提交盘点表', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '批量删除', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '查看盘点表', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '盘点表', exact: true })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByRole('button', { name: '保存人员信息' })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: '新增账外物料' })).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: '提交审核' })).toHaveCount(0)
})

test('盘点表删除前展示阻塞引用并停止删除', async ({ page }) => {
  const draft = {
    ...sheetRows[0],
    status: 'draft',
    approved_at: null,
    submitted_at: null,
    plan: { ...sheetRows[0].plan, status: 'draft', completion_status: 'pending' }
  }
  await installCountSheetMenu(page, { sheets: [draft] })
  let deleteCalls = 0
  await page.route('**/rest/v1/rpc/wms_count_sheet_delete_dependencies_secure', (route) =>
    route.fulfill({
      json: [
        {
          resource_id: draft.id,
          dependency_code: 'wms_count_sheet_status',
          record_id: draft.id,
          target_id: draft.id,
          record_no: draft.document_no,
          record_summary: '盘点表已提交或审核',
          record_status: 'submitted',
          created_at: draft.created_at,
          cleanup_allowed: false
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/wms_delete_count_sheets_secure', (route) => {
    deleteCalls++
    return route.fulfill({ json: 1 })
  })
  await page.goto('#/wms/count-business/count-sheet')
  await expect(page.getByText(draft.document_no, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '删除', exact: true }).click()
  const guard = page.getByRole('dialog').filter({ hasText: '不可删除的盘点表' })
  await expect(guard).toBeVisible()
  await expect(guard.getByText(draft.document_no, { exact: true })).toBeVisible()
  expect(deleteCalls).toBe(0)
})

test('盘点表可导入 SN 并保存逐件实盘', async ({ page }, testInfo) => {
  const draft = {
    ...sheetRows[0],
    status: 'draft',
    approved_at: null,
    submitted_at: null,
    plan: { ...sheetRows[0].plan, status: 'counting', completion_status: 'pending' }
  }
  await installCountSheetMenu(page, { sheets: [draft] })
  await page.route('**/rest/v1/wms_count_line?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'serial-count-line',
          tenant_id: tenantId,
          plan_id: draft.plan_id,
          sheet_id: draft.id,
          line_no: 10,
          batch_id: 'count-batch',
          material_id: 'count-serial-material',
          project_id: null,
          construction_no: null,
          expected_quantity: 1,
          adjustment_quantity: 0,
          counted_quantity: null,
          recount_quantity: null,
          expected_serial_ids: ['count-old-serial'],
          counted_serial_ids: [],
          new_serial_nos: [],
          recount_serial_ids: [],
          recount_new_serial_nos: [],
          loss_movement_id: null,
          gain_movement_id: null,
          counted_at: null,
          manual_entry: false,
          material: {
            material_code: 'SN-001',
            material_name: '序列号物料',
            description: '需逐件盘点的物料',
            specification_model: 'M10',
            serial_management_enabled: true
          },
          batch: { batch_no: 'SN-BATCH-001', warehouse_id: draft.warehouse_id, bin_id: null }
        }
      ]
    })
  )
  await page.route('**/rest/v1/wms_serial_number?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'count-old-serial',
          serial_no: 'SN-OLD-001',
          status: 'in_stock',
          batch_id: 'count-batch'
        }
      ]
    })
  )
  const savedPayloads: unknown[] = []
  await page.route('**/rest/v1/rpc/wms_record_count_sheet_line_secure', (route) => {
    savedPayloads.push(route.request().postDataJSON())
    return route.fulfill({ json: 'serial-count-line' })
  })
  await page.goto('#/wms/count-business/count-sheet')
  await page.getByRole('button', { name: '查看盘点表', exact: true }).click()
  await page.getByRole('button', { name: '录入 / 查看 SN', exact: true }).click()
  const serialDialog = page.getByRole('dialog', { name: '盘点序列号', exact: true })
  await expect(serialDialog).toBeVisible()
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('序列号').addRows([['序列号'], ['SN-IMPORTED-001']])
  const chooserPromise = page.waitForEvent('filechooser')
  await serialDialog.getByRole('button', { name: '导入序列号' }).click()
  const chooser = await chooserPromise
  await chooser.setFiles({
    name: 'count-serials.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await workbook.xlsx.writeBuffer())
  })
  await expect(serialDialog.getByPlaceholder('每行一个实物中新增的 SN')).toHaveValue(
    'SN-IMPORTED-001'
  )
  await page.screenshot({
    path: testInfo.outputPath('count-sheet-serial-import.png'),
    animations: 'disabled'
  })
  await serialDialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(serialDialog).toBeHidden()
  expect(savedPayloads).toHaveLength(1)
  expect(savedPayloads[0]).toMatchObject({
    p_line_id: 'serial-count-line',
    p_counted_quantity: 1,
    p_counted_serial_ids: [],
    p_new_serial_nos: ['SN-IMPORTED-001'],
    p_is_recount: false
  })
})

test('已审核盘点表可只读查看初盘和复盘序列号', async ({ page }, testInfo) => {
  const approved = { ...sheetRows[1] }
  await installCountSheetMenu(page, { sheets: [approved] })
  await page.route('**/rest/v1/wms_count_line?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'serial-approved-line',
          tenant_id: tenantId,
          plan_id: approved.plan_id,
          sheet_id: approved.id,
          line_no: 10,
          batch_id: 'count-batch',
          material_id: 'count-serial-material',
          project_id: null,
          construction_no: null,
          expected_quantity: 1,
          adjustment_quantity: 0,
          counted_quantity: 1,
          recount_quantity: 1,
          expected_serial_ids: ['count-old-serial'],
          counted_serial_ids: ['count-old-serial'],
          new_serial_nos: [],
          recount_serial_ids: [],
          recount_new_serial_nos: ['SN-RECOUNT-001'],
          loss_movement_id: 'count-loss-movement',
          gain_movement_id: 'count-gain-movement',
          counted_at: '2026-10-15T09:05:00Z',
          manual_entry: false,
          material: {
            material_code: 'SN-001',
            material_name: '序列号物料',
            description: '需逐件盘点的物料',
            specification_model: 'M10',
            serial_management_enabled: true
          },
          batch: { batch_no: 'SN-BATCH-001', warehouse_id: approved.warehouse_id, bin_id: null }
        }
      ]
    })
  )
  await page.route('**/rest/v1/wms_serial_number?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'count-old-serial',
          serial_no: 'SN-OLD-001',
          status: 'out_stock',
          batch_id: 'count-batch'
        }
      ]
    })
  )
  await page.goto('#/wms/count-business/count-sheet')
  await page.getByRole('button', { name: '查看盘点表', exact: true }).click()
  await page.getByRole('button', { name: '查看序列号', exact: true }).click()
  const serialDialog = page.getByRole('dialog', { name: '序列号记录', exact: true })
  await expect(serialDialog).toBeVisible()
  await expect(serialDialog.getByText('初盘序列号', { exact: true })).toBeVisible()
  await expect(serialDialog.getByText('复盘序列号', { exact: true })).toBeVisible()
  await expect(serialDialog.getByText('SN-OLD-001', { exact: true })).toBeVisible()
  await expect(serialDialog.getByText('SN-RECOUNT-001', { exact: true })).toBeVisible()
  await expect(serialDialog.getByRole('button', { name: '导入序列号' })).toHaveCount(0)
  await expect(serialDialog.getByRole('button', { name: '确定', exact: true })).toHaveCount(0)
  await page.screenshot({
    path: testInfo.outputPath('count-sheet-serial-readonly.png'),
    animations: 'disabled'
  })
})

test('盘点表选单调整可合并入库与出库并保存', async ({ page }, testInfo) => {
  const draft = {
    ...sheetRows[0],
    status: 'draft',
    approved_at: null,
    submitted_at: null,
    plan: { ...sheetRows[0].plan, status: 'counting', completion_status: 'pending' }
  }
  await installCountSheetMenu(page, { sheets: [draft] })
  await page.route('**/rest/v1/rpc/wms_count_adjustment_candidates_secure', (route) =>
    route.fulfill({
      json: [
        {
          id: 'movement-in',
          tenant_id: tenantId,
          material_id: 'count-material',
          source_batch_id: null,
          target_batch_id: 'count-batch',
          movement_type: 'purchase_inbound',
          reference_no: 'ADJ-IN-001',
          quantity: 2,
          occurred_at: '2026-10-15T10:00:00Z',
          total_count: 2
        },
        {
          id: 'movement-out',
          tenant_id: tenantId,
          material_id: 'count-material',
          source_batch_id: 'count-batch',
          target_batch_id: null,
          movement_type: 'sales_outbound',
          reference_no: 'ADJ-OUT-001',
          quantity: 1,
          occurred_at: '2026-10-15T11:00:00Z',
          total_count: 2
        }
      ]
    })
  )
  const selectedPayloads: unknown[] = []
  await page.route('**/rest/v1/rpc/wms_select_count_adjustments_secure', (route) => {
    selectedPayloads.push(route.request().postDataJSON())
    return route.fulfill({ json: 1 })
  })
  await page.goto('#/wms/count-business/count-sheet')
  await page.getByRole('button', { name: '查看盘点表', exact: true }).click()
  const sheetDialog = page.getByRole('dialog', { name: '盘点表', exact: true })
  await sheetDialog.getByRole('button', { name: '选单调整', exact: true }).click()
  const adjustmentDialog = page.getByRole('dialog', { name: '选单调整', exact: true })
  await expect(adjustmentDialog).toBeVisible()
  await adjustmentDialog.getByPlaceholder('选择调整单据').click()
  const picker = page.getByRole('dialog', { name: '选择库存单据', exact: true })
  await expect(picker.getByText('ADJ-IN-001', { exact: true })).toBeVisible()
  await picker.getByRole('row').filter({ hasText: 'ADJ-IN-001' }).click()
  await picker.getByRole('row').filter({ hasText: 'ADJ-OUT-001' }).click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(adjustmentDialog.getByText('已选 2 条 · 调整数量')).toBeVisible()
  await expect(adjustmentDialog.getByText('1', { exact: true }).last()).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('count-sheet-adjustment.png'),
    animations: 'disabled'
  })
  await adjustmentDialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(adjustmentDialog).toBeHidden()
  expect(selectedPayloads).toEqual([
    { p_line_id: 'line-eq.count-sheet-gain', p_movement_ids: ['movement-in', 'movement-out'] }
  ])
})

test('盘点表可多选两项账外物料并新增明细', async ({ page }, testInfo) => {
  const draft = {
    ...sheetRows[0],
    status: 'draft',
    approved_at: null,
    submitted_at: null,
    plan: { ...sheetRows[0].plan, status: 'counting', completion_status: 'pending' },
    warehouse: { ...sheetRows[0].warehouse, enable_locations: false }
  }
  await installCountSheetMenu(page, { sheets: [draft] })
  await page.route('**/rest/v1/rpc/wms_count_material_options_secure', (route) =>
    route.fulfill({
      json: [
        {
          id: 'count-extra-one',
          tenant_id: tenantId,
          material_code: 'EXTRA-001',
          material_name: '账外物料一',
          description: '账外物料一描述',
          specification_model: 'E10',
          drawing_no: null,
          category_id: null,
          serial_management_enabled: false,
          total_count: 2
        },
        {
          id: 'count-extra-two',
          tenant_id: tenantId,
          material_code: 'EXTRA-002',
          material_name: '账外物料二',
          description: '账外物料二描述',
          specification_model: 'E20',
          drawing_no: null,
          category_id: null,
          serial_management_enabled: false,
          total_count: 2
        }
      ]
    })
  )
  const addedPayloads: unknown[] = []
  await page.route('**/rest/v1/rpc/wms_add_count_sheet_lines_secure', (route) => {
    addedPayloads.push(route.request().postDataJSON())
    return route.fulfill({ json: 2 })
  })
  await page.goto('#/wms/count-business/count-sheet')
  await page.getByRole('button', { name: '查看盘点表', exact: true }).click()
  const sheetDialog = page.getByRole('dialog', { name: '盘点表', exact: true })
  await sheetDialog.getByRole('button', { name: '新增账外物料', exact: true }).click()
  const addDialog = page.getByRole('dialog', { name: '新增账外物料', exact: true })
  await expect(addDialog).toBeVisible()
  await addDialog.getByPlaceholder('选择一项或多项物料').click()
  const picker = page.getByRole('dialog', { name: '参选账外物料', exact: true })
  await expect(picker.getByText('账外物料一描述', { exact: true })).toBeVisible()
  await picker.getByRole('row').filter({ hasText: 'EXTRA-001' }).click()
  await picker.getByRole('row').filter({ hasText: 'EXTRA-002' }).click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(addDialog.getByText('账外物料一描述', { exact: true })).toBeVisible()
  await expect(addDialog.getByText('账外物料二描述', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('count-sheet-add-lines.png'),
    animations: 'disabled'
  })
  await addDialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(addDialog).toBeHidden()
  expect(addedPayloads).toEqual([
    {
      p_sheet_id: draft.id,
      p_material_ids: ['count-extra-one', 'count-extra-two'],
      p_project_id: null,
      p_construction_no: null,
      p_bin_id: null
    }
  ])
})
