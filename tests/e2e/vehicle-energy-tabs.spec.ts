import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const vehicleId = '11111111-1111-4111-8111-111111111101'
const vehicle = {
  id: vehicleId,
  plateNo: '测A·新能源01',
  companyName: '验收物流',
  vehicleType: 'heavy_truck',
  vehicleOwnership: 'self_operated',
  isNewEnergy: true,
  fieldAccess: { documents: 'read' }
}

test('车辆能源类型决定卡档案与流水页签并按车辆查询', async ({ page }) => {
  let isNewEnergy = true
  let archiveCalls = 0
  const electricRequests: Array<{ endpoint: string; vehicleId: string | null }> = []

  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'vms_get_vehicle_archive_secure')
      return route.fulfill({ json: { ...vehicle, isNewEnergy } })
    if (endpoint === 'vms_get_vehicle_query_summary_records_secure')
      return route.fulfill({
        json: { [vehicleId]: { insurance: [], inspection: [], maintenance: [], mileage: [] } }
      })
    if (endpoint === 'tms_list_transport_mainline_relations_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    if (
      endpoint === 'vms_list_electric_cards_secure_v2' ||
      endpoint === 'vms_list_electric_card_entries_secure_v2'
    ) {
      const payload = route.request().postDataJSON() as { p_vehicle_id?: string }
      electricRequests.push({ endpoint, vehicleId: payload.p_vehicle_id ?? null })
      if (endpoint === 'vms_list_electric_cards_secure_v2' && ++archiveCalls === 1)
        return route.fulfill({
          status: 500,
          json: { code: 'mock_failure', message: 'temporary failure' }
        })
      return route.fulfill({ json: { records: [], total: 0 } })
    }
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/vehicle-query-visual.html?page=detail', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('.vehicle-query-detail')).toBeVisible()
  await expect(page.getByRole('button', { name: '电卡档案' })).toBeVisible()
  await expect(page.getByRole('button', { name: '电卡流水' })).toBeVisible()
  await expect(page.getByRole('button', { name: '油耗与加油' })).toHaveCount(0)

  await page.getByRole('button', { name: '电卡档案' }).click()
  await expect(page.getByText('电卡记录加载失败，请重试。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('暂无绑定电卡', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '电卡流水' }).click()
  await expect(page.getByText('暂无电卡流水', { exact: true })).toBeVisible()
  expect(electricRequests).toEqual([
    { endpoint: 'vms_list_electric_cards_secure_v2', vehicleId },
    { endpoint: 'vms_list_electric_cards_secure_v2', vehicleId },
    { endpoint: 'vms_list_electric_card_entries_secure_v2', vehicleId }
  ])

  isNewEnergy = false
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '油卡档案' })).toBeVisible()
  await expect(page.getByRole('button', { name: '油卡流水' })).toBeVisible()
  await expect(page.getByRole('button', { name: '油耗与加油' })).toBeVisible()
  await expect(page.getByRole('button', { name: '电卡档案' })).toHaveCount(0)
})
