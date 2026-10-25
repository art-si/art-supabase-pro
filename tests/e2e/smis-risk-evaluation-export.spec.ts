import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const platformAll of [false, true]) {
  for (const incomplete of [false, true]) {
    test(`风险评价 ${platformAll ? 'platform-all' : 'ordinary-own'} ${incomplete ? 'incomplete' : 'complete'}`, async ({
      page
    }, testInfo) => {
      const tenant = await prepareIsolatedSession(page)
      await page.route('**/rest/v1/rpc/current_is_super', (route) =>
        route.fulfill({ json: platformAll })
      )
      const path = '/smis/dual-control-system/risk-control/risk-evaluation-control'
      const menu = {
        id: 'evaluation-export-test',
        parentId: null,
        name: 'SmisDualControlRiskEvaluationControl',
        path,
        component: path,
        type: 'menu',
        sort: 1,
        meta: { title: '风险评价及管控', is_enable: true, is_hide: false, roles: [] }
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
      await page.route('**/rest/v1/rpc/smis_list_active_hazard_factor_categories_secure', (route) =>
        route.fulfill({ json: [] })
      )
      const records = Array.from({ length: 5001 }, (_, index) => ({
        id: `risk-${index}`,
        tenant_id: tenant.id,
        item_no: `ITEM-${index}`,
        risk_point: '测试风险点',
        hazard_factor: `测试因素-${index}`,
        status: 'pending',
        sort: index,
        factorCategory: null,
        riskPointRecord: { id: 'point-test', point_no: 'POINT-TEST', point_name: '测试风险点' },
        evaluation: [],
        measures: [{ count: 0 }]
      }))
      const requests: URL[] = []
      await page.route('**/rest/v1/smis_risk_item?*', (route) => {
        const url = new URL(route.request().url())
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? 20)
        requests.push(url)
        expect(url.searchParams.get('tenant_id')).toBe(platformAll ? null : `eq.${tenant.id}`)
        const rows =
          incomplete && offset >= 500
            ? []
            : records.slice(offset, Math.min(offset + limit, offset + 1000))
        return route.fulfill({
          json: rows,
          headers: {
            'content-range': rows.length
              ? `${offset}-${offset + rows.length - 1}/${records.length}`
              : `*/${records.length}`,
            'access-control-expose-headers': 'content-range'
          }
        })
      })
      await page.goto(`#${path}`)
      await expect(page.getByRole('heading', { name: '风险评价及管控', exact: true })).toBeVisible({
        timeout: 60_000
      })
      await expect(page.getByText('ITEM-0', { exact: true })).toBeVisible()
      requests.length = 0
      const button = page.getByRole('button', { name: '导出评价及措施', exact: true })
      if (incomplete) {
        const downloads: string[] = []
        page.on('download', (download) => downloads.push(download.suggestedFilename()))
        await button.click()
        await expect(page.getByText('数据未完整加载，请刷新后重试', { exact: true })).toBeVisible()
        expect(downloads).toEqual([])
        expect(requests.map((url) => Number(url.searchParams.get('offset')))).toEqual([0, 500])
      } else {
        const pending = page.waitForEvent('download')
        await button.click()
        const file = await (await pending).path()
        if (!file) throw new Error('风险评价导出未生成文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(5002)
        expect(sheet.getCell('B5002').value).toBe('ITEM-5000')
        expect(sheet.getCell('C5002').value).toBe('测试因素-5000')
        expect(requests.map((url) => Number(url.searchParams.get('offset')))).toEqual(
          Array.from({ length: 11 }, (_, index) => index * 500)
        )
        await assertTableFocusContract(page, testInfo)
      }
      await expect(button).toBeEnabled()
      expect(requests.every((url) => url.searchParams.get('limit') === '500')).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath('risk-evaluation-export.png'),
        fullPage: true
      })
    })
  }
}
