import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)
for (const kind of ['fuel', 'electric'])
  test(`${kind}新增卡片通过配置化车辆选择保存真实车辆与余额`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const writes: Record<string, unknown>[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url()),
        endpoint = url.pathname.split('/').at(-1)
      if (endpoint === (kind === 'fuel' ? 'vms_create_fuel_card_v2' : 'vms_create_electric_card')) {
        writes.push(route.request().postDataJSON())
        return route.fulfill({ json: 'saved-card' })
      }
      if (endpoint === 'vms_list_vehicle_archives_secure')
        return route.fulfill({
          json: {
            records: [
              {
                id: '33333333-3333-4333-8333-333333333333',
                tenantId: '11111111-1111-4111-8111-111111111111',
                plateNo: '测A12345',
                companyName: '验收运输公司',
                auditStatus: 'approved'
              }
            ],
            total: 1
          }
        })
      if (endpoint === 'sys_dictionary')
        return route.fulfill({
          json: [
            { id: 'diesel', name: '柴油', label: '柴油', value: 'diesel', status: '1', sort: 0 }
          ]
        })
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/form-standard-transport.html?entry=${kind}-card-new`)
    await page.getByRole('button', { name: '打开真实业务入口', exact: true }).click()
    const dialog = page.locator('.el-dialog:visible')
    await dialog.locator('[data-art-form-item-key="cardNo"] input').fill('CARD-SCHEMA-NEW')
    const photo = dialog.locator('[data-art-form-item-key="cardImageUrl"]')
    await expect(photo).toBeVisible()
    await dialog
      .locator('[data-art-form-item-key="vehicleId"] .art-data-select__single-input')
      .click()
    const picker = page.getByRole('dialog', { name: '选择已审批车辆', exact: true })
    await picker.getByRole('row').filter({ hasText: '测A12345' }).click()
    await picker.getByRole('button', { name: /确.*定/ }).click()
    await dialog.locator('[data-art-form-item-key="openingBalance"] input').fill('80')
    if (kind === 'fuel') {
      await dialog.locator('[data-art-form-item-key="fuelType"] .el-select').click()
      await page.getByRole('option', { name: '柴油', exact: true }).click()
    }
    await dialog.screenshot({ path: info.outputPath(`${kind}-card.png`), animations: 'disabled' })
    await dialog
      .getByRole('button', { name: kind === 'fuel' ? '创建油卡' : '创建电卡', exact: true })
      .click()
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0]).toMatchObject({
      p_card_no: 'CARD-SCHEMA-NEW',
      p_vehicle_id: '33333333-3333-4333-8333-333333333333',
      p_opening_balance: 80
    })
    expect(errors).toEqual([])
  })
