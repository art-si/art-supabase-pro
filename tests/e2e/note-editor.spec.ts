import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

const linkedOwner = 'bbaabb11-0000-4000-8000-000000000001'
const mobileOwner = 'aabbccdd-0000-4000-8000-000000000002'
const noteId = '99887766-0000-4000-8000-000000000001'
const mobileImage = `${mobileOwner}/mobile-image.png`
const signedMobileImage = `/object/sign/note-images/${mobileImage}?token=fixture-token`
const fixtureImage = readFileSync(
  new URL('../../src/assets/images/settings/theme_styles/light.png', import.meta.url)
)
const largeFixtureImage = readFileSync(
  new URL('../../src/assets/images/common/logo-full-light.png', import.meta.url)
)

async function prepareNotes(page: Page, failAuthorsOnce = false) {
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
      ...['Add', 'Edit', 'View', 'Delete'].map((action) => ({
        id: `notes-${action}`,
        parentId: 'notes',
        name: `System:Notes:${action}`,
        type: 'button',
        path: '',
        meta: { title: action, is_enable: true }
      }))
    ]
  })
  const linkedProfile = {
    auth_user_id: linkedOwner,
    user_name: 'test-owner@example.invalid',
    nick_name: '已关联用户'
  }
  const date = '2026-11-14T10:00:00.000000+00:00'
  let rows = [
    {
      id: noteId,
      user_id: mobileOwner,
      content: '<p>手机端同步的笔记</p><p>这里是下一段</p>',
      content_text: '手机端同步的笔记',
      images: [mobileImage],
      tags: ['手机标签'],
      created_at: date,
      updated_at: date
    },
    {
      id: '99887766-0000-4000-8000-000000000002',
      user_id: linkedOwner,
      content: '<p>后台维护的笔记</p>',
      content_text: '后台维护的笔记',
      images: [],
      tags: [],
      created_at: date,
      updated_at: date
    }
  ]
  await page.route('**/rest/v1/sys_user?*', (route) => {
    const url = new URL(route.request().url())
    if (!url.searchParams.get('auth_user_id')?.startsWith('in.')) {
      return route.fallback()
    }
    return route.fulfill({ json: [{ ...linkedProfile, tenant: { tenant_name: '测试租户' } }] })
  })
  await page.route(/\/rest\/v1\/rpc\/list_platform_note_authors(?:\?|$)/, (route) => {
    if (failAuthorsOnce) {
      failAuthorsOnce = false
      return route.fulfill({ status: 503, json: { message: 'Service unavailable' } })
    }
    const authors = [
      { auth_user_id: mobileOwner, nick_name: null, user_name: null },
      { ...linkedProfile, tenant_name: '测试租户' }
    ]
    return route.fulfill({
      json: authors.filter((author) => rows.some((row) => row.user_id === author.auth_user_id))
    })
  })
  const reads: URLSearchParams[] = []
  await page.route(/\/rest\/v1\/rpc\/list_platform_notes(?:\?|$)/, (route) => {
    const params = new URL(route.request().url()).searchParams
    reads.push(params)
    const owner = params.get('user_id')?.slice(3)
    const result = owner ? rows.filter((row) => row.user_id === owner) : rows
    return route.fulfill({
      json: result,
      headers: {
        'content-range': result.length ? `0-${result.length - 1}/${result.length}` : '*/0'
      }
    })
  })
  await page.route('**/storage/v1/object/sign/note-images', (route) =>
    route.fulfill({ json: [{ path: mobileImage, signedURL: signedMobileImage, error: null }] })
  )
  await page.route('**/storage/v1/object/sign/note-images/**', (route) =>
    route.fulfill({ body: fixtureImage, contentType: 'image/png' })
  )
  const uploads: string[] = []
  await page.route('**/storage/v1/object/note-images/**', (route) => {
    const path = new URL(route.request().url()).pathname.split('/note-images/')[1]
    uploads.push(path)
    return route.fulfill({ json: { Key: `note-images/${path}` } })
  })
  const writes: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/save_platform_note', (route) => {
    writes.push(route.request().postDataJSON())
    return route.fulfill({ json: 1 })
  })
  const mutations: string[] = []
  await page.route(
    /\/rest\/v1\/rpc\/get_platform_record_delete_dependency_details(?:\?|$)/,
    (route) => {
      mutations.push('check')
      return route.fulfill({ json: [] })
    }
  )
  await page.route('**/rest/v1/rpc/delete_platform_notes', (route) => {
    const { p_ids: ids } = route.request().postDataJSON() as { p_ids: string[] }
    mutations.push(...ids)
    rows = rows.filter((row) => !ids.includes(row.id))
    return route.fulfill({ json: ids.length })
  })
  await page.goto('#/system/notes')
  return { uploads, writes, reads, mutations }
}

test('note form saves rich text and input tags', async ({ page }) => {
  const { writes } = await prepareNotes(page)
  await page.getByRole('button', { name: '新增笔记', exact: true }).click({ timeout: 90_000 })
  const dialog = page.getByRole('dialog', { name: '新增时光笔记' })
  const submit = dialog.getByRole('button', { name: '创建笔记', exact: true })
  const editor = dialog.locator('.tiptap[contenteditable="true"]')
  await expect(editor).toBeVisible()
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(dialog.getByText('请输入笔记内容', { exact: true })).toBeVisible()
  expect(writes).toHaveLength(0)
  const tags = dialog.getByPlaceholder('输入标签后按回车')
  await tags.fill('验收标签')
  await tags.press('Enter')
  await expect(dialog.getByText('验收标签', { exact: true })).toBeVisible()
  await editor.fill('富文本验收内容')
  await editor.press('ControlOrMeta+a')
  await dialog.getByRole('button', { name: '加粗（Ctrl+B）', exact: true }).click()
  await expect(editor.locator('strong')).toHaveText('富文本验收内容')
  await expect(dialog.getByText('请输入笔记内容', { exact: true })).toBeHidden()
  await submit.click()
  await expect(dialog).toBeHidden()
  expect(writes).toHaveLength(1)
  expect(writes[0].p_content).toContain('<strong>富文本验收内容</strong>')
  expect(writes[0].p_tags).toEqual(['验收标签'])
})

test('mobile photos are editable in rich text and new uploads save with private paths', async ({
  page
}, info) => {
  const { uploads, writes } = await prepareNotes(page)
  const row = page.getByRole('row').filter({ hasText: '手机端同步的笔记' })
  await row.getByRole('button', { name: '编辑笔记', exact: true }).click({ timeout: 90_000 })
  const dialog = page.getByRole('dialog', { name: '编辑时光笔记' })
  const editor = dialog.locator('.tiptap[contenteditable="true"]')
  const existing = editor.locator('img[data-storage-path]')
  await expect(existing).toHaveAttribute('src', /[?]token=fixture-token/)
  await expect
    .poll(() => existing.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0)
  await expect(dialog.getByText('手机标签', { exact: true })).toBeVisible()
  await expect(dialog.locator('.art-form-item__label')).toHaveCount(2)
  const editorSurface = dialog.locator('.art-tiptap-editor')
  const viewport = editorSurface.locator('.art-tiptap-editor__scrollbar > .el-scrollbar__wrap')
  const editorHeight = () => viewport.evaluate((element) => element.clientHeight)
  const normalHeight = await editorHeight()
  await dialog.getByRole('button', { name: '全屏', exact: true }).click()
  await expect.poll(editorHeight).toBeGreaterThan(normalHeight + 60)
  const footerTop = (await dialog.locator('.el-dialog__footer').boundingBox())!.y
  const editorBounds = (await editorSurface.boundingBox())!
  expect(footerTop - editorBounds.y - editorBounds.height).toBeGreaterThanOrEqual(0)
  expect(footerTop - editorBounds.y - editorBounds.height).toBeLessThan(56)
  await expect(editor.getByText('手机端同步的笔记')).toBeInViewport()
  await expect(existing).toBeInViewport()
  await expect(dialog.getByText(/\/ 20000 字符/)).toBeInViewport()
  await editor.getByText('这里是下一段', { exact: true }).click()
  await editor.press('End')
  await page.keyboard.insertText('，已全屏编辑')
  await expect(editor.getByText('这里是下一段，已全屏编辑')).toBeVisible()
  await dialog.screenshot({
    path: info.outputPath('note-editor-fullscreen.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
  await expect.poll(editorHeight).toBe(normalHeight)
  const imageDimensions = await existing.evaluate((element: HTMLImageElement) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    naturalWidth: element.naturalWidth,
    naturalHeight: element.naturalHeight
  }))
  expect(imageDimensions.width).toBeLessThanOrEqual(Math.min(imageDimensions.naturalWidth, 320))
  expect(imageDimensions.height).toBeLessThanOrEqual(Math.min(imageDimensions.naturalHeight, 200))
  expect(imageDimensions.width / imageDimensions.height).toBeCloseTo(
    imageDimensions.naturalWidth / imageDimensions.naturalHeight,
    1
  )
  await existing.click({ position: { x: 12, y: 12 } })
  await expect(existing).toHaveClass(/ProseMirror-selectednode/)
  await dialog.getByRole('button', { name: '移除所选图片', exact: true }).click()
  await expect(existing).toHaveCount(0)
  await editor.getByText('手机端同步的笔记').click()
  await editor.press('End')
  const imageButton = dialog.getByRole('button', { name: '插入图片', exact: true })
  await expect(imageButton).toHaveText('')
  await imageButton.click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByText('选择本地图片', { exact: true }).click()
  await (
    await chooser
  ).setFiles({
    name: 'browser-image.png',
    mimeType: 'image/png',
    buffer: largeFixtureImage
  })
  const stagedImage = editor.locator('img')
  await expect(stagedImage).toHaveAttribute('src', /^blob:/)
  await expect(stagedImage).toHaveJSProperty('naturalWidth', 1536)
  const stagedSize = (await stagedImage.boundingBox())!
  expect(stagedSize.width).toBeLessThanOrEqual(320)
  expect(stagedSize.height).toBeLessThanOrEqual(200)
  expect(stagedSize.width / stagedSize.height).toBeCloseTo(1536 / 440, 1)
  expect(uploads).toHaveLength(0)
  await dialog.screenshot({
    path: info.outputPath('note-inline-photo.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(uploads).toHaveLength(1)
  expect(uploads[0]).toMatch(new RegExp(`^${mobileOwner}/web/${noteId}/[0-9a-f-]+[.]png$`))
  expect(writes[0].p_id).toBe(noteId)
  expect(writes[0].p_tags).toEqual(['手机标签'])
  expect(writes[0].p_images).toEqual(uploads)
  expect(writes[0].p_content).toContain('已全屏编辑')
  expect(writes[0].p_content).toContain(`data-note-image="${uploads[0]}"`)
  expect(writes[0].p_content).not.toMatch(/blob:|fixture-token|mobile-image[.]png/)
})

test('author lookup recovers, filters mobile-only users and preserves guarded delete', async ({
  page
}, info) => {
  const { reads, mutations } = await prepareNotes(page, true)
  const search = page.locator('.notes-page .art-search-bar')
  await expect(search).toBeVisible({ timeout: 90_000 })
  const author = search.locator('.art-user-select')
  await author.waitFor({ state: 'attached' })
  if (!(await author.isVisible())) {
    await search.getByText('展开', { exact: true }).click()
  }
  await expect(search.getByText('选项加载失败', { exact: true })).toBeVisible({ timeout: 90_000 })
  await search.getByRole('button', { name: '重新加载' }).click()
  await author.getByRole('combobox').click()
  await page.getByRole('option', { name: /移动端用户 · aabbccdd/ }).click()
  await search.getByRole('button', { name: '查询', exact: true }).click()
  const row = page.getByRole('row').filter({ hasText: '手机端同步的笔记' })
  await expect(row).toBeVisible()
  await expect(page.getByText('后台维护的笔记', { exact: true })).toBeHidden()
  expect(reads.some((params) => params.get('user_id') === `eq.${mobileOwner}`)).toBe(true)

  const hero = page.locator('.notes-page').getByRole('heading', { name: '时光笔记', exact: true })
  const focus = page.getByRole('switch', { name: '进入专注模式', exact: true })
  if (await focus.isVisible()) {
    await focus.locator('..').click()
    await expect(hero).toBeHidden()
    await expect(row).toBeVisible()
    await expect(search).toBeVisible()
    await page.getByRole('switch', { name: '退出专注模式', exact: true }).locator('..').click()
    await expect(hero).toBeVisible()
    await focus.locator('..').click()
    await page.keyboard.press('Escape')
    await expect(hero).toBeVisible()
  }
  await page.locator('.notes-page').screenshot({
    path: info.outputPath('note-author-filter.png'),
    animations: 'disabled'
  })
  await row.locator('label.el-checkbox').click()
  await expect(row.getByRole('checkbox')).toBeChecked()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: '删除确认', exact: true })
  await expect(
    confirmation.getByText('确认删除选中的 1 条时光笔记？此操作不可恢复。')
  ).toBeVisible()
  expect(mutations).toEqual(['check'])
  await confirmation.getByRole('button', { name: /删除|确定/ }).click()
  await expect(row).toBeHidden()
  expect(mutations).toEqual(['check', noteId])
})

test('note detail uses a compact photo and opens a dismissible large preview', async ({
  page
}, info) => {
  await prepareNotes(page)
  const row = page.getByRole('row').filter({ hasText: '手机端同步的笔记' })
  const view = row.getByRole('button', { name: '查看笔记详情', exact: true })
  await expect(view).toBeVisible({ timeout: 30_000 })
  await page.evaluate(
    ({ dark, boxMode }) => {
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.dataset.boxMode = boxMode
    },
    {
      dark: info.project.name.includes('dark'),
      boxMode: info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    }
  )
  await view.click()
  const drawer = page.getByRole('dialog', { name: '笔记详情', exact: true })
  const body = drawer.locator('.note-detail__content')
  await expect(body).toContainText('这里是下一段')
  await expect(drawer.getByText('记录信息', { exact: true })).toBeVisible()
  const thumbnail = drawer.getByRole('button', { name: '放大查看第 1 张图片' })
  await expect(thumbnail).toHaveJSProperty('naturalWidth', 220)
  await expect(drawer.locator('.note-detail__image.el-image')).toHaveCSS(
    'background-color',
    'rgba(0, 0, 0, 0)'
  )
  await expect(drawer.locator('img')).toHaveCount(1)
  const thumbnailSize = (await thumbnail.boundingBox())!
  expect(thumbnailSize.width).toBeLessThanOrEqual(132)
  expect(thumbnailSize.height).toBeLessThanOrEqual(100)
  expect(thumbnailSize.width).toBeGreaterThanOrEqual(44)
  await drawer.screenshot({ path: info.outputPath('note-detail-thumbnail.png') })

  const viewer = page.locator('.el-image-viewer__wrapper')
  await thumbnail.click()
  await expect(viewer).toBeVisible()
  const previewImage = viewer.locator('img')
  await expect(previewImage).toHaveJSProperty('naturalWidth', 220)
  expect((await previewImage.boundingBox())!.width).toBeGreaterThan(thumbnailSize.width)
  await page.screenshot({ path: info.outputPath('note-detail-preview.png') })
  await viewer.locator('.el-image-viewer__close').click()
  await expect(viewer).toBeHidden()
  await expect(thumbnail).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(viewer).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  await expect(drawer).toBeVisible()
  await expect(thumbnail).toBeFocused()

  const attachments = drawer.getByText('图片附件', { exact: true })
  await attachments.scrollIntoViewIfNeeded()
  await expect(attachments).toBeInViewport()
  expect(await body.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)

  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await page
    .getByRole('row')
    .filter({ hasText: '后台维护的笔记' })
    .getByRole('button', { name: '查看笔记详情', exact: true })
    .click()
  await expect(body).toContainText('后台维护的笔记')
  await expect(drawer.getByText('无图片附件', { exact: true })).toBeVisible()
  await expect(drawer.locator('img')).toHaveCount(0)
  await expect(viewer).toBeHidden()
})
