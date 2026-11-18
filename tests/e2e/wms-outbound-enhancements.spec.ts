import { expect, test, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
const tenant = '11111111-1111-4111-8111-111111111111'
const org = '33333333-3333-4333-8333-333333333333'
const type = '44444444-4444-4444-8444-444444444444'
const warehouse = '99999999-9999-4999-8999-999999999999'
const customer = '66666666-6666-4666-8666-666666666666'
const material = {
  id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
  tenant_id: tenant,
  code: 'MAT-001',
  name: '测试钢板',
  description: '测试钢板描述',
  inventory_unit_id: '88888888-8888-4888-8888-888888888888',
  base_unit_id: '88888888-8888-4888-8888-888888888888',
  unit_conversions: [],
  serial_management_enabled: false
}

for (const { kind, recovery } of [
  ...['outbound', 'return', 'other', 'request', 'invoice'].map((kind) => ({
    kind,
    recovery: undefined
  })),
  { kind: 'other', recovery: '重新选择' },
  { kind: 'other', recovery: '原地重试' }
]) {
  const title = recovery
    ? `采购转固类别失败后${recovery}保留账套与原始转固请求`
    : `${kind}选单入口与专注模式`
  test(title, async ({ page }, testInfo) => {
    if (recovery) test.setTimeout(120_000)
    await prepareIsolatedSession(page)
    const dark = /dark|mobile/.test(testInfo.project.name)
    const appearance = { theme: dark ? 'dark' : 'light', boxBorderMode: !dark } as const
    if (recovery) await prepareAppearance(page, appearance)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const source = {
      document_id: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenant,
      organization_id: org,
      kind: kind === 'other' ? 'other_outbound' : kind,
      document_no: 'TEST-OUT-001',
      status: 'approved',
      customer_name: '测试客户',
      quantity: 2,
      amount: 200,
      tax_amount: 26,
      total_amount: 226,
      line_no: 10,
      line_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      material_code: 'MAT-001',
      material_description: '测试钢板',
      stock_type: 'normal',
      stock_status: 'available',
      business_date: '2026-10-11'
    }
    const records: Record<string, unknown[]> = {
      mdm_organization: [
        {
          id: org,
          tenant_id: tenant,
          organization_name: '测试组织',
          organization_code: 'TEST-ORG',
          status: '1',
          organization_type: 'company',
          initialization: {
            organization_id: org,
            enabled_on: '2026-10-01',
            initialization_closed_at: '2026-10-02',
            is_default: true
          }
        }
      ],
      wms_inventory_initialization: [
        {
          organization_id: org,
          enabled_on: '2026-10-01',
          initialization_closed_at: '2026-10-02',
          is_default: true
        }
      ],
      mdm_warehouse: [
        {
          id: warehouse,
          tenant_id: tenant,
          organization_id: org,
          warehouse_code: 'WH-001',
          warehouse_name: '测试仓库',
          status: 'enabled',
          business_scopes: ['picking']
        }
      ],
      mdm_document_type: [
        {
          id: type,
          tenant_id: tenant,
          document_type_name: '标准测试单',
          document_type_code: 'TEST',
          menu_ids: ['test-menu'],
          enabled: true,
          is_default: true
        }
      ],
      mdm_business_type: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          tenant_id: tenant,
          business_type_name: '标准测试业务',
          document_type_ids: [type],
          menu_ids: ['test-menu'],
          enabled: true,
          is_default: true
        }
      ],
      mdm_unit_of_measure: [
        { id: material.base_unit_id, tenant_id: tenant, unit_code: 'EA', unit_name: '件' }
      ],
      mdm_customer: [
        { id: customer, tenant_id: tenant, customer_name: '测试客户', customer_code: 'CUS-001' }
      ],
      mdm_material: [material],
      wms_sales_document_list: [source],
      wms_issue_request_list: [],
      wms_sales_invoice: [],
      sys_dictionary: [
        ['wmsInitialStockType', 'normal', '普通'],
        ['wmsInitialStockCondition', 'available', '可用'],
        ['mdmBusinessOwnerType', 'self', '自有'],
        ['mdmMaterialSource', 'purchase', '采购'],
        ['wmsIssueReason', 'consumables_outbound', '办公用品领用']
      ].map(([code, value, label]) => ({
        id: `${code}-${value}`,
        value,
        label,
        status: '1',
        dict_type_table: { code, name: code }
      }))
    }
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1) || ''
      if (name === 'sys_menu') return route.fulfill({ json: { id: 'test-menu' } })
      if (name === 'wms_sales_choices_secure')
        return route.fulfill({
          json: {
            data: [1, 2].map((index) => ({
              id: `test-stock-${index}`,
              material,
              line: {
                stock_batch_id: `test-batch-${index}`,
                warehouse_id: warehouse,
                stock_type: 'normal',
                stock_status: 'available'
              },
              material_code: 'MAT-001',
              material_description: '测试钢板描述',
              material_source: 'purchase',
              available_quantity: 100,
              deliverable_quantity: 100,
              inventory_quantity: 100,
              allocated_quantity: 0,
              serial_nos: [],
              unit_price: 100,
              tax_rate: 13,
              warehouse_name: '测试仓库'
            })),
            total: 2
          }
        })
      if (name === 'wms_issue_request_lines_secure') return route.fulfill({ json: [] })
      if (name === 'wms_sales_document')
        return route.fulfill({
          json: {
            ...source,
            id: source.document_id,
            customer: { customer_name: '测试客户' },
            salesperson: { employee_name: '测试销售员' },
            keeper: { employee_name: '测试仓管员' },
            lines: [
              {
                ...source,
                id: source.line_id,
                material,
                inventory_unit_id: material.inventory_unit_id,
                warehouse_id: warehouse,
                unit_price: 100,
                serial_nos: []
              }
            ]
          }
        })
      const data = records[name] || []
      return route.fulfill({
        headers: {
          'content-range': data.length ? `0-${data.length - 1}/${data.length}` : '*/0',
          'access-control-expose-headers': 'content-range'
        },
        json: data
      })
    })
    if (recovery) await page.clock.setFixedTime(new Date('2026-11-18T10:00:00+08:00'))
    await page.goto(`/tests/e2e/fixtures/wms-bulk-delete.html?kind=${kind}`)
    if (recovery) await assertAppearance(page, appearance)
    const table = page.locator('.art-table-query')
    if (recovery) {
      const accountA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
      const accountB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
      const categoryA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
      const categoryB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
      const acquisitionDate = '2026-11-10'
      let failCategories = false
      let holdCategories = false
      const pendingCategories: Route[] = []
      const categoryRequests: string[] = []
      const assetWrites: unknown[] = []
      await page.route('**/rest/v1/rpc/fms_list_account_set_options_secure', (route) => {
        expect(route.request().postDataJSON()).toEqual({
          p_tenant_id: tenant,
          p_status: 'active',
          p_ids: null,
          p_from: 0,
          p_to: 999
        })
        return route.fulfill({
          json: {
            records: [
              { id: accountA, account_set_name: '账套 A' },
              { id: accountB, account_set_name: '账套 B' }
            ]
          }
        })
      })
      await page.route('**/rest/v1/rpc/fms_list_asset_categories_secure', (route) => {
        const payload = route.request().postDataJSON()
        expect(payload.p_tenant_id).toBeNull()
        expect([accountA, accountB]).toContain(payload.p_account_set_id)
        categoryRequests.push(payload.p_account_set_id)
        if (holdCategories) {
          pendingCategories.push(route)
          return
        }
        if (failCategories && payload.p_account_set_id === accountB)
          return route.fulfill({
            status: 503,
            headers: { 'retry-after': '0', 'access-control-expose-headers': 'Retry-After' },
            json: { code: 'XX000', message: 'Synthetic asset category read unavailable' }
          })
        return route.fulfill({
          json: [
            {
              id: payload.p_account_set_id === accountB ? categoryB : categoryA,
              category_name: payload.p_account_set_id === accountB ? '设备类别 B' : '设备类别 A',
              is_enabled: true
            }
          ]
        })
      })
      await page.route('**/rest/v1/rpc/wms_push_other_asset_secure', (route) => {
        assetWrites.push(route.request().postDataJSON())
        return route.fulfill({ json: ['cccccccc-cccc-4ccc-8ccc-ccccccccccc2'] })
      })
      const sourceRow = table.locator('.el-table__body tr').filter({ hasText: source.document_no })
      await sourceRow.locator('label.el-checkbox').first().click()
      await page.getByRole('button', { name: '下推', exact: true }).click()
      await page.getByRole('menuitem', { name: '采购转固', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: '采购转固', exact: true })
      const generate = dialog.getByRole('button', { name: '生成资产草稿', exact: true })
      const account = dialog.getByRole('combobox', { name: /账套/ })
      const accountField = dialog.locator('[data-art-form-item-key="accountSetId"]')
      const category = dialog.getByRole('combobox', { name: /资产类别/ })
      await expect(account).toBeEnabled()
      await expect(accountField).toContainText('账套 A')
      expect(categoryRequests).toEqual([accountA])
      const date = dialog.getByRole('combobox', { name: /取得日期/ })
      await date.fill(acquisitionDate)
      await date.press('Tab')
      failCategories = true
      await account.click()
      await page.getByRole('option', { name: '账套 B', exact: true }).click()
      await expect(accountField).toContainText('账套 B')
      await expect.poll(() => categoryRequests).toEqual([accountA, accountB])
      const retry = dialog.getByRole('button', { name: /重新加载/ })
      await expect(retry).toBeVisible()
      await expect(generate).toBeDisabled()
      const beforeRecovery = categoryRequests.length
      failCategories = false
      if (recovery === '原地重试') {
        await retry.press('Enter')
      } else {
        await account.click()
        await page.getByRole('option', { name: '账套 A', exact: true }).click()
        await expect.poll(() => categoryRequests.length).toBe(beforeRecovery + 1)
        await account.click()
        await page.getByRole('option', { name: '账套 B', exact: true }).click()
      }
      await expect(account).toBeEnabled()
      await expect(accountField).toContainText('账套 B')
      await expect(date).toHaveValue(acquisitionDate)
      await category.click()
      await page.getByRole('option', { name: '设备类别 B', exact: true }).click()
      expect(categoryRequests.slice(beforeRecovery)).toEqual(
        recovery === '原地重试' ? [accountB] : [accountA, accountB]
      )
      await expect(generate).toBeEnabled()
      await dialog.screenshot({
        path: testInfo.outputPath(`asset-category-${recovery}-ready.png`),
        animations: 'disabled'
      })
      await generate.press('Enter')
      await expect.poll(() => assetWrites.length).toBe(1)
      expect(assetWrites).toEqual([
        {
          p_account_set_id: accountB,
          p_category_id: categoryB,
          p_date: acquisitionDate,
          p_selections: [{ document_id: source.document_id, line_ids: null }]
        }
      ])
      await expect(dialog).toBeHidden()
      if (recovery === '原地重试') {
        await expect(page.locator('.el-message--error,.el-message--warning')).toHaveCount(0)
        holdCategories = true
        const selection = sourceRow.getByRole('checkbox').first()
        if (!(await selection.isChecked()))
          await sourceRow.locator('label.el-checkbox').first().click()
        await page.getByRole('button', { name: '下推', exact: true }).click()
        await page.getByRole('menuitem', { name: '采购转固', exact: true }).click()
        await expect.poll(() => pendingCategories.length).toBe(1)
        const viewport = dialog.locator('.art-dialog__viewport')
        const content = dialog.locator('.art-dialog__content')
        const pendingDate = dialog.locator('[data-art-form-item-key="date"] input')
        await expect(viewport).toHaveAttribute('aria-busy', 'true')
        await expect(content).toHaveJSProperty('inert', true)
        await expect(generate).toBeDisabled()
        await expect(pendingDate).toBeDisabled()
        await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
        await expect(dialog).toBeHidden()
        await page.getByRole('button', { name: '下推', exact: true }).click()
        await page.getByRole('menuitem', { name: '采购转固', exact: true }).click()
        await expect.poll(() => pendingCategories.length).toBe(2)
        const oldResponse = page.waitForResponse(
          (response) => response.request() === pendingCategories[0].request()
        )
        await pendingCategories[0].fulfill({
          status: 503,
          json: { code: 'XX000', message: 'Synthetic obsolete category failure' }
        })
        await (await oldResponse).finished()
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        )
        await expect(viewport).toHaveAttribute('aria-busy', 'true')
        await expect(content).toHaveJSProperty('inert', true)
        await expect(generate).toBeDisabled()
        await expect(pendingDate).toBeDisabled()
        await expect(page.locator('.el-message--error,.el-message--warning')).toHaveCount(0)
        await pendingCategories[1].fulfill({
          json: [{ id: categoryA, category_name: '设备类别 A', is_enabled: true }]
        })
        await expect(viewport).toHaveAttribute('aria-busy', 'false')
        await expect(content).toHaveJSProperty('inert', false)
        await expect(account).toBeEnabled()
        await expect(accountField).toContainText('账套 A')
        const today = await page.evaluate(() => new Date().toLocaleDateString('sv-SE'))
        await expect(date).toHaveValue(today)
        await category.click()
        await expect(page.getByRole('option', { name: '设备类别 A', exact: true })).toBeVisible()
        await expect(page.getByRole('option', { name: '设备类别 B', exact: true })).toHaveCount(0)
        await page.getByRole('option', { name: '设备类别 A', exact: true }).click()
        await expect(dialog.locator('[data-art-form-item-key="categoryId"]')).toContainText(
          '设备类别 A'
        )
        await dialog.screenshot({ path: testInfo.outputPath('asset-category-new-session.png') })
        await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
        expect(assetWrites).toHaveLength(1)
      }
      expect(errors).toEqual([])
      return
    }
    const operation = table.getByRole('columnheader', { name: '操作', exact: true })
    await expect(operation).toBeVisible()
    await expect
      .poll(() =>
        table.evaluate((el) => {
          const groups = Array.from(el.querySelectorAll<HTMLElement>('.business-table-row-actions'))
          const needed = Math.max(
            64,
            ...groups.map((group) => {
              const controls = Array.from(
                group.querySelectorAll<HTMLElement>('button,a,[role="button"]')
              ).filter(
                (control) =>
                  control.offsetWidth > 0 && !control.querySelector('button,a,[role="button"]')
              )
              const style = getComputedStyle(group.closest('.cell')!)
              return (
                controls.reduce(
                  (width, control) => width + control.getBoundingClientRect().width,
                  0
                ) +
                Math.max(controls.length - 1, 0) *
                  (Number.parseFloat(getComputedStyle(group).columnGap) || 0) +
                (Number.parseFloat(style.paddingLeft) || 0) +
                (Number.parseFloat(style.paddingRight) || 0) +
                6
              )
            })
          )
          const header = Array.from(el.querySelectorAll<HTMLElement>('th')).find(
            (cell) => cell.textContent?.trim() === '操作'
          )
          return (header?.getBoundingClientRect().width || 0) - Math.ceil(needed)
        })
      )
      .toBeLessThanOrEqual(1)
    await expect(table).toBeVisible()
    const focus = page.getByRole('switch', { name: '进入专注模式', exact: true })
    await focus.locator('..').click()
    await expect(page.locator('.business-workspace-header:visible')).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath(`${kind}-focus.png`),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')
    await expect(page.locator('.business-workspace-header:visible')).toHaveCount(1)
    await focus.locator('..').click()
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    if (kind === 'invoice') {
      await expect(page.getByText('暂无销售发票草稿')).toBeVisible()
    } else if (kind === 'request') {
      await page.getByRole('button', { name: '新增出库申请单', exact: true }).click()
      const drawer = page.locator('.el-drawer:visible')
      await expect(drawer.getByRole('textbox', { name: '申请单号', exact: true })).toBeVisible()
      await expect(drawer.getByRole('textbox', { name: '生产工单', exact: true })).toBeVisible()
      await expect(drawer.getByRole('combobox', { name: '领用部门', exact: true })).toBeVisible()
      await drawer.getByRole('button', { name: '添加物料', exact: true }).click()
      const picker = page.getByRole('dialog', { name: '选择出库库存', exact: true })
      await expect(
        picker.locator('.el-table__body').getByText('MAT-001', { exact: true })
      ).toHaveCount(2)
      await expect(picker.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
      await expect(picker.locator('.art-table')).toHaveAttribute('aria-busy', 'false')
      await picker.locator('.el-table__body .el-checkbox').first().click()
      await picker.locator('.el-table__body .el-checkbox').nth(1).click()
      await expect(
        picker.getByRole('complementary').getByText('已选 2', { exact: true })
      ).toBeVisible()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      await expect(drawer.getByRole('columnheader', { name: /^申请数量/ })).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath('request-rich-lines.png'),
        animations: 'disabled'
      })
    } else {
      await table.locator('.el-table__body .el-checkbox').first().click()
      await expect(page.getByRole('button', { name: '批量打印', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '下推', exact: true }).click()
      await expect(
        page.getByText(kind === 'other' ? '其他出库退回' : '普通发票', { exact: true })
      ).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath(`${kind}-selected-actions.png`),
        animations: 'disabled'
      })
      await page.keyboard.press('Escape')
      await page.evaluate(() => {
        window.print = () => {}
      })
      await page.getByRole('button', { name: '批量打印', exact: true }).click()
      await expect(page.locator('.wms-sales-print-sheet')).toHaveCount(1)
      await page.emulateMedia({ media: 'print' })
      await page.evaluate(() => document.body.classList.add('is-wms-sales-printing'))
      await page.screenshot({ path: testInfo.outputPath(`${kind}-print.png`) })
      await page.emulateMedia({ media: 'screen' })
      await page.evaluate(() => document.body.classList.remove('is-wms-sales-printing'))
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: testInfo.outputPath(`${kind}-narrow.png`) })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
