import { expect, test, type Page } from '@playwright/test'
import { expectInputTextUnclipped } from './support/input-text-width'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const materialName = '分类参选测试物料'

async function openMaterialPicker(
  page: Page,
  {
    childCategory = '挖掘机配件',
    materials = [{ name: materialName, code: 'MAT-CATEGORY-01' }]
  } = {}
) {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: { id: 'menu-test' } }))
  await page.route('**/rest/v1/mdm_material_category?*', (route) =>
    route.fulfill({
      json: [
        { id: 'category-parent', parent_id: null, category_code: 'B', category_name: '半成品' },
        {
          id: 'category-child',
          parent_id: 'category-parent',
          category_code: 'B01',
          category_name: childCategory
        }
      ]
    })
  )
  const categoryFilters: string[] = []
  await page.route('**/rest/v1/mdm_material?*', (route) => {
    const query = new URL(route.request().url()).searchParams
    categoryFilters.push(query.get('category_id') || '')
    return route.fulfill({
      json: materials.map((material) => ({
        id: `material-${material.code}`,
        tenant_id: '11111111-1111-4111-8111-111111111111',
        code: material.code,
        name: material.name,
        description: '分类与子分类回归',
        serial_management_enabled: false,
        inventory_unit_id: 'unit-test',
        base_unit_id: 'unit-test',
        unit_conversions: []
      })),
      headers: {
        'content-range': `0-${materials.length - 1}/${materials.length}`,
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-document-serials.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '打开采购单据', exact: true }).click()
  await page.getByRole('tab', { name: '物料明细', exact: true }).click()
  await page
    .locator('.el-drawer:visible')
    .getByRole('button', { name: '添加物料', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: '选择采购物料', exact: true })
  const navigation = dialog.locator('.art-data-select-dialog__navigation')
  await expect(navigation.getByText('物料分类', { exact: true })).toBeVisible()
  return { dialog, navigation, categoryFilters }
}

test('参选物料按分类及子分类筛选，已选面板保留选择', async ({ page }, testInfo) => {
  const { dialog, navigation, categoryFilters } = await openMaterialPicker(page)
  await dialog.locator('.el-table__body tr').first().locator('.el-checkbox').click()
  await expect(dialog.getByText(materialName, { exact: true })).toHaveCount(2)
  const category = navigation.locator('[role="treeitem"][data-key="category-parent"]')
  await navigation.locator('.art-data-select-dialog__navigation-all').focus()
  await page.keyboard.press('Tab')
  await expect(category).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  expect(categoryFilters).not.toContain('in.(category-parent,category-child)')
  await expect(category).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowRight')
  await expect(category).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Enter')
  await expect.poll(() => categoryFilters).toContain('in.(category-parent,category-child)')
  await expect(dialog.getByText(materialName, { exact: true })).toHaveCount(2)
  expect(await dialog.evaluate((node) => node.scrollWidth > node.clientWidth + 1)).toBe(false)
  await page.screenshot({
    path: testInfo.outputPath('material-three-panels.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.locator('.el-drawer:visible').getByText(materialName, { exact: true })
  ).toBeVisible()
})

test('参选物料可查看截断的分类全称，且不影响查询与已选物料', async ({ page }, info) => {
  const longName = '大型工程机械高压液压与耐磨传动系统核心组件及维修备件管理专用分类目录'
  const { dialog, navigation, categoryFilters } = await openMaterialPicker(page, {
    childCategory: longName
  })
  const categorySearch = navigation.getByRole('textbox', { name: '搜索物料分类', exact: true })
  await expect(categorySearch).toHaveAttribute('placeholder', '名称或编码')
  await expectInputTextUnclipped(categorySearch, 'placeholder')
  await dialog.locator('.el-table__body tr').first().locator('.el-checkbox').click()
  await expect(dialog.getByText(materialName, { exact: true })).toHaveCount(2)
  const beforePreview = [...categoryFilters]
  const shortCategory = navigation.locator('[role="treeitem"][data-key="category-parent"]')
  const longCategory = navigation.locator('[role="treeitem"][data-key="category-child"]')
  const truncatedName = longCategory.getByText(longName, { exact: true })
  await truncatedName.scrollIntoViewIfNeeded()
  const lengths = await truncatedName.evaluate((element) => ({
    text: element.scrollWidth,
    available: element.clientWidth
  }))
  expect(lengths.available, '分类文本实际占用宽度').toBeGreaterThan(0)
  expect(lengths.text, '测试分类长到足以触发截断').toBeGreaterThan(lengths.available)
  await info.attach('category-label-width', {
    body: JSON.stringify(lengths),
    contentType: 'application/json'
  })
  await dialog.screenshot({
    path: info.outputPath('category-truncated.png'),
    animations: 'disabled'
  })

  const preview = longCategory.getByRole('button', { name: '查看分类全称', exact: true })
  await expect(preview, '被截断的分类应有查看全称的操作').toBeVisible({ timeout: 4000 })
  await expect(
    shortCategory
      .locator('.el-tree-node__content')
      .first()
      .getByRole('button', { name: '查看分类全称' })
  ).toHaveCount(0)

  const tooltip = page.getByRole('tooltip').filter({ hasText: longName })
  if (info.project.use.hasTouch) await preview.tap()
  else {
    await navigation.locator('.art-data-select-dialog__navigation-all').focus()
    await page.keyboard.press('Tab')
    await expect(shortCategory).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(longCategory).toBeFocused()
  }
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText('B01')
  const fullName = tooltip.getByText(longName, { exact: true })
  await expect(fullName).toBeVisible()
  const viewportFits = await fullName.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    return [...range.getClientRects()].every(
      ({ left, right }) =>
        left >= 0 && right <= element.ownerDocument.documentElement.clientWidth + 1
    )
  })
  expect(viewportFits).toBe(true)
  await page.screenshot({ path: info.outputPath('category-full-name.png'), animations: 'disabled' })

  if (info.project.use.hasTouch) await preview.tap()
  else {
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(longCategory).toBeFocused()
  }
  await expect(tooltip).toBeHidden()
  expect(categoryFilters).toEqual(beforePreview)
  await expect(dialog.getByText(materialName, { exact: true })).toHaveCount(2)

  await longCategory.press('Enter')
  await expect
    .poll(() => categoryFilters.slice(beforePreview.length))
    .toEqual(['in.(category-child)'])
  await expect(dialog.getByText(materialName, { exact: true })).toHaveCount(2)
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.locator('.el-drawer:visible').getByText(materialName, { exact: true })
  ).toBeVisible()
})

test('已选物料可以核对完整名称和编码，查看与移除各自操作', async ({ page }, info) => {
  const material = {
    name: '高压液压传动系统快速检修与安全制动装置专用耐磨更换物料',
    code: 'WMS-HYDRAULIC-TRANSMISSION-REPLACEMENT-A001000098'
  }
  const { dialog, categoryFilters } = await openMaterialPicker(page, { materials: [material] })
  const checkbox = dialog.locator('.el-table__body tr').first().locator('.el-checkbox')
  await checkbox.click()
  const selected = dialog.locator('.art-data-select-dialog__selected-item')
  await expect(selected).toHaveCount(1)
  await selected.scrollIntoViewIfNeeded()
  const widths = await selected
    .locator('.art-data-select-dialog__selected-text')
    .evaluate((caption) =>
      [...caption.children].map((node) => [node.clientWidth, node.scrollWidth])
    )
  expect(widths).toHaveLength(2)
  for (const [available, required] of widths) expect(required).toBeGreaterThan(available)
  await info.attach('selected-caption-widths', {
    body: JSON.stringify(widths),
    contentType: 'application/json'
  })

  const preview = selected.getByRole('button', { name: /^查看 .* 完整信息$/ })
  const remove = selected.getByRole('button', { name: /^移除 / })
  await expect(preview).toBeVisible({ timeout: 4000 })
  const beforePreview = [...categoryFilters]
  if (info.project.use.hasTouch) await preview.tap()
  else {
    await dialog.getByRole('button', { name: '清空', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(preview).toBeFocused()
    await page.keyboard.press('Enter')
  }
  const tooltip = page.getByRole('tooltip').filter({ hasText: material.code })
  await expect(tooltip.getByText(material.name, { exact: true })).toBeVisible()
  await expect(tooltip.getByText(material.code, { exact: true })).toBeVisible()
  await expect(tooltip).toBeInViewport({ ratio: 1 })
  await expect(preview).toHaveAccessibleDescription(`${material.name} ${material.code}`)
  await page.screenshot({
    path: info.outputPath('selected-material-full-label.png'),
    animations: 'disabled'
  })

  if (info.project.use.hasTouch) await preview.tap()
  else {
    await page.keyboard.press('Escape')
    await expect(preview).toBeFocused()
  }
  await expect(tooltip).toBeHidden()
  await expect(preview).toHaveAccessibleDescription('')
  await expect(dialog).toBeVisible()
  await expect(selected).toHaveCount(1)
  expect(categoryFilters).toEqual(beforePreview)

  if (info.project.use.hasTouch) await remove.tap()
  else {
    await page.keyboard.press('Tab')
    await expect(remove).toBeFocused()
    await page.keyboard.press('Enter')
  }
  await expect(selected).toHaveCount(0)
  await expect(checkbox.getByRole('checkbox')).not.toBeChecked()
  expect(categoryFilters).toEqual(beforePreview)
  await checkbox.click()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(
    page.locator('.el-drawer:visible').getByText(material.name, { exact: true })
  ).toBeVisible()
})

test('键盘逐条移除同名物料，清空后回到可选区', async ({ page }, info) => {
  const name = '高压液压传动系统同规格采购更换物料目录记录'
  const codes = ['MAT-SAME-01', 'MAT-SAME-02', 'MAT-SAME-03']
  const { dialog, categoryFilters } = await openMaterialPicker(page, {
    materials: codes.map((code) => ({ name, code }))
  })
  const checkbox = (code: string) =>
    dialog.getByRole('row').filter({ hasText: code }).locator('label.el-checkbox')
  const selected = dialog.locator('.art-data-select-dialog__selected-item')
  const remove = (code: string) =>
    selected.filter({ hasText: code }).getByRole('button', {
      name: /^移除 /
    })
  const search = dialog.getByPlaceholder('搜索物料编码或描述')
  await expect(checkbox(codes[2])).toBeVisible()
  for (const code of codes) await checkbox(code).click()
  await expect(selected).toHaveCount(3)
  const initialQueries = [...categoryFilters]
  await info.attach('selected-actions-before-removal', {
    body: await dialog.locator('.art-data-select-dialog__selected').ariaSnapshot(),
    contentType: 'text/plain'
  })
  await remove(codes[1]).focus()
  await page.keyboard.press('Enter')
  await expect(selected).toHaveCount(2)
  await expect(checkbox(codes[1]).getByRole('checkbox')).not.toBeChecked()
  await expect(checkbox(codes[0]).getByRole('checkbox')).toBeChecked()
  await expect(checkbox(codes[2]).getByRole('checkbox')).toBeChecked()
  await expect(remove(codes[2])).toBeFocused({ timeout: 3000 })
  await expect(remove(codes[0])).toHaveAccessibleName(`移除 ${name} · ${codes[0]}`)
  await expect(remove(codes[2])).toHaveAccessibleName(`移除 ${name} · ${codes[2]}`)
  for (const code of [codes[0], codes[2]]) {
    await expect(
      selected.getByRole('button', { name: `查看 ${name} · ${code} 完整信息`, exact: true })
    ).toBeVisible()
  }

  await page.keyboard.press('Space')
  await expect(remove(codes[0])).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(search).toBeFocused()
  await expect(search).toBeInViewport({ ratio: 1 })
  await expect(selected).toHaveCount(0)

  for (const code of codes.slice(0, 2)) await checkbox(code).click()
  await expect(selected).toHaveCount(2)
  await dialog.getByRole('button', { name: '清空', exact: true }).focus()
  await page.keyboard.press('Space')
  await expect(search).toBeFocused()
  await expect(search).toBeInViewport({ ratio: 1 })
  await expect(selected).toHaveCount(0)
  await expect(dialog.getByRole('status').filter({ hasText: /^当前已选择/ })).toHaveText(
    '当前已选择 0 项'
  )
  await page.screenshot({
    path: info.outputPath('keyboard-focus-after-clear.png'),
    animations: 'disabled'
  })
  for (const code of codes) await expect(checkbox(code).getByRole('checkbox')).not.toBeChecked()
  expect(categoryFilters).toEqual(initialQueries)

  await search.fill(codes[0])
  await search.dispatchEvent('keydown', { key: 'Enter', isComposing: true })
  expect(categoryFilters).toEqual(initialQueries)
  await search.press('Enter')
  await expect.poll(() => categoryFilters.length).toBe(initialQueries.length + 1)
})
