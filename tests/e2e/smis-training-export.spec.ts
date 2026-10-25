import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { omit } from 'lodash-es'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })

for (const scenario of [
  {
    name: 'SmisSafetyTrainingPlan',
    path: 'safety-training-plan',
    title: '安全培训计划',
    rpc: 'smis_list_safety_training_plans_secure',
    placeholder: '计划编号、主题或讲师',
    number: 'planNo',
    subjectColumn: 2
  },
  {
    name: 'SmisSafetyTrainingRecord',
    path: 'safety-training-record',
    title: '安全培训记录',
    rpc: 'smis_list_safety_training_records_secure',
    placeholder: '记录单号、计划编号或主题',
    number: 'recordNo',
    subjectColumn: 3
  }
] as const) {
  for (const mode of ['complete', 'filtered', 'incomplete', 'tenant_change']) {
    test(`${scenario.title}分页导出 ${mode}`, async ({ page }) => {
      test.setTimeout(180_000)
      test.skip(
        mode === 'tenant_change' && (page.viewportSize()?.width ?? 1440) < 1024,
        '租户切换入口在桌面布局展示，此交互用桌面项目验证'
      )
      const tenant = await prepareIsolatedSession(page)
      if (mode === 'tenant_change')
        await page.route('**/rest/v1/sys_tenant?*', (route) =>
          route.fulfill({
            json: [
              tenant,
              {
                id: '7529f951-938e-4e2c-ac0d-316c136ae1f9',
                tenant_code: 'other-test',
                tenant_name: '另一测试租户'
              }
            ]
          })
        )
      const path = `/smis/qualification-training/training-management/${scenario.path}`
      const menu = {
        id: 'training-menu',
        parentId: null,
        name: scenario.name,
        path,
        component: path,
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
      const records = Array.from({ length: 5001 }, (_, index) => ({
        id: `training-${index}`,
        tenantId: tenant.id,
        planNo: `PLAN-${index}`,
        recordNo: `RECORD-${index}`,
        trainingPlanId: `plan-${index}`,
        subject: `测试主题-${index}`,
        trainingCategory: 'safety',
        trainingType: 'routine',
        trainingForm: 'offline',
        trainingLevel: 'company',
        organizerOrganizationId: 'org-test',
        organizerOrganizationName: '测试组织',
        plannedStartAt: '2026-10-01T00:00:00Z',
        plannedEndAt: '2026-10-01T02:00:00Z',
        actualStartAt: '2026-10-01T00:00:00Z',
        actualEndAt: '2026-10-01T02:00:00Z',
        trainingHours: 2,
        warningStatus: 'normal',
        status: 'draft',
        executionStatus: 'not_started',
        content: '测试培训内容',
        assessmentMethod: 'written',
        instructorName: '测试讲师',
        attachmentUrls: [],
        signInAttachmentUrls: [],
        participants: [],
        participantCount: 5,
        presentCount: 4,
        attendanceRate: 80,
        createTime: '2026-10-01T00:00:00Z',
        updateTime: '2026-10-01T00:00:00Z'
      }))
      const requests: Array<{ p_from: number; p_to: number; [key: string]: unknown }> = []
      let releaseExport: (() => void) | undefined
      await page.route(`**/rest/v1/rpc/${scenario.rpc}`, async (route) => {
        const params: (typeof requests)[number] = route.request().postDataJSON()
        requests.push(params)
        if (mode === 'tenant_change' && params.p_from === 0 && params.p_to === 499)
          await new Promise<void>((resolve) => {
            releaseExport = resolve
          })
        await route.fulfill({
          json: {
            records:
              mode === 'incomplete' && params.p_from >= 500
                ? []
                : records.slice(params.p_from, Math.min(params.p_to + 1, params.p_from + 1000)),
            total: records.length,
            overview: {
              total: records.length,
              draft: records.length,
              published: 0,
              completed: 0,
              warning: 0,
              submitted: 0,
              participantCount: records.length * 5,
              presentCount: records.length * 4
            },
            organizations: [],
            planOptions: []
          }
        })
      })
      await page.goto(`#${path}`)
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
        timeout: 60_000
      })
      await expect(page.getByText('测试主题-0', { exact: true })).toBeVisible()
      if (mode === 'filtered') {
        await page.getByPlaceholder(scenario.placeholder, { exact: true }).fill('测试主题')
        await page.getByRole('button', { name: '查询', exact: true }).click()
        await expect.poll(() => requests.at(-1)?.p_keyword).toBe('测试主题')
      }
      const filters = omit(requests.at(-1), ['p_from', 'p_to'])
      requests.length = 0
      const button = page.getByRole('button', { name: '导出', exact: true })
      if (mode === 'tenant_change') {
        const downloads: string[] = []
        page.on('download', (download) => downloads.push(download.suggestedFilename()))
        await button.click()
        await expect.poll(() => Boolean(releaseExport)).toBe(true)
        await page.getByRole('button', { name: '当前租户范围：全部租户', exact: true }).click()
        await page.getByRole('menuitem').filter({ hasText: '另一测试租户' }).click()
        await expect(
          page.getByRole('button', { name: '当前租户范围：另一测试租户', exact: true })
        ).toBeVisible()
        if (!releaseExport) throw new Error('导出请求尚未开始')
        releaseExport()
        await expect(page.getByText('租户范围已变化，请刷新后重试', { exact: true })).toBeVisible()
        expect(
          requests
            .filter((request) => request.p_to - request.p_from === 499)
            .map((request) => request.p_from)
        ).toEqual([0])
        expect(downloads).toEqual([])
        await expect(button).toBeEnabled()
        await page.screenshot({ path: test.info().outputPath('tenant-export-cancelled.png') })
        return
      }
      if (mode === 'incomplete') {
        const downloads: string[] = []
        page.on('download', (download) => downloads.push(download.suggestedFilename()))
        await button.click()
        await expect(page.getByText('数据未完整加载，请刷新后重试', { exact: true })).toBeVisible()
        expect(downloads).toEqual([])
        expect(requests.map((request) => request.p_from)).toEqual([0, 500])
      } else {
        const downloadPromise = page.waitForEvent('download')
        await button.click()
        const file = await (await downloadPromise).path()
        if (!file) throw new Error('未生成安全培训导出文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(records.length + 1)
        expect(sheet.getRow(5002).getCell(1).value).toBe(records[5000][scenario.number])
        expect(sheet.getRow(5002).getCell(scenario.subjectColumn).value).toBe('测试主题-5000')
        expect(requests.map((request) => request.p_from)).toEqual(
          Array.from({ length: 11 }, (_, index) => index * 500)
        )
      }
      for (const request of requests) {
        expect(request.p_to - request.p_from + 1).toBe(500)
        expect(omit(request, ['p_from', 'p_to'])).toEqual(filters)
      }
      await expect(button).toBeEnabled()
      if (mode === 'complete') await assertTableFocusContract(page, test.info())
      await page.screenshot({ path: test.info().outputPath('training-export.png') })
    })
  }
}
