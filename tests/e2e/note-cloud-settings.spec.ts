import { expect, test, type Page } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

async function prepareNoteCloudSettingsPage(page: Page) {
  const tenant = await prepareIsolatedSession(page)
  const person = {
    id: 'cloud-test-user',
    user_name: 'journal-user',
    nick_name: '验收人员',
    user_email: 'journal@example.invalid',
    status: '1',
    tenant
  }
  await page.route('**/rest/v1/sys_user?*', (route) => {
    const select = new URL(route.request().url()).searchParams.get('select') ?? ''
    return route.fulfill({
      json: select.startsWith('id,user_name,nick_name')
        ? [person]
        : {
            id: 'permission-test-user',
            user_name: '验收管理员',
            user_email: 'admin@example.invalid',
            status: '1',
            tenant_id: tenant.id,
            tenant
          }
    })
  })
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({ json: [{ ...tenant, status: '1' }] })
  )
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '验收平台', baseUrl: '/', sort: 1 }] })
  )
  await mockApplicationMenus(page, {
    platform: [
      {
        id: 'system',
        name: 'System',
        type: 'folder',
        path: '/system',
        component: '/index/index',
        meta: { title: '系统管理', is_enable: true }
      },
      {
        id: 'param',
        parentId: 'system',
        name: 'SystemParam',
        type: 'menu',
        path: 'system-param',
        component: '/system/system-param',
        meta: { title: '参数设置', is_enable: true }
      },
      {
        id: 'param-edit',
        parentId: 'param',
        name: 'System:SystemParam:Edit',
        type: 'button',
        path: '',
        meta: { title: '编辑参数', is_enable: true }
      }
    ]
  })

  return person
}

test('cloud storage scopes only save the targets for the selected scope', async ({
  page
}, info) => {
  const person = await prepareNoteCloudSettingsPage(page)

  await page.route('**/rest/v1/rpc/get_note_cloud_settings', (route) =>
    route.fulfill({ json: { scope: 'all', target_ids: [], updated_at: null } })
  )
  const saves: unknown[] = []
  await page.route('**/rest/v1/rpc/save_note_cloud_settings', async (route) => {
    const body = route.request().postDataJSON()
    saves.push(body)
    await route.fulfill({
      json: {
        scope: body.p_scope,
        target_ids: body.p_target_ids,
        updated_at: '2026-11-13T00:00:00Z'
      }
    })
  })
  await page.goto('#/system/system-param')
  await page.getByRole('button', { name: '编辑时光记事存储模式' }).click({ timeout: 90_000 })
  const dialog = page.getByRole('dialog', { name: '时光记事存储模式' })
  await expect(dialog.getByText('授权范围', { exact: true })).toBeVisible()

  await dialog.getByText('指定租户', { exact: true }).click()
  await dialog.getByText('搜索并选择租户', { exact: true }).click({ timeout: 15_000 })
  await page.getByRole('option', { name: '测试租户' }).click()
  await dialog.getByText('指定人员', { exact: true }).click()
  const save = dialog.getByRole('button', { name: '保存授权' })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(dialog.getByText('请至少选择一位人员')).toBeVisible()
  expect(saves).toHaveLength(0)
  await dialog.getByRole('combobox', { name: /授权人员/ }).click({ timeout: 15_000 })
  await page.getByRole('option', { name: /验收人员/ }).click()
  await expect(dialog.getByText('验收人员', { exact: true })).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize()!.width).toBe(
    true
  )
  await dialog.screenshot({ path: info.outputPath('note-cloud-users.png'), animations: 'disabled' })
  await save.click()
  await expect(dialog).toBeHidden()
  expect(saves).toEqual([
    { p_scope: 'users', p_target_ids: [person.id], p_expected_updated_at: null }
  ])
  await expect(page.getByText('云端 · 1 位指定人员')).toBeVisible()
})

test('malformed cloud authorization leaves other system parameters available', async ({ page }) => {
  await prepareNoteCloudSettingsPage(page)
  await page.route('**/rest/v1/sys_param?*', (route) =>
    new URL(route.request().url()).searchParams.has('param_key')
      ? route.fulfill({ json: [] })
      : route.fulfill({
          headers: { 'content-range': '0-0/1' },
          json: [
            {
              id: 'ordinary-param',
              param_name: '测试常规参数',
              param_key: 'fixture.regular',
              param_type: 'single_text',
              param_value: '测试参数值',
              group_code: 'system_policy',
              enabled: true,
              builtin: false,
              sort: 0
            }
          ]
        })
  )
  await page.route('**/rest/v1/rpc/get_note_cloud_settings', (route) =>
    route.fulfill({ json: { scope: 'tenants', updated_at: null } })
  )

  await page.goto('#/system/system-param')
  const storage = page.getByRole('row', { name: /时光记事存储模式/ })
  await expect(storage.getByText('暂未读取授权范围')).toBeVisible()
  await storage.getByRole('button', { name: '编辑时光记事存储模式' }).click()
  await expect(page.getByText('无法读取云端授权，请刷新后重试', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '时光记事存储模式' })).toBeHidden()

  await page
    .getByRole('row', { name: /测试常规参数/ })
    .getByRole('button', { name: '编辑' })
    .click()
  const other = page.getByRole('dialog', { name: '编辑参数', exact: true })
  await expect(other.getByRole('textbox', { name: '参数名称' })).toHaveValue('测试常规参数')
})

test('malformed cloud save result does not confirm success or replace the displayed scope', async ({
  page
}) => {
  await prepareNoteCloudSettingsPage(page)
  const updatedAt = '2026-11-14T17:02:03.456789+00:00'
  await page.route('**/rest/v1/rpc/get_note_cloud_settings', (route) =>
    route.fulfill({ json: { scope: 'all', target_ids: [], updated_at: updatedAt } })
  )
  await page.route('**/rest/v1/rpc/save_note_cloud_settings', (route) =>
    route.fulfill({ json: { scope: 'closed', target_ids: [], updated_at: '无效时间' } })
  )

  await page.goto('#/system/system-param')
  const storage = page.getByRole('row', { name: /时光记事存储模式/ })
  await expect(storage.getByText('云端 · 全部用户')).toBeVisible()
  await storage.getByRole('button', { name: '编辑时光记事存储模式' }).click()
  const dialog = page.getByRole('dialog', { name: '时光记事存储模式' })
  await expect(dialog.getByText('授权范围', { exact: true })).toBeVisible()
  await dialog.getByText('仅本机', { exact: true }).click()
  const request = page.waitForRequest('**/rest/v1/rpc/save_note_cloud_settings')
  await dialog.getByRole('button', { name: '保存授权' }).click()
  expect((await request).postDataJSON()).toEqual({
    p_scope: 'closed',
    p_target_ids: [],
    p_expected_updated_at: updatedAt
  })

  await expect(
    page.getByText('无法确认云端授权已保存，请刷新后核对', { exact: true })
  ).toBeVisible()
  await expect(page.getByText('云端存储授权已保存', { exact: true })).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await expect(storage.getByText('云端 · 全部用户')).toBeVisible()
})
