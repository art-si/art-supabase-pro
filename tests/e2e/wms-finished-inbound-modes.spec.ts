import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const cases: Array<{
  mode: 'order' | 'pack'
  systemDraft: boolean
  saveAndPost?: boolean
  missingPermission?: string
}> = [
  { mode: 'order', systemDraft: false },
  { mode: 'pack', systemDraft: false },
  { mode: 'pack', systemDraft: true },
  { mode: 'pack', systemDraft: false, saveAndPost: true },
  { mode: 'pack', systemDraft: false, missingPermission: 'Approve' }
]
for (const { mode, systemDraft, saveAndPost = false, missingPermission } of cases) {
  test(`完工入库 ${mode} 模式选单、面积数量和首次模式锁定${systemDraft ? '（系统草稿补仓库）' : ''}${saveAndPost ? '（保存并入库及失败重试）' : ''}${missingPermission ? '（缺少审核权限仅保存）' : ''}`, async ({
    page
  }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let fixed = false
    let rejected = false
    const writes: Array<{
      post_immediately?: boolean
      lines: Array<{
        pack_id: string | null
        actual_quantity: number
        project_id: string | null
        batch_no: string | null
      }>
    }> = []
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1) || ''
      const material = {
        id: 'product-test',
        material_code: 'PANEL',
        material_name: '测试成品板',
        description: '测试成品板 1000×50',
        inventory_unit_id: 'unit-test',
        production_unit_id: 'unit-test',
        base_unit_id: 'unit-test',
        serial_management_enabled: false,
        batch_management_enabled: false,
        unit_conversions: []
      }
      const order = {
        id: 'order-test',
        tenant_id: 'tenant-test',
        organization_id: 'org-test',
        work_order_no: 'MO-INBOUND-001',
        material_id: material.id,
        material_name: material.material_name,
        project_id: null,
        construction_no: null,
        order_quantity: 100,
        completed_quantity: 100,
        warehoused_quantity: 0,
        pending_inbound_quantity: 100,
        production_report_control: 'none',
        finished_inbound_mode: fixed ? mode : null
      }
      const data: Record<string, unknown> = {
        sys_menu: { id: 'receipt-menu' },
        mdm_organization: [
          {
            id: 'org-test',
            tenant_id: 'tenant-test',
            organization_code: 'ORG',
            organization_name: '测试库存组织',
            status: '1',
            initialization: {
              enabled_on: '2026-01-01',
              is_default: true,
              initialization_closed_at: '2026-01-02'
            }
          }
        ],
        mdm_warehouse: [
          {
            id: 'warehouse-test',
            tenant_id: 'tenant-test',
            organization_id: 'org-test',
            warehouse_code: 'FG',
            warehouse_name: '测试成品仓',
            warehouse_type: 'finished',
            status: 'enabled',
            enable_locations: false
          }
        ],
        mdm_document_type: [
          {
            id: 'type-test',
            tenant_id: 'tenant-test',
            document_type_name: '完工入库',
            is_default: true
          }
        ],
        mdm_business_type: [
          {
            id: 'business-test',
            tenant_id: 'tenant-test',
            business_type_name: '完工入库',
            is_default: true
          }
        ],
        mdm_unit_of_measure: [{ id: 'unit-test', unit_code: 'SQM', unit_name: '平米' }],
        mdm_material: [material],
        wms_work_order_options_secure: [order],
        wms_production_material_document: {
          id: 'production-test',
          tenant_id: 'tenant-test',
          kind: 'finished_inbound',
          document_no: 'INBOUND-001',
          organization_id: 'org-test',
          warehouse_id: systemDraft && !fixed ? null : 'warehouse-test',
          work_order_id: 'order-test',
          project_id: null,
          document_type_id: 'type-test',
          business_type_id: 'business-test',
          business_date: '2026-10-26',
          status: 'draft',
          material_status: 'pending',
          source_report_id: systemDraft ? 'source-report' : null,
          source_report_quantity: systemDraft ? 42 : null,
          workOrder: {
            work_order_no: order.work_order_no,
            finished_inbound_mode: fixed ? mode : null,
            unit_snapshot: '平米'
          },
          lines: []
        },
        wms_finished_pack_options_secure: [
          {
            id: 'pack-test',
            work_order_id: order.id,
            work_order_no: order.work_order_no,
            pack_no: 'PK-0001',
            area: 'A区',
            axis: 'A-1',
            board_numbers: 'A-1',
            board_lengths: '6000',
            quantity: 7,
            linear_meters: 42,
            area_sqm: 42,
            stock_quantity: 42,
            production_quantity: 42,
            items: [{ board_id: 'board-test', pieces: 7 }]
          }
        ]
      }
      if (name === 'wms_finished_pack_options_secure') {
        expect(route.request().postDataJSON()).toEqual({
          p_work_order_id: order.id,
          p_exclude_document_id: 'production-test'
        })
      }
      if (name === 'wms_save_production_material_secure') {
        if (saveAndPost && !rejected) {
          rejected = true
          return route.fulfill({
            status: 400,
            json: { code: '23514', message: '仓位容量不足，请调整仓位后重试' }
          })
        }
        writes.push(route.request().postDataJSON().p_payload)
        return route.fulfill({ json: 'saved-receipt' })
      }
      return route.fulfill({
        json: data[name] ?? [],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto(
      `/tests/e2e/fixtures/wms-production-material.html?kind=finished_inbound${saveAndPost || missingPermission ? '&saveAndPost=1' : ''}${missingPermission ? `&missingPermission=${missingPermission}` : ''}`,
      {
        waitUntil: 'domcontentloaded',
        timeout: 120_000
      }
    )
    const trigger = page.getByRole('button', { name: '测试生产单据 edit', exact: true })
    await expect(trigger).toBeVisible({ timeout: 120_000 })
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle('dark', dark),
      testInfo.project.name.includes('dark')
    )
    await trigger.click()
    const drawer = page.locator('.el-drawer')
    if (systemDraft && !fixed) {
      await expect(
        drawer.getByText('末道工序报工自动生成的完工入库单', { exact: true })
      ).toBeVisible({ timeout: 120_000 })
      const warehouse = drawer.getByRole('combobox', { name: /仓库/ })
      await warehouse.click()
      await page.getByRole('option', { name: /测试成品仓/ }).click()
      await expect(drawer.getByRole('combobox', { name: /生产工单（单工单模式）/ })).toBeDisabled()
    }
    await expect(drawer.getByRole('radio', { name: '按工单汇总', exact: true })).toBeChecked({
      timeout: 120_000
    })
    if (mode === 'pack') {
      const packMode = drawer.getByRole('radio', { name: '按排包明细', exact: true })
      await packMode.focus()
      await packMode.press('Space')
      await expect(packMode).toBeChecked()
      await expect(drawer.getByRole('button', { name: '选生产工单', exact: true })).toHaveCount(0)
      await drawer.getByRole('button', { name: '选排包单', exact: true }).click()
      const picker = page.getByRole('dialog', { name: '参选排包未入库明细', exact: true })
      const packageNumber = picker.getByText('PK-0001', { exact: true })
      await expect(packageNumber).toBeVisible()
      expect(
        await packageNumber.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
      ).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath('pack-receipt-picker.png'),
        fullPage: true
      })
      await picker.locator('.el-table__body-wrapper .el-checkbox').first().click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      const row = drawer.locator('.el-table__body-wrapper tbody tr').first()
      await expect(row).toContainText('42.0000')
      await expect(row.getByRole('spinbutton')).toHaveCount(0)
      await expect(drawer.getByRole('button', { name: '导入明细', exact: true })).toHaveCount(0)
    } else {
      await expect(drawer.getByRole('button', { name: '选排包单', exact: true })).toHaveCount(0)
      await drawer.getByRole('button', { name: '选生产工单', exact: true }).click()
      const picker = page.getByRole('dialog', { name: '参选生产工单', exact: true })
      await picker.locator('.el-table__body-wrapper .el-checkbox').first().click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      const quantity = drawer
        .locator('.el-table__body-wrapper tbody tr')
        .first()
        .getByRole('spinbutton')
        .first()
      await quantity.fill('10')
      await quantity.press('Tab')
    }
    const fastSave = drawer.getByRole('button', { name: '保存并入库', exact: true })
    if (!saveAndPost) await expect(fastSave).toHaveCount(0)
    if (saveAndPost) {
      await fastSave.click()
      await expect(page.locator('.el-message--error')).toContainText('仓位容量不足')
      await expect(drawer).toBeVisible()
      await expect(fastSave).toBeEnabled()
      await drawer.screenshot({ path: testInfo.outputPath('save-and-post-retry.png') })
    }
    await (
      saveAndPost ? fastSave : drawer.getByRole('button', { name: '保存', exact: true })
    ).click()
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0].lines[0].pack_id).toBe(mode === 'pack' ? 'pack-test' : null)
    expect(writes[0].lines[0].actual_quantity).toBe(mode === 'pack' ? 42 : 10)
    expect(writes[0].lines[0].project_id).toBeNull()
    expect(writes[0].lines[0].batch_no).toBeNull()
    expect(writes[0].post_immediately).toBe(saveAndPost)
    await expect(page.locator('.el-drawer:visible')).toHaveCount(0)
    fixed = true
    await trigger.click()
    const fixedChoice = drawer.getByRole('radio', {
      name: mode === 'pack' ? '按排包明细' : '按工单汇总',
      exact: true
    })
    await expect(fixedChoice).toBeChecked()
    await expect(fixedChoice).toBeDisabled()
    await page.screenshot({ path: testInfo.outputPath('fixed-inbound-mode.png'), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
      false
    )
    expect(errors).toEqual([])
  })
}
