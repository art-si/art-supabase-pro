import { expect, test } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })

for (const kind of ['direct', 'step'] as const) {
  test(`${kind === 'step' ? '分步' : '直接'}调拨勾选后显示批量下推并可选择明细`, async ({
    page
  }, testInfo) => {
    test.setTimeout(120_000)
    await installFixtures(page)
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/sys_user?*', (route) =>
      route.fulfill({
        json: {
          id: 'transfer-user',
          auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
          user_name: '普通仓储用户',
          user_type: '2',
          user_roles: ['R_USER'],
          status: '1',
          tenant_id: tenantId,
          tenant: { id: tenantId, tenant_code: 'DEMO', tenant_name: '示例工厂' }
        }
      })
    )
    await page.route('**/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '平台', baseUrl: '/' },
          { code: 'wms', name: '仓储', baseUrl: '/wms/' }
        ]
      })
    )
    const menuName = kind === 'step' ? 'WmsStepTransfer' : 'WmsDirectTransfer'
    const menuPath = `/wms/transfer-business/${kind}-transfer`
    await mockApplicationMenus(page, {
      wms: [
        {
          id: 'transfer-menu',
          parentId: null,
          name: menuName,
          path: menuPath,
          component: menuPath,
          type: 'menu',
          sort: 1,
          meta: meta(kind === 'step' ? '分步调拨单' : '直接调拨单')
        },
        ...['View', 'Return', 'Receive', 'Approve'].map((action) => ({
          id: `transfer-${action}`,
          parentId: 'transfer-menu',
          name: `${menuName}:${action}`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta(action)
        }))
      ]
    })
    const row = {
      id: 'transfer-document-test',
      document_id: 'transfer-document-test',
      line_id: 'transfer-line-test',
      tenant_id: tenantId,
      kind,
      document_no: 'DBFB202610-001',
      document_type_id: 'type-test',
      business_type_id: 'business-test',
      business_date: '2026-10-16',
      source_organization_id: 'organization-test',
      target_organization_id: 'organization-test',
      status: 'approved',
      step_status: kind === 'step' ? 'in_transit' : null,
      in_transit_quantity: kind === 'step' ? 2 : null,
      line: {
        id: 'transfer-line-test',
        line_no: 10,
        material_id: 'material-test',
        quantity: 2,
        returned_quantity: 0,
        inventory_unit_id: 'unit-test',
        source_organization_id: 'organization-test',
        source_warehouse_id: 'source-warehouse-test',
        target_organization_id: 'organization-test',
        target_warehouse_id: 'target-warehouse-test'
      },
      material_code: 'MAT-TEST',
      material_description: '测试调拨物料',
      source_warehouse_name: '来源仓库',
      target_warehouse_name: '目标仓库',
      source_organization_name: '测试组织',
      target_organization_name: '测试组织',
      document_type_name: '标准调拨',
      business_type_name: '转储',
      inventory_unit_name: '件',
      base_unit_name: '件'
    }
    const draftRow = {
      ...row,
      id: 'transfer-draft-test',
      document_id: 'transfer-draft-test',
      line_id: 'transfer-draft-line-test',
      document_no: 'DBFB202610-002',
      status: 'draft',
      step_status: null,
      in_transit_quantity: null,
      line: { ...row.line, id: 'transfer-draft-line-test' }
    }
    const receiptRow = {
      ...row,
      id: 'transfer-receipt-test',
      document_id: 'transfer-receipt-test',
      line_id: 'transfer-receipt-line-test',
      kind: 'step_receipt',
      document_no: 'DBSH202610-001',
      status: 'submitted',
      line: { ...row.line, id: 'transfer-receipt-line-test' }
    }
    const submittedRow = {
      ...row,
      id: 'transfer-submitted-test',
      document_id: 'transfer-submitted-test',
      line_id: 'transfer-submitted-line-test',
      document_no: 'DBDD202610-003',
      status: 'submitted',
      line: { ...row.line, id: 'transfer-submitted-line-test' }
    }
    const submittedStepRow = {
      ...submittedRow,
      kind: 'step',
      document_no: 'DBFB202610-003'
    }
    await page.route('**/rest/v1/wms_transfer_business_list?*', (route) => {
      const id = new URL(route.request().url()).searchParams.get('document_id')
      const rows = id
        ? [row]
        : kind === 'step'
          ? [row, draftRow, receiptRow, submittedStepRow]
          : [row, draftRow, submittedRow]
      return route.fulfill({
        json: rows,
        headers: {
          'content-range': `0-${rows.length - 1}/${rows.length}`,
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    await page.goto(`#${menuPath}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('DBFB202610-001', { exact: true })).toBeVisible({
      timeout: 60_000
    })
    await page
      .locator('.el-table__body tr')
      .filter({ hasText: 'DBFB202610-002' })
      .getByRole('button', { name: '更多操作' })
      .click()
    await expect(page.getByRole('menuitem', { name: '下推退回（审核后可用）' })).toBeDisabled()
    if (kind === 'step')
      await expect(page.getByRole('menuitem', { name: '下推收货（审核后可用）' })).toBeDisabled()
    await page.keyboard.press('Escape')
    if (kind === 'step') {
      await page
        .locator('.el-table__body tr')
        .filter({ hasText: 'DBSH202610-001' })
        .getByRole('button', { name: '更多操作' })
        .click()
      await expect(page.getByRole('menuitem', { name: '审核收货入库' })).toBeVisible()
      await page.keyboard.press('Escape')
      await page
        .locator('.el-table__body tr')
        .filter({ hasText: 'DBFB202610-003' })
        .getByRole('button', { name: '更多操作' })
        .click()
      await expect(page.getByRole('menuitem', { name: '审核调出' })).toBeVisible()
      await page.keyboard.press('Escape')
    } else {
      await page
        .locator('.el-table__body tr')
        .filter({ hasText: 'DBDD202610-003' })
        .getByRole('button', { name: '更多操作' })
        .click()
      await expect(page.getByRole('menuitem', { name: '审核记账' })).toBeVisible()
      await page.keyboard.press('Escape')
    }
    await page.locator('.el-table__body .el-checkbox').first().click()
    await expect(page.getByRole('button', { name: /下推所选.*退回/ })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath(`${kind}-selected-push.png`),
      animations: 'disabled'
    })
    if (kind === 'step') {
      await page.getByRole('button', { name: '下推所选转储收货' }).click()
      await expect(page.getByRole('dialog', { name: '下推工厂间转储收货' })).toBeVisible()
      await expect(page.getByText('测试调拨物料').last()).toBeVisible()
    } else {
      await page.getByRole('button', { name: '下推所选调拨退回' }).click()
      await expect(page.getByRole('dialog', { name: '下推调拨退回' })).toBeVisible()
    }
  })
}
