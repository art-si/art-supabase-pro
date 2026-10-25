import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const kind of ['gain', 'loss']) {
  test(`${kind}两张空白新增选取两种物料并保存失败重试`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const tenantId = 'tenant-test'
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const records: Record<string, object[]> = {
      mdm_organization: [
        {
          id: 'org-new',
          tenant_id: tenantId,
          organization_code: 'NEW-ORG',
          organization_name: '新增测试库存组织',
          organization_type: 'company',
          status: '1'
        }
      ],
      wms_inventory_initialization: [
        {
          organization_id: 'org-new',
          enabled_on: '2026-10-30',
          is_default: true,
          initialization_closed_at: '2026-10-01'
        }
      ],
      mdm_document_type: [
        {
          id: 'type-new',
          tenant_id: tenantId,
          document_type_code: 'TEST-COUNT',
          document_type_name: '测试盘点单据类型',
          menu_ids: ['menu-new'],
          is_default: true,
          enabled: true
        }
      ],
      mdm_business_type: [
        {
          id: 'business-new',
          tenant_id: tenantId,
          business_type_code: 'TEST-COUNT',
          business_type_name: '测试盘点业务类型',
          document_type_ids: ['type-new'],
          menu_ids: ['menu-new'],
          is_default: true,
          enabled: true
        }
      ],
      mdm_unit_of_measure: [
        { id: 'unit-new', tenant_id: tenantId, unit_code: 'EA', unit_name: '件' }
      ],
      mdm_warehouse: [
        {
          id: 'warehouse-new',
          tenant_id: tenantId,
          organization_id: 'org-new',
          warehouse_code: 'WH-NEW',
          warehouse_name: '测试盘点仓库',
          status: 'enabled'
        }
      ],
      mdm_material: [1, 2].map((index) => ({
        id: `material-new-${index}`,
        tenant_id: tenantId,
        material_code: `COUNT-NEW-${index}`,
        material_name: `新增盘点测试物料 ${index}`,
        inventory_unit_id: 'unit-new',
        base_unit_id: 'unit-new',
        serial_management_enabled: false
      }))
    }
    let rejectSave = true
    const payloads: Record<string, unknown>[] = []
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({
        headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' },
        json: path.endsWith('/sys_menu')
          ? { id: 'menu-new' }
          : (records[path.split('/').at(-1) || ''] ?? [])
      })
    })
    await page.route('**/rest/v1/rpc/wms_save_count_adjustment_secure', (route) => {
      payloads.push(route.request().postDataJSON())
      return route.fulfill(
        rejectSave
          ? { status: 400, json: { code: 'P0001', message: '测试盘点保存失败' } }
          : { json: `saved-${kind}-${payloads.length}` }
      )
    })
    await page.goto(`/tests/e2e/fixtures/wms-operation-retry.html?adjustmentKind=${kind}`)
    const drawer = page.locator('.el-drawer:visible')
    for (const draft of [1, 2]) {
      await page.getByRole('button', { name: '测试盘盈单创建', exact: true }).click()
      const save = drawer.getByRole('button', { name: '保存', exact: true })
      await expect(save).toBeEnabled()
      await expect(drawer.getByText('测试盘点单据类型', { exact: true })).toBeVisible()
      await expect(drawer.getByText('测试盘点业务类型', { exact: true })).toBeVisible()
      const remark = drawer.getByRole('textbox', { name: '备注', exact: true })
      await expect(remark).toHaveValue('')
      await expect(drawer.locator('.el-table__body tr')).toHaveCount(0)
      await drawer.getByRole('button', { name: '添加物料', exact: true }).click()
      const picker = page.getByRole('dialog', {
        name: `选择${kind === 'gain' ? '盘盈' : '盘亏'}单物料`,
        exact: true
      })
      await expect(picker.locator('.el-table__body tr')).toHaveCount(2)
      await picker.locator('.el-table__header-wrapper .el-checkbox').click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      const rows = drawer.locator('.el-table__body tr')
      await expect(rows).toHaveCount(2)
      for (const row of await rows.all()) {
        const quantity = row.getByRole('spinbutton').first()
        await quantity.fill(String(draft + 1))
        await expect
          .poll(() =>
            quantity.evaluate((input) => {
              const control = input.closest('.el-input-number')!.getBoundingClientRect()
              const fixedCells = input
                .closest('tr')!
                .querySelectorAll('.el-table-fixed-column--left, .el-table-fixed-column--right')
              return Array.from(fixedCells).some((cell) => {
                const fixed = cell.getBoundingClientRect()
                return fixed.right > control.left + 1 && fixed.left < control.right - 1
              })
            })
          )
          .toBe(false)
        await quantity.press('Tab')
      }
      await remark.fill(`新增${kind} ${draft}`)
      rejectSave = true
      await save.click()
      await expect(page.getByText('测试盘点保存失败', { exact: true })).toBeVisible()
      await expect(remark).toHaveValue(`新增${kind} ${draft}`)
      await expect(rows).toHaveCount(2)
      await drawer.getByRole('button', { name: '全屏', exact: true }).click()
      await drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap').evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      await expect(rows.last()).toBeInViewport()
      await expect
        .poll(() =>
          drawer.evaluate((element) => {
            const content = element.querySelector('.art-drawer__content')!.getBoundingClientRect()
            const footer = element.querySelector('.el-drawer__footer')!.getBoundingClientRect()
            return content.bottom <= footer.top + 1
          })
        )
        .toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`${kind}-new-${draft}-save-retry.png`),
        animations: 'disabled'
      })
      rejectSave = false
      await save.click()
      await expect(drawer).toBeHidden()
      expect(payloads).toHaveLength(draft * 2)
      expect(payloads.at(-1)).toEqual(payloads.at(-2))
      expect(payloads.at(-1)?.p_payload).toMatchObject({
        kind,
        organization_id: 'org-new',
        document_type_id: 'type-new',
        business_type_id: 'business-new',
        remark: `新增${kind} ${draft}`,
        lines: [1, 2].map((index) =>
          expect.objectContaining({
            material_id: `material-new-${index}`,
            variance_quantity: draft + 1,
            warehouse_id: 'warehouse-new'
          })
        )
      })
    }
    expect(errors).toEqual([])
  })
}
