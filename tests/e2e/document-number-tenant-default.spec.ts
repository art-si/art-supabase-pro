import { expect, test } from '@playwright/test'

const previewPath = '/tests/e2e/fixtures/document-number-create-dialog.html'
const platformTenantId = '55555555-5555-4555-8555-555555555555'
const businessTenantId = '11111111-1111-4111-8111-111111111111'

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/sys_document_number_scene**', (route) =>
    route.fulfill({ status: 200, json: [] })
  )
  await page.route('**/rest/v1/sys_menu**', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/rest/v1/sys_tenant**', (route) =>
    route.fulfill({
      status: 200,
      json: [
        {
          id: platformTenantId,
          tenant_code: 'platform',
          tenant_name: '平台管理员租户',
          status: '1',
          builtin_type: 'platform'
        },
        {
          id: businessTenantId,
          tenant_code: 'business',
          tenant_name: '视觉验收业务租户',
          status: '1',
          builtin_type: 'business'
        }
      ]
    })
  )
})

test('全部租户默认配置平台租户，仍可增加明确业务租户', async ({ page }) => {
  test.setTimeout(180_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto(previewPath, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增编号规则' })
  await expect(dialog).toBeVisible({ timeout: 45_000 })
  const tenantField = dialog.locator('.el-form-item').filter({ hasText: '分配租户' })
  await expect(tenantField).toContainText('平台管理员租户')
  await expect(dialog.getByText('1 个租户').first()).toBeVisible()
  await page.screenshot({
    path: '.artifacts/document-number-default-platform-desktop.png',
    animations: 'disabled'
  })

  const tenantSelect = tenantField.locator('.el-select__wrapper')
  const tenantSelectWidth = await tenantSelect.evaluate(
    (element) => element.getBoundingClientRect().width
  )
  await tenantSelect.click({ position: { x: tenantSelectWidth - 60, y: 15 } })
  await page.getByRole('option', { name: /视觉验收业务租户/ }).click()
  await expect(dialog.getByText('2 个租户').first()).toBeVisible()
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(dialog).toBeVisible()
  const menuField = dialog.locator('.el-form-item').filter({ hasText: '所属菜单' }).first()
  const ruleField = dialog.locator('.el-form-item').filter({ hasText: '编号功能' }).first()
  const menuBox = await menuField.boundingBox()
  const ruleBox = await ruleField.boundingBox()
  if (!menuBox || !ruleBox) throw new Error('手机布局中缺少编号规则字段')
  expect(ruleBox.y).toBeGreaterThan(menuBox.y + menuBox.height - 1)
  const overflow = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  await page.screenshot({
    path: '.artifacts/document-number-default-platform-mobile.png',
    animations: 'disabled'
  })
  expect(pageErrors).toEqual([])
})

test('选定租户只配置所选业务租户', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(`${previewPath}?scope=selected`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增编号规则' })
  const tenantField = dialog.locator('.el-form-item').filter({ hasText: '分配租户' })
  await expect(tenantField).toContainText('视觉验收业务租户')
  await expect(tenantField.locator('.el-select__wrapper')).toHaveClass(/is-disabled/)
})

test('共享菜单路径解析保留标题回退、多菜单顺序和重建后的新标题', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(previewPath, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  const paths = await page.evaluate(async () => {
    const modulePath = '/src/utils/navigation/menu.ts'
    const { createMenuPathResolver }: typeof import('../../src/utils/navigation/menu') =
      await import(modulePath)
    const tree = [
      {
        id: 'root',
        meta: { title: '主数据' },
        children: [
          { id: 'first', name: '名称回退', meta: { title: ' ' } },
          { id: 'second', name: '第二功能', meta: { title: '单据管理' } }
        ]
      }
    ]
    const resolver = createMenuPathResolver(tree)
    tree[0].meta.title = '新主数据'
    return {
      first: resolver.resolve('first'),
      many: resolver.resolveMany(['second', 'missing', 'first']),
      missing: resolver.resolve('missing'),
      empty: resolver.resolve(),
      rebuilt: createMenuPathResolver(tree).resolve('first')
    }
  })
  expect(paths).toEqual({
    first: '主数据 / 名称回退',
    many: '主数据 / 单据管理；主数据 / 名称回退',
    missing: '',
    empty: '',
    rebuilt: '新主数据 / 名称回退'
  })
})
