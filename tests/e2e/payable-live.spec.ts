import {
  expect,
  test,
  type Locator,
  type Page,
  type Response,
  type TestInfo
} from '@playwright/test'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareAppearance } from './support/appearance'
import {
  assertPayableAcceptanceSession,
  payableAcceptanceTenantId
} from './support/payable-live-session'
import { readPayableTypeConfigurations } from './support/payable-live-data'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 20_000
})
test.skip(!enabled, '仅在独立验收租户显式运行真实数据测试')
test.setTimeout(180_000)

interface LiveRecord {
  id: string
  documentNo: string
  documentTypeId?: string
  businessDate?: string
  expectedFinancialTypeId?: string
}

function readLiveRecords(kind: string): LiveRecord[] {
  const records: LiveRecord[] = []
  for (const line of readFileSync('.artifacts/payable-live-records.jsonl', 'utf8')
    .trim()
    .split('\n')) {
    const value: unknown = JSON.parse(line)
    if (
      value &&
      typeof value === 'object' &&
      'kind' in value &&
      value.kind === kind &&
      'id' in value &&
      typeof value.id === 'string' &&
      'documentNo' in value &&
      typeof value.documentNo === 'string'
    )
      records.push({
        id: value.id,
        documentNo: value.documentNo,
        expectedFinancialTypeId:
          'expectedFinancialTypeId' in value && typeof value.expectedFinancialTypeId === 'string'
            ? value.expectedFinancialTypeId
            : undefined
      })
  }
  expect(records.length).toBeGreaterThanOrEqual(2)
  return records.slice(-2)
}

async function readCreated(response: Response, kind: string): Promise<LiveRecord> {
  expect(response.ok()).toBe(true)
  const value: unknown = await response.json()
  if (
    !value ||
    typeof value !== 'object' ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    !('document_no' in value) ||
    typeof value.document_no !== 'string'
  )
    throw new Error('真实接口未返回有效单据')
  const record: LiveRecord = {
    id: value.id,
    documentNo: value.document_no,
    documentTypeId:
      'document_type_id' in value && typeof value.document_type_id === 'string'
        ? value.document_type_id
        : undefined,
    businessDate:
      'business_date' in value && typeof value.business_date === 'string'
        ? value.business_date
        : undefined
  }
  appendFileSync(
    '.artifacts/payable-live-records.jsonl',
    JSON.stringify({ ...record, kind }) + '\n'
  )
  return record
}

async function selectRow(row: Locator): Promise<void> {
  if (!(await row.getByRole('checkbox').isChecked())) await row.locator('.el-checkbox').click()
}

async function approve(page: Page, row: Locator): Promise<void> {
  await selectRow(row)
  await page.getByRole('button', { name: '提交', exact: true }).click()
  await expect(row).toContainText('已提交')
  await selectRow(row)
  await page.getByRole('button', { name: '审核', exact: true }).click()
  await expect(row).toContainText('已审核')
}

async function push(page: Page, rpc: string, label: string, kind: string): Promise<LiveRecord> {
  const pending = page.waitForResponse((response) => response.url().endsWith(`/rpc/${rpc}`))
  await page.getByRole('button', { name: '下推', exact: true }).click()
  await page
    .getByRole('menu', { name: '下推', exact: true })
    .getByRole('menuitem', { name: label, exact: true })
    .click()
  return readCreated(await pending, kind)
}

test.beforeEach(async ({ context, page }, info) => {
  await assertPayableAcceptanceSession(context)
  const dark = info.project.name.includes('dark')
  await prepareAppearance(page, {
    theme: dark ? 'dark' : 'light',
    boxBorderMode: !dark && !info.project.name.includes('shadow')
  })
})

test('独立普通用户真实登录与应付款全目录读取', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const pages = [
    ['estimated-payable', '暂估应付单'],
    ['purchase-payable', '财务应付单'],
    ['payment-application', '付款申请单'],
    ['payment', '付款单'],
    ['writeoff', '应付核销工作台']
  ]
  for (const [route, title] of pages) {
    const rpc =
      route === 'writeoff'
        ? 'fms_payable_writeoff_workspace_secure'
        : route === 'payment' || route === 'payment-application'
          ? 'fms_payable_settlement_list_secure'
          : 'fms_purchase_payable_list_secure'
    const [loaded] = await Promise.all([
      page.waitForResponse((response) => response.url().endsWith(`/rpc/${rpc}`), {
        timeout: 120_000
      }),
      page.goto(`#/fms/accounts-payable/${route}`, { waitUntil: 'domcontentloaded' })
    ])
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(page.getByText('全部租户', { exact: true })).toHaveCount(0)
    await expect(page.getByText('没有访问权限', { exact: true })).toHaveCount(0)
    if (route === 'estimated-payable') {
      const favicon = await page.locator('link[rel="icon"]').getAttribute('href')
      if (!favicon) throw new Error('独立 FMS 入口缺少站点图标')
      const iconResponse = await page.request.get(new URL(favicon, page.url()).href)
      expect(iconResponse.ok()).toBe(true)
      expect(iconResponse.headers()['content-type']).toMatch(/^image\//)
    }
    expect(loaded.ok()).toBe(true)
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    const guide = page.getByRole('button', { name: '知道了', exact: true })
    if (await guide.isVisible()) await guide.click()
    await captureBusinessEvidence(page, { path: info.outputPath(`live-${route}.png`) })
    if (route === 'writeoff') {
      const paymentSection = page.getByRole('region', { name: '付款单', exact: true })
      await paymentSection.scrollIntoViewIfNeeded()
      await expect(paymentSection).toBeInViewport({ ratio: 1 })
      await captureBusinessEvidence(page, { path: info.outputPath('live-writeoff-lower.png') })
    }
  }
  expect(errors).toEqual([])
})

test('两张真实财务应付保留手工暂估来源单号与源行号', async ({ page }, info) => {
  const financials = readLiveRecords('financial').slice(-2)
  const estimates = readLiveRecords('estimated').slice(-2)
  expect(financials).toHaveLength(2)
  expect(estimates).toHaveLength(2)
  for (const [index, financial] of financials.entries()) {
    const loaded = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_purchase_payable_list_secure')
    )
    await page.goto(`#/fms/accounts-payable/purchase-payable?recordId=${financial.id}`)
    expect((await loaded).ok()).toBe(true)
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    const row = page.locator('.art-table-query tbody tr').filter({ hasText: financial.documentNo })
    await row.getByRole('button', { name: '查看', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '财务应付单详情', exact: true })
    await expect(detail).toContainText(estimates[index].documentNo)
    await expect(
      detail.getByRole('columnheader', { name: /未冲回金额|已冲回金额|成本差异/ })
    ).toHaveCount(0)
    await expect(detail.getByRole('columnheader', { name: /已核销金额/ })).toHaveCount(1)
    const sourceCell = detail
      .locator('.el-table__body-wrapper tbody tr')
      .getByText(estimates[index].documentNo, { exact: true })
    await sourceCell.scrollIntoViewIfNeeded()
    await expect(sourceCell).toBeVisible()
    const sourceControl = detail.getByRole('button', {
      name: estimates[index].documentNo,
      exact: true
    })
    await expect(sourceControl).toHaveAttribute(
      'title',
      `查看来源暂估 ${estimates[index].documentNo}`
    )
    const sourceStylePath = info.outputPath(`source-style-${index + 1}.json`)
    writeFileSync(
      sourceStylePath,
      JSON.stringify(
        await sourceControl.evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            color: style.color,
            background: style.backgroundColor,
            primaryLight3: style.getPropertyValue('--el-color-primary-light-3'),
            primaryText: style.getPropertyValue('--el-text-color-primary')
          }
        })
      )
    )
    await info.attach(`source-style-${index + 1}`, {
      path: sourceStylePath,
      contentType: 'application/json'
    })
    await expect(detail.getByRole('textbox', { name: '明细来源单据', exact: true })).toHaveCount(0)
    await expect(detail.getByRole('textbox', { name: '明细源行号', exact: true })).toHaveCount(0)
    await sourceControl.focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(sourceControl).toBeFocused()
    await expect
      .poll(() => sourceControl.evaluate((element) => getComputedStyle(element).outlineStyle))
      .toBe('solid')
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`financial-source-${index + 1}.png`)
    })
    await sourceControl.press('Enter')
    await expect(page.getByRole('heading', { name: '暂估应付单', exact: true })).toBeVisible()
    await expect(
      page.locator('.art-table-query tbody tr').filter({ hasText: estimates[index].documentNo })
    ).toBeVisible()
  }
})

async function runLiveSettlementChain({ page }: { page: Page }, info: TestInfo): Promise<void> {
  test.setTimeout(300_000)
  const records = readLiveRecords('estimated')
  const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
  for (const [index, source] of records.slice(-2).entries()) {
    await page.goto(`#/fms/accounts-payable/estimated-payable?recordId=${source.id}`)
    const estimateRow = rows.filter({ hasText: source.documentNo })
    await expect(estimateRow).toContainText('已审核')
    await selectRow(estimateRow)
    const financial = await push(page, 'fms_push_estimated_payable_secure', '财务应付', 'financial')
    if (source.expectedFinancialTypeId)
      expect(financial.documentTypeId).toBe(source.expectedFinancialTypeId)
    await expect(page.getByRole('heading', { name: '财务应付单', exact: true })).toBeVisible()
    const financialRow = rows.filter({ hasText: financial.documentNo })
    await financialRow.getByRole('button', { name: '编辑', exact: true }).click()
    const financeEditor = page.getByRole('dialog', { name: '编辑财务应付单', exact: true })
    await expect(financeEditor.getByRole('button', { name: '保存', exact: true })).toBeEnabled({
      timeout: 60_000
    })
    const gross = financeEditor.getByRole('spinbutton', { name: '含税单价', exact: true })
    await gross.fill('120')
    await gross.press('Tab')
    const saved = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_save_purchase_payable_secure')
    )
    await financeEditor.getByRole('button', { name: '保存', exact: true }).click()
    expect((await saved).ok()).toBe(true)
    await expect(financeEditor).not.toBeVisible()
    await approve(page, financialRow)
    await selectRow(financialRow)
    const application = await push(
      page,
      'fms_push_payable_settlement_secure',
      '付款申请',
      'application'
    )
    const today = await page.evaluate(() =>
      new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    )
    expect(application.businessDate).toBe(today)
    await expect(page.getByRole('heading', { name: '付款申请单', exact: true })).toBeVisible()
    const applicationRow = rows.filter({ hasText: application.documentNo })
    await applicationRow.getByRole('button', { name: '编辑', exact: true }).click()
    const applicationEditor = page.getByRole('dialog', { name: '编辑付款申请单', exact: true })
    await expect(applicationEditor.getByRole('button', { name: '保存', exact: true })).toBeEnabled({
      timeout: 60_000
    })
    await applicationEditor.getByRole('combobox', { name: '付款账号', exact: true }).press('Enter')
    await page.getByRole('option', { name: /验收模拟现金账户/ }).click()
    const savedApplication = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_save_payable_settlement_secure')
    )
    await applicationEditor.getByRole('button', { name: '保存', exact: true }).click()
    expect((await savedApplication).ok()).toBe(true)
    await expect(applicationEditor).not.toBeVisible()
    await approve(page, applicationRow)
    await selectRow(applicationRow)
    const payment = await push(page, 'fms_push_payable_settlement_secure', '付款单', 'payment')
    expect(payment.businessDate).toBe(today)
    await expect(page.getByRole('heading', { name: '付款单', exact: true })).toBeVisible()
    const paymentRow = rows.filter({ hasText: payment.documentNo })
    await approve(page, paymentRow)
    await selectRow(paymentRow)
    await page.getByRole('button', { name: '确认付款', exact: true }).click()
    await page.getByRole('menuitem', { name: '确认付款', exact: true }).click()
    await page.getByRole('button', { name: '确认登记', exact: true }).click()
    await expect(paymentRow).toContainText('已确认付款')
    await captureBusinessEvidence(page, {
      path: info.outputPath(`payment-confirmed-${index + 1}.png`)
    })
    await selectRow(paymentRow)
    await page.getByRole('button', { name: '确认付款', exact: true }).click()
    await page.getByRole('menuitem', { name: '取消付款', exact: true }).click()
    const reason = page.getByRole('dialog', { name: '处理原因', exact: true })
    await reason.getByRole('textbox').fill('独立验收核对资金冲回，不代表实际银行退款')
    await reason.getByRole('button', { name: '确定', exact: true }).click()
    await expect(paymentRow).toContainText('已审核')
    await captureBusinessEvidence(page, {
      path: info.outputPath(`payment-cancelled-${index + 1}.png`)
    })
  }
}

test('两张真实暂估新增、保存、编辑、提交及审核', async ({ page }, info) => {
  const configuredTypes =
    process.env.E2E_PAYABLE_TYPE_RULES === 'true' ? readPayableTypeConfigurations() : []
  const run = Date.now().toString(36)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('#/fms/accounts-payable/estimated-payable', {
    waitUntil: 'domcontentloaded'
  })
  for (const index of [1, 2]) {
    await page.getByRole('button', { name: '新增', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '新增暂估应付单', exact: true })
    const supplier = drawer.getByRole('textbox', { name: /结算供应商$/ })
    await expect(supplier).toBeEnabled({ timeout: 60_000 })
    await drawer.getByRole('combobox', { name: /单据类型$/ }).press('Enter')
    await page
      .getByRole('option', {
        name: configuredTypes[index - 1]?.name || '其他应付暂估',
        exact: true
      })
      .click()
    await supplier.click()
    const supplierPicker = page.getByRole('dialog', { name: '选择结算供应商', exact: true })
    const supplierRow = supplierPicker.locator('tbody tr').filter({
      hasText: `验收虚构供应商${index}`
    })
    await supplierRow.click()
    await expect(supplierRow.getByRole('checkbox')).toBeChecked()
    await supplierPicker.getByRole('button', { name: '确定', exact: true }).click()
    await drawer.getByRole('button', { name: '选择物料', exact: true }).click()
    const materialPicker = page.getByRole('dialog', { name: '数据来源物料编码', exact: true })
    const materialRow = materialPicker.locator('tbody tr').filter({ hasText: `QA_AP_MAT_${index}` })
    await materialRow.locator('.el-checkbox').click()
    await expect(materialRow.getByRole('checkbox')).toBeChecked()
    await expect(materialPicker.getByRole('checkbox', { checked: true })).toHaveCount(1)
    await materialPicker.getByRole('button', { name: '确定', exact: true }).click()
    const quantity = drawer.getByRole('spinbutton', { name: '数量', exact: true })
    await expect(quantity).toHaveCount(1)
    await quantity.fill(String(index * 2))
    await quantity.press('Tab')
    const gross = drawer.getByRole('spinbutton', { name: '含税单价', exact: true })
    await gross.fill('113')
    await gross.press('Tab')
    await drawer.getByRole('combobox', { name: '税率', exact: true }).press('Enter')
    await page.getByRole('option', { name: /13%$/ }).click()
    const remark = `QA-LIVE-${run}-${index}`
    await drawer.getByRole('textbox', { name: '备注', exact: true }).first().fill(remark)
    await captureBusinessEvidence(drawer, { path: info.outputPath(`estimate-create-${index}.png`) })
    const saved = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_save_purchase_payable_secure')
    )
    await drawer.getByRole('button', { name: '保存', exact: true }).click()
    const response = await saved
    expect(response.ok()).toBe(true)
    const record: unknown = await response.json()
    if (
      !record ||
      typeof record !== 'object' ||
      !('id' in record) ||
      typeof record.id !== 'string' ||
      !('document_no' in record) ||
      typeof record.document_no !== 'string'
    )
      throw new Error('真实保存未返回有效应付单')
    appendFileSync(
      '.artifacts/payable-live-records.jsonl',
      JSON.stringify({
        run,
        kind: 'estimated',
        id: record.id,
        documentNo: record.document_no,
        expectedFinancialTypeId: configuredTypes[index - 1]?.targetId,
        index
      }) + '\n'
    )
    await expect(drawer).not.toBeVisible()
    const row = page.locator('.art-table-query tbody tr').filter({ hasText: record.document_no })
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '编辑暂估应付单', exact: true })
    await expect(editor.getByRole('button', { name: '保存', exact: true })).toBeEnabled({
      timeout: 60_000
    })
    await editor
      .getByRole('textbox', { name: '备注', exact: true })
      .first()
      .fill(`${remark}-已核对`)
    const edited = page.waitForResponse((result) =>
      result.url().endsWith('/rpc/fms_save_purchase_payable_secure')
    )
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    expect((await edited).ok()).toBe(true)
    await expect(editor).not.toBeVisible()
    await row.getByRole('checkbox').locator('..').click()
    await page.getByRole('button', { name: '提交', exact: true }).click()
    await expect(row).toContainText('已提交')
    if (!(await row.getByRole('checkbox').isChecked()))
      await row.getByRole('checkbox').locator('..').click()
    await page.getByRole('button', { name: '审核', exact: true }).click()
    await expect(row).toContainText('已审核')
    await captureBusinessEvidence(page, { path: info.outputPath(`estimate-approved-${index}.png`) })
    if (await row.getByRole('checkbox').isChecked())
      await row.getByRole('checkbox').locator('..').click()
  }
  expect(errors).toEqual([])
})

test('两组真实暂估到财务、申请、付款确认与取消恢复', runLiveSettlementChain)

test('两笔真实付款重确认、自动核销、反核销与手工核销', async ({ page }, info) => {
  test.setTimeout(300_000)
  const financials = readLiveRecords('financial')
  const payments = readLiveRecords('payment')
  for (const payment of payments) {
    await page.goto(`#/fms/accounts-payable/payment?recordId=${payment.id}`)
    await expect(page.getByRole('heading', { name: '付款单', exact: true })).toBeVisible({
      timeout: 60_000
    })
    const row = page.locator('.art-table-query tbody tr').filter({ hasText: payment.documentNo })
    await expect(row).toContainText('已审核')
    await selectRow(row)
    await page.getByRole('button', { name: '确认付款', exact: true }).click()
    await page.getByRole('menuitem', { name: '确认付款', exact: true }).click()
    await page.getByRole('button', { name: '确认登记', exact: true }).click()
    await expect(row).toContainText('已确认付款')
  }
  const loaded = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure')
  )
  await page.goto('#/fms/accounts-payable/writeoff')
  expect((await loaded).ok()).toBe(true)
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  await page.getByRole('tab', { name: /^核销记录/ }).click()
  for (const payment of payments) {
    const active = page
      .getByRole('tabpanel', { name: /^核销记录/ })
      .locator('tbody tr')
      .filter({ hasText: payment.documentNo })
      .filter({ has: page.getByRole('button', { name: '反核销', exact: true }) })
    await expect(active).toHaveCount(1)
    await active.getByRole('button', { name: '反核销', exact: true }).click()
    const reason = page.getByRole('dialog', { name: '反核销原因', exact: true })
    await reason.getByRole('textbox').fill('独立验收核对余额恢复及手工重新核销')
    const reversed = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_reverse_payable_writeoff_secure')
    )
    await reason.getByRole('button', { name: '确定', exact: true }).click()
    expect((await reversed).ok()).toBe(true)
    await expect(active).toHaveCount(0)
  }
  await page.getByRole('tab', { name: '待核销单据', exact: true }).click()
  const candidates = page.getByRole('tabpanel', { name: '待核销单据', exact: true })
  for (const [index, payment] of payments.entries()) {
    const primary = candidates
      .locator('.art-table')
      .nth(0)
      .locator('tbody tr')
      .filter({ hasText: financials[index].documentNo })
    const secondary = candidates
      .locator('.art-table')
      .nth(1)
      .locator('tbody tr')
      .filter({ hasText: payment.documentNo })
    await selectRow(primary)
    await selectRow(secondary)
    await captureBusinessEvidence(page, {
      path: info.outputPath(`writeoff-selected-${index + 1}.png`)
    })
    await page.getByRole('button', { name: '核销', exact: true }).click()
    const writtenOff = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_payable_writeoff_secure')
    )
    await page.getByRole('button', { name: '执行核销', exact: true }).click()
    expect((await writtenOff).ok()).toBe(true)
    await expect(primary).toHaveCount(0)
    await expect(secondary).toHaveCount(0)
  }
  await page.getByRole('tab', { name: /^核销记录/ }).click()
  await captureBusinessEvidence(page, { path: info.outputPath('writeoff-history.png') })
})

test('两张真实核销单预览、生成凭证、防重与制证后反核销阻断', async ({ page }, info) => {
  test.setTimeout(240_000)
  const financials = readLiveRecords('financial')
  await page.goto('#/fms/accounts-payable/writeoff')
  await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  await page.getByRole('tab', { name: /^核销单/ }).click()
  const vouchers: string[] = []
  for (const [index, financial] of financials.entries()) {
    const row = page
      .getByRole('tabpanel', { name: /^核销单/ })
      .locator('tbody tr')
      .filter({ hasText: financial.documentNo })
    await row.getByRole('button', { name: '预览凭证', exact: true }).click()
    const preview = page.getByRole('dialog', { name: '凭证预览', exact: true })
    await expect(preview.locator('tbody tr')).toHaveCount(2)
    await expect(preview).toContainText('验收其他应付')
    await expect(preview).toContainText('验收采购应付')
    await captureBusinessEvidence(preview, {
      path: info.outputPath(`writeoff-preview-${index + 1}.png`)
    })
    await preview.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    let generatedId = ''
    for (const attempt of [1, 2]) {
      const generated = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_payable_settlement_voucher_secure')
      )
      await row.getByRole('button', { name: '生成凭证', exact: true }).click()
      const response = await generated
      expect(response.ok()).toBe(true)
      const result: unknown = await response.json()
      if (
        !result ||
        typeof result !== 'object' ||
        !('status' in result) ||
        result.status !== 'generated' ||
        !('voucher_ids' in result) ||
        !Array.isArray(result.voucher_ids) ||
        result.voucher_ids.length !== 1 ||
        typeof result.voucher_ids[0] !== 'string'
      )
        throw new Error('真实核销凭证未生成，请核对入账规则与期间诊断')
      if (attempt === 1) {
        generatedId = result.voucher_ids[0]
        vouchers.push(generatedId)
      } else expect(result.voucher_ids[0]).toBe(generatedId)
      await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    }
    await row.getByRole('button', { name: '反核销', exact: true }).click()
    const reason = page.getByRole('dialog', { name: '反核销原因', exact: true })
    await reason.getByRole('textbox').fill('验收已生成凭证必须阻止反核销')
    const refused = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/fms_reverse_payable_writeoff_secure')
    )
    await reason.getByRole('button', { name: '确定', exact: true }).click()
    expect((await refused).status()).toBe(400)
    await expect(row).toBeVisible()
    await captureBusinessEvidence(page, {
      path: info.outputPath(`writeoff-voucher-protected-${index + 1}.png`)
    })
  }
  expect(new Set(vouchers).size).toBe(2)
})

test('凭证号联查打开两张真实会计凭证详情', async ({ page }, info) => {
  const financials = readLiveRecords('financial')
  for (const [index, financial] of financials.entries()) {
    await page.goto('#/fms/accounts-payable/writeoff')
    await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    await page.getByRole('tab', { name: /^核销单/ }).click()
    const row = page
      .getByRole('tabpanel', { name: /^核销单/ })
      .locator('tbody tr')
      .filter({ hasText: financial.documentNo })
    const link = row.getByRole('button', { name: /^记-/ })
    const voucherNo = await link.innerText()
    await link.focus()
    const loaded = page.waitForResponse(
      (response) => response.url().endsWith('/rpc/fms_get_voucher_secure'),
      { timeout: 60_000 }
    )
    await link.click()
    const drawer = page.getByRole('dialog', { name: '会计凭证详情', exact: true })
    await expect(drawer).toBeVisible({ timeout: 60_000 })
    expect((await loaded).ok()).toBe(true)
    await expect(drawer).toContainText(voucherNo, { timeout: 60_000 })
    await expect(drawer).toContainText('应付验收专用账套')
    await expect(drawer).toContainText('验收其他应付')
    await expect(drawer).toContainText('验收采购应付')
    await captureBusinessEvidence(drawer, {
      path: info.outputPath(`voucher-linked-${index + 1}.png`)
    })
    await drawer.getByRole('button', { name: '关闭此对话框', exact: true }).click()
  }
})

test('两张暂估规则快照可见且两张标准采购不能直接下推', async ({ page, context }, info) => {
  const acceptance = await assertPayableAcceptanceSession(context)
  for (const [index, source] of readLiveRecords('estimated').entries()) {
    const stored = await acceptance
      .from('fms_purchase_payable_document')
      .select('financial_payable_type_id')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('id', source.id)
      .single()
    expect(stored.error).toBeNull()
    const target = await acceptance
      .from('mdm_document_type')
      .select('document_type_name')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('id', stored.data?.financial_payable_type_id)
      .single()
    expect(target.error).toBeNull()
    if (!target.data) throw new Error('暂估规则快照目标缺失')
    await page.goto(`#/fms/accounts-payable/estimated-payable?recordId=${source.id}`)
    await expect(page.getByRole('heading', { name: '暂估应付单', exact: true })).toBeVisible({
      timeout: 60_000
    })
    const row = page.locator('.art-table-query tbody tr').filter({ hasText: source.documentNo })
    await row.getByRole('button', { name: '查看', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '暂估应付单详情', exact: true })
    await expect(detail).toContainText(target.data.document_type_name)
    await detail.getByText('到票财务类型', { exact: true }).scrollIntoViewIfNeeded()
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`type-rule-snapshot-${index + 1}.png`)
    })
    await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
  }
  const standard = await acceptance
    .from('mdm_document_type')
    .select('id')
    .eq('tenant_id', payableAcceptanceTenantId)
    .eq('document_type_code', 'AP_EST_STANDARD')
    .single()
  expect(standard.error).toBeNull()
  const sources = await acceptance
    .from('fms_purchase_payable_document')
    .select('id,document_no')
    .eq('tenant_id', payableAcceptanceTenantId)
    .eq('document_type_id', standard.data?.id)
    .eq('kind', 'estimated')
    .eq('status', 'approved')
    .eq('is_reversal', false)
    .limit(2)
  expect(sources.error).toBeNull()
  expect(sources.data).toHaveLength(2)
  let pushes = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/rpc/fms_push_estimated_payable_secure')) pushes += 1
  })
  for (const source of sources.data || []) {
    await page.goto(`#/fms/accounts-payable/estimated-payable?recordId=${source.id}`)
    const row = page.locator('.art-table-query tbody tr').filter({ hasText: source.document_no })
    await selectRow(row)
    await page.getByRole('button', { name: '下推', exact: true }).click()
    await page.getByRole('menuitem', { name: '财务应付', exact: true }).click()
    await expect(
      page
        .getByText('标准采购请从同源采购入库单生成财务应付，不能从暂估直接下推', { exact: true })
        .last()
    ).toBeVisible()
  }
  expect(pushes).toBe(0)
})
