import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
const driver = (index: number) => ({
  id: 'driver-' + index,
  driverName: '验收司机' + index,
  phone: '1390000' + String(index).padStart(4, '0'),
  gender: 'male',
  licenseType: 'B2',
  driverType: 'secondary',
  driverStatus: 'on_duty',
  driverOwnership: 'self',
  companyName: '验收运输公司',
  carrierName: '验收承运商',
  licenseExpireDate: '2028-12-31',
  plateNo: '测A' + String(index).padStart(5, '0'),
  vehicle: {
    vehicleOwnership: 'self_operated',
    vehicleType: 'truck',
    specLengthM: 13,
    loadTons: 25
  }
})

for (const theme of ['light', 'dark']) {
  test('车辆司机统一参选：分页、跨页多选、取消、搜索及清空 ' + theme, async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(
      theme === 'dark' ? { width: 1280, height: 800 } : { width: 1440, height: 900 }
    )
    const requests: Record<string, unknown>[] = []
    let fail = true
    await page.route('**/rest/v1/rpc/list_vehicle_driver_choices_secure', (route) => {
      const body = route.request().postDataJSON()
      requests.push(body)
      if (body.p_source === 'approved_vehicle' && fail) {
        fail = false
        return route.fulfill({
          status: 503,
          json: { code: 'PGRST500', message: 'temporary failure' }
        })
      }
      const from = Number(body.p_from)
      const keyword = String(body.p_keyword || '')
      const rows = Array.from({ length: 25 }, (_, i) => driver(i + 1)).filter(
        (row) => !keyword || row.driverName.includes(keyword) || row.phone.includes(keyword)
      )
      return route.fulfill({
        json: {
          records: rows.slice(from, Number(body.p_to) + 1).map((row) =>
            body.p_source === 'approved_vehicle'
              ? {
                  id: 'vehicle-' + row.id,
                  plateNo: row.plateNo,
                  vehicleOwnership: 'self_operated',
                  companyName: row.companyName,
                  carrierName: row.carrierName,
                  vehicleType: 'truck',
                  specLengthM: 13,
                  loadTons: 25,
                  primaryDriver: row
                }
              : row
          ),
          total: rows.length
        }
      })
    })
    await page.goto(
      '/tests/e2e/fixtures/vehicle-driver-select.html?theme=' +
        theme +
        '&box=' +
        (theme === 'dark' ? 'shadow-mode' : 'border-mode'),
      { waitUntil: 'domcontentloaded' }
    )
    await page.getByPlaceholder('请选择车辆', { exact: true }).click()
    const vehicles = page.getByRole('dialog', { name: '选择车辆', exact: true })
    await expect(vehicles.getByText('可选数据加载失败', { exact: true })).toBeVisible()
    await vehicles.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(vehicles.getByText('测A00001', { exact: true })).toBeVisible()
    for (const label of [
      '车牌号',
      '车辆归属',
      '照片',
      '司机',
      '联系电话',
      '性别',
      '驾照类型',
      '司机归属',
      '所属公司',
      '所属承运商',
      '车型',
      '车长（米）',
      '载重（吨）',
      '司机状态',
      '司机类型',
      '驾照到期日期'
    ])
      await expect(vehicles.getByRole('columnheader', { name: label, exact: true })).toHaveCount(1)
    await page.screenshot({
      path: '.artifacts/vehicle-driver-select-' + theme + '.png',
      fullPage: true
    })
    const tableScroll = vehicles.locator('.el-table__body-wrapper .el-scrollbar__wrap').first()
    await tableScroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await expect(
      vehicles.getByRole('columnheader', { name: '驾照到期日期', exact: true })
    ).toBeInViewport()
    await page.screenshot({
      path: '.artifacts/vehicle-driver-select-' + theme + '-right.png',
      fullPage: true
    })
    await tableScroll.evaluate((element) => {
      element.scrollLeft = 0
    })
    await vehicles.getByText('测A00001', { exact: true }).click()
    await vehicles.getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.getByTestId('selected')).not.toContainText('vehicle-driver-1')
    await page.getByPlaceholder('请选择备用司机', { exact: true }).click()
    const drivers = page.getByRole('dialog', { name: '选择司机', exact: true })
    await drivers.getByText('验收司机1', { exact: true }).click()
    await drivers.locator('.el-pagination .btn-next').click()
    await expect(drivers.getByText('验收司机11', { exact: true })).toBeVisible()
    await drivers.getByText('验收司机11', { exact: true }).click()
    await drivers.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByTestId('selected')).toContainText('driver-1')
    await expect(page.getByTestId('selected')).toContainText('driver-11')
    await expect(page.locator('.art-form').getByText('验收司机1', { exact: true })).toBeVisible()
    await expect(page.locator('.art-form').getByText('验收司机11', { exact: true })).toBeVisible()
    await expect(page.getByText('所选资料不可用', { exact: true })).toHaveCount(0)
    expect(requests.some((row) => row.p_source === 'archive_driver' && row.p_from === 10)).toBe(
      true
    )
    expect(requests.find((row) => row.p_source === 'archive_driver')).toMatchObject({
      p_context: {
        tenantId: 'choice-tenant',
        vehicleOwnership: 'self_operated',
        driverType: 'secondary'
      }
    })
    await page.getByPlaceholder('请选择车辆', { exact: true }).click()
    await vehicles.getByPlaceholder('搜索车牌、司机、电话、公司或承运商').fill('13900000025')
    await vehicles.getByPlaceholder('搜索车牌、司机、电话、公司或承运商').press('Enter')
    await expect(vehicles.getByText('测A00025', { exact: true })).toBeVisible()
    await vehicles.getByText('测A00025', { exact: true }).click()
    await vehicles.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByTestId('selected')).toContainText('vehicle-driver-25')
    expect(requests.at(-1)).toMatchObject({ p_from: 0, p_keyword: '13900000025' })
    await page.getByRole('button', { name: '清空', exact: true }).first().click()
    await expect(page.getByTestId('selected')).not.toContainText('vehicle-driver-25')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true)
  })
}
