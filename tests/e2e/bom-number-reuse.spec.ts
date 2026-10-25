import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const detail of [true, false]) {
  test(`BOM ${detail ? '详情' : '结构'}公共数量精度和空值`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const quantities = [12345.6789014, 0, null, 'invalid']
    const items = quantities.map((quantity, index) => ({
      id: `item-${index}`,
      tenant_id: 'test-tenant',
      bom_id: 'bom-test',
      component_material_id: `material-${index}`,
      sequence_no: index + 1,
      quantity,
      unit_id: 'unit',
      scrap_rate: index === 0 ? 1.23456 : 0,
      mrp_enabled: true,
      component: { material_code: `MAT-${index}`, material_name: `数量验证组件${index}` }
    }))
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      let json: object = []
      if (path.endsWith('/mdm_bom'))
        json = [
          {
            id: 'bom-test',
            tenant_id: 'test-tenant',
            bom_code: 'BOM-NUMBER',
            material_id: 'parent',
            material: { material_code: 'PARENT', material_name: '数量验证父项' },
            version: 'V1',
            status: 'design',
            purpose: 'production',
            base_quantity: detail ? null : 12345.678901,
            base_unit_id: 'unit',
            sort: 0,
            items
          }
        ]
      if (path.endsWith('/mdm_material'))
        json = [
          {
            id: 'parent',
            tenant_id: 'test-tenant',
            material_code: 'PARENT',
            material_name: '数量验证父项',
            status: 'enabled'
          }
        ]
      if (path.endsWith('/rpc/mdm_bom_structure_detail'))
        json = items.map((item, index) => ({
          node_id: item.id,
          bom_id: 'bom-test',
          bom_code: 'BOM-NUMBER',
          bom_version: 'V1',
          material_id: item.component_material_id,
          material_code: item.component.material_code,
          material_name: item.component.material_name,
          drawing_no: null,
          is_virtual: false,
          quantity: item.quantity,
          component_quantity: index === 2 ? null : item.quantity,
          scrap_rate: item.scrap_rate,
          unit_name: '件',
          depth: 1,
          path: [item.id],
          has_children: false
        }))
      return route.fulfill({
        json,
        headers: { 'content-range': '0-3/4', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto(`/tests/e2e/fixtures/bom-number-reuse.html${detail ? '?detail=1' : ''}`)
    if (detail) await page.getByRole('button', { name: '查看数量明细' }).click()
    else {
      await page.locator('.bom-structure-page__material-control .el-input').click()
      const picker = page.getByRole('dialog', { name: '选择父项物料' })
      await picker.getByText('数量验证父项', { exact: true }).click()
      await picker.getByRole('button', { name: /确定|确认/ }).click()
    }
    const table = detail
      ? page.locator('.art-table.bom-detail-dialog__component-table')
      : page.locator('.bom-structure-page .art-table')
    await expect(table).toBeVisible({ timeout: 60_000 })
    const rows = table.locator('.el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(4)
    const headers = await table.locator('.el-table__header-wrapper th .cell').allTextContents()
    const quantityIndex = headers.findIndex(
      (label) => label.trim() === (detail ? '用量' : '累计需求')
    )
    const scrapIndex = headers.findIndex((label) => label.trim() === '损耗率 %')
    expect(quantityIndex).toBeGreaterThanOrEqual(0)
    expect(scrapIndex).toBeGreaterThanOrEqual(0)
    await expect(rows.nth(0).locator('td').nth(quantityIndex)).toHaveText('12,345.678901')
    await expect(rows.nth(0).locator('td').nth(scrapIndex)).toHaveText('1.23')
    await expect(rows.nth(1).locator('td').nth(quantityIndex)).toHaveText('0')
    await expect(rows.nth(2).locator('td').nth(quantityIndex)).toHaveText('—')
    await expect(rows.nth(3).locator('td').nth(quantityIndex)).toHaveText('—')
    if (detail) {
      const description = page.locator('.art-section-card').filter({ hasText: '数量与有效期' })
      await expect(description.locator('.art-descriptions__value').first()).toHaveText('—')
    } else {
      await expect(page.locator('.bom-structure-page__root-identity')).toContainText(
        '12,345.678901'
      )
      await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
      await expect(page.locator('.business-workspace-header')).toBeHidden()
      await expect(table).toBeVisible()
      await page.getByRole('switch', { name: '退出专注模式', exact: true }).locator('..').click()
      await expect(page.locator('.business-workspace-header')).toBeVisible()
      await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
      await page.keyboard.press('Escape')
      await expect(page.locator('.business-workspace-header')).toBeVisible()
    }
    await rows.nth(0).getByText('12,345.678901', { exact: true }).first().scrollIntoViewIfNeeded()
    await table.screenshot({ path: info.outputPath('bom-quantity.png'), animations: 'disabled' })
    await table.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await table.screenshot({ path: info.outputPath('bom-scrap-rate.png'), animations: 'disabled' })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
