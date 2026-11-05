import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

const vehicleId = 'tractor-1'
const vehicle = {
  id: vehicleId,
  plateNo: '冀A00001',
  companyName: '测试物流公司',
  vehicleOwnership: 'self_operated',
  vehicleType: '半挂车',
  isNewEnergy: false,
  fieldAccess: { documents: 'read' }
}

for (const ownership of [
  {
    name: '承运商车辆抬头显示关联承运商',
    vehicleOwnership: 'carrier',
    ownerName: '验收承运商（华东区域干线运输服务有限公司）',
    carrierName: '验收承运商（华东区域干线运输服务有限公司）',
    companyName: '旧所属公司'
  },
  {
    name: '自营车辆抬头显示所属公司',
    vehicleOwnership: 'self_operated',
    ownerName: '测试物流公司',
    carrierName: '不应显示的承运商',
    companyName: '测试物流公司'
  }
] as const) {
  test(ownership.name, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      if (endpoint === 'vms_get_vehicle_archive_secure') {
        return route.fulfill({
          json: {
            ...vehicle,
            vehicleOwnership: ownership.vehicleOwnership,
            companyName: ownership.companyName,
            carrier: { id: 'carrier-1', companyName: ownership.carrierName }
          }
        })
      }
      return route.fulfill({ json: [] })
    })

    await page.goto('/tests/e2e/fixtures/trailer-company-edit.html?panel=archive', {
      waitUntil: 'commit'
    })
    const owner = page.locator('.vehicle-archive-detail__identity-copy > p')
    await expect(owner).toHaveText(ownership.ownerName)
    await expect(owner).toHaveAttribute('title', ownership.ownerName)
    await page.screenshot({
      path: testInfo.outputPath('vehicle-header.png'),
      animations: 'disabled'
    })
  })
}

for (const scenario of [
  { mode: 'archive', name: '档案详情有编辑及挂车维护权限', writable: true },
  { mode: 'view', name: '档案详情只有查看权限', writable: false },
  { mode: 'query', name: '车辆查询即使具备编辑权限也只读', writable: false }
] as const) {
  test(scenario.name, async ({ page }) => {
    await prepareIsolatedSession(page)
    const requestedVehicleIds: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      if (endpoint === 'vms_get_vehicle_archive_secure') return route.fulfill({ json: vehicle })
      if (endpoint === 'vms_get_vehicle_query_summary_records_secure')
        return route.fulfill({
          json: { [vehicleId]: { insurance: [], inspection: [], maintenance: [], mileage: [] } }
        })
      if (endpoint === 'tms_list_transport_mainline_relations_secure')
        return route.fulfill({ json: { records: [], total: 0 } })
      if (endpoint === 'vms_list_vehicle_trailers_secure') {
        const body = route.request().postDataJSON() as { p_vehicle_id?: string }
        requestedVehicleIds.push(body.p_vehicle_id ?? '')
        return route.fulfill({
          json: [
            {
              id: 'trailer-1',
              tenant_id: '11111111-1111-4111-8111-111111111111',
              plate_no: '冀D8A10挂',
              plate_color: 'yellow',
              trailer_type: '半挂车',
              ownership: 'self_operated',
              status: 'active'
            }
          ]
        })
      }
      return route.fulfill({ json: [] })
    })

    await page.goto(`/tests/e2e/fixtures/trailer-company-edit.html?panel=${scenario.mode}`)
    if (scenario.mode === 'query') {
      await expect(page.locator('.vehicle-query-detail')).toBeVisible()
      await page.getByRole('button', { name: '车辆档案', exact: true }).click()
      const archivePanel = page.locator('.vehicle-query-archive-panel')
      await expect(archivePanel.getByRole('tab', { name: '综合概览', exact: true })).toBeVisible()
      await expect(archivePanel.locator('#pane-overview')).toContainText('半挂车')
      await archivePanel.getByRole('tab', { name: '基础信息', exact: true }).click()
      await expect(archivePanel.locator('#pane-basic')).toContainText('半挂车')
      await page.getByRole('button', { name: '挂车管理' }).click()
    } else {
      await expect(page.locator('.vehicle-archive-detail')).toBeVisible()
      await expect(page.getByLabel('车型和运力参数')).toContainText('半挂车')
      await page.getByRole('tab', { name: '挂车管理' }).click()
    }

    const panel = page.locator('.vehicle-trailers-panel')
    await expect(panel.getByText('冀D8A10挂', { exact: true })).toBeVisible()
    expect(requestedVehicleIds).toContain(vehicleId)
    for (const name of ['添加挂车', '编辑', '删除']) {
      const action = panel.getByRole('button', { name, exact: true })
      if (scenario.writable) await expect(action).toBeVisible()
      else await expect(action).toHaveCount(0)
    }
  })
}
