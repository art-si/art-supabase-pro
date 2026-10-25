import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareAppearance } from './support/appearance'

for (const oldOutcome of ['success', 'failure'] as const) {
  test(`库存组装菜单两张详情失败重试及旧${oldOutcome}隔离`, async ({ page }, testInfo) => {
    await installFixtures(page)
    await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
    await page.route('**/rpc/get_accessible_applications', (route) =>
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
          id: 'assembly-menu',
          parentId: null,
          name: 'WmsAssembly',
          path: '/wms/adjustment-business/assembly',
          component: '/wms/adjustment-business/assembly',
          type: 'menu',
          sort: 1,
          meta: meta('库存组装')
        },
        {
          id: 'assembly-view',
          parentId: 'assembly-menu',
          name: 'WmsAssembly:View',
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta('查看')
        }
      ]
    })
    await page.route('**/rest/v1/wms_assembly_document?*', (route) =>
      route.fulfill({
        json: ['a', 'b'].map((key) => ({
          id: `assembly-${key}`,
          tenant_id: tenantId,
          document_no: `ASSEMBLY-${key.toUpperCase()}`,
          warehouse_id: 'warehouse-test',
          organization_id: 'org-test',
          project_id: null,
          construction_no: null,
          target_material_id: 'finished-test',
          target_batch_id: `finished-${key}`,
          target_quantity: 2,
          target_area_sqm: null,
          total_cost: 20,
          remark: `组装${key}说明`,
          created_at: '2026-10-06T01:00:00Z',
          warehouse: { warehouse_code: 'WH-TEST', warehouse_name: '测试组装仓库' },
          targetMaterial: { material_code: 'FINISHED-001', material_name: '测试组装成品' },
          targetBatch: {
            batch_no: `FINISHED-${key}`,
            length_mm: 1200,
            width_mm: 600,
            thickness_mm: 50
          }
        })),
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
      })
    )
    let held = false
    let recovered = false
    let release = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/rest/v1/wms_assembly_component?*', async (route) => {
      const old = new URL(route.request().url()).searchParams.get('assembly_id') === 'eq.assembly-a'
      if (old) {
        held = true
        await pending
      }
      if ((old && oldOutcome === 'failure') || (!old && !recovered))
        return route.fulfill({ status: 400, json: { code: 'P0001', message: '测试组件读取失败' } })
      return route.fulfill({
        json: [1, 2].map((index) => ({
          id: `${old ? 'old' : 'current'}-${index}`,
          quantity: index,
          material: {
            material_code: `MAT-${index}`,
            material_name: `${old ? '旧' : '当前'}组装组件${index}`
          },
          sourceBatch: { batch_no: `SOURCE-${index}`, bin: { bin_code: `BIN-${index}` } }
        }))
      })
    })
    await page.goto('#/wms/adjustment-business/assembly', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '库存组装', exact: true })).toBeVisible()
    const row = (number: string) => page.locator('.el-table__body tr').filter({ hasText: number })
    await row('ASSEMBLY-A').getByRole('button', { name: '详情', exact: true }).click()
    await expect.poll(() => held).toBe(true)
    const drawer = page.getByRole('dialog', { name: '组装单详情', exact: true })
    await drawer.getByRole('button', { name: /关闭|Close/ }).click()
    await row('ASSEMBLY-B').getByRole('button', { name: '详情', exact: true }).click()
    await expect(drawer.getByText('组件明细加载失败，请重试', { exact: true })).toBeVisible()
    recovered = true
    await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(drawer.getByText('当前组装组件2', { exact: true })).toBeVisible()
    const response = page.waitForResponse(
      (item) =>
        item.url().includes('wms_assembly_component') &&
        new URL(item.url()).searchParams.get('assembly_id') === 'eq.assembly-a'
    )
    release()
    await (await response).finished()
    await expect(drawer.getByText('旧组装组件1', { exact: true })).not.toBeVisible()
    await expect(drawer.getByText('当前组装组件2', { exact: true })).toBeVisible()
    await expect(drawer.getByText('组件明细加载失败，请重试', { exact: true })).not.toBeVisible()
    const dimensions = drawer.getByText(/长 1200 × 宽 600 × 厚 50 mm/)
    await dimensions.scrollIntoViewIfNeeded()
    await expect(dimensions).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath('assembly-menu-current-detail.png'),
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: /关闭|Close/ }).click()
    await expect(row('ASSEMBLY-B')).toBeVisible()
  })
}
