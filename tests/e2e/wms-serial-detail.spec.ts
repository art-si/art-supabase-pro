import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test('SN 详情错误重试、长流水与切换后旧请求隔离', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
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
    id: 'trace-menu',
    parentId: root.id,
    name: 'WmsSerialTrace',
    path: 'inventory-trace/serial-trace',
    component: '/wms/inventory-trace/serial-trace',
    type: 'menu',
    sort: 1,
    meta: meta('序列号追溯')
  }
  await mockApplicationMenus(page, {
    wms: [
      root,
      menu,
      {
        id: 'trace-view',
        parentId: menu.id,
        name: 'WmsSerialTrace:View',
        path: '',
        component: '',
        type: 'button',
        sort: 1,
        meta: meta('查看')
      }
    ]
  })
  let fail = true
  let showChild = false
  let parentFailed = true
  let hold = false
  let release: (() => void) | undefined
  let pending = 0
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const rows = ['A', 'B'].map((name) => ({
    id: `serial-${name}`,
    tenant_id: tenantId,
    serial_no: `TEST-SN-${name}`,
    parent_serial_id: `parent-${name}`,
    status: 'in_stock',
    material_id: name === 'B' ? '77777777-7777-4777-8777-777777777777' : 'material-test',
    material: name === 'B' ? null : { material_code: 'TEST-MAT', material_name: '测试追溯物料' }
  }))
  await page.route('**/rest/v1/wms_serial_number?*', async (route) => {
    const query = new URL(route.request().url()).searchParams
    if (query.get('select') === 'id,tenant_id,serial_no') {
      expect(query.get('id')).toBe('in.(parent-A,parent-B)')
      if (parentFailed) {
        return route.fulfill({ status: 400, json: { code: 'XX000', message: '测试父件加载失败' } })
      }
      return route.fulfill({
        json: [
          { id: 'parent-A', tenant_id: tenantId, serial_no: 'TEST-PARENT-A' },
          { id: 'parent-B', tenant_id: 'other-tenant', serial_no: '不应显示的跨租户父件' }
        ]
      })
    }
    const parent = query.get('parent_serial_id')
    if (!parent) expect(query.get('select')).not.toContain('parent:wms_serial_number')
    if (!parent) return route.fulfill({ json: rows, headers: { 'content-range': '0-1/2' } })
    if (hold && parent === 'eq.serial-A') {
      pending += 1
      await held
      return route.fulfill({
        json: [{ id: 'stale-child', serial_no: '不应显示的旧子件', status: 'in_stock' }]
      })
    }
    return route.fulfill(
      fail
        ? { status: 503, json: { message: '测试子件读取失败', code: 'XX000' } }
        : {
            json: showChild
              ? [{ id: 'current-child', serial_no: '当前子件', status: 'in_stock' }]
              : []
          }
    )
  })
  const longReference = 'TEST-REFERENCE-' + '0123456789'.repeat(12)
  const movementOffsets: number[] = []
  await page.route('**/rest/v1/wms_serial_movement?*', async (route) => {
    const url = new URL(route.request().url())
    const serial = url.searchParams.get('serial_id')
    const offset = Number(url.searchParams.get('offset') ?? 0)
    expect(url.searchParams.get('limit')).toBe('20')
    expect(url.searchParams.get('order')).toBe('created_at.desc,id.asc')
    expect(route.request().headers().prefer).toContain('count=exact')
    movementOffsets.push(offset)
    if (hold && serial === 'eq.serial-A') {
      pending += 1
      await held
      return route.fulfill({
        json: [{ id: 'stale-move', movement: { reference_no: '不应显示的旧流水' } }]
      })
    }
    return route.fulfill(
      fail
        ? { status: 503, json: { message: '测试流水读取失败', code: 'XX000' } }
        : {
            headers: {
              'content-range': `${offset}-${Math.min(offset + 19, 60)}/61`,
              'access-control-expose-headers': 'content-range'
            },
            json: Array.from({ length: Math.min(20, 61 - offset) }, (_, index) => ({
              id: `move-test-${offset + index}`,
              created_at: '2026-10-05T10:00:00+08:00',
              movement: {
                movement_type: 'purchase_in',
                reference_no:
                  offset + index === 0 ? longReference : `TEST-MOVEMENT-${offset + index + 1}`,
                occurred_at: '2026-10-05T10:00:00+08:00'
              }
            }))
          }
    )
  })
  await page.goto('#/wms/inventory-trace/serial-trace')
  await expect(page.getByText('以一物一码串联库存组织', { exact: false })).toBeVisible({
    timeout: 30_000
  })
  await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
  parentFailed = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  const rowA = page.locator('.el-table__body tr').filter({ hasText: 'TEST-SN-A' })
  const rowB = page.locator('.el-table__body tr').filter({ hasText: 'TEST-SN-B' })
  await expect(rowA).toContainText('TEST-PARENT-A')
  await expect(rowB).toContainText('父件资料不可用')
  await expect(rowB).toContainText('物料资料不可用')
  await expect(rowB).not.toContainText('77777777-7777-4777-8777-777777777777')
  await rowB.getByText('物料资料不可用', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('serial-missing-material.png'),
    animations: 'disabled'
  })
  await expect(page.getByText('不应显示的跨租户父件', { exact: true })).toHaveCount(0)
  await rowA.getByRole('button', { name: '追溯', exact: true }).click()
  const drawer = page.locator('.el-drawer:visible')
  await expect(drawer.getByText('子件加载失败，请重试', { exact: true })).toBeVisible()
  await expect(drawer.getByText('流水加载失败，请重试', { exact: true })).toBeVisible()
  fail = false
  showChild = true
  movementOffsets.length = 0
  for (const title of ['装配子件', '逐件业务流水']) {
    await drawer
      .locator('.art-section-card')
      .filter({ hasText: title })
      .getByRole('button', { name: '重新加载', exact: true })
      .click()
  }
  const childrenCard = drawer.locator('.art-section-card').filter({ hasText: '装配子件' })
  await expect(childrenCard.getByText('当前子件', { exact: true })).toBeVisible()
  await expect(childrenCard.getByText('在库', { exact: true })).toBeVisible()
  await childrenCard.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('serial-child-status.png'),
    animations: 'disabled'
  })
  showChild = false
  const reference = drawer.getByText(longReference, { exact: false })
  await expect(reference).toBeVisible()
  await expect(reference).toContainText('采购入库')
  await reference.scrollIntoViewIfNeeded()
  expect(await drawer.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
    1
  )
  await page.screenshot({
    path: testInfo.outputPath('serial-long-movement.png'),
    animations: 'disabled'
  })
  const movementCard = drawer.locator('.art-section-card').filter({ hasText: '逐件业务流水' })
  await expect(movementCard.locator('li:has(time)')).toHaveCount(20)
  const nextMovement = movementCard.getByRole('button', { name: /next page|下一页/i })
  for (let pageIndex = 0; pageIndex < 3; pageIndex++) await nextMovement.click()
  await expect(movementCard.locator('li:has(time)')).toHaveCount(1)
  await expect(movementCard.getByText('TEST-MOVEMENT-61', { exact: false })).toBeVisible()
  await expect(nextMovement).toBeDisabled()
  expect(movementOffsets).toEqual([0, 20, 40, 60])
  await nextMovement.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('serial-movement-last-page.png'),
    animations: 'disabled'
  })
  await drawer.getByRole('button', { name: /关闭.*对话框|Close this dialog/, exact: true }).click()
  hold = true
  await rowA.getByRole('button', { name: '追溯', exact: true }).click()
  await expect.poll(() => pending).toBe(2)
  await drawer.getByRole('button', { name: /关闭.*对话框|Close this dialog/, exact: true }).click()
  await rowB.getByRole('button', { name: '追溯', exact: true }).click()
  await expect(drawer.getByText('TEST-SN-B', { exact: true }).first()).toBeVisible()
  await expect(drawer.getByText('父件：父件资料不可用', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('serial-parent-unavailable.png'),
    animations: 'disabled'
  })
  await expect(drawer.getByText('暂无绑定子件', { exact: true })).toBeVisible()
  const lateResponses = Promise.all([
    page
      .waitForResponse(
        (response) =>
          response.url().includes('wms_serial_number') &&
          new URL(response.url()).searchParams.get('parent_serial_id') === 'eq.serial-A'
      )
      .then((response) => response.finished()),
    page
      .waitForResponse(
        (response) =>
          response.url().includes('wms_serial_movement') &&
          new URL(response.url()).searchParams.get('serial_id') === 'eq.serial-A'
      )
      .then((response) => response.finished())
  ])
  release?.()
  await lateResponses
  await expect(reference).toBeVisible()
  await expect(drawer.getByText('不应显示的旧子件', { exact: true })).toHaveCount(0)
  await expect(drawer.getByText('不应显示的旧流水', { exact: false })).toHaveCount(0)
  await drawer.getByRole('button', { name: /关闭.*对话框|Close this dialog/, exact: true }).click()
})
