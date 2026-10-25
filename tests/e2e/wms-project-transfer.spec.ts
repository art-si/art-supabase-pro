import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

for (const authority of ['super', 'ordinary', 'ordinary-viewonly'] as const) {
  test(`${authority}项目调拨加载重试、必填定位和提交失败保留填写`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await installFixtures(page)
    if (authority !== 'super') {
      await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
      await page.route('**/rest/v1/sys_user?*', (route) =>
        route.fulfill({
          json: {
            id: 'wms-test-user',
            auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
            user_name: '普通仓储用户',
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
          { code: 'platform', name: '测试平台', baseUrl: '/' },
          { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
        ]
      })
    )
    const root = {
      id: 'wms-root',
      parentId: null,
      name: 'WmsWarehouseManagement',
      path: '/wms',
      component: '/index/index',
      type: 'folder',
      sort: 1,
      meta: meta('WMS仓储管理')
    }
    const menu = {
      id: 'stock-menu',
      parentId: root.id,
      name: 'WmsStock',
      path: 'inventory-trace/stock',
      component: '/wms/inventory-trace/stock',
      type: 'menu',
      sort: 1,
      meta: meta('即时库存')
    }
    await mockApplicationMenus(page, {
      wms: [
        root,
        menu,
        ...(authority === 'ordinary-viewonly' ? ['View'] : ['View', 'TransferProject']).map(
          (action) => ({
            id: `stock-${action}`,
            parentId: menu.id,
            name: `WmsStock:${action}`,
            path: '',
            component: '',
            type: 'button',
            sort: 1,
            meta: meta(action)
          })
        )
      ]
    })
    const row = {
      id: 'report-test',
      batch_id: 'batch-test',
      batch_no: 'TEST-BATCH',
      material_code: 'TEST-MAT',
      material_name: '测试库存物料',
      warehouse_id: 'warehouse-test',
      warehouse_name: '测试仓库',
      inventory_quantity: 2,
      opening_quantity: 0,
      inbound_quantity: 2,
      outbound_quantity: 0,
      closing_quantity: 2,
      stock_status: 'normal',
      project_id: 'source-project',
      project_name: '来源测试项目',
      construction_no: 'SOURCE-01'
    }
    await page.route('**/rest/v1/rpc/wms_inventory_report_secure', (route) =>
      route.fulfill({ json: { data: [row], total: 1, navigation: [] } })
    )
    let failLoad = true
    let failSave = true
    let packed = false
    let serialManaged = false
    const writes: Record<string, unknown>[] = []
    await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
      route.fulfill(
        failLoad
          ? { status: 503, json: { message: '测试批次读取失败', code: 'XX000' } }
          : {
              json: [
                {
                  id: 'batch-test',
                  tenant_id: tenantId,
                  batch_no: 'TEST-BATCH',
                  quantity: 2,
                  pack_id: packed ? 'pack-test' : null,
                  project_id: 'source-project',
                  construction_no: 'SOURCE-01',
                  material: {
                    material_name: '测试库存物料',
                    serial_management_enabled: serialManaged
                  }
                }
              ]
            }
      )
    )
    await page.route('**/rest/v1/mdm_project?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'source-project',
            tenant_id: tenantId,
            project_code: 'SOURCE',
            project_name: '来源测试项目',
            enabled: true,
            project_status: 'active'
          },
          {
            id: 'target-project',
            tenant_id: tenantId,
            project_code: 'TARGET',
            project_name: '目标测试项目',
            enabled: true,
            project_status: 'active'
          }
        ]
      })
    )
    await page.route('**/rest/v1/mdm_project_construction?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'source-section',
            tenant_id: tenantId,
            project_id: 'source-project',
            construction_no: 'SOURCE-01',
            section_name: '来源测试施工段',
            status: 'active'
          },
          {
            id: 'target-section',
            tenant_id: tenantId,
            project_id: 'target-project',
            construction_no: 'TARGET-01',
            section_name: '目标测试施工段',
            status: 'active'
          }
        ]
      })
    )
    await page.route('**/rest/v1/wms_serial_number?*', (route) =>
      route.fulfill({
        json: serialManaged
          ? [{ id: 'serial-test', serial_no: 'SN-TEST-001', status: 'in_stock' }]
          : []
      })
    )
    await page.route('**/rest/v1/rpc/wms_transfer_project_secure', (route) => {
      writes.push(route.request().postDataJSON())
      return route.fulfill(
        failSave
          ? { status: 400, json: { message: '测试调拨提交失败，请重试', code: 'P0001' } }
          : { json: null }
      )
    })
    await page.goto('#/wms/inventory-trace/stock')
    await expect(page.getByText('TEST-MAT', { exact: true })).toBeVisible()
    if (authority === 'ordinary-viewonly') {
      await expect(page.getByRole('button', { name: '项目调拨', exact: true })).toHaveCount(0)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      expect(writes).toHaveLength(0)
      await page.screenshot({
        path: testInfo.outputPath('project-transfer-viewonly.png'),
        animations: 'disabled'
      })
      return
    }

    await page.getByRole('button', { name: '项目调拨', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: /办理项目调拨/ })
    const submit = dialog.getByRole('button', { name: '确定', exact: true })
    await expect(dialog.getByText('调拨信息加载失败', { exact: true })).toBeVisible()
    await expect(submit).toBeDisabled()
    failLoad = false
    await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(submit).toBeEnabled()
    const reference = dialog.getByRole('textbox', { name: /项目调拨单号/ })
    await expect(reference).toHaveValue(/^XMD-/)
    await reference.fill('TEST-TRANSFER-001')
    await dialog.getByRole('combobox', { name: /目标项目/ }).click()
    await page.getByRole('option', { name: '目标测试项目 · TARGET', exact: true }).click()
    await submit.click()
    await expect(dialog.locator('.el-form-item__error')).toHaveText('请选择目标项目的施工号')
    expect(writes).toHaveLength(0)
    await page.screenshot({
      path: testInfo.outputPath('project-transfer-validation.png'),
      animations: 'disabled'
    })
    if (await page.locator('.el-select-dropdown:visible').count())
      await page.keyboard.press('Escape')
    await dialog.getByRole('combobox', { name: /目标施工号/ }).click()
    await page.getByRole('option', { name: 'TARGET-01 · 目标测试施工段', exact: true }).click()
    await dialog.getByRole('textbox', { name: '调拨原因', exact: true }).fill('测试调拨原因')
    await submit.click()
    await expect(page.getByText('测试调拨提交失败，请重试', { exact: true })).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(reference).toHaveValue('TEST-TRANSFER-001')
    await expect(submit).toBeEnabled()
    await page.screenshot({
      path: testInfo.outputPath('project-transfer-submit-error.png'),
      animations: 'disabled'
    })
    failSave = false
    await submit.click()
    await expect(dialog).toBeHidden()
    expect(writes).toHaveLength(2)
    expect(writes[1]).toEqual(writes[0])
    expect(writes[1].p_payload).toMatchObject({
      batch_id: 'batch-test',
      reference_no: 'TEST-TRANSFER-001',
      target_project_id: 'target-project',
      target_construction_no: 'TARGET-01',
      quantity: 1,
      remark: '测试调拨原因'
    })
    await page.getByRole('button', { name: '项目调拨', exact: true }).click()
    await expect(submit).toBeEnabled()
    await expect(dialog.getByRole('combobox', { name: /目标施工号/ })).toBeDisabled()
    await expect(reference).not.toHaveValue('TEST-TRANSFER-001')
    await dialog.getByRole('spinbutton', { name: /调拨数量/ }).fill('9')
    await reference.click()
    await expect(dialog.getByRole('spinbutton', { name: /调拨数量/ })).toHaveValue('2.000')
    await page.screenshot({
      path: testInfo.outputPath('project-transfer-public.png'),
      animations: 'disabled'
    })
    await submit.click()
    await expect(dialog).toBeHidden()
    expect(writes).toHaveLength(3)
    expect(writes[2].p_payload).toMatchObject({
      batch_id: 'batch-test',
      target_project_id: null,
      target_construction_no: null,
      quantity: 2,
      remark: null
    })
    await page.getByRole('button', { name: '项目调拨', exact: true }).click()
    await expect(submit).toBeEnabled()
    await dialog.getByRole('combobox', { name: /目标项目/ }).click()
    await page.getByRole('option', { name: '来源测试项目 · SOURCE', exact: true }).click()
    await dialog.getByRole('combobox', { name: /目标施工号/ }).click()
    await page.getByRole('option', { name: 'SOURCE-01 · 来源测试施工段', exact: true }).click()
    await submit.click()
    await expect(
      page.getByText('目标项目和施工号与来源相同，无需调拨', { exact: true })
    ).toBeVisible()
    expect(writes).toHaveLength(3)
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
    packed = true
    await page.getByRole('button', { name: '项目调拨', exact: true }).click()
    await expect(submit).toBeEnabled()
    const quantity = dialog.getByRole('spinbutton', { name: /调拨数量/ })
    await expect(quantity).toBeDisabled()
    await expect(quantity).toHaveValue('2.000')
    await submit.click()
    await expect(dialog).toBeHidden()
    expect(writes).toHaveLength(4)
    expect(writes[3].p_payload).toMatchObject({ quantity: 2 })
    packed = false
    serialManaged = true
    await page.getByRole('button', { name: '项目调拨', exact: true }).click()
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(dialog.locator('.el-form-item__error')).toHaveText('序列号件数必须与调拨数量一致')
    await expect(dialog.getByRole('combobox', { name: /随批次调拨的序列号/ })).toBeFocused()
    await page.screenshot({
      path: testInfo.outputPath('project-transfer-serial-required.png'),
      animations: 'disabled'
    })
    expect(writes).toHaveLength(4)
    if (!(await page.getByRole('option', { name: 'SN-TEST-001', exact: true }).isVisible())) {
      await dialog.getByRole('combobox', { name: /随批次调拨的序列号/ }).press('ArrowDown')
    }
    await page.getByRole('option', { name: 'SN-TEST-001', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(dialog.locator('.el-form-item__error')).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath('project-transfer-serial.png'),
      animations: 'disabled'
    })
    await submit.click()
    await expect(dialog).toBeHidden()
    expect(writes).toHaveLength(5)
    expect(writes[4].p_payload).toMatchObject({ quantity: 1, serial_ids: ['serial-test'] })
  })
}
