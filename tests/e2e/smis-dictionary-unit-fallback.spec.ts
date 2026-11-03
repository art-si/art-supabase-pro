import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)

test('隐患排查计划和重复配置保留已知单位译名，未知单位不显示原始值', async ({ page }) => {
  await prepareIsolatedSession(page)
  const planPath =
    '/smis/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-plan'
  const duplicatePath = '/smis/dual-control-system/risk-control/duplicate-configuration'
  const menus = [
    { id: 'plan-menu', name: 'SmisDualControlHiddenHazardInspectionPlan', path: planPath },
    { id: 'duplicate-menu', name: 'SmisDualControlDuplicateConfiguration', path: duplicatePath }
  ].flatMap(({ id, name, path }) => {
    const menu = {
      id,
      parentId: null,
      name,
      path,
      component: path,
      type: 'menu',
      sort: 1,
      meta: {
        title: id === 'plan-menu' ? '隐患排查计划' : '重复配置',
        is_enable: true,
        is_hide: false,
        roles: []
      }
    }
    return [
      menu,
      ...['View', 'Export'].map((action) => ({
        ...menu,
        id: `${id}-${action}`,
        parentId: id,
        name: `${name}:${action}`,
        path: '',
        component: '',
        type: 'button'
      }))
    ]
  })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
  )
  await mockApplicationMenus(page, { smis: menus })
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    const requestedType = params.get('dict_type_table.code')?.replace(/^eq\./, '')
    const requestedValue = params.get('value')?.replace(/^eq\./, '')
    const items = [
      { type: 'commonDeadlineUnit', value: 'day', label: '天' },
      { type: 'smisFrequencyUnit', value: 'day', label: '天' }
    ]
      .filter(
        (item) =>
          (!requestedType || item.type === requestedType) &&
          (!requestedValue || item.value === requestedValue)
      )
      .map((item, index) => ({
        id: `unit-${index}`,
        code: item.value,
        value: item.value,
        label: item.label,
        status: '1',
        sort: index,
        dict_type_table: { code: item.type, name: item.type }
      }))
    return route.fulfill({ json: items })
  })

  const planRows = ['day', 'legacy-unit-code'].map((unit, index) => ({
    id: `plan-${index}`,
    planNo: `PLAN-${index}`,
    planName: `单位测试计划-${index}`,
    inspectionTypeId: 'type',
    inspectionTypeName: '测试排查',
    inspectionOrganizationId: 'org',
    inspectionOrganizationName: '测试检查单位',
    inspectedOrganizationId: 'target',
    inspectedOrganizationName: '测试被检单位',
    executorEmployeeId: 'employee',
    executorEmployeeName: '测试检查人',
    executorEmployeeNo: 'TEST-1',
    plannedStartAt: '2026-10-01T00:00:00Z',
    plannedEndAt: '2026-10-01T01:00:00Z',
    taskDeadlineValue: index + 2,
    taskDeadlineUnit: unit,
    cycleType: 'once',
    cycleInterval: 1,
    attachmentUrls: [],
    status: 'enabled',
    itemCount: 0,
    taskCount: 0,
    createTime: '2026-10-01T00:00:00Z'
  }))
  await page.route('**/rest/v1/rpc/smis_list_hidden_hazard_inspection_plans_secure', (route) =>
    route.fulfill({
      json: {
        records: planRows,
        total: 2,
        overview: { total: 2, enabled: 2, disabled: 0, voided: 0 }
      }
    })
  )
  await page.goto(`#${planPath}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '隐患排查计划', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const planTable = page.locator('.el-table__body-wrapper').first()
  await expect(planTable.getByRole('row').filter({ hasText: 'PLAN-0' })).toContainText('2 天')
  await expect(planTable.getByRole('row').filter({ hasText: 'PLAN-1' })).toContainText(
    '3 未识别时限单位'
  )
  await expect(planTable).not.toContainText('legacy-unit-code')
  const planDownload = page.waitForEvent('download')
  await page
    .getByLabel('页面主要操作', { exact: true })
    .getByRole('button', { name: '导出', exact: true })
    .click()
  const planFile = await (await planDownload).path()
  if (!planFile) throw new Error('隐患排查计划导出文件未生成')
  const planWorkbook = new ExcelJS.Workbook()
  await planWorkbook.xlsx.readFile(planFile)
  expect(planWorkbook.worksheets[0].getCell('G2').text).toBe('2天')
  expect(planWorkbook.worksheets[0].getCell('G3').text).toBe('3未识别时限单位')

  const duplicateRows = ['day', 'legacy-unit-code'].map((unit, index) => ({
    id: `duplicate-${index}`,
    tenantId: 'permission-test-tenant',
    menuId: 'feature-menu',
    menu: { id: 'feature-menu', title: '测试功能' },
    contentItem: `重复配置-${index}`,
    repeatEnabled: true,
    repeatFrequency: index + 2,
    frequencyUnit: unit,
    calendarType: 'week',
    calendarDays: [1],
    sort: index,
    tagStyle: 'primary',
    status: 'enabled',
    createTime: '2026-10-01T00:00:00Z',
    updateTime: '2026-10-01T00:00:00Z'
  }))
  await page.route('**/rest/v1/rpc/smis_list_configurable_menus_secure', (route) =>
    route.fulfill({ json: [{ id: 'feature-menu', title: '测试功能' }] })
  )
  await page.route('**/rest/v1/smis_duplicate_configuration?*', (route) =>
    route.fulfill({
      json: duplicateRows,
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
    })
  )
  await page.goto(`#${duplicatePath}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '重复配置', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const duplicateTable = page.locator('.el-table__body-wrapper').first()
  await expect(duplicateTable.getByRole('row').filter({ hasText: '重复配置-0' })).toContainText(
    '每 2 天'
  )
  await expect(duplicateTable.getByRole('row').filter({ hasText: '重复配置-1' })).toContainText(
    '每 3 未识别频率单位'
  )
  await expect(duplicateTable).not.toContainText('legacy-unit-code')
  const duplicateDownload = page.waitForEvent('download')
  await page
    .getByLabel('页面主要操作', { exact: true })
    .getByRole('button', { name: '导出', exact: true })
    .click()
  const duplicateFile = await (await duplicateDownload).path()
  if (!duplicateFile) throw new Error('重复配置导出文件未生成')
  const duplicateWorkbook = new ExcelJS.Workbook()
  await duplicateWorkbook.xlsx.readFile(duplicateFile)
  expect(duplicateWorkbook.worksheets[0].getCell('D2').text).toBe('每 2 天')
  expect(duplicateWorkbook.worksheets[0].getCell('D3').text).toBe('每 3 未识别频率单位')
})
