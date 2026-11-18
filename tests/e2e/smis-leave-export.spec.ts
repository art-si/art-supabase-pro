import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { omit } from 'lodash-es'
import { prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

const leaveMenu = {
  id: 'leave-menu',
  parentId: null,
  name: 'SmisLeaveInformation',
  path: '/smis/basic-data/leave-information',
  component: '/smis/basic-data/leave-information',
  type: 'menu',
  sort: 1,
  meta: { title: '请假信息', is_enable: true, is_hide: false, roles: [] }
}

async function mockLeaveMenu(page: Page, actions: Array<'View' | 'Export'>) {
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
  )
  await mockApplicationMenus(page, {
    smis: [
      leaveMenu,
      ...actions.map((action) => ({
        ...leaveMenu,
        id: `${leaveMenu.id}-${action}`,
        parentId: leaveMenu.id,
        name: `${leaveMenu.name}:${action}`,
        path: '',
        component: '',
        type: 'button'
      }))
    ]
  })
}

test('请假组织导航按键浏览、确认查询和全部恢复', async ({ page }, info) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 800, height: 900 })
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const tenant = await prepareIsolatedSession(page, {
    platformSuper: false,
    tenantId: '11111111-1111-4111-8111-111111111111'
  })
  await mockLeaveMenu(page, ['View'])
  const organizations = [
    { id: 'branch', organization_name: '生产中心', organization_code: 'OPS' },
    { id: 'team', organization_name: '生产一组', organization_code: 'OPS1', parent_id: 'branch' }
  ].map((organization, sort) => ({ tenant_id: tenant.id, status: '1', sort, ...organization }))
  await page.route('**/rest/v1/mdm_organization?*', (route) => {
    const query = new URL(route.request().url()).searchParams
    expect(query.get('status')).toBe('eq.1')
    return route.fulfill({ json: organizations })
  })
  const scopes: Array<string | null> = []
  await page.route('**/rest/v1/rpc/smis_list_leave_information_secure', (route) => {
    const { p_organization_id: scope } = route.request().postDataJSON() as {
      p_organization_id: string | null
    }
    scopes.push(scope)
    return route.fulfill({
      json: {
        records: [{ id: 'leave-1', requestNo: `LEAVE-${scope ?? 'all'}`, status: 'draft' }],
        total: 1
      }
    })
  })
  const writes: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (/\/rpc\/smis_(save|delete)_leave_information/.test(pathname)) writes.push(pathname)
  })
  await page.goto(`#${leaveMenu.path}`, { waitUntil: 'domcontentloaded' })
  const panel = page.locator('.leave-organization')
  const branch = panel.locator('[role="treeitem"][data-key="branch"]')
  const team = panel.locator('[role="treeitem"][data-key="team"]')
  await expect(team).toBeVisible({ timeout: 90_000 })
  await expect(page.locator('#app-sidebar .menu-left')).toBeHidden()
  await expect(page.getByText('LEAVE-all', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^(新增|导出)/ })).toHaveCount(0)
  const initialReads = scopes.length

  await branch.press('ArrowLeft')
  await expect(team).toBeHidden()
  await page.keyboard.press('ArrowRight')
  await expect(team).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(team).toBeFocused()
  expect(scopes.slice(initialReads)).toEqual([])

  await page.keyboard.press('Enter')
  await expect(page.getByText('LEAVE-team', { exact: true })).toBeVisible()
  await expect(team).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(branch).toBeFocused()
  expect(scopes.slice(initialReads)).toEqual(['team'])
  await page.keyboard.press('Space')
  await expect(page.getByText('LEAVE-branch', { exact: true })).toBeVisible()
  const all = panel.getByRole('button', { name: /^全部员工/ })
  await expect(all).toHaveAttribute('aria-pressed', 'false')
  await all.press('Enter')
  await expect(all).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('LEAVE-all', { exact: true })).toBeVisible()
  expect(scopes.slice(initialReads)).toEqual(['team', 'branch', null])
  expect(writes).toEqual([])
  await panel.screenshot({ path: info.outputPath('leave-organization-keyboard.png') })
})

for (const incomplete of [false, true]) {
  test(`请假信息${incomplete ? '拒绝缺失导出页并恢复按钮' : '完整导出超过五千条记录'}`, async ({
    page
  }) => {
    test.setTimeout(180_000)
    await prepareIsolatedSession(page)
    await mockLeaveMenu(page, ['View', 'Export'])
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
    await page.goto(`#${leaveMenu.path}`)
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
