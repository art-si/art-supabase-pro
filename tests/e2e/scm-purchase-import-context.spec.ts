import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertTableFocusContract } from './support/table-focus'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
type PurchaseWrite = { tenant_id: string; kind: string; lines: unknown[]; remark: string }
type ImportKind = 'purchase_request' | 'purchase_order' | 'receipt_notice'
interface Capture {
  writes: PurchaseWrite[]
  unknownRest: string[]
  pageErrors: string[]
}

async function workbook(keys = ['A', 'B']): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('采购申请')
  sheet.addRow(['导入分组号', '申请日期（YYYY-MM-DD）', '物料编码', '数量'])
  keys.forEach((key) => sheet.addRow([key, '2026-11-03', 'MAT-A', 2]))
  return Buffer.from(await book.xlsx.writeBuffer())
}

async function referencedWorkbook(kind: 'purchase_order' | 'receipt_notice'): Promise<Buffer> {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('采购单据')
  if (kind === 'purchase_order') {
    sheet.addRow([
      '导入分组号',
      '项目编码',
      '供应商编码',
      '采购员工号',
      '订单日期（YYYY-MM-DD）',
      '物料编码',
      '采购数量',
      '不含税单价（元）',
      '税率（%）'
    ])
    sheet.addRow(['O-A', 'PRJ-A', 'SUP-A', 'BUY-A', '2026-11-03', 'MAT-A', 2, 12, 13])
  } else {
    sheet.addRow(['导入分组号', '供应商编码', '收料日期（YYYY-MM-DD）', '物料编码', '数量'])
    sheet.addRow(['R-A', 'SUP-A', '2026-11-03', 'MAT-A', 2])
  }
  return Buffer.from(await book.xlsx.writeBuffer())
}

async function upload(page: Page, buffer: Buffer): Promise<void> {
  await page.locator('input[type="file"]').first().setInputFiles({
    name: '采购申请.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer
  })
}

async function mount(page: Page, kind: ImportKind = 'purchase_request'): Promise<Capture> {
  const capture: Capture = { writes: [], unknownRest: [], pageErrors: [] }
  page.on('pageerror', (error) => capture.pageErrors.push(error.message))
  await prepareIsolatedSession(page)
  await page.unroute('**/rest/v1/**')
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1)
    const scopedTenant = url.searchParams.get('tenant_id')?.replace(/^eq\./, '') || tenantA
    const listHeaders = {
      'content-range': '*/0',
      'access-control-expose-headers': 'content-range'
    }
    if (name === 'scm_purchase_document' && request.method() === 'GET')
      return route.fulfill({ json: [], headers: listHeaders })
    if (name === 'scm_purchase_document' && request.method() === 'POST') {
      const payload = request.postDataJSON() as PurchaseWrite
      capture.writes.push(payload)
      return route.fulfill({
        json: {
          id: `created-${capture.writes.length}`,
          ...payload,
          status: 'draft',
          document_date: '2026-11-03'
        }
      })
    }
    if (name === 'mdm_project')
      return route.fulfill({
        json: [
          {
            id: `project-${scopedTenant}`,
            tenant_id: scopedTenant,
            project_code: 'PRJ-A',
            project_name: '测试项目',
            customer_id: null,
            project_status: 'active'
          }
        ],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    if (name === 'sys_dictionary') {
      const dictionaryQuery = url.searchParams.toString()
      const displayModes = [
        ['document', '按单据'],
        ['line', '按明细']
      ]
      return route.fulfill({
        json: dictionaryQuery.includes('scmTaxRate')
          ? [
              {
                id: 'tax-13',
                code: '13',
                value: '13',
                label: '13%',
                sort: 1,
                status: '1',
                dict_type_table: { code: 'scmTaxRate', name: '采购税率' }
              }
            ]
          : dictionaryQuery.includes('commonDocumentDisplayMode')
            ? displayModes.map(([value, label], index) => ({
                id: `display-${value}`,
                code: value,
                value,
                label,
                sort: index,
                status: '1',
                dict_type_table: { code: 'commonDocumentDisplayMode', name: '展示方式' }
              }))
            : [],
        headers: listHeaders
      })
    }
    if (
      name === 'sys_menu' ||
      name === 'sys_param' ||
      name === 'mdm_warehouse' ||
      name === 'mdm_warehouse_bin'
    )
      return route.fulfill({ json: [], headers: listHeaders })
    if (name === 'mdm_material' && request.method() === 'GET')
      return route.fulfill({
        json: [
          {
            id: `material-${scopedTenant}`,
            tenant_id: scopedTenant,
            material_code: 'MAT-A',
            material_name: '测试物料',
            description: '测试物料',
            basic_unit: '件',
            base_unit_id: null,
            purchase_unit_id: null,
            inventory_unit_id: null,
            auxiliary_unit_id: null,
            auxiliary_unit_2_id: null,
            unit_conversions: [],
            batch_management_enabled: false,
            serial_management_enabled: false
          }
        ],
        headers: {
          'content-range': '0-0/1',
          'access-control-expose-headers': 'content-range'
        }
      })
    if (name === 'scm_purchase_suppliers_secure' && request.method() === 'POST')
      return route.fulfill({
        json: [
          {
            id: `supplier-${tenantA}`,
            tenant_id: tenantA,
            supplier_code: 'SUP-A',
            supplier_name: '测试供应商'
          }
        ]
      })
    if (name === 'hr_list_employee_selector_secure' && request.method() === 'POST')
      return route.fulfill({
        json: {
          records: [{ id: 'buyer-A', employee_no: 'BUY-A', employee_name: '测试采购员' }],
          total: 1,
          field_access: {}
        }
      })
    capture.unknownRest.push(`${request.method()} ${url.pathname}`)
    return route.abort()
  })
  await page.goto(`/tests/e2e/fixtures/scm-purchase-inbound.html?view=import&kind=${kind}`)
  const importButton = page.getByRole('button', { name: '导入', exact: true })
  await expect(importButton).toBeVisible()
  await expect(page.locator('.art-search-bar .el-skeleton')).toHaveCount(0)
  await expect(importButton).toBeEnabled()
  await installActionFeedbackHistory(page)
  return capture
}

test('真实 XLSX 两组采购申请分别提交，整批只提示一次', async ({ page }) => {
  const capture = await mount(page)
  await upload(page, await workbook())
  await expect.poll(() => capture.writes.length).toBe(2)
  expect(capture.writes.map((item) => [item.kind, item.tenant_id, item.lines.length])).toEqual([
    ['purchase_request', tenantA, 1],
    ['purchase_request', tenantA, 1]
  ])
  expect(capture.writes.map((item) => item.remark)).toEqual(['导入分组 A', '导入分组 B'])
  await expect
    .poll(async () =>
      (await readActionFeedbackHistory(page)).filter((item) => item.kind === 'success')
    )
    .toEqual([{ kind: 'success', text: '采购单据导入完成' }])
  expect(capture.unknownRest).toEqual([])
  expect(capture.pageErrors).toEqual([])
})

for (const kind of ['purchase_order', 'receipt_notice'] as const) {
  test(`${kind} 真实 XLSX 引用读取后单次提交并反馈`, async ({ page }) => {
    const capture = await mount(page, kind)
    await upload(page, await referencedWorkbook(kind))
    await expect.poll(() => capture.writes.length).toBe(1)
    expect(capture.writes[0]).toMatchObject({ kind, tenant_id: tenantA })
    expect(capture.writes[0].lines).toHaveLength(1)
    await expect
      .poll(async () =>
        (await readActionFeedbackHistory(page)).filter((item) => item.kind === 'success')
      )
      .toEqual([{ kind: 'success', text: '采购单据导入完成' }])
    expect(capture.unknownRest).toEqual([])
    expect(capture.pageErrors).toEqual([])
  })
}

test('真实 SheetJS 解析期间由 A 切 B，旧文件丢弃，B 可重选同文件', async ({ page }) => {
  const capture = await mount(page)
  let release: (() => void) | undefined
  let signal: (() => void) | undefined
  const requested = new Promise<void>((resolve) => (signal = resolve))
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/src/utils/file/sheetjs.ts*', async (route) => {
    signal?.()
    await held
    await route.continue()
  })
  try {
    const file = await workbook()
    await upload(page, file)
    await requested
    await page.getByTestId('scope-b').click()
    await expect(page.locator('input[type="file"]').first()).toHaveValue('')
    expect(capture.writes).toEqual([])
    const oldModuleResponse = page.waitForResponse('**/src/utils/file/sheetjs.ts*')
    release?.()
    await oldModuleResponse
    await upload(page, file)
    await expect.poll(() => capture.writes.length).toBe(2)
    expect(capture.writes.every((item) => item.tenant_id === tenantB)).toBe(true)
    expect(capture.unknownRest).toEqual([])
    expect(capture.pageErrors).toEqual([])
  } finally {
    release?.()
  }
})

test('首组创建在途时切 B，第二组停止提交', async ({ page }) => {
  const capture = await mount(page)
  let release: (() => void) | undefined
  let signal: (() => void) | undefined
  const requested = new Promise<void>((resolve) => (signal = resolve))
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/rest/v1/scm_purchase_document*', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    const payload = route.request().postDataJSON() as PurchaseWrite
    capture.writes.push(payload)
    signal?.()
    await held
    return route.fulfill({ json: { id: 'created-1', ...payload, status: 'draft' } })
  })
  try {
    await upload(page, await workbook())
    await requested
    await page.getByTestId('scope-b').click()
    const response = page.waitForResponse(
      (item) => item.url().includes('/scm_purchase_document') && item.request().method() === 'POST'
    )
    release?.()
    await response
    await page.waitForTimeout(200)
    expect(capture.writes).toHaveLength(1)
    expect(capture.writes[0].tenant_id).toBe(tenantA)
    await expect(page.getByText('已导入 1 份单据；请返回原租户核对结果')).toBeVisible()
    expect(capture.unknownRest).toEqual([])
    expect(capture.pageErrors).toEqual([])
  } finally {
    release?.()
  }
})

test('旧项目引用请求 500 不提示旧上下文错误，也不提交单据', async ({ page }) => {
  const capture = await mount(page)
  let release: (() => void) | undefined
  let signal: (() => void) | undefined
  const requested = new Promise<void>((resolve) => (signal = resolve))
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/rest/v1/mdm_project*', async (route) => {
    signal?.()
    await held
    return route.fulfill({ status: 500, json: { code: 'XX000', message: 'old project failure' } })
  })
  try {
    await upload(page, await workbook())
    await requested
    await page.getByTestId('scope-b').click()
    const response = page.waitForResponse('**/rest/v1/mdm_project*')
    release?.()
    await response
    await page.waitForTimeout(200)
    expect(capture.writes).toEqual([])
    expect(await readActionFeedbackHistory(page)).toEqual([])
    expect(capture.unknownRest).toEqual([])
    expect(capture.pageErrors).toEqual([])
  } finally {
    release?.()
  }
})

test('采购导入工作区浅色桌面与深色窄屏可读并完整退出专注模式', async ({ page }, info) => {
  const capture = await mount(page)
  await expect(page.locator('.art-table-query')).toBeVisible()
  await expect(page.locator('.art-search-bar .el-skeleton')).toHaveCount(0)
  await expect(page.locator('.art-search-bar input').first()).toBeVisible()
  await expect(page.getByText('按单据', { exact: true })).toBeVisible()
  await expect(page.getByText('按明细', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('purchase-import-light-1440.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await expect(page.getByRole('button', { name: '导入', exact: true })).toBeVisible()
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(overflow.content).toBeLessThanOrEqual(overflow.viewport + 1)
  await page.screenshot({ path: info.outputPath('purchase-import-dark-390.png') })
  await assertTableFocusContract(page, info)
  expect(capture.unknownRest).toEqual([])
  expect(capture.pageErrors).toEqual([])
})
