import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('期初采购入库空明细取表头默认值并保留逐行修改，仓位可留空', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  const tenant = '11111111-1111-4111-8111-111111111111'
  const org = '33333333-3333-4333-8333-333333333333'
  const type = '44444444-4444-4444-8444-444444444444'
  const business = '55555555-5555-4555-8555-555555555555'
  const writes: Array<Record<string, unknown>> = []
  let fail = true
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.split('/').pop()
    if (path === 'wms_save_purchase_document_secure') {
      writes.push(route.request().postDataJSON().p_payload)
      if (fail) {
        fail = false
        return route.fulfill({
          status: 400,
          json: { code: '23514', message: '测试保存失败，请重试' }
        })
      }
      return route.fulfill({ json: 'saved-document' })
    }
    const data: Record<string, unknown> = {
      sys_menu: { id: 'menu-test' },
      mdm_organization: [
        {
          id: org,
          tenant_id: tenant,
          organization_code: 'ORG',
          organization_name: '测试库存组织',
          status: '1',
          initialization: { enabled_on: '2026-10-07', initialization_closed_at: null }
        }
      ],
      mdm_warehouse: ['warehouse-test', 'warehouse-override'].map((id, index) => ({
        id,
        tenant_id: tenant,
        organization_id: org,
        warehouse_code: 'WH' + index,
        warehouse_name: index ? '行指定仓库' : '表头默认仓库',
        status: 'enabled'
      })),
      mdm_document_type: [
        {
          id: type,
          tenant_id: tenant,
          document_type_code: 'WMS_INITIAL_PURCHASE_INBOUND',
          document_type_name: '期初采购入库',
          menu_ids: ['menu-test'],
          enabled: true
        }
      ],
      mdm_business_type: [
        {
          id: business,
          tenant_id: tenant,
          business_type_code: 'INITIAL',
          business_type_name: '期初采购',
          document_type_ids: [type],
          menu_ids: ['menu-test'],
          enabled: true
        }
      ],
      mdm_supplier: [
        {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          tenant_id: tenant,
          supplier_code: 'SUP',
          supplier_name: '测试供应商'
        }
      ],
      mdm_unit_of_measure: [
        {
          id: '88888888-8888-4888-8888-888888888888',
          tenant_id: tenant,
          unit_code: 'EA',
          unit_name: '件'
        }
      ],
      hr_list_employee_selector_secure: { records: [], total: 0 }
    }
    const body = data[path || ''] ?? []
    return route.fulfill({
      json: body,
      headers: Array.isArray(body)
        ? {
            'content-range': body.length ? `0-${body.length - 1}/${body.length}` : '*/0',
            'access-control-expose-headers': 'content-range'
          }
        : {}
    })
  })
  await page.goto(
    '/tests/e2e/fixtures/wms-document-serials.html?twoLines=true&validSave=true&initialDefaults=true'
  )
  await page.getByRole('button', { name: '打开采购单据', exact: true }).click()
  const drawer = page.locator('.el-drawer:visible')
  await expect(drawer.getByRole('columnheader', { name: '采购员', exact: true })).toBeAttached()
  await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(() => writes.length).toBe(2)
  await expect(drawer).toBeHidden()
  for (const payload of writes) {
    expect(payload.lines).toMatchObject([
      {
        warehouse_id: 'warehouse-test',
        purchaser_id: 'purchaser-header',
        keeper_id: 'keeper-header',
        bin_id: null
      },
      {
        warehouse_id: 'warehouse-override',
        purchaser_id: 'purchaser-override',
        keeper_id: 'keeper-override',
        bin_id: null
      }
    ])
  }
  await page.getByRole('button', { name: '查看采购单据', exact: true }).click()
  const table = drawer.locator('.el-table__body')
  await table.getByText('行采购员', { exact: true }).scrollIntoViewIfNeeded()
  await expect(table.getByText('行采购员', { exact: true })).toBeVisible()
  await expect(table.getByText('行仓管员', { exact: true })).toBeVisible()
  await expect(table).not.toContainText('purchaser-override')
  await expect(table).not.toContainText('keeper-override')
  await page.screenshot({
    path: testInfo.outputPath('initial-line-employees.png'),
    animations: 'disabled'
  })
})
