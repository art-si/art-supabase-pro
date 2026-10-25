import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const scenario of [
  { path: 'work-item', kind: 'work_item', name: 'SmisWorkItem', title: '作业项目' },
  { path: 'work-category', kind: 'work_category', name: 'SmisWorkCategory', title: '作业类别' },
  {
    path: 'permitted-operation-item',
    kind: 'permitted_operation_item',
    name: 'SmisPermittedOperationItem',
    title: '准操项目'
  }
]) {
  for (const incomplete of [false, true]) {
    test(`${scenario.title}分页导出 ${incomplete ? 'incomplete' : 'complete'}`, async ({
      page
    }, testInfo) => {
      const tenant = await prepareIsolatedSession(page)
      const path = `/smis/qualification-training/safety-qualification-management/${scenario.path}`
      const menu = {
        id: 'qualification-catalog-test',
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
        id: `catalog-${index}`,
        tenantId: tenant.id,
        catalogType: scenario.kind,
        itemCode: `CODE-${index}`,
        itemName: `测试资质-${index}`,
        parentId: null,
        parentName: null,
        workCategoryId: null,
        workCategoryName: '测试类别',
        sort: index,
        status: 'enabled',
        remark: '测试备注',
        childCount: 0
      }))
      const offsets: number[] = []
      await page.route('**/rest/v1/rpc/smis_list_qualification_catalog_secure', (route) => {
        const query = route.request().postDataJSON()
        expect(query.p_catalog_type).toBe(scenario.kind)
        if (query.p_purpose === 'export') {
          expect(query.p_to - query.p_from + 1).toBe(500)
          expect(query.p_keyword).toBeNull()
          expect(query.p_ancestor_id).toBeNull()
          expect(query.p_work_category_id).toBeNull()
          offsets.push(query.p_from)
        }
        return route.fulfill({
          json: {
            records:
              incomplete && query.p_purpose === 'export' && query.p_from >= 500
                ? []
                : records.slice(query.p_from, Math.min(query.p_to + 1, query.p_from + 1000)),
            total: records.length,
            tree: [],
            workCategories: [],
            overview: {
              total: records.length,
              enabled: records.length,
              disabled: 0,
              rootCount: records.length
            }
          }
        })
      })
      await page.goto(`#${path}`)
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
        timeout: 60_000
      })
      await expect(
        page.locator('.el-table__body-wrapper').getByText('测试资质-0', { exact: true }).first()
      ).toBeVisible()
      const button = page.getByRole('button', { name: '导出', exact: true })
      if (incomplete) {
        const downloads: string[] = []
        page.on('download', (download) => downloads.push(download.suggestedFilename()))
        await button.click()
        await expect(page.getByText('数据未完整加载，请刷新后重试', { exact: true })).toBeVisible()
        expect(downloads).toEqual([])
        expect(offsets).toEqual([0, 500])
      } else {
        const pending = page.waitForEvent('download')
        await button.click()
        const file = await (await pending).path()
        if (!file) throw new Error('资质目录导出未生成文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(5002)
        const column = scenario.kind === 'permitted_operation_item' ? 3 : 2
        expect(sheet.getRow(5002).getCell(column).value).toBe('测试资质-5000')
        expect(offsets).toEqual(Array.from({ length: 11 }, (_, index) => index * 500))
        await assertTableFocusContract(page, testInfo, ['.qualification-catalog-page__workspace'])
      }
      await expect(button).toBeEnabled()
      await page.screenshot({
        path: testInfo.outputPath('qualification-export.png'),
        fullPage: true
      })
    })
  }
}
