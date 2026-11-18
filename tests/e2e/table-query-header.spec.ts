import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('窄屏表格设置可直接用键盘进入并返回触发按钮', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/tests/e2e/fixtures/table-query-header.html?toolbar')
  const toolbar = page.locator('.art-table-header')
  const columns = toolbar.getByRole('button', { name: '设置显示列', exact: true })
  const display = toolbar.getByRole('button', { name: '表格显示设置', exact: true })
  const presets = page.getByRole('group', { name: '列显示预设' })
  const zebra = page.getByRole('checkbox', { name: /斑马纹|Zebra/i })

  await columns.focus()
  await page.keyboard.press('Enter')
  const columnsPopup = page.getByRole('dialog', { name: '设置显示列', exact: true })
  await expect(columnsPopup).toBeVisible()
  await expect(columns).toHaveAttribute('aria-expanded', 'true')
  await expect(presets.getByRole('button', { name: '精简视图' })).toBeFocused()
  const fullPreset = presets.getByRole('button', { name: '完整视图' })
  await expect(fullPreset).toHaveAttribute('aria-pressed', 'true')
  const activeShadow = await fullPreset.evaluate((button) => getComputedStyle(button).boxShadow)
  await page.keyboard.press('Tab')
  await expect(fullPreset).toBeFocused()
  await expect
    .poll(() => fullPreset.evaluate((button) => getComputedStyle(button).boxShadow))
    .not.toBe(activeShadow)
  const bounds = await columnsPopup.boundingBox()
  if (!bounds) throw new Error('列设置未显示')
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('column-popover-320.png') })
  await page.keyboard.press('Escape')
  await expect(presets).toBeHidden()
  await expect(columns).toHaveAttribute('aria-expanded', 'false')
  await expect(columns).toBeFocused()

  await display.focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('dialog', { name: '表格显示设置', exact: true })).toBeVisible()
  await expect(zebra).toBeFocused()
  const wasStriped = await zebra.isChecked()
  await page.keyboard.press('Space')
  expect(await zebra.isChecked()).toBe(!wasStriped)
  await page.keyboard.press('Escape')
  await expect(zebra).toBeHidden()
  await expect(display).toBeFocused()
})

test('表格密度菜单显示当前选项并可用键盘切换', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/e2e/fixtures/table-query-header.html?toolbar', {
    waitUntil: 'domcontentloaded'
  })
  const toolbar = page.locator('.art-table-header')
  const trigger = toolbar.getByRole('button', { name: '调整表格密度', exact: true })
  const compact = page.getByRole('menuitem', { name: /^(紧凑|Compact)$/ })
  const defaults = page.getByRole('menuitem', { name: /^(默认|Default)$/ })
  const menu = page.getByRole('menu').filter({ has: compact })

  await trigger.press('Enter')
  await expect(defaults).toHaveAttribute('aria-current', 'true')
  await expect(menu.locator(':scope > li[role="menuitem"]')).toHaveCount(3)
  await expect(compact).not.toHaveAttribute('aria-current', 'true')
  await expect(compact).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
  await expect(page.locator('.art-table-query .el-table')).toHaveClass(/el-table--small/)

  await trigger.press('Enter')
  await expect(menu.locator('[aria-current="true"]')).toHaveCount(1)
  await expect(compact).toHaveAttribute('aria-current', 'true')
  await expect(compact.locator('.art-svg-icon[aria-hidden="true"]')).toBeVisible()
  await page.screenshot({ path: info.outputPath('table-density-current-390-light.png') })
  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    document.documentElement.dataset.uiScope = 'workspace'
    document.documentElement.dataset.boxMode = 'shadow-mode'
  })
  await page.screenshot({ path: info.outputPath('table-density-current-390-dark.png') })
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('键盘刷新结束后恢复焦点，之后的查询只显示查询反馈', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/tests/e2e/fixtures/table-query-header.html?toolbar')
  const refresh = page.getByRole('button', { name: '刷新表格', exact: true })
  const search = page.getByRole('button', { name: '查询', exact: true })
  const finish = page.getByRole('button', { name: '完成表格请求', exact: true })
  const releaseRequest = () => finish.evaluate((button: HTMLButtonElement) => button.click())

  await refresh.focus()
  await page.keyboard.press('Enter')
  await expect(refresh).toHaveAttribute('aria-busy', 'true')
  await expect(refresh).toBeDisabled()
  await releaseRequest()
  await expect(refresh).toBeEnabled()
  await expect(refresh).toBeFocused()

  await search.click()
  await expect(search).toBeDisabled()
  await expect(refresh).not.toHaveAttribute('aria-busy', 'true')
  await releaseRequest()
  await expect(search).toBeEnabled()

  await refresh.focus()
  await page.keyboard.press('Space')
  await expect(refresh).toBeDisabled()
  await finish.focus()
  await page.keyboard.press('Enter')
  await expect(refresh).toBeEnabled()
  await expect(finish).toBeFocused()
})

test('键盘取消选择后回到虚拟表格当前页全选框', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/table-query-header.html?virtual-selection')
  const table = page.locator('.art-table.is-virtual-render')
  const selectAll = table.getByRole('checkbox', {
    name: '选择当前页全部行',
    exact: true
  })
  await selectAll.focus()
  await page.keyboard.press('Space')
  await expect(selectAll).toBeChecked()
  const clear = page.getByRole('button', { name: '取消选择', exact: true })
  await clear.focus()
  await page.keyboard.press('Space')
  await expect(clear).toHaveCount(0)
  await expect(selectAll).not.toBeChecked()
  await expect(selectAll).toBeFocused()
  await page.keyboard.press('Space')
  await expect(selectAll).toBeChecked()
})

test('窄屏列过滤可用键盘搜索完整选项并返回触发按钮', async ({ page }, info) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 320, height: 760 })
  await page.goto('/tests/e2e/fixtures/table-query-header.html?column-filter', {
    waitUntil: 'commit'
  })
  const rows = page.locator('.el-table__body-wrapper tbody tr')
  const trigger = page.getByRole('button', { name: '编码过滤', exact: true })
  const search = page.getByRole('textbox', { name: '编码选项搜索', exact: true })
  await expect(rows).toHaveCount(2, { timeout: 45_000 })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(search).toBeVisible()
  await expect.soft(search).toBeFocused()
  await search.focus()
  await page.keyboard.press('Escape')
  await expect(search).toBeHidden()
  await expect.soft(trigger).toBeFocused()

  await trigger.focus()
  await page.keyboard.press('Space')
  await search.fill('CONNECT-B')
  const option = page.getByRole('checkbox', { name: /CONNECT-B$/ })
  await expect(page.getByRole('checkbox', { name: /CONNECT-A$/ })).toHaveCount(0)
  await option.focus()
  await page.keyboard.press('Space')
  await expect(option).toBeChecked()
  const panel = page.getByRole('dialog', { name: '编码过滤', exact: true })
  const selectAll = panel.getByRole('checkbox', { name: '全选当前选项', exact: true })
  const matchStatus = panel.getByRole('status')
  await expect(selectAll).toBeChecked()
  await search.fill('NO-MATCH')
  await expect(matchStatus).toHaveText('暂无匹配选项')
  await expect(matchStatus).toBeVisible()
  await expect(selectAll).toBeDisabled()
  await panel.screenshot({ path: info.outputPath('column-filter-no-matches-320.png') })
  await search.fill('CONNECT-B')
  await expect(matchStatus).toBeEmpty()
  await expect(selectAll).toBeEnabled()
  await expect(option).toBeChecked()
  const optionLabel = panel.locator('[title$="CONNECT-B"]')
  await expect(optionLabel).toHaveCSS('white-space', 'nowrap')
  const labelBounds = await optionLabel.evaluate((label) => ({
    left: label.getBoundingClientRect().left,
    right: label.getBoundingClientRect().right,
    clipRight: label.closest('.el-scrollbar__wrap')?.getBoundingClientRect().right ?? 0,
    available: label.clientWidth,
    fullWidth: label.scrollWidth
  }))
  expect(labelBounds.left).toBeGreaterThanOrEqual(0)
  expect(labelBounds.right).toBeLessThanOrEqual(labelBounds.clipRight + 1)
  expect(labelBounds.fullWidth).toBeGreaterThan(labelBounds.available)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.screenshot({ path: info.outputPath('column-filter-keyboard-320.png') })
  await page.getByRole('button', { name: '应用过滤', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('业务记录 B')
  await expect.soft(trigger).toBeFocused()
})

test('窄屏固定卡片的虚拟表格分页始终可以操作', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 760 })
  for (const mode of ['fixed', 'flow']) {
    const params = mode === 'fixed' ? 'virtual-selection' : 'virtual-selection&table-flow'
    await page.goto(`/tests/e2e/fixtures/table-query-header.html?${params}`, {
      waitUntil: 'commit'
    })
    const jump = page.locator('.art-table.is-virtual-render .el-pagination__jump input')
    await expect(jump).toBeVisible({ timeout: 45_000 })
    const insideCard = () =>
      jump.evaluate((input) => {
        const card = input.closest('.art-table-card')?.getBoundingClientRect()
        if (!card) return false
        const rect = input.getBoundingClientRect()
        return (
          rect.bottom <= card.bottom &&
          input.contains(
            document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          )
        )
      })
    await expect.poll(insideCard).toBe(true)
    await jump.click()
    await expect(jump).toBeFocused()
    await page.screenshot({ path: info.outputPath(`virtual-pagination-${mode}.png`) })
  }
})

for (const { width, mode } of [
  { width: 320, mode: 'native' },
  { width: 390, mode: 'virtual' }
]) {
  test(`用键盘清空列过滤后回到表头 ${mode}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 760 })
    const params = mode === 'virtual' ? 'column-filter&virtual-selection' : 'column-filter'
    await page.goto(`/tests/e2e/fixtures/table-query-header.html?${params}`, {
      waitUntil: 'commit'
    })
    await expect(page.locator('.art-table.is-virtual-render')).toHaveCount(
      mode === 'virtual' ? 1 : 0
    )
    const trigger = page.getByRole('button', { name: '编码过滤', exact: true })
    await expect(trigger).toBeVisible({ timeout: 45_000 })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const search = page.getByRole('textbox', { name: '编码选项搜索', exact: true })
    await search.fill('CONNECT-B')
    const selectVisible = page.getByRole('checkbox', { name: '全选当前选项' })
    await selectVisible.focus()
    await page.keyboard.press('Space')
    const apply = page.getByRole('button', { name: '应用过滤', exact: true })
    await apply.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('业务记录 A', { exact: true })).toHaveCount(0)
    await expect(page.getByText('业务记录 B', { exact: true })).toBeVisible()

    const clear = page.getByRole('button', { name: '清空列过滤', exact: true })
    await clear.focus()
    await page.keyboard.press('Enter')
    await expect(clear).toBeHidden()
    await expect(page.getByText('业务记录 A', { exact: true })).toBeVisible()
    await expect(trigger).toBeFocused()
    await expect(trigger).toBeInViewport()
    await page.screenshot({ path: info.outputPath(`clear-column-filter-${mode}.png`) })
    await page.keyboard.press('Space')
    await expect(search).toBeFocused()
  })
}

for (const cache of [false, true])
  for (const empty of [false, true])
    test(`顶部区域高度变化与重新挂载保持表格边界：缓存 ${cache} 空数据 ${empty}`, async ({
      page
    }, testInfo) => {
      await page.goto(
        `/tests/e2e/fixtures/table-query-header.html?${cache ? 'cache&' : ''}${empty ? 'empty' : ''}`
      )
      const table = page.locator('.art-table')
      await expect(
        page.getByText(empty ? '暂无验收记录' : '验收记录', { exact: true })
      ).toBeVisible()
      if (!empty) await expect(page.locator('.el-pagination')).toBeVisible()
      const initialHeight = await table.evaluate(
        (element) => element.getBoundingClientRect().height
      )
      await page.getByRole('button', { name: '切换顶部高度' }).click()
      await expect
        .poll(() => table.evaluate((element) => element.getBoundingClientRect().height))
        .toBeLessThan(initialHeight - 70)
      if (cache)
        await page.locator('.art-table-query').evaluate((element) => {
          element.setAttribute('data-cache-marker', 'retained')
        })
      await page.getByRole('button', { name: '切换表格挂载' }).click()
      await expect(table).toHaveCount(0)
      await page.getByRole('button', { name: '切换表格挂载' }).click()
      await expect(
        page.getByText(empty ? '暂无验收记录' : '验收记录', { exact: true })
      ).toBeVisible()
      if (cache)
        await expect(page.locator('.art-table-query')).toHaveAttribute(
          'data-cache-marker',
          'retained'
        )
      await page.getByRole('button', { name: '切换顶部高度' }).click()
      await expect
        .poll(() => table.evaluate((element) => element.getBoundingClientRect().height))
        .toBeCloseTo(initialHeight, 0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        testInfo.project.use.viewport!.width
      )
      await page.screenshot({
        path: testInfo.outputPath('header-region.png'),
        animations: 'disabled'
      })
    })
