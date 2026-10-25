import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

for (const incomplete of [false, true]) {
  test(`安全管理供应商${incomplete ? '拒绝缺失导出页' : '完整导出中文分类超过一万条'}`, async ({
    page
  }) => {
    test.setTimeout(180_000)
    await prepareIsolatedSession(page)
    const menu = {
      id: 'smis-supplier-menu',
      parentId: null,
      name: 'SmisSupplier',
      path: '/smis/basic-data/supplier',
      component: '/smis/basic-data/supplier',
      type: 'menu',
      sort: 1,
      meta: { title: '供应商', is_enable: true, is_hide: false, roles: [] }
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
      id: `supplier-${index}`,
      supplierCode: `SUP-${String(index).padStart(5, '0')}`,
      supplierName: `测试供应商-${index}`,
      supplierCategory: 'inspection_agency',
      supplierType: 'key',
      enterpriseNature: 'private',
      industry: 'manufacturing'
    }))
    const offsets: number[] = []
    await page.route('**/rest/v1/rpc/smis_list_suppliers_secure', async (route) => {
      const query = route.request().postDataJSON()
      const from = Number(query.p_from)
      const to = Number(query.p_to)
      if (query.p_purpose === 'export') {
        expect(to - from + 1).toBe(500)
        expect(query.p_ids).toBeNull()
        offsets.push(from)
      }
      await route.fulfill({
        json: {
          records:
            incomplete && query.p_purpose === 'export' && from >= 500
              ? []
              : records.slice(from, to + 1),
          total: records.length,
          overview: {
            total: records.length,
            keySuppliers: records.length,
            categoryCount: 1,
            contactComplete: 0
          }
        }
      })
    })
    await page.goto('#/smis/basic-data/supplier', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '供应商', exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(page.getByText('测试供应商-0', { exact: true })).toBeVisible()
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
      if (!file) throw new Error('未生成供应商导出文件')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(file)
      const sheet = workbook.worksheets[0]
      expect(sheet.rowCount).toBe(10002)
      expect(sheet.getCell('A2').text).toBe('SUP-00000')
      expect(sheet.getCell('A10002').text).toBe('SUP-10000')
      expect(sheet.getCell('C2').text).toBe('检验机构')
      expect(sheet.getCell('E2').text).toBe('重点供应商')
      expect(sheet.getCell('F2').text).toBe('民营')
      expect(sheet.getCell('G2').text).toBe('生产制造业')
      expect(offsets).toEqual(Array.from({ length: 21 }, (_, index) => index * 500))
    }
    await expect(page.getByText('测试供应商-0', { exact: true })).toBeVisible()
  })
}
