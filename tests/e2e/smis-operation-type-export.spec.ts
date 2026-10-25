import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

for (const incomplete of [false, true]) {
  test(`作业类型${incomplete ? '拒绝缺失导出页' : '完整导出超过一万条及中文状态'}`, async ({
    page
  }) => {
    test.setTimeout(180_000)
    const tenant = await prepareIsolatedSession(page)
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/sys_dictionary?*', (route) =>
      route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'enabled',
            label: '启用',
            value: 'enabled',
            status: '1',
            sort: 1,
            dict_type_table: { code: 'commonEnabledDisabledVoidedStatus', name: '状态' }
          }
        ]
      })
    )
    const menu = {
      id: 'operation-type-menu',
      parentId: null,
      name: 'SmisSpecialOperationType',
      path: '/smis/special-operation-management/operation-type',
      component: '/smis/special-operation-management/operation-type',
      type: 'menu',
      sort: 1,
      meta: { title: '作业类型', is_enable: true, is_hide: false, roles: [] }
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
    const rows = Array.from({ length: 10001 }, (_, index) => ({
      id: `type-${index}`,
      tenantId: tenant.id,
      typeCode: `TYPE-${String(index).padStart(5, '0')}`,
      typeName: `测试作业-${index}`,
      remark: null,
      sort: index,
      textColor: null,
      tagStyle: 'success',
      status: 'enabled',
      fieldCount: 0,
      fieldDefinitions: [],
      createTime: '2026-10-01T00:00:00Z',
      createBy: null
    }))
    const offsets: number[] = []
    await page.route('**/rest/v1/rpc/smis_list_special_operation_types_secure', async (route) => {
      const query = route.request().postDataJSON()
      const from = Number(query.p_from)
      const to = Number(query.p_to)
      expect(query.p_tenant_id).toBe(tenant.id)
      if (to - from + 1 === 500) offsets.push(from)
      await route.fulfill({
        json: {
          records: incomplete && from >= 500 ? [] : rows.slice(from, to + 1),
          total: rows.length,
          overview: {
            total: rows.length,
            enabled: rows.length,
            disabled: 0,
            voided: 0,
            customFields: 0
          }
        }
      })
    })
    await page.goto('#/smis/special-operation-management/operation-type', {
      waitUntil: 'domcontentloaded'
    })
    await expect(page.getByRole('heading', { name: '作业类型', exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(page.getByTitle('测试作业-0', { exact: true })).toBeVisible()
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
      if (!file) throw new Error('未生成作业类型导出文件')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(file)
      const sheet = workbook.worksheets[0]
      expect(sheet.rowCount).toBe(10002)
      expect(sheet.getCell('A2').text).toBe('TYPE-00000')
      expect(sheet.getCell('A10002').text).toBe('TYPE-10000')
      expect(sheet.getCell('G2').text).toBe('启用')
      expect(offsets).toEqual(Array.from({ length: 21 }, (_, index) => index * 500))
    }
    await expect(page.getByTitle('测试作业-0', { exact: true })).toBeVisible()
  })
}
