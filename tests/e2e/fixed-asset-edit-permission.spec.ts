import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const mode of ['read', 'hidden', 'revoked', 'denied', 'vehicle'] as const) {
  test(`资产编辑字段与权限 ${mode}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const accountSetId = 'cccccccc-cccc-4ccc-accc-cccccccccccc'
    const categoryId = 'dddddddd-dddd-4ddd-addd-dddddddddddd'
    let writes = 0
    let details = 0
    let payload: Record<string, unknown> | undefined
    await page.route('**/rest/v1/rpc/fms_list_asset_vehicle_options_secure**', (route) => {
      expect(route.request().postDataJSON().p_account_set_id).toBe(accountSetId)
      return route.fulfill({
        json: [
          { value: '11111111-1111-4111-a111-111111111111', label: '测A资产001' },
          { value: '22222222-2222-4222-a222-222222222222', label: '测A资产002' }
        ]
      })
    })
    await page.route('**/rest/v1/rpc/fms_list_account_set_options_secure**', (route) =>
      route.fulfill({
        json: {
          total: 1,
          records: [
            {
              id: accountSetId,
              accountSetCode: 'TEST',
              accountSetName: '测试账套',
              tenantId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
              status: 'active'
            }
          ]
        }
      })
    )
    await page.route('**/rest/v1/rpc/fms_list_asset_categories_secure**', (route) =>
      route.fulfill({
        json: [
          {
            id: categoryId,
            categoryCode: 'EQ',
            categoryName: '测试设备',
            isEnabled: true,
            defaultUsefulLifeMonths: 60,
            defaultResidualRate: 0
          }
        ]
      })
    )
    await page.route('**/rest/v1/rpc/fms_get_fixed_asset_secure**', (route) => {
      details += 1
      return route.fulfill({
        json: {
          id: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee',
          accountSetId,
          categoryId,
          assetNo: 'ASSET001',
          assetName: '测试编辑资产',
          vehicleId: mode === 'vehicle' ? '11111111-1111-4111-a111-111111111111' : null,
          status: 'draft',
          acquisitionDate: '2026-10-01',
          readyForUseDate: '2026-10-01',
          depreciationStartDate: '2026-10-01',
          usefulLifeMonths: 60,
          originalValue: mode === 'hidden' ? '***' : 1000,
          residualValue: mode === 'hidden' ? '***' : 0,
          location: mode === 'hidden' ? '***' : '测试库房',
          specification: mode === 'hidden' ? '***' : '测试型号',
          fieldAccess: {
            assetValues: mode === 'hidden' ? 'hidden' : 'read',
            assetCustody: 'hidden',
            assetReferences: mode === 'vehicle' ? 'edit' : 'hidden'
          }
        }
      })
    })
    await page.route('**/rest/v1/rpc/save_fms_fixed_asset_secure**', (route) => {
      writes += 1
      payload = route.request().postDataJSON().p_payload
      return route.fulfill({ json: { id: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee' } })
    })
    await page.goto(
      `/tests/e2e/fixtures/record-delete-context.html?validationTarget=fixed-asset&assetOperation=edit&assetPermission=${mode === 'denied' ? 'Add' : 'Edit'}`
    )
    await page.getByRole('button', { name: '打开校验表单', exact: true }).click()
    const dialog = page.getByRole('dialog')
    if (mode === 'denied') {
      await expect(page.getByText('当前账号无权新增或编辑固定资产', { exact: true })).toBeVisible()
      await expect(dialog).toHaveCount(0)
      expect(details).toBe(0)
      expect(writes).toBe(0)
      return
    }
    await expect(dialog.getByRole('textbox', { name: /资产名称/ })).toHaveValue('测试编辑资产')
    await expect(dialog.getByRole('spinbutton', { name: /资产原值/ })).toHaveCount(0)
    if (mode === 'hidden')
      await expect(dialog.getByText('资产原值', { exact: true })).toHaveCount(0)
    await dialog.getByRole('textbox', { name: /资产名称/ }).fill('修改后的资产名称')
    if (mode === 'vehicle') {
      const selector = dialog.getByRole('combobox', { name: '关联车辆', exact: true })
      await selector.click()
      await page.getByRole('option', { name: '测A资产002', exact: true }).click()
    } else {
      await expect(dialog.getByText('关联车辆', { exact: true })).toHaveCount(0)
    }
    if (mode === 'revoked')
      await page
        .getByTestId('revoke-delete-permission')
        .evaluate((button: HTMLButtonElement) => button.click())
    await page.screenshot({ path: testInfo.outputPath('edit-state.png'), animations: 'disabled' })
    await dialog.getByRole('button', { name: '保存修改', exact: true }).click()
    if (mode === 'revoked') {
      await expect(
        page.getByText('固定资产操作权限已变化，请刷新页面后重试', { exact: true })
      ).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: /资产名称/ })).toHaveValue(
        '修改后的资产名称'
      )
      expect(writes).toBe(0)
      return
    }
    await expect(dialog).not.toBeVisible()
    expect(writes).toBe(1)
    if (mode === 'vehicle') {
      expect(payload?.vehicleId).toBe('22222222-2222-4222-a222-222222222222')
      return
    }
    expect(payload).not.toHaveProperty('vehicleId')
    expect(payload).toMatchObject({
      id: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee',
      assetName: '修改后的资产名称'
    })
    for (const key of [
      'originalValue',
      'residualValue',
      'departmentId',
      'employeeId',
      'location',
      'specification',
      'serialNo',
      'sourceType',
      'sourceId',
      'sourceNo'
    ])
      expect(payload).not.toHaveProperty(key)
  })
}
