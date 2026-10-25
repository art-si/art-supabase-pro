import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const scenario of [
  {
    name: 'SmisEquipmentDepreciation',
    title: '折旧方法',
    route: 'equipment-depreciation',
    rpc: 'smis_list_equipment_depreciations_secure',
    placeholder: '折旧编码或折旧名称',
    empty: '暂无折旧方法'
  },
  {
    name: 'SmisInspectionDeclaration',
    title: '检验申报',
    route: 'inspection-declaration',
    rpc: 'smis_list_equipment_inspections_secure',
    placeholder: '报告编号、设备编码或名称',
    empty: '暂无检验申报'
  }
] as const) {
  test(`${scenario.title}失败保留筛选统计与重试`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const tenant = await prepareIsolatedSession(page)
    await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
    const path = `/smis/equipment-ledger/${scenario.route}`
    const menu = {
      id: scenario.name,
      parentId: null,
      name: scenario.name,
      path,
      component: path,
      type: 'menu',
      sort: 1,
      meta: { title: scenario.title, is_enable: true, is_hide: false, roles: [] }
    }
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }]
      })
    )
    await mockApplicationMenus(page, {
      smis: [
        menu,
        {
          ...menu,
          id: `${menu.id}-View`,
          parentId: menu.id,
          name: `${menu.name}:View`,
          type: 'button',
          path: '',
          component: ''
        }
      ]
    })
    await page.route('**/rest/v1/rpc/smis_list_inspection_categories_secure', (route) =>
      route.fulfill({ json: { records: [], total: 0 } })
    )
    let failure = false
    let empty = false
    const record = {
      id: 'record-test',
      tenantId: tenant.id,
      depreciationNo: 'RECORD-TEST',
      depreciationName: '测试折旧方法',
      depreciationYears: 3,
      depreciationPeriodMonths: 36,
      annualRates: [],
      status: 'active',
      inspectionNo: 'RECORD-TEST',
      inspectionDate: '2026-10-05',
      conclusion: 'qualified',
      equipment: {
        equipmentName: '测试设备',
        equipmentCode: 'EQ-TEST',
        organizationName: '测试部门'
      },
      inspectionCategory: { categoryName: '测试检验类别' },
      images: [],
      needsExtension: false
    }
    await page.route(`**/rest/v1/rpc/${scenario.rpc}`, (route) => {
      if (failure)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'database unavailable' }
        })
      const total = empty ? 0 : 1
      return route.fulfill({
        json: {
          records: empty ? [] : [record],
          total,
          overview: {
            total,
            active: total,
            averageYears: 3,
            configuredRateCount: 0,
            completed: total,
            dueSoon: 0,
            imageCount: 0
          }
        }
      })
    })
    await page.goto(`#${path}`)
    const table = page.locator('.art-table-query')
    await expect(table.getByText('RECORD-TEST', { exact: true })).toBeVisible({ timeout: 60_000 })
    const header = page.locator('.business-workspace-header')
    await header.scrollIntoViewIfNeeded()
    const metricBoxes = await header
      .locator('.business-workspace-header__metric')
      .evaluateAll((items) =>
        items.map((item) => ({
          x: item.getBoundingClientRect().x,
          y: item.getBoundingClientRect().y
        }))
      )
    expect(metricBoxes[0].y).toBe(metricBoxes[1].y)
    if ((page.viewportSize()?.width ?? 1440) <= 640) {
      expect(metricBoxes[2].y).toBeGreaterThan(metricBoxes[0].y)
    } else {
      expect(metricBoxes[3].y).toBe(metricBoxes[0].y)
    }
    await page.screenshot({ path: testInfo.outputPath('initial.png'), animations: 'disabled' })
    const keyword = page.getByPlaceholder(scenario.placeholder, { exact: true })
    await keyword.fill('保留筛选')
    const metric = page.locator('.business-workspace-header__metric').first().locator('strong')
    failure = true
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(table.getByText('数据加载失败', { exact: true })).toBeVisible()
    await expect(keyword).toHaveValue('保留筛选')
    await expect(metric).toHaveText('1')
    await expect(table.getByText(scenario.empty, { exact: true })).toHaveCount(0)
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.getByText(/database unavailable|XX000/)).toHaveCount(0)
    failure = false
    await table.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(table.getByText('RECORD-TEST', { exact: true })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('recovered.png'),
      fullPage: true,
      animations: 'disabled'
    })
    empty = true
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(table.getByText(scenario.empty, { exact: true })).toBeVisible()
    await expect(metric).toHaveText('0')
    expect(errors).toEqual([])
  })
}
