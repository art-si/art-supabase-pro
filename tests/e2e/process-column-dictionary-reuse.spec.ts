import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
test('工序表公共字典覆盖配置标签、未知值、空值及布尔值', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const fields = [
    ['operation_mode', 'mdmProcessOperationMode', '作业类型'],
    ['processing_mode', 'mdmProcessingMode', '加工类型'],
    ['report_mode', 'mdmReportMode', '汇报方式'],
    ['inspection_mode', 'mdmInspectionMode', '检验方式'],
    ['sequence_control', 'mdmSequenceControl', '汇报顺序控制'],
    ['rework_mode', 'mdmReworkMode', '返工方式'],
    ['first_inspection_control', 'mdmProcessSequenceControlMode', '首检控制方式']
  ]
  const booleans = [
    ['need_inspection', '工序质检'],
    ['first_inspection', '首检'],
    ['is_first', '首序'],
    ['is_last', '末序'],
    ['critical', '关键']
  ]
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let json: object = []
    if (path.endsWith('/mdm_process_route'))
      json = [
        {
          id: 'route-number',
          tenant_id: 'test-tenant',
          code: 'ROUTE-DICT',
          name: '公共字典验证路线',
          material: null
        }
      ]
    if (path.endsWith('/mdm_process_route_sequence'))
      json = [
        {
          id: 'sequence-number',
          route_id: 'route-number',
          sequence_no: 1,
          sequence_type: 'main',
          remark: ''
        }
      ]
    if (path.endsWith('/mdm_process_route_step'))
      json = ['known', 'future', ''].map((value, index) => ({
        id: `step-${index}`,
        tenant_id: 'test-tenant',
        route_id: 'route-number',
        sequence_id: 'sequence-number',
        code: String(10 + index),
        name: `字典验证工序${index}`,
        sort: index,
        ...Object.fromEntries(fields.map(([field]) => [field, value])),
        ...Object.fromEntries(
          booleans.map(([field], position) => [
            field,
            index === 2 ? null : position % 2 === index % 2
          ])
        )
      }))
    if (path.endsWith('/sys_dictionary')) {
      const code = url.searchParams.get('dict_type_table.code')?.replace('eq.', '')
      const field = fields.find(([, candidate]) => candidate === code)
      json = field
        ? [{ label: `配置${field[2]}`, value: 'known', status: '1' }]
        : code === 'commonBoolean'
          ? [
              { label: '配置的是', value: 'true', status: '1' },
              { label: '配置的否', value: 'false', status: '1' }
            ]
          : []
    }
    if (path.endsWith('/rpc/mdm_process_route_references'))
      json = {
        groups: [],
        operations: [],
        controlCodes: [],
        units: [],
        departments: [],
        workCenters: [],
        activityFormulas: [],
        suppliers: [],
        esopDocuments: []
      }
    const count = Array.isArray(json) ? json.length : 0
    return route.fulfill({
      json,
      headers: {
        'content-range': count ? `0-${count - 1}/${count}` : '*/0',
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/process-number-reuse.html')
  await page.getByRole('button', { name: '查看工艺数量' }).click()
  const workspace = page.locator('.route-maintenance__steps')
  const table = workspace.locator('.art-table')
  await expect(table.locator('.el-table__body tbody tr')).toHaveCount(3)
  const headers = (await table.locator('.el-table__header th').allTextContents()).map((value) =>
    value.trim()
  )
  const rows = table.locator('.el-table__body tbody tr')
  for (const [, , label] of fields) {
    const column = headers.indexOf(label)
    expect(column).toBeGreaterThan(-1)
    await expect(rows.nth(0).locator('td').nth(column)).toHaveText(`配置${label}`)
    await expect(rows.nth(1).locator('td').nth(column)).toHaveText('future')
    await expect(rows.nth(2).locator('td').nth(column)).toHaveText('--')
  }
  for (const [, label] of booleans) {
    const column = headers.indexOf(label)
    expect(column).toBeGreaterThan(-1)
    const position = booleans.findIndex(([, candidate]) => candidate === label)
    await expect(rows.nth(0).locator('td').nth(column)).toHaveText(
      position % 2 === 0 ? '配置的是' : '配置的否'
    )
    await expect(rows.nth(1).locator('td').nth(column)).toHaveText(
      position % 2 === 1 ? '配置的是' : '配置的否'
    )
    await expect(rows.nth(2).locator('td').nth(column)).toHaveText('--')
  }
  await rows.nth(0).locator('td').nth(headers.indexOf('作业类型')).scrollIntoViewIfNeeded()
  await table.screenshot({ path: info.outputPath('process-column-labels.png') })
  await rows.nth(0).locator('td').nth(headers.indexOf('首检控制方式')).scrollIntoViewIfNeeded()
  await table.screenshot({ path: info.outputPath('process-column-booleans.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})
