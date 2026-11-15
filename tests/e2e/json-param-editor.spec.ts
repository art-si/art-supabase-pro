import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

const fixture = '/tests/e2e/fixtures/json-param-editor.html'

test.describe('系统参数编辑器按需加载', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('普通字段无需 Monaco，合上弹窗后忽略尚未加载完成的 JSON 编辑器', async ({ page }) => {
    test.setTimeout(90_000)
    page.setDefaultTimeout(15_000)
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/' }] })
    )
    await page.route('**/rest/v1/rpc/get_table_column_runtime', (route) =>
      route.fulfill({ json: { enabled: false, profiles: [] } })
    )
    await page.route('**/rest/v1/rpc/get_note_cloud_settings', (route) =>
      route.fulfill({ json: { scope: 'closed', target_ids: [], updated_at: null } })
    )
    const path = '/system/system-param'
    await mockApplicationMenus(page, {
      platform: [
        {
          id: 'system-param-preview',
          parentId: null,
          name: 'SystemParam',
          path,
          component: path,
          type: 'menu',
          sort: 0,
          meta: { title: '系统参数', is_enable: true, is_hide: false, roles: [] }
        }
      ]
    })
    const rows = [
      {
        id: 'text',
        param_name: '测试文本参数',
        param_type: 'single_text',
        param_value: '测试文本'
      },
      { id: 'json', param_name: '测试 JSON 参数', param_type: 'json', param_value: '{"test":7}' }
    ].map((row, sort) => ({
      ...row,
      param_key: `fixture.param.${row.id}`,
      group_code: 'fixture',
      group_name: '测试分组',
      enabled: true,
      builtin: false,
      sort
    }))
    await page.route('**/rest/v1/sys_param?*', (route) =>
      new URL(route.request().url()).searchParams.has('param_key')
        ? route.fulfill({ json: [] })
        : route.fulfill({ headers: { 'content-range': '0-1/2' }, json: rows })
    )

    const editorAsset = /\/(?:assets\/monaco-[\w-]+\.js|src\/utils\/monaco-runtime\.ts)(?:\?|$)/
    const errors: string[] = []
    let editorRequests = 0
    let holdEditor = false
    const { promise: allowEditor, resolve: releaseEditor } = Promise.withResolvers<void>()
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route(editorAsset, async (route) => {
      editorRequests++
      if (holdEditor) await allowEditor
      await route.continue()
    })
    try {
      await page.goto(`#${path}`, { waitUntil: 'domcontentloaded' })
      const form = page.getByRole('dialog', { name: '编辑参数', exact: true })
      const edit = (name: string) =>
        page.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: '编辑' })
      await edit('测试文本参数').click()
      await expect(form.getByRole('textbox', { name: '参数名称' })).toHaveValue('测试文本参数')
      expect(editorRequests).toBe(0)
      await form.getByRole('button', { name: '取消', exact: true }).click()
      await expect(form).toBeHidden()

      await edit('测试 JSON 参数').click()
      await form.getByRole('tab', { name: '状态与内容' }).click()
      holdEditor = true
      const firstRequest = page.waitForRequest(editorAsset)
      await form.getByRole('button', { name: '{"test":7}', exact: true }).click()
      await firstRequest
      await expect(form.getByRole('button', { name: '正在加载 JSON 编辑器…' })).toBeDisabled()
      await form.getByRole('button', { name: '取消', exact: true }).click()
      await expect(form).toBeHidden()
      releaseEditor()

      await edit('测试 JSON 参数').click()
      await form.getByRole('tab', { name: '状态与内容' }).click()
      await form.getByRole('button', { name: '点击编辑 JSON 默认值', exact: true }).click()
      await expect(page.getByRole('dialog', { name: '编辑参数值', exact: true })).toBeHidden()
      const drawer = page.getByRole('dialog', { name: '编辑默认值', exact: true })
      await expect(drawer.locator('.monaco-editor')).toBeVisible()
      const apply = drawer.getByRole('button', { name: '应用内容', exact: true })
      await expect(apply).toBeDisabled()
      await drawer.getByRole('textbox', { name: 'Editor content' }).focus()
      await page.keyboard.insertText('{}')
      await apply.click()
      await expect(drawer).toBeHidden()
      await expect(form.getByRole('button', { name: '{}', exact: true })).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      releaseEditor()
    }
  })
})

test('JSON 注释不标红且保留高亮，应用后保存严格 JSON', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const response = await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('button', { name: '编辑外观配置' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '编辑外观配置' }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()

  const initialDraft = await page.evaluate(() => window.jsonParamEditorFixture.getDraft())
  expect(initialDraft.startsWith('{')).toBe(true)
  expect(initialDraft).toMatch(/\/\/ 自动专注浏览[^\n]*\n {2}"globalFocusMode": true/)
  expect(initialDraft).toMatch(/\/\/ 侧边菜单展开宽度[^\n]*\n {2}"menuOpenWidth"/)
  expect(initialDraft).toMatch(/\/\/ 主导航布局[^\n]*\n {2}"menuType"/)
  expect(await page.evaluate(() => window.jsonParamEditorFixture.getLanguage())).toBe('json')
  const tokenColors = await page
    .locator('.monaco-editor .view-line span[class*="mtk"]')
    .evaluateAll((items) => [...new Set(items.map((item) => getComputedStyle(item).color))])
  expect(tokenColors.length).toBeGreaterThan(1)
  await page.waitForTimeout(500)
  expect(await page.evaluate(() => window.jsonParamEditorFixture.getSyntaxErrors())).toEqual([])
  await expect(page.locator('.monaco-editor .squiggly-error')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    testInfo.project.use.viewport!.width
  )
  await page.screenshot({ path: testInfo.outputPath('json-appearance-comments.png') })

  await page.evaluate(() =>
    window.jsonParamEditorFixture.setDraft('{ // 注释\n "globalFocusMode": tru }')
  )
  await expect(page.getByRole('button', { name: '应用内容' })).toBeDisabled()
  await page.evaluate(() =>
    window.jsonParamEditorFixture.setDraft('{ // 注释\n "globalFocusMode": false }')
  )
  await expect(page.getByRole('button', { name: '应用内容' })).toBeEnabled()
  await page.getByRole('button', { name: '应用内容' }).click()
  await expect(page.getByTestId('applied-value')).toHaveText('{\n  "globalFocusMode": false\n}')

  await page.getByRole('button', { name: '编辑网站配置' }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const otherDraft = await page.evaluate(() => window.jsonParamEditorFixture.getDraft())
  expect(otherDraft).toContain('// 启用网站配置；可选值：true、false；类型：布尔值')
  expect(otherDraft).toContain('// 渠道唯一键，如 wechat、dingtalk、google；类型：字符串')
  expect(otherDraft).toMatch(/"enabled": true/)
  await page.keyboard.press('Escape')
  await expect(page.locator('.el-drawer')).toBeHidden()

  await page.getByRole('button', { name: '编辑围栏配置' }).click()
  await expect(page.locator('.monaco-editor')).toBeVisible()
  const geofenceDraft = await page.evaluate(() => window.jsonParamEditorFixture.getDraft())
  expect(geofenceDraft).toContain('// 启用电子围栏策略；可选值：true、false；类型：布尔值')
  expect(geofenceDraft).toContain('// 装货打卡半径，单位米；类型：数字')
  expect(pageErrors).toEqual([])
})
