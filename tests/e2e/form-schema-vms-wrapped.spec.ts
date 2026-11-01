import { expect, test } from '@playwright/test'
import {
  openTransportEntry,
  transportInput,
  type TransportWrite
} from './support/form-standard-transport'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

test('零部件条件字段配置保留显隐、寿命必填校验与保存值', async ({ page }, info) => {
  const writes: TransportWrite[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const dialog = await openTransportEntry(page, 'part-usage', writes)
  await dialog.getByRole('tab', { name: '零部件使用', exact: true }).click()
  const choose = async (key: string, label: string) => {
    await dialog
      .locator(`[data-art-form-item-key="${key}"]`)
      .getByRole('radio', { name: label, exact: true })
      .locator('..')
      .click()
  }
  await choose('rfidEnabled', '是')
  await transportInput(dialog, 'rfidTag').fill('RFID-SCHEMA')
  await choose('enableMode', '指定日期')
  await transportInput(dialog, 'enableDate').fill('2026-11-01')
  await transportInput(dialog, 'enableDate').press('Tab')
  await choose('warrantyMode', '单独质保')
  await transportInput(dialog, 'warrantyMileage').fill('50000')
  await transportInput(dialog, 'warrantyDuration').fill('24')
  await dialog.locator('[data-art-form-item-key="serviceMileageEnabled"] .el-checkbox').click()
  await expect(dialog.locator('[data-art-form-item-key="serviceMileage"]')).toHaveCount(0)
  const confirm = dialog.locator('.el-dialog__footer button').last()
  await confirm.click()
  await expect(dialog.getByText('请至少选择一种使用寿命', { exact: true })).toBeVisible()
  expect(writes).toHaveLength(0)
  await dialog.locator('[data-art-form-item-key="serviceYearsEnabled"] .el-checkbox').click()
  await expect(dialog.getByText('请至少选择一种使用寿命', { exact: true })).toHaveCount(0)
  await transportInput(dialog, 'serviceYears').fill('5')
  await choose('status', '已报废')
  await transportInput(dialog, 'scrapReason').fill('配置化报废说明')
  await dialog.screenshot({ path: info.outputPath('part-conditions.png'), animations: 'disabled' })
  await confirm.click()
  await expect
    .poll(
      () => writes.filter((write) => write.path === 'vms_update_vehicle_part_usage_secure').length
    )
    .toBe(1)
  expect(
    writes.find((write) => write.path === 'vms_update_vehicle_part_usage_secure')?.payload
  ).toMatchObject({
    p_payload: {
      rfid_enabled: true,
      rfid_tag: 'RFID-SCHEMA',
      enable_mode: 'date',
      enable_date: '2026-11-01',
      warranty_mode: 'self',
      warranty_mileage: 50000,
      warranty_duration: 24,
      service_mileage_enabled: false,
      service_years_enabled: true,
      service_years: 5,
      status: 'scrapped',
      scrap_reason: '配置化报废说明'
    }
  })
  expect(errors).toEqual([])
})
