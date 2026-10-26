import { expect, test, type Page } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)
const tenant = '11111111-1111-4111-8111-111111111111'

async function mockCosting(
  page: Page,
  scenario: 'ready' | 'unsupported' | 'empty' | 'unbatched' = 'ready'
) {
  const unsupported = scenario === 'unsupported'
  const matched = [false, false]
  const calls: Array<Record<string, unknown>> = []
  const reads = [0, 0]
  const errors: string[] = []
  let failNextApply = true
  let failPreview = false
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (/Invalid prop|Unhandled error|Maximum recursive/.test(message.text()))
      errors.push(message.text())
  })
  const documents = [1, 2].map((index) => ({
    id: `cost-finance-${index}`,
    tenant_id: tenant,
    kind: 'financial',
    status: 'approved',
    source_type: 'purchase_inbound',
    source_document_id: `cost-receipt-${index}`,
    source_document_no: `CGRK-COST-${index}`,
    document_no: `CWYF-COST-${index}`,
    document_type_name: '标准采购应付',
    standard_purchase: true,
    business_date: '2026-10-24',
    currency_code: 'CNY',
    base_currency_code: 'CNY',
    exchange_rate: 1,
    account_set_id: 'cost-book',
    account_set_name: '独立成本验收账套',
    supplier_name: `虚构成本供应商${index}`,
    total_amount: index === 1 ? 10000.01 : 124.3,
    amount: index === 1 ? 10000.01 : 110,
    tax_amount: index === 1 ? 0 : 14.3,
    lines: [
      {
        id: `cost-line-${index}`,
        line_no: 10,
        material_description: '虚构成本验收物料',
        quantity: index === 1 ? 10000 : 1,
        unit_price: index === 1 ? 1 : 110,
        amount: index === 1 ? 10000.01 : 110,
        tax_amount: index === 1 ? 0 : 14.3,
        total_amount: index === 1 ? 10000.01 : 124.3
      }
    ]
  }))
  await page.route('**/rest/v1/**', async (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    const request = route.request().postDataJSON() as Record<string, unknown> | null
    if (endpoint === 'sys_dictionary')
      return route.fulfill({
        json: [true, false].map((value) => ({
          id: `boolean-${value}`,
          value: String(value),
          code: String(value),
          label: value ? '是' : '否',
          status: '1',
          dict_type_table: { code: 'commonBoolean' }
        }))
      })
    if (endpoint === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, catalog: null, profiles: [] } })
    if (endpoint === 'fms_purchase_payable_list_secure')
      return route.fulfill({ json: { data: documents, total: 2 } })
    if (endpoint === 'fms_preview_payable_stock_cost_secure') {
      const index = request?.p_id === documents[1].id ? 1 : 0
      reads[index] += 1
      if (failPreview)
        return route.fulfill({
          status: 503,
          json: { code: 'P0001', message: '成本预览暂不可用，请重试' }
        })
      const quantity = index === 0 ? 10000 : 1
      const adjustment = index === 0 ? 0.01 : 24.3
      return route.fulfill({
        json: {
          id: documents[index].id,
          document_no: documents[index].document_no,
          tenant_id: tenant,
          tenant_name: '独立成本验收租户',
          supplier_name: `虚构成本供应商${index + 1}`,
          account_set_id: 'cost-book',
          account_set_name: '独立成本验收账套',
          base_currency_code: 'CNY',
          version: matched[index] ? 2 : 1,
          cost_date: '2026-10-25',
          minimum_date: '2026-10-24',
          preview_token: `preview-${index}-${reads[index]}`,
          lines:
            scenario === 'empty'
              ? []
              : [
                  {
                    financial_line_id: `cost-line-${index + 1}`,
                    line_no: 10,
                    source_line_id: `cost-source-${index + 1}`,
                    source_document_no: documents[index].source_document_no,
                    source_base_unit_name: '验收件',
                    material_code: `QA-COST-${index + 1}`,
                    material_description: `用于成本验收的长物料描述及规格信息${index + 1}（不参与真实经营）`,
                    tenant_id: tenant,
                    account_set_id: 'cost-book',
                    currency_code: 'CNY',
                    logical_quantity: quantity,
                    physical_quantity: quantity,
                    basic_quantity: quantity,
                    original_amount: index === 0 ? 10000 : 100,
                    actual_cost_amount: index === 0 ? 10000.01 : 124.3,
                    ap_cost_difference: index === 0 ? 0.01 : 11.3,
                    baseline_difference: index === 0 ? 0 : 13,
                    adjustment_amount: adjustment,
                    stock_quantity: unsupported ? 0 : quantity,
                    transit_quantity: unsupported ? quantity : 0,
                    stock_value: index === 0 ? 10000 : 100,
                    valuation_gap: 0,
                    mixed_source: false,
                    all_stock: !unsupported,
                    matched: matched[index],
                    matched_date: matched[index] ? '2026-10-25' : null,
                    batches: unsupported
                      ? []
                      : [
                          {
                            id: `cost-batch-${index + 1}`,
                            batch_no: scenario === 'unbatched' ? '' : `QA-COST-BATCH-${index + 1}`,
                            quantity,
                            unit_cost: index === 0 ? 1 : 100,
                            after_unit_cost: index === 0 ? 1.000001 : 124.3,
                            adjustment_amount: adjustment,
                            organization_id: 'cost-organization',
                            organization_name: '虚构成本库存组织',
                            warehouse_id: 'cost-warehouse',
                            warehouse_name: '独立成本验收仓库',
                            account_set_id: 'cost-book',
                            account_set_name: '独立成本验收账套',
                            owner_type: 'self'
                          }
                        ]
                  }
                ]
        }
      })
    }
    if (endpoint === 'fms_match_payable_stock_cost_secure') {
      calls.push(request || {})
      if (failNextApply) {
        failNextApply = false
        return route.fulfill({
          status: 409,
          json: { code: '40001', message: '成本分配数据已变化，请重新预览并核对后确认' }
        })
      }
      const index = request?.p_id === documents[1].id ? 1 : 0
      const affected = matched[index] ? 0 : 1
      matched[index] = true
      return route.fulfill({ json: { document_id: documents[index].id, affected } })
    }
    return route.fulfill({ json: [] })
  })
  return {
    documents,
    calls,
    reads,
    errors,
    setPreviewFailure: (value: boolean) => {
      failPreview = value
    }
  }
}

async function openList(page: Page, permissions?: string[]) {
  const parameters = new URLSearchParams({
    kind: 'financial',
    theme: test.info().project.use.colorScheme === 'dark' ? 'dark' : 'light',
    box: test.info().project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
  })
  if (permissions) parameters.set('permissions', permissions.join(','))
  await page.goto(`/tests/e2e/fixtures/purchase-payable.html?${parameters}`, {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2, { timeout: 60000 })
}

async function openCost(page: Page, documentNo: string) {
  const row = page.getByRole('row').filter({ hasText: documentNo })
  if (!(await row.getByRole('checkbox').isChecked())) await row.locator('label.el-checkbox').click()
  await page.getByRole('button', { name: '成本勾稽', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '库存成本勾稽', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

test('两张财务应付成本预览、变化拒绝、逐行基线确认及只读执行快照', async ({ page }, info) => {
  const state = await mockCosting(page)
  await openList(page)
  for (const index of [0, 1]) {
    const dialog = await openCost(page, state.documents[index].document_no)
    const confirm = dialog.getByRole('button', { name: '确认成本勾稽', exact: true })
    await expect(dialog.getByText(`QA-COST-BATCH-${index + 1}`, { exact: true })).toBeVisible()
    if (index === 1) {
      await expect(confirm).toBeDisabled()
      await dialog.locator('label.el-checkbox').filter({ hasText: '已逐行核对基线差额' }).click()
    }
    await expect(confirm).toBeEnabled()
    await captureBusinessEvidence(dialog, {
      path: info.outputPath(`stock-cost-${index + 1}-preview.png`)
    })
    await dialog.locator('.art-dialog__scrollbar > .el-scrollbar__wrap').evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(
      dialog.getByRole('columnheader', { name: '调整后单位成本', exact: true })
    ).toBeVisible()
    await captureBusinessEvidence(dialog, {
      path: info.outputPath(`stock-cost-${index + 1}-batches.png`)
    })
    const batchTable = dialog.locator('.el-table').nth(1)
    await batchTable.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await expect(
      batchTable.getByRole('columnheader', { name: '调整后单位成本', exact: true })
    ).toBeInViewport()
    await captureBusinessEvidence(dialog, {
      path: info.outputPath(`stock-cost-${index + 1}-unit-costs.png`)
    })
    await confirm.click()
    if (index === 0) {
      await expect(
        dialog.getByRole('alert').filter({ hasText: '数据已被其他操作更新，请刷新后重试' })
      ).toBeVisible()
      await expect(confirm).toBeDisabled()
      await dialog.getByRole('button', { name: '重新预览成本', exact: true }).click()
      await expect(confirm).toBeEnabled()
      await confirm.click()
    }
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    await expect(page.getByText('数据加载失败', { exact: true })).toHaveCount(0)
    const history = await openCost(page, state.documents[index].document_no)
    await expect(history.getByText('已执行库存调整额', { exact: true })).toBeVisible()
    await expect(
      history.getByText('全部明细已完成成本勾稽，当前展示执行时的金额与批次快照。')
    ).toBeVisible()
    await expect(history.getByRole('button', { name: '确认成本勾稽', exact: true })).toHaveCount(0)
    await captureBusinessEvidence(history, {
      path: info.outputPath(`stock-cost-${index + 1}-history.png`)
    })
    await history.getByRole('button', { name: '关闭', exact: true }).click()
    await expect(history).toBeHidden()
    const selected = page.getByRole('row').filter({ hasText: state.documents[index].document_no })
    if (await selected.getByRole('checkbox').isChecked())
      await selected.locator('label.el-checkbox').click()
  }
  expect(state.calls).toHaveLength(3)
  expect(state.calls[0].p_preview_token).not.toBe(state.calls[1].p_preview_token)
  expect(state.calls[2]).toMatchObject({
    p_id: 'cost-finance-2',
    p_ack_baseline: true,
    p_date: '2026-10-25'
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(state.errors).toEqual([])
})

test('成本预览失败可以重试，不把缺失金额当作零成本', async ({ page }, info) => {
  const state = await mockCosting(page)
  state.setPreviewFailure(true)
  await openList(page)
  const dialog = await openCost(page, state.documents[0].document_no)
  await expect(dialog.getByText('成本预览暂不可用，请重试', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确认成本勾稽', exact: true })).toBeDisabled()
  state.setPreviewFailure(false)
  await dialog.getByRole('button', { name: '重新预览成本', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '确认成本勾稽', exact: true })).toBeEnabled()
  await expect(dialog.getByText('QA-COST-BATCH-1', { exact: true })).toBeVisible()
  await captureBusinessEvidence(dialog, { path: info.outputPath('stock-cost-preview-retry.png') })
  expect(state.calls).toEqual([])
  expect(state.errors).toEqual([])
})

test('已发出或在途库存保留核对信息但禁止直接改写现存单价', async ({ page }) => {
  const state = await mockCosting(page, 'unsupported')
  await openList(page)
  const dialog = await openCost(page, state.documents[0].document_no)
  await expect(
    dialog.getByRole('alert').filter({ hasText: '已发出、在途或混合库存' })
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确认成本勾稽', exact: true })).toBeDisabled()
  expect(state.calls).toEqual([])
  expect(state.errors).toEqual([])
})

test('只有财务查看权限时不显示成本操作，也不读取成本预览', async ({ page }) => {
  const state = await mockCosting(page)
  await openList(page, ['FinancePurchasePayable:View'])
  await page
    .getByRole('row')
    .filter({ hasText: state.documents[0].document_no })
    .locator('label.el-checkbox')
    .click()
  await expect(page.getByRole('button', { name: '成本勾稽', exact: true })).toHaveCount(0)
  expect(state.reads).toEqual([0, 0])
  expect(state.calls).toEqual([])
  expect(state.errors).toEqual([])
})

test('空成本清单不显示已执行零金额，也不允许确认', async ({ page }) => {
  const state = await mockCosting(page, 'empty')
  await openList(page)
  const dialog = await openCost(page, state.documents[0].document_no)
  await expect(dialog.getByText('没有可核对的物料明细', { exact: true })).toBeVisible()
  await expect(dialog.getByText('已执行库存调整额', { exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '确认成本勾稽', exact: true })).toHaveCount(0)
  expect(state.calls).toEqual([])
  expect(state.errors).toEqual([])
})

test('无批号库存仍可核对成本，不把未启用批号误判为缺失批次', async ({ page }, info) => {
  const state = await mockCosting(page, 'unbatched')
  await openList(page)
  const dialog = await openCost(page, state.documents[0].document_no)
  await expect(dialog.getByText('无批号', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确认成本勾稽', exact: true })).toBeEnabled()
  await dialog.locator('.art-dialog__scrollbar > .el-scrollbar__wrap').evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await captureBusinessEvidence(dialog, { path: info.outputPath('stock-cost-unbatched.png') })
  expect(state.errors).toEqual([])
})
