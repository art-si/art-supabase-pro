import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })

for (const scenario of [
  {
    path: 'inspection-type',
    name: 'SmisDualControlInspectionType',
    title: '排查类型',
    table: 'smis_inspection_type',
    identityColumn: 'A',
    statusColumn: 'F',
    tagColumn: 'E',
    contexts: []
  },
  {
    path: 'inspection-standard',
    name: 'SmisDualControlInspectionStandard',
    title: '排查标准',
    table: 'smis_inspection_item',
    identityColumn: 'A',
    statusColumn: 'F',
    tagColumn: 'E',
    contexts: ['.inspection-standard-page__navigation-card', '.inspection-standard-page__scope']
  },
  {
    path: 'duplicate-configuration',
    name: 'SmisDualControlDuplicateConfiguration',
    title: '重复配置',
    table: 'smis_duplicate_configuration',
    identityColumn: 'B',
    statusColumn: 'J',
    tagColumn: 'I',
    contexts: []
  },
  {
    path: 'safety-inspection',
    name: 'SmisDualControlSafetyInspection',
    title: '安全检查',
    table: null,
    identityColumn: 'B',
    statusColumn: null,
    tagColumn: null,
    contexts: ['.safety-inspection-navigator']
  }
]) {
  const modes =
    scenario.path === 'inspection-standard'
      ? (['complete', 'incomplete', 'selected', 'authorized', 'tree_retry'] as const)
      : (['complete', 'incomplete', 'selected', 'authorized'] as const)
  for (const mode of modes) {
    test(`${scenario.title}导出-${mode}`, async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const tenant = await prepareIsolatedSession(page)
      await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
      const menu = {
        id: 'inspection-menu',
        parentId: null,
        name: scenario.name,
        path: `/smis/dual-control-system/risk-control/${scenario.path}`,
        component: `/smis/dual-control-system/risk-control/${scenario.path}`,
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
            ? ['View', 'Export', 'Edit', 'Delete']
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
        { code: 'commonEnabledDisabledVoidedStatus', value: 'enabled', label: '启用' },
        { code: 'smisTagStyle', value: 'success', label: '成功' },
        { code: 'smisFrequencyUnit', value: 'day', label: '天' }
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
          headers: { 'content-range': '0-2/3', 'access-control-expose-headers': 'content-range' },
          json: dictionaries
        })
      )
      await page.route('**/rest/v1/rpc/smis_list_configurable_menus_secure', (route) =>
        route.fulfill({
          json: [{ id: 'linked-menu', title: '测试功能', name: 'Test', path: '/test' }]
        })
      )
      const standardRows = [
        {
          id: 'standard-root',
          tenant_id: tenant.id,
          parent_id: null,
          standard_code: 'STD-ROOT',
          standard_name: '测试根标准',
          sort: 1,
          status: 'enabled'
        },
        {
          id: 'standard-child',
          tenant_id: tenant.id,
          parent_id: 'standard-root',
          standard_code: 'STD-CHILD',
          standard_name: '测试子标准',
          sort: 2,
          status: 'enabled'
        },
        ...Array.from({ length: 999 }, (_, index) => ({
          id: `standard-extra-${index}`,
          tenant_id: tenant.id,
          parent_id: null,
          standard_code: `STD-${index}`,
          standard_name: index === 998 ? '测试末页标准' : `测试补充标准-${index}`,
          sort: index + 3,
          status: 'enabled'
        }))
      ]
      const standardOffsets: number[] = []
      let standardFailure = mode === 'tree_retry'
      await page.route('**/rest/v1/smis_inspection_standard?*', (route) => {
        const url = new URL(route.request().url())
        const from = Number(url.searchParams.get('offset'))
        const limit = Number(url.searchParams.get('limit'))
        expect(limit).toBe(500)
        expect(url.searchParams.get('tenant_id')).toBe(`eq.${tenant.id}`)
        expect(url.searchParams.get('order')).toContain('id.asc')
        standardOffsets.push(from)
        if (standardFailure && from >= 500)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '排查标准加载失败，请重试。' }
          })
        return route.fulfill({ json: standardRows.slice(from, from + Math.min(limit, 1000)) })
      })
      await page.route('**/rest/v1/rpc/smis_list_safety_inspection_options_secure', (route) =>
        route.fulfill({
          json: {
            inspectionTypes: [
              { id: 'selected-type', typeName: '测试排查类型', typeCode: 'SELECTED' }
            ],
            organizations: []
          }
        })
      )
      const records = Array.from({ length: 10001 }, (_, index) => {
        const code = `CHECK-${String(index).padStart(5, '0')}`
        return {
          id: `record-${index}`,
          tenant_id: tenant.id,
          type_code: code,
          type_name: `测试类型-${index}`,
          item_code: code,
          inspection_content: '测试检查内容',
          standard_id: 'standard-child',
          content_item: code,
          menu_id: 'linked-menu',
          repeat_enabled: true,
          repeat_frequency: 2,
          frequency_unit: 'day',
          calendar_type: 'week',
          calendar_days: [1, 3],
          sort: index,
          tag_style: 'success',
          status: 'enabled',
          inspection_name: code,
          inspection_type_name: '测试排查类型',
          inspection_time: '2026-10-01T00:00:00Z',
          inspection_organization_name: '测试检查单位',
          inspected_organization_name: '测试被检查单位',
          inspector_names: '测试检查人',
          inspectors: [],
          plan_attachment_urls: [],
          create_time: '2026-10-01T00:00:00Z',
          create_by: '测试登记人'
        }
      })
      const offsets: number[] = []
      let selectedScope = false
      if (scenario.table) {
        await page.route(`**/rest/v1/${scenario.table}?*`, async (route) => {
          const url = new URL(route.request().url())
          const from = Number(url.searchParams.get('offset') ?? 0)
          const size = Number(url.searchParams.get('limit') ?? 20)
          const selectedIds = url.searchParams.get('id')
          const source = selectedIds ? [records[500]] : records
          expect(url.searchParams.get('tenant_id')).toBe(`eq.${tenant.id}`)
          if (size === 500) {
            offsets.push(from)
            expect(selectedIds).toBe(mode === 'selected' ? 'in.(record-500)' : null)
            if (scenario.path === 'inspection-standard')
              expect(url.searchParams.get('standard_id')).toBe('in.(standard-root,standard-child)')
          }
          const data = mode === 'incomplete' && from >= 500 ? [] : source.slice(from, from + size)
          await route.fulfill({
            headers: {
              'content-range': data.length
                ? `${from}-${from + data.length - 1}/${source.length}`
                : `*/${source.length}`,
              'access-control-expose-headers': 'content-range'
            },
            json: data
          })
        })
      } else {
        await page.route('**/rest/v1/rpc/smis_list_safety_inspections_secure', async (route) => {
          const query = route.request().postDataJSON()
          const from = Number(query.p_from)
          const to = Number(query.p_to)
          if (to - from + 1 === 500) {
            offsets.push(from)
            expect(query.p_inspection_type_id).toBe('selected-type')
          }
          const data = mode === 'incomplete' && from >= 500 ? [] : records.slice(from, to + 1)
          await route.fulfill({
            json: {
              records: data,
              total: records.length,
              overview: {
                total: records.length,
                thisMonth: records.length,
                organizationCount: 1,
                inspectorCount: 1
              }
            }
          })
        })
      }
      await page.goto(`#${menu.path}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
        timeout: 60_000
      })
      const body = page.locator('.art-table-query .el-table__body-wrapper').first()
      await expect(body.getByText('CHECK-00000', { exact: true })).toBeVisible()
      if (scenario.path === 'inspection-standard') {
        const navigation = page.locator('.inspection-standard-page__navigation-card')
        if (mode === 'tree_retry') {
          await expect(
            navigation.getByText('排查标准加载失败，请重试。', { exact: true })
          ).toBeVisible()
          await expect(navigation.getByText('暂无排查标准', { exact: true })).toHaveCount(0)
          expect(standardOffsets).toEqual([0, 500])
          const retry = navigation.getByRole('button', { name: '重新加载', exact: true })
          const primary = navigation
            .locator('xpath=ancestor::*[contains(@class, "art-workspace-splitter__primary")]')
            .first()
          const primaryBox = await primary.boundingBox()
          const retryBox = await retry.boundingBox()
          if (!primaryBox || !retryBox) throw new Error('无法读取标准树重试按钮位置')
          expect(retryBox.y + retryBox.height).toBeLessThanOrEqual(
            primaryBox.y + primaryBox.height + 1
          )
          await navigation.screenshot({ path: testInfo.outputPath('standard-tree-error.png') })
          standardFailure = false
          await navigation.getByRole('button', { name: '重新加载', exact: true }).click()
        }
        await expect
          .poll(() => standardOffsets)
          .toEqual(mode === 'tree_retry' ? [0, 500, 0, 500, 1000] : [0, 500, 1000])
        const search = navigation.getByPlaceholder('筛选标准名称或编号')
        await search.fill('测试末页标准')
        await expect(navigation.getByText('测试末页标准', { exact: true })).toBeVisible()
        if (mode === 'tree_retry') {
          await navigation.screenshot({ path: testInfo.outputPath('standard-tree-recovered.png') })
          return
        }
        await search.fill('')
      }

      const operationHeader = page
        .locator('.art-table-query')
        .getByRole('columnheader', { name: '操作', exact: true })
      if (mode === 'authorized') {
        await expect(operationHeader).toBeVisible()
        const firstRow = body.locator('tr.el-table__row').first()
        await expect(
          firstRow.getByRole('button', {
            name: `编辑${scenario.path === 'inspection-standard' ? '排查项' : scenario.title}`,
            exact: true
          })
        ).toBeVisible()
        if (scenario.path !== 'safety-inspection')
          await expect(
            firstRow.getByRole('button', {
              name: `删除${scenario.path === 'inspection-standard' ? '排查项' : scenario.title}`,
              exact: true
            })
          ).toBeVisible()
        await assertTableFocusContract(page, testInfo, scenario.contexts)
        return
      }
      await expect(operationHeader).toHaveCount(0)
      if (scenario.path === 'inspection-standard') {
        await page
          .locator('.inspection-standard-page__navigation-card')
          .getByText('测试根标准', { exact: true })
          .click()
        selectedScope = true
      } else if (scenario.path === 'safety-inspection') {
        await page
          .locator('.safety-inspection-navigator')
          .getByRole('button', { name: '测试排查类型 SELECTED', exact: true })
          .click()
        selectedScope = true
      }
      if (selectedScope) await expect(body.getByText('CHECK-00000', { exact: true })).toBeVisible()
      if (mode === 'selected') {
        const jump = page.locator('.el-pagination__jump input')
        await jump.fill('26')
        await jump.press('Enter')
        await expect(body.getByText('CHECK-00500', { exact: true })).toBeVisible()
        await body.locator('tr.el-table__row').first().locator('.el-checkbox').click()
      }
      const button = page
        .getByLabel(mode === 'selected' ? '批量操作' : '页面主要操作', { exact: true })
        .getByRole('button', {
          name: mode === 'selected' && scenario.table ? '导出选中' : '导出',
          exact: true
        })
      if (mode === 'incomplete') {
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
        if (!file) throw new Error('未生成排查导出文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(mode === 'selected' ? 2 : 10002)
        expect(sheet.getCell(`${scenario.identityColumn}2`).text).toBe(
          mode === 'selected' ? 'CHECK-00500' : 'CHECK-00000'
        )
        if (mode === 'complete')
          expect(sheet.getCell(`${scenario.identityColumn}10002`).text).toBe('CHECK-10000')
        if (scenario.statusColumn)
          expect(sheet.getCell(`${scenario.statusColumn}2`).text).toBe('启用')
        if (scenario.tagColumn) expect(sheet.getCell(`${scenario.tagColumn}2`).text).toBe('成功')
        if (scenario.path === 'duplicate-configuration') {
          expect(sheet.getCell('A2').text).toBe('测试功能')
          expect(sheet.getCell('D2').text).toBe('每 2 天')
          expect(sheet.getCell('E2').text).toBe('每周 周一、周三')
        }
        expect(offsets).toEqual(
          mode === 'selected' && scenario.table
            ? [0]
            : Array.from({ length: 21 }, (_, index) => index * 500)
        )
      }
      await expect(
        body.getByText(mode === 'selected' ? 'CHECK-00500' : 'CHECK-00000', { exact: true })
      ).toBeVisible()
      if (mode === 'complete') await assertTableFocusContract(page, testInfo, scenario.contexts)
    })
  }
}
