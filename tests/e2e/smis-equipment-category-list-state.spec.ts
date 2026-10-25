import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('设备分类主列表及配置失败保留数据并可重试', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const tenant = await prepareIsolatedSession(page)
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  const path = '/smis/equipment-ledger/equipment-category'
  const menu = {
    id: 'SmisEquipmentCategory',
    parentId: null,
    name: 'SmisEquipmentCategory',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '设备分类', is_enable: true, is_hide: false, roles: [] }
  }
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
  )
  await mockApplicationMenus(page, {
    smis: [
      menu,
      {
        ...menu,
        id: `${menu.id}-View`,
        parentId: menu.id,
        name: `${menu.name}:View`,
        type: 'button',
        path: '',
        component: ''
      }
    ]
  })
  let failure: 'list' | 'profile' | null = null
  const record = {
    id: 'category-test',
    tenantId: tenant.id,
    parentId: null,
    categoryName: '测试设备分类',
    status: 'enabled',
    sort: 1,
    childCount: 0,
    inspectionCategories: [],
    profileType: 'boiler'
  }
  for (const [kind, rpc] of [
    ['list', 'smis_list_equipment_categories_secure'],
    ['profile', 'smis_list_equipment_category_profiles_secure']
  ] as const) {
    await page.route(`**/rest/v1/rpc/${rpc}`, (route) => {
      if (failure === kind)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'database unavailable' }
        })
      return route.fulfill({
        json:
          kind === 'profile'
            ? [{ id: record.id, tenantId: tenant.id, profileType: 'boiler' }]
            : {
                records: [record],
                tree: [record],
                total: 1,
                inspectionOptions: [],
                overview: { total: 1, enabled: 1, rootCount: 1, linkedCount: 0 }
              }
      })
    })
  }
  await page.goto(`#${path}`)
  const table = page.locator('.art-table-query')
  const metric = page.locator('.business-workspace-header__metric').first().locator('strong')
  await expect(table.getByText(record.categoryName, { exact: true }).first()).toBeVisible({
    timeout: 60_000
  })
  for (const kind of ['profile', 'list'] as const) {
    failure = kind
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(table.getByText('数据加载失败', { exact: true })).toBeVisible()
    await expect(metric).toHaveText('1')
    await expect(page.getByText('设备分类树加载失败，请稍后重试。', { exact: true })).toBeVisible()
    await expect(table.getByText('暂无设备分类', { exact: true })).toHaveCount(0)
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.getByText(/database unavailable|XX000/)).toHaveCount(0)
    failure = null
    await table.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(table.getByText(record.categoryName, { exact: true }).first()).toBeVisible()
    await expect(table.getByText('数据加载失败', { exact: true })).toHaveCount(0)
  }
  await page.screenshot({
    path: testInfo.outputPath('equipment-category-recovered.png'),
    fullPage: true,
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})
