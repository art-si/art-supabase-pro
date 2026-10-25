import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import type { WmsProjectSummary } from '../../modules/art-supabase-wms/src/api/warehouse.types'

test('项目在制材料显示净领料、扣减余额与审计流水', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  await installFixtures(page)
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
    id: 'wip-report-menu',
    parentId: root.id,
    name: 'WmsProjectReport',
    path: 'project-warehouse/project-report',
    component: '/wms/project-warehouse/project-report',
    type: 'menu',
    sort: 1,
    meta: meta('项目仓储复盘')
  }
  await mockApplicationMenus(page, {
    wms: [
      root,
      menu,
      {
        id: 'wip-report-view',
        parentId: menu.id,
        name: 'WmsProjectReport:View',
        path: '',
        component: '',
        type: 'button',
        sort: 1,
        meta: meta('查看')
      }
    ]
  })
  await page.route('**/rest/v1/mdm_project?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'project-wip',
          tenant_id: tenantId,
          project_code: 'WIP-PROJECT',
          project_name: '在制材料项目',
          enabled: true
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_project_construction?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'section-wip',
          tenant_id: tenantId,
          project_id: 'project-wip',
          construction_no: 'WIP-SECTION',
          section_name: '在制施工段',
          status: 'active'
        }
      ]
    })
  )
  const summary: WmsProjectSummary = {
    stockQuantity: 0,
    finishedStockQuantity: 0,
    finishedStockMaterialCount: 0,
    boardAreaSqm: 0,
    packCount: 0,
    materialCount: 1,
    reservedQuantity: 0,
    reservedMaterialCount: 0,
    workOrderCount: 1,
    wipQuantity: 0,
    issuedQuantity: 6,
    issuedMaterialCount: 1,
    shippedQuantity: 0,
    shippedMaterialCount: 0,
    returnedQuantity: 2,
    netShippedQuantity: 0,
    serialCount: 0,
    movementCount: 3
  }
  await page.route('**/rest/v1/rpc/wms_project_summary_secure', (route) =>
    route.fulfill({ json: summary })
  )
  let wipRequests = 0
  await page.route('**/rest/v1/rpc/wms_project_material_wip_page_secure', (route) => {
    wipRequests++
    if (wipRequests === 1)
      return route.fulfill({ status: 503, json: { code: 'PGRST000', message: 'temporary' } })
    return route.fulfill({
      json: {
        data: [
          {
            id: 'issue-line-wip',
            issueLineId: 'issue-line-wip',
            sourceLineNo: 'BOM-10',
            issueDocumentNo: 'LL-2026-001',
            workOrderNo: 'WO-2026-001',
            constructionNo: 'WIP-SECTION',
            materialCode: 'MAT-WIP-01',
            materialName: '在制板材',
            quantityUnitName: '件',
            issuedQuantity: 6,
            returnedQuantity: 2,
            netIssuedQuantity: 4,
            consumedQuantity: 1.5,
            wipQuantity: 2.5,
            lastAdjustedAt: '2026-10-20T01:02:03Z'
          }
        ],
        total: 1
      }
    })
  })
  await page.route('**/rest/v1/rpc/wms_production_wip_history_secure', (route) =>
    route.fulfill({
      json: [
        {
          id: 'wip-event-1',
          eventKind: 'inbound_approved',
          quantityDelta: 2,
          netIssuedQuantity: 4,
          approvedNetInboundQuantity: 50,
          orderQuantity: 100,
          consumedTargetQuantity: 2,
          eventDocumentNo: 'RK-2026-001',
          eventLineNo: null,
          createdAt: '2026-10-20T01:02:03Z',
          createBy: null
        },
        {
          id: 'wip-event-2',
          eventKind: 'material_return_posted',
          quantityDelta: -0.5,
          netIssuedQuantity: 4,
          approvedNetInboundQuantity: 50,
          orderQuantity: 100,
          consumedTargetQuantity: 1.5,
          eventDocumentNo: 'TL-2026-001',
          eventLineNo: 10,
          createdAt: '2026-10-20T02:02:03Z',
          createBy: null
        }
      ]
    })
  )

  await page.goto('#/wms/project-warehouse/project-report')
  const tutorialDismiss = page.getByRole('button', { name: '知道了' })
  if (await tutorialDismiss.isVisible()) await tutorialDismiss.click()
  await page.getByRole('combobox', { name: /^项目名称/ }).click()
  await page.getByRole('option', { name: '在制材料项目 · WIP-PROJECT', exact: true }).click()
  await page.getByRole('tab', { name: '在制材料', exact: true }).click()
  await expect(page.getByText('数据加载失败')).toBeVisible()
  await page.getByRole('button', { name: '重新加载' }).click()

  const table = page.locator('.el-table').last()
  await expect(table.getByRole('columnheader', { name: '实际净领料' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: '累计扣减' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: '当前材料在制' })).toBeVisible()
  await expect(table.getByText('在制板材')).toBeVisible()
  await expect(table.getByText('2.5 件', { exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: /^项目名称/ })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('material-wip-table.png'),
    animations: 'disabled'
  })

  await table.getByRole('button', { name: '扣减记录' }).click()
  const drawer = page.getByRole('dialog', { name: '在制材料扣减记录' })
  await expect(drawer.getByText('RK-2026-001')).toBeVisible()
  await expect(drawer.getByText('TL-2026-001')).toBeVisible()
  await expect(drawer.getByText('冲回')).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('material-wip-history.png'),
    animations: 'disabled'
  })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)
})
