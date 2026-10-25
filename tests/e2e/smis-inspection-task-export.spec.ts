import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const hidden of [false, true]) {
  for (const incomplete of [false, true]) {
    test(`${hidden ? '隐患排查' : '风险巡查'}任务导出 ${incomplete ? 'incomplete' : 'complete'}`, async ({
      page
    }, testInfo) => {
      const tenant = await prepareIsolatedSession(page)
      const path = hidden
        ? '/smis/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-task'
        : '/smis/dual-control-system/risk-control/risk-inspection-task'
      const title = hidden ? '隐患排查任务' : '风险巡查任务'
      const name = hidden
        ? 'SmisDualControlHiddenHazardInspectionTask'
        : 'SmisDualControlRiskInspectionTask'
      const menu = {
        id: 'task-export-test',
        parentId: null,
        name,
        path,
        component: path,
        type: 'menu',
        sort: 1,
        meta: { title, is_enable: true, is_hide: false, roles: [] }
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
        id: `task-${index}`,
        tenantId: tenant.id,
        taskNo: `TASK-${index}`,
        status: 'not_started',
        sourcePlanName: '测试计划',
        sourcePlanNo: 'PLAN-TEST',
        inspectionObject: '测试对象',
        inspectionTypeName: '日常排查',
        inspectionDescription: '测试说明',
        executorEmployeeName: '测试执行人',
        executorEmployeeNo: 'EMP-TEST',
        riskPointName: '测试风险点',
        riskPointNo: 'POINT-TEST',
        riskPointType: 'location',
        riskLevelName: '低风险',
        controlLevel: 'company',
        responsibleEmployeeName: '测试责任人',
        assigneeEmployeeName: '测试接收人',
        actualExecutorEmployeeName: null,
        plannedStartAt: '2026-10-01T08:00:00',
        plannedEndAt: '2026-10-01T18:00:00',
        completedItemCount: 2,
        itemCount: 3,
        normalCount: 2,
        abnormalCount: 1
      }))
      const requests: Array<Record<string, unknown> & { p_from: number; p_to: number }> = []
      const rpc = hidden
        ? 'smis_list_hidden_hazard_inspection_tasks_secure'
        : 'smis_list_risk_inspection_tasks_secure'
      await page.route(`**/rest/v1/rpc/${rpc}`, (route) => {
        const query = route.request().postDataJSON()
        requests.push(query)
        return route.fulfill({
          json: {
            records:
              incomplete && query.p_from >= 500
                ? []
                : records.slice(query.p_from, Math.min(query.p_to + 1, query.p_from + 1000)),
            total: records.length,
            overview: {
              total: records.length,
              notStarted: records.length,
              inProgress: 0,
              overdue: 0,
              completed: 0,
              cancelled: 0
            }
          }
        })
      })
      await page.goto(`#${path}`)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
        timeout: 60_000
      })
      await expect(page.getByText('TASK-0', { exact: true })).toBeVisible()
      const filters = Object.fromEntries(
        Object.entries(requests.at(-1) ?? {}).filter(([key]) => !['p_from', 'p_to'].includes(key))
      )
      requests.length = 0
      const button = page.getByRole('button', { name: '导出', exact: true })
      if (incomplete) {
        const downloads: string[] = []
        page.on('download', (download) => downloads.push(download.suggestedFilename()))
        await button.click()
        await expect(page.getByText('数据未完整加载，请刷新后重试', { exact: true })).toBeVisible()
        expect(downloads).toEqual([])
        expect(requests.map((query) => query.p_from)).toEqual([0, 500])
      } else {
        const pending = page.waitForEvent('download')
        await button.click()
        const file = await (await pending).path()
        if (!file) throw new Error('排查任务导出未生成文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(10002)
        expect(sheet.getRow(10002).getCell(hidden ? 2 : 1).value).toBe('TASK-10000')
        if (hidden) expect(sheet.getCell('G10002').value).toBe('2026-10-01 08:00')
        else expect(sheet.getCell('M10002').value).toBe('2/3')
        expect(requests.map((query) => query.p_from)).toEqual(
          Array.from({ length: 21 }, (_, index) => index * 500)
        )
        await assertTableFocusContract(page, testInfo)
      }
      await expect(button).toBeEnabled()
      for (const query of requests) {
        expect(query.p_to - query.p_from + 1).toBe(500)
        expect(
          Object.fromEntries(
            Object.entries(query).filter(([key]) => !['p_from', 'p_to'].includes(key))
          )
        ).toEqual(filters)
      }
      await page.screenshot({
        path: testInfo.outputPath('inspection-task-export.png'),
        fullPage: true
      })
      if (!hidden && !incomplete) {
        const cancelTask = page
          .locator('.el-table__body-wrapper')
          .getByRole('button', { name: '取消', exact: true })
          .first()
        await cancelTask.click()
        const dialog = page.getByRole('dialog')
        const reason = dialog.getByLabel('取消原因', { exact: true })
        await expect(reason).toBeVisible()
        await reason.fill('测试表单原位更新')
        await expect(reason).toHaveValue('测试表单原位更新')
        await dialog.screenshot({ path: testInfo.outputPath('task-cancel-form.png') })
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await cancelTask.click()
        await expect(reason).toHaveValue('')
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
      }
    })
  }
}
