import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { omit } from 'lodash-es'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })

for (const mode of ['complete', 'selected', 'incomplete']) {
  test(`危险源台账分页导出 ${mode}`, async ({ page }) => {
    test.setTimeout(180_000)
    await prepareIsolatedSession(page)
    const menu = {
      id: 'hazard-source-menu',
      parentId: null,
      name: 'SmisHazardSourceLedger',
      path: '/smis/safety-production/emergency-rescue/hazard-source-ledger',
      component: '/smis/safety-production/emergency-rescue/hazard-source-ledger',
      type: 'menu',
      sort: 1,
      meta: { title: '危险源台账', is_enable: true, is_hide: false, roles: [] }
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
          { code: 'smisHazardSourceLevel', value: 'level_1', label: '一级' },
          { code: 'smisHazardSourceRiskLevel', value: 'high', label: '较大风险' },
          { code: 'commonDraftSubmittedStatus', value: 'draft', label: '草稿' }
        ].map((item, index) => ({
          id: `dictionary-${index}`,
          label: item.label,
          value: item.value,
          status: '1',
          sort: index,
          dict_type_table: { code: item.code, name: item.code }
        }))
      })
    )
    const records = Array.from({ length: 1001 }, (_, index) => ({
      id: `hazard-${index}`,
      hazardNo: `HAZARD-${index}`,
      hazardName: `测试危险源-${index}`,
      siteId: 'site-test',
      siteName: '测试场所',
      hazardLevel: 'level_1',
      riskLevel: 'high',
      controlOrganizationId: 'org-test',
      controlOrganizationName: '测试管控部门',
      responsibleEmployeeNo: `EMP-${index}`,
      quantity: index + 1,
      imageUrls: [],
      recordStatus: 'draft'
    }))
    const requests: Array<{ p_from: number; p_to: number; [key: string]: unknown }> = []
    await page.route('**/rest/v1/rpc/smis_list_hazard_sources_secure', async (route) => {
      const params: (typeof requests)[number] = route.request().postDataJSON()
      requests.push(params)
      await route.fulfill({
        json: {
          records:
            mode === 'incomplete' && params.p_from >= 500
              ? []
              : records.slice(params.p_from, Math.min(params.p_to + 1, params.p_from + 1000)),
          total: records.length,
          overview: { total: records.length, submitted: 0, majorRisk: 0, siteCount: 1 },
          sites: [{ id: 'site-test', parentId: null, siteName: '测试场所' }],
          organizations: []
        }
      })
    })
    await page.goto('#/smis/safety-production/emergency-rescue/hazard-source-ledger')
    await expect(page.getByRole('heading', { name: '危险源台账', exact: true })).toBeVisible({
      timeout: 120_000
    })
    await expect(page.getByText('测试危险源-0', { exact: true })).toBeVisible()
    await expect(page.getByText('一级', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    if (mode === 'selected') {
      await page.locator('.site-navigator').getByText('测试场所', { exact: true }).click()
      await expect.poll(() => requests.at(-1)?.p_site_id).toBe('site-test')
    }
    const filters = omit(requests.at(-1), ['p_from', 'p_to'])
    requests.length = 0
    const button = page.getByRole('button', { name: '导出', exact: true })
    if (mode === 'incomplete') {
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
      if (!path) throw new Error('未生成危险源台账文件')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(path)
      const sheet = workbook.worksheets[0]
      expect(sheet.rowCount).toBe(records.length + 1)
      expect(sheet.getRow(1002).getCell(1).value).toBe('测试危险源-1000')
      expect(sheet.getRow(1002).getCell(3).value).toBe('一级')
      expect(sheet.getRow(1002).getCell(4).value).toBe('较大风险')
      expect(sheet.getRow(1002).getCell(6).value).toBe('EMP-1000')
      expect(requests.map((request) => request.p_from)).toEqual([0, 500, 1000])
    }
    for (const request of requests) {
      expect(request.p_to - request.p_from + 1).toBe(500)
      expect(omit(request, ['p_from', 'p_to'])).toEqual(filters)
    }
    await expect(button).toBeEnabled()
    if (mode === 'complete') await assertTableFocusContract(page, test.info(), ['.site-navigator'])
    await page.screenshot({ path: test.info().outputPath('hazard-export.png'), fullPage: true })
    await page.locator('.el-pagination').scrollIntoViewIfNeeded()
    await expect(page.locator('.el-pagination')).toBeInViewport()
    await page.screenshot({ path: test.info().outputPath('hazard-export-lower.png') })
  })
}
