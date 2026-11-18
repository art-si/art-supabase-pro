import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test('dictionary tree distinguishes invalid hierarchy, loading failure, empty and recovered data', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000)
  let mode: 'cycle' | 'error' | 'empty' | 'valid' = 'cycle'
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const dictionary = (id: string, parentId: string | null) => ({
    id,
    parent_id: parentId,
    node_type: 'directory',
    name: `测试目录 ${id}`,
    code: `test${id}`,
    status: '1',
    sort: 1,
    cascade_parent_type_id: null,
    cascade_parent_type: null
  })
  await page.route('**/rest/v1/sys_dict_type?*', async (route) => {
    // No business writes are permitted by this regression.
    if (route.request().method() !== 'GET') throw new Error('Unexpected dictionary mutation')
    if (mode === 'error') {
      await route.fulfill({
        status: 503,
        json: { code: 'TEST_UNAVAILABLE', message: 'Synthetic upstream failure' }
      })
      return
    }
    const rows =
      mode === 'cycle'
        ? [dictionary('A', 'B'), dictionary('B', 'A')]
        : mode === 'valid'
          ? [dictionary('A', null), dictionary('B', 'A')]
          : []
    await route.fulfill({ json: rows })
  })
  await page.goto('#/data-center/dict', { waitUntil: 'domcontentloaded' })
  const panel = page.locator('.dict-tree-panel')
  const errorTitle = panel.getByText('字典目录加载失败', { exact: true })
  const retry = panel.getByRole('button', { name: '重新加载', exact: true })
  await expect(errorTitle).toBeVisible({ timeout: 60_000 })
  const acknowledge = page.getByRole('button', { name: '知道了', exact: true })
  if (await acknowledge.isVisible()) await acknowledge.click()
  await expect(page.locator('.setting-guide:visible')).toHaveCount(0, { timeout: 10_000 })
  await expect(panel).toContainText('字典层级存在循环关联')
  await expect(panel).toContainText('排序不可用')
  await expect(panel.getByText('暂无字典目录', { exact: true })).toHaveCount(0)
  await expect(panel.getByRole('button', { name: '新增根节点', exact: true })).toBeDisabled()
  await expect(panel.getByRole('textbox', { name: '搜索目录名称或字典编码' })).toBeDisabled()
  await page.evaluate(
    (dark) => document.documentElement.classList.toggle('dark', dark),
    testInfo.project.name.includes('dark')
  )
  await panel.screenshot({ path: testInfo.outputPath('dictionary-cycle-error.png') })

  mode = 'error'
  await retry.click()
  await expect(errorTitle).toBeVisible()
  await expect(panel).not.toContainText('循环关联')
  await expect(panel).not.toContainText('Synthetic upstream failure')
  await expect(panel.getByText('暂无字典目录', { exact: true })).toHaveCount(0)

  mode = 'empty'
  await retry.click()
  await expect(panel.getByText('暂无字典目录', { exact: true })).toBeVisible()
  await expect(errorTitle).toHaveCount(0)
  await panel.screenshot({ path: testInfo.outputPath('dictionary-empty.png') })

  mode = 'valid'
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(panel.getByText('测试目录 A', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(panel).toContainText('2 个目录 · 0 个类型')
  await panel.getByRole('button', { name: '全部展开字典目录', exact: true }).click()
  await expect(panel.getByText('测试目录 B', { exact: true })).toBeVisible()
  await panel.getByRole('textbox', { name: '搜索目录名称或字典编码' }).fill('testB')
  await expect(panel.getByText('测试目录 B', { exact: true })).toBeVisible()
  await expect(panel.locator('.dict-type-tree__viewport')).toHaveAttribute('aria-busy', 'false')
  expect(pageErrors).toEqual([])
})

const dictionaryPath = '/data-center/dict'
const directoryId = '90000000-0000-4000-8000-000000000000'
const keyFor = (index: number) => `90000000-0000-4000-8000-${String(index).padStart(12, '0')}`
const nameFor = (index: number) => `键盘字典 ${String(index).padStart(2, '0')}`
const treeItem = (tree: Locator, label: string) =>
  tree.getByText(label, { exact: true }).locator('xpath=ancestor::*[@role="treeitem"][1]')
const nodeControl = (node: Locator) => node.locator('button[data-virtual-tree-key]')

async function openDictionaryKeyboardWorkspace(page: Page) {
  await prepareIsolatedSession(page, { platformSuper: false })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'platform', name: '测试平台', baseUrl: '/' }] })
  )
  await mockApplicationMenus(page, {
    platform: [
      {
        id: 'dict-keyboard-menu',
        parentId: null,
        name: 'Dict',
        path: dictionaryPath,
        component: dictionaryPath,
        type: 'menu',
        sort: 1,
        meta: { title: '字典管理', is_enable: true, is_hide: false, roles: [] }
      }
    ]
  })
  const directory = {
    id: directoryId,
    parent_id: null,
    node_type: 'directory',
    name: '键盘测试目录',
    code: 'keyboardTestDirectory',
    status: '1',
    sort: 0,
    cascade_parent_type_id: null,
    cascade_parent_type: null
  }
  const types = Array.from({ length: 64 }, (_, offset) => {
    const index = offset + 1
    return {
      ...directory,
      id: keyFor(index),
      parent_id: directory.id,
      node_type: 'dictionary',
      name: nameFor(index),
      code: `keyboardTestType${index}`,
      sort: index
    }
  })
  const reads: string[] = []
  const writes: string[] = []
  const rejectWrite = (route: Route) => {
    writes.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort('blockedbyclient')
  }
  await page.route('**/rest/v1/rpc/save_dict_type_tree_order', rejectWrite)
  await page.route(/\/rest\/v1\/sys_dict_type(?:\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return rejectWrite(route)
    const kind = new URL(route.request().url()).searchParams.get('node_type')
    const rows =
      kind === 'eq.directory'
        ? [directory]
        : kind === 'eq.dictionary'
          ? types
          : [directory, ...types]
    return route.fulfill({ json: rows })
  })
  const itemName = (id: string) => `条目 · ${types.find((type) => type.id === id)?.name}`
  await page.route(/\/rest\/v1\/sys_dictionary(?:\?|$)/, async (route) => {
    if (route.request().method() !== 'GET') return rejectWrite(route)
    const typeId = new URL(route.request().url()).searchParams.get('type_id')?.slice(3)
    if (!typeId || !types.some((type) => type.id === typeId)) {
      return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
    }
    reads.push(typeId)
    return route.fulfill({
      json: [
        {
          id: `item-${typeId}`,
          type_id: typeId,
          code: 'sample',
          value: 'sample',
          label: itemName(typeId),
          status: '1',
          sort: 1
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })

  await page.goto(`#${dictionaryPath}`, { waitUntil: 'domcontentloaded' })
  const panel = page.locator('.dict-tree-panel')
  const tree = panel.getByRole('tree')
  const root = treeItem(tree, directory.name)
  await expect(root).toBeVisible({ timeout: 60_000 })
  const acknowledge = page.getByRole('button', { name: '知道了', exact: true })
  if (await acknowledge.isVisible()) await acknowledge.click()
  return {
    panel,
    tree,
    root,
    leaf: (index: number) => treeItem(tree, nameFor(index)),
    result: (index: number) =>
      page.locator('.dict-table-panel').getByText(itemName(keyFor(index)), { exact: true }),
    reads,
    writes
  }
}

test.describe('数据字典虚拟树键盘', () => {
  test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
  test.describe.configure({ timeout: 120_000 })

  test('自然 Tab 和方向键跨窗口浏览，Enter 或 Space 才读取字典项', async ({ page }, info) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await prepareAppearance(page, { theme: 'dark', boxBorderMode: true })
    const { panel, root, leaf, result, reads, writes } = await openDictionaryKeyboardWorkspace(page)
    const search = panel.getByRole('textbox', { name: '搜索目录名称或字典编码' })
    await search.focus()
    await page.keyboard.press('Tab')
    await expect(nodeControl(root)).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(root).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('ArrowRight')
    await expect(nodeControl(leaf(1))).toBeFocused()
    expect(reads).toEqual([])

    await page.keyboard.press('Enter')
    await expect(result(1)).toBeVisible()
    expect(reads).toEqual([keyFor(1)])
    const header = page.locator('.dict-type-overview')
    const headerGeometry = await header.evaluate((element) => {
      const title = element.querySelector('h1')
      const identity = element.querySelector('.business-workspace-header__identity')
      const aside = element.querySelector('.business-workspace-header__aside')
      if (!title || !identity || !aside) throw new Error('未找到字典工作区标题或操作区')
      return {
        titleHeight: title.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(title).lineHeight),
        identityBottom: identity.getBoundingClientRect().bottom,
        asideTop: aside.getBoundingClientRect().top
      }
    })
    expect(headerGeometry.titleHeight).toBeLessThanOrEqual(headerGeometry.lineHeight + 1)
    expect(headerGeometry.asideTop).toBeGreaterThan(headerGeometry.identityBottom)
    await expect(leaf(44)).toHaveCount(0)
    for (let index = 2; index <= 44; index++) {
      await page.keyboard.press('ArrowDown')
      await expect(nodeControl(leaf(index))).toBeFocused()
    }
    await expect(leaf(1)).toHaveCount(0)
    await expect(leaf(44)).toBeInViewport()
    expect(
      await nodeControl(leaf(44))
        .locator('.dict-type-tree__name')
        .evaluate((element) => element.scrollWidth - element.clientWidth)
    ).toBeLessThanOrEqual(1)
    await expect(result(1)).toBeVisible()
    expect(reads).toEqual([keyFor(1)])
    await page.locator('.dict-layout').screenshot({
      path: info.outputPath('dictionary-keyboard-window-dark-1024.png'),
      animations: 'disabled'
    })

    await page.keyboard.press('Space')
    await expect(result(44)).toBeVisible()
    expect(reads).toEqual([keyFor(1), keyFor(44)])
    await page.keyboard.press('ArrowLeft')
    await expect(nodeControl(root)).toBeFocused()
    await expect(result(44)).toBeVisible()
    expect(reads).toEqual([keyFor(1), keyFor(44)])
    await header.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await expect(header).toBeHidden()
    await expect(result(44)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(header).toBeVisible()
    await header.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(header).toBeVisible()
    expect(writes).toEqual([])
  })

  test('Ctrl 或 Meta 配合 Shift 保留区间并集，行内编辑不切换字典', async ({ page }) => {
    const { panel, root, leaf, result, reads, writes } = await openDictionaryKeyboardWorkspace(page)
    await nodeControl(root).press('ArrowRight')
    await expect(root).toHaveAttribute('aria-expanded', 'true')
    const selected = (index: number) => leaf(index).locator('.dict-type-tree__node')
    const count = panel.locator('.dict-type-tree__footer-selection')
    await nodeControl(leaf(1)).press('Control+Enter')
    await expect(result(1)).toBeVisible()
    await nodeControl(leaf(3)).press('Meta+Space')
    await expect(result(3)).toBeVisible()
    await expect(count).toHaveText('2 项')
    await nodeControl(leaf(5)).press('Control+Shift+Enter')
    await expect(result(5)).toBeVisible()
    await expect(count).toHaveText('4 项')
    await nodeControl(leaf(7)).press('Meta+Shift+Space')
    await expect(result(7)).toBeVisible()
    await expect(count).toHaveText('6 项')
    for (const index of [1, 3, 4, 5, 6, 7]) {
      await expect(selected(index)).toHaveClass(/\bis-multi-selected\b/)
    }
    await expect(selected(2)).not.toHaveClass(/\bis-multi-selected\b/)
    const expectedReads = [1, 3, 5, 7].map(keyFor)
    expect(reads).toEqual(expectedReads)

    await nodeControl(leaf(2)).focus()
    const edit = leaf(2).getByRole('button', { name: `编辑${nameFor(2)}`, exact: true })
    await page.keyboard.press('Tab')
    await expect(edit).toBeFocused()
    await page.keyboard.press('Enter')
    const editor = page.getByRole('dialog', { name: '编辑字典类型', exact: true })
    await expect(editor.getByPlaceholder('请输入字典类型名称')).toHaveValue(nameFor(2))
    await page.keyboard.press('Escape')
    await expect(editor).toBeHidden()
    await expect(result(7)).toBeVisible()
    await expect(count).toHaveText('6 项')
    await expect(selected(2)).not.toHaveClass(/\bis-multi-selected\b/)
    expect(reads).toEqual(expectedReads)
    expect(writes).toEqual([])
  })
})
