import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('危害因素类别校验重开与保存失败重试保留输入', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const path = '/smis/dual-control-system/risk-control/hazard-factor-category'
  const name = 'SmisDualControlHazardFactorCategory'
  const menu = {
    id: 'hazard-form-test',
    parentId: null,
    name,
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '危害因素类别', is_enable: true, is_hide: false, roles: [] }
  }
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
  )
  await mockApplicationMenus(page, {
    smis: [
      menu,
      ...['View', 'Add'].map((action) => ({
        ...menu,
        id: `${menu.id}-${action}`,
        parentId: menu.id,
        name: `${name}:${action}`,
        path: '',
        component: '',
        type: 'button'
      }))
    ]
  })
  await page.route('**/rest/v1/rpc/smis_list_hazard_factor_categories_secure', (route) =>
    route.fulfill({ json: { records: [], total: 0 } })
  )
  const dictionaries = [
    { code: 'smisHazardFactorType', label: '人的因素', value: 'human' },
    { code: 'commonEnabledDisabledStatus', label: '启用', value: 'enabled' },
    { code: 'smisTagStyle', label: '主要', value: 'primary' }
  ]
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const code = new URL(route.request().url()).searchParams.get('dict_type_table.code')
    return route.fulfill({
      json: dictionaries
        .filter((item) => !code || code === `eq.${item.code}`)
        .map((item) => ({
          id: item.code,
          label: item.label,
          value: item.value,
          sort: 1,
          status: '1',
          dict_type_table: { code: item.code, name: item.code }
        }))
    })
  })
  const saves: unknown[] = []
  await page.route('**/rest/v1/rpc/smis_save_hazard_factor_category_secure', (route) => {
    saves.push(route.request().postDataJSON())
    return saves.length === 1
      ? route.fulfill({ status: 503, json: { message: 'service unavailable' } })
      : route.fulfill({ json: 'test-saved-category' })
  })
  await page.goto(`#${path}`)
  await page.getByRole('button', { name: '新增危害因素类别', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const code = dialog.getByPlaceholder('如 1、HF-001', { exact: true })
  const category = dialog.getByPlaceholder('请输入具体危害因素类别', { exact: true })
  await code.fill('HF-TEST')
  await category.fill('测试因素类别')
  await expect(dialog.locator('.hazard-factor-category-dialog__preview')).toContainText(
    '测试因素类别'
  )
  await dialog.getByRole('button', { name: '保存危害因素类别', exact: true }).click()
  await expect(dialog.locator('.el-form-item__error').first()).toBeVisible()
  await expect(code).toHaveValue('HF-TEST')
  await expect(category).toHaveValue('测试因素类别')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({ path: testInfo.outputPath('hazard-category-validation.png') })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '新增危害因素类别', exact: true }).click()
  await expect(dialog).toBeVisible()
  await expect(code).toHaveValue('')
  await expect(category).toHaveValue('')
  await expect(dialog.locator('.el-form-item__error')).toHaveCount(0)
  await category.fill('重新打开后的类别')
  await expect(dialog.locator('.hazard-factor-category-dialog__preview')).toContainText(
    '重新打开后的类别'
  )
  await code.fill('hf-retry')
  await dialog.getByRole('combobox', { name: /因素类型$/ }).click()
  await page.getByRole('option', { name: '人的因素', exact: true }).click()
  const save = dialog.getByRole('button', { name: '保存危害因素类别', exact: true })
  await save.click()
  await expect.poll(() => saves.length).toBe(1)
  expect(saves[0]).toMatchObject({
    p_id: null,
    p_payload: {
      category_code: 'HF-RETRY',
      category_name: '重新打开后的类别',
      factor_type: 'human'
    },
    p_tenant_id: 'permission-test-tenant'
  })
  await expect(dialog).toBeVisible()
  await expect(code).toHaveValue('hf-retry')
  await expect(category).toHaveValue('重新打开后的类别')
  await expect(save).toBeEnabled()
  const message = page.locator('.el-message:visible')
  await expect(message).toHaveCount(1)
  await expect(message).not.toContainText('service unavailable')
  await expect.poll(async () => (await message.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0)
  await page.screenshot({
    path: testInfo.outputPath('hazard-category-save-retry.png'),
    animations: 'disabled'
  })
  await save.click()
  await expect.poll(() => saves.length).toBe(2)
  expect(saves[1]).toEqual(saves[0])
  await expect(dialog).toBeHidden()
  expect(errors).toEqual([])
})
