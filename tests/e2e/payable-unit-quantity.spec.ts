import { expect, test } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(240000)

for (const kind of ['estimated', 'financial'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${kind} ${theme} 两张应付单位换算、基本数量校正及物料多选带入`, async ({
      page
    }, info) => {
      const units = [
        { id: 'box', name: '箱', code: 'BOX' },
        { id: 'piece', name: '件', code: 'PCS' },
        { id: 'unconfigured', name: '未配置换算袋', code: 'BAG' }
      ]
      const conversions = [{ source_unit_id: 'box', source_factor: 1, base_factor: 10 }]
      let historicalUnitOnly = false
      let records = [1, 2].map((index) => ({
        id: `unit-payable-${index}`,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        kind,
        document_no: `UNIT-${kind}-${index}`,
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
        input_tax_inclusive_price: false,
        amount: 1000,
        tax_amount: 0,
        total_amount: 1000,
        payment_plans: [],
        lines: [
          {
            id: `unit-line-${index}`,
            line_no: 10,
            material_id: 'material',
            material_code: 'UNIT-MAT',
            material_description: '单位换算验收物料',
            inventory_unit_id: 'box',
            unit_name: '箱',
            base_unit_id: 'piece',
            base_unit_name: '件',
            quantity: 10,
            base_quantity: 100,
            base_quantity_edited: false,
            unit_price: 100,
            tax_inclusive_unit_price: 100,
            price_basis: 'net',
            tax_rate: 0,
            material_units: { base_unit_id: 'piece', unit_conversions: conversions },
            amount: 1000,
            tax_amount: 0,
            total_amount: 1000
          }
        ]
      }))
      const corrected: boolean[] = []
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
            [`${kind}_type`]: [{ id: 'type', name: records[0].document_type_name }],
            supplier: [{ id: 'supplier', name: '示例供应商' }],
            unit: historicalUnitOnly ? units.filter((unit) => unit.id !== 'box') : units,
            tax: [{ id: 'tax', name: '0%', code: '0' }],
            material: [1, 2].map((index) => ({
              id: `new-material-${index}`,
              name: `新增换算物料${index}`,
              code: `UNIT-NEW-${index}`,
              inventory_unit_id: 'box',
              base_unit_id: 'piece',
              unit_name: '箱',
              unit_conversions: [
                {
                  source_unit_id: 'box',
                  source_factor: index === 1 ? 3 : 0.2,
                  base_factor: index === 1 ? 1 : 0.3
                }
              ]
            }))
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
          corrected.push(Boolean(payload.lines[0].base_quantity_edited))
          const record = {
            ...payload,
            version: payload.version + 1,
            amount: payload.lines.reduce((sum, line) => sum + line.amount, 0),
            tax_amount: payload.lines.reduce((sum, line) => sum + line.tax_amount, 0),
            total_amount: payload.lines.reduce((sum, line) => sum + line.total_amount, 0),
            lines: payload.lines.map((line) => ({ ...line, base_quantity_edited: false }))
          }
          records = records.map((current) => (current.id === record.id ? record : current))
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
        const basic = drawer.getByRole('spinbutton', { name: '基本数量', exact: true })
        if (index === 0) {
          const unit = drawer.getByRole('combobox', { name: '库存单位', exact: true })
          await unit.scrollIntoViewIfNeeded()
          await unit.press('Enter')
          await page.getByRole('option', { name: '未配置换算袋', exact: true }).click()
          await expect(basic).toHaveValue('')
          await drawer.getByRole('button', { name: '保存', exact: true }).click()
          await expect(
            drawer.locator('.art-table__cell-content[aria-invalid="true"]').filter({
              has: page.getByRole('spinbutton', { name: '基本数量', exact: true })
            })
          ).toBeVisible()
          expect(corrected).toHaveLength(0)
          await captureBusinessEvidence(drawer, {
            path: info.outputPath(`${kind}-${theme}-missing-conversion.png`)
          })
          await unit.scrollIntoViewIfNeeded()
          await unit.press('Enter')
          await page.getByRole('option', { name: '件', exact: true }).click()
          await quantity.fill('50')
          await quantity.press('Tab')
          await expect(basic).toHaveValue('50.000000')
          const price = drawer.getByRole('spinbutton', { name: '单价', exact: true })
          await price.scrollIntoViewIfNeeded()
          await price.fill('10')
          await price.press('Tab')
        } else {
          await quantity.scrollIntoViewIfNeeded()
          await quantity.fill('5')
          await quantity.press('Tab')
          await expect(basic).toHaveValue('50.000000')
          await basic.fill('100')
          await basic.press('Tab')
          await quantity.fill('2.5')
          await quantity.press('Tab')
          await expect(basic).toHaveValue('50.000000')
          await quantity.fill('5')
          await quantity.press('Tab')
          await expect(basic).toHaveValue('100.000000')
          await drawer.getByRole('button', { name: '选择物料', exact: true }).click()
          const picker = page.getByRole('dialog', { name: '数据来源物料编码', exact: true })
          const materialRows = picker.locator('.el-table__body-wrapper tbody tr')
          await expect(materialRows).toHaveCount(2)
          await materialRows.nth(0).locator('.el-checkbox').click()
          await materialRows.nth(1).locator('.el-checkbox').click()
          await expect(materialRows.nth(0).getByRole('checkbox')).toBeChecked()
          await expect(materialRows.nth(1).getByRole('checkbox')).toBeChecked()
          await captureBusinessEvidence(picker, {
            path: info.outputPath(`${kind}-${theme}-material-picker.png`)
          })
          await picker.getByRole('button', { name: '确定', exact: true }).click()
          await expect(picker).not.toBeVisible()
          await drawer.getByRole('button', { name: '选择物料', exact: true }).click()
          await expect(materialRows.nth(0).getByRole('checkbox')).not.toBeChecked()
          await expect(materialRows.nth(1).getByRole('checkbox')).not.toBeChecked()
          await picker.getByRole('button', { name: '取消', exact: true }).click()
          const lineRows = drawer.locator('.art-table').first().locator('tbody tr')
          await expect(lineRows).toHaveCount(3)
          await expect(
            drawer.getByRole('spinbutton', { name: '基本数量', exact: true }).nth(1)
          ).toHaveValue('0.333333')
          await expect(
            drawer.getByRole('spinbutton', { name: '基本数量', exact: true }).nth(2)
          ).toHaveValue('1.500000')
          const firstNewQuantity = drawer
            .getByRole('spinbutton', { name: '数量', exact: true })
            .nth(1)
          await firstNewQuantity.fill('3')
          await firstNewQuantity.press('Tab')
          await expect(
            drawer.getByRole('spinbutton', { name: '基本数量', exact: true }).nth(1)
          ).toHaveValue('1.000000')
          const secondNewQuantity = drawer
            .getByRole('spinbutton', { name: '数量', exact: true })
            .nth(2)
          await secondNewQuantity.fill('0.000001')
          await secondNewQuantity.press('Tab')
          await expect(
            drawer.getByRole('spinbutton', { name: '基本数量', exact: true }).nth(2)
          ).toHaveValue('0.000002')
          await captureBusinessEvidence(drawer, {
            path: info.outputPath(`${kind}-${theme}-multiple-material-units.png`)
          })
          await lineRows.nth(2).getByRole('button', { name: '移除', exact: true }).click()
          await lineRows.nth(1).getByRole('button', { name: '移除', exact: true }).click()
        }
        await basic.scrollIntoViewIfNeeded()
        await captureBusinessEvidence(drawer, {
          path: info.outputPath(`${kind}-${theme}-unit-record-${index + 1}.png`)
        })
        await drawer.getByRole('button', { name: '保存', exact: true }).click()
        await expect(drawer).not.toBeVisible()
      }
      expect(records.map((record) => record.lines[0].base_quantity)).toEqual([50, 100])
      expect(records.map((record) => record.total_amount)).toEqual([500, 500])
      expect(corrected).toEqual([false, true])
      historicalUnitOnly = true
      await rows.nth(1).getByRole('button', { name: '编辑', exact: true }).click()
      const historyDrawer = page.getByRole('dialog')
      await expect(historyDrawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled({
        timeout: 60000
      })
      const historicalSelector = historyDrawer.getByRole('combobox', {
        name: '库存单位',
        exact: true
      })
      await historicalSelector.scrollIntoViewIfNeeded()
      await historicalSelector.focus()
      const historicalControl = historyDrawer.locator('.el-select').filter({
        has: page.getByRole('combobox', { name: '库存单位', exact: true })
      })
      await expect(historicalControl).toContainText('箱')
      await expect(historicalControl).not.toContainText('box')
      await captureBusinessEvidence(historyDrawer, {
        path: info.outputPath(`${kind}-${theme}-historical-unit.png`)
      })
      await historyDrawer.getByRole('button', { name: '取消', exact: true }).click()
      expect(errors).toEqual([])
    })
  }
}
