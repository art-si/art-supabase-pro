import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

test('车辆业务表单只查询已审批车辆，加载失败后可重试', async ({ page }) => {
  test.setTimeout(180_000)
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'vms', name: '测试车辆管理', baseUrl: '/vms/' }] })
  )
  const menu = {
    id: 'vehicle-inspection-menu',
    parentId: null,
    name: 'VehicleInspection',
    path: '/vms/vehicle-manage/vehicle-inspection',
    component: '/vms/vehicle-manage/vehicle-inspection',
    type: 'menu',
    sort: 1,
    meta: { title: '车辆年检', is_enable: true, is_hide: false, roles: [] }
  }
  await mockApplicationMenus(page, {
    vms: [
      menu,
      {
        ...menu,
        id: `${menu.id}-add`,
        parentId: menu.id,
        name: 'VehicleInspection:Add',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  await page.route('**/rest/v1/rpc/vms_list_vehicle_inspections_secure', (route) =>
    route.fulfill({ json: { records: [], total: 0, fieldAccess: {} } })
  )
  await page.route('**/rest/v1/sys_document_number_rule?*', (route) => route.fulfill({ json: [] }))

  const vehicleRequests: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/vms_list_vehicle_archives_secure', (route) => {
    vehicleRequests.push(route.request().postDataJSON())
    if (vehicleRequests.length === 1) {
      return route.fulfill({
        status: 503,
        json: { code: 'PGRST500', message: 'vehicle archive temporarily unavailable' }
      })
    }
    return route.fulfill({
      json: {
        records: [
          {
            id: 'vehicle-approved',
            tenantId: 'permission-test-tenant',
            plateNo: '粤A12345',
            companyName: '测试运输公司',
            auditStatus: 'approved'
          }
        ],
        total: 1,
        fieldAccess: {}
      }
    })
  })

  await page.goto('#/vms/vehicle-manage/vehicle-inspection', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '车辆年检', exact: true })).toBeVisible({
    timeout: 120_000
  })
  await page.getByRole('button', { name: '新增', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '新增车辆年检' })).toBeVisible()
  await page.getByPlaceholder('请选择', { exact: true }).click()
  const vehicleDialog = page.getByRole('dialog', { name: '选择车辆' })
  await expect(vehicleDialog).toBeVisible()
  await expect.poll(() => vehicleRequests.length).toBe(1)
  await expect(vehicleDialog.getByText('数量暂不可用', { exact: true })).toBeVisible()
  await expect(vehicleDialog.getByText('可选数据加载失败', { exact: true })).toBeVisible()
  await expect(vehicleDialog.getByText('粤A12345', { exact: true })).toHaveCount(0)
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(vehicleDialog.getByRole('button', { name: '确定' })).toBeDisabled()

  await vehicleDialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('粤A12345', { exact: true })).toBeVisible()
  await expect.poll(() => vehicleRequests.length).toBe(2)
  await expect(vehicleDialog.getByText('数量暂不可用', { exact: true })).toHaveCount(0)
  await expect(vehicleDialog.getByRole('button', { name: '确定' })).toBeEnabled()
  expect(vehicleRequests[0]).toMatchObject({
    p_from: 0,
    p_to: 9,
    p_audit_status: 'approved',
    p_purpose: 'list'
  })
  expect(vehicleRequests[1]).toMatchObject(vehicleRequests[0])
})
