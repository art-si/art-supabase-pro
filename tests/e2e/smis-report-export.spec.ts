import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { omit } from 'lodash-es'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

for (const scenario of [
  {
    name: 'SmisDualControlManagementReport',
    path: 'dual-control-management-report',
    title: '双控管控报表',
    rpc: 'smis_get_dual_control_management_report_secure'
  },
  {
    name: 'SmisDualControlHiddenHazardInspectionReport',
    path: 'hidden-hazard-inspection-report',
    title: '隐患排查报表',
    rpc: 'smis_get_hidden_hazard_inspection_report_secure'
  }
]) {
  for (const incomplete of [false, true]) {
    test(`${scenario.title}${incomplete ? '拒绝缺失导出页并恢复按钮' : '完整导出超过一万条组织'}`, async ({
      page
    }) => {
      test.setTimeout(180_000)
      await prepareIsolatedSession(page)
      await page.route('**/rest/v1/sys_dictionary?*', (route) =>
        route.fulfill({
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
          json: [
            {
              id: 'organization-type-department',
              label: '部门',
              value: 'department',
              status: '1',
              sort: 1,
              dict_type_table: { code: 'organizationType', name: '组织类型' }
            }
          ]
        })
      )
      const menu = {
        id: 'report-menu',
        parentId: null,
        name: scenario.name,
        path: `/smis/dual-control-system/dual-control-report/${scenario.path}`,
        component: `/smis/dual-control-system/dual-control-report/${scenario.path}`,
        type: 'menu',
        sort: 1,
        meta: { title: scenario.title, is_enable: true, is_hide: false, roles: [] }
      }
      await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
        route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
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
      const records = Array.from({ length: 10001 }, (_, index) => ({
        id: `organization-${index}`,
        organizationId: `organization-${index}`,
        organizationCode: `ORG-${String(index).padStart(5, '0')}`,
        organizationName: `测试组织-${index}`,
        organizationType: 'department',
        majorCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 1,
        unevaluatedCount: 0,
        riskPointCount: 1,
        riskItemCount: 1,
        measureCount: 1,
        riskValue: 1,
        generatedTaskCount: 2,
        completedTaskCount: 1,
        abnormalCount: 0,
        inspectionRate: 50,
        hazardCount: 0,
        closedHazardCount: 0,
        openHazardCount: 0,
        closureRate: 0,
        activePlanCount: 1,
        inProgressTaskCount: 1,
        overdueTaskCount: 0,
        cancelledTaskCount: 0,
        executorCount: 1,
        missedInspectorCount: 0,
        generatedHazardCount: 0
      }))
      const requests: Array<{ p_from: number; p_to: number; [key: string]: unknown }> = []
      await page.route(`**/rest/v1/rpc/${scenario.rpc}`, async (route) => {
        const params: (typeof requests)[number] = route.request().postDataJSON()
        requests.push(params)
        await route.fulfill({
          json: {
            records:
              incomplete && params.p_from >= 500
                ? []
                : records.slice(params.p_from, params.p_to + 1),
            total: records.length,
            overview: {
              organizations: records.length,
              riskItems: records.length,
              measures: records.length,
              inspectionRate: 50,
              openHazards: 0,
              generatedTasks: records.length * 2,
              completedTasks: records.length,
              missedInspectors: 0,
              generatedHazards: 0
            }
          }
        })
      })
      await page.goto(`#/smis/dual-control-system/dual-control-report/${scenario.path}`)
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible()
      await expect(page.getByText('测试组织-0', { exact: true })).toBeVisible()
      if (scenario.path === 'hidden-hazard-inspection-report')
        await expect(page.getByText('ORG-00000 · 部门', { exact: true })).toBeVisible()
      const initialFilters = omit(requests[0], ['p_from', 'p_to'])
      requests.length = 0
      const button = page.getByRole('button', { name: '导出报表', exact: true })
      if (incomplete) {
        const downloads: string[] = []
        page.on('download', (download) => downloads.push(download.suggestedFilename()))
        await button.click()
        await expect(page.getByText('数据未完整加载，请刷新后重试', { exact: true })).toBeVisible()
        await expect(button).toBeEnabled()
        expect(requests.map((request) => request.p_from)).toEqual([0, 500])
        expect(downloads).toEqual([])
      } else {
        const downloadPromise = page.waitForEvent('download')
        await button.click()
        const path = await (await downloadPromise).path()
        if (!path) throw new Error('未生成双控报表文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(path)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(10002)
        expect(sheet.getCell('A2').value).toBe('ORG-00000')
        expect(sheet.getCell('A10002').value).toBe('ORG-10000')
        if (scenario.path === 'hidden-hazard-inspection-report')
          expect(sheet.getCell('C2').value).toBe('部门')
        expect(requests.map((request) => request.p_from)).toEqual(
          Array.from({ length: 21 }, (_, index) => index * 500)
        )
      }
      for (const request of requests)
        expect(omit(request, ['p_from', 'p_to'])).toEqual(initialFilters)
      await expect(page.getByText('测试组织-0', { exact: true })).toBeVisible()
    })
  }
}
