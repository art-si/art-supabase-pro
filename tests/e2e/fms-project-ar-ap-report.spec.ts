import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const rows = [
  {
    id: 'project-1',
    projectName: '国贸大厦8号项目',
    projectCode: 'PRJ-2026-008',
    customerName: '华东建设集团',
    ownerName: '张工',
    salespersonName: '李销售',
    quotationDate: '2026-09-01',
    quotationNo: 'BJ-202609-001',
    quotationAmount: 1800000,
    quotationTaxAmount: 2034000,
    contractSignedDate: '2026-09-12',
    contractName: '国贸大厦机电安装合同',
    contractNo: 'HT-2026-009',
    paperContractNo: '纸质-009',
    contractType: '销售合同',
    contractAmount: 1800000,
    contractTaxAmount: 2034000,
    salesAmount: 2034000,
    shippedAmount: 1200000,
    receivableAmount: 2034000,
    invoicedReceivableAmount: 800000,
    uninvoicedReceivableAmount: 1234000,
    receivedAmount: 500000,
    inboundAmount: 700000,
    payableAmount: 920000,
    invoicedPayableAmount: 200000,
    uninvoicedPayableAmount: 720000,
    paidAmount: 180000
  },
  {
    id: 'project-2',
    projectName: '机房装修工程项目',
    projectCode: 'PRJ-2026-021',
    customerName: '南方科技园',
    ownerName: '王工',
    salespersonName: '陈销售',
    quotationDate: '2026-09-18',
    quotationNo: 'BJ-202609-018',
    quotationAmount: 920000,
    quotationTaxAmount: 1039600,
    contractSignedDate: '2026-09-25',
    contractName: '机房装修工程总包合同',
    contractNo: 'HT-2026-021',
    paperContractNo: '纸质-021',
    contractType: '项目合同',
    contractAmount: 920000,
    contractTaxAmount: 1039600,
    salesAmount: 1039600,
    shippedAmount: 660000,
    receivableAmount: 1039600,
    invoicedReceivableAmount: 300000,
    uninvoicedReceivableAmount: 739600,
    receivedAmount: 200000,
    inboundAmount: 430000,
    payableAmount: 510000,
    invoicedPayableAmount: 100000,
    uninvoicedPayableAmount: 410000,
    paidAmount: 120000
  }
]

test('项目应收应付报表展示两条项目并支持窄屏滚动', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/rpc/fms_project_ar_ap_report_secure', (route) =>
    route.fulfill({ json: { records: rows, total: rows.length } })
  )
  await page.goto('/tests/e2e/fixtures/fms-project-ar-ap-report.html', {
    waitUntil: 'domcontentloaded'
  })
  const pageRoot = page.locator('.business-workspace-page')
  await expect(pageRoot.getByRole('heading', { name: '项目应收应付' })).toBeVisible()
  await expect(pageRoot.getByText('国贸大厦8号项目')).toBeVisible()
  await expect(pageRoot.getByText('机房装修工程项目')).toBeVisible()
  const tableHeader = pageRoot.locator('.el-table__header-wrapper')
  for (const group of ['报价', '合同', '应收', '应付']) {
    await expect(tableHeader.getByText(group, { exact: true })).toBeVisible()
  }
  await expect(tableHeader.getByText('未开票(元)', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: '.artifacts/fms-project-ar-ap-report-1440.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
  await page.screenshot({ path: '.artifacts/fms-project-ar-ap-report-390.png', fullPage: true })
  expect(errors).toEqual([])
})
