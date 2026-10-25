import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const scenarios = ['tool', 'ppe'].flatMap((kind) => {
  const prefix = kind === 'tool' ? '工器具' : '防护用品'
  const route = kind === 'tool' ? 'tool-requisition' : 'protective-equipment-management'
  const name = kind === 'tool' ? 'SmisTool' : 'SmisPpe'
  return [
    {
      kind,
      name: `${name}IssuanceStandard`,
      title: `${prefix}发放标准`,
      path: `/smis/safety-production/${route}/${kind}-issuance-standard`,
      rpc: `smis_list_${kind}_issuance_standards_secure`,
      placeholder: '搜索标准编号或名称',
      empty: '暂无发放标准',
      status: 'enabled'
    },
    {
      kind,
      name: `${name}PersonalRequisition`,
      title: `${prefix}个人领用`,
      path: `/smis/safety-production/${route}/${kind}-personal-requisition`,
      rpc: `smis_list_${kind}_personal_requisitions_secure`,
      placeholder: '领用单号、领用人或物料',
      empty: '暂无个人领用明细',
      status: 'pending'
    },
    {
      kind,
      name: `${name}IssuanceRecord`,
      title: `${prefix}发放记录`,
      path: `/smis/safety-production/${route}/${kind}-issuance-record`,
      rpc: `smis_list_${kind}_issuance_records_secure`,
      placeholder: '单据号、领用人或仓库',
      empty: `暂无${prefix}发放记录`,
      status: 'draft'
    }
  ]
})
scenarios.push({
  kind: 'tool',
  name: 'SmisToolRequisitionReturn',
  title: '工器具领用归还',
  path: '/smis/safety-production/tool-requisition/tool-requisition-return',
  rpc: 'smis_list_tool_returns_secure',
  placeholder: '归还单号、源单号、领用人或工器具',
  empty: '暂无工器具归还单',
  status: 'draft'
})

for (const scenario of scenarios) {
  test(`${scenario.title}失败保留、重试和导出`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const tenant = await prepareIsolatedSession(page)
    await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
    )
    const menu = {
      id: scenario.name,
      parentId: null,
      name: scenario.name,
      path: scenario.path,
      component: scenario.path,
      type: 'menu',
      sort: 1,
      meta: { title: scenario.title, is_enable: true, is_hide: false, roles: [] }
    }
    await mockApplicationMenus(page, {
      smis: [
        menu,
        ...[
          'View',
          'Export',
          'Add',
          ...(scenario.name.endsWith('IssuanceStandard') ? ['Edit', 'Delete'] : [])
        ].map((permission) => ({
          ...menu,
          id: `${menu.id}-${permission}`,
          parentId: menu.id,
          name: `${menu.name}:${permission}`,
          type: 'button',
          path: '',
          component: ''
        }))
      ]
    })
    await page.route(`**/rest/v1/rpc/smis_list_${scenario.kind}_scope_options_secure`, (route) =>
      route.fulfill({ json: [] })
    )
    await page.route(`**/rest/v1/rpc/smis_get_${scenario.kind}_setting_secure`, (route) =>
      route.fulfill({ json: { autoConfirmDays: 3 } })
    )
    let failure = false
    let exportRequests = 0
    const record = {
      id: 'record-test',
      tenantId: tenant.id,
      standardNo: 'RECORD-TEST',
      standardName: '测试标准',
      positions: [],
      organizations: [],
      details: [],
      ratedQuantity: 1,
      issuanceCycle: 'monthly',
      issuanceFrequency: 1,
      employeeId: 'employee-test',
      employeeName: '测试员工',
      employeeNo: 'EMP-TEST',
      requisitionNo: 'RECORD-TEST',
      requisitionId: 'requisition-test',
      materialId: 'material-test',
      materialName: '测试物料',
      imageUrls: [],
      unit: '件',
      quotaQuantity: 1,
      requestedQuantity: 1,
      quotaCycleMonths: 1,
      plannedIssueDate: '2026-10-05',
      issuanceNo: 'RECORD-TEST',
      warehouseId: 'warehouse-test',
      warehouseName: '测试仓库',
      issuerEmployeeId: 'issuer-test',
      issuerName: '测试发放人',
      issueDate: '2026-10-05',
      items: [],
      returnNo: 'RECORD-TEST',
      sourceDocumentNo: 'SOURCE-TEST',
      returnDate: '2026-10-05',
      status: scenario.status
    }
    await page.route(`**/rest/v1/rpc/${scenario.rpc}`, (route) => {
      if (route.request().postDataJSON().p_purpose === 'export') exportRequests += 1
      if (failure)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'database unavailable' }
        })
      return route.fulfill({
        json: {
          records: [record],
          total: 1,
          overview: {
            total: 1,
            enabled: 1,
            disabled: 0,
            detailTotal: 0,
            pending: 1,
            waitingConfirmation: 0,
            confirmed: 0,
            overdue: 0,
            draft: 1,
            posted: 0,
            today: 1,
            quantity: 0,
            pendingApproval: 0,
            approved: 0,
            rejected: 0
          }
        }
      })
    })
    await page.goto(`#${scenario.path}`)
    await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    const table = page.locator('.art-table-query')
    const row = table.getByText('RECORD-TEST', { exact: true }).first()
    await expect(row).toBeVisible()
    if (scenario.name.endsWith('IssuanceStandard')) {
      const actions = table
        .locator('tbody tr')
        .filter({ hasText: 'RECORD-TEST' })
        .first()
        .locator('.business-table-row-actions')
      await expect(actions).toHaveCount(1)
      await expect(actions.locator('.art-button-table')).toHaveCount(2)
      await expect(actions.locator('.business-table-row-actions')).toHaveCount(0)
      expect(await actions.evaluate((element) => getComputedStyle(element).gap)).toBe('8px')
      await actions.scrollIntoViewIfNeeded()
      expect(
        await actions.evaluate((element) => {
          const cell = element.closest('td')
          if (!cell) throw new Error('行操作缺少所属单元格')
          const boundary = cell.getBoundingClientRect()
          return [...element.querySelectorAll('.art-button-table')].every((button) => {
            const rect = button.getBoundingClientRect()
            return rect.left >= boundary.left && rect.right <= boundary.right
          })
        })
      ).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('row-actions.png') })
    }
    const metric = page.locator('.business-workspace-header__metric').first().locator('strong')
    await expect(metric).toHaveText('1')
    const keyword = page.getByPlaceholder(scenario.placeholder, { exact: true })
    if (!(await keyword.isVisible()))
      await table.getByRole('button', { name: '展开', exact: true }).click()
    failure = true
    await keyword.fill('保留筛选')
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(table.getByText('数据加载失败', { exact: true })).toBeVisible()
    await expect(table.getByText(scenario.empty, { exact: true })).toHaveCount(0)
    await expect(keyword).toHaveValue('保留筛选')
    await expect(metric).toHaveText('1')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    failure = false
    await table.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(row).toBeVisible()
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    const exportButton = page.getByRole('button', { name: '导出', exact: true })
    failure = true
    await exportButton.click()
    await expect.poll(() => exportRequests).toBe(1)
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    await expect(page.locator('.el-message--error')).not.toContainText('database unavailable')
    await expect(exportButton).toBeEnabled()
    expect(downloads).toEqual([])
    failure = false
    const downloaded = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloaded
    const file = await download.path()
    if (!file) throw new Error('未生成导出文件')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(file)
    expect(workbook.worksheets[0].rowCount).toBe(2)
    expect(workbook.worksheets[0].getCell('A2').text).toBe('RECORD-TEST')
    expect(errors).toEqual([])
    if (scenario.name.endsWith('IssuanceRecord')) {
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      let pickerFailure = true
      await page.route('**/rest/v1/rpc/smis_list_storage_locations_secure', (route) =>
        pickerFailure
          ? route.fulfill({ status: 503, json: { code: 'XX000', message: 'database unavailable' } })
          : route.fulfill({
              json: {
                records: [
                  { id: 'warehouse-test', locationCode: 'CK-001', locationName: '测试发放仓库' }
                ],
                total: 21
              }
            })
      )
      await page.getByRole('button', { name: '新增', exact: true }).click()
      await page.getByPlaceholder('请选择发放仓库', { exact: true }).click()
      const picker = page.getByRole('dialog', { name: '选择发放仓库', exact: true })
      await expect(picker.getByText('可选数据加载失败', { exact: true })).toBeVisible()
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      await expect(picker.getByText('暂无可用仓库', { exact: true })).toHaveCount(0)
      await picker.screenshot({
        path: testInfo.outputPath('picker-error.png'),
        animations: 'disabled'
      })
      pickerFailure = false
      await picker.getByRole('button', { name: '重新加载', exact: true }).click()
      await expect(picker.getByText('测试发放仓库', { exact: true })).toBeVisible()
      await expect(picker.locator('.el-pagination')).toBeVisible()
      const nextPageRequest = page.waitForRequest(
        (request) =>
          request.url().includes('/rpc/smis_list_storage_locations_secure') &&
          request.postDataJSON().p_from === 10
      )
      await picker.locator('.el-pagination .btn-next').click()
      await nextPageRequest
      await expect(picker.getByText('测试发放仓库', { exact: true })).toBeVisible()
      await picker.screenshot({
        path: testInfo.outputPath('picker-recovered.png'),
        animations: 'disabled'
      })
      await picker.getByRole('button', { name: '取消', exact: true }).click()
      await page.route('**/rest/v1/rpc/smis_list_materials_secure', (route) =>
        route.fulfill({
          json: {
            records: [
              {
                id: 'material-layout',
                materialName: '用于核验长名称换行与截断的专业作业物料测试名称',
                materialCode: 'MAT-001',
                category: { categoryName: '测试物料分类' },
                basicUnit: '件',
                materialType: scenario.kind,
                status: 'enabled'
              }
            ],
            total: 1
          }
        })
      )
      await page.getByPlaceholder('新增明细', { exact: true }).click()
      const materialPicker = page.getByRole('dialog', {
        name: scenario.kind === 'tool' ? '选择工器具' : '选择防护用品',
        exact: true
      })
      await expect(materialPicker.getByText('MAT-001', { exact: true })).toBeVisible()
      await materialPicker.locator('.el-table__body-wrapper .el-checkbox').first().click()
      await materialPicker.getByRole('button', { name: '确定', exact: true }).click()
      const identity = page
        .locator('.business-table-identity-cell')
        .filter({ hasText: '用于核验长名称' })
      await expect(identity).toBeVisible()
      await expect(identity.locator('strong')).toHaveAttribute(
        'title',
        '用于核验长名称换行与截断的专业作业物料测试名称'
      )
      await page.screenshot({
        path: testInfo.outputPath('issuance-shared-summary.png'),
        animations: 'disabled'
      })
    }
  })
}
