import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

test('预约配置化表单校验两条独立记录并保存正确路径字段', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const writes: Record<string, unknown>[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().url().includes('/rpc/tms_save_waybill_appointment_secure')) {
      writes.push(route.request().postDataJSON())
      return route.fulfill({ json: `saved-${writes.length}` })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=appointment-delete')
  await page.getByRole('button', { name: '打开预约', exact: true }).click()
  const drawer = page.locator('.el-drawer:visible')
  await drawer.getByRole('button', { name: '新增预约', exact: true }).click()
  await expect(
    drawer.locator('[data-art-form-item-key="entries.1.driverName"] input')
  ).toBeVisible()
  await drawer.getByRole('button', { name: '保存预约', exact: true }).click()
  await expect(drawer.locator('.el-form-item.is-error')).not.toHaveCount(0)
  expect(writes).toEqual([])
  for (const index of [0, 1]) {
    const field = (key: string) =>
      drawer.locator(`[data-art-form-item-key="entries.${index}.${key}"] input`).first()
    await field('driverName').fill(`验收司机${index + 1}`)
    await field('driverPhone').fill(`1380000000${index}`)
    await field('plateNo').fill(`测A1234${index}`)
    await field('scheduledAt').fill('2026-11-20 09:30')
    await field('scheduledAt').press('Tab')
  }
  await drawer.screenshot({
    path: info.outputPath('appointment-entries.png'),
    animations: 'disabled'
  })
  await drawer.getByRole('button', { name: '保存预约', exact: true }).click()
  await expect(drawer).toBeHidden()
  expect(writes).toHaveLength(2)
  for (const [index, write] of writes.entries()) {
    expect(write).toMatchObject({
      p_payload: {
        driver_name: `验收司机${index + 1}`,
        plate_no: `测A1234${index}`,
        selected_waybill_ids: ['00000000-0000-4000-a000-000000000003']
      }
    })
  }
  expect(errors).toEqual([])
})

test('公司认证配置字段保留日期联动与电子签申请值', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const writes: Record<string, unknown>[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().url().includes('/rpc/tms_submit_company_certification_secure')) {
      writes.push(route.request().postDataJSON())
      return route.fulfill({ json: 'application-saved' })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/form-standard-transport.html?entry=company-certification')
  await page.getByRole('button', { name: '申请认证', exact: true }).click()
  const dialog = page.locator('.el-dialog:visible')
  await dialog.locator('[data-art-form-item-key="businessLicenseLongTerm"] .el-checkbox').click()
  await expect(
    dialog.locator('[data-art-form-item-key="businessLicenseExpiresOn"] input')
  ).toBeDisabled()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('tab', { name: '企业电子签', exact: true }).click()
  await page.getByRole('button', { name: '申请认证', exact: true }).click()
  const values = {
    companyName: '验收企业',
    socialCreditCode: '91330100TEST000001',
    legalName: '验收法人',
    legalIdNo: '110101199001010011',
    legalPhone: '13800000000'
  }
  for (const [key, value] of Object.entries(values))
    await dialog.locator(`[data-art-form-item-key="${key}"] input`).fill(value)
  await dialog.getByRole('radio', { name: '否', exact: true }).locator('..').click()
  await dialog.getByRole('radio', { name: '人脸认证', exact: true }).locator('..').click()
  await dialog.locator('[data-art-form-item-key="esigAcknowledged"] .el-checkbox').click()
  await dialog.screenshot({
    path: info.outputPath('certification-application.png'),
    animations: 'disabled'
  })
  await dialog.locator('.art-dialog__footer-actions button').last().click()
  await expect(dialog).toBeHidden()
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({
    p_section: 'e_signature',
    p_tenant_id: '11111111-1111-4111-8111-111111111111',
    p_payload: { ...values, legalIsDelegate: false, authMethod: 'face' }
  })
  expect(errors).toEqual([])
})
