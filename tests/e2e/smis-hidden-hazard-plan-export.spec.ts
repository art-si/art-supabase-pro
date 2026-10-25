import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })

for (const mode of ['complete', 'incomplete', 'selected'] as const) {
  test(`隐患排查计划导出-${mode}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await prepareIsolatedSession(page)
    const menu = {
      id: 'hazard-plan-menu',
      parentId: null,
      name: 'SmisDualControlHiddenHazardInspectionPlan',
      path: '/smis/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-plan',
      component: '/smis/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-plan',
      type: 'menu',
      sort: 1,
      meta: { title: '隐患排查计划', is_enable: true, is_hide: false, roles: [] }
    }
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }]
      })
    )
    await mockApplicationMenus(page, {
      smis: [
        menu,
        ...['View', 'Export'].map((action) => ({
          ...menu,
          id: `${menu.id}-${action}`,
          parentId: menu.id,
          name: `${menu.name}:${action}`,
          path: '',
          component: '',
          type: 'button'
        }))
      ]
    })
    await page.route('**/rest/v1/sys_dictionary?*', (route) =>
      route.fulfill({
        headers: { 'content-range': '0-2/3', 'access-control-expose-headers': 'content-range' },
        json: [
          { code: 'commonEnabledDisabledVoidedStatus', value: 'enabled', label: '启用' },
          { code: 'commonDeadlineUnit', value: 'day', label: '天' },
          { code: 'commonPlanCycle', value: 'week', label: '周' }
        ].map((item, index) => ({
          id: `dict-${index}`,
          value: item.value,
          label: item.label,
          status: '1',
          sort: index,
          dict_type_table: { code: item.code, name: item.code }
        }))
      })
    )
    const rows = Array.from({ length: 10001 }, (_, index) => ({
      id: `plan-${index}`,
      planNo: `PLAN-${String(index).padStart(5, '0')}`,
      planName: `测试计划-${index}`,
      inspectionTypeId: 'type',
      inspectionTypeName: '测试排查',
      inspectionOrganizationId: 'org',
      inspectionOrganizationName: '测试检查单位',
      inspectedOrganizationId: 'target',
      inspectedOrganizationName: '测试被检单位',
      executorEmployeeId: 'employee',
      executorEmployeeName: '测试检查人',
      executorEmployeeNo: 'TEST-1',
      plannedStartAt: '2026-10-01T00:00:00Z',
      plannedEndAt: '2026-10-01T01:00:00Z',
      taskDeadlineValue: 2,
      taskDeadlineUnit: 'day',
      cycleType: 'week',
      cycleInterval: 1,
      attachmentUrls: [],
      status: 'enabled',
      itemCount: 0,
      taskCount: 0,
      createTime: '2026-10-01T00:00:00Z'
    }))
    const offsets: number[] = []
    await page.route(
      '**/rest/v1/rpc/smis_list_hidden_hazard_inspection_plans_secure',
      async (route) => {
        const query = route.request().postDataJSON()
        const from = Number(query.p_from)
        const to = Number(query.p_to)
        if (to - from + 1 === 500) offsets.push(from)
        await route.fulfill({
          json: {
            records: mode === 'incomplete' && from >= 500 ? [] : rows.slice(from, to + 1),
            total: rows.length,
            overview: { total: rows.length, enabled: rows.length, disabled: 0, voided: 0 }
          }
        })
      }
    )
    await page.goto(`#${menu.path}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '隐患排查计划', exact: true })).toBeVisible({
      timeout: 60_000
    })
    const body = page.locator('.el-table__body-wrapper').first()
    await expect(body.getByText('PLAN-00000', { exact: true })).toBeVisible()
    if (mode === 'selected') {
      const jump = page.locator('.el-pagination__jump input')
      await jump.fill('26')
      await jump.press('Enter')
      await expect(body.getByText('PLAN-00500', { exact: true })).toBeVisible()
      await body.locator('tr.el-table__row').first().locator('.el-checkbox').click()
    }
    const button = page
      .getByLabel(mode === 'selected' ? '批量操作' : '页面主要操作', { exact: true })
      .getByRole('button', { name: mode === 'selected' ? '导出选中' : '导出', exact: true })
    if (mode === 'incomplete') {
      const downloads: string[] = []
      page.on('download', (download) => downloads.push(download.suggestedFilename()))
      await button.click()
      await expect(page.getByText('数据未完整加载，请刷新后重试', { exact: true })).toBeVisible()
      await expect(button).toBeEnabled()
      expect(downloads).toEqual([])
      expect(offsets).toEqual([0, 500])
    } else {
      const downloaded = page.waitForEvent('download')
      await button.click()
      const file = await (await downloaded).path()
      if (!file) throw new Error('未生成隐患排查计划导出文件')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(file)
      const sheet = workbook.worksheets[0]
      expect(sheet.rowCount).toBe(mode === 'selected' ? 2 : 10002)
      expect(sheet.getCell('A2').text).toBe(mode === 'selected' ? 'PLAN-00500' : 'PLAN-00000')
      if (mode === 'complete') expect(sheet.getCell('A10002').text).toBe('PLAN-10000')
      expect(sheet.getCell('G2').text).toBe('2天')
      expect(sheet.getCell('H2').text).toBe('每1周')
      expect(sheet.getCell('N2').text).toBe('启用')
      expect(offsets).toEqual(Array.from({ length: 21 }, (_, index) => index * 500))
    }
    await expect(
      body.getByText(mode === 'selected' ? 'PLAN-00500' : 'PLAN-00000', { exact: true })
    ).toBeVisible()
    if (mode === 'complete') await assertTableFocusContract(page, testInfo)
  })
}
