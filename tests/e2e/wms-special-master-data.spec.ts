import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { prepareAppearance } from './support/appearance'
import { mockApplicationMenus } from './support/menu-rpc'
import { installFixtures, material, meta, tenantId } from './support/inventory-fixtures'
import { expectInputTextUnclipped } from './support/input-text-width'

const organizationId = '219c1773-f518-41a3-8563-c36b164fd132'
const sourceOrganizationId = '219c1773-f518-41a3-8563-c36b164fd133'
const warehouseId = 'd97f5bc1-73c4-4617-9225-b0af0327875f'
const targetWarehouseId = 'd97f5bc1-73c4-4617-9225-b0af03278760'
const batchId = 'c243b98a-c75e-45dd-802f-4c5b699363b2'
const definitions = [
  ['WmsDirectTransfer', 'd1000000-0000-4000-8000-000000000105', 'direct-doc', '直接调拨'],
  ['WmsStepTransfer', '31eea7c3-edb0-4ef5-a3ad-d4ac1464fe82', 'step-doc', '分步调拨'],
  ['WmsIssueRequest', '9e8ad4e2-116f-45ff-b063-891f4e6bc20b', 'issue-doc', '出库申请']
] as const

async function installSpecialFixtures(page: Page): Promise<void> {
  await installFixtures(page)
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
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
  const menus = [
    ['WmsStockOperation', 'receipt-issue/stock-operation', '库存作业', 'WmsStockOperation'],
    ['WmsStepTransfer', 'transfer-business/step-transfer', '分步调拨', 'WmsTransfer'],
    ['WmsIssueRequest', 'outbound-business/outbound-request', '出库申请单', 'WmsIssueRequest']
  ].flatMap(([name, path, title, permission]) => {
    const id = `${name}-menu`
    return [
      {
        id,
        parentId: root.id,
        name,
        path,
        component: `/wms/${path}`,
        type: 'menu',
        sort: 1,
        meta: meta(title)
      },
      ...['View', 'Create', 'Add', 'Transfer'].map((action) => ({
        id: `${id}-${action}`,
        parentId: id,
        name: `${permission}:${action}`,
        path: '',
        component: '',
        type: 'button',
        sort: 1,
        meta: meta(action)
      }))
    ]
  })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '测试平台', baseUrl: '/' },
        { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
      ]
    })
  )
  await mockApplicationMenus(page, { wms: [root, ...menus] })
  await page.route('**/rest/v1/sys_menu?*', (route) => {
    const name = new URL(route.request().url()).searchParams.get('name')?.replace('eq.', '')
    return route.fulfill({ json: { id: definitions.find((row) => row[0] === name)?.[1] || '' } })
  })
  await page.route('**/rest/v1/mdm_warehouse?*', (route) =>
    route.fulfill({
      json: [
        {
          id: warehouseId,
          tenant_id: tenantId,
          organization_id: sourceOrganizationId,
          warehouse_code: 'RAW-A',
          warehouse_name: '原料一仓',
          warehouse_type: 'raw_material',
          business_scopes: ['picking'],
          enable_locations: false,
          status: 'enabled'
        },
        {
          id: targetWarehouseId,
          tenant_id: tenantId,
          organization_id: organizationId,
          warehouse_code: 'RAW-B',
          warehouse_name: '目标一仓',
          warehouse_type: 'raw_material',
          business_scopes: ['picking'],
          enable_locations: false,
          status: 'enabled'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_organization?*', (route) =>
    route.fulfill({
      headers: { 'content-range': '0-2/3', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: organizationId,
          tenant_id: tenantId,
          organization_code: 'INV-01',
          organization_name: '默认启用库存组织',
          initialization: {
            enabled_on: '2026-10-01',
            is_default: true,
            initialization_closed_at: '2026-10-02T00:00:00Z'
          },
          organization_type: 'company',
          status: '1'
        },
        {
          id: sourceOrganizationId,
          tenant_id: tenantId,
          organization_code: 'INV-02',
          organization_name: '来源库存组织',
          initialization: {
            enabled_on: '2026-10-01',
            is_default: false,
            initialization_closed_at: '2026-10-02T00:00:00Z'
          },
          organization_type: 'company',
          status: '1'
        },
        {
          id: 'not-enabled-org',
          tenant_id: tenantId,
          organization_code: 'INV-03',
          organization_name: '未启用库存组织',
          initialization: null,
          organization_type: 'company',
          status: '1'
        }
      ]
    })
  )
  await page.route('**/rest/v1/wms_inventory_initialization?*', (route) =>
    route.fulfill({
      json: [
        {
          organization_id: organizationId,
          enabled_on: '2026-10-01',
          is_default: true,
          initialization_closed_at: '2026-10-02T00:00:00Z'
        },
        {
          organization_id: sourceOrganizationId,
          enabled_on: '2026-10-01',
          is_default: false,
          initialization_closed_at: '2026-10-02T00:00:00Z'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_document_type?*', (route) =>
    route.fulfill({
      json: [
        ...definitions.map(([name, menuId, id, title]) => ({
          id,
          tenant_id: tenantId,
          menu_ids: [menuId],
          document_type_code: name,
          document_type_name: `${title}默认单据`,
          is_default: true,
          enabled: true
        })),
        {
          id: 'direct-alt-doc',
          tenant_id: tenantId,
          menu_ids: [definitions[0][1]],
          document_type_code: 'DT2',
          document_type_name: '直接调拨备用单据',
          is_default: false,
          enabled: true
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_business_type?*', (route) =>
    route.fulfill({
      json: [
        ...definitions.map(([name, menuId, id, title]) => ({
          id: `${id}-business`,
          tenant_id: tenantId,
          document_type_id: 'other-doc',
          document_type_ids: ['other-doc', id],
          menu_ids: [menuId],
          business_type_code: name,
          business_type_name: `${title}默认业务`,
          is_default: true,
          enabled: true
        })),
        {
          id: 'direct-alt-business',
          tenant_id: tenantId,
          document_type_ids: ['direct-alt-doc'],
          menu_ids: [definitions[0][1]],
          business_type_code: 'ALT',
          business_type_name: '备用单据默认业务',
          is_default: true,
          enabled: true
        },
        {
          id: 'wrong-menu-business',
          tenant_id: tenantId,
          document_type_ids: ['direct-doc'],
          menu_ids: ['other-menu'],
          business_type_code: 'OTHER',
          business_type_name: '其他菜单业务',
          is_default: true,
          enabled: true
        }
      ]
    })
  )
  await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
    route.fulfill({
      status: 206,
      headers: { 'content-range': '0-0/1' },
      json: [
        {
          id: batchId,
          tenant_id: tenantId,
          organization_id: sourceOrganizationId,
          warehouse_id: warehouseId,
          material_id: material.id,
          batch_no: 'B-SPECIAL',
          quantity: 12,
          status: 'normal',
          project_id: null,
          construction_no: null,
          pack_id: null,
          bin_id: null,
          material: { ...material, serial_management_enabled: false },
          warehouse: { warehouse_code: 'RAW-A', warehouse_name: '原料一仓' }
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/wms_work_order_options_secure', (route) =>
    route.fulfill({
      json: [
        {
          id: 'work-order',
          tenant_id: tenantId,
          organization_id: organizationId,
          work_order_no: 'MO-SPECIAL',
          project_id: null,
          construction_no: null,
          allowed_issue_warehouse_types: ['raw_material'],
          status: 'confirmed'
        }
      ]
    })
  )
  await page.route('**/rest/v1/wms_inventory_reservation?*', (route) =>
    route.fulfill({
      json: [
        {
          material_id: material.id,
          reserved_quantity: 1,
          material: { material_code: material.material_code, material_name: material.material_name }
        }
      ]
    })
  )
}

async function choose(page: Page, scope: Locator, label: string, option: string): Promise<void> {
  await scope
    .locator('.el-form-item')
    .filter({
      has: page.locator('.el-form-item__label').filter({ hasText: new RegExp(`^${label}$`) })
    })
    .getByRole('combobox')
    .click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

for (const [movementType, title] of [
  ['purchase_in', '采购入库'],
  ['other_in', '其他入库']
]) {
  test(`${title}两张新增物料规则失败重试后逐件登记SN`, async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await installSpecialFixtures(page)
    let rejectControl = true
    let controlReads = 0
    let successfulControlReads = 0
    let currentDraft = 0
    let releaseFirstControl: (() => void) | undefined
    const firstControlGate = new Promise<void>((resolve) => {
      releaseFirstControl = resolve
    })
    await page.route('**/rest/v1/mdm_material?*', async (route) => {
      const query = new URL(route.request().url()).searchParams
      if (
        query.get('select') === 'id,tenant_id,serial_management_enabled,batch_management_enabled'
      ) {
        controlReads += 1
        if (controlReads === 1) await firstControlGate
        if (!rejectControl) successfulControlReads += 1
        return route.fulfill(
          rejectControl
            ? currentDraft === 2
              ? { json: null }
              : { status: 503, json: { code: 'XX000', message: '测试物料规则读取失败' } }
            : {
                json: {
                  id: material.id,
                  tenant_id: tenantId,
                  serial_management_enabled: true,
                  batch_management_enabled: currentDraft === 2
                }
              }
        )
      }
      return route.fulfill({ headers: { 'content-range': '0-0/1' }, json: [material] })
    })
    let rejectSave = true
    const payloads: Record<string, unknown>[] = []
    await page.route('**/rest/v1/rpc/wms_post_inventory_movement_secure', (route) => {
      payloads.push(route.request().postDataJSON().p_payload)
      return route.fulfill(
        rejectSave
          ? { status: 400, json: { code: 'P0001', message: '测试采购入库保存失败' } }
          : { json: 'saved-purchase-in' }
      )
    })
    await page.goto('#/wms/receipt-issue/stock-operation', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '库存作业', exact: true })).toBeVisible({
      timeout: 90_000
    })
    const form = page.locator('.wms-stock-operation-form')
    const save = page.getByRole('button', { name: '确认记账', exact: true })
    for (const draft of [1, 2]) {
      currentDraft = draft
      if (movementType === 'other_in') await choose(page, form, '作业类型', '其他入库')
      await choose(page, form, '入库仓库', '原料一仓 · RAW-A')
      await form.getByRole('textbox', { name: '入库物料', exact: false }).click()
      const picker = page.getByRole('dialog', { name: '选择入库物料', exact: true })
      await picker.locator('.el-table__body').getByText('RAW-001', { exact: true }).click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      if (draft === 1) {
        await expect(
          page.getByRole('status').filter({ hasText: '正在读取物料库存规则，请稍候。' })
        ).toBeVisible()
        await expect(save).toBeDisabled()
        expect(payloads).toHaveLength(0)
        await page.screenshot({
          path: testInfo.outputPath('stock-material-rules-pending.png'),
          animations: 'disabled'
        })
        releaseFirstControl?.()
      }
      await expect(
        page.getByText('当前物料的库存规则加载失败，请重试后再办理。', { exact: false })
      ).toBeVisible()
      await expect(save).toBeDisabled()
      await expect(
        page.getByRole('button', { name: '重新加载物料规则', exact: true })
      ).toBeInViewport()
      await page.screenshot({
        path: testInfo.outputPath(`stock-material-rules-${draft}-failed.png`),
        animations: 'disabled'
      })
      const remark = form.getByRole('textbox', { name: '业务备注', exact: true })
      await remark.fill(`采购库存新增 ${draft}`)
      rejectControl = false
      await page.getByRole('button', { name: '重新加载物料规则', exact: true }).click()
      const serials = form.getByPlaceholder('每行一个 SN；件数须等于入库数量', { exact: true })
      await expect(serials).toBeVisible()
      await expect(remark).toHaveValue(`采购库存新增 ${draft}`)
      if (draft === 1) {
        const batch = form.getByPlaceholder('可留空或手工填写批号', { exact: true })
        await expect(batch).toBeEnabled()
        if (movementType === 'purchase_in') {
          await batch.fill(`PURCHASE-NEW-${draft}`, { timeout: 10_000 })
        } else {
          await expect(batch).toHaveValue('')
        }
      } else {
        await expect(
          form.getByPlaceholder('入库时按物料批号规则自动生成', { exact: true })
        ).toBeDisabled()
      }
      await form.getByRole('textbox', { name: '批号', exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath(`stock-batch-rule-${draft}.png`),
        animations: 'disabled'
      })
      await form.getByRole('spinbutton', { name: '业务数量', exact: false }).fill('2')
      await save.click()
      await expect(
        page.getByText('序列号物料须逐件填写唯一 SN，件数与入库数量一致', { exact: true })
      ).toBeVisible()
      expect(payloads).toHaveLength((draft - 1) * 2)
      await serials.fill(`PURCHASE-SN-${draft}-1\nPURCHASE-SN-${draft}-2`)
      rejectSave = true
      await save.click()
      await expect(page.getByText('测试采购入库保存失败', { exact: true })).toBeVisible()
      await expect(remark).toHaveValue(`采购库存新增 ${draft}`)
      await expect(serials).toHaveValue(`PURCHASE-SN-${draft}-1\nPURCHASE-SN-${draft}-2`)
      await page.screenshot({
        path: testInfo.outputPath(`purchase-stock-${draft}-save-retry.png`),
        animations: 'disabled'
      })
      rejectSave = false
      await save.click()
      await expect(remark).toHaveValue('')
      expect(payloads).toHaveLength(draft * 2)
      expect(payloads.at(-1)).toEqual(payloads.at(-2))
      expect(payloads.at(-1)).toMatchObject({
        movement_type: movementType,
        batch_no: draft === 1 && movementType === 'purchase_in' ? `PURCHASE-NEW-${draft}` : '',
        quantity: 2,
        serial_nos: [`PURCHASE-SN-${draft}-1`, `PURCHASE-SN-${draft}-2`]
      })
      rejectControl = true
    }
    expect(controlReads).toBeGreaterThanOrEqual(4)
    expect(successfulControlReads).toBe(2)
  })
}

async function chooseBatch(page: Page, scope: Locator, placeholder: string): Promise<void> {
  await scope.getByPlaceholder(placeholder, { exact: true }).click()
  const picker = page.locator('.el-dialog:visible').last()
  await picker.getByText('岩棉板 · B-SPECIAL', { exact: true }).click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.locator('.art-data-select-dialog:visible')).toHaveCount(0)
}

test('领料其他出库两张来源批次新增及超量拦截保存重试', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await installSpecialFixtures(page)
  await page.route('**/rest/v1/wms_serial_number?*', (route) => route.fulfill({ json: [] }))
  let rejectSave = true
  const payloads: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/wms_post_inventory_movement_secure', (route) => {
    payloads.push(route.request().postDataJSON().p_payload)
    return route.fulfill(
      rejectSave
        ? { status: 400, json: { code: 'P0001', message: '测试领料保存失败' } }
        : { json: 'saved-other-out' }
    )
  })
  await page.goto('#/wms/receipt-issue/stock-operation', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '库存作业', exact: true })).toBeVisible({
    timeout: 90_000
  })
  const form = page.locator('.wms-stock-operation-form')
  const save = page.getByRole('button', { name: '确认记账', exact: true })
  for (const draft of [1, 2]) {
    await choose(page, form, '作业类型', '其他出库')
    await choose(page, form, '来源仓库', '原料一仓 · RAW-A')
    if (draft === 2) await choose(page, form, '关联工单', 'MO-SPECIAL')
    await chooseBatch(page, form, '选择在库批次')
    await expect(save).toBeEnabled()
    const quantity = form.getByRole('spinbutton', { name: '业务数量', exact: false })
    const remark = form.getByRole('textbox', { name: '业务备注', exact: true })
    await expect(remark).toHaveValue('')
    await quantity.fill('13')
    await save.click()
    await expect(page.getByText('业务数量超过来源批次在库数量', { exact: true })).toBeVisible()
    expect(payloads).toHaveLength((draft - 1) * 2)
    await quantity.fill(draft === 1 ? '2' : '1')
    await remark.fill(`领料新增 ${draft}`)
    rejectSave = true
    await save.click()
    await expect(page.getByText('测试领料保存失败', { exact: true })).toBeVisible()
    await expect(form.getByPlaceholder('选择在库批次', { exact: true })).toHaveValue(
      '岩棉板 · B-SPECIAL'
    )
    await expect(remark).toHaveValue(`领料新增 ${draft}`)
    await page.screenshot({
      path: testInfo.outputPath(`other-out-${draft}-save-retry.png`),
      animations: 'disabled'
    })
    rejectSave = false
    await save.click()
    await expect(remark).toHaveValue('')
    expect(payloads).toHaveLength(draft * 2)
    expect(payloads.at(-1)).toEqual(payloads.at(-2))
    expect(payloads.at(-1)).toMatchObject({
      movement_type: 'other_out',
      batch_id: batchId,
      work_order_id: draft === 1 ? '' : 'work-order',
      quantity: draft === 1 ? 2 : 1,
      remark: `领料新增 ${draft}`,
      serial_ids: []
    })
  }
})

test('生产入库两张新增承接工单和确认垛包保存重试', async ({ page }, testInfo) => {
  await installSpecialFixtures(page)
  await page.route('**/rest/v1/rpc/wms_work_order_options_secure', (route) =>
    route.fulfill({
      json: [
        {
          id: 'production-order',
          tenant_id: tenantId,
          organization_id: sourceOrganizationId,
          work_order_no: 'MO-PRODUCTION',
          material_id: material.id,
          material_name: '岩棉板',
          project_id: null,
          construction_no: null,
          completed_quantity: 10,
          warehoused_quantity: 2
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_material?*', (route) =>
    route.fulfill({
      json: { id: material.id, tenant_id: tenantId, serial_management_enabled: false }
    })
  )
  let rejectPack = true
  await page.route('**/rest/v1/mes_work_order_pack?*', (route) =>
    route.fulfill(
      rejectPack
        ? { status: 400, json: { code: 'P0001', message: '测试垛包读取失败' } }
        : {
            headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
            json: [{ id: 'confirmed-pack', pack_no: 'PACK-PRODUCTION', items: [{ pieces: 2 }] }]
          }
    )
  )
  let rejectSave = true
  const payloads: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/wms_post_inventory_movement_secure', (route) => {
    payloads.push(route.request().postDataJSON().p_payload)
    return route.fulfill(
      rejectSave
        ? { status: 400, json: { code: 'P0001', message: '测试生产入库保存失败' } }
        : { json: 'production-saved' }
    )
  })
  await page.goto('#/wms/receipt-issue/stock-operation', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '库存作业', exact: true })).toBeVisible({
    timeout: 90_000
  })
  const form = page.locator('.wms-stock-operation-form')
  const save = page.getByRole('button', { name: '确认记账', exact: true })
  for (const draft of [1, 2]) {
    await choose(page, form, '作业类型', '生产入库')
    await choose(page, form, '入库仓库', '原料一仓 · RAW-A')
    await choose(page, form, 'MES 工单', 'MO-PRODUCTION · 待入库 8')
    if (draft === 1) {
      const retry = page.getByRole('button', { name: '重新加载', exact: true })
      await expect(retry).toBeVisible()
      await expect(save).toBeDisabled()
      rejectPack = false
      await retry.click()
      await expect(retry).toHaveCount(0)
      await expect(form.getByText('MO-PRODUCTION · 待入库 8', { exact: true })).toBeVisible()
    }
    await expect(save).toBeEnabled()
    const batch = form.getByPlaceholder('可留空或手工填写批号', { exact: true })
    if (draft === 2) {
      await choose(page, form, '确认垛包', 'PACK-PRODUCTION · 2 块')
      await expect(batch).toHaveValue('PACK-PRODUCTION')
    } else await batch.fill('PRODUCTION-BATCH-1')
    const quantity = form.getByRole('spinbutton', { name: '业务数量', exact: false })
    const remark = form.getByRole('textbox', { name: '业务备注', exact: true })
    await expect(remark).toHaveValue('')
    if (draft === 1) {
      await quantity.fill('9')
      await remark.click()
      await expect(quantity).toHaveValue('8.000')
      await quantity.fill('2')
    } else {
      await expect(quantity).toBeDisabled()
      await expect(quantity).toHaveValue('2.000')
    }
    expect(payloads).toHaveLength((draft - 1) * 2)
    await remark.fill(`生产新增 ${draft}`)
    rejectSave = true
    await save.click()
    await expect(page.getByText('测试生产入库保存失败', { exact: true })).toBeVisible()
    await expect(remark).toHaveValue(`生产新增 ${draft}`)
    await expect(batch).toHaveValue(draft === 1 ? 'PRODUCTION-BATCH-1' : 'PACK-PRODUCTION')
    await page.screenshot({
      path: testInfo.outputPath(`production-${draft}-save-retry.png`),
      animations: 'disabled'
    })
    rejectSave = false
    await save.click()
    await expect(remark).toHaveValue('')
    expect(payloads).toHaveLength(draft * 2)
    expect(payloads.at(-1)).toEqual(payloads.at(-2))
    expect(payloads.at(-1)).toMatchObject({
      movement_type: 'production_in',
      material_id: material.id,
      work_order_id: 'production-order',
      pack_id: draft === 1 ? '' : 'confirmed-pack',
      quantity: 2,
      remark: `生产新增 ${draft}`
    })
  }
})

for (const oldFailure of [false, true]) {
  test(`生产工单切换返回原工单隔离旧垛包${oldFailure ? '失败' : '成功'}请求`, async ({
    page
  }, testInfo) => {
    await installSpecialFixtures(page)
    await page.route('**/rest/v1/rpc/wms_work_order_options_secure', (route) =>
      route.fulfill({
        json: ['A', 'B'].map((key) => ({
          id: `order-${key}`,
          tenant_id: tenantId,
          organization_id: sourceOrganizationId,
          work_order_no: `ORDER-${key}`,
          material_id: material.id,
          material_name: '岩棉板',
          project_id: null,
          construction_no: null,
          completed_quantity: 10,
          warehoused_quantity: 2
        }))
      })
    )
    await page.route('**/rest/v1/mdm_material?*', (route) =>
      route.fulfill({
        json: { id: material.id, tenant_id: tenantId, serial_management_enabled: false }
      })
    )
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let reads = 0
    await page.route('**/rest/v1/mes_work_order_pack?*', async (route) => {
      const first = ++reads === 1
      const order = new URL(route.request().url()).searchParams.get('work_order_id')
      if (first) await pending
      await route.fulfill(
        first && oldFailure
          ? { status: 400, json: { code: 'P0001', message: '过期垛包读取失败' } }
          : {
              headers: {
                'content-range': '0-0/1',
                'access-control-expose-headers': 'content-range'
              },
              json: [
                {
                  id: first ? 'old-pack' : `current-${order}`,
                  pack_no: first ? 'OLD-PACK' : `CURRENT-${order}`,
                  items: [{ pieces: 2 }]
                }
              ]
            }
      )
    })
    await page.goto('#/wms/receipt-issue/stock-operation', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '库存作业', exact: true })).toBeVisible({
      timeout: 90_000
    })
    const form = page.locator('.wms-stock-operation-form')
    await choose(page, form, '作业类型', '生产入库')
    await choose(page, form, '入库仓库', '原料一仓 · RAW-A')
    await choose(page, form, 'MES 工单', 'ORDER-A · 待入库 8')
    await expect.poll(() => reads).toBe(1)
    await expect(form.getByRole('combobox', { name: /^确认垛包/ })).toBeDisabled()
    await expect(form.getByText('正在读取工单垛包', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '确认记账', exact: true })).toBeDisabled()
    await choose(page, form, 'MES 工单', 'ORDER-B · 待入库 8')
    await expect.poll(() => reads).toBe(2)
    await choose(page, form, 'MES 工单', 'ORDER-A · 待入库 8')
    await expect.poll(() => reads).toBe(3)
    const response = page.waitForResponse('**/rest/v1/mes_work_order_pack?*')
    release()
    await response
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await choose(page, form, '确认垛包', 'CURRENT-eq.order-A · 2 块')
    await expect(form.getByPlaceholder('可留空或手工填写批号', { exact: true })).toHaveValue(
      'CURRENT-eq.order-A'
    )
    await expect(
      page.getByText('作业基础数据加载失败，请重试后再办理。', { exact: true })
    ).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath('current-production-pack.png'),
      animations: 'disabled'
    })
  })
}

test('销售出库两张新增承接发货通知和来源批次保存重试', async ({ page }, testInfo) => {
  await installSpecialFixtures(page)
  await page.route('**/rest/v1/wms_serial_number?*', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/scm_sales_document?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'shipping-notice',
          tenant_id: tenantId,
          document_no: 'SHIP-SPECIAL',
          project_id: null,
          status: 'submitted',
          details: {},
          lines: [
            {
              line_id: 'shipping-line',
              material_id: material.id,
              material_code: material.material_code,
              material_description: '岩棉板',
              quantity: 5,
              outbound_quantity: 1
            }
          ]
        }
      ]
    })
  )
  let rejectSave = true
  const payloads: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/wms_post_inventory_movement_secure', (route) => {
    payloads.push(route.request().postDataJSON().p_payload)
    return route.fulfill(
      rejectSave
        ? { status: 400, json: { code: 'P0001', message: '测试销售出库保存失败' } }
        : { json: 'sales-out-saved' }
    )
  })
  await page.goto('#/wms/receipt-issue/stock-operation', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '库存作业', exact: true })).toBeVisible({
    timeout: 90_000
  })
  const form = page.locator('.wms-stock-operation-form')
  const save = page.getByRole('button', { name: '确认记账', exact: true })
  for (const draft of [1, 2]) {
    await choose(page, form, '作业类型', '销售出库')
    await choose(page, form, '来源仓库', '原料一仓 · RAW-A')
    await choose(page, form, '发货通知单', 'SHIP-SPECIAL · 1 行物料')
    await choose(page, form, '发货物料行', '岩棉板 · 待出 4')
    await chooseBatch(page, form, '选择在库批次')
    await expect(save).toBeEnabled()
    const quantity = form.getByRole('spinbutton', { name: '业务数量', exact: false })
    const remark = form.getByRole('textbox', { name: '业务备注', exact: true })
    await expect(remark).toHaveValue('')
    await quantity.fill('5')
    await remark.click()
    await expect(quantity).toHaveValue('4.000')
    expect(payloads).toHaveLength((draft - 1) * 2)
    await quantity.fill('2')
    await remark.fill(`销售出库新增 ${draft}`)
    rejectSave = true
    await save.click()
    await expect(page.getByText('测试销售出库保存失败', { exact: true })).toBeVisible()
    await expect(remark).toHaveValue(`销售出库新增 ${draft}`)
    await expect(form.getByPlaceholder('选择在库批次', { exact: true })).toHaveValue(
      '岩棉板 · B-SPECIAL'
    )
    await page.screenshot({
      path: testInfo.outputPath(`sales-out-${draft}-save-retry.png`),
      animations: 'disabled'
    })
    rejectSave = false
    await save.click()
    await expect(remark).toHaveValue('')
    expect(payloads).toHaveLength(draft * 2)
    expect(payloads.at(-1)).toEqual(payloads.at(-2))
    expect(payloads.at(-1)).toMatchObject({
      movement_type: 'sales_out',
      batch_id: batchId,
      shipping_notice_id: 'shipping-notice',
      shipping_line_id: 'shipping-line',
      quantity: 2,
      remark: `销售出库新增 ${draft}`,
      serial_ids: []
    })
  }
})

async function captureVisual(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const visualDir = join(process.cwd(), '.artifacts', 'wms-visual', testInfo.project.name)
  mkdirSync(visualDir, { recursive: true })
  await page.screenshot({ path: join(visualDir, `${name}.png`), fullPage: true })
}

test('直接调拨默认值、切换单据联动和保存字段贯通', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await installSpecialFixtures(page)
  let serialFailure = true
  await page.route('**/rest/v1/wms_serial_number?*', (route) =>
    route.fulfill(
      serialFailure
        ? { status: 503, json: { code: 'XX000', message: '测试序列号加载失败' } }
        : { json: [] }
    )
  )
  let payload: Record<string, unknown> | undefined
  await page.route('**/rest/v1/rpc/wms_post_inventory_movement_secure', (route) => {
    payload = route.request().postDataJSON().p_payload
    return route.fulfill({ json: 'movement-id' })
  })
  await page.goto(
    `#/wms/receipt-issue/stock-operation?movementType=transfer&warehouseId=${warehouseId}`,
    { waitUntil: 'domcontentloaded' }
  )
  await expect(page.getByRole('heading', { name: '库存作业' })).toBeVisible({ timeout: 90_000 })
  const form = page.locator('.wms-stock-operation-form')
  await expect(form.getByText('直接调拨默认单据').first()).toBeVisible()
  await expect(form.getByText('直接调拨默认业务').first()).toBeVisible()
  await expect(form.getByText('默认启用库存组织').first()).toBeVisible()
  await form.getByRole('combobox', { name: '业务类型', exact: false }).click()
  await expect(page.getByRole('option', { name: '其他菜单业务', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: '直接调拨默认业务', exact: true }).click()
  await form.getByRole('combobox', { name: '目标库存组织', exact: false }).click()
  await expect(
    page.getByRole('option', { name: '未启用库存组织 · INV-03', exact: true })
  ).toHaveCount(0)
  await page.getByRole('option', { name: '默认启用库存组织 · INV-01', exact: true }).click()
  await choose(page, form, '单据类型', '直接调拨备用单据')
  await expect(form.getByText('备用单据默认业务').first()).toBeVisible()
  await choose(page, form, '单据类型', '直接调拨默认单据')
  await expect(form.getByText('直接调拨默认业务').first()).toBeVisible()
  await chooseBatch(page, form, '选择在库批次')
  await expect(page.getByRole('button', { name: '重新加载序列号', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '确认记账', exact: true })).toBeDisabled()
  serialFailure = false
  await page.getByRole('button', { name: '重新加载序列号', exact: true }).click()
  await expect(page.getByRole('button', { name: '重新加载序列号', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '确认记账', exact: true })).toBeEnabled()
  await captureVisual(page, testInfo, 'wms-direct-transfer-master-data')
  await page.getByRole('button', { name: '确认记账', exact: true }).click()
  await expect
    .poll(() => payload)
    .toMatchObject({
      document_type_id: 'direct-doc',
      business_type_id: 'direct-doc-business',
      target_organization_id: organizationId,
      batch_id: batchId
    })
  await page.goto(
    `#/wms/receipt-issue/stock-operation?movementType=transfer&warehouseId=${warehouseId}`
  )
  let releaseSerials: (() => void) | undefined
  await page.reload()
  const pendingSerials = new Promise<void>((resolve) => {
    releaseSerials = resolve
  })
  await page.route('**/rest/v1/wms_serial_number?*', async (route) => {
    await pendingSerials
    await route.fulfill({ status: 503, json: { code: 'XX000', message: '过期批次请求失败' } })
  })
  const serialRequest = page.waitForRequest('**/rest/v1/wms_serial_number?*')
  await chooseBatch(page, form, '选择在库批次')
  await serialRequest
  await expect(page.getByRole('button', { name: '确认记账', exact: true })).toBeDisabled()
  await page
    .locator('button.el-button')
    .filter({ hasText: /^清空$/ })
    .click()
  const serialResponse = page.waitForResponse('**/rest/v1/wms_serial_number?*')
  releaseSerials?.()
  await (await serialResponse).finished()
  await expect(page.getByRole('button', { name: '重新加载序列号', exact: true })).toHaveCount(0)
  await expect(form.getByText('岩棉板 · B-SPECIAL', { exact: true })).toHaveCount(0)
})

test('分步调拨按菜单带入默认类型并保存目标启用库存组织', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await installSpecialFixtures(page)
  let payload: Record<string, unknown> | undefined
  await page.route('**/rest/v1/rpc/wms_create_transfer_secure', (route) => {
    payload = route.request().postDataJSON().p_payload
    return route.fulfill({ json: 'transfer-id' })
  })
  await page.goto('#/wms/transfer-business/step-transfer', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '新建调拨单', exact: true }).click({ timeout: 90_000 })
  const dialog = page.locator('.el-dialog:visible').first()
  await chooseBatch(page, dialog, '选择来源批次')
  await expect(dialog.getByText('分步调拨默认单据').first()).toBeVisible()
  await expect(dialog.getByText('分步调拨默认业务').first()).toBeVisible()
  await choose(page, dialog, '目标仓库', '目标一仓 · RAW-B')
  await expect(dialog.getByText('默认启用库存组织').first()).toBeVisible()
  await captureVisual(page, testInfo, 'wms-step-transfer-master-data')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect
    .poll(() => payload)
    .toMatchObject({
      document_type_id: 'step-doc',
      business_type_id: 'step-doc-business',
      target_organization_id: organizationId,
      source_batch_id: batchId
    })
})

test('出库申请按启用库存组织和菜单默认类型完成保存', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await installSpecialFixtures(page)
  let payload: Record<string, unknown> | undefined
  await page.route('**/rest/v1/rpc/wms_create_issue_request_secure', (route) => {
    payload = route.request().postDataJSON().p_payload
    return route.fulfill({ json: 'issue-id' })
  })
  await page.goto('#/wms/outbound-business/outbound-request', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '新增出库申请单', exact: true }).click({ timeout: 90_000 })
  const dialog = page.locator('.el-dialog:visible').first()
  await expect(dialog.getByText('默认启用库存组织').first()).toBeVisible()
  await choose(page, dialog, '领料仓库', '目标一仓 · RAW-B')
  await expect(dialog.getByText('出库申请默认单据').first()).toBeVisible()
  await expect(dialog.getByText('出库申请默认业务').first()).toBeVisible()
  await choose(page, dialog, 'MES 工单', 'MO-SPECIAL')
  await expect(dialog.getByPlaceholder('按编码或名称选择物料')).toHaveValue('岩棉板')
  await captureVisual(page, testInfo, 'wms-issue-request-master-data')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect
    .poll(() => payload)
    .toMatchObject({
      document_type_id: 'issue-doc',
      business_type_id: 'issue-doc-business',
      organization_id: organizationId,
      work_order_id: 'work-order'
    })
})

test('出库申请两张新增两行明细校验及保存失败重试保留输入', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await installSpecialFixtures(page)
  const secondMaterialId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'
  await page.route('**/rest/v1/wms_inventory_reservation?*', (route) =>
    route.fulfill({
      json: [
        {
          material_id: material.id,
          reserved_quantity: 1,
          material: { material_code: material.material_code, material_name: material.material_name }
        },
        {
          material_id: secondMaterialId,
          reserved_quantity: 1,
          material: { material_code: 'ISSUE-SECOND', material_name: '第二申请物料' }
        }
      ]
    })
  )
  const payloads: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/wms_create_issue_request_secure', (route) => {
    payloads.push(route.request().postDataJSON().p_payload)
    if (payloads.length % 2 === 1)
      return route.fulfill({
        status: 400,
        json: { code: 'P0001', message: '测试出库申请暂存失败' }
      })
    return route.fulfill({ json: `issue-new-${payloads.length / 2}` })
  })
  await page.goto('#/wms/outbound-business/outbound-request', { waitUntil: 'domcontentloaded' })
  for (const draft of [1, 2]) {
    await page
      .getByRole('button', { name: '新增出库申请单', exact: true })
      .click({ timeout: 90_000 })
    const dialog = page.locator('.el-dialog:visible').first()
    await expect(dialog.getByRole('textbox', { name: '申请说明', exact: true })).toHaveValue('')
    await choose(page, dialog, '领料仓库', '目标一仓 · RAW-B')
    await choose(page, dialog, 'MES 工单', 'MO-SPECIAL')
    await expect(dialog.getByPlaceholder('按编码或名称选择物料')).toHaveCount(2)
    await expect(dialog.getByPlaceholder('按编码或名称选择物料').nth(1)).toHaveValue('第二申请物料')
    await dialog.getByRole('button', { name: '添加物料', exact: true }).click()
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByText('请填写至少一条有效物料和申请数量', { exact: true })).toBeVisible()
    expect(payloads).toHaveLength((draft - 1) * 2)
    await dialog.getByRole('button', { name: '移除第 3 行', exact: true }).click()
    await dialog
      .getByRole('spinbutton', { name: '第 1 行申请数量', exact: true })
      .fill(String(draft + 1))
    await dialog
      .getByRole('spinbutton', { name: '第 2 行申请数量', exact: true })
      .fill(String(draft + 2))
    await dialog
      .getByRole('textbox', { name: '申请说明', exact: true })
      .fill(`申请-${draft}-保留输入`)
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect.poll(() => payloads.length).toBe(draft * 2 - 1)
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: '申请说明', exact: true })).toHaveValue(
      `申请-${draft}-保留输入`
    )
    await expect(
      dialog.getByRole('spinbutton', { name: '第 1 行申请数量', exact: true })
    ).toHaveValue(`${draft + 1}.000`)
    await expect(
      dialog.getByRole('spinbutton', { name: '第 2 行申请数量', exact: true })
    ).toHaveValue(`${draft + 2}.000`)
    const lastQuantity = dialog.getByRole('spinbutton', { name: '第 2 行申请数量', exact: true })
    await lastQuantity.scrollIntoViewIfNeeded()
    await expect(lastQuantity).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`issue-new-${draft}-save-failed.png`),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.locator('.el-dialog:visible')).toHaveCount(0)
    expect(payloads[draft * 2 - 1]).toEqual(payloads[draft * 2 - 2])
    expect(payloads[draft * 2 - 1]).toMatchObject({
      document_type_id: 'issue-doc',
      business_type_id: 'issue-doc-business',
      organization_id: organizationId,
      work_order_id: 'work-order',
      remark: `申请-${draft}-保留输入`,
      lines: [
        { material_id: material.id, quantity: draft + 1 },
        { material_id: secondMaterialId, quantity: draft + 2 }
      ]
    })
  }
})

for (const oldOutcome of ['success', 'failure']) {
  for (const issueMode of ['plain', 'serial', 'pack']) {
    test(`出库申请-${issueMode}两行详情重试及旧${oldOutcome}响应隔离`, async ({
      page
    }, testInfo) => {
      test.setTimeout(120_000)
      await installSpecialFixtures(page)
      const requests = ['a', 'b'].map((key) => ({
        id: `issue-${key}`,
        tenant_id: tenantId,
        organization_id: organizationId,
        document_no: `ISSUE-${key.toUpperCase()}`,
        status: 'partially_issued',
        request_type: 'consumables_outbound',
        application_date: '2026-10-06',
        warehouse_id: targetWarehouseId,
        warehouse_name: '目标一仓',
        work_order_id: 'work-order',
        work_order_no: 'MO-SPECIAL',
        project_name: '测试申请项目',
        project_id: null,
        construction_no: null,
        remark: `申请${key}备注`,
        created_at: '2026-10-06T01:00:00Z',
        material_codes: 'MAT-1,MAT-2',
        material_descriptions: '两行申请物料',
        requested_quantity_total: 9,
        issued_quantity_total: 6
      }))
      await page.route('**/rest/v1/wms_issue_request_list?*', (route) =>
        route.fulfill({ json: requests, headers: { 'content-range': '0-1/2' } })
      )
      let held = false
      let recovered = false
      let posted = false
      let finalPosted = false
      const issuePayloads: Record<string, unknown>[] = []
      await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
        route.fulfill({
          json: [
            {
              id: posted && issueMode === 'plain' ? 'issue-final-batch' : 'issue-batch',
              tenant_id: tenantId,
              organization_id: organizationId,
              warehouse_id: targetWarehouseId,
              material_id: 'material-1',
              batch_no:
                posted && issueMode === 'plain' ? 'ISSUE-FINAL-BATCH' : 'ISSUE-CURRENT-BATCH',
              quantity: posted && issueMode === 'plain' ? 1 : 2,
              pack_id: issueMode === 'pack' ? 'issue-pack' : null,
              project_id: null,
              construction_no: null,
              status: 'normal',
              material: {
                material_code: 'MAT-1',
                material_name: '当前申请物料1',
                serial_management_enabled: issueMode === 'serial'
              },
              warehouse: { warehouse_name: '目标一仓', warehouse_code: 'RAW-B' }
            }
          ],
          headers: { 'content-range': '0-0/1' }
        })
      )
      await page.route('**/rest/v1/wms_serial_number?*', (route) =>
        route.fulfill({
          json: (issueMode === 'serial' ? [1, 2] : []).map((index) => ({
            id: `issue-sn-${index}`,
            tenant_id: tenantId,
            batch_id: 'issue-batch',
            serial_no: `ISSUE-SN-${index}`,
            status: 'in_stock',
            parent_serial_id: null,
            reserved_work_order_id: null
          }))
        })
      )
      await page.route('**/rest/v1/rpc/wms_post_issue_request_secure', (route) => {
        issuePayloads.push(route.request().postDataJSON().p_payload)
        if (issuePayloads.length === 1)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '测试详情入口领料失败' }
          })
        posted = true
        finalPosted = issuePayloads.length > 2
        return route.fulfill({ json: 'issue-movement' })
      })
      let release: () => void = () => undefined
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route('**/rest/v1/wms_issue_request_line?*', async (route) => {
        const old = new URL(route.request().url()).searchParams.get('request_id') === 'eq.issue-a'
        if (old) {
          held = true
          await pending
        }
        if ((old && oldOutcome === 'failure') || (!old && !recovered)) {
          await route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '测试申请明细读取失败' }
          })
          return
        }
        await route.fulfill({
          json: [1, 2].map((index) => ({
            id: `${old ? 'old' : 'current'}-${index}`,
            request_id: old ? 'issue-a' : 'issue-b',
            material_id: `material-${index}`,
            requested_quantity: index === 1 ? 5 : 4,
            issued_quantity: index === 1 ? (finalPosted && !old ? 5 : posted && !old ? 4 : 2) : 4,
            material: {
              material_code: `MAT-${index}`,
              material_name: `${old ? '旧申请' : '当前申请'}物料${index}`,
              baseUnit: { unit_name: '件' }
            }
          }))
        })
      })
      await page.route('**/rest/v1/wms_issue_request_allocation?*', (route) =>
        route.fulfill({
          json: [
            {
              id: 'allocation-current',
              request_id: 'issue-b',
              quantity: 2,
              serial_ids: ['sn-1', 'sn-2'],
              created_at: '2026-10-06T01:00:00Z',
              batch: { batch_no: 'CURRENT-BATCH' },
              movement: { reference_no: 'MOVEMENT-B', occurred_at: '2026-10-06T01:00:00Z' }
            },
            ...(posted
              ? [
                  {
                    id: 'allocation-posted',
                    request_id: 'issue-b',
                    quantity: 2,
                    serial_ids: issueMode === 'serial' ? ['issue-sn-1', 'issue-sn-2'] : [],
                    created_at: '2026-10-06T02:00:00Z',
                    batch: { batch_no: 'ISSUE-CURRENT-BATCH' },
                    movement: { reference_no: 'MOVEMENT-POST', occurred_at: '2026-10-06T02:00:00Z' }
                  }
                ]
              : []),
            ...(finalPosted
              ? [
                  {
                    id: 'allocation-final',
                    request_id: 'issue-b',
                    quantity: 1,
                    serial_ids: [],
                    created_at: '2026-10-06T03:00:00Z',
                    batch: { batch_no: 'ISSUE-FINAL-BATCH' },
                    movement: {
                      reference_no: 'MOVEMENT-FINAL',
                      occurred_at: '2026-10-06T03:00:00Z'
                    }
                  }
                ]
              : [])
          ]
        })
      )
      await page.goto('#/wms/outbound-business/outbound-request', { waitUntil: 'domcontentloaded' })
      const views = page
        .locator('.el-table__body-wrapper')
        .getByRole('button', { name: '查看明细', exact: true })
      await expect(views).toHaveCount(2, { timeout: 90_000 })
      await views.first().click()
      await expect.poll(() => held).toBe(true)
      const drawer = page.locator('.el-drawer:visible')
      await drawer.getByRole('button', { name: /关闭|Close/ }).click()
      await expect(drawer).toHaveCount(0)
      await views.nth(1).click()
      await expect(drawer.getByText('申请明细加载失败，请重试', { exact: true })).toBeVisible()
      await expect(drawer.locator('strong.text-xl')).toHaveText([/—\s*种/, /—\s*种/, /—\s*种/])
      await expect(drawer.getByRole('button', { name: '办理领料', exact: true })).toHaveCount(0)
      await expect(drawer.getByText('当前申请物料1', { exact: true })).not.toBeVisible()
      await drawer.getByText('申请明细加载失败，请重试', { exact: true }).scrollIntoViewIfNeeded()
      await expect(drawer.getByText('申请明细加载失败，请重试', { exact: true })).toBeInViewport()
      await page.screenshot({
        path: testInfo.outputPath('issue-detail-load-failed.png'),
        animations: 'disabled'
      })
      recovered = true
      await drawer
        .getByRole('button', { name: /重新加载|重试/ })
        .first()
        .click()
      await expect(drawer.getByText('当前申请物料1', { exact: true })).toBeVisible()
      await expect(drawer.getByText('当前申请物料2', { exact: true })).toBeVisible()
      await expect(drawer.locator('strong.text-xl')).toHaveText([/2\s*种/, /1\s*种/, /1\s*种/])
      await expect(drawer.getByRole('button', { name: '办理领料', exact: true })).toHaveCount(1)
      await expect(drawer.getByText(/待领 3/)).toBeVisible()
      const response = page.waitForResponse(
        (item) =>
          new URL(item.url()).searchParams.get('request_id') === 'eq.issue-a' &&
          item.url().includes('wms_issue_request_line')
      )
      release()
      await (await response).finished()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      await expect(drawer.getByText('当前申请物料1', { exact: true })).toBeVisible()
      await expect(drawer.getByText('旧申请物料1', { exact: true })).not.toBeVisible()
      await expect(drawer.getByText('申请明细加载失败，请重试', { exact: true })).not.toBeVisible()
      await expect(drawer.getByRole('button', { name: '办理领料', exact: true })).toHaveCount(1)
      await drawer.getByText('CURRENT-BATCH', { exact: true }).scrollIntoViewIfNeeded()
      await expect(drawer.getByText('CURRENT-BATCH', { exact: true })).toBeInViewport()
      await expect(drawer.getByText(/SN 2 件/)).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath('issue-current-detail-allocation.png'),
        animations: 'disabled'
      })
      await drawer.getByRole('button', { name: '办理领料', exact: true }).click()
      const postDialog = page.locator('.el-dialog:visible').first()
      await expect(postDialog.getByText('ISSUE-B', { exact: true })).toBeVisible()
      await expect(postDialog.getByText(/归属：公共库存 · MO-SPECIAL/)).toBeVisible()
      await postDialog.getByPlaceholder('选择来源库存批次').click()
      const batchPicker = page.getByRole('dialog', { name: '选择领料批次', exact: true })
      await batchPicker.getByText('当前申请物料1 · ISSUE-CURRENT-BATCH', { exact: true }).click()
      await batchPicker.getByRole('button', { name: '确定', exact: true }).click()
      const postQuantity = postDialog.getByRole('spinbutton', { name: /本次领料数量/ })
      if (issueMode === 'pack') await expect(postQuantity).toBeDisabled()
      else {
        await postQuantity.fill('3')
        await postQuantity.press('Tab')
      }
      await expect(postQuantity).toHaveValue('2.000')
      if (issueMode === 'serial') {
        await postDialog.getByRole('button', { name: '确定', exact: true }).click()
        await expect(page.getByText('SN 件数必须与本次领料数量一致', { exact: true })).toBeVisible()
        expect(issuePayloads).toHaveLength(0)
        for (const sn of ['ISSUE-SN-1', 'ISSUE-SN-2']) {
          await postDialog.getByPlaceholder('扫描当前批次的 SN，回车带入').fill(sn)
          await postDialog.getByRole('button', { name: '带入 SN', exact: true }).click()
        }
        await expect(
          postDialog.getByText('已选 2 / 2 件；仅接受当前批次可领用的 SN。', { exact: true })
        ).toBeVisible()
      }
      await postDialog
        .getByRole('textbox', { name: '领料备注', exact: true })
        .fill('详情入口保留备注')
      await postDialog.getByRole('button', { name: '确定', exact: true }).click()
      await expect.poll(() => issuePayloads.length).toBe(1)
      await expect(postDialog.getByRole('textbox', { name: '领料备注', exact: true })).toHaveValue(
        '详情入口保留备注'
      )
      await expect(postQuantity).toHaveValue('2.000')
      await postQuantity.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('issue-detail-post-failed.png'),
        animations: 'disabled'
      })
      await postDialog.getByRole('button', { name: '确定', exact: true }).click()
      await expect(page.locator('.el-dialog:visible')).toHaveCount(0)
      expect(issuePayloads).toHaveLength(2)
      expect(issuePayloads[1]).toEqual(issuePayloads[0])
      expect(issuePayloads[1]).toMatchObject({
        line_id: 'current-1',
        batch_id: 'issue-batch',
        quantity: 2,
        serial_ids: issueMode === 'serial' ? ['issue-sn-1', 'issue-sn-2'] : [],
        remark: '详情入口保留备注'
      })
      await expect(drawer.getByText(/MAT-1 · 已领 4 \/ 申请 5/)).toBeVisible()
      await expect(drawer.getByText(/待领 1 件/)).toBeVisible()
      const postedAllocation = drawer
        .locator('li')
        .filter({ has: page.getByText('ISSUE-CURRENT-BATCH', { exact: true }) })
      await expect(postedAllocation).toHaveCount(1)
      await expect(
        postedAllocation.getByText(issueMode === 'serial' ? /SN 2 件/ : /SN 0 件/)
      ).toBeVisible()
      await expect(postedAllocation.getByText('−2', { exact: true })).toBeVisible()
      await postedAllocation.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('issue-posted-allocation.png'),
        animations: 'disabled'
      })
      if (issueMode === 'plain') {
        await drawer.getByRole('button', { name: '办理领料', exact: true }).click()
        await expect(
          postDialog.getByRole('textbox', { name: '领料备注', exact: true })
        ).toHaveValue('')
        await postDialog.getByPlaceholder('选择来源库存批次').click()
        await batchPicker.getByText('当前申请物料1 · ISSUE-FINAL-BATCH', { exact: true }).click()
        await batchPicker.getByRole('button', { name: '确定', exact: true }).click()
        await postQuantity.fill('2')
        await postQuantity.press('Tab')
        await expect(postQuantity).toHaveValue('1.000')
        await postDialog.getByRole('button', { name: '确定', exact: true }).click()
        await expect(page.locator('.el-dialog:visible')).toHaveCount(0)
        expect(issuePayloads).toHaveLength(3)
        expect(issuePayloads[2]).toMatchObject({
          line_id: 'current-1',
          batch_id: 'issue-final-batch',
          quantity: 1,
          serial_ids: []
        })
        await expect(drawer.getByText(/MAT-1 · 已领 5 \/ 申请 5/)).toBeVisible()
        await expect(drawer.getByRole('button', { name: '办理领料', exact: true })).toHaveCount(0)
        await expect(drawer.locator('strong').filter({ hasText: /^0 种$/ })).toHaveCount(1)
        await expect(drawer.locator('strong').filter({ hasText: /^2 种$/ })).toHaveCount(2)
        await expect(drawer.getByText('CURRENT-BATCH', { exact: true })).toBeVisible()
        await expect(postedAllocation).toHaveCount(1)
        const finalAllocation = drawer
          .locator('li')
          .filter({ has: page.getByText('ISSUE-FINAL-BATCH', { exact: true }) })
        await expect(finalAllocation.getByText('−1', { exact: true })).toBeVisible()
        await finalAllocation.scrollIntoViewIfNeeded()
        await expect(finalAllocation).toBeInViewport()
        await page.screenshot({
          path: testInfo.outputPath('issue-all-batches-fulfilled.png'),
          animations: 'disabled'
        })
      }
      await drawer.getByRole('button', { name: /关闭|Close/ }).click()
    })
  }
}

async function installOrdinaryWmsPermissions(
  page: Page,
  permissions: string[],
  menu = {
    name: 'WmsIssueRequest',
    path: '/wms/outbound-business/outbound-request',
    title: '出库申请单'
  }
): Promise<void> {
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'ordinary-wms-user',
        auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
        user_name: '仓储业务用户',
        user_email: 'ordinary-wms@example.invalid',
        user_type: '2',
        user_roles: ['R_USER'],
        status: '1',
        tenant_id: tenantId,
        tenant: { id: tenantId, tenant_code: 'DEMO', tenant_name: '示例工厂' }
      }
    })
  )
  const menuId = 'ordinary-issue-menu'
  await mockApplicationMenus(page, {
    wms: [
      {
        id: menuId,
        parentId: null,
        name: menu.name,
        path: menu.path,
        component: menu.path,
        type: 'menu',
        sort: 1,
        meta: meta(menu.title)
      },
      ...permissions.map((permission) => ({
        id: `${menuId}-${permission}`,
        parentId: menuId,
        name: permission,
        path: '',
        component: '',
        type: 'button',
        sort: 1,
        meta: meta(permission)
      }))
    ]
  })
}

for (const action of ['View', 'Create', 'Dispatch', 'Receive', 'ReceiveLocations']) {
  test(`分步调拨普通用户${action}权限入口及租户查询`, async ({ page }, testInfo) => {
    await installSpecialFixtures(page)
    const permission = action === 'ReceiveLocations' ? 'Receive' : action
    await installOrdinaryWmsPermissions(page, ['WmsTransfer:View', `WmsTransfer:${permission}`], {
      name: 'WmsStepTransfer',
      path: '/wms/transfer-business/step-transfer',
      title: '分步调拨'
    })
    const queries: string[] = []
    const statuses = ['draft', 'in_transit']
    await page.route('**/rest/v1/wms_transfer_document?*', (route) => {
      queries.push(route.request().url())
      return route.fulfill({
        json: statuses.map((status, index) => ({
          id: `ordinary-transfer-${index}`,
          tenant_id: tenantId,
          document_no: `ORDINARY-TRANSFER-${index}`,
          status,
          quantity: 2,
          target_warehouse_id: targetWarehouseId,
          serial_ids: [],
          material_id: material.id,
          created_at: '2026-10-07T01:00:00Z',
          sourceWarehouse: { warehouse_name: '调出仓库' },
          targetWarehouse: {
            warehouse_name: '调入仓库',
            enable_locations: action === 'ReceiveLocations'
          },
          material: { material_code: 'TRANSFER-MAT', material_name: '调拨物料' }
        })),
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto('#/wms/transfer-business/step-transfer')
    await expect(page.getByText('ORDINARY-TRANSFER-0', { exact: true })).toBeVisible()
    for (const [label, required] of [
      ['取消申请', 'Create'],
      ['确认调出', 'Dispatch'],
      ['确认入库', 'Receive']
    ]) {
      const button = page.getByRole('button', { name: label, exact: true })
      if (permission === required) {
        await expect(button).toHaveCount(1)
        await button.scrollIntoViewIfNeeded()
        await expect(button).toBeInViewport()
      } else await expect(button).toHaveCount(0)
    }
    for (const query of queries)
      expect(new URL(query).searchParams.get('tenant_id')).toBe(`eq.${tenantId}`)
    expect(queries.length).toBeGreaterThan(0)
    if (action === 'Create' || action === 'Dispatch') {
      const rpc =
        action === 'Create' ? 'wms_cancel_transfer_secure' : 'wms_dispatch_transfer_secure'
      const calls: Record<string, unknown>[] = []
      let reject = true
      await page.route(`**/rest/v1/rpc/${rpc}`, (route) => {
        calls.push(route.request().postDataJSON())
        if (reject)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '测试调拨操作失败，请重试' }
          })
        statuses[0] = action === 'Create' ? 'cancelled' : 'in_transit'
        return route.fulfill({ json: null })
      })
      const trigger = page.locator('.el-table').getByRole('button', {
        name: action === 'Create' ? '取消申请' : '确认调出',
        exact: true
      })
      await trigger.click()
      const confirmation = page.locator('.el-message-box:visible')
      await confirmation.getByRole('button', { name: '返回', exact: true }).click()
      expect(calls).toHaveLength(0)
      await trigger.click()
      await confirmation
        .getByRole('button', { name: action === 'Create' ? '确定取消' : '确认调出', exact: true })
        .click()
      await expect(page.getByText('测试调拨操作失败，请重试', { exact: true })).toBeVisible()
      await expect(trigger).toBeEnabled()
      expect(calls).toEqual([{ p_transfer_id: 'ordinary-transfer-0' }])
      reject = false
      await trigger.click()
      await confirmation
        .getByRole('button', { name: action === 'Create' ? '确定取消' : '确认调出', exact: true })
        .click()
      await expect(trigger).toHaveCount(0)
      expect(calls).toEqual([
        { p_transfer_id: 'ordinary-transfer-0' },
        { p_transfer_id: 'ordinary-transfer-0' }
      ])
      const row = page
        .locator('.el-table__body tr')
        .filter({ has: page.getByText('ORDINARY-TRANSFER-0', { exact: true }) })
      const status = row.getByText(action === 'Create' ? '已取消' : '在途', { exact: true })
      await status.scrollIntoViewIfNeeded()
      await expect(status).toBeInViewport()
    }
    if (permission === 'Receive') {
      const calls: Record<string, unknown>[] = []
      let reject = true
      let rejectBins = action === 'ReceiveLocations'
      const binId = 'receive-bin'
      await page.route('**/rest/v1/mdm_warehouse_bin?*', (route) =>
        route.fulfill(
          rejectBins
            ? { status: 400, json: { code: 'P0001', message: '测试库位加载失败' } }
            : {
                json: [
                  {
                    id: binId,
                    tenant_id: tenantId,
                    warehouse_id: targetWarehouseId,
                    bin_code: 'ARRIVAL-01',
                    bin_name: '调拨接收库位',
                    status: 'available'
                  }
                ]
              }
        )
      )
      await page.route('**/rest/v1/rpc/wms_receive_transfer_secure', (route) => {
        calls.push(route.request().postDataJSON())
        if (reject)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '测试调拨入库失败，请重试' }
          })
        statuses[1] = 'received'
        return route.fulfill({ json: null })
      })
      const trigger = page
        .locator('.el-table')
        .getByRole('button', { name: '确认入库', exact: true })
      await trigger.click()
      const dialog = page.getByRole('dialog', { name: '确认调拨入库', exact: true })
      const submit = dialog.getByRole('button', { name: '确定', exact: true })
      await expect(submit).toBeInViewport()
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      expect(calls).toHaveLength(0)
      await trigger.click()
      if (action === 'ReceiveLocations') {
        await expect(
          dialog.getByText('库位加载失败，请重新加载后办理。', { exact: false })
        ).toBeVisible()
        await expect(submit).toBeDisabled()
        rejectBins = false
        await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
        await expect(submit).toBeEnabled()
        await submit.click()
        await expect(dialog.getByText('请选择目标库位', { exact: true })).toBeVisible()
        expect(calls).toHaveLength(0)
        const recommendationCalls: Record<string, unknown>[] = []
        let rejectRecommendation = true
        await page.route('**/rest/v1/rpc/wms_recommend_bin_secure', (route) => {
          recommendationCalls.push(route.request().postDataJSON())
          return route.fulfill(
            rejectRecommendation
              ? { status: 400, json: { code: 'P0001', message: '测试自动选位失败，请重试' } }
              : { json: binId }
          )
        })
        const recommend = dialog.getByRole('button', { name: '自动选位', exact: true })
        await choose(page, dialog, '目标库位', 'ARRIVAL-01 · 调拨接收库位')
        await recommend.click()
        await expect(page.getByText('测试自动选位失败，请重试', { exact: true })).toBeVisible()
        await expect(recommend).toBeEnabled()
        await expect(dialog.getByText('ARRIVAL-01 · 调拨接收库位', { exact: true })).toBeVisible()
        rejectRecommendation = false
        await recommend.click()
        await expect(dialog.getByText('ARRIVAL-01 · 调拨接收库位', { exact: true })).toBeVisible()
        expect(recommendationCalls).toEqual([
          {
            p_warehouse_id: targetWarehouseId,
            p_material_id: material.id,
            p_quantity: 2,
            p_area_sqm: null
          },
          {
            p_warehouse_id: targetWarehouseId,
            p_material_id: material.id,
            p_quantity: 2,
            p_area_sqm: null
          }
        ])
      }
      await submit.click()
      await expect(page.getByText('测试调拨入库失败，请重试', { exact: true })).toBeVisible()
      await expect(dialog).toBeVisible()
      await expect(submit).toBeEnabled()
      await page.screenshot({
        path: testInfo.outputPath('step-transfer-receive-retry.png'),
        animations: 'disabled'
      })
      reject = false
      await submit.click()
      await expect(dialog).toBeHidden()
      expect(calls).toEqual([
        {
          p_transfer_id: 'ordinary-transfer-1',
          p_target_bin_id: action === 'ReceiveLocations' ? binId : null
        },
        {
          p_transfer_id: 'ordinary-transfer-1',
          p_target_bin_id: action === 'ReceiveLocations' ? binId : null
        }
      ])
      await expect(trigger).toHaveCount(0)
    }
    await page.screenshot({
      path: testInfo.outputPath('step-transfer-authorized-actions.png'),
      animations: 'disabled'
    })
  })
}

for (const action of ['reserve', 'bind']) {
  test(`序列号普通用户从追溯菜单${action}失败重试`, async ({ page }, testInfo) => {
    await installSpecialFixtures(page)
    await prepareAppearance(page, {
      theme: testInfo.project.name.includes('dark') ? 'dark' : 'light',
      boxBorderMode: !testInfo.project.name.includes('shadow')
    })
    await installOrdinaryWmsPermissions(
      page,
      ['WmsSerialTrace:View', `WmsSerialTrace:${action === 'reserve' ? 'Reserve' : 'Bind'}`],
      {
        name: 'WmsSerialTrace',
        path: '/wms/inventory-trace/serial-trace',
        title: '序列号追溯'
      }
    )
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let rejectCandidates = true
    let emptyCandidates = true
    await page.route('**/rest/v1/wms_serial_number?*', (route) =>
      route.fulfill({
        ...(new URL(route.request().url()).searchParams.has('consumed_work_order_id')
          ? rejectCandidates
            ? { status: 400, json: { code: 'P0001', message: '测试候选加载失败' } }
            : {
                json: emptyCandidates
                  ? []
                  : [
                      {
                        id: 'child-serial',
                        serial_no: 'CHILD-SN-01',
                        material: { material_name: '绑定测试子件' }
                      }
                    ],
                headers: {
                  'content-range': emptyCandidates ? '*/0' : '0-0/1',
                  'access-control-expose-headers': 'content-range'
                }
              }
          : {
              json: [
                {
                  id: 'reserve-serial',
                  tenant_id: tenantId,
                  serial_no: 'RESERVE-SN-01',
                  batch_id: batchId,
                  work_order_id: 'reserve-order',
                  status: 'in_stock',
                  material: { material_name: '预留测试物料' }
                }
              ],
              headers: {
                'content-range': '0-0/1',
                'access-control-expose-headers': 'content-range'
              }
            })
      })
    )
    await page.route('**/rest/v1/wms_inventory_reservation?*', (route) =>
      route.fulfill(
        rejectCandidates
          ? { status: 400, json: { code: 'P0001', message: '测试候选加载失败' } }
          : {
              json: emptyCandidates
                ? []
                : [
                    {
                      work_order_id: 'reserve-order',
                      workOrder: { work_order_no: 'RESERVE-ORDER-01', order_status: 'REL' }
                    }
                  ]
            }
      )
    )
    const calls: unknown[] = []
    let reject = true
    await page.route(
      `**/rest/v1/rpc/${action === 'reserve' ? 'wms_reserve_serials_secure' : 'wms_bind_assembly_serials_secure'}`,
      (route) => {
        calls.push(route.request().postDataJSON())
        return route.fulfill(
          reject
            ? { status: 400, json: { code: 'P0001', message: '测试序列号预留失败，请重试' } }
            : { json: null }
        )
      }
    )
    await page.goto('#/wms/inventory-trace/serial-trace')
    if (testInfo.project.name.includes('dark'))
      await expect(page.locator('html')).toHaveClass(/dark/)
    if (testInfo.project.name.includes('shadow'))
      await expect(page.locator('html')).toHaveAttribute('data-box-mode', 'shadow-mode')
    await page
      .getByRole('button', { name: action === 'reserve' ? '预留 SN' : '绑定子件', exact: true })
      .click()
    const dialog = page.getByRole('dialog', {
      name: action === 'reserve' ? '预留关键件 SN' : '绑定装配子件',
      exact: true
    })
    const submit = dialog.getByRole('button', { name: '确定', exact: true })
    await expect(dialog.getByText('候选记录加载失败', { exact: true })).toBeVisible()
    await expect(submit).toBeDisabled()
    expect(calls).toHaveLength(0)
    rejectCandidates = false
    await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(
      dialog.getByText(
        action === 'reserve'
          ? '暂无可预留工单，请先为已下达或执行中的工单预留该批次库存。'
          : '暂无可绑定子件，请先完成同工单关键件领用，再返回绑定。',
        { exact: true }
      )
    ).toBeVisible()
    await expect(submit).toBeDisabled()
    await page.screenshot({
      path: testInfo.outputPath('serial-empty-candidates.png'),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    emptyCandidates = false
    await page
      .getByRole('button', { name: action === 'reserve' ? '预留 SN' : '绑定子件', exact: true })
      .click()
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(
      dialog.getByText(action === 'reserve' ? '请选择工单' : '请选择关键件 SN', { exact: true })
    ).toBeVisible()
    expect(calls).toHaveLength(0)
    await choose(
      page,
      dialog,
      action === 'reserve' ? '预留给工单' : '已领用的关键件 SN',
      action === 'reserve' ? 'RESERVE-ORDER-01' : 'CHILD-SN-01 · 绑定测试子件'
    )
    await page.keyboard.press('Escape')
    await submit.click()
    await expect(page.getByText('测试序列号预留失败，请重试', { exact: true })).toBeVisible()
    await expect(
      dialog.getByText(action === 'reserve' ? 'RESERVE-ORDER-01' : 'CHILD-SN-01 · 绑定测试子件', {
        exact: true
      })
    ).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('serial-action-retry.png'),
      animations: 'disabled'
    })
    reject = false
    await submit.click()
    await expect(dialog).toBeHidden()
    expect(calls).toEqual(
      action === 'reserve'
        ? [
            { p_work_order_id: 'reserve-order', p_serial_ids: ['reserve-serial'] },
            { p_work_order_id: 'reserve-order', p_serial_ids: ['reserve-serial'] }
          ]
        : [
            { p_parent_serial_id: 'reserve-serial', p_child_serial_ids: ['child-serial'] },
            { p_parent_serial_id: 'reserve-serial', p_child_serial_ids: ['child-serial'] }
          ]
    )
    expect(errors).toEqual([])
  })
}

test('序列号普通用户释放预留确认返回及失败重试', async ({ page }) => {
  await installSpecialFixtures(page)
  await installOrdinaryWmsPermissions(page, ['WmsSerialTrace:View', 'WmsSerialTrace:Reserve'], {
    name: 'WmsSerialTrace',
    path: '/wms/inventory-trace/serial-trace',
    title: '序列号追溯'
  })
  let reserved = true
  await page.route('**/rest/v1/wms_serial_number?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'release-serial',
          tenant_id: tenantId,
          serial_no: 'RELEASE-SN-01',
          batch_id: batchId,
          status: 'in_stock',
          reserved_work_order_id: reserved ? 'release-order' : null
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  )
  let reject = true
  const calls: unknown[] = []
  await page.route('**/rest/v1/rpc/wms_release_serials_secure', (route) => {
    calls.push(route.request().postDataJSON())
    if (reject)
      return route.fulfill({
        status: 400,
        json: { code: 'P0001', message: '测试释放预留失败，请重试' }
      })
    reserved = false
    return route.fulfill({ json: null })
  })
  await page.goto('#/wms/inventory-trace/serial-trace')
  const trigger = page.getByRole('button', { name: '释放预留', exact: true })
  const confirmation = page.locator('.el-message-box:visible')
  await trigger.click()
  await confirmation.getByRole('button', { name: '取消', exact: true }).click()
  expect(calls).toHaveLength(0)
  await trigger.click()
  await confirmation.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('测试释放预留失败，请重试', { exact: true })).toBeVisible()
  await expect(trigger).toBeEnabled()
  reject = false
  await trigger.click()
  await confirmation.getByRole('button', { name: '确定', exact: true }).click()
  await expect(trigger).toHaveCount(0)
  await expect(page.getByRole('button', { name: '预留 SN', exact: true })).toBeVisible()
  expect(calls).toEqual([
    { p_work_order_id: 'release-order', p_serial_ids: ['release-serial'] },
    { p_work_order_id: 'release-order', p_serial_ids: ['release-serial'] }
  ])
})

test('出库申请普通用户文本筛选与重置保持租户范围', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await installSpecialFixtures(page)
  await installOrdinaryWmsPermissions(page, ['WmsIssueRequest:View'])
  const queries: string[] = []
  await page.route('**/rest/v1/wms_issue_request_list?*', (route) => {
    queries.push(route.request().url())
    return route.fulfill({
      json: [
        {
          id: 'query-request',
          tenant_id: tenantId,
          organization_id: organizationId,
          document_no: 'QUERY-ISSUE-01',
          status: 'submitted',
          request_type: 'consumables_outbound',
          application_date: '2026-10-07',
          warehouse_id: targetWarehouseId,
          project_id: null,
          project_name: '项目甲',
          construction_no: null,
          requested_quantity_total: 5,
          issued_quantity_total: 1,
          created_at: '2026-10-07T01:00:00Z'
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.route('**/rest/v1/wms_issue_request_line?*', (route) =>
    route.fulfill({
      json: [1, 2].map((index) => ({
        id: `query-line-${index}`,
        request_id: 'query-request',
        material_id: `query-material-${index}`,
        requested_quantity: index === 1 ? 2 : 3,
        issued_quantity: index === 1 ? 1 : 0,
        material: {
          material_code: `MAT-01-${index}`,
          material_name: `安全帽 ${index}`,
          baseUnit: { unit_name: '件' }
        }
      })),
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.goto('#/wms/outbound-business/outbound-request', { waitUntil: 'domcontentloaded' })
  await expect.poll(() => queries.length, { timeout: 60_000 }).toBeGreaterThan(0)
  const expand = page.getByRole('button', { name: '展开', exact: true })
  if (await expand.isVisible()) await expand.click()
  for (const [placeholder, value] of [
    ['项目名称', ' 项目甲 '],
    ['物料描述', ' 安全帽 '],
    ['物料编码', ' MAT-01 '],
    ['姓名或工号', ' EMP-01 ']
  ])
    await page.getByPlaceholder(placeholder, { exact: true }).fill(value)
  for (const [label, option] of [
    ['单据状态', '待审核'],
    ['申请类型', '耗材出库']
  ]) {
    await page.locator('.el-form-item').filter({ hasText: label }).getByRole('combobox').click()
    await page.getByRole('option', { name: option, exact: true }).click()
  }
  await page.getByPlaceholder('开始日期', { exact: true }).fill('2026-10-01')
  const endDate = page.getByPlaceholder('结束日期', { exact: true })
  await endDate.fill('2026-10-07')
  await endDate.press('Enter')
  await page.keyboard.press('Escape')
  await expectInputTextUnclipped(page.locator('.el-date-editor input.el-range-input'))
  const count = queries.length
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect.poll(() => queries.length).toBeGreaterThan(count)
  const filtered = new URL(queries.at(-1)!).searchParams
  expect(filtered.get('project_name')).toBe('ilike.%项目甲%')
  expect(filtered.get('material_descriptions')).toBe('ilike.%安全帽%')
  expect(filtered.get('material_codes')).toBe('ilike.%MAT-01%')
  expect(filtered.get('or')).toContain('applicant_code.ilike.%EMP-01%')
  expect(filtered.get('status')).toBe('eq.submitted')
  expect(filtered.get('request_type')).toBe('eq.consumables_outbound')
  expect(filtered.getAll('application_date')).toEqual(['gte.2026-10-01', 'lte.2026-10-07'])
  const beforeMode = queries.length
  await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
  await expect(page.getByRole('radio', { name: '按明细', exact: true })).toBeChecked()
  await expect.poll(() => queries.length).toBeGreaterThan(beforeMode)
  const detail = new URL(queries.at(-1)!).searchParams
  for (const key of ['status', 'request_type', 'project_name', 'material_codes', 'or'])
    expect(detail.get(key)).toBe(filtered.get(key))
  expect(detail.getAll('application_date')).toEqual(filtered.getAll('application_date'))
  const rows = page.locator('.el-table__body tr')
  await expect(rows).toHaveCount(2)
  for (const [index, row] of (await rows.all()).entries()) {
    await expect(row).toContainText(`MAT-01-${index + 1}`)
    await expect(row).toContainText(`安全帽 ${index + 1}`)
  }
  const view = rows.first().getByRole('button', { name: '查看明细', exact: true })
  await view.scrollIntoViewIfNeeded()
  await expect(view).toBeInViewport()
  await page.screenshot({
    path: testInfo.outputPath('issue-filtered-lines.png'),
    animations: 'disabled'
  })
  const filteredCount = queries.length
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await expect.poll(() => queries.length).toBeGreaterThan(filteredCount)
  const reset = new URL(queries.at(-1)!).searchParams
  for (const key of [
    'project_name',
    'material_descriptions',
    'material_codes',
    'or',
    'status',
    'request_type',
    'application_date'
  ])
    expect(reset.has(key)).toBe(false)
  for (const query of queries)
    expect(new URL(query).searchParams.get('tenant_id')).toBe(`eq.${tenantId}`)
})

for (const allowCopy of [false, true]) {
  test(`出库申请普通用户${allowCopy ? '允许复制' : '仅查看'}权限与租户查询`, async ({
    page
  }, testInfo) => {
    await installSpecialFixtures(page)
    await installOrdinaryWmsPermissions(page, [
      'WmsIssueRequest:View',
      ...(allowCopy ? ['WmsIssueRequest:Copy'] : [])
    ])
    const queries: string[] = []
    const records = [
      {
        id: 'ordinary-issue',
        tenant_id: tenantId,
        organization_id: organizationId,
        document_no: 'ORDINARY-ISSUE',
        status: 'draft',
        request_type: 'consumables_outbound',
        application_date: '2026-10-06',
        warehouse_id: targetWarehouseId,
        warehouse_name: '目标一仓',
        project_id: null,
        construction_no: null,
        created_at: '2026-10-06T01:00:00Z',
        requested_quantity_total: 5,
        issued_quantity_total: 0
      }
    ]
    await page.route('**/rest/v1/wms_issue_request_list?*', (route) => {
      queries.push(route.request().url())
      return route.fulfill({
        json: records,
        headers: {
          'content-range': `0-${records.length - 1}/${records.length}`,
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    const writes: Record<string, unknown>[] = []
    await page.route('**/rest/v1/rpc/wms_copy_issue_request_secure', (route) => {
      writes.push(route.request().postDataJSON())
      records.push({ ...records[0], id: 'ordinary-issue-copy', document_no: 'ORDINARY-ISSUE-NEW' })
      return route.fulfill({ json: null })
    })
    await page.goto('#/wms/outbound-business/outbound-request', { waitUntil: 'domcontentloaded' })
    const row = page
      .locator('.el-table__body tr')
      .filter({ has: page.getByText('ORDINARY-ISSUE', { exact: true }) })
    await expect(row.getByRole('button', { name: '查看明细', exact: true })).toBeVisible()
    for (const action of ['提交', '删除', '办理出库', '审核通过', '驳回'])
      await expect(row.getByRole('button', { name: action, exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /新增出库申请单/ })).toHaveCount(0)
    expect(queries.length).toBeGreaterThan(0)
    for (const query of queries)
      expect(new URL(query).searchParams.get('tenant_id')).toBe(`eq.${tenantId}`)
    const copy = row.getByRole('button', { name: '复制', exact: true })
    if (allowCopy) {
      await copy.click()
      await page
        .locator('.el-message-box:visible')
        .getByRole('button', { name: '确认复制', exact: true })
        .click()
      await expect(page.getByText('ORDINARY-ISSUE-NEW', { exact: true })).toBeVisible()
      expect(writes).toEqual([{ p_request_id: 'ordinary-issue' }])
    } else {
      await expect(copy).toHaveCount(0)
      expect(writes).toHaveLength(0)
    }
    await row.getByRole('button', { name: '查看明细', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('ordinary-issue-authorized-actions.png'),
      animations: 'disabled'
    })
  })
}

for (const scenario of [
  { name: '仅申请办理', permissions: ['WmsIssueRequest:Issue'], allowed: false },
  { name: '仅库存出库', permissions: ['WmsStockOperation:Issue'], allowed: false },
  {
    name: '申请及库存作业',
    permissions: ['WmsIssueRequest:Issue', 'WmsStockOperation:Issue'],
    allowed: true
  },
  {
    name: '申请及库存批次',
    permissions: ['WmsIssueRequest:Issue', 'MdmInventoryBatch:Issue'],
    allowed: true
  }
]) {
  for (const mode of scenario.allowed ? ['standard', 'serial', 'pack'] : ['standard']) {
    test(`出库申请普通用户${scenario.name}${mode}领料入口权限一致`, async ({ page }, testInfo) => {
      const postedQuantity = mode === 'pack' ? 2 : 1
      await installSpecialFixtures(page)
      await installOrdinaryWmsPermissions(page, ['WmsIssueRequest:View', ...scenario.permissions])
      await page.route('**/rest/v1/wms_issue_request_list?*', (route) =>
        route.fulfill({
          json: [
            {
              id: 'ordinary-approved',
              tenant_id: tenantId,
              organization_id: organizationId,
              document_no: 'ORDINARY-APPROVED',
              status: 'approved',
              request_type: 'consumables_outbound',
              application_date: '2026-10-06',
              warehouse_id: targetWarehouseId,
              warehouse_name: '目标一仓',
              project_id: null,
              construction_no: null,
              created_at: '2026-10-06T01:00:00Z',
              requested_quantity_total: 2,
              issued_quantity_total: 0
            }
          ],
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
        })
      )
      let issued = false
      await page.route('**/rest/v1/wms_issue_request_line?*', (route) =>
        route.fulfill({
          json: [
            {
              id: 'ordinary-approved-line',
              request_id: 'ordinary-approved',
              material_id: 'ordinary-material',
              requested_quantity: 2,
              issued_quantity: issued ? postedQuantity : 0,
              material: {
                material_code: 'ORDINARY-MAT',
                material_name: '普通权限物料',
                baseUnit: { unit_name: '件' }
              }
            }
          ]
        })
      )
      await page.route('**/rest/v1/wms_issue_request_allocation?*', (route) =>
        route.fulfill({
          json: issued
            ? [
                {
                  id: 'ordinary-allocation',
                  request_id: 'ordinary-approved',
                  quantity: postedQuantity,
                  serial_ids: mode === 'serial' ? ['ordinary-sn'] : [],
                  created_at: '2026-10-06T01:00:00Z',
                  batch: { batch_no: 'ORDINARY-BATCH' },
                  movement: {
                    reference_no: 'ORDINARY-MOVEMENT',
                    occurred_at: '2026-10-06T01:00:00Z'
                  }
                }
              ]
            : []
        })
      )
      await page.route('**/rest/v1/wms_inventory_batch?*', (route) =>
        route.fulfill({
          json: [
            {
              id: 'ordinary-batch',
              tenant_id: tenantId,
              organization_id: organizationId,
              warehouse_id: targetWarehouseId,
              material_id: 'ordinary-material',
              batch_no: 'ORDINARY-BATCH',
              pack_id: mode === 'pack' ? 'ordinary-pack' : null,
              quantity: 2,
              status: 'normal',
              project_id: null,
              construction_no: null,
              material: {
                material_name: '普通权限物料',
                material_code: 'ORDINARY-MAT',
                serial_management_enabled: mode === 'serial'
              }
            }
          ],
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
        })
      )
      const writes: Record<string, unknown>[] = []
      await page.route('**/rest/v1/wms_serial_number?*', (route) =>
        route.fulfill({
          json:
            mode === 'serial'
              ? [
                  {
                    id: 'ordinary-sn',
                    tenant_id: tenantId,
                    batch_id: 'ordinary-batch',
                    serial_no: 'ORDINARY-SN',
                    status: 'in_stock',
                    parent_serial_id: null,
                    reserved_work_order_id: null
                  }
                ]
              : []
        })
      )
      await page.route('**/rest/v1/rpc/wms_post_issue_request_secure', (route) => {
        writes.push(route.request().postDataJSON().p_payload)
        if (writes.length === 1)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '普通用户领料测试失败' }
          })
        issued = true
        return route.fulfill({ json: 'ordinary-movement' })
      })
      await page.goto('#/wms/outbound-business/outbound-request', { waitUntil: 'domcontentloaded' })
      const row = page.locator('.el-table__body tr').filter({ hasText: 'ORDINARY-APPROVED' })
      const listIssue = row.getByRole('button', { name: '办理出库', exact: true })
      await expect(listIssue).toHaveCount(scenario.allowed ? 1 : 0)
      await row.getByRole('button', { name: '查看明细', exact: true }).click()
      const drawer = page.getByRole('dialog', { name: '领料申请详情', exact: true })
      await expect(drawer.getByText('普通权限物料', { exact: true })).toBeVisible()
      const issue = drawer.getByRole('button', { name: '办理领料', exact: true })
      await expect(issue).toHaveCount(scenario.allowed ? 1 : 0)
      if (scenario.allowed) {
        await issue.click()
        const post = page
          .getByRole('dialog', { name: /办理领料|办理出库/ })
          .filter({ has: page.getByPlaceholder('选择来源库存批次') })
        await expect(post.getByPlaceholder('选择来源库存批次')).toBeVisible()
        await post.getByRole('button', { name: '取消', exact: true }).click()
        expect(writes).toHaveLength(0)
        await issue.click()
        await post.getByPlaceholder('选择来源库存批次').click()
        const picker = page.getByRole('dialog', { name: '选择领料批次', exact: true })
        await picker.getByText('普通权限物料 · ORDINARY-BATCH', { exact: true }).click()
        await picker.getByRole('button', { name: '确定', exact: true }).click()
        const quantity = post.getByRole('spinbutton', { name: /本次领料数量/ })
        if (mode === 'pack') {
          await expect(quantity).toBeDisabled()
          await expect(quantity).toHaveValue('2.000')
        } else await quantity.fill('1')
        if (mode === 'serial') {
          await post.getByRole('button', { name: '确定', exact: true }).click()
          await expect(
            page.getByText('SN 件数必须与本次领料数量一致', { exact: true })
          ).toBeVisible()
          expect(writes).toHaveLength(0)
          await post.getByPlaceholder('扫描当前批次的 SN，回车带入').fill('ORDINARY-SN')
          await post.getByRole('button', { name: '带入 SN', exact: true }).click()
        }
        await post.getByRole('textbox', { name: '领料备注', exact: true }).fill('普通权限保留输入')
        await post.getByRole('button', { name: '确定', exact: true }).click()
        await expect(page.getByText('普通用户领料测试失败', { exact: true })).toBeVisible()
        await expect(quantity).toHaveValue(`${postedQuantity}.000`)
        await expect(post.getByRole('textbox', { name: '领料备注', exact: true })).toHaveValue(
          '普通权限保留输入'
        )
        await post.getByRole('button', { name: '确定', exact: true }).click()
        await expect(post).not.toBeVisible()
        await expect(drawer.locator('li').filter({ hasText: '普通权限物料' })).toContainText(
          `已领 ${postedQuantity} / 申请 2`
        )
        await expect(drawer.getByText('ORDINARY-BATCH', { exact: true })).toBeVisible()
        expect(writes).toHaveLength(2)
        expect(writes[1]).toEqual(writes[0])
        expect(writes[1]).toMatchObject({
          line_id: 'ordinary-approved-line',
          batch_id: 'ordinary-batch',
          quantity: postedQuantity,
          serial_ids: mode === 'serial' ? ['ordinary-sn'] : [],
          remark: '普通权限保留输入'
        })
      }
      const materialName = drawer.getByText('普通权限物料', { exact: true })
      await materialName.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('ordinary-issue-detail-permission.png'),
        animations: 'disabled'
      })
      expect(writes).toHaveLength(scenario.allowed ? 2 : 0)
      await drawer.getByRole('button', { name: /关闭|Close/ }).click()
    })
  }
}

test('出库申请复制两张来源取消确认失败重试及新草稿刷新', async ({ page }, testInfo) => {
  await installSpecialFixtures(page)
  const sources = [1, 2].map((index) => ({
    id: `issue-copy-source-${index}`,
    tenant_id: tenantId,
    organization_id: organizationId,
    document_no: `ISSUE-COPY-SOURCE-${index}`,
    status: index === 1 ? 'draft' : 'approved',
    request_type: 'consumables_outbound',
    application_date: '2026-10-06',
    warehouse_id: targetWarehouseId,
    warehouse_name: '目标一仓',
    project_id: null,
    construction_no: null,
    created_at: '2026-10-06T01:00:00Z',
    requested_quantity_total: 5,
    issued_quantity_total: index === 1 ? 0 : 2
  }))
  const records = [...sources]
  await page.route('**/rest/v1/wms_issue_request_line?*', (route) => {
    const requestId = new URL(route.request().url()).searchParams
      .get('request_id')
      ?.replace('eq.', '')
    return route.fulfill({
      json: [1, 2].map((index) => ({
        id: `${requestId}-line-${index}`,
        request_id: requestId,
        material_id: `copy-material-${index}`,
        requested_quantity: index === 1 ? 2 : 3,
        issued_quantity: requestId === 'issue-copy-source-2' && index === 1 ? 2 : 0,
        material: {
          material_code: `COPY-MAT-${index}`,
          material_name: `复制验收物料${index}`,
          baseUnit: { unit_name: '件' }
        }
      }))
    })
  })
  await page.route('**/rest/v1/wms_issue_request_allocation?*', (route) => {
    const requestId = new URL(route.request().url()).searchParams
      .get('request_id')
      ?.replace('eq.', '')
    return route.fulfill({
      json:
        requestId === 'issue-copy-source-2'
          ? [
              {
                id: 'copy-source-allocation',
                request_id: requestId,
                quantity: 2,
                serial_ids: [],
                created_at: '2026-10-06T01:00:00Z',
                batch: { batch_no: 'SOURCE-ISSUED-BATCH' },
                movement: {
                  reference_no: 'SOURCE-ISSUED-MOVEMENT',
                  occurred_at: '2026-10-06T01:00:00Z'
                }
              }
            ]
          : []
    })
  })
  await page.route('**/rest/v1/wms_issue_request_list?*', (route) =>
    route.fulfill({
      json: records,
      headers: {
        'content-range': `0-${records.length - 1}/${records.length}`,
        'access-control-expose-headers': 'content-range'
      }
    })
  )
  const calls: Record<string, unknown>[] = []
  const attempts = new Map<string, number>()
  await page.route('**/rest/v1/rpc/wms_copy_issue_request_secure', (route) => {
    const payload = route.request().postDataJSON()
    calls.push(payload)
    const id = payload.p_request_id
    const attempt = (attempts.get(id) || 0) + 1
    attempts.set(id, attempt)
    if (attempt === 1)
      return route.fulfill({ status: 400, json: { code: 'P0001', message: '测试复制失败' } })
    const source = sources.find((row) => row.id === id)
    if (!source) throw new Error('Unexpected copy source')
    records.push({
      ...source,
      id: `${id}-copy`,
      document_no: `${source.document_no}-NEW`,
      status: 'draft',
      issued_quantity_total: 0
    })
    return route.fulfill({ json: null })
  })
  await page.goto('#/wms/outbound-business/outbound-request', { waitUntil: 'domcontentloaded' })
  for (const [index, source] of sources.entries()) {
    const sourceRow = page
      .locator('.el-table__body tr')
      .filter({ has: page.getByText(source.document_no, { exact: true }) })
    const copy = sourceRow.getByRole('button', { name: '复制', exact: true })
    await sourceRow.getByRole('button', { name: '查看明细', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '领料申请详情', exact: true })
    await expect(drawer.getByText('复制验收物料1', { exact: true })).toBeVisible()
    if (index === 1)
      await expect(drawer.getByText('SOURCE-ISSUED-BATCH', { exact: true })).toBeVisible()
    await drawer.getByRole('button', { name: /关闭|Close/ }).click()
    await copy.click()
    const confirmation = page.locator('.el-message-box:visible')
    await expect(confirmation).toContainText(source.document_no)
    await confirmation.getByRole('button', { name: '取消', exact: true }).click()
    expect(calls).toHaveLength(index * 2)
    await copy.click()
    await confirmation.getByRole('button', { name: '确认复制', exact: true }).click()
    await expect.poll(() => calls.length).toBe(index * 2 + 1)
    await expect(page.getByText('测试复制失败', { exact: true })).toBeVisible()
    await expect(copy).toBeEnabled()
    await expect(page.locator('.el-table__body tr')).toHaveCount(2 + index)
    await copy.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath(`issue-copy-${index + 1}-failed.png`),
      animations: 'disabled'
    })
    await copy.click()
    await confirmation.getByRole('button', { name: '确认复制', exact: true }).click()
    const clone = page
      .locator('.el-table__body tr')
      .filter({ has: page.getByText(`${source.document_no}-NEW`, { exact: true }) })
    await expect(clone.getByText('暂存', { exact: true })).toBeVisible()
    await expect(
      sourceRow.getByText(index === 0 ? '暂存' : '待领料', { exact: true })
    ).toBeVisible()
    await expect(page.locator('.el-table__body tr')).toHaveCount(3 + index)
    expect(calls[index * 2 + 1]).toEqual(calls[index * 2])
    expect(calls[index * 2 + 1]).toEqual({ p_request_id: source.id })
    await clone.getByRole('button', { name: '复制', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath(`issue-copy-${index + 1}-new-draft.png`),
      animations: 'disabled'
    })
    const cloneNumber = clone.getByText(`${source.document_no}-NEW`, { exact: true })
    await cloneNumber.scrollIntoViewIfNeeded()
    await expect(cloneNumber).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`issue-copy-${index + 1}-new-number.png`),
      animations: 'disabled'
    })
    const cloneStatus = clone.getByText('暂存', { exact: true })
    await cloneStatus.scrollIntoViewIfNeeded()
    await expect(cloneStatus).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`issue-copy-${index + 1}-new-status.png`),
      animations: 'disabled'
    })
    await clone.getByRole('button', { name: '查看明细', exact: true }).click()
    await expect(
      drawer.getByText(`${source.document_no}-NEW`, { exact: true }).first()
    ).toBeVisible()
    for (const lineIndex of [1, 2]) {
      const item = drawer
        .locator('li')
        .filter({ has: page.getByText(`复制验收物料${lineIndex}`, { exact: true }) })
      await expect(item).toContainText(`已领 0 / 申请 ${lineIndex === 1 ? 2 : 3}`)
    }
    await expect(drawer.getByRole('button', { name: '办理领料', exact: true })).toHaveCount(0)
    await expect(drawer.getByText('SOURCE-ISSUED-BATCH', { exact: true })).toHaveCount(0)
    const emptyAllocation = drawer.getByText('尚未办理领料', { exact: true })
    const scopeSummary = drawer.getByText('未关联工单 · 目标一仓 · 公共库存', { exact: true })
    await scopeSummary.scrollIntoViewIfNeeded()
    await expect(scopeSummary).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`issue-copy-${index + 1}-detail-scope.png`),
      animations: 'disabled'
    })
    await emptyAllocation.scrollIntoViewIfNeeded()
    await expect(emptyAllocation).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`issue-copy-${index + 1}-detail-bottom.png`),
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: /关闭|Close/ }).click()
  }
  expect(calls).toHaveLength(4)
})

for (const action of [
  {
    key: 'submit',
    label: '提交',
    confirm: '确认提交',
    initial: 'draft',
    next: 'submitted',
    status: '待审核',
    rpc: 'wms_submit_issue_request_secure'
  },
  {
    key: 'approve',
    label: '审核通过',
    confirm: '审核通过',
    initial: 'submitted',
    next: 'approved',
    status: '待领料',
    rpc: 'wms_review_issue_request_secure'
  },
  {
    key: 'reject',
    label: '驳回',
    confirm: '确认驳回',
    initial: 'submitted',
    next: 'rejected',
    status: '已驳回',
    rpc: 'wms_review_issue_request_secure'
  },
  {
    key: 'cancel',
    label: '取消',
    confirm: '确定取消',
    initial: 'submitted',
    next: 'cancelled',
    status: '已取消',
    rpc: 'wms_cancel_issue_request_secure'
  }
] as const) {
  for (const authority of ['super', 'ordinary', 'viewonly']) {
    if (authority === 'viewonly' && (action.key === 'reject' || action.key === 'cancel')) continue
    const testName =
      authority === 'viewonly'
        ? `viewonly出库申请${action.initial}两张单据无权操作隐藏`
        : `${authority}出库申请${action.label}两张单据取消确认及失败重试刷新`
    test(testName, async ({ page }, testInfo) => {
      await installSpecialFixtures(page)
      if (authority !== 'super')
        await installOrdinaryWmsPermissions(page, [
          'WmsIssueRequest:View',
          ...(authority === 'ordinary'
            ? [
                `WmsIssueRequest:${action.key === 'submit' ? 'Submit' : action.key === 'cancel' ? 'Cancel' : 'Approve'}`
              ]
            : [])
        ])
      const records = [1, 2].map((index) => ({
        id: `issue-workflow-${index}`,
        tenant_id: tenantId,
        organization_id: organizationId,
        document_no: `ISSUE-WORKFLOW-${index}`,
        status: action.initial as string,
        request_type: 'consumables_outbound',
        application_date: '2026-10-06',
        warehouse_id: targetWarehouseId,
        warehouse_name: '目标一仓',
        project_id: null,
        construction_no: null,
        created_at: '2026-10-06T01:00:00Z',
        requested_quantity_total: 5,
        issued_quantity_total: 0
      }))
      await page.route('**/rest/v1/wms_issue_request_list?*', (route) =>
        route.fulfill({
          json: records,
          headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
        })
      )
      const calls: Record<string, unknown>[] = []
      const attempts = new Map<string, number>()
      await page.route(`**/rest/v1/rpc/${action.rpc}`, (route) => {
        const payload = route.request().postDataJSON()
        calls.push(payload)
        const id = payload.p_request_id
        const attempt = (attempts.get(id) || 0) + 1
        attempts.set(id, attempt)
        if (attempt === 1)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: `测试${action.label}失败` }
          })
        const record = records.find((row) => row.id === id)
        if (!record) throw new Error('Unexpected request id')
        record.status = action.next
        return route.fulfill({ json: null })
      })
      await page.goto('#/wms/outbound-business/outbound-request', { waitUntil: 'domcontentloaded' })
      if (authority === 'viewonly') {
        await expect(page.locator('.el-table__body tr')).toHaveCount(2)
        for (const record of records) {
          const row = page.locator('.el-table__body tr').filter({ hasText: record.document_no })
          await expect(row.getByRole('button', { name: '查看明细', exact: true })).toBeVisible()
          for (const label of ['提交', '删除', '复制', '审核通过', '驳回', '取消', '办理出库'])
            await expect(row.getByRole('button', { name: label, exact: true })).toHaveCount(0)
        }
        await page
          .locator('.el-table__body tr')
          .last()
          .getByRole('button', { name: '查看明细', exact: true })
          .scrollIntoViewIfNeeded()
        await page.screenshot({
          path: testInfo.outputPath(`issue-${action.key}-viewonly.png`),
          animations: 'disabled'
        })
        expect(calls).toHaveLength(0)
        return
      }
      for (const [index, record] of records.entries()) {
        const row = page.locator('.el-table__body tr').filter({ hasText: record.document_no })
        await expect(row).toHaveCount(1)
        const button = row.getByRole('button', { name: action.label, exact: true })
        await button.click()
        const confirmation = page.locator('.el-message-box:visible')
        await expect(confirmation).toContainText(record.document_no)
        await confirmation.getByRole('button', { name: '取消', exact: true }).click()
        expect(calls).toHaveLength(index * 2)
        await expect(button).toBeEnabled()
        await button.click()
        await confirmation.getByRole('button', { name: action.confirm, exact: true }).click()
        await expect.poll(() => calls.length).toBe(index * 2 + 1)
        await expect(page.getByText(`测试${action.label}失败`, { exact: true })).toBeVisible()
        await expect(button).toBeEnabled()
        await button.scrollIntoViewIfNeeded()
        await expect(button).toBeInViewport()
        await page.screenshot({
          path: testInfo.outputPath(`issue-${action.key}-${index + 1}-failed.png`),
          animations: 'disabled'
        })
        await button.click()
        await confirmation.getByRole('button', { name: action.confirm, exact: true }).click()
        await expect(row.getByText(action.status, { exact: true })).toBeVisible()
        expect(calls).toHaveLength(index * 2 + 2)
        expect(calls[index * 2 + 1]).toEqual(calls[index * 2])
        expect(calls[index * 2 + 1]).toMatchObject({
          p_request_id: record.id,
          ...(['approve', 'reject'].includes(action.key) ? { p_decision: action.key } : {})
        })
        await expect(button).toHaveCount(0)
      }
    })
  }
}

test('直接调拨类型加载失败后原位重试保留业务单号', async ({ page }) => {
  test.setTimeout(120_000)
  await installSpecialFixtures(page)
  let recovered = false
  await page.route('**/rest/v1/mdm_document_type?*', (route) => {
    if (recovered) return route.fallback()
    return route.fulfill({ status: 400, json: { code: 'PGRST100', message: '暂时无法读取类型' } })
  })
  await page.goto(
    `#/wms/receipt-issue/stock-operation?movementType=transfer&warehouseId=${warehouseId}`,
    { waitUntil: 'domcontentloaded' }
  )
  await expect(page.getByText('作业基础数据加载失败，请重试后再办理。')).toBeVisible({
    timeout: 90_000
  })
  await expect(page.getByRole('button', { name: '确认记账', exact: true })).toBeDisabled()
  await page.getByPlaceholder('采购、生产或内部业务单号').fill('RETRY-REF')
  recovered = true
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(
    page.locator('.wms-stock-operation-form').getByText('直接调拨默认业务').first()
  ).toBeVisible()
  await expect(page.getByPlaceholder('采购、生产或内部业务单号')).toHaveValue('RETRY-REF')
  await expect(page.getByRole('button', { name: '确认记账', exact: true })).toBeEnabled()
})

test('分步调拨类型加载失败后重试保留来源批次和调拨原因', async ({ page }) => {
  test.setTimeout(120_000)
  await installSpecialFixtures(page)
  let recovered = false
  await page.route('**/rest/v1/mdm_document_type?*', (route) => {
    if (recovered) return route.fallback()
    return route.fulfill({ status: 400, json: { code: 'PGRST100', message: '暂时无法读取类型' } })
  })
  await page.goto('#/wms/transfer-business/step-transfer', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '新建调拨单', exact: true }).click({ timeout: 90_000 })
  const dialog = page.locator('.el-dialog:visible').first()
  await chooseBatch(page, dialog, '选择来源批次')
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled()
  await dialog.getByRole('textbox', { name: '调拨原因', exact: true }).fill('保留重试说明')
  recovered = true
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('分步调拨默认业务').first()).toBeVisible()
  await expect(dialog.getByPlaceholder('选择来源批次')).toHaveValue('岩棉板 · B-SPECIAL')
  await expect(dialog.getByRole('textbox', { name: '调拨原因', exact: true })).toHaveValue(
    '保留重试说明'
  )
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
})

test('出库申请组织加载失败后重试带入默认组织并保留说明', async ({ page }) => {
  test.setTimeout(120_000)
  await installSpecialFixtures(page)
  let recovered = false
  await page.route('**/rest/v1/mdm_organization?*', (route) => {
    if (recovered) return route.fallback()
    return route.fulfill({ status: 400, json: { code: 'PGRST100', message: '暂时无法读取组织' } })
  })
  await page.goto('#/wms/outbound-business/outbound-request', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '新增出库申请单', exact: true }).click({ timeout: 90_000 })
  const dialog = page.locator('.el-dialog:visible').first()
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled()
  await dialog.getByRole('textbox', { name: '申请说明', exact: true }).fill('保留申请说明')
  recovered = true
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('默认启用库存组织').first()).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '申请说明', exact: true })).toHaveValue(
    '保留申请说明'
  )
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
})

for (const reopen of [false, true]) {
  for (const oldFailure of [false, true]) {
    test(`出库申请${reopen ? '关闭重开同工单' : '工单切换返回原工单'}隔离旧预留${oldFailure ? '失败' : '成功'}`, async ({
      page
    }) => {
      test.setTimeout(120_000)
      await installSpecialFixtures(page)
      await page.route('**/rest/v1/rpc/wms_work_order_options_secure', (route) =>
        route.fulfill({
          json: ['A', 'B'].map((key) => ({
            id: `issue-order-${key}`,
            tenant_id: tenantId,
            organization_id: organizationId,
            work_order_no: `ISSUE-ORDER-${key}`,
            project_id: null,
            construction_no: null,
            allowed_issue_warehouse_types: ['raw_material'],
            status: 'confirmed'
          }))
        })
      )
      let release = () => {}
      const delayed = new Promise<void>((resolve) => {
        release = resolve
      })
      let reads = 0
      await page.route('**/rest/v1/wms_inventory_reservation?*', async (route) => {
        const read = ++reads
        if (read === 1) await delayed
        if (read === 1 && oldFailure)
          return route.fulfill({ status: 400, json: { code: 'P0001', message: '旧预留失败' } })
        return route.fulfill({
          json: [
            {
              material_id: material.id,
              reserved_quantity: read,
              material: { material_code: material.material_code, material_name: `预留物料-${read}` }
            }
          ]
        })
      })
      await page.goto('#/wms/outbound-business/outbound-request', { waitUntil: 'domcontentloaded' })
      await page
        .getByRole('button', { name: '新增出库申请单', exact: true })
        .click({ timeout: 90_000 })
      const dialog = page.getByRole('dialog', { name: '新增出库申请单', exact: true })
      await expect(dialog.getByText('默认启用库存组织').first()).toBeVisible()
      await choose(page, dialog, '领料仓库', '目标一仓 · RAW-B')
      await choose(page, dialog, 'MES 工单', 'ISSUE-ORDER-A')
      await expect.poll(() => reads).toBe(1)
      if (reopen) {
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await expect(dialog).toBeHidden()
        await page.getByRole('button', { name: '新增出库申请单', exact: true }).click()
        await expect(dialog.getByText('默认启用库存组织').first()).toBeVisible()
        await choose(page, dialog, '领料仓库', '目标一仓 · RAW-B')
      } else {
        await choose(page, dialog, 'MES 工单', 'ISSUE-ORDER-B')
        await expect(dialog.getByPlaceholder('按编码或名称选择物料')).toHaveValue('预留物料-2')
      }
      await choose(page, dialog, 'MES 工单', 'ISSUE-ORDER-A')
      const expectedMaterial = reopen ? '预留物料-2' : '预留物料-3'
      await expect(dialog.getByPlaceholder('按编码或名称选择物料')).toHaveValue(expectedMaterial)
      const oldResponse = page.waitForResponse('**/rest/v1/wms_inventory_reservation?*')
      release()
      await oldResponse
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      await expect(dialog.getByPlaceholder('按编码或名称选择物料')).toHaveValue(expectedMaterial)
      await expect(dialog.getByRole('button', { name: '重新加载', exact: true })).toHaveCount(0)
      await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
    })
  }
}

test('出库申请基础选项加载中及失败禁止新增且重试恢复', async ({ page }) => {
  test.setTimeout(120_000)
  await installSpecialFixtures(page)
  let release = () => {}
  const delayed = new Promise<void>((resolve) => {
    release = resolve
  })
  let failure = true
  await page.route('**/rest/v1/mdm_warehouse?*', async (route) => {
    await delayed
    if (failure)
      return route.fulfill({ status: 400, json: { code: 'P0001', message: '仓库暂不可用' } })
    return route.fallback()
  })
  await page.goto('#/wms/outbound-business/outbound-request', { waitUntil: 'domcontentloaded' })
  const create = page.getByRole('button', { name: '新增出库申请单', exact: true })
  await expect(create).toBeDisabled({ timeout: 90_000 })
  release()
  await expect(page.getByText('筛选项加载失败。', { exact: false })).toBeVisible()
  await expect(create).toBeDisabled()
  failure = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(create).toBeEnabled()
  await create.click()
  const dialog = page.getByRole('dialog', { name: '新增出库申请单', exact: true })
  await expect(dialog.getByText('默认启用库存组织').first()).toBeVisible()
  await choose(page, dialog, '领料仓库', '目标一仓 · RAW-B')
  await expect(dialog.getByText('出库申请默认单据').first()).toBeVisible()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
})
