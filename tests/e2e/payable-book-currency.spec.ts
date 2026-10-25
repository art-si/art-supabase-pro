import { expect, test } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(180000)
const tenant = '11111111-1111-4111-8111-111111111111'

for (const kind of ['estimated', 'financial'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${kind} ${theme} 两张外币应付、原汇率保持、日期取率及配置重试`, async ({
      page
    }, info) => {
      let records = [1, 2].map((index) => ({
        id: `fx-${kind}-${index}`,
        tenant_id: tenant,
        kind,
        document_no: `${kind === 'estimated' ? 'ZGYF' : 'CWYF'}-FX-${index}`,
        document_type_id: 'type',
        document_type_name: kind === 'estimated' ? '标准采购暂估' : '标准采购应付',
        source_type: 'manual',
        source_document_id: null,
        source_document_no: '',
        supplier_id: 'supplier',
        supplier_name: '验收外币供应商',
        payee_supplier_id: 'supplier',
        business_date: '2026-10-22',
        posting_date: '2026-10-22',
        status: 'draft',
        version: 1,
        currency_code: 'USD',
        base_currency_code: 'CNY',
        account_set_id: 'book',
        account_set_name: '验收人民币账套',
        exchange_rate: 7,
        input_tax_inclusive_price: true,
        input_amount: false,
        discount_includes_tax: true,
        amount: index * 100,
        tax_amount: 0,
        total_amount: index * 100,
        base_total_amount: index * 700,
        payment_plans: [],
        lines: [
          {
            id: `fx-line-${index}`,
            line_no: 10,
            material_id: 'material',
            material_code: 'QA-FX',
            material_description: `验收外币物料${index}`,
            inventory_unit_id: 'unit',
            unit_name: '件',
            quantity: 1,
            unit_price: index * 100,
            tax_inclusive_unit_price: index * 100,
            tax_rate: 0,
            amount: index * 100,
            tax_amount: 0,
            total_amount: index * 100
          }
        ]
      }))
      let configured = true
      let currencyRequests = 0
      let savedRate: number | undefined
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1)
        const body: { p_id?: string; p_kind?: string; p_document?: (typeof records)[number] } =
          route.request().postDataJSON()
        if (name === 'fms_purchase_payable_list_secure') {
          const data = body.p_id ? records.filter((row) => row.id === body.p_id) : records
          return route.fulfill({ json: { data, total: data.length } })
        }
        if (name === 'fms_payable_options_secure') {
          const options: Record<string, unknown[]> = {
            [`${kind}_type`]: [
              { id: 'type', name: kind === 'estimated' ? '标准采购暂估' : '标准采购应付' }
            ],
            supplier: [{ id: 'supplier', name: '验收外币供应商' }],
            unit: [{ id: 'unit', name: '件' }],
            tax: [{ id: 'tax', code: '0', name: '0%' }]
          }
          return route.fulfill({ json: options[body.p_kind || ''] || [] })
        }
        if (name === 'fms_payable_currency_context_secure') {
          currencyRequests++
          return route.fulfill({
            json: {
              configured,
              currency_code: 'USD',
              base_currency_code: 'CNY',
              account_set_id: 'book',
              account_set_name: '验收人民币账套',
              exchange_rate: configured ? 9 : null,
              currencies: [
                { id: 'CNY', name: '人民币 CNY' },
                { id: 'USD', name: '美元 USD' }
              ],
              message: configured ? '' : '核算币种未启用，请配置后重试'
            }
          })
        }
        if (name === 'fms_save_purchase_payable_secure') {
          if (!body.p_document) throw new Error('Missing payable save payload')
          savedRate = body.p_document.exchange_rate
          const savedDocument = body.p_document
          records = records.map((row) =>
            row.id === savedDocument.id ? { ...row, ...savedDocument } : row
          )
          return route.fulfill({ json: body.p_document })
        }
        return route.fulfill({ json: [] })
      })
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}&box=${theme === 'dark' ? 'shadow-mode' : 'border-mode'}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 }
      )
      const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
      await expect(rows).toHaveCount(2)
      await rows.first().getByRole('button', { name: '查看', exact: true }).click()
      const drawer = page.getByRole('dialog')
      await expect(drawer.getByText('USD', { exact: true })).toBeVisible()
      await expect(drawer.getByRole('cell', { name: '价税合计(USD)', exact: true })).toBeVisible()
      await expect(drawer.getByText(/\$100\.00/).first()).toBeVisible()
      await captureBusinessEvidence(drawer, {
        path: info.outputPath(`${kind}-${theme}-foreign-readonly.png`)
      })
      await page.keyboard.press('Escape')
      await rows.first().getByRole('button', { name: '编辑', exact: true }).click()
      const rate = drawer.getByRole('spinbutton', { name: /^\*?\s*记账汇率$/ })
      await expect(rate).toHaveValue(/^7(?:\.0+)?$/)
      await expect(drawer.getByRole('textbox', { name: '价税合计(USD)', exact: true })).toHaveValue(
        /^100(?:\.0+)?$/
      )
      await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
      const requestsBeforeEdit = currencyRequests
      await rate.fill('7.25')
      await rate.blur()
      await expect(
        drawer.getByRole('textbox', { name: '价税合计（本位币）', exact: true })
      ).toHaveValue(/^725(?:\.0+)?$/)
      expect(currencyRequests).toBe(requestsBeforeEdit)
      await captureBusinessEvidence(drawer, {
        path: info.outputPath(`${kind}-${theme}-foreign-edit.png`)
      })
      await drawer.getByText('应付明细', { exact: true }).scrollIntoViewIfNeeded()
      const lineTable = drawer.locator('.el-table').first()
      await lineTable.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
        element.scrollLeft = element.scrollWidth
      })
      await expect
        .poll(() =>
          lineTable.locator('.el-table__header-wrapper').evaluate((element) => element.scrollLeft)
        )
        .toBeGreaterThan(0)
      if (kind === 'financial') {
        await expect(
          drawer.getByRole('columnheader', { name: '应付金额(USD)', exact: true })
        ).toBeVisible()
      }
      await captureBusinessEvidence(drawer, {
        path: info.outputPath(`${kind}-${theme}-foreign-edit-lower.png`)
      })
      configured = false
      await drawer.getByRole('button', { name: '取业务日期汇率', exact: true }).click()
      await expect(drawer.getByText('核算币种未启用，请配置后重试', { exact: true })).toBeVisible()
      await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
      configured = true
      await drawer.getByRole('button', { name: '重新加载币种', exact: true }).click()
      await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
      await drawer.getByRole('button', { name: '取业务日期汇率', exact: true }).click()
      await expect(rate).toHaveValue(/^9(?:\.0+)?$/)
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      await expect(drawer).not.toBeVisible()
      expect(savedRate).toBe(9)
      expect(records[1].exchange_rate).toBe(7)
      await rows.first().getByRole('button', { name: '查看', exact: true }).click()
      await expect(drawer.getByText(/¥900\.00/)).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      expect(errors).toEqual([])
    })
  }
}
