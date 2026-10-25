import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { omit } from 'lodash-es'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

for (const incomplete of [false, true]) {
  test(`请假信息${incomplete ? '拒绝缺失导出页并恢复按钮' : '完整导出超过五千条记录'}`, async ({
    page
  }) => {
    test.setTimeout(180_000)
    await prepareIsolatedSession(page)
    const menu = {
      id: 'leave-menu',
      parentId: null,
      name: 'SmisLeaveInformation',
      path: '/smis/basic-data/leave-information',
      component: '/smis/basic-data/leave-information',
      type: 'menu',
      sort: 1,
      meta: { title: '请假信息', is_enable: true, is_hide: false, roles: [] }
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
    const records = Array.from({ length: 5001 }, (_, index) => ({
      id: `leave-${index}`,
      requestNo: `LEAVE-${index}`,
      organizationId: 'test-organization',
      employeeId: `employee-${index}`,
      leaveTypeCode: 'annual',
      leaveTypeName: '年假',
      startDate: '2026-10-01',
      endDate: '2026-10-02',
      requestedAmount: 2,
      reason: '测试请假事由',
      isProxy: false,
      status: 'draft',
      applicant: {
        id: `employee-${index}`,
        employeeName: `测试申请人-${index}`,
        employeeNo: `EMP-${index}`
      },
      organization: {
        id: 'test-organization',
        organizationCode: 'ORG-1',
        organizationName: '测试组织'
      }
    }))
    const requests: Array<{ p_from: number; p_to: number; [key: string]: unknown }> = []
    await page.route('**/rest/v1/rpc/smis_list_leave_information_secure', async (route) => {
      const params: (typeof requests)[number] = route.request().postDataJSON()
      requests.push(params)
      await route.fulfill({
        json: {
          records:
            incomplete && params.p_from >= 500 ? [] : records.slice(params.p_from, params.p_to + 1),
          total: records.length
        }
      })
    })
    await page.route('**/rest/v1/rpc/smis_leave_information_overview_secure', (route) =>
      route.fulfill({
        json: {
          total: records.length,
          currentMonth: records.length,
          proxyCount: 0,
          organizationCount: 1
        }
      })
    )
    await page.goto('#/smis/basic-data/leave-information')
    await expect(page.getByRole('heading', { name: '请假信息维护', exact: true })).toBeVisible()
    await expect(page.getByText('LEAVE-0', { exact: true })).toBeVisible()
    const filters = omit(requests[0], ['p_from', 'p_to'])
    requests.length = 0
    const button = page.getByRole('button', { name: '导出', exact: true })
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
      if (!path) throw new Error('未生成请假信息文件')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(path)
      const sheet = workbook.worksheets[0]
      expect(sheet.rowCount).toBe(records.length + 1)
      expect(sheet.getRow(5002).getCell(1).value).toBe('LEAVE-5000')
      expect(sheet.getRow(5002).getCell(2).value).toBe('测试申请人-5000')
      expect(requests.map((request) => request.p_from)).toEqual(
        Array.from({ length: 11 }, (_, index) => index * 500)
      )
      await expect(button).toBeEnabled()
    }
    for (const request of requests) {
      expect(request.p_to - request.p_from + 1).toBe(500)
      expect(omit(request, ['p_from', 'p_to'])).toEqual(filters)
    }
    await page.screenshot({ path: test.info().outputPath('leave-export.png'), fullPage: true })
  })
}
