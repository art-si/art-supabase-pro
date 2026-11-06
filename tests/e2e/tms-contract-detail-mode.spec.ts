import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const customerId = '11111111-1111-4111-8111-111111111112'
const contractId = '22222222-2222-4222-8222-222222222222'
const contract = {
  id: contractId,
  tenantId: '11111111-1111-4111-8111-111111111111',
  contractNo: 'HT-DETAIL-001',
  contractName: '验收明细框架合同',
  contractStatus: 'approved',
  businessContractType: 'customer',
  contractCategory: 'annual_framework',
  transportMode: 'road',
  customerId,
  customer: { id: customerId, customerName: '验收客户' },
  billingMethod: 'by_weight',
  billingUnit: 'ton',
  signTime: '2026-10-01T00:00:00Z',
  handler: '验收经办人',
  effectiveDate: '2026-10-01',
  expiryDate: '2027-10-01',
  attachments: [],
  transportDetails: [
    { cargoCode: 'CARGO-A', cargoDescription: '钢材甲', contractQuantity: 10, unit: 'ton' },
    { cargoCode: 'CARGO-B', cargoDescription: '钢材乙', contractQuantity: 20, unit: 'ton' }
  ]
}
const detailRows = contract.transportDetails.map((line, index) => ({
  ...contract,
  transportDetails: undefined,
  detailRowKey: `${contractId}:${index + 1}`,
  detailIndex: index + 1,
  detailCargoCode: line.cargoCode,
  detailCargoDescription: line.cargoDescription,
  detailContractQuantity: line.contractQuantity,
  detailUnit: line.unit
}))
const dictionaryRows = [
  ['tmsContractBusinessType', 'customer', '企业/货主端合同'],
  ['tmsContractCategory', 'annual_framework', '年度框架'],
  ['tmsContractTransportMode', 'road', '公路'],
  ['tmsContractBillingMethod', 'by_weight', '按重量'],
  ['tmsCargoUnit', 'ton', '吨'],
  ['commonBoolean', 'true', '是'],
  ['commonBoolean', 'false', '否']
].map(([code, value, label], index) => ({
  id: `dict-${index}`,
  value,
  label,
  name: label,
  status: '1',
  sort: index,
  dict_type_table: { code, name: code }
}))

test('运输合同切换按明细后查询后端明细分页并导出每一行', async ({ page }) => {
  const documentRequests: Array<Record<string, unknown>> = []
  const detailRequests: Array<Record<string, unknown>> = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    const request = route.request().postDataJSON() as Record<string, unknown> | null
    if (endpoint === 'tms_list_contracts_secure') {
      if (request) documentRequests.push(request)
      return route.fulfill({ json: { records: [contract], total: 1, fieldAccess: {} } })
    }
    if (endpoint === 'tms_list_contract_detail_rows_secure') {
      if (request) detailRequests.push(request)
      return route.fulfill({ json: { records: detailRows, total: 2, fieldAccess: {} } })
    }
    if (endpoint === 'sys_dictionary') {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      return route.fulfill({
        json: code
          ? dictionaryRows.filter((row) => row.dict_type_table.code === code)
          : dictionaryRows
      })
    }
    if (endpoint === 'material_unit_compatibility_options')
      return route.fulfill({
        json: [
          {
            id: 'unit-ton',
            code: 'ton',
            value: 'ton',
            label: '吨',
            name: '吨',
            status: '1',
            sort: 1,
            dict_type_table: { code: 'tmsCargoUnit', name: '计量单位' }
          }
        ]
      })
    if (endpoint === 'tms_list_customer_options_secure')
      return route.fulfill({ json: [contract.customer] })
    if (endpoint === 'tms_list_carrier_options_secure') return route.fulfill({ json: [] })
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/tms-contract-customer-tab.html')
  await expect(page.getByText('验收明细框架合同')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('#contract-customer-tab .el-pagination__total')).toContainText('1')
  for (const label of ['合同类别', '计费单位', '客户/货主', '业务联系人', '签约日期']) {
    await expect(
      page.locator('#contract-customer-tab').getByRole('columnheader', { name: label })
    ).toBeVisible()
  }
  await expect(
    page.locator('#contract-customer-tab').getByText('年度框架', { exact: true })
  ).toBeVisible()
  await expect(
    page.locator('#contract-customer-tab').getByText('吨', { exact: true })
  ).toBeVisible()
  await page.getByText('按明细', { exact: true }).click()
  await expect(page.getByText('钢材甲')).toBeVisible()
  await expect(page.getByText('钢材乙')).toBeVisible()
  await expect(page.locator('#contract-customer-tab .el-pagination__total')).toContainText('2')
  expect(documentRequests[0]?.p_customer_id).toBe(customerId)
  expect(detailRequests[0]?.p_customer_id).toBe(customerId)
  expect(detailRequests[0]?.p_purpose).toBe('list')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  const download = await downloadPromise
  const filePath = await download.path()
  if (!filePath) throw new Error('合同明细导出未生成')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  expect(workbook.worksheets[0].rowCount).toBe(3)
  const exportedValues = Object.values(workbook.worksheets[0].getRow(2).values).map(String)
  expect(exportedValues).toContain('企业/货主端合同')
  expect(exportedValues).toContain('年度框架')
  expect(exportedValues).toContain('公路')
  expect(exportedValues).toContain('吨')
  expect(detailRequests.at(-1)?.p_purpose).toBe('export')
  expect(errors).toEqual([])
})
