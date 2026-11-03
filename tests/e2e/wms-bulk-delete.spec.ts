import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

async function prepare(page: Page, kind: string, scenario = 'success') {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const filter = new URL(route.request().url()).searchParams.get('dict_type_table.code')
    const rows = [
      { code: 'document', label: '按单据', sort: 1 },
      { code: 'line', label: '按明细', sort: 2 }
    ].map((item) => ({
      ...item,
      id: item.code,
      value: item.code,
      status: '1',
      dict_type_table: { code: 'commonDocumentDisplayMode', name: '单据列表展示方式' }
    }))
    return route.fulfill({ json: filter === 'eq.commonDocumentDisplayMode' ? rows : [] })
  })
  const contextRace = scenario.startsWith('late-')
  const deleted: string[] = []
  const writes: string[] = []
  const tableReads: string[] = []
  const inspections: string[][] = []
  const state = {
    deleted,
    writes,
    tableReads,
    inspections,
    releaseWrite: undefined as (() => void) | undefined
  }
  const stock = kind === 'stock'
  const sales = kind.startsWith('sales')
  const documentKind = kind.endsWith('return')
    ? 'initial_return'
    : sales
      ? 'initial_outbound'
      : 'initial_inbound'
  const table = stock
    ? 'wms_initial_stock_document'
    : sales
      ? 'wms_sales_document_list'
      : 'wms_purchase_document_list'
  const documents = [1, 2, 3].map((index) => {
    const id = `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`
    const documentNo = `TEST-OPEN-${index}`
    const lines = [1, 2].map((line) => ({
      id: `${id}-${line}`,
      line_id: `${id}-${line}`,
      line_no: line,
      document_id: id,
      document_no: documentNo,
      kind: documentKind,
      status: index === 3 ? 'approved' : 'draft',
      material_code: `TEST-M-${line}`,
      material_description: `测试物料 ${line}`,
      inventory_unit_name: '件',
      opening_quantity: 10,
      quantity: 10,
      amount: 20,
      tax_amount: 0,
      discount_amount: 0,
      total_amount: 20,
      currency_code: 'CNY',
      business_date: '2026-10-01',
      accounting_date: '2026-10-01',
      material: { code: `TEST-M-${line}`, name: `测试物料 ${line}` },
      inventoryUnit: { unit_name: '件' },
      warehouse: { name: '测试仓库' },
      serial_nos: []
    }))
    return { id, document_no: documentNo, status: lines[0].status, lines }
  })
  const documentsB = documents.map((row, index) => {
    const id = `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, '0')}`
    return {
      ...row,
      id,
      document_no: `TEST-B-${index + 1}`,
      lines: row.lines.map((line) => ({
        ...line,
        id: `${id}-${line.line_no}`,
        line_id: `${id}-${line.line_no}`,
        document_id: id,
        document_no: `TEST-B-${index + 1}`
      }))
    }
  })
  await page.route(`**/rest/v1/${table}?*`, async (route) => {
    const selectedTenant = route.request().headers()['x-art-tenant-scope'] ?? ''
    tableReads.push(selectedTenant)
    const source =
      contextRace && selectedTenant === '22222222-2222-4222-8222-222222222222'
        ? documentsB
        : documents
    const remaining = source.filter((row) => !deleted.includes(row.id))
    const rows = stock ? remaining : remaining.flatMap((row) => row.lines)
    await route.fulfill({
      json: rows,
      headers: {
        'content-range': `0-${rows.length - 1}/${rows.length}`,
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  if (!stock && !sales) {
    await page.route('**/rest/v1/wms_purchase_document?*', async (route) => {
      const rows = documents.filter((row) => !deleted.includes(row.id))
      await route.fulfill({
        json: rows,
        headers: {
          'content-range': `0-${rows.length - 1}/${rows.length}`,
          'access-control-expose-headers': 'content-range'
        }
      })
    })
  }
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details*', async (route) => {
    const body = route.request().postDataJSON() as { p_ids: string[] }
    inspections.push(body.p_ids)
    if (scenario === 'reference-error') {
      await route.fulfill({ status: 403, json: { code: '42501', message: '关联检查无权限' } })
    } else if (scenario === 'blocked' || (scenario === 'fk-current' && inspections.length > 1)) {
      await route.fulfill({
        json: [
          {
            resource_id: body.p_ids[0],
            source_table: 'wms_inventory_movement',
            record_id: 'movement-test',
            target_id: 'movement-test',
            record_no: 'TEST-MOVEMENT-001',
            record_status: '已入账',
            record_summary: '测试库存流水',
            created_at: '2026-10-01T00:00:00Z'
          }
        ]
      })
    } else await route.fulfill({ json: [] })
  })
  await page.route('**/rest/v1/rpc/wms_change_*status_secure*', async (route) => {
    const body = route.request().postDataJSON() as { p_document_id: string; p_action: string }
    expect(body.p_action).toBe('delete')
    writes.push(body.p_document_id)
    if (contextRace) await new Promise<void>((resolve) => (state.releaseWrite = resolve))
    if (scenario === 'late-fk' || scenario === 'fk-current') {
      await route.fulfill({
        status: 409,
        json: {
          code: '23503',
          message:
            'update or delete on table "wms_initial_stock_document" violates foreign key constraint "wms_inventory_movement_source_document_id_fkey" on table "wms_inventory_movement"',
          details: `Key (id)=(${body.p_document_id}) is still referenced from table "wms_inventory_movement".`
        }
      })
    } else if ((scenario === 'partial' && deleted.length === 1) || scenario === 'late-reject') {
      await route.fulfill({
        status: 400,
        json: { code: '23514', message: '单据状态已变化，请刷新后重试' }
      })
    } else {
      deleted.push(body.p_document_id)
      await route.fulfill({ json: null })
    }
  })
  await page.goto(
    `/tests/e2e/fixtures/wms-bulk-delete.html?kind=${kind}${scenario === 'readonly' ? '&authority=readonly' : ''}${contextRace ? '&contextRace=1' : ''}`
  )
  if (contextRace || scenario === 'fk-current') await installActionFeedbackHistory(page)
  await expect(page.locator('.el-table__body-wrapper tbody tr')).toHaveCount(3)
  return state
}

async function selectRows(page: Page, indices: number[]) {
  for (const index of indices) {
    await page
      .locator('.el-table__body-wrapper tbody tr')
      .nth(index)
      .locator('.el-checkbox')
      .first()
      .click()
  }
}

for (const kind of ['stock', 'sales', 'sales-return', 'purchase', 'purchase-return']) {
  for (const mode of ['按单据', '按明细']) {
    test(`${kind} ${mode}：引用校验后按单据去重删除`, async ({ page }, testInfo) => {
      const { deleted, inspections } = await prepare(page, kind)
      if (mode === '按明细') {
        await page.getByText(mode, { exact: true }).click()
        await expect(page.locator('.el-table__body-wrapper tbody tr')).toHaveCount(6)
      }
      await selectRows(page, mode === '按明细' ? [0, 1, 2, 3] : [0, 1])
      await page.getByRole('button', { name: '批量删除', exact: true }).click()
      const confirm = page.locator('.el-message-box')
      await expect(confirm).toContainText('确认删除 2 张')
      await expect(confirm).toContainText('所属整张单据及全部明细')
      expect(inspections[0]).toHaveLength(2)
      expect(deleted).toHaveLength(0)
      await page.screenshot({ path: testInfo.outputPath(`${kind}-${mode}-confirm.png`) })
      await confirm.getByRole('button', { name: '删除', exact: true }).click()
      await expect.poll(() => deleted.length).toBe(2)
      expect(new Set(deleted).size).toBe(2)
      await expect(page.locator('.el-table__body-wrapper tbody tr')).toHaveCount(
        mode === '按明细' ? 2 : 1
      )
    })
  }
}

for (const scenario of ['blocked', 'reference-error', 'partial', 'readonly', 'mixed', 'cancel']) {
  test(`批量删除防护：${scenario}`, async ({ page }) => {
    const { deleted, inspections } = await prepare(page, 'stock', scenario)
    if (scenario === 'readonly') {
      await selectRows(page, [0])
      await expect(page.getByRole('button', { name: '批量删除', exact: true })).toHaveCount(0)
      return
    }
    await selectRows(page, scenario === 'mixed' ? [0, 2] : [0, 1])
    if (scenario === 'mixed') {
      await expect(page.getByRole('button', { name: '批量删除', exact: true })).toBeDisabled()
      expect(inspections).toHaveLength(0)
    } else {
      await page.getByRole('button', { name: '批量删除', exact: true }).click()
      if (scenario === 'blocked' || scenario === 'reference-error') {
        await expect(page.locator('.el-dialog:visible')).toBeVisible()
        if (scenario === 'blocked')
          await expect(page.locator('.el-dialog:visible')).toContainText('TEST-MOVEMENT-001')
        await expect(page.locator('.el-message-box')).toHaveCount(0)
      } else {
        const confirm = page.locator('.el-message-box')
        await expect(confirm).toBeVisible()
        if (scenario === 'cancel')
          await confirm.getByRole('button', { name: '取消', exact: true }).click()
        else {
          await confirm.getByRole('button', { name: '删除', exact: true }).click()
          await expect(
            page.getByText('已删除 1 张，其余单据未删除', { exact: false })
          ).toBeVisible()
          expect(inspections).toHaveLength(2)
          expect(deleted).toHaveLength(1)
          return
        }
      }
    }
    expect(deleted).toHaveLength(0)
  })
}

for (const outcome of ['late-success', 'late-reject', 'late-fk'] as const) {
  test(`批量删除最后请求晚到切租户不污染新列表：${outcome}`, async ({ page }, info) => {
    const state = await prepare(page, 'stock', outcome)
    const unexpectedWrites: string[] = []
    page.on('request', (request) => {
      if (
        request.url().includes('/rest/v1/') &&
        request.method() !== 'GET' &&
        !request.url().includes('/rpc/get_record_delete_dependency_details') &&
        !request.url().includes('/rpc/wms_change_initial_stock_status_secure')
      )
        unexpectedWrites.push(`${request.method()} ${new URL(request.url()).pathname}`)
    })
    await selectRows(page, [0])
    await page.getByRole('button', { name: '批量删除', exact: true }).click()
    const confirm = page.locator('.el-message-box')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: '删除', exact: true }).click()
    await expect.poll(() => state.writes.length).toBe(1)
    expect(state.writes).toEqual(['22222222-2222-4222-8222-000000000001'])
    expect(state.inspections).toHaveLength(1)
    await page.getByRole('button', { name: '切换租户 B', exact: true }).click()
    await expect(page.getByTestId('bulk-context')).toHaveText(
      '22222222-2222-4222-8222-222222222222'
    )
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect.poll(() => state.tableReads).toContain('22222222-2222-4222-8222-222222222222')
    await expect(page.locator('.el-table__body-wrapper tbody tr').first()).toContainText('TEST-B-1')
    await selectRows(page, [0])
    await expect(page.locator('.art-table-query__selection-bar')).toBeVisible()
    const bReads = state.tableReads.filter(
      (scope) => scope === '22222222-2222-4222-8222-222222222222'
    ).length
    await page.screenshot({ path: info.outputPath(`${outcome}-before-release.png`) })
    const oldResponse = page.waitForResponse((response) =>
      response.url().includes('/rpc/wms_change_initial_stock_status_secure')
    )
    state.releaseWrite?.()
    await (await oldResponse).finished()
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    )
    await expect(page.locator('.el-table__body-wrapper tbody tr').first()).toContainText('TEST-B-1')
    await expect(page.locator('.art-table-query__selection-bar')).toBeVisible()
    expect(
      state.tableReads.filter((scope) => scope === '22222222-2222-4222-8222-222222222222')
    ).toHaveLength(bReads)
    expect(state.inspections).toHaveLength(1)
    expect(state.writes).toHaveLength(1)
    await expect(page.getByTestId('bulk-reference-events')).toHaveText('0')
    expect(await readActionFeedbackHistory(page)).toEqual([])
    expect(unexpectedWrites).toEqual([])
    await page.screenshot({ path: info.outputPath(`${outcome}-after-release.png`) })
  })
}

test('批量删除同上下文23503由本地守卫复查且无全局重复反馈', async ({ page }, info) => {
  const state = await prepare(page, 'stock', 'fk-current')
  await selectRows(page, [0])
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  const confirm = page.locator('.el-message-box')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '删除', exact: true }).click()
  await expect.poll(() => state.inspections.length).toBe(2)
  await expect(page.locator('.el-dialog:visible')).toContainText('TEST-MOVEMENT-001')
  await expect(page.getByTestId('bulk-reference-events')).toHaveText('0')
  await expect.poll(() => state.writes.length).toBe(1)
  await expect
    .poll(
      async () =>
        (await readActionFeedbackHistory(page)).filter((item) => item.kind === 'error').length
    )
    .toBe(1)
  expect(state.deleted).toEqual([])
  await page.screenshot({ path: info.outputPath('same-context-fk-local-guard.png') })
})

test('初始库存窄屏选择栏、切换视图与专注模式', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await prepare(page, 'stock')
  await selectRows(page, [0])
  await expect(page.locator('.art-table-query__selection-bar')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
    false
  )
  await page.screenshot({ path: testInfo.outputPath('stock-selection-1280.png') })
  await page.getByText('按明细', { exact: true }).click()
  await expect(page.locator('.el-table__body-wrapper tbody tr')).toHaveCount(6)
  await expect(page.locator('.art-table-query__selection-bar')).toHaveCount(0)
  await page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
    .click()
  await expect(page.locator('.art-table-query')).toHaveClass(/is-focus-mode/)
  await expect(page.locator('.wms-initialization-header')).not.toBeVisible()
  await selectRows(page, [0, 1])
  await expect(page.getByRole('button', { name: '批量删除', exact: true })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('stock-focus-1280.png') })
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(page.locator('.wms-initialization-header')).toBeVisible()
  await page
    .locator('.business-table-workspace-actions__toggle')
    .filter({ hasText: '专注模式' })
    .locator('.el-switch')
    .click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.wms-initialization-header')).toBeVisible()
})
