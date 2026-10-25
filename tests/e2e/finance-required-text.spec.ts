import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const permission of ['View', 'Edit']) {
  test(`缺少新增权限拒绝打开资产草稿 ${permission}`, async ({ page }) => {
    await prepareIsolatedSession(page)
    let businessRequests = 0
    await page.route('**/rest/v1/**', (route) => {
      if (
        /\/(?:fms_list_asset_categories_secure|fms_list_account_set_options_secure|save_fms_fixed_asset_secure)(?:\?|$)/.test(
          route.request().url()
        )
      )
        businessRequests += 1
      return route.fallback()
    })
    await page.goto(
      `/tests/e2e/fixtures/record-delete-context.html?validationTarget=fixed-asset&assetPermission=${permission}`
    )
    await page.getByRole('button', { name: '打开校验表单', exact: true }).click()
    await expect(page.getByText('当前账号无权新增或编辑固定资产', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(businessRequests).toBe(0)
  })
}

const cases = [
  {
    target: 'fixed-asset',
    codeLabel: '资产编号',
    code: 'TEST001',
    labels: ['资产名称'],
    errors: ['请输入资产名称'],
    save: '创建草稿'
  },
  {
    target: 'fund-account',
    codeLabel: '账户编码',
    code: 'TEST001',
    labels: ['账户名称'],
    errors: ['请输入账户名称'],
    save: '创建账户'
  },
  {
    target: 'category',
    codeLabel: '类别编码',
    code: 'TEST001',
    labels: ['类别名称'],
    errors: ['请输入类别名称'],
    save: '创建类别'
  },
  {
    target: 'bill',
    codeLabel: '内部编号',
    code: 'TEST001',
    labels: ['出票人', '收款人', '承兑人'],
    errors: ['请输入出票人', '请输入收款人', '请输入承兑人'],
    save: '创建草稿'
  },
  {
    target: 'template',
    codeLabel: '模板编码',
    code: 'TEST001',
    labels: ['模板名称'],
    errors: ['请输入模板名称'],
    save: '创建模板'
  },
  {
    target: 'posting',
    codeLabel: '规则编码',
    code: 'TEST001',
    labels: ['规则名称'],
    errors: ['请输入规则名称'],
    save: '创建规则'
  },
  {
    target: 'currency',
    codeLabel: '币种代码',
    code: 'USD',
    labels: ['币种名称'],
    errors: ['请输入币种名称'],
    save: '创建币种'
  },
  {
    target: 'subject',
    codeLabel: '科目编码',
    code: '1001',
    labels: ['科目名称'],
    errors: ['请输入科目名称'],
    save: '创建科目'
  },
  {
    target: 'statement',
    codeLabel: '项目编码',
    code: 'TEST001',
    labels: ['项目名称'],
    errors: ['请输入报表项目名称'],
    save: '创建项目'
  },
  {
    target: 'account-set',
    codeLabel: '账套编码',
    code: 'TEST001',
    labels: ['账套名称', '法人主体'],
    errors: ['请输入账套名称', '请输入法人主体名称'],
    save: '创建账套'
  }
] as const

for (const config of cases) {
  test(`会计基础表单拒绝空白文本 ${config.target}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/rpc/fms_list_account_set_options_secure**', (route) =>
      route.fulfill({
        json: {
          total: 1,
          records: [
            {
              id: 'cccccccc-cccc-4ccc-accc-cccccccccccc',
              accountSetName: '测试账套',
              accountSetCode: 'TEST',
              tenantId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
              status: 'active'
            }
          ]
        }
      })
    )
    let writes = 0
    let assetPayload: Record<string, unknown> | undefined
    if (config.target === 'fixed-asset')
      await page.route('**/rest/v1/rpc/fms_list_asset_categories_secure**', (route) =>
        route.fulfill({
          json: [
            {
              id: 'dddddddd-dddd-4ddd-addd-dddddddddddd',
              categoryName: '测试设备',
              categoryCode: 'EQ',
              isEnabled: true,
              defaultUsefulLifeMonths: 60,
              defaultResidualRate: 0
            }
          ]
        })
      )
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request()
      if (
        request.method() !== 'GET' &&
        /\/(?:fms_currency|rpc\/(?:save_fms_|fms_save_|fms_create_))/.test(request.url())
      ) {
        writes += 1
        if (config.target === 'fixed-asset') {
          assetPayload = request.postDataJSON().p_payload
          return writes === 1
            ? route.fulfill({
                status: 400,
                json: { code: 'P0001', message: '验证保存失败，请重试' }
              })
            : route.fulfill({ json: { id: 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee' } })
        }
        return route.fulfill({ json: null })
      }
      return route.fallback()
    })
    await page.goto(
      `/tests/e2e/fixtures/record-delete-context.html?validationTarget=${config.target}${config.target === 'fixed-asset' ? '&assetPermission=Add' : ''}`
    )
    await page.getByRole('button', { name: '打开校验表单', exact: true }).click()
    const dialog = page.getByRole('dialog')
    if (config.target === 'fixed-asset') {
      await dialog.getByRole('combobox', { name: /资产类别/ }).click()
      await page.getByRole('option', { name: '测试设备（EQ）', exact: true }).click()
      await dialog.getByRole('spinbutton', { name: /资产原值/ }).fill('1000')
    }
    await dialog.getByRole('textbox', { name: new RegExp(config.codeLabel) }).fill(config.code)
    for (const label of config.labels)
      await dialog.getByRole('textbox', { name: new RegExp(label) }).fill('   ')
    await dialog.getByRole('button', { name: config.save, exact: true }).click()
    for (const message of config.errors)
      await expect(dialog.getByText(message, { exact: true })).toBeVisible()
    for (const label of config.labels)
      await expect(dialog.getByRole('textbox', { name: new RegExp(label) })).toHaveValue('   ')
    expect(writes).toBe(0)
    if (config.target === 'fixed-asset') {
      await expect(dialog.locator('.el-form-item__error')).toHaveCount(1)
    }
    await page.screenshot({
      path: testInfo.outputPath('required-text.png'),
      animations: 'disabled'
    })
    for (const label of config.labels)
      await dialog.getByRole('textbox', { name: new RegExp(label) }).fill('测试有效名称')
    await dialog.getByRole('textbox', { name: new RegExp(config.codeLabel) }).click()
    for (const message of config.errors)
      await expect(dialog.getByText(message, { exact: true })).toHaveCount(0)
    expect(writes).toBe(0)
    if (config.target === 'fixed-asset') {
      await dialog.getByRole('button', { name: config.save, exact: true }).click()
      await expect(page.getByText('验证保存失败，请重试', { exact: true })).toBeVisible()
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('textbox', { name: /资产名称/ })).toHaveValue('测试有效名称')
      expect(writes).toBe(1)
      expect(assetPayload).toMatchObject({
        assetName: '测试有效名称',
        originalValue: 1000,
        residualValue: 0,
        categoryId: 'dddddddd-dddd-4ddd-addd-dddddddddddd'
      })
      await page.screenshot({
        path: testInfo.outputPath('save-failed.png'),
        animations: 'disabled'
      })
      await page
        .getByTestId('revoke-delete-permission')
        .evaluate((button: HTMLButtonElement) => button.click())
      await dialog.getByRole('button', { name: config.save, exact: true }).click()
      await expect(
        page.getByText('固定资产操作权限已变化，请刷新页面后重试', { exact: true })
      ).toBeVisible()
      expect(writes).toBe(1)
      await expect(dialog.getByRole('textbox', { name: /资产名称/ })).toHaveValue('测试有效名称')
      await page.screenshot({
        path: testInfo.outputPath('permission-revoked.png'),
        animations: 'disabled'
      })
      await page
        .getByRole('button', { name: '恢复资产权限', exact: true })
        .evaluate((button: HTMLButtonElement) => button.click())
      await dialog.getByRole('button', { name: config.save, exact: true }).click()
      await expect(dialog).not.toBeVisible()
      expect(writes).toBe(2)
    }
  })
}
