import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import { mockInventoryOrganizations } from './support/inventory-organization'

const organizationId = '33333333-3333-4333-8333-333333333333'
const documentTypeId = '44444444-4444-4444-8444-444444444444'
const businessTypeId = '55555555-5555-4555-8555-555555555555'
const partyId = '66666666-6666-4666-8666-666666666666'

for (const [path, name, title, returnTitle, table, documentTable, kind] of [
  [
    'outbound-business/other-outbound',
    'WmsOtherOutbound',
    '其他出库单',
    '其他出库退回单',
    'wms_sales_document_list',
    'wms_sales_document',
    'other_outbound'
  ],
  [
    'inbound-business/other-inbound',
    'WmsOtherInbound',
    '其他入库单',
    '其他入库退回单',
    'wms_purchase_document_list',
    'wms_purchase_document',
    'other_inbound'
  ],
  ...[
    [
      'initialization/initial-sales-return',
      'WmsInitialSalesReturn',
      '期初销售退货单',
      'wms_sales_document_list',
      'wms_sales_document',
      'initial_return'
    ],
    [
      'outbound-business/sales-return',
      'WmsSalesReturnDocument',
      '销售退货单',
      'wms_sales_document_list',
      'wms_sales_document',
      'return'
    ],
    [
      'initialization/initial-purchase-return',
      'WmsInitialPurchaseReturn',
      '期初采购退料单',
      'wms_purchase_document_list',
      'wms_purchase_document',
      'initial_return'
    ],
    [
      'inbound-business/purchase-return',
      'WmsPurchaseReturn',
      '采购退货单',
      'wms_purchase_document_list',
      'wms_purchase_document',
      'purchase_return'
    ],
    [
      'inbound-business/entrusted-processing-return',
      'WmsEntrustedProcessingReturn',
      '受托加工材料退料单',
      'wms_purchase_document_list',
      'wms_purchase_document',
      'entrusted_processing_return'
    ]
  ].map(([path, name, title, table, documentTable, kind]) => [
    path,
    name,
    title,
    title,
    table,
    documentTable,
    kind
  ])
]) {
  test(`${title}退回记录打开对应详情`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await installFixtures(page)
    const openingReturn = kind === 'initial_return'
    const expectedQuantity = openingReturn ? /^1\.0000$/ : /^[￥¥]?-1\.0000$/
    const partyType =
      table === 'wms_sales_document_list' || kind === 'entrusted_processing_return'
        ? 'customer'
        : 'supplier'
    const partyLabel = partyType === 'customer' ? '客户' : '供应商'
    const documentKind = kind.startsWith('other_') ? 'other_return' : kind
    await page.route(`**/rest/v1/mdm_${partyType}?*`, (route) =>
      route.fulfill({
        json: [
          {
            id: partyId,
            tenant_id: tenantId,
            [`${partyType}_code`]: 'RETURN-PARTY',
            [`${partyType}_name`]: `退回测试${partyLabel}`
          }
        ]
      })
    )
    await mockInventoryOrganizations(
      page,
      () => [
        {
          id: organizationId,
          tenant_id: tenantId,
          organization_code: 'RETURN-ORG',
          organization_name: '退回测试库存组织',
          organization_type: 'company',
          status: '1'
        }
      ],
      () => [
        {
          organization_id: organizationId,
          enabled_on: '2026-10-01',
          is_default: true,
          initialization_closed_at: kind === 'initial_return' ? null : '2026-10-02'
        }
      ]
    )
    await page.route('**/rest/v1/mdm_document_type?*', (route) =>
      route.fulfill({
        json: [
          {
            id: documentTypeId,
            tenant_id: tenantId,
            document_type_code: 'WMS_OTHER_RETURN',
            document_type_name: '测试退回单据类型',
            menu_ids: ['other-menu'],
            enabled: true,
            is_default: true
          }
        ]
      })
    )
    await page.route('**/rest/v1/mdm_business_type?*', (route) =>
      route.fulfill({
        json: [
          {
            id: businessTypeId,
            tenant_id: tenantId,
            business_type_code: 'RETURN-BUSINESS',
            business_type_name: '测试退回业务类型',
            document_type_ids: [documentTypeId],
            menu_ids: ['other-menu'],
            enabled: true,
            is_default: true
          }
        ]
      })
    )
    await page.route('**/rest/v1/sys_menu?*', (route) =>
      route.fulfill({ json: { id: 'other-menu' } })
    )
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '平台', baseUrl: '/' },
          { code: 'wms', name: '仓储', baseUrl: '/wms/' }
        ]
      })
    )
    await mockApplicationMenus(page, {
      wms: [
        {
          id: 'other-menu',
          parentId: null,
          name,
          path: `/wms/${path}`,
          component: `/wms/${path}`,
          type: 'menu',
          sort: 1,
          meta: meta(title)
        },
        {
          id: 'other-view',
          parentId: 'other-menu',
          name: `${name}:View`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta('查看')
        },
        ...['Edit', 'Copy'].map((action) => ({
          id: `other-${action}`,
          parentId: 'other-menu',
          name: `${name}:${action}`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta(action)
        }))
      ]
    })
    await page.route(`**/rest/v1/${table}?*`, (route) =>
      route.fulfill({
        json: [
          {
            document_id: 'return-document',
            line_id: 'return-line',
            tenant_id: tenantId,
            document_no: 'RETURN-ENTRY-001',
            kind: documentKind,
            status: 'draft',
            business_date: '2026-10-07',
            line_no: 10,
            quantity: -1,
            material_description: '退回测试物料'
          }
        ],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    )
    await page.route(`**/rest/v1/${documentTable}?*`, (route) => {
      const id = new URL(route.request().url()).searchParams.get('id')
      if (!id) {
        expect(new URL(route.request().url()).searchParams.get('kind')).toBe(
          kind.startsWith('other_') ? `in.(${kind},other_return)` : `eq.${kind}`
        )
        return route.fulfill({
          json: [{ id: 'return-document', kind: documentKind }],
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
        })
      }
      expect(id).toBe('eq.return-document')
      return route.fulfill({
        json: {
          id: 'return-document',
          tenant_id: tenantId,
          document_no: 'RETURN-ENTRY-001',
          kind: documentKind,
          status: 'draft',
          organization_id: organizationId,
          document_type_id: documentTypeId,
          business_type_id: businessTypeId,
          [`${partyType}_id`]: partyId,
          [partyType]: {
            [`${partyType}_name`]: `退回测试${partyLabel}`,
            [`${partyType}_code`]: 'RETURN-PARTY'
          },
          business_date: '2026-10-07',
          accounting_date: '2026-10-07',
          currency_code: 'CNY',
          exchange_rate: 1,
          remark: '退回记录独立备注',
          lines: [
            {
              id: 'return-line',
              line_no: 10,
              material_id: 'return-material',
              material: {
                id: 'return-material',
                tenant_id: tenantId,
                code: 'RETURN-MATERIAL',
                name: '退回测试物料',
                description: '退回明细身份',
                unit_conversions: [],
                serial_management_enabled: false
              },
              quantity: -1,
              base_quantity: -1,
              inventory_unit_id: null,
              base_unit_id: null,
              unit_price: 10,
              tax_inclusive_unit_price: 11.3,
              tax_rate: 13,
              discount_method: 'none',
              unit_discount_rate: 0,
              discount_amount: 0,
              amount: -10,
              tax_amount: -1.3,
              total_amount: -11.3,
              owner_type: 'self',
              owner_id: null,
              stock_type: 'normal',
              stock_status: 'available',
              serial_nos: [],
              source_batch_id: null,
              received_quantity: 0,
              unreceived_quantity: 0,
              returned_quantity: 0,
              unreturned_quantity: 0,
              gift: false,
              remark: '退回行独立备注'
            }
          ]
        }
      })
    })
    await page.goto(`#/wms/${path}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
      timeout: 120_000
    })
    const row = page.locator('.el-table__body tr').filter({ hasText: 'RETURN-ENTRY-001' })
    await row.getByRole('button', { name: '查看', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: `${returnTitle}详情`, exact: true })
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText('退回记录独立备注')
    await expect(drawer.locator('.el-table__body tr')).toHaveCount(1)
    await expect(drawer.locator('.el-table__body tr')).toContainText('RETURN-MATERIAL')
    await expect(drawer.locator('strong').filter({ hasText: expectedQuantity })).toBeVisible()
    await drawer.locator('strong').filter({ hasText: expectedQuantity }).scrollIntoViewIfNeeded()
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
    await page.screenshot({
      path: testInfo.outputPath('other-return-detail-entry.png'),
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await expect(drawer).toBeHidden()
    for (const [label, saveLabel] of [
      ['编辑', '保存'],
      ['复制', '保存副本']
    ]) {
      await row.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: `${label}单据`, exact: true }).click()
      const form = page.getByRole('dialog', { name: `${label}${returnTitle}`, exact: true })
      await expect(form).toBeVisible()
      await expect(form.getByRole('button', { name: saveLabel, exact: true })).toBeEnabled()
      await expect(form.getByText(/基础资料加载失败/)).toHaveCount(0)
      const initializationSwitch = form
        .locator('.el-form-item')
        .filter({ hasText: '初始化单据' })
        .getByRole('switch')
      if (kind === 'initial_return') await expect(initializationSwitch).toBeChecked()
      else if (kind === 'purchase_return' || kind === 'entrusted_processing_return')
        await expect(initializationSwitch).toHaveCount(0)
      else await expect(initializationSwitch).not.toBeChecked()
      await expect(form.locator('.el-table__body tr')).toHaveCount(1)
      await expect(form.locator('.el-table__body tr')).toContainText('RETURN-MATERIAL')
      const quantityColumn = await form
        .locator('.el-table__header th')
        .filter({ hasText: /^\*?\s*数量(?:\s*（必填）)?\s*$/ })
        .evaluate((cell) => Array.from(cell.parentElement!.children).indexOf(cell))
      await expect(
        form.locator('.el-table__body tr').locator('td').nth(quantityColumn).locator('input')
      ).toHaveValue('1.0000')
      await form
        .locator('.el-table__body tr')
        .locator('td')
        .nth(quantityColumn)
        .locator('input')
        .scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath(`other-return-${label}-quantity.png`),
        animations: 'disabled'
      })
      const quantityInput = form
        .locator('.el-table__body tr')
        .locator('td')
        .nth(quantityColumn)
        .locator('input')
      await quantityInput.fill('2')
      await quantityInput.press('Tab')
      await expect(quantityInput).toHaveValue('2.0000')
      await expect(
        form.getByText(
          openingReturn
            ? '共 1 行 · 数量 2.0000 · 价税合计 22.60 元'
            : '共 1 行 · 数量 -2.0000 · 价税合计 -22.60 元',
          { exact: true }
        )
      ).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath(`other-return-${label}-quantity-changed.png`),
        animations: 'disabled'
      })
      await expect(
        form.getByRole('textbox', {
          name: `${kind === 'other_inbound' || kind === 'other_outbound' ? '' : '* '}${kind === 'entrusted_processing_return' ? '客户全称' : partyLabel}`,
          exact: true
        })
      ).toHaveValue(new RegExp(`退回测试${partyLabel}`))
      if (partyType === 'supplier') {
        await expect(form.getByRole('textbox', { name: '供应商编码', exact: true })).toHaveValue(
          'RETURN-PARTY'
        )
      }
      for (const [field, value] of [
        ['库存组织', '退回测试库存组织'],
        ['单据类型', '测试退回单据类型'],
        ['业务类型', '测试退回业务类型']
      ]) {
        await expect(form.locator('.el-form-item').filter({ hasText: field })).toContainText(value)
      }
      await expect(form.locator('.el-form-item').filter({ hasText: '单据状态' })).toContainText(
        '暂存'
      )
      const number = form.locator('.el-form-item').filter({ hasText: '单据编号' }).locator('input')
      await expect(number).toHaveValue(label === '复制' ? '' : 'RETURN-ENTRY-001')
      const remark = form.locator('textarea').first()
      await expect(remark).toHaveValue('退回记录独立备注')
      await remark.fill(`${label}未保存备注`)
      await page.screenshot({
        path: testInfo.outputPath(`other-return-${label}-entry.png`),
        animations: 'disabled'
      })
      await form.getByRole('button', { name: '取消', exact: true }).click()
      await expect(form).toBeHidden()
    }
    await row.getByRole('button', { name: '查看', exact: true }).click()
    await expect(drawer).toContainText('退回记录独立备注')
    await expect(drawer).not.toContainText('未保存备注')
    await expect(drawer.locator('strong').filter({ hasText: expectedQuantity })).toBeVisible()
    await drawer.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await expect(drawer).toBeHidden()
  })
}
