import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

for (const [scenario, title] of [
  ['complete', '供应商完整导出超过一万条'],
  ['incomplete', '供应商拒绝缺失导出页并恢复按钮'],
  ['applied', '供应商导出沿用已应用的筛选']
] as const) {
  test(title, async ({ page }) => {
    test.setTimeout(180_000)
    const incomplete = scenario === 'incomplete'
    const verifyAppliedFilter = scenario === 'applied'
    const tenant = await prepareIsolatedSession(page)
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    const menu = {
      id: 'supplier-menu',
      parentId: null,
      name: 'MdmPurchaseSupplier',
      path: '/mdm/purchase-master/supplier',
      component: '/mdm/purchase-master/supplier',
      type: 'menu',
      sort: 1,
      meta: { title: '供应商', is_enable: true, is_hide: false, roles: [] }
    }
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({ json: [{ code: 'mdm', name: '测试主数据', baseUrl: '/mdm/' }] })
    )
    await mockApplicationMenus(page, {
      mdm: [
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
    const records = Array.from({ length: verifyAppliedFilter ? 2 : 10001 }, (_, index) => ({
      id: `supplier-${index}`,
      tenant_id: tenant.id,
      supplier_code: `SUP-${String(index).padStart(5, '0')}`,
      supplier_name: `测试供应商-${index}`,
      supplier_category: '',
      supplier_type: '',
      group_id: null,
      enterprise_nature: null,
      industry: null,
      contact_person: '测试联系人',
      contact_phone: null,
      address_detail: null,
      coordinate_system: 'wgs84',
      update_time: '2026-10-01T00:00:00Z'
    }))
    const requests: URL[] = []
    await page.route('**/rest/v1/mdm_supplier?*', async (route) => {
      const url = new URL(route.request().url())
      requests.push(url)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 20)
      const matches = url.searchParams.get('or')?.includes('SUP-00000')
        ? records.slice(0, 1)
        : records
      const rows = incomplete && offset >= 500 ? [] : matches.slice(offset, offset + limit)
      await route.fulfill({
        headers: {
          'content-range': rows.length
            ? `${offset}-${offset + rows.length - 1}/${matches.length}`
            : `*/${matches.length}`,
          'access-control-expose-headers': 'content-range'
        },
        json: rows
      })
    })
    await page.goto('#/mdm/purchase-master/supplier')
    await expect(page.getByRole('heading', { name: '供应商', exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(page.getByText('测试供应商-0', { exact: true })).toBeVisible()
    const button = page.getByRole('button', { name: '导出', exact: true })
    if (verifyAppliedFilter) {
      const otherSupplier = page.getByText('测试供应商-1', { exact: true })
      await expect(otherSupplier).toBeVisible()
      const keyword = page.getByPlaceholder('编码、名称、联系人或地址')
      const query = page.getByRole('button', { name: '查询', exact: true })
      await keyword.fill('SUP-00000')
      await query.click()
      await expect(otherSupplier).toHaveCount(0)
      expect(requests.at(-1)?.searchParams.get('or')).toContain('SUP-00000')

      await keyword.clear()
      await expect(otherSupplier).toHaveCount(0)
      requests.length = 0
      const download = page.waitForEvent('download')
      await button.click()
      const path = await (await download).path()
      if (!path) throw new Error('未生成供应商导出文件')
      expect(requests).toHaveLength(1)
      expect(requests[0].searchParams.get('tenant_id')).toBe(`eq.${tenant.id}`)
      expect(requests[0].searchParams.get('or')).toContain('SUP-00000')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(path)
      const sheet = workbook.worksheets[0]
      expect(sheet.rowCount).toBe(2)
      expect(sheet.getCell('A2').value).toBe('SUP-00000')
      await expect(otherSupplier).toHaveCount(0)

      await page.route(
        '**/rest/v1/mdm_supplier?*',
        (route) => route.fulfill({ status: 400, json: { message: 'isolated list error' } }),
        { times: 1 }
      )
      await query.click()
      await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
      await expect(button).toBeDisabled()
      await page.getByRole('button', { name: '重新加载', exact: true }).click()
      await expect(otherSupplier).toBeVisible()
      await expect(button).toBeEnabled()
      return
    }
    requests.length = 0
    if (incomplete) {
      const downloads: string[] = []
      page.on('download', (download) => downloads.push(download.suggestedFilename()))
      await button.click()
      await expect(page.getByText('数据未完整加载，请刷新后重试', { exact: true })).toBeVisible()
      await expect(button).toBeEnabled()
      expect(downloads).toEqual([])
      expect(requests.map((url) => Number(url.searchParams.get('offset')))).toEqual([0, 500])
    } else {
      const downloadPromise = page.waitForEvent('download')
      await button.click()
      const path = await (await downloadPromise).path()
      if (!path) throw new Error('未生成供应商导出文件')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(path)
      const sheet = workbook.worksheets[0]
      expect(sheet.rowCount).toBe(10002)
      expect(sheet.getCell('A2').value).toBe('SUP-00000')
      expect(sheet.getCell('A10002').value).toBe('SUP-10000')
      expect(sheet.getCell('D2').value).toBe('未分组')
      expect(requests.map((url) => Number(url.searchParams.get('offset')))).toEqual(
        Array.from({ length: 21 }, (_, index) => index * 500)
      )
    }
    for (const url of requests) {
      expect(url.searchParams.get('tenant_id')).toBe(`eq.${tenant.id}`)
      expect(url.searchParams.get('limit')).toBe('500')
    }
    await expect(page.getByText('测试供应商-0', { exact: true })).toBeVisible()
  })
}
