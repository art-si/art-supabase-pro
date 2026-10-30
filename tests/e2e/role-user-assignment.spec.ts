import { expect, test, type Page } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const records = [
  {
    id: 'user-a',
    nick_name: '张调度',
    user_name: 'dispatch',
    user_email: 'dispatch@example.invalid',
    status: '1',
    assigned: true
  },
  {
    id: 'user-b',
    nick_name: '李运输',
    user_name: 'transport',
    user_email: 'transport@example.invalid',
    status: '1',
    assigned: false
  },
  {
    id: 'user-c',
    nick_name: '停用的历史成员',
    user_name: 'inactive',
    user_email: 'inactive@example.invalid',
    status: '2',
    assigned: true
  }
]

async function prepare(page: Page, permitted = true) {
  const tenant = await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/sys_role?*', (route) =>
    route.fulfill({
      headers: { 'content-range': '0-1/2' },
      json: ['A', 'B'].map((name) => ({
        id: `role-${name}`,
        role_name: `测试角色 ${name}`,
        role_code: `TEST_${name}`,
        tenant_id: tenant.id,
        tenant,
        enabled: true
      }))
    })
  )
  await mockApplicationMenus(page, {
    platform: [
      {
        id: 'system',
        type: 'folder',
        name: 'System',
        path: '/system',
        component: '/index/index',
        meta: { title: '系统管理', is_enable: true }
      },
      {
        id: 'role-page',
        parentId: 'system',
        type: 'menu',
        name: 'Role',
        path: 'role',
        component: '/system/role',
        meta: { title: '角色管理', is_enable: true }
      },
      {
        id: 'role-edit',
        path: '',
        parentId: 'role-page',
        type: 'button',
        name: 'System:Role:Edit',
        meta: { title: '编辑角色', is_enable: true }
      },
      ...(permitted
        ? [
            {
              id: 'role-assign',
              path: '',
              parentId: 'role-page',
              type: 'button',
              name: 'System:Role:AssignUser',
              meta: { title: '分配用户', is_enable: true }
            }
          ]
        : [])
    ]
  })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/', sort: 1 }] })
  )
  await page.route('**/rest/v1/rpc/system_role_users', (route) =>
    route.fulfill({ json: { records } })
  )
  await page.route('**/rest/v1/rpc/system_set_role_users', (route) => route.fulfill({ json: 1 }))
  await page.goto('#/system/role', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('更多操作').first()).toBeVisible({ timeout: 90_000 })
  await page.evaluate(
    ({ dark, mode }) => {
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.dataset.boxMode = mode
    },
    {
      dark: test.info().project.name.includes('dark'),
      mode: test.info().project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    }
  )
}

async function open(page: Page, index = 0) {
  const more = page.getByLabel('更多操作').nth(index)
  if (test.info().project.use.isMobile) await more.click()
  else await more.hover()
  await page.getByRole('menuitem', { name: '分配用户', exact: true }).click()
  return page.getByRole('dialog', { name: '分配用户', exact: true })
}

test('从角色分配用户：回显、搜索、保存失败保留与成功提交', async ({ page }, testInfo) => {
  await prepare(page)
  const payloads: unknown[] = []
  let fail = true
  await page.route('**/rest/v1/rpc/system_set_role_users', async (route) => {
    payloads.push(route.request().postDataJSON())
    if (fail)
      await route.fulfill({
        status: 409,
        json: { code: '40001', message: '角色成员已发生变化，请重新加载后再分配' }
      })
    else await route.fulfill({ json: 1 })
  })
  const dialog = await open(page)
  await expect(dialog).toContainText('测试角色 A')
  await expect(dialog).toContainText('已选 2 人')
  const picker = dialog.getByRole('combobox')
  await picker.fill('李运输')
  await page.getByRole('option', { name: /李运输/ }).click()
  await expect(dialog).toContainText('已选 3 人')
  await picker.press('Escape')
  await dialog.getByRole('button', { name: '保存分配', exact: true }).click()
  await expect(dialog).toContainText('数据已被其他操作更新')
  await expect(dialog).toContainText('已选 3 人')
  expect(payloads[0]).toEqual({
    p_role_id: 'role-A',
    p_user_ids: ['user-a', 'user-c', 'user-b'],
    p_expected_user_ids: ['user-a', 'user-c']
  })
  await page.screenshot({
    path: testInfo.outputPath('role-user-assignment.png'),
    animations: 'disabled'
  })
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  fail = false
  await dialog.getByRole('button', { name: '保存分配', exact: true }).click()
  await expect(dialog).toBeHidden()
})

test('加载失败阻止保存，重试后空结果不会清空历史成员', async ({ page }) => {
  await prepare(page)
  let calls = 0
  let writes = 0
  await page.route('**/rest/v1/rpc/system_role_users', async (route) => {
    if (++calls === 1) await route.fulfill({ status: 503, json: { message: '加载失败，请重试' } })
    else await route.fulfill({ json: { records: [] } })
  })
  await page.route('**/rest/v1/rpc/system_set_role_users', (route) => {
    writes++
    return route.fulfill({ json: 0 })
  })
  const dialog = await open(page)
  await expect(dialog.getByRole('button', { name: '保存分配', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog).toContainText('暂无可分配用户')
  expect(writes).toBe(0)
})

test('无分配权限时隐藏角色分配入口', async ({ page }) => {
  await prepare(page, false)
  const more = page.getByLabel('更多操作').first()
  if (test.info().project.use.isMobile) await more.click()
  else await more.hover()
  await expect(page.getByRole('menuitem', { name: '编辑角色', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '分配用户', exact: true })).toHaveCount(0)
})

test('专注模式中分配用户，保存期间冻结编辑并保留工作区布局', async ({ page }) => {
  await prepare(page)
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(page.locator('.role-page__overview')).toBeHidden()
  let releaseSave: () => void = () => {}
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve
  })
  await page.route('**/rest/v1/rpc/system_set_role_users', async (route) => {
    await saveGate
    await route.fulfill({ json: 0 })
  })
  const dialog = await open(page)
  await expect(dialog).toContainText('已选 2 人')
  await dialog.getByRole('button', { name: '保存分配', exact: true }).click()
  await expect(dialog.getByRole('combobox')).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await expect(page.locator('.role-page__overview')).toBeHidden()
  releaseSave()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.role-page__overview')).toBeHidden()
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(page.locator('.role-page__overview')).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(page.locator('.role-page__overview')).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(page.locator('.role-page__overview')).toBeVisible()
})
