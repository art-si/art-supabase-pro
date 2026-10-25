import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })

for (const scenario of [
  {
    kind: 'warehouse',
    path: 'warehouse-definition',
    name: 'SmisHazardousWasteWarehouseDefinition',
    title: '仓库定义',
    rpc: 'smis_list_hazardous_waste_warehouses_secure',
    direction: null
  },
  {
    kind: 'catalog',
    path: 'hazardous-waste-catalog',
    name: 'SmisHazardousWasteCatalog',
    title: '危废名录',
    rpc: 'smis_list_hazardous_waste_catalog_secure',
    direction: null
  },
  {
    kind: 'document',
    path: 'hazardous-waste-inbound',
    name: 'SmisHazardousWasteInbound',
    title: '危废入库',
    rpc: 'smis_list_hazardous_waste_documents_secure',
    direction: 'inbound'
  },
  {
    kind: 'document',
    path: 'hazardous-waste-outbound',
    name: 'SmisHazardousWasteOutbound',
    title: '危废出库',
    rpc: 'smis_list_hazardous_waste_documents_secure',
    direction: 'outbound'
  }
]) {
  const modes =
    scenario.kind === 'warehouse'
      ? (['complete', 'incomplete', 'selected', 'underreported', 'authorized'] as const)
      : (['complete', 'incomplete', 'selected', 'authorized'] as const)
  for (const mode of modes) {
    test(`${scenario.title}导出-${mode}`, async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const tenant = await prepareIsolatedSession(page)
      await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
      const menu = {
        id: 'hazardous-waste-menu',
        parentId: null,
        name: scenario.name,
        path: `/smis/hazardous-waste-management/${scenario.path}`,
        component: `/smis/hazardous-waste-management/${scenario.path}`,
        type: 'menu',
        sort: 1,
        meta: { title: scenario.title, is_enable: true, is_hide: false, roles: [] }
      }
      await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
        route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
      )
      await mockApplicationMenus(page, {
        smis: [
          menu,
          ...(mode === 'authorized'
            ? ['View', 'Export', 'Edit', 'Delete', 'Submit', 'Review']
            : ['View', 'Export']
          ).map((action) => ({
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
      const dictionaries = [
        { code: 'commonEnabledDisabledStatus', value: 'enabled', label: '启用' },
        { code: 'smisHazardousWasteDocumentStatus', value: 'draft', label: '草稿' },
        { code: 'smisMaterialUnit', value: 'kg', label: '千克' },
        { code: 'smisHazardousWasteSafetyMeasure', value: 'sealed', label: '密闭贮存' },
        { code: 'smisHazardousWasteCharacteristic', value: 'toxic', label: '有毒性' }
      ].map((item) => ({
        id: item.code,
        value: item.value,
        label: item.label,
        status: '1',
        sort: 1,
        dict_type_table: { code: item.code, name: item.code }
      }))
      await page.route('**/rest/v1/sys_dictionary?*', (route) =>
        route.fulfill({
          headers: { 'content-range': '0-4/5', 'access-control-expose-headers': 'content-range' },
          json: dictionaries
        })
      )
      const category = {
        id: 'category-1',
        tenantId: tenant.id,
        parentId: null,
        categoryCode: 'CAT-1',
        categoryName: '测试危废分类',
        sort: 1,
        tagStyle: 'success',
        status: 'enabled'
      }
      const records = Array.from({ length: 10001 }, (_, index) => {
        const code = `WASTE-${String(index).padStart(5, '0')}`
        return {
          id: `waste-${index}`,
          tenantId: tenant.id,
          warehouseCode: code,
          warehouseName: `测试仓库-${index}`,
          keeperEmployeeName: '测试库管员',
          keeperEmployeeNo: 'TEST-K',
          responsibleEmployeeName: '测试负责人',
          responsibleEmployeeNo: 'TEST-R',
          regionPath: ['测试省', '测试市'],
          addressDetail: '测试库区',
          wasteCode: code,
          wasteName: `测试危废-${index}`,
          categoryId: category.id,
          category,
          safetyMeasure: 'sealed',
          hazardCharacteristic: 'toxic',
          unit: 'kg',
          documentNo: code,
          operationDate: '2026-10-01',
          handlerEmployeeName: '测试经办人',
          handlerEmployeeNo: 'TEST-H',
          description: '测试说明',
          items: [{ id: `item-${index}`, wasteName: '测试危废', quantity: 2, unit: 'kg' }],
          quantity: 2,
          status: scenario.kind === 'document' ? 'draft' : 'enabled',
          tagStyle: 'success',
          sort: index,
          createTime: '2026-10-01T00:00:00Z'
        }
      })
      const offsets: number[] = []
      await page.route(`**/rest/v1/rpc/${scenario.rpc}`, async (route) => {
        const query = route.request().postDataJSON()
        const from = Number(query.p_from)
        const to = Number(query.p_to)
        const source = query.p_ids?.length ? [records[500]] : records
        if (to - from + 1 === 500) {
          offsets.push(from)
          expect(query.p_purpose).toBe('export')
          if (scenario.direction) expect(query.p_direction).toBe(scenario.direction)
          else expect(query.p_ids).toEqual(mode === 'selected' ? ['waste-500'] : null)
          if (scenario.kind === 'catalog') expect(query.p_category_id).toBe(category.id)
        }
        await route.fulfill({
          json: {
            records: mode === 'incomplete' && from >= 500 ? [] : source.slice(from, to + 1),
            total: mode === 'underreported' ? 0 : source.length,
            categories: [category],
            overview: {
              total: source.length,
              enabled: source.length,
              managed: source.length,
              regionCount: 1,
              categoryCount: 1,
              characteristicCount: 1,
              draft: source.length,
              pending: 0,
              approved: 0,
              rejected: 0,
              quantity: source.length * 2
            }
          }
        })
      })
      if (scenario.kind === 'document')
        await page.route('**/rest/v1/rpc/smis_list_hazardous_waste_warehouses_secure', (route) =>
          route.fulfill({
            json: {
              records: [records[0]],
              total: 1,
              overview: { total: 1, enabled: 1, managed: 1, regionCount: 1 }
            }
          })
        )
      await page.goto(`#${menu.path}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
        timeout: 60_000
      })
      const body = page.locator('.art-table-query .el-table__body-wrapper').first()
      await expect(body.getByText('WASTE-00000', { exact: true })).toBeVisible()
      const operationHeader = page
        .locator('.art-table-query')
        .getByRole('columnheader', { name: '操作', exact: true })
      if (mode === 'authorized') {
        await expect(operationHeader).toBeVisible()
        const firstRow = body.locator('tr.el-table__row').first()
        await expect(
          firstRow.getByRole('button', {
            name: scenario.kind === 'document' ? '提交' : '编辑',
            exact: true
          })
        ).toBeVisible()
        if (scenario.kind !== 'document')
          await expect(firstRow.getByRole('button', { name: '删除', exact: true })).toBeVisible()
        await assertTableFocusContract(
          page,
          testInfo,
          scenario.kind === 'catalog' ? ['.hazardous-category-nav'] : []
        )
        return
      }
      await expect(operationHeader).toHaveCount(0)
      if (scenario.kind === 'catalog')
        await page
          .locator('.hazardous-category-nav')
          .getByText(category.categoryName, { exact: true })
          .click()
      if (mode === 'selected') {
        const jump = page.locator('.el-pagination__jump input')
        await jump.fill('26')
        await jump.press('Enter')
        await expect(body.getByText('WASTE-00500', { exact: true })).toBeVisible()
        await body.locator('tr.el-table__row').first().locator('.el-checkbox').click()
      }
      const button = page
        .getByLabel(mode === 'selected' ? '批量操作' : '页面主要操作', { exact: true })
        .getByRole('button', { name: mode === 'selected' ? '导出选中' : '导出', exact: true })
      if (mode === 'incomplete' || mode === 'underreported') {
        const downloads: string[] = []
        page.on('download', (download) => downloads.push(download.suggestedFilename()))
        await button.click()
        await expect(
          page.getByText(
            mode === 'underreported'
              ? '数据总数与记录不一致，请刷新后重试'
              : '数据未完整加载，请刷新后重试',
            { exact: true }
          )
        ).toBeVisible()
        await expect(button).toBeEnabled()
        expect(downloads).toEqual([])
        expect(offsets).toEqual(mode === 'underreported' ? [0] : [0, 500])
      } else {
        const downloaded = page.waitForEvent('download')
        await button.click()
        const file = await (await downloaded).path()
        if (!file) throw new Error('未生成危废导出文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(mode === 'selected' ? 2 : 10002)
        expect(sheet.getCell('A2').text).toBe(mode === 'selected' ? 'WASTE-00500' : 'WASTE-00000')
        if (mode === 'complete') expect(sheet.getCell('A10002').text).toBe('WASTE-10000')
        if (scenario.kind === 'warehouse') {
          expect(sheet.getCell('E2').text).toBe('测试省 / 测试市 / 测试库区')
          expect(sheet.getCell('F2').text).toBe('启用')
        } else if (scenario.kind === 'catalog') {
          expect(sheet.getCell('C2').text).toBe(category.categoryName)
          expect(sheet.getCell('E2').text).toBe('密闭贮存')
          expect(sheet.getCell('F2').text).toBe('有毒性')
          expect(sheet.getCell('G2').text).toBe('千克')
          expect(sheet.getCell('H2').text).toBe('启用')
        } else {
          expect(sheet.getCell('E2').text).toBe('测试危废 × 2千克')
          expect(sheet.getCell('F2').text).toBe('草稿')
        }
        expect(offsets).toEqual(
          mode === 'selected' && !scenario.direction
            ? [0]
            : Array.from({ length: 21 }, (_, index) => index * 500)
        )
      }
      await expect(
        body.getByText(mode === 'selected' ? 'WASTE-00500' : 'WASTE-00000', { exact: true })
      ).toBeVisible()
      if (mode === 'complete')
        await assertTableFocusContract(
          page,
          testInfo,
          scenario.kind === 'catalog' ? ['.hazardous-category-nav'] : []
        )
    })
  }
}
