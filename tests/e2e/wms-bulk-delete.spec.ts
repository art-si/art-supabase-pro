import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

async function prepare(page: Page, kind: string, scenario = 'success') {
  await prepareIsolatedSession(page)
  const deleted: string[] = []
  const inspections: string[][] = []
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
  await page.route(`**/rest/v1/${table}?*`, async (route) => {
    const remaining = documents.filter((row) => !deleted.includes(row.id))
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
    } else if (scenario === 'blocked') {
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
    if (scenario === 'partial' && deleted.length === 1) {
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
    `/tests/e2e/fixtures/wms-bulk-delete.html?kind=${kind}${scenario === 'readonly' ? '&authority=readonly' : ''}`
  )
  await expect(page.locator('.el-table__body-wrapper tbody tr')).toHaveCount(3)
  return { deleted, inspections }
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
    await page.getByRole('button', { name: '批量删除', exact: true }).click()
    if (scenario === 'mixed') {
      await expect(page.getByText('仅可批量删除可维护的暂存单据', { exact: false })).toBeVisible()
      expect(inspections).toHaveLength(0)
    } else if (scenario === 'blocked' || scenario === 'reference-error') {
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
        await expect(page.getByText('已删除 1 张，其余单据未删除', { exact: false })).toBeVisible()
        expect(inspections).toHaveLength(2)
        expect(deleted).toHaveLength(1)
        return
      }
    }
    expect(deleted).toHaveLength(0)
  })
}

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
