import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('note form edits rich text and aligns its description', async ({ page }, info) => {
  await prepareIsolatedSession(page)
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
        id: 'notes',
        parentId: 'system',
        name: 'Notes',
        type: 'menu',
        path: 'notes',
        component: '/system/notes',
        meta: { title: '时光笔记', is_enable: true }
      },
      ...['Add', 'Edit', 'View'].map((action) => ({
        id: `notes-${action}`,
        parentId: 'notes',
        name: `System:Notes:${action}`,
        type: 'button',
        path: '',
        meta: { title: action, is_enable: true }
      }))
    ]
  })
  const writes: Record<string, unknown>[] = []
  await page.route(/\/rest\/v1\/notes(?:\?|$)/, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      writes.push(body)
      return route.fulfill({ json: { id: 'fixture-note', ...body } })
    }
    return route.fulfill({ json: [], headers: { 'content-range': '0-0/0' } })
  })
  await page.goto('#/system/notes')
  await page.getByRole('button', { name: '新增笔记', exact: true }).click({ timeout: 90_000 })
  const dialog = page.getByRole('dialog', { name: '新增时光笔记' })
  const submit = dialog.getByRole('button', { name: '创建笔记', exact: true })
  const editor = dialog.locator('.tiptap[contenteditable="true"]')
  await expect(editor).toBeVisible()
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(dialog.getByText('请输入笔记内容', { exact: true })).toBeVisible()
  expect(writes).toHaveLength(0)
  await editor.fill('富文本验收内容')
  await editor.press('ControlOrMeta+a')
  await dialog.getByRole('button', { name: '加粗（Ctrl+B）', exact: true }).click()
  await expect(editor.locator('strong')).toHaveText('富文本验收内容')
  await expect(dialog.getByText('请输入笔记内容', { exact: true })).toBeHidden()
  const description = dialog.getByText(
    '新增笔记会归属当前登录账号；编辑时会保留移动端已上传的图片。',
    { exact: true }
  )
  await description.scrollIntoViewIfNeeded()
  const editorBounds = await dialog.locator('.art-tiptap-editor').boundingBox()
  const descriptionBounds = await description.boundingBox()
  expect(Math.abs(editorBounds!.x - descriptionBounds!.x)).toBeLessThan(2)
  await dialog.screenshot({ path: info.outputPath('note-editor.png'), animations: 'disabled' })
  await submit.click()
  await expect(dialog).toBeHidden()
  expect(writes).toHaveLength(1)
  expect(writes[0].content).toContain('<strong>富文本验收内容</strong>')
})
