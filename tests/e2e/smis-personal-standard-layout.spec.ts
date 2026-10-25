import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)

for (const scenario of [
  {
    kind: 'tool',
    name: 'SmisToolPersonalStandard',
    title: '工器具个人标准',
    path: '/smis/safety-production/tool-requisition/tool-personal-standard'
  },
  {
    kind: 'ppe',
    name: 'SmisPpePersonalStandard',
    title: '防护用品个人标准',
    path: '/smis/safety-production/protective-equipment-management/ppe-personal-standard'
  }
]) {
  test(`${scenario.title}共享样式、失败重试与空状态`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareIsolatedSession(page)
    await prepareAppearance(page, {
      theme: testInfo.project.name.includes('dark') ? 'dark' : 'light',
      boxBorderMode: !testInfo.project.name.includes('shadow')
    })
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
        {
          ...menu,
          id: `${menu.id}-View`,
          parentId: menu.id,
          name: `${menu.name}:View`,
          type: 'button',
          path: '',
          component: ''
        },
        {
          ...menu,
          id: `${menu.id}-Export`,
          parentId: menu.id,
          name: `${menu.name}:Export`,
          type: 'button',
          path: '',
          component: ''
        },
        ...['Generate', 'Schedule'].map((permission) => ({
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
      route.fulfill({ json: [{ id: 'scope-test', name: '测试组织岗位', code: 'TEST', sort: 1 }] })
    )
    let empty = false
    let failure = false
    let exportRequests = 0
    await page.route(
      `**/rest/v1/rpc/smis_list_${scenario.kind}_personal_standards_secure`,
      (route) => {
        if (route.request().postDataJSON().p_purpose === 'export') exportRequests += 1
        if (failure)
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'database unavailable' }
          })
        return route.fulfill({
          json: {
            records: empty
              ? []
              : [
                  {
                    employeeId: 'employee-test',
                    employeeNo: 'EMP-TEST',
                    employeeName: '测试员工',
                    organizationName: '测试组织',
                    positionName: '测试岗位',
                    personalStandardId: 'standard-test',
                    generatedAt: '2026-10-05T08:00:00Z',
                    status: 'enabled',
                    itemCount: 2
                  }
                ],
            total: empty ? 0 : 1,
            overview: {
              employeeTotal: empty ? 0 : 1,
              generatedTotal: empty ? 0 : 1,
              missingTotal: 0,
              itemTotal: empty ? 0 : 2
            }
          }
        })
      }
    )
    await page.goto(`#${scenario.path}`)
    await expect(page.locator('html')).toHaveAttribute(
      'data-box-mode',
      testInfo.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    )
    if (testInfo.project.name.includes('dark'))
      await expect(page.locator('html')).toHaveClass(/dark/)
    else await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
      timeout: 120_000
    })
    const root = page.locator('.smis-personal-standard')
    const employee = root.locator('.smis-personal-standard__employee')
    await expect(employee).toContainText('测试员工')
    await expect(employee).toContainText('EMP-TEST')
    await expect(employee).toHaveCSS('display', 'flex')
    await expect(employee).toHaveCSS('text-align', 'left')
    const actions = root.locator('.el-table__body .business-table-row-actions').first()
    await expect(actions).toHaveCount(1)
    await expect(actions.locator('.art-button-table')).toHaveCount(3)
    await expect(actions).toHaveCSS('gap', '8px')
    await actions.scrollIntoViewIfNeeded()
    const bounds = await actions.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const cell = element.closest('td')!.getBoundingClientRect()
      return { right: box.right, cellRight: cell.right }
    })
    expect(bounds.right).toBeLessThanOrEqual(bounds.cellRight)
    await page.screenshot({
      path: testInfo.outputPath('personal-standard-actions.png'),
      animations: 'disabled'
    })
    await employee.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('personal-standard-populated.png'),
      animations: 'disabled'
    })
    await assertTableFocusContract(page, testInfo)
    const keyword = page.getByPlaceholder('姓名、工号或岗位', { exact: true })
    const search = page.getByRole('button', { name: '查询', exact: true })
    const metric = root.locator('.business-workspace-header__metric').first().locator('strong')
    failure = true
    await keyword.fill('保留筛选')
    await search.click()
    const table = root.locator('.art-table-query')
    await expect(table.getByText('数据加载失败', { exact: true })).toBeVisible()
    await expect(root.getByText('当前范围暂无员工', { exact: true })).toHaveCount(0)
    await expect(keyword).toHaveValue('保留筛选')
    await expect(metric).toHaveText('1')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.getByText('database unavailable', { exact: true })).toHaveCount(0)
    failure = false
    await table.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(employee).toContainText('测试员工')
    await expect(keyword).toHaveValue('保留筛选')
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    const exportButton = page.getByRole('button', { name: '导出', exact: true })
    failure = true
    await exportButton.click()
    await expect.poll(() => exportRequests).toBe(1)
    const exportError = page.locator('.el-message--error')
    await expect(exportError).toHaveCount(1)
    await expect(exportError).not.toContainText('database unavailable')
    await expect(exportButton).toBeEnabled()
    expect(downloads).toEqual([])
    failure = false
    const downloaded = page.waitForEvent('download')
    await exportButton.click()
    const download = await downloaded
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/)
    const file = await download.path()
    if (!file) throw new Error('未生成个人标准导出文件')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(file)
    const sheet = workbook.worksheets[0]
    expect(sheet.rowCount).toBe(2)
    expect(sheet.getCell('A2').text).toBe('EMP-TEST')
    expect(sheet.getCell('B2').text).toBe('测试员工')
    empty = true
    await page.getByPlaceholder('姓名、工号或岗位', { exact: true }).fill('空范围')
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(root.getByText('当前范围暂无员工', { exact: true })).toBeVisible()
    await expect(root.locator('.smis-personal-standard__employee')).toHaveCount(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: testInfo.outputPath('personal-standard-empty.png'),
      animations: 'disabled'
    })
    expect(errors).toEqual([])
  })
}
