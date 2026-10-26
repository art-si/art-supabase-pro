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
import { financePaths, WMS_PURCHASE_INBOUND_PATH } from '../../src/router/business-paths'

const enabled =
  process.env.E2E_PAYABLE_LIVE === 'true' && process.env.E2E_PAYABLE_STOCK_COST_NATIVE === 'true'
const sources = [
  {
    id: 'b558b34d-30a4-4b86-8383-0da0a68567b4',
    number: 'CGRK202610-001',
    quantity: 1,
    batch: '1c65cc84-ee10-48b4-9b0b-59ecaa5c9990'
  },
  {
    id: 'a6158038-456b-4d77-b457-16036aaa137c',
    number: 'CGRK202610-002',
    quantity: 2,
    batch: '84efb414-6407-493b-bd76-e9e4d8c43e19'
  }
]
const accountSetId = 'cf3eeddd-49b0-4e62-97a9-cab2769cb633'
const stockMovementPath = '/wms/inventory-trace/inventory-ledger'

test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-wms.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 25000
})
test.setTimeout(360000)

async function openWorkspace(
  page: Page,
  application: 'wms' | 'fms' | 'mdm',
  path: string,
  title: string
): Promise<void> {
  const base = process.env.E2E_BASE_URL
  assert.ok(base)
  const target = new URL(`/${application}/#${path}`, base).href
  if (page.url() !== target) {
    const loaded = page.waitForResponse((response) => {
      const url = new URL(response.url())
      if (application === 'mdm')
        return url.pathname.endsWith('/mdm_document_type') && Boolean(url.searchParams.get('order'))
      if (application === 'fms')
        return (
          url.pathname.endsWith('/rpc/fms_purchase_payable_list_secure') &&
          !response.request().postDataJSON()?.p_id
        )
      return path === stockMovementPath
        ? url.pathname.endsWith('/rpc/wms_inventory_report_secure') &&
            response.request().postDataJSON()?.p_kind === 'movement'
        : url.pathname.endsWith('/wms_purchase_document_list')
    })
    const [, response] = await Promise.all([
      page.goto(target, { waitUntil: 'domcontentloaded' }),
      loaded
    ])
    expect(response.ok()).toBe(true)
  }
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) {
    try {
      await guide.click({ timeout: 1000 })
    } catch (cause) {
      if (await guide.isVisible()) throw cause
    }
  }
}

async function ready(dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible()
  await expect(
    dialog.locator('[aria-busy="true"]:visible,.el-skeleton:visible,.el-loading-mask:visible')
  ).toHaveCount(0)
  await expect(dialog.locator('.el-alert--error:visible')).toHaveCount(0)
}

async function selectRow(row: Locator): Promise<void> {
  if (!(await row.getByRole('checkbox').isChecked())) await row.locator('label.el-checkbox').click()
}

async function scrollBottom(dialog: Locator, kind: 'drawer' | 'dialog'): Promise<void> {
  const scroll = dialog.locator(`.art-${kind}__scrollbar > .el-scrollbar__wrap`)
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect
    .poll(() =>
      scroll.evaluate(
        (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1
      )
    )
    .toBe(true)
}

test('两条原生采购收票审核冲回及库存成本勾稽，不发生资金支付', async ({ page, context }, info) => {
  test.skip(
    !enabled ||
      process.env.E2E_PAYABLE_STOCK_COST_MUTATE !== 'true' ||
      info.project.name !== 'desktop-1440',
    '仅显式执行独立租户的两条成本经营流程'
  )
  const client = await assertPayableAcceptanceSession(context)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (/Invalid prop|Unhandled error|Maximum recursive/.test(message.text()))
      errors.push(message.text())
  })
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const fetchPayable = async (id: string) => {
    const response = acceptanceRecord(
      await acceptanceRpc(client, 'fms_purchase_payable_list_secure', {
        p_kind: 'financial',
        p_id: id
      })
    )
    const records = acceptanceRows(response.data)
    expect(records).toHaveLength(1)
    return records[0]
  }
  for (const [index, source] of sources.entries()) {
    const existing = await client
      .from('fms_purchase_payable_document')
      .select('id,document_no,status')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('kind', 'financial')
      .eq('source_document_id', source.id)
      .eq('is_reversal', false)
    expect(existing.error).toBeNull()
    const records = acceptanceRows(existing.data)
    expect(records.length).toBeLessThanOrEqual(1)
    let financialId = records[0] ? acceptanceIdentifier(records[0]) : ''
    if (!financialId) {
      await openWorkspace(page, 'wms', WMS_PURCHASE_INBOUND_PATH, '采购入库单')
      const sourceRow = page
        .locator('.art-table-query .el-table__body-wrapper tbody tr')
        .filter({ hasText: source.number })
      await expect(sourceRow).toContainText('已审核')
      await sourceRow.getByRole('button', { name: '更多操作', exact: true }).click()
      const pushed = page.waitForResponse(
        (response) =>
          response.url().endsWith('/rpc/wms_push_purchase_payables_secure') &&
          response.request().postDataJSON()?.p_kind === 'financial'
      )
      await page.getByRole('menuitem', { name: '下推财务应付单', exact: true }).click()
      const response = await pushed
      expect(response.ok()).toBe(true)
      const generated = acceptanceRows(await response.json())
      expect(generated).toHaveLength(1)
      expect(generated[0].source_document_id).toBe(source.id)
      financialId = acceptanceIdentifier(generated[0])
      const resultDialog = page.getByRole('dialog', { name: '财务应付单', exact: true })
      await ready(resultDialog)
      await captureBusinessEvidence(resultDialog, {
        path: info.outputPath(`stock-cost-${index + 1}-wms-result.png`)
      })
      await resultDialog.getByRole('button', { name: '查看应付单', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/fms/.*${financialId}`))
      const detail = page.getByRole('dialog', { name: '财务应付单详情', exact: true })
      await ready(detail)
      await expect(detail).toContainText(source.number)
      await captureBusinessEvidence(detail, {
        path: info.outputPath(`stock-cost-${index + 1}-linked-draft.png`)
      })
      await detail.locator('.el-drawer__close-btn').click()
      await expect(detail).toBeHidden()
    }
    let financial = await fetchPayable(financialId)
    assert.ok(typeof financial.document_no === 'string')
    const documentNo = financial.document_no
    await openWorkspace(page, 'fms', financePaths.financialPayable, '财务应付单')
    const row = page
      .locator('.art-table-query .el-table__body-wrapper tbody tr')
      .filter({ hasText: documentNo })
    await expect(row).toBeVisible()
    if (financial.status === 'draft') {
      await row.getByRole('button', { name: '编辑', exact: true }).click()
      const editor = page.getByRole('dialog', { name: '编辑财务应付单', exact: true })
      await ready(editor)
      const save = editor.getByRole('button', { name: '保存', exact: true })
      await expect(save).toBeEnabled()
      const gross = editor.getByRole('spinbutton', { name: '含税单价', exact: true })
      await gross.fill('124.3')
      await gross.press('Tab')
      await captureBusinessEvidence(editor, {
        path: info.outputPath(`stock-cost-${index + 1}-financial-editor.png`)
      })
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith('/rpc/fms_save_purchase_payable_secure') &&
          response.request().postDataJSON()?.p_document?.id === financialId
      )
      await save.click()
      expect((await saved).ok()).toBe(true)
      await expect(editor).toBeHidden()
      financial = await fetchPayable(financialId)
    }
    expect(financial.total_amount).toBe(124.3 * source.quantity)
    expect(financial.amount).toBe(110 * source.quantity)
    expect(financial.tax_excluded_from_cost).not.toBe(false)
    for (const [from, label, action, target] of [
      ['draft', '提交', 'submit', 'submitted'],
      ['submitted', '审核', 'approve', 'approved']
    ]) {
      if (financial.status !== from) continue
      await selectRow(row)
      const changed = page.waitForResponse(
        (response) =>
          response.url().endsWith('/rpc/fms_act_purchase_payable_secure') &&
          response.request().postDataJSON()?.p_action === action
      )
      await page.getByRole('button', { name: label, exact: true }).click()
      expect((await changed).ok()).toBe(true)
      await expect(row).toContainText(label === '提交' ? '已提交' : '已审核')
      financial = await fetchPayable(financialId)
      expect(financial.status).toBe(target)
    }
    expect(financial.account_set_id).toBe(accountSetId)
    const reversals = await client
      .from('fms_purchase_payable_document')
      .select('id')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('reversal_source_id', financialId)
    expect(reversals.error).toBeNull()
    const reversalIds = acceptanceRows(reversals.data).map(acceptanceIdentifier)
    expect(reversalIds).toHaveLength(1)
    const reversedLines = await client
      .from('fms_purchase_payable_line')
      .select('quantity,unit_price,total_amount,cost_difference')
      .in('document_id', reversalIds)
    expect(reversedLines.error).toBeNull()
    expect(acceptanceRows(reversedLines.data)).toEqual([
      expect.objectContaining({
        quantity: -source.quantity,
        unit_price: 100,
        total_amount: -113 * source.quantity,
        cost_difference: 10 * source.quantity
      })
    ])
    await selectRow(row)
    await page.getByRole('button', { name: '成本勾稽', exact: true }).click()
    const cost = page.getByRole('dialog', { name: '库存成本勾稽', exact: true })
    await ready(cost)
    await expect(cost).toContainText(documentNo)
    const confirm = cost.getByRole('button', { name: '确认成本勾稽', exact: true })
    if (Number(financial.matched_amount) === 0) {
      await expect(confirm).toBeEnabled()
      await captureBusinessEvidence(cost, {
        path: info.outputPath(`stock-cost-${index + 1}-native-preview.png`)
      })
      const applied = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_match_payable_stock_cost_secure')
      )
      await confirm.click()
      const response = await applied
      expect(response.ok()).toBe(true)
      expect(acceptanceRecord(await response.json())).toMatchObject({
        affected: 1,
        document_id: financialId
      })
      await expect(cost).toBeHidden()
    } else {
      await expect(confirm).toHaveCount(0)
      await cost.getByRole('button', { name: '关闭', exact: true }).click()
    }
    financial = await fetchPayable(financialId)
    expect(financial.matching_status).toBe('full')
    expect(financial.matched_amount).toBe(124.3 * source.quantity)
    const stock = await client
      .from('wms_inventory_batch')
      .select('quantity,unit_cost')
      .eq('id', source.batch)
      .single()
    expect(stock.error).toBeNull()
    expect(acceptanceRecord(stock.data)).toMatchObject({
      quantity: source.quantity,
      unit_cost: 110
    })
  }
  expect(errors).toEqual([])
})

test('两条实际成本执行快照、库存金额来源及标星单据类型只读视觉复核', async ({
  page,
  context
}, info) => {
  test.skip(!enabled, '仅显式复核独立验收租户已完成成本流程')
  const client = await assertPayableAcceptanceSession(context)
  const errors: string[] = []
  const writes: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (
      /\/rpc\/(fms_(save|act|push|match|import)|wms_(save|change|push)|mdm_save)/.test(
        request.url()
      )
    )
      writes.push(new URL(request.url()).pathname)
  })
  const appearance = {
    theme: info.project.use.colorScheme === 'dark' ? ('dark' as const) : ('light' as const),
    boxBorderMode: !info.project.name.includes('shadow')
  }
  await prepareAppearance(page, appearance)
  await openWorkspace(page, 'mdm', '/mdm/governance/document-type', '单据类型')
  await applyAppearance(page, appearance)
  await assertAppearance(page, appearance)
  await expect(page.locator('.art-table-query .el-table__body-wrapper tbody tr')).not.toHaveCount(0)
  await captureBusinessEvidence(page, {
    path: info.outputPath('approved-document-type-reference.png'),
    fullPage: true
  })
  for (const [index, source] of sources.entries()) {
    const found = await client
      .from('fms_purchase_payable_document')
      .select('id,document_no')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('kind', 'financial')
      .eq('source_document_id', source.id)
      .eq('is_reversal', false)
      .single()
    expect(found.error).toBeNull()
    const financial = acceptanceRecord(found.data)
    assert.ok(typeof financial.document_no === 'string')
    await openWorkspace(page, 'fms', financePaths.financialPayable, '财务应付单')
    await applyAppearance(page, appearance)
    await assertAppearance(page, appearance)
    const row = page
      .locator('.art-table-query .el-table__body-wrapper tbody tr')
      .filter({ hasText: financial.document_no })
    await selectRow(row)
    await page.getByRole('button', { name: '成本勾稽', exact: true }).click()
    const cost = page.getByRole('dialog', { name: '库存成本勾稽', exact: true })
    await ready(cost)
    await expect(
      cost.getByText('全部明细已完成成本勾稽，当前展示执行时的金额与批次快照。')
    ).toBeVisible()
    await expect(cost.getByRole('button', { name: '确认成本勾稽', exact: true })).toHaveCount(0)
    await captureBusinessEvidence(cost, {
      path: info.outputPath(`stock-cost-${index + 1}-native-history-top.png`)
    })
    await scrollBottom(cost, 'dialog')
    await captureBusinessEvidence(cost, {
      path: info.outputPath(`stock-cost-${index + 1}-native-history-bottom.png`)
    })
    const batchTable = cost.locator('.el-table').nth(1)
    await batchTable.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await expect(
      batchTable.getByRole('columnheader', { name: '调整后单位成本', exact: true })
    ).toBeInViewport()
    await captureBusinessEvidence(cost, {
      path: info.outputPath(`stock-cost-${index + 1}-native-history-unit-costs.png`)
    })
    await cost.getByRole('button', { name: '关闭', exact: true }).click()
    await openWorkspace(page, 'wms', stockMovementPath, '库存流水')
    await applyAppearance(page, appearance)
    await expect(page.getByRole('button', { name: '展开', exact: true })).toBeVisible()
    const materialControl = page
      .getByRole('textbox', { name: '物料编码', exact: true })
      .locator('..')
    const materialBounds = await materialControl.boundingBox()
    const resetBounds = await page.getByRole('button', { name: '重置', exact: true }).boundingBox()
    assert.ok(materialBounds && resetBounds)
    const overlapWidth =
      Math.min(materialBounds.x + materialBounds.width, resetBounds.x + resetBounds.width) -
      Math.max(materialBounds.x, resetBounds.x)
    const overlapHeight =
      Math.min(materialBounds.y + materialBounds.height, resetBounds.y + resetBounds.height) -
      Math.max(materialBounds.y, resetBounds.y)
    expect(overlapWidth <= 0 || overlapHeight <= 0).toBe(true)
    await expect
      .poll(() =>
        page
          .locator('.art-table-query .el-table__body-wrapper')
          .evaluate((element) => element.clientHeight)
      )
      .toBeGreaterThanOrEqual(144)
    const costRow = page
      .locator('.art-table-query .el-table__body-wrapper tbody tr')
      .filter({ hasText: financial.document_no })
    await expect(costRow).toContainText('库存成本调整')
    await captureBusinessEvidence(page, {
      path: info.outputPath(`stock-cost-${index + 1}-native-stock-movement.png`),
      fullPage: true
    })
    const movementTable = page.locator('.art-table-query .el-table')
    const amountCell = costRow.getByRole('cell', {
      name: `¥${(source.quantity * 10).toFixed(2)}`,
      exact: true
    })
    await amountCell.scrollIntoViewIfNeeded()
    await expect(
      movementTable.getByRole('columnheader', { name: '金额(元)', exact: true })
    ).toBeInViewport()
    await expect(amountCell).toBeVisible()
    await expect(costRow).toContainText('自有')
    await expect(costRow).not.toContainText('self')
    await captureBusinessEvidence(page, {
      path: info.outputPath(`stock-cost-${index + 1}-native-stock-amount.png`),
      fullPage: true
    })
    const linked = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/fms_purchase_payable_list_secure') &&
        response.request().postDataJSON()?.p_id === financial.id
    )
    await costRow.getByRole('button', { name: financial.document_no, exact: true }).click()
    expect((await linked).ok()).toBe(true)
    const detail = page.getByRole('dialog', { name: '财务应付单详情', exact: true })
    await ready(detail)
    await expect(detail).toContainText(source.number)
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`stock-cost-${index + 1}-native-source-top.png`)
    })
    await scrollBottom(detail, 'drawer')
    const matchedLabel = detail.getByRole('cell', { name: '已勾稽金额', exact: true })
    await expect(matchedLabel).toBeVisible()
    await expect(matchedLabel.locator('xpath=following-sibling::td[1]')).toHaveText(
      `¥${(124.3 * source.quantity).toFixed(2)}`
    )
    await expect(detail.getByText('已冲回金额', { exact: true })).toHaveCount(0)
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`stock-cost-${index + 1}-native-source-bottom.png`)
    })
    await detail.locator('.el-drawer__close-btn').click()
    await expect(detail).toBeHidden()
  }
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
