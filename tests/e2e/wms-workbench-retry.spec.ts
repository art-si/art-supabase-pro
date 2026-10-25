import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test('仓储工作台刷新失败清理旧统计并原位恢复', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await installFixtures(page)
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '平台', baseUrl: '/' },
        { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
      ]
    })
  )
  await mockApplicationMenus(page, {
    wms: [
      {
        id: 'root',
        parentId: null,
        name: 'WmsWarehouseManagement',
        path: '/wms',
        component: '/index/index',
        type: 'folder',
        sort: 1,
        meta: meta('WMS仓储管理')
      },
      {
        id: 'workbench',
        parentId: 'root',
        name: 'WmsWorkbench',
        path: 'workbench',
        component: '/wms/workbench',
        type: 'menu',
        sort: 1,
        meta: meta('仓储工作台')
      }
    ]
  })
  let failed = false
  for (const table of [
    'wms_inventory_batch',
    'wms_serial_number',
    'wms_inventory_reservation',
    'scm_receipt_target_document'
  ]) {
    await page.route(`**/rest/v1/${table}?*`, (route) =>
      route.fulfill(
        failed
          ? { status: 503, body: '' }
          : {
              status: 200,
              headers: {
                'content-range': '0-76/77',
                'access-control-expose-headers': 'content-range'
              },
              body: ''
            }
      )
    )
  }
  await page.goto('#/wms/workbench')
  await expect(page.getByRole('heading', { name: '仓储运营工作台', exact: true })).toBeVisible({
    timeout: 120_000
  })
  const metrics = page.getByLabel('业务概览', { exact: true })
  await expect(metrics.getByText('77', { exact: true })).toHaveCount(4)
  const entries = [
    ['收料入库', '/wms/receipt-issue/receipt-inbound'],
    ['即时库存', '/wms/inventory-trace/stock'],
    ['库存作业', '/wms/receipt-issue/stock-operation'],
    ['领料申请', '/wms/outbound-business/outbound-request'],
    ['销售退货入库', '/wms/receipt-issue/sales-return'],
    ['直接调拨', '/wms/transfer-business/direct-transfer'],
    ['分步调拨', '/wms/transfer-business/step-transfer'],
    ['库存盘点', '/wms/count-business/count'],
    ['库存调整', '/wms/adjustment-business/adjustment'],
    ['库存组装', '/wms/adjustment-business/assembly'],
    ['项目施工号', '/wms/project-warehouse/project-section'],
    ['序列号追溯', '/wms/inventory-trace/serial-trace'],
    ['库存流水', '/wms/inventory-trace/inventory-ledger'],
    ['项目仓储复盘', '/wms/project-warehouse/project-report']
  ]
  for (const [title, path] of entries) {
    const link = page.getByRole('link').filter({ has: page.getByText(title, { exact: true }) })
    await expect(link).toHaveAttribute('href', `#${path}`)
    expect(
      await link.evaluate((element) => {
        const titleElement = element.querySelector('strong')!
        const titleBounds = titleElement.getBoundingClientRect()
        const linkBounds = element.getBoundingClientRect()
        return (
          titleElement.scrollWidth <= titleElement.clientWidth &&
          titleBounds.left >= linkBounds.left &&
          titleBounds.right <= linkBounds.right
        )
      })
    ).toBe(true)
  }
  failed = true
  await page.getByLabel('页面操作', { exact: true }).getByRole('button').click()
  await expect(
    page.getByText('仓储概览加载失败，业务页面仍可使用。', { exact: false })
  ).toBeVisible()
  await expect(metrics.getByText('77', { exact: true })).toHaveCount(0)
  expect(
    await page.locator('.el-alert').evaluate((el) => el.getBoundingClientRect().height)
  ).toBeGreaterThanOrEqual(40)
  await page.screenshot({
    path: testInfo.outputPath('workbench-error.png'),
    animations: 'disabled'
  })
  failed = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(metrics.getByText('77', { exact: true })).toHaveCount(4)
  await page.screenshot({
    path: testInfo.outputPath('workbench-recovered.png'),
    animations: 'disabled'
  })
})

for (const authority of ['super', 'ordinary', 'ordinary-none', 'ordinary-partial'] as const) {
  test(`${authority}仓储工作台${authority === 'ordinary-none' || authority === 'ordinary-partial' ? '按权限过滤快捷入口' : '全部快捷入口可进入对应页面'}`, async ({
    page
  }, testInfo) => {
    test.setTimeout(180_000)
    await installFixtures(page)
    await page.route('**/rest/v1/rpc/wms_inventory_report_secure', (route) =>
      route.fulfill({ json: { data: [], total: 0, navigation: [] } })
    )
    await page.route('**/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '平台', baseUrl: '/' },
          { code: 'wms', name: 'WMS', baseUrl: '/wms/' }
        ]
      })
    )
    const scopedRequests: string[] = []
    if (authority.startsWith('ordinary')) {
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
      for (const table of [
        'wms_inventory_batch',
        'wms_serial_number',
        'wms_inventory_reservation',
        'scm_receipt_target_document'
      ]) {
        await page.route(`**/rest/v1/${table}?*`, (route) => {
          if (route.request().method() === 'HEAD') scopedRequests.push(route.request().url())
          return route.fulfill({
            json: [],
            headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
          })
        })
      }
    }
    const destinations = [
      ['收料入库', 'receipt-issue/receipt-inbound', 'WmsReceiptInbound'],
      ['即时库存', 'inventory-trace/stock', 'WmsStock'],
      ['库存作业', 'receipt-issue/stock-operation', 'WmsStockOperation'],
      ['领料申请', 'outbound-business/outbound-request', 'WmsIssueRequest'],
      ['销售退货入库', 'receipt-issue/sales-return', 'WmsSalesReturn'],
      ['直接调拨', 'transfer-business/direct-transfer', 'WmsDirectTransfer'],
      ['分步调拨', 'transfer-business/step-transfer', 'WmsTransfer'],
      ['库存盘点', 'count-business/count', 'WmsCount'],
      ['库存调整', 'adjustment-business/adjustment', 'WmsAdjustment'],
      ['库存组装', 'adjustment-business/assembly', 'WmsAssembly'],
      ['项目施工号', 'project-warehouse/project-section', 'WmsProjectSection'],
      ['序列号追溯', 'inventory-trace/serial-trace', 'WmsSerialTrace'],
      ['库存流水', 'inventory-trace/inventory-ledger', 'WmsInventoryLedger'],
      ['项目仓储复盘', 'project-warehouse/project-report', 'WmsProjectReport']
    ]
    await mockApplicationMenus(page, {
      wms: [
        {
          id: 'root',
          parentId: null,
          name: 'WmsWarehouseManagement',
          path: '/wms',
          component: '/index/index',
          type: 'folder',
          sort: 1,
          meta: meta('WMS')
        },
        {
          id: 'workbench',
          parentId: 'root',
          name: 'WmsWorkbench',
          path: 'workbench',
          component: '/wms/workbench',
          type: 'menu',
          sort: 1,
          meta: meta('仓储工作台')
        },
        ...destinations.flatMap(([title, path, name], index) => [
          {
            id: name,
            parentId: 'root',
            name,
            path,
            component: `/wms/${path}`,
            type: 'menu',
            sort: index + 2,
            meta: meta(title)
          },
          ...(authority === 'ordinary-none' ||
          (authority === 'ordinary-partial' && !['WmsStock', 'WmsSerialTrace'].includes(name))
            ? []
            : [
                {
                  id: `${name}-view`,
                  parentId: name,
                  name: `${name}:View`,
                  path: '',
                  component: '',
                  type: 'button',
                  sort: 1,
                  meta: meta('查看')
                }
              ])
        ])
      ]
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('#/wms/workbench')
    await expect(page.getByRole('heading', { name: '仓储运营工作台', exact: true })).toBeVisible()
    if (authority === 'ordinary-none' || authority === 'ordinary-partial') {
      for (const [title, , name] of destinations) {
        const link = page
          .getByRole('link')
          .filter({ has: page.locator('strong').getByText(title, { exact: true }) })
        const allowed =
          authority === 'ordinary-partial' && ['WmsStock', 'WmsSerialTrace'].includes(name)
        await expect(link).toHaveCount(allowed ? 1 : 0)
      }
      if (authority === 'ordinary-none') {
        await expect(page.getByText('暂无可用作业入口', { exact: true })).toBeVisible()
        await expect(
          page.getByText('请联系管理员为当前角色配置仓储作业权限。', { exact: true })
        ).toBeVisible()
      } else {
        await expect(page.getByText('暂无可用作业入口', { exact: true })).toHaveCount(0)
      }
      await page.screenshot({
        path: testInfo.outputPath('workbench-permission-entries.png'),
        animations: 'disabled'
      })
    }
    for (const [title, path, name] of destinations) {
      if (
        authority === 'ordinary-none' ||
        (authority === 'ordinary-partial' && !['WmsStock', 'WmsSerialTrace'].includes(name))
      )
        continue
      await expect(page.getByRole('heading', { name: '仓储运营工作台', exact: true })).toBeVisible()
      const link = page
        .getByRole('link')
        .filter({ has: page.locator('strong').getByText(title, { exact: true }) })
      await link.click()
      await expect(page).toHaveURL(new RegExp(`#/wms/${path}$`), { timeout: 120_000 })
      await expect(
        page.getByRole('heading', {
          name: title === '领料申请' ? '出库申请单' : title,
          exact: true
        })
      ).toBeVisible()
      await expect(page.locator('.business-workspace-page').last()).toBeVisible()
      await expect(page.getByText('暂无访问权限', { exact: true })).toHaveCount(0)
      if (title === '即时库存') {
        await expect(page.getByText('当前范围暂无即时库存数据', { exact: true })).toBeVisible()
      }
      await page.screenshot({
        path: testInfo.outputPath(`${path.replaceAll('/', '-')}.png`),
        animations: 'disabled'
      })
      await page.goto('#/wms/workbench')
    }
    expect(errors).toEqual([])
    if (authority.startsWith('ordinary')) {
      expect(scopedRequests.length).toBeGreaterThanOrEqual(4)
      for (const url of scopedRequests)
        expect(new URL(url).searchParams.get('tenant_id')).toBe(`eq.${tenantId}`)
    }
  })
}
