import { expect, test } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(120000)
const tenant = '7529f951-938e-4e2c-ac0d-316c136ae1f9'

for (const allowed of [true, false]) {
  test(`库存金额调整来源${allowed ? '两条联查实际财务详情' : '无权限保留编号但不越权读取'}`, async ({
    page
  }, info) => {
    const reads: string[] = []
    const writes: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (/Invalid prop|Unhandled error|Maximum recursive/.test(message.text()))
        errors.push(message.text())
    })
    const rows = [1, 2].map((index) => ({
      id: `cost-event-${index}:cost`,
      batch_id: `cost-batch-${index}`,
      business_date: '2026-10-25',
      material_code: `COST-MAT-${index}`,
      material_name: `虚构库存物料${index}`,
      material_description: '成本金额调整来源验收',
      warehouse_id: 'cost-warehouse',
      warehouse_name: '独立验收仓库',
      zone_id: null,
      bin_id: null,
      inventory_quantity: 0,
      basic_quantity: 0,
      opening_quantity: 0,
      inbound_quantity: 0,
      outbound_quantity: 0,
      closing_quantity: 0,
      amount: index * 10,
      unit_cost: null,
      document_type: 'payable_cost_adjustment',
      document_status: '已勾稽',
      document_no: `CWYF-STOCK-LINK-${index}`,
      source_document_id: `finance-cost-${index}`,
      source_document_kind: 'financial_payable',
      source_line_no: 10,
      is_cost_adjustment: true,
      stock_status: 'normal',
      stock_type: 'normal',
      direction: null,
      owner_type: 'self',
      owner_name: '本企业',
      reserved_quantity: 0,
      batch_no: `QA-STOCK-${index}`,
      inventory_unit: '件',
      basic_unit: '件'
    }))
    await page.route('**/rest/v1/**', (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1) || ''
      const request = route.request().postDataJSON() as { p_id?: string } | null
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
      if (endpoint === 'wms_inventory_report_secure')
        return route.fulfill({
          json: {
            data: rows,
            total: rows.length,
            navigation: [{ warehouse_id: 'cost-warehouse', zone_id: null, bin_id: null, count: 2 }]
          }
        })
      if (endpoint === 'mdm_warehouse')
        return route.fulfill({
          json: [
            {
              id: 'cost-warehouse',
              tenant_id: tenant,
              warehouse_code: 'QA-COST-WH',
              warehouse_name: '独立验收仓库'
            }
          ]
        })
      if (endpoint === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, catalog: null, profiles: [] } })
      if (endpoint === 'get_accessible_applications')
        return route.fulfill({ json: [{ code: 'fms', name: '财务管理', base_url: '' }] })
      if (endpoint === 'fms_purchase_payable_list_secure') {
        reads.push(request?.p_id || '')
        const selected = rows.find((row) => row.source_document_id === request?.p_id) || rows[0]
        const document = {
          id: selected.source_document_id,
          tenant_id: tenant,
          kind: 'financial',
          document_no: selected.document_no,
          status: 'approved',
          business_date: '2026-10-25',
          currency_code: 'CNY',
          account_set_name: '独立成本验收账套',
          base_currency_code: 'CNY',
          exchange_rate: 1,
          supplier_name: '虚构成本供应商',
          source_type: 'purchase_inbound',
          source_document_id: `receipt-${selected.source_document_id}`,
          source_document_no: `CGRK-${selected.document_no}`,
          standard_purchase: true,
          total_amount: 110,
          amount: 110,
          tax_amount: 0,
          matched_amount: 110,
          unmatched_amount: 0,
          lines: [
            {
              id: 'cost-line',
              line_no: 10,
              material_description: '仅作来源联查验收',
              quantity: 1,
              unit_price: 110,
              amount: 110,
              tax_amount: 0,
              total_amount: 110
            }
          ],
          payment_plans: []
        }
        return route.fulfill({ json: { data: [document], total: 1 } })
      }
      if (/^(fms_save|fms_act|fms_match|wms_post)/.test(endpoint)) writes.push(endpoint)
      return route.fulfill({ json: [] })
    })
    const parameters = new URLSearchParams({
      kind: 'movement',
      costSource: '1',
      authority: 'ordinary',
      theme: info.project.use.colorScheme === 'dark' ? 'dark' : 'light',
      box: info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    })
    if (!allowed) parameters.set('denyFinance', '1')
    for (const index of allowed ? [1, 2] : [1]) {
      await page.goto(`/tests/e2e/fixtures/wms-inventory-report.html?${parameters}`, {
        waitUntil: 'domcontentloaded'
      })
      const table = page.locator('.el-table__body-wrapper tbody')
      await expect(table.getByRole('row')).toHaveCount(2, { timeout: 60000 })
      await expect(page.getByRole('cell', { name: '库存成本调整', exact: true })).toHaveCount(2)
      const label = `CWYF-STOCK-LINK-${index}`
      if (allowed) {
        await page.getByRole('button', { name: label, exact: true }).click()
        const drawer = page.getByRole('dialog', { name: '财务应付单详情', exact: true })
        await expect(drawer).toBeVisible()
        await expect(drawer.locator('.el-skeleton:visible,.el-loading-mask:visible')).toHaveCount(0)
        await expect(drawer).toContainText(label)
        await expect(drawer).toContainText('仅作来源联查验收')
        await expect(drawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
        await captureBusinessEvidence(drawer, {
          path: info.outputPath(`stock-cost-source-${index}.png`)
        })
        await drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap').evaluate((element) => {
          element.scrollTop = element.scrollHeight
        })
        await expect(drawer.getByRole('cell', { name: '已勾稽金额', exact: true })).toBeVisible()
        await expect(drawer.getByText('已冲回金额', { exact: true })).toHaveCount(0)
        await captureBusinessEvidence(drawer, {
          path: info.outputPath(`stock-cost-source-${index}-associations.png`)
        })
      } else {
        await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0)
        await expect(
          page.locator('.business-record-link__static').filter({ hasText: label })
        ).toHaveAttribute('title', `${label} · 暂无来源单据查看权限`)
        await captureBusinessEvidence(page, {
          path: info.outputPath('stock-cost-source-denied.png'),
          fullPage: true
        })
      }
    }
    expect(writes).toEqual([])
    expect(errors).toEqual([])
    if (allowed) for (const index of [1, 2]) expect(reads).toContain(`finance-cost-${index}`)
    else expect(reads).toEqual([])
  })
}
