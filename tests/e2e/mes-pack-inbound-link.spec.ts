import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

test('工单排包入库明细链接', async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  const tenant = await prepareIsolatedSession(page)
  const menuMeta = (title: string) => ({ title, roles: ['R_SUPER'], is_enable: true })
  const menu = (
    id: string,
    parentId: string | null,
    name: string,
    path: string,
    type: 'folder' | 'menu' | 'button',
    title: string
  ) => ({
    id,
    parentId,
    name,
    path,
    component:
      type === 'menu'
        ? name === 'MesWorkOrder'
          ? '/mes/production-plan/work-order'
          : '/wms/production-inout/finished-inbound'
        : parentId === null
          ? '/index/index'
          : '',
    type,
    sort: 1,
    meta: menuMeta(title)
  })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'mes', name: '制造执行', baseUrl: '/mes/' },
        { code: 'wms', name: '仓储', baseUrl: '/wms/' }
      ]
    })
  )
  await mockApplicationMenus(page, {
    mes: [
      menu('mes-root', null, 'MesRoot', '/mes', 'folder', '制造执行'),
      menu('mes-plan', 'mes-root', 'MesProductionPlan', 'production-plan', 'folder', '生产计划'),
      menu('mes-order', 'mes-plan', 'MesWorkOrder', 'work-order', 'menu', '生产工单'),
      menu('mes-order-view', 'mes-order', 'MesWorkOrder:View', '', 'button', '查看')
    ],
    wms: [
      menu('wms-root', null, 'WmsRoot', '/wms', 'folder', '仓储'),
      menu(
        'wms-production',
        'wms-root',
        'WmsProductionInout',
        'production-inout',
        'folder',
        '生产出入库'
      ),
      menu(
        'wms-finished',
        'wms-production',
        'WmsFinishedInbound',
        'finished-inbound',
        'menu',
        '完工入库单'
      ),
      menu('wms-finished-view', 'wms-finished', 'WmsFinishedInbound:View', '', 'button', '查看')
    ]
  })
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'permission-test-user',
        user_name: '测试用户',
        user_type: '1',
        user_roles: ['R_SUPER'],
        status: '1',
        tenant_id: tenant.id,
        tenant
      }
    })
  )
  await page.route('**/rest/v1/mes_work_order?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'mes-pack-test-order',
          tenant_id: tenant.id,
          work_order_no: 'QA-PACK-ORDER-001',
          work_order_type_id: null,
          material_id: 'mes-pack-test-material',
          material_code_snapshot: 'MAT-QA-001',
          material_name_snapshot: '测试板材',
          specification_snapshot: '1000 × 50',
          unit_snapshot: '块',
          project_name_snapshot: '测试项目',
          order_quantity: 5,
          completed_quantity: 2,
          warehoused_quantity: 2,
          packing_enabled_snapshot: true,
          extension_values: {},
          extension_schema_snapshot: [],
          details: [],
          bom_snapshot: [],
          route_snapshot: {},
          status: 'confirmed',
          order_status: 'REL',
          urgency: 'normal',
          source: 'manual',
          planned_end_date: '2026-10-20',
          update_time: '2026-10-20T08:00:00Z'
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.route('**/rest/v1/rpc/wms_work_order_pack_inbound_secure', (route) =>
    route.fulfill({
      json: [
        {
          line_id: 'mes-pack-test-line',
          pack_id: 'mes-pack-test-pack',
          pack_no: 'PK-QA-001',
          document_id: 'mes-pack-test-document',
          document_no: 'QA-FINISH-001',
          business_date: '2026-10-20',
          line_no: 10,
          inbound_quantity: 2,
          returned_quantity: 1,
          net_quantity: 1
        }
      ]
    })
  )

  await page.goto('#/mes/production-plan/work-order', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'QA-PACK-ORDER-001', exact: true })).toBeVisible({
    timeout: 120_000
  })
  await page
    .getByRole('row', { name: /QA-PACK-ORDER-001/ })
    .getByRole('button', { name: '查看', exact: true })
    .click()
  const detail = page.getByRole('dialog', { name: '工单详情' })
  await expect(detail).toBeVisible({ timeout: 120_000 })
  await expect(
    detail.getByRole('button', { name: '查看工单 QA-PACK-ORDER-001 的排包入库明细' })
  ).toBeVisible()
  await detail.getByRole('button', { name: '查看工单 QA-PACK-ORDER-001 的排包入库明细' }).click()
  const inbound = page.getByRole('dialog', { name: '排包入库明细' })
  await expect(inbound.getByText('PK-QA-001', { exact: true })).toBeVisible()
  await expect(inbound.getByText('QA-FINISH-001', { exact: true })).toBeVisible()
  const netHeading = inbound.getByRole('columnheader', { name: '净入库数量', exact: true })
  const netIndex = await netHeading.evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
  await expect(
    inbound.locator('.el-table__body tr').first().locator('td').nth(netIndex)
  ).toHaveText('1')
  await inbound.screenshot({
    path: testInfo.outputPath('work-order-pack-inbound.png'),
    animations: 'disabled'
  })
  await inbound.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect(netHeading).toBeInViewport()
  await inbound.screenshot({
    path: testInfo.outputPath('work-order-pack-inbound-right.png'),
    animations: 'disabled'
  })
  await inbound.getByRole('button', { name: 'QA-FINISH-001' }).click()
  await expect(page).toHaveURL(
    /\/wms\/production-inout\/finished-inbound.*documentId=mes-pack-test-document/
  )
})
