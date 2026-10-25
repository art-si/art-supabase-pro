import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })

for (const scenario of [
  {
    path: 'special-operation-workbench',
    name: 'SmisSpecialOperationWorkbench',
    title: '特殊作业管理',
    code: null
  },
  {
    path: 'hot-work-application',
    name: 'SmisHotWorkApplication',
    title: '动火作业申请',
    code: 'HOT_WORK'
  }
]) {
  for (const incomplete of [false, true]) {
    test(`${scenario.title}${incomplete ? '拒绝缺失导出页' : '按状态完整导出超过一万条作业票'}`, async ({
      page
    }, testInfo) => {
      test.setTimeout(180_000)
      const tenant = await prepareIsolatedSession(page)
      await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
      const menu = {
        id: 'permit-menu',
        parentId: null,
        name: scenario.name,
        path: `/smis/special-operation-management/${scenario.path}`,
        component: `/smis/special-operation-management/${scenario.path}`,
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
      await page.route('**/rest/v1/rpc/smis_list_special_operation_types_secure', (route) =>
        route.fulfill({ json: { records: [], total: 0 } })
      )
      const rows = Array.from({ length: 10001 }, (_, index) => ({
        id: `permit-${index}`,
        tenantId: tenant.id,
        permitNo: `PERMIT-${String(index).padStart(5, '0')}`,
        operationTypeId: 'type-0',
        operationTypeCode: 'HOT_WORK',
        operationTypeName: '动火',
        workContent: '测试作业内容',
        workStartTime: '2026-10-01T00:00:00Z',
        workEndTime: '2026-10-01T01:00:00Z',
        workLocation: '测试作业区',
        relatedPermits: [{ id: 'related', permitNo: 'RELATED-0', operationTypeName: '高处' }],
        applicantName: '测试申请人',
        applicationTime: '2026-10-01T00:00:00Z',
        currentNode: '未提交',
        status: 'draft'
      }))
      const offsets: number[] = []
      await page.route(
        '**/rest/v1/rpc/smis_list_special_operation_permits_secure',
        async (route) => {
          const query = route.request().postDataJSON()
          const from = Number(query.p_from)
          const to = Number(query.p_to)
          expect(query.p_tenant_id).toBe(tenant.id)
          expect(query.p_operation_type_code).toBe(scenario.code)
          if (to - from + 1 === 500) {
            expect(query.p_status).toBe('draft')
            offsets.push(from)
          }
          await route.fulfill({
            json: {
              records: incomplete && from >= 500 ? [] : rows.slice(from, to + 1),
              total: rows.length,
              overview: {
                total: rows.length,
                draft: rows.length,
                pendingApproval: 0,
                rejected: 0,
                inProgress: 0,
                pendingAcceptance: 0,
                completed: 0,
                voided: 0
              }
            }
          })
        }
      )
      await page.goto(`#/smis/special-operation-management/${scenario.path}`, {
        waitUntil: 'domcontentloaded'
      })
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
        timeout: 60_000
      })
      const identity = page.getByText('PERMIT-00000', { exact: true })
      await expect(identity).toBeVisible()
      const draft = page.getByRole('radio', { name: /草稿/ })
      await page.locator('.el-segmented__item').filter({ has: draft }).click()
      await expect(draft).toBeChecked()
      const button = page.getByRole('button', { name: '导出', exact: true })
      if (incomplete) {
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
        if (!file) throw new Error('未生成特殊作业台账导出文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(10002)
        expect(sheet.getCell('A2').text).toBe('PERMIT-00000')
        expect(sheet.getCell('A10002').text).toBe('PERMIT-10000')
        expect(sheet.getCell('E2').text).toBe('高处')
        expect(offsets).toEqual(Array.from({ length: 21 }, (_, index) => index * 500))
      }
      await expect(identity).toBeVisible()
      await expect(draft).toBeChecked()
      if (!incomplete) {
        const layout = await page
          .locator('.special-operation-permit-page__workspace')
          .evaluate((node) => {
            const style = getComputedStyle(node)
            return { display: style.display, direction: style.flexDirection, gap: style.gap }
          })
        expect(layout).toEqual({ display: 'flex', direction: 'column', gap: '12px' })
        await assertTableFocusContract(page, testInfo, ['.special-operation-permit-page__status'])
        await expect(draft).toBeChecked()
      }
    })
  }
}
