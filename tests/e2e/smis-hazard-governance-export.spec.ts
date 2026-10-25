import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })

for (const scenario of [
  {
    path: 'public-hidden-hazard-report',
    title: '公众举报隐患',
    name: 'SmisDualControlPublicHiddenHazardReport',
    rpc: 'smis_list_public_hazard_reports_secure',
    selectedExportLabel: '导出',
    levelColumn: 'F'
  },
  {
    path: 'hidden-hazard-governance-tracking',
    title: '隐患治理跟踪',
    name: 'SmisDualControlHiddenHazardGovernanceTracking',
    rpc: 'smis_list_hidden_hazard_governance_secure',
    selectedExportLabel: '导出选中',
    levelColumn: 'E'
  },
  {
    path: 'hidden-hazard-inspection-rectification',
    title: '隐患检查落实整改',
    name: 'SmisDualControlHiddenHazardInspectionRectification',
    rpc: 'smis_list_rectification_notices_secure',
    selectedExportLabel: '导出',
    levelColumn: null
  },
  {
    path: 'hidden-hazard-rectification-notice',
    title: '隐患整改通知书',
    name: 'SmisDualControlHiddenHazardRectificationNotice',
    rpc: 'smis_list_rectification_notices_secure',
    selectedExportLabel: '导出',
    levelColumn: null
  }
]) {
  for (const mode of ['complete', 'incomplete', 'selected'] as const) {
    test(`${scenario.title}导出-${mode}`, async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await prepareIsolatedSession(page)
      const menu = {
        id: 'public-hazard-menu',
        parentId: null,
        name: scenario.name,
        path: `/smis/dual-control-system/hidden-hazard-governance/${scenario.path}`,
        component: `/smis/dual-control-system/hidden-hazard-governance/${scenario.path}`,
        type: 'menu',
        sort: 1,
        meta: { title: scenario.title, is_enable: true, is_hide: false, roles: [] }
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
            {
              id: 'source',
              label: '公众举报',
              value: 'public_report',
              status: '1',
              sort: 1,
              dict_type_table: { code: 'smisHiddenHazardSourceType', name: '来源' }
            },
            {
              id: 'status',
              label: '待核准',
              value: 'pending_approval',
              status: '1',
              sort: 1,
              dict_type_table: { code: 'smisHiddenHazardGovernanceStatus', name: '状态' }
            },
            {
              id: 'level',
              label: '一般隐患',
              value: 'general',
              status: '1',
              sort: 1,
              dict_type_table: { code: 'smisHazardLevel', name: '等级' }
            }
          ]
        })
      )
      const rows = Array.from({ length: 10001 }, (_, index) => ({
        id: `report-${index}`,
        hazardNo: `HAZ-${String(index).padStart(5, '0')}`,
        noticeNo: `HAZ-${String(index).padStart(5, '0')}`,
        rectificationPlanNo: '测试整改计划',
        inspectionTime: '2026-10-01T00:00:00Z',
        inspectionOrganizationName: '测试检查单位',
        inspectedOrganizationName: '测试被检查单位',
        inspectorNames: '测试检查人员',
        hazardDescription: '测试检查问题',
        rectificationRequirement: '测试整改措施',
        rectificationDeadline: '2026-10-02T00:00:00Z',
        status: 'pending_approval',
        reporterName: '测试举报人',
        reporterEmployeeName: '测试举报人',
        reporterEmployeeNo: 'TEST-1',
        sourceType: 'public_report',
        description: '测试隐患',
        location: '测试位置',
        hazardLevel: 'general',
        imageUrls: [],
        reportedAt: '2026-10-01T00:00:00Z',
        handlerName: '测试登记人',
        createTime: '2026-10-01T00:00:00Z'
      }))
      const offsets: number[] = []
      await page.route('**/rest/v1/rpc/smis_get_hazard_reporting_options_secure', (route) =>
        route.fulfill({ json: { profile: null, organizations: [], sites: [] } })
      )
      await page.route(`**/rest/v1/rpc/${scenario.rpc}`, async (route) => {
        const query = route.request().postDataJSON()
        const from = Number(query.p_from)
        const to = Number(query.p_to)
        if (scenario.rpc === 'smis_list_rectification_notices_secure')
          expect(query.p_rectifiable_only).toBe(false)
        if (to - from + 1 === 500) offsets.push(from)
        await route.fulfill({
          json: {
            records: mode === 'incomplete' && from >= 500 ? [] : rows.slice(from, to + 1),
            total: rows.length,
            pendingCount: rows.length,
            processingCount: 0,
            closedCount: 0,
            rectifyingCount: 0,
            pendingAcceptanceCount: 0,
            completedCount: 0,
            overview: {
              total: rows.length,
              pendingApproval: rows.length,
              rectifying: 0,
              pendingAcceptance: 0,
              completed: 0,
              closed: 0
            }
          }
        })
      })
      await page.goto(`#${menu.path}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
        timeout: 60_000
      })
      await expect(page.getByText('HAZ-00000', { exact: true })).toBeVisible()
      const body = page.locator('.el-table__body-wrapper').first()
      if (mode === 'selected') {
        const jump = page.locator('.el-pagination__jump input')
        await jump.fill('26')
        await jump.press('Enter')
        await expect(body.getByText('HAZ-00500', { exact: true })).toBeVisible()
        await body.locator('tr.el-table__row').first().locator('.el-checkbox').click()
      }
      const button = page
        .getByLabel(mode === 'selected' ? '批量操作' : '页面主要操作', { exact: true })
        .getByRole('button', {
          name: mode === 'selected' ? scenario.selectedExportLabel : '导出',
          exact: true
        })
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
        if (!file) throw new Error('未生成隐患治理导出文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(mode === 'selected' ? 2 : 10002)
        expect(sheet.getCell('A2').text).toBe(mode === 'selected' ? 'HAZ-00500' : 'HAZ-00000')
        if (mode === 'complete') expect(sheet.getCell('A10002').text).toBe('HAZ-10000')
        if (scenario.path !== 'hidden-hazard-rectification-notice')
          expect(sheet.getCell('B2').text).toBe('待核准')
        if (scenario.levelColumn)
          expect(sheet.getCell(`${scenario.levelColumn}2`).text).toBe('一般隐患')
        if (scenario.rpc === 'smis_list_rectification_notices_secure') {
          const dateColumn = scenario.path === 'hidden-hazard-rectification-notice' ? 'C' : 'D'
          expect(sheet.getCell(`${dateColumn}2`).text).toBe('2026-10-01 08:00')
        }
        if (scenario.path === 'hidden-hazard-governance-tracking')
          expect(sheet.getCell('N2').text).toBe('公众举报')
        expect(offsets).toEqual(Array.from({ length: 21 }, (_, index) => index * 500))
      }
      await expect(
        body.getByText(mode === 'selected' ? 'HAZ-00500' : 'HAZ-00000', { exact: true })
      ).toBeVisible()
      if (mode === 'complete') await assertTableFocusContract(page, testInfo)
    })
  }
}
