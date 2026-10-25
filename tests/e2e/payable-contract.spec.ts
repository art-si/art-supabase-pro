import { expect, test } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(240000)

for (const kind of ['estimated', 'financial'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${kind} ${theme} 两张应付关联合同、含税价不漂移并保留历史编号`, async ({
      page
    }, info) => {
      const contracts = [1, 2].map((index) => ({
        id: `contract-${index}`,
        code: `CGHT-QA-${index}`,
        name: `CGHT-QA-${index} · 示例供应商`
      }))
      let records = [1, 2].map((index) => ({
        id: `payable-${index}`,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        kind,
        document_no: `QA-${kind}-${index}`,
        document_type_id: 'type',
        document_type_name: kind === 'estimated' ? '标准采购暂估' : '标准采购应付',
        source_type: 'manual',
        supplier_id: 'supplier',
        supplier_name: '示例供应商',
        business_date: '2026-10-22',
        posting_date: '2026-10-22',
        status: 'draft',
        version: 1,
        currency_code: 'CNY',
        account_set_id: 'book',
        base_currency_code: 'CNY',
        exchange_rate: 1,
        input_tax_inclusive_price: true,
        amount: index === 1 ? 0.04 : 99955.75,
        tax_amount: index === 1 ? 0 : 12994.25,
        total_amount: index === 1 ? 0.04 : 112950,
        payment_plans: [],
        remark: '',
        lines: [
          {
            id: `line-${index}`,
            line_no: 10,
            material_id: 'material',
            material_code: 'QA-MAT',
            material_description: '合同验收物料',
            inventory_unit_id: 'unit',
            unit_name: '件',
            quantity: index === 1 ? 1 : 1000,
            base_quantity: index === 1 ? 1 : 1000,
            unit_price: index === 1 ? 0.0354 : 99.9558,
            tax_inclusive_unit_price: index === 1 ? 0.04 : 112.95,
            price_basis: 'gross',
            tax_rate: 13,
            amount: index === 1 ? 0.04 : 99955.75,
            tax_amount: index === 1 ? 0 : 12994.25,
            total_amount: index === 1 ? 0.04 : 112950,
            contract_id: null as string | null,
            contract_no: ''
          }
        ]
      }))
      let readableContracts = true
      let saved = 0
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1)
        const body: { p_id?: string; p_kind?: string; p_document?: (typeof records)[number] } =
          route.request().postDataJSON() || {}
        if (name === 'fms_purchase_payable_list_secure') {
          const data = records.filter((record) => !body.p_id || record.id === body.p_id)
          return route.fulfill({ json: { data, total: data.length } })
        }
        if (name === 'fms_payable_options_secure') {
          const data: Record<string, unknown[]> = {
            [`${kind}_type`]: [
              { id: 'type', name: kind === 'estimated' ? '标准采购暂估' : '标准采购应付' }
            ],
            supplier: [{ id: 'supplier', name: '示例供应商' }],
            unit: [{ id: 'unit', name: '件' }],
            tax: [{ id: 'tax', name: '0%', code: '0' }],
            contract: readableContracts ? contracts : []
          }
          return route.fulfill({ json: data[body.p_kind || ''] || [] })
        }
        if (name === 'fms_payable_currency_context_secure')
          return route.fulfill({
            json: {
              configured: true,
              account_set_id: 'book',
              account_set_name: '验收账套',
              currency_code: 'CNY',
              base_currency_code: 'CNY',
              exchange_rate: 1,
              currencies: [{ id: 'CNY', name: '人民币' }]
            }
          })
        if (name === 'fms_save_purchase_payable_secure' && body.p_document) {
          const payload = body.p_document
          const record = {
            ...payload,
            version: payload.version + 1,
            lines: payload.lines.map((line) => ({
              ...line,
              contract_no:
                contracts.find((contract) => contract.id === line.contract_id)?.code || ''
            }))
          }
          records = records.map((current) => (current.id === record.id ? record : current))
          saved += 1
          return route.fulfill({ json: record })
        }
        return route.fulfill({ json: [] })
      })
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}&box=${theme === 'dark' ? 'shadow-mode' : 'border-mode'}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 }
      )
      const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
      await expect(rows).toHaveCount(2)
      for (const index of [0, 1]) {
        await rows.nth(index).getByRole('button', { name: '编辑', exact: true }).click()
        const drawer = page.getByRole('dialog')
        await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled({
          timeout: 60000
        })
        const quantity = drawer.getByRole('spinbutton', { name: '数量', exact: true })
        await quantity.scrollIntoViewIfNeeded()
        if (index === 0) {
          await quantity.press('ControlOrMeta+A')
          await quantity.press('Backspace')
          await quantity.press('Tab')
          await expect(quantity).toHaveValue('')
          await drawer.getByRole('button', { name: '保存', exact: true }).click()
          expect(errors).toEqual([])
          await expect(
            drawer.locator('.art-table__cell-content[aria-invalid="true"]').filter({
              has: page.getByRole('spinbutton', { name: '数量', exact: true })
            })
          ).toBeVisible()
          expect(saved).toBe(0)
          await captureBusinessEvidence(drawer, {
            path: info.outputPath(`${kind}-${theme}-quantity-required.png`)
          })
        }
        await quantity.fill(index === 0 ? '2' : '1001')
        await quantity.press('Tab')
        const selector = drawer.getByRole('combobox', { name: '合同', exact: true })
        await selector.scrollIntoViewIfNeeded()
        await selector.press('Enter')
        await page.getByRole('option', { name: contracts[index].name, exact: true }).click()
        await captureBusinessEvidence(drawer, {
          path: info.outputPath(`${kind}-${theme}-contract-${index + 1}.png`)
        })
        await drawer.getByRole('button', { name: '保存', exact: true }).click()
        await expect(drawer).not.toBeVisible()
      }
      readableContracts = false
      await rows.first().getByRole('button', { name: '编辑', exact: true }).click()
      const drawer = page.getByRole('dialog')
      await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled({
        timeout: 60000
      })
      const selector = drawer.getByRole('combobox', { name: '合同', exact: true })
      await selector.scrollIntoViewIfNeeded()
      const control = drawer
        .locator('.el-select')
        .filter({ has: page.getByRole('combobox', { name: '合同', exact: true }) })
      await expect(control).toContainText(contracts[0].code)
      await expect(control).not.toContainText(contracts[0].id)
      await drawer
        .getByRole('textbox', { name: '备注', exact: true })
        .first()
        .fill('已有合同保持不变')
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      await expect(drawer).not.toBeVisible()
      expect(saved).toBe(3)
      expect(records[0].lines[0].contract_id).toBe(contracts[0].id)
      expect(records[1].lines[0].contract_id).toBe(contracts[1].id)
      expect(records.map((record) => record.total_amount)).toEqual([0.08, 113062.95])
      expect(records.map((record) => record.lines[0].price_basis)).toEqual(['gross', 'gross'])
      expect(records[0].lines[0].base_quantity).toBe(2)
      expect(errors).toEqual([])
    })
  }
}
