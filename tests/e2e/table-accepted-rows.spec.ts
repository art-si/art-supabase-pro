import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { installDictionaryOptions } from './support/dictionary-options'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

async function requestThroughTable(page: Page) {
  // ArtTableQuery's exposed getData is the public imperative request contract.
  await page.locator('.art-table-query').evaluate(async (element) => {
    const instance = (
      element as HTMLElement & {
        __vueParentComponent?: { exposed?: { getData?: () => Promise<unknown> } }
      }
    ).__vueParentComponent
    if (!instance?.exposed?.getData) throw new Error('ArtTableQuery.getData is unavailable')
    await instance.exposed.getData()
  })
}

async function showKeyword(page: Page, placeholder: string) {
  const keyword = page.getByPlaceholder(placeholder, { exact: true })
  if (!(await keyword.isVisible())) {
    await page.locator('.art-table-query').getByRole('button', { name: /展开/ }).first().click()
  }
  await expect(keyword).toBeVisible()
  return keyword
}

test('WMS transfer spans follow the accepted table response after an older request resolves', async ({
  page
}, testInfo) => {
  const tenant = await prepareIsolatedSession(page)
  await installDictionaryOptions(page, {
    commonDocumentDisplayMode: [
      { value: 'document', label: '按单据' },
      { value: 'line', label: '按明细' }
    ]
  })
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'wms', name: '仓储管理', baseUrl: '/wms/' }] })
  )
  const path = '/wms/transfer-business/transfer-request'
  const menu = {
    id: 'accepted-transfer',
    parentId: null,
    name: 'WmsTransfer',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '调拨申请单', is_enable: true, is_hide: false, roles: [] }
  }
  await mockApplicationMenus(page, {
    wms: [
      menu,
      {
        ...menu,
        id: 'accepted-transfer-view',
        parentId: menu.id,
        name: 'WmsTransfer:View',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  await page.route('**/rest/v1/mdm_document_type?*', (route) => route.fulfill({ json: [] }))

  let releaseOld: (() => void) | undefined
  let oldStarted: (() => void) | undefined
  const oldRequestStarted = new Promise<void>((resolve) => {
    oldStarted = resolve
  })
  const oldRequestRelease = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  const makeLine = (documentId: string, lineNo: number) => ({
    document_id: documentId,
    line_id: `${documentId}-${lineNo}`,
    tenant_id: tenant.id,
    document_no: documentId,
    document_type_name: '测试申请',
    status: 'draft',
    application_date: '2026-10-05',
    created_at: '2026-10-05T08:00:00Z',
    line_no: lineNo,
    material_code: `M-${lineNo}`,
    material_description: `物料 ${lineNo}`,
    quantity: 1,
    base_quantity: 1,
    inventory_unit_name: '件'
  })
  let failRequests = false
  let failedRequests = 0
  await page.route('**/rest/v1/wms_transfer_request_list?*', async (route) => {
    if (failRequests) {
      failedRequests++
      await route.fulfill({
        status: 503,
        json: { code: 'PGRST000', message: 'temporary test failure' }
      })
      return
    }
    const keyword = new URL(route.request().url()).searchParams.get('document_no')
    if (keyword === 'ilike.%OLD%') {
      oldStarted?.()
      await oldRequestRelease
    }
    const rows =
      keyword === 'ilike.%OLD%'
        ? [makeLine('OLD-1', 1), makeLine('OLD-2', 1)]
        : [makeLine('NEW', 1), makeLine('NEW', 2)]
    await route.fulfill({
      headers: {
        'content-range': `0-${rows.length - 1}/${rows.length}`,
        'access-control-expose-headers': 'content-range'
      },
      json: rows
    })
  })
  await page.goto(`#${path}`)
  await expect(page.getByRole('heading', { name: '调拨申请单', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
  const table = page.locator('.art-table-query .el-table')
  await expect(table.getByText('NEW', { exact: true })).toHaveCount(1)

  const keyword = await showKeyword(page, '单据编号')
  await keyword.fill('OLD')
  const olderRequest = requestThroughTable(page)
  await oldRequestStarted
  await keyword.fill('NEW')
  const newerRequest = requestThroughTable(page)
  await expect(table.getByText('NEW', { exact: true })).toHaveCount(1)
  await newerRequest
  releaseOld?.()
  await olderRequest
  await expect(table.locator('tr.el-table__row')).toHaveCount(2)
  await expect(table.getByText('OLD-1', { exact: true })).toHaveCount(0)
  await expect(
    table.locator('tbody tr.el-table__row').first().locator('td').filter({ hasText: 'NEW' })
  ).toHaveAttribute('rowspan', '2')
  await expect(page.locator('.el-notification:visible')).toHaveCount(0)
  const appearanceGuide = page.getByText('知道了', { exact: true })
  if (await appearanceGuide.isVisible()) await appearanceGuide.click()
  await page.screenshot({ path: testInfo.outputPath('wms-line-race-recovered.png') })
  failRequests = true
  await requestThroughTable(page)
  expect(failedRequests).toBeGreaterThan(0)
  await expect(page.locator('.art-table-query__error-state')).toBeVisible()
  failRequests = false
  await page
    .locator('.art-table-query__error-state')
    .getByRole('button', { name: '重新加载' })
    .click()
  await expect(table.getByText('NEW', { exact: true })).toHaveCount(1)
  await expect(
    table.locator('tbody tr.el-table__row').first().locator('td').filter({ hasText: 'NEW' })
  ).toHaveAttribute('rowspan', '2')
  await expect(page.locator('.el-message--error:visible')).toHaveCount(0)
  await page.locator('.el-radio-button').filter({ hasText: '按单据' }).click()
  await expect(table.locator('tr.el-table__row')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('wms-document-mode.png') })
  await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
  await expect(table.locator('tr.el-table__row')).toHaveCount(2)
  await page.setViewportSize({ width: 570, height: 900 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('wms-line-narrow.png') })
  await assertTableFocusContract(page, testInfo)
})

test('SCM purchase spans follow accepted rows after an older request resolves', async ({
  page
}, testInfo) => {
  const tenant = await prepareIsolatedSession(page)
  await installDictionaryOptions(page, {
    commonDocumentDisplayMode: [
      { value: 'document', label: '按单据' },
      { value: 'line', label: '按明细' }
    ]
  })
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'scm', name: '供应链管理', baseUrl: '/scm/' }] })
  )
  const path = '/scm/purchase-management/purchase-request'
  const menu = {
    id: 'accepted-purchase',
    parentId: null,
    name: 'ScmPurchaseRequest',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '采购申请', is_enable: true, is_hide: false, roles: [] }
  }
  await mockApplicationMenus(page, {
    scm: [
      menu,
      {
        ...menu,
        id: 'accepted-purchase-view',
        parentId: menu.id,
        name: 'ScmPurchaseRequest:View',
        path: '',
        component: '',
        type: 'button'
      },
      {
        ...menu,
        id: 'accepted-purchase-print',
        parentId: menu.id,
        name: 'ScmPurchaseRequest:Print',
        path: '',
        component: '',
        type: 'button'
      }
    ]
  })
  await page.route('**/rest/v1/rpc/scm_search_purchase_document_ids', (route) => {
    const keyword = (route.request().postDataJSON() as { p_keyword: string }).p_keyword
    return route.fulfill({ json: [{ id: keyword === 'OLD' ? 'old-id' : 'new-id' }] })
  })
  const makeDocument = (id: string, lineCount: number) => ({
    id,
    tenant_id: tenant.id,
    kind: 'purchase_request',
    document_no: id === 'new-id' ? 'NEW' : 'OLD',
    document_date: '2026-10-05',
    status: 'draft',
    details: {},
    subtotal: lineCount,
    tax_amount: 0,
    total_amount: lineCount,
    payment_plans: [],
    delivery_plans: [],
    clauses: [],
    lines: Array.from({ length: lineCount }, (_, index) => ({
      line_id: `${id}-${index}`,
      line_no: index + 1,
      material_code: `M-${index}`,
      material_description: `物料 ${index + 1}`,
      quantity: 1,
      unit_price: 1,
      tax_rate: 0
    }))
  })
  let releaseOld: (() => void) | undefined
  let oldStarted: (() => void) | undefined
  const oldRequestStarted = new Promise<void>((resolve) => {
    oldStarted = resolve
  })
  const oldRequestRelease = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  let failRequests = false
  await page.route('**/rest/v1/scm_purchase_document?*', async (route) => {
    if (failRequests) {
      await route.fulfill({
        status: 503,
        json: { code: 'PGRST000', message: 'temporary test failure' }
      })
      return
    }
    const params = new URL(route.request().url()).searchParams
    const isOld = params.get('id') === 'in.(old-id)'
    if (isOld) {
      oldStarted?.()
      await oldRequestRelease
    }
    const rows =
      params.get('kind') === 'eq.purchase_order'
        ? []
        : [makeDocument(isOld ? 'old-id' : 'new-id', isOld ? 1 : 2)]
    await route.fulfill({
      headers: {
        'content-range': rows.length ? '0-0/1' : '*/0',
        'access-control-expose-headers': 'content-range'
      },
      json: params.get('id')?.startsWith('eq.') ? rows[0] : rows
    })
  })
  await page.goto(`#${path}`)
  await expect(page.getByRole('heading', { name: '采购申请', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
  const table = page.locator('.art-table-query .el-table')
  await expect(table.getByText('NEW', { exact: true })).toHaveCount(1)
  const keyword = await showKeyword(page, '采购申请单号、项目、供应商或人员')
  await keyword.fill('OLD')
  const olderRequest = requestThroughTable(page)
  await oldRequestStarted
  await keyword.fill('NEW')
  const newerRequest = requestThroughTable(page)
  await expect(table.getByText('NEW', { exact: true })).toHaveCount(1)
  await newerRequest
  releaseOld?.()
  await olderRequest
  await expect(table.locator('tr.el-table__row')).toHaveCount(2)
  await expect(table.getByText('OLD', { exact: true })).toHaveCount(0)
  await expect(
    table.locator('tbody tr.el-table__row').first().locator('td').filter({ hasText: 'NEW' })
  ).toHaveAttribute('rowspan', '2')
  await expect(page.locator('.el-notification:visible')).toHaveCount(0)
  const appearanceGuide = page.getByText('知道了', { exact: true })
  if (await appearanceGuide.isVisible()) await appearanceGuide.click()
  await page.screenshot({ path: testInfo.outputPath('scm-line-race-recovered.png') })
  await table.locator('tbody tr.el-table__row').first().getByRole('checkbox').locator('..').click()
  await page.evaluate(() => {
    window.print = () => {}
  })
  await page.getByRole('button', { name: '打印', exact: true }).click()
  await expect(page.locator('.purchase-request-print-sheet')).toContainText('NEW')
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
  failRequests = true
  await requestThroughTable(page)
  await expect(page.locator('.art-table-query__error-state')).toBeVisible()
  failRequests = false
  await page
    .locator('.art-table-query__error-state')
    .getByRole('button', { name: '重新加载' })
    .click()
  await expect(table.getByText('NEW', { exact: true })).toHaveCount(1)
  await expect(
    table.locator('tbody tr.el-table__row').first().locator('td').filter({ hasText: 'NEW' })
  ).toHaveAttribute('rowspan', '2')
  await expect(page.locator('.el-message--error:visible')).toHaveCount(0)
  await page.locator('.el-radio-button').filter({ hasText: '按单据' }).click()
  await expect(table.locator('tr.el-table__row')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('scm-document-mode.png') })
  await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
  await expect(table.locator('tr.el-table__row')).toHaveCount(2)
  await page.setViewportSize({ width: 570, height: 900 })
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('scm-line-narrow.png') })
  await assertTableFocusContract(page, testInfo)
})
