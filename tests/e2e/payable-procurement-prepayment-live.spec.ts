import assert from 'node:assert/strict'
import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  acceptanceIdentifier,
  acceptanceRecord,
  acceptanceRows,
  acceptanceRpc,
  assertPayableAcceptanceSession,
  payableAcceptanceTenantId
} from './support/payable-live-session'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareAppearance, applyAppearance, assertAppearance } from './support/appearance'
import {
  financePaths,
  SCM_PURCHASE_CONTRACT_PATH,
  SCM_PURCHASE_ORDER_PATH
} from '../../src/router/business-paths'

const enabled =
  process.env.E2E_PAYABLE_LIVE === 'true' && process.env.E2E_PAYABLE_PROCUREMENT_NATIVE === 'true'
const accountSetId = 'cf3eeddd-49b0-4e62-97a9-cab2769cb633'
const fundAccountId = '2361b02b-9ce2-41aa-9ec6-2780e07a14fc'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-procurement.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 25000
})
test.setTimeout(600000)

async function selectRow(row: Locator): Promise<void> {
  const checkbox = row.getByRole('checkbox')
  if (!(await checkbox.isChecked())) await checkbox.locator('..').click()
}
async function drawerReady(drawer: Locator): Promise<void> {
  await expect(drawer).toBeVisible()
  await expect(
    drawer.locator('[aria-busy="true"]:visible,.el-skeleton:visible,.el-loading-mask:visible')
  ).toHaveCount(0)
  await expect(drawer.locator('.el-alert--error:visible')).toHaveCount(0)
}
async function openWorkspace(
  page: Page,
  application: 'scm' | 'fms',
  path: string,
  title: string
): Promise<void> {
  await page.goto(`/${application}/#${path}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
    timeout: 60000
  })
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
}

async function refreshSourceTable(page: Page, kind: string, row: Locator): Promise<void> {
  const fetched = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      response.request().method() === 'GET' &&
      url.pathname.endsWith('/scm_purchase_document') &&
      url.searchParams.get('kind') === `eq.${kind}`
    )
  })
  const query = page.getByRole('button', { name: '查询', exact: true })
  await query.click()
  expect((await fetched).ok()).toBe(true)
  await expect(query).toBeEnabled()
  await expect(
    page.locator('.art-table-query').getByText('正在加载表格数据...', { exact: true })
  ).toHaveCount(0)
  await expect(row).toBeVisible()
}

test('普通账号两份合同及两份订单经原生审批、预付款申请、付款确认并跨应用联查来源', async ({
  page,
  context
}, info) => {
  test.skip(!enabled, '仅显式执行独立租户的真实采购预付款验收')
  const client = await assertPayableAcceptanceSession(context)
  const projectResult = await client
    .from('mdm_project')
    .select('id')
    .eq('tenant_id', payableAcceptanceTenantId)
    .eq('project_name', '隔离预付款验收项目（非经营）')
    .single()
  expect(projectResult.error).toBeNull()
  const projectId = acceptanceIdentifier(acceptanceRecord(projectResult.data))
  const errors: string[] = []
  const menuScopes: string[][] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/rpc/get_menus_for_current_applications')) {
      const payload = acceptanceRecord(request.postDataJSON())
      assert.ok(
        Array.isArray(payload.p_app_codes) &&
          payload.p_app_codes.every((code: unknown) => typeof code === 'string')
      )
      menuScopes.push(payload.p_app_codes)
    }
  })
  const fetchSettlement = async (kind: 'application' | 'payment', id: string) => {
    const response = acceptanceRecord(
      await acceptanceRpc(client, 'fms_payable_settlement_list_secure', {
        p_kind: kind,
        p_query: { id }
      })
    )
    const records = acceptanceRows(response.data)
    expect(records).toHaveLength(1)
    return records[0]
  }
  const appearance = { theme: 'light' as const, boxBorderMode: true }
  await prepareAppearance(page, appearance)
  for (const kind of ['purchase_contract', 'purchase_order'] as const) {
    const title = kind === 'purchase_contract' ? '采购合同' : '采购订单'
    const path = kind === 'purchase_contract' ? SCM_PURCHASE_CONTRACT_PATH : SCM_PURCHASE_ORDER_PATH
    const typeResult = await client
      .from('mdm_document_type')
      .select('id')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq(
        'document_type_code',
        kind === 'purchase_contract' ? 'QA_AP_PREPAY_CONTRACT' : 'QA_AP_PREPAY_ORDER'
      )
      .single()
    expect(typeResult.error).toBeNull()
    const documentTypeId = acceptanceIdentifier(acceptanceRecord(typeResult.data))
    for (const index of [1, 2]) {
      const marker = `QA_AP_PREPAY_${kind}_${index}`
      const supplierResult = await client
        .from('mdm_supplier')
        .select('id,supplier_name')
        .eq('tenant_id', payableAcceptanceTenantId)
        .eq('supplier_code', `QA_AP_SUP_${index}`)
        .single()
      expect(supplierResult.error).toBeNull()
      const supplier = acceptanceRecord(supplierResult.data)
      const materialResult = await client
        .from('mdm_material')
        .select('id,material_name')
        .eq('tenant_id', payableAcceptanceTenantId)
        .eq('material_code', `QA_AP_MAT_${index}`)
        .single()
      expect(materialResult.error).toBeNull()
      const material = acceptanceRecord(materialResult.data)
      let sourceResult = await client
        .from('scm_purchase_document')
        .select('*')
        .eq('tenant_id', payableAcceptanceTenantId)
        .eq('kind', kind)
        .eq('remark', marker)
      expect(sourceResult.error).toBeNull()
      let sourceRows = acceptanceRows(sourceResult.data)
      expect(sourceRows.length).toBeLessThanOrEqual(1)
      if (!sourceRows.length) {
        const created = await client
          .from('scm_purchase_document')
          .insert({
            tenant_id: payableAcceptanceTenantId,
            document_type_id: documentTypeId,
            project_id: projectId,
            kind,
            document_no: '',
            supplier_id: acceptanceIdentifier(supplier),
            document_date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
            details: kind === 'purchase_contract' ? { title: `隔离预付款验收合同${index}` } : {},
            lines: [
              {
                line_id: crypto.randomUUID(),
                line_no: 10,
                material_id: acceptanceIdentifier(material),
                material_code: `QA_AP_MAT_${index}`,
                material_description: material.material_name,
                unit: '验收件',
                base_unit: '验收件',
                quantity: 1,
                base_quantity: 1,
                unit_price: index * 100,
                tax_inclusive_unit_price: index * 100,
                tax_rate: 0,
                discount_rate: 0,
                discount_type: 'none',
                gift: false
              }
            ],
            remark: marker
          })
          .select('*')
          .single()
        expect(created.error).toBeNull()
        expect(acceptanceRecord(created.data).status).toBe('draft')
        sourceRows = [acceptanceRecord(created.data)]
      }
      let source = sourceRows[0]
      const sourceId = acceptanceIdentifier(source)
      assert.ok(typeof source.document_no === 'string')
      const sourceNo = source.document_no
      await openWorkspace(page, 'scm', path, title)
      await applyAppearance(page, appearance)
      await page.getByRole('button', { name: '查询', exact: true }).click()
      const sourceRow = page
        .locator('.art-table-query .el-table__body-wrapper tbody tr')
        .filter({ hasText: sourceNo })
      await expect(sourceRow).toBeVisible()
      const transitions =
        kind === 'purchase_contract'
          ? [
              ['draft', 'submitted', '提交合同'],
              ['submitted', 'approved', '审核通过'],
              ['approved', 'effective', '生效']
            ]
          : [
              ['draft', 'submitted', '提交订单'],
              ['submitted', 'approved', '审核通过']
            ]
      for (const [from, target, label] of transitions) {
        if (source.status !== from) continue
        await sourceRow.getByRole('button', { name: '更多操作', exact: true }).hover()
        await page
          .locator('.el-dropdown__popper:visible')
          .getByRole('menuitem', { name: label, exact: true })
          .click()
        const confirmation = page.locator('.el-message-box')
        await expect(confirmation).toContainText(sourceNo)
        const changed = page.waitForResponse(
          (response) =>
            response.request().method() === 'PATCH' &&
            new URL(response.url()).pathname.endsWith('/scm_purchase_document')
        )
        await confirmation.getByRole('button', { name: label, exact: true }).click()
        const response = await changed
        expect(response.ok()).toBe(true)
        source = acceptanceRecord(await response.json())
        expect(source.status).toBe(target)
        await expect(confirmation).toBeHidden()
      }
      expect(source.status).toBe(kind === 'purchase_contract' ? 'effective' : 'approved')
      await refreshSourceTable(page, kind, sourceRow)
      await captureBusinessEvidence(page, {
        path: info.outputPath(`${kind}-${index}-approved.png`),
        fullPage: true
      })
      const existingApplication = await client
        .from('fms_payable_settlement_line')
        .select('document_id')
        .eq('tenant_id', payableAcceptanceTenantId)
        .eq('purchase_id', sourceId)
      expect(existingApplication.error).toBeNull()
      const linkedIds = acceptanceRows(existingApplication.data)
      const applications: Array<Record<string, unknown>> = []
      for (const link of linkedIds) {
        const header = await client
          .from('fms_payable_settlement_document')
          .select('id,kind')
          .eq('id', link.document_id)
          .single()
        expect(header.error).toBeNull()
        if (acceptanceRecord(header.data).kind === 'application')
          applications.push(acceptanceRecord(header.data))
      }
      expect(applications.length).toBeLessThanOrEqual(1)
      let applicationId = applications[0] ? acceptanceIdentifier(applications[0]) : ''
      if (!applicationId) {
        await selectRow(sourceRow)
        const pushed = page.waitForResponse((response) =>
          response.url().endsWith('/rpc/fms_push_payable_settlement_secure')
        )
        await page.getByRole('button', { name: '下推预付款申请', exact: true }).click()
        const response = await pushed
        expect(response.ok()).toBe(true)
        applicationId = acceptanceIdentifier(acceptanceRecord(await response.json()))
        const editor = page.getByRole('dialog', { name: '编辑付款申请单', exact: true })
        await drawerReady(editor)
        await editor.getByRole('textbox', { name: '请款事由', exact: true }).fill(marker)
        const account = editor.getByRole('combobox', { name: '付款账号', exact: true })
        await account.scrollIntoViewIfNeeded()
        await account.click()
        await page
          .getByRole('option', {
            name: '验收模拟现金账户（非银行） · QA_AP_CASH · 应付验收专用账套',
            exact: true
          })
          .click()
        await captureBusinessEvidence(editor, {
          path: info.outputPath(`${kind}-${index}-application-editor.png`)
        })
        await editor.getByRole('button', { name: '保存', exact: true }).click()
        await expect(editor).toBeHidden()
      }
      let application = await fetchSettlement('application', applicationId)
      assert.ok(typeof application.document_no === 'string')
      const applicationNo = application.document_no
      expect(application.account_set_id).toBeNull()
      expect(application.currency_code).toBe('CNY')
      expect(Number(application.amount)).toBe(index * 100)
      const applicationLine = acceptanceRows(application.lines)[0]
      expect(applicationLine.purchase_id).toBe(sourceId)
      expect(applicationLine.purpose_type).toBe('advance')
      expect(applicationLine.fund_account_id).toBe(fundAccountId)
      await openWorkspace(page, 'fms', financePaths.payableApplication, '付款申请单')
      const applicationRow = page
        .locator('.art-table-query .el-table__body-wrapper tbody tr')
        .filter({ hasText: applicationNo })
      await expect(applicationRow).toBeVisible()
      for (const [from, label, target] of [
        ['draft', '提交', 'submitted'],
        ['submitted', '审核', 'approved']
      ]) {
        if (application.status !== from) continue
        await selectRow(applicationRow)
        await page.getByRole('button', { name: label, exact: true }).click()
        await expect(applicationRow).toContainText(label === '提交' ? '已提交' : '已审核')
        application = await fetchSettlement('application', applicationId)
        expect(application.status).toBe(target)
      }
      const paymentLinks = await client
        .from('fms_payable_settlement_line')
        .select('document_id')
        .eq('tenant_id', payableAcceptanceTenantId)
        .eq('application_line_id', acceptanceIdentifier(applicationLine))
      expect(paymentLinks.error).toBeNull()
      const payments = acceptanceRows(paymentLinks.data)
      expect(payments.length).toBeLessThanOrEqual(1)
      let paymentId = payments[0] ? acceptanceIdentifier({ id: payments[0].document_id }) : ''
      if (!paymentId) {
        await selectRow(applicationRow)
        await page.getByRole('button', { name: '下推', exact: true }).click()
        const pushed = page.waitForResponse((response) =>
          response.url().endsWith('/rpc/fms_push_payable_settlement_secure')
        )
        await page
          .locator('.el-dropdown__popper:visible')
          .getByRole('menuitem', { name: '付款单', exact: true })
          .click()
        const response = await pushed
        expect(response.ok()).toBe(true)
        paymentId = acceptanceIdentifier(acceptanceRecord(await response.json()))
        const detail = page.getByRole('dialog', { name: '查看付款单', exact: true })
        await drawerReady(detail)
        await page.keyboard.press('Escape')
        await expect(detail).toBeHidden()
      }
      let payment = await fetchSettlement('payment', paymentId)
      assert.ok(typeof payment.document_no === 'string')
      const paymentNo = payment.document_no
      await openWorkspace(page, 'fms', financePaths.payablePayment, '付款单')
      const paymentRow = page
        .locator('.art-table-query .el-table__body-wrapper tbody tr')
        .filter({ hasText: paymentNo })
      await expect(paymentRow).toBeVisible()
      for (const [from, label, target] of [
        ['draft', '提交', 'submitted'],
        ['submitted', '审核', 'approved']
      ]) {
        if (payment.status !== from) continue
        await selectRow(paymentRow)
        await page.getByRole('button', { name: label, exact: true }).click()
        await expect(paymentRow).toContainText(label === '提交' ? '已提交' : '已审核')
        payment = await fetchSettlement('payment', paymentId)
        expect(payment.status).toBe(target)
      }
      if (payment.status === 'approved') {
        await selectRow(paymentRow)
        await page.getByRole('button', { name: '确认付款', exact: true }).click()
        await page
          .locator('.el-dropdown__popper:visible')
          .getByRole('menuitem', { name: '确认付款', exact: true })
          .click()
        const confirmation = page.locator('.el-message-box')
        await expect(confirmation).toBeVisible()
        await confirmation.getByRole('button', { name: '确认登记', exact: true }).click()
        await expect(paymentRow).toContainText('已确认付款')
        payment = await fetchSettlement('payment', paymentId)
      }
      expect(payment.status).toBe('confirmed')
      const executionsResult = await client
        .from('fms_payable_payment_execution')
        .select('account_set_id,fund_ledger_id,status,amount')
        .eq('tenant_id', payableAcceptanceTenantId)
        .eq('document_id', paymentId)
      expect(executionsResult.error).toBeNull()
      const executions = acceptanceRows(executionsResult.data)
      expect(executions).toHaveLength(1)
      expect(executions[0].account_set_id).toBe(accountSetId)
      expect(executions[0].status).toBe('posted')
      expect(Number(executions[0].amount)).toBe(index * 100)
      expect(typeof executions[0].fund_ledger_id).toBe('string')
      const paymentLine = acceptanceRows(payment.lines)[0]
      expect(paymentLine.application_line_id).toBe(acceptanceIdentifier(applicationLine))
      expect(paymentLine.purchase_id).toBe(sourceId)
      expect(Number(paymentLine.written_off_amount)).toBe(0)
      application = await fetchSettlement('application', applicationId)
      expect(application.payment_status).toBe('full')
      expect(Number(acceptanceRows(application.lines)[0].unassigned_amount)).toBe(0)
      await captureBusinessEvidence(page, {
        path: info.outputPath(`${kind}-${index}-paid.png`),
        fullPage: true
      })
      await paymentRow.getByRole('button', { name: '查看', exact: true }).click()
      const detail = page.getByRole('dialog', { name: '查看付款单', exact: true })
      await drawerReady(detail)
      await detail.getByRole('button', { name: sourceNo, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/scm/#${path}`))
      const original = page.getByRole('dialog', { name: `查看${title}`, exact: true })
      await drawerReady(original)
      await expect(original).toContainText(sourceNo)
      await expect(original).toContainText(String(supplier.supplier_name))
      if (kind === 'purchase_contract')
        await expect(original.getByText('已生效', { exact: true })).toHaveCount(2)
      await expect(original.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
      await assertAppearance(page, appearance)
      await captureBusinessEvidence(original, {
        path: info.outputPath(`${kind}-${index}-original.png`)
      })
      await page.keyboard.press('Escape')
      await expect(original).toBeHidden()
      sourceResult = await client.from('scm_purchase_document').select('*').eq('id', sourceId)
      expect(sourceResult.error).toBeNull()
      expect(acceptanceRows(sourceResult.data)[0].status).toBe(
        kind === 'purchase_contract' ? 'effective' : 'approved'
      )
    }
  }
  expect(errors).toEqual([])
  expect(menuScopes.some((codes) => codes.includes('scm'))).toBe(true)
  expect(menuScopes.some((codes) => codes.includes('fms'))).toBe(true)
  expect(menuScopes.every((codes) => codes.length === 1 && ['scm', 'fms'].includes(codes[0]))).toBe(
    true
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
})
