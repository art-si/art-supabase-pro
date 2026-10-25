import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

for (const scenario of [
  {
    path: 'safety-checklist',
    kind: 'safety_checklist',
    name: 'SmisSpecialOperationSafetyChecklist',
    title: '安全检查表'
  },
  {
    path: 'hazard-factor',
    kind: 'hazard_factor',
    name: 'SmisSpecialOperationHazardFactor',
    title: '危害因素'
  },
  {
    path: 'site-analysis-form',
    kind: 'site_analysis',
    name: 'SmisSpecialOperationSiteAnalysisForm',
    title: '现场分析表'
  }
]) {
  for (const incomplete of [false, true]) {
    test(`${scenario.title}${incomplete ? '拒绝缺失导出页' : '完整导出超过一万条配置'}`, async ({
      page
    }, testInfo) => {
      test.setTimeout(180_000)
      const tenant = await prepareIsolatedSession(page)
      await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
      const menu = {
        id: 'catalog-menu',
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
      const rows = Array.from({ length: 10001 }, (_, index) => ({
        id: `item-${index}`,
        tenantId: tenant.id,
        catalogKind: scenario.kind,
        operationTypeId: 'type-0',
        operationTypeCode: 'TYPE-0',
        operationTypeName: '测试作业类型',
        itemName: `测试配置-${index}`,
        recordType: 'text',
        normalValue: '正常',
        abnormalValue: '异常',
        sort: index,
        textColor: null,
        tagStyle: 'success',
        status: 'enabled',
        createTime: '2026-10-01T00:00:00Z',
        createBy: null
      }))
      const typeRecords = Array.from({ length: 1001 }, (_, index) => ({
        id: `type-${index}`,
        typeName: `测试作业类型-${index}`,
        typeCode: `TYPE-${index}`,
        status: 'enabled',
        sort: index
      }))
      const typeOffsets: number[] = []
      let navigationFailure = incomplete
      await page.route('**/rest/v1/rpc/smis_list_special_operation_types_secure', (route) => {
        const query = route.request().postDataJSON()
        const from = Number(query.p_from)
        const to = Number(query.p_to)
        typeOffsets.push(from)
        expect(to - from + 1).toBe(500)
        return route.fulfill({
          json: {
            records:
              navigationFailure && from >= 500
                ? []
                : typeRecords.slice(from, Math.min(to + 1, from + 1000)),
            total: typeRecords.length
          }
        })
      })
      const offsets: number[] = []
      await page.route(
        '**/rest/v1/rpc/smis_list_special_operation_catalog_secure',
        async (route) => {
          const query = route.request().postDataJSON()
          const from = Number(query.p_from)
          const to = Number(query.p_to)
          expect(query.p_catalog_kind).toBe(scenario.kind)
          expect(query.p_tenant_id).toBe(tenant.id)
          expect(query.p_operation_type_id).toBeNull()
          if (to - from + 1 === 500) offsets.push(from)
          await route.fulfill({
            json: {
              records: incomplete && from >= 500 ? [] : rows.slice(from, to + 1),
              total: rows.length,
              overview: { total: rows.length, enabled: rows.length, disabled: 0, voided: 0 }
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
      const identity = page
        .locator('.el-table__body-wrapper')
        .first()
        .getByText('测试配置-0', { exact: true })
      await expect(identity).toBeVisible()
      const navigator = page.getByRole('complementary', { name: '作业类型导航' })
      if (incomplete) {
        await expect(
          navigator.getByText('作业类型加载失败，请重试。', { exact: true })
        ).toBeVisible()
        await expect(navigator.getByPlaceholder('搜索作业类型')).toHaveCount(0)
        expect(typeOffsets).toEqual([0, 500])
        const retry = navigator.getByRole('button', { name: '重新加载', exact: true })
        const cardBox = await navigator.boundingBox()
        const retryBox = await retry.boundingBox()
        expect(cardBox).not.toBeNull()
        expect(retryBox).not.toBeNull()
        if (!cardBox || !retryBox) throw new Error('无法读取导航重试按钮位置')
        expect(retryBox.y + retryBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1)
        await navigator.screenshot({ path: testInfo.outputPath('navigation-error.png') })
        navigationFailure = false
        await navigator.getByRole('button', { name: '重新加载', exact: true }).click()
      }
      await expect
        .poll(() => typeOffsets)
        .toEqual(incomplete ? [0, 500, 0, 500, 1000] : [0, 500, 1000])
      await navigator.getByPlaceholder('搜索作业类型').fill('测试作业类型-1000')
      await expect(navigator.getByText('测试作业类型-1000', { exact: true })).toBeVisible()
      await navigator.screenshot({ path: testInfo.outputPath('navigation-complete.png') })
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
        if (!file) throw new Error('未生成特殊作业配置导出文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file)
        const sheet = workbook.worksheets[0]
        expect(sheet.rowCount).toBe(10002)
        expect(sheet.getCell('B2').text).toBe('测试配置-0')
        expect(sheet.getCell('B10002').text).toBe('测试配置-10000')
        if (scenario.kind === 'site_analysis') {
          expect(sheet.getCell('D2').text).toBe('正常')
          expect(sheet.getCell('E2').text).toBe('异常')
        }
        expect(offsets).toEqual(Array.from({ length: 21 }, (_, index) => index * 500))
      }
      await expect(identity).toBeVisible()
    })
  }
}
