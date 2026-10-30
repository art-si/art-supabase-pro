import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('时间线和审批板共享完整的 Unicode 头像且保留各自空名称占位', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/avatar-reuse.html', { waitUntil: 'domcontentloaded' })
  const timeline = page.locator('.art-process-timeline__avatar')
  const board = page.locator('.workflow-task-board__avatar')
  await expect(timeline).toHaveText(['张三', 'JD', '👩‍🔧S', '🇨🇳李', '?'])
  await expect(board).toHaveText(['张三', 'JD', '👩‍🔧S', '🇨🇳李', '待'])
  await expect(page.locator('.art-process-timeline__actor time').first()).toHaveText(
    '2026-10-10 09:15:00'
  )
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  )
  expect(overflow).toBe(false)
  await page.screenshot({ path: test.info().outputPath('shared-avatar.png'), fullPage: true })
  await page.getByRole('button', { name: '切换空状态' }).click()
  await expect(page.getByText('暂无处理记录', { exact: true })).toBeVisible()
  await expect(page.getByText('流程尚未生成审批任务', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '恢复记录' }).click()
  await expect(board).toHaveCount(5)
  expect(errors).toEqual([])
})

for (const theme of ['light', 'dark']) {
  test(`审批分组保留同序数字节点、特殊键与任务状态 ${theme}`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto(`/tests/e2e/fixtures/avatar-reuse.html?grouping&theme=${theme}`)
    const groups = page.locator('.workflow-task-board__group')
    await expect(groups.locator('.workflow-task-board__identity strong')).toHaveText([
      '节点十',
      '节点二',
      '特殊节点'
    ])
    await expect(groups.first().locator('.workflow-task-board__member-heading strong')).toHaveText([
      '十甲',
      '十乙'
    ])
    await expect(groups.first().locator('.workflow-task-board__progress strong')).toHaveText('1/2')
    const node = (id: string) => page.locator(`.vue-flow__node[data-id="${id}"]`)
    await expect(node('10').locator('.workflow-flow-map__node')).toHaveClass(/is-current/)
    await expect(node('2').locator('.workflow-flow-map__node')).toHaveClass(/is-approved/)
    await expect(node('__proto__').locator('.workflow-flow-map__node')).toHaveClass(/is-rejected/)
    await expect(node('constructor').locator('.workflow-flow-map__node')).toHaveClass(/is-waiting/)
    await expect(page.getByRole('complementary', { name: '审批节点详情' })).toContainText(
      '十甲、十乙'
    )
    await page.screenshot({
      path: testInfo.outputPath(`workflow-groups-${theme}.png`),
      fullPage: true
    })
    await page.getByRole('button', { name: '切换空状态' }).click()
    await expect(page.getByText('流程尚未生成审批任务', { exact: true })).toBeVisible()
    await expect(node('constructor').locator('.workflow-flow-map__node')).toHaveClass(/is-waiting/)
    await page.getByRole('button', { name: '恢复记录' }).click()
    await expect(groups).toHaveCount(3)
    expect(errors).toEqual([])
  })
}

for (const { theme, box, width, compact } of [
  { theme: 'light', box: 'border', width: 1440, compact: false },
  { theme: 'light', box: 'shadow', width: 1440, compact: false },
  { theme: 'dark', box: 'border', width: 1440, compact: false },
  { theme: 'dark', box: 'shadow', width: 1440, compact: false },
  { theme: 'light', box: 'border', width: 570, compact: true },
  { theme: 'dark', box: 'shadow', width: 570, compact: true }
]) {
  test(`审批流程缩略图不遮挡节点 ${theme} ${box} ${width}`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto(
      `/tests/e2e/fixtures/avatar-reuse.html?grouping&theme=${theme}&box=${box}${compact ? '&compact' : ''}`
    )
    const canvas = page.locator('.workflow-flow-map__canvas')
    const minimap = canvas.locator('.vue-flow__minimap')
    await expect(minimap).toBeVisible()
    await expect(page.locator('.vue-flow__node[data-id="workflow-end"]')).toBeVisible()
    await expect(page.getByRole('complementary', { name: '审批节点详情' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-box-mode', `${box}-mode`)
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/)

    const appearance = await page
      .locator('.workflow-flow-map__node.is-selected')
      .evaluate((node) => ({
        shadow: getComputedStyle(node).boxShadow,
        border: getComputedStyle(node).borderTopColor,
        theme: getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim(),
        colorScheme: getComputedStyle(document.documentElement).colorScheme
      }))
    expect(appearance.shadow).not.toBe('none')
    expect(appearance.shadow.includes('inset')).toBe(box === 'border')
    expect(appearance.border === 'rgba(0, 0, 0, 0)').toBe(box === 'shadow')
    expect(appearance.colorScheme).toBe(theme)

    const geometry = await canvas.evaluate((element) => {
      const map = element.querySelector('.vue-flow__minimap')?.getBoundingClientRect()
      const bounds = element.getBoundingClientRect()
      const nodes = Array.from(element.querySelectorAll('.vue-flow__node')).map((node) => ({
        id: node.getAttribute('data-id'),
        rect: node.getBoundingClientRect()
      }))
      if (!map) throw new Error('MiniMap 未渲染')
      const overlap = (a: DOMRect, b: DOMRect) =>
        Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
        Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      return {
        map: { width: map.width, height: map.height },
        withinCanvas:
          map.left >= bounds.left &&
          map.top >= bounds.top &&
          map.right <= bounds.right &&
          map.bottom <= bounds.bottom,
        overlappingNodes: nodes
          .filter(({ rect }) => overlap(rect, bounds) > 0 && overlap(rect, map) > 0)
          .map(({ id }) => id)
      }
    })
    expect(geometry.map.width).toBeLessThanOrEqual(142)
    expect(geometry.map.height).toBeLessThanOrEqual(72)
    expect(geometry.withinCanvas).toBe(true)
    expect(geometry.overlappingNodes).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.screenshot({
      path: testInfo.outputPath(`workflow-minimap-${theme}-${box}-${width}.png`),
      fullPage: true
    })
    expect(errors).toEqual([])
  })
}
