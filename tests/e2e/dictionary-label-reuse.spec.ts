import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const mode of ['supplier', 'service']) {
  test(`${mode}复用公共字典查找并保留未知值与空值`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: route.request().url().includes('hr_get_service_request_detail_secure')
          ? {
              id: 'service-test',
              tenant_id: 'test-tenant',
              request_no: 'REQ-001',
              title: '字典复用测试工单',
              status: 'draft',
              priority: 'high',
              channel: 'unknown-channel',
              actions: [],
              events: [],
              attachment_urls: []
            }
          : []
      })
    )
    await page.goto(`/tests/e2e/fixtures/dictionary-label-reuse.html?mode=${mode}`)
    const contract = page.getByTestId('label-contract')
    await expect(page.getByTestId('sequence-label-contract')).toHaveText(
      JSON.stringify({
        main: '标准序列',
        parallel: '配置的并行序列',
        named: '备用序列名称',
        unknown: 'future',
        null: '—',
        empty: '—',
        absent: '—',
        routeEmpty: ''
      })
    )
    await expect(contract).toHaveText(
      JSON.stringify({
        known: '已配置标签',
        unknown: '未知回退',
        blank: '',
        zero: '零值标签',
        null: '空值回退',
        absent: '空值回退',
        legacy: ''
      })
    )
    const displayContract = page.getByTestId('display-label-contract')
    await expect(displayContract).toHaveText(
      JSON.stringify({
        known: '已配置标签',
        blank: '空标签名称',
        unknown: 'unknown',
        zero: '零值标签',
        null: '—',
        absent: '—',
        empty: '—'
      })
    )
    await page.getByRole('button', { name: '更新字典标签', exact: true }).click()
    await expect(contract).toContainText('更新标签')
    await expect(displayContract).toContainText('更新标签')
    await expect(page.getByTestId('sequence-label-contract')).toContainText('配置的标准序列')
    await page.getByRole('button', { name: '打开业务详情', exact: true }).click()
    const drawer = page.getByRole('dialog').first()
    await expect(drawer).toBeVisible()
    if (mode === 'supplier') {
      await expect(drawer.getByText('测试供应商类别', { exact: true })).toBeVisible()
      await expect(drawer).toContainText('unknown-type')
      await expect(drawer).toContainText('—')
    } else {
      await expect(drawer.getByText('测试工单状态', { exact: true })).toBeVisible()
      await expect(drawer).toContainText('测试优先级')
      await expect(drawer).toContainText('unknown-channel')
    }
    await page.screenshot({
      path: info.outputPath('dictionary-detail.png'),
      animations: 'disabled'
    })
    expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    const bounds = await drawer.boundingBox()
    const viewport = page.viewportSize()
    expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0)
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1)
    expect(errors).toEqual([])
  })
}

for (const mode of ['ppe', 'tool']) {
  test(`${mode}发放列表和导出复用公共单位标签`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({
        json: path.endsWith('/material_unit_compatibility_options')
          ? [
              {
                value: 'unit-test',
                label: '测试单位',
                sort: 0,
                dictTypeTable: { code: 'smisMaterialUnit', name: '计量单位' }
              }
            ]
          : path.endsWith(`/smis_list_${mode}_issuance_records_secure`)
            ? {
                records: [
                  {
                    id: 'issuance-test',
                    issuanceNo: 'ISSUE-001',
                    issueDate: '2026-10-09',
                    employeeNo: 'EMP-001',
                    employeeName: '测试领用人',
                    status: 'draft',
                    items: [
                      { materialName: '测试物料', issueQuantity: 2, unit: 'unit-test' },
                      { materialName: '未知单位物料', issueQuantity: 1, unit: '未知单位' }
                    ]
                  }
                ],
                total: 1,
                organizations: [],
                employees: []
              }
            : route.request().method() === 'GET'
              ? []
              : { records: [], total: 0 },
        headers: { 'content-range': '0-0/1' }
      })
    })
    await page.goto(`/tests/e2e/fixtures/issuance-import-reuse.html?mode=${mode}&scope=all`)
    const row = page.getByRole('row').filter({ hasText: 'ISSUE-001' })
    await expect(row).toContainText('测试物料 × 2测试单位')
    await expect(row).toContainText('未知单位物料 × 1未知单位')
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出', exact: true }).click()
    const path = await (await pending).path()
    if (!path) throw new Error('未生成发放导出文件')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(path)
    expect(workbook.worksheets[0].getCell('I2').value).toBe(
      '测试物料 2测试单位；未知单位物料 1未知单位'
    )
    await page.screenshot({ path: info.outputPath('issuance-unit-export.png') })
    expect(errors).toEqual([])
  })
}
