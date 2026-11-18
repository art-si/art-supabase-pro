import { expect, test } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const theme of ['light', 'dark'] as const) {
  for (const boxBorderMode of [false, true]) {
    const boxMode = boxBorderMode ? 'border' : 'shadow'
    test(`客户共享分栏 ${theme} ${boxMode} 保留卡片绘制余量和交互`, async ({ page }, info) => {
      const errors: string[] = []
      const groupFilters: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await prepareAppearance(page, { theme, boxBorderMode })
      await page.route('**/rest/v1/**', (route) => {
        const url = new URL(route.request().url())
        const isGroup = url.pathname.endsWith('/mdm_master_group')
        if (!isGroup) groupFilters.push(`${url.search} ${route.request().postData() ?? ''}`)
        return route.fulfill({
          json: isGroup
            ? Array.from({ length: 24 }, (_, index) => ({
                id: index === 0 ? 'group-test' : `group-${index}`,
                parent_id: null,
                code: `GRP-${index}`,
                name: index === 0 ? '业务测试分组' : `其他分组 ${index}`,
                enabled: true,
                sort: index
              }))
            : url.pathname.endsWith('/tms_list_customers_secure')
              ? { records: [], total: 0, fieldAccess: {} }
              : [],
          headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
        })
      })
      await page.goto('/tests/e2e/fixtures/master-group-reuse.html?mode=customer')
      await assertAppearance(page, { theme, boxBorderMode })
      await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
      const panel = page.locator('.master-group-panel')
      const splitter = page.locator('.art-workspace-splitter')
      const mobile = (page.viewportSize()?.width ?? 1440) <= 900
      await expect(panel).toBeVisible()
      await expect(page.locator('.art-table-query .el-table')).toBeVisible()
      if (mobile) {
        await expect(splitter).toHaveClass(/is-stacked/)
        await expect(splitter.locator('.el-splitter-bar')).toBeHidden()
        await panel.getByRole('button', { name: '展开分组', exact: true }).click()
      }
      await expect(panel).toContainText('24 个分组节点')
      if (!mobile) {
        const primary = splitter.locator(':scope > .el-splitter-panel').first()
        await expect
          .poll(async () => (await primary.boundingBox())!.width)
          .toBeGreaterThanOrEqual(250)
        await expect.poll(async () => (await primary.boundingBox())!.width).toBeLessThanOrEqual(360)
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      await page.screenshot({
        path: info.outputPath(`customer-${theme}-${boxMode}.png`),
        fullPage: true,
        animations: 'disabled'
      })

      const assertCardClearance = async (stage: string) => {
        for (const selector of [
          '.master-group-panel',
          '.art-table-query__search-scrollbar',
          '.art-table-card'
        ]) {
          const card = page.locator(selector)
          await expect(card).toHaveCount(1)
          if (!(await card.isVisible())) continue
          if (boxBorderMode) await expect(card).toHaveCSS('box-shadow', 'none')
          else await expect(card).not.toHaveCSS('box-shadow', 'none')
          const clipping = await card.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const ancestors: {
              ancestor: string
              left?: number
              right?: number
              top?: number
              bottom?: number
            }[] = []
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
              const style = getComputedStyle(parent)
              const clipsX = /^(hidden|clip|auto|scroll)$/.test(style.overflowX)
              const clipsY = /^(hidden|clip|auto|scroll)$/.test(style.overflowY)
              if (!clipsX && !clipsY) continue
              const rect = parent.getBoundingClientRect()
              const clipMargin = Number.parseFloat(style.overflowClipMargin) || 0
              const marginX = style.overflowX === 'clip' ? clipMargin : 0
              const marginY = style.overflowY === 'clip' ? clipMargin : 0
              const left = rect.left + parent.clientLeft
              const top = rect.top + parent.clientTop
              ancestors.push({
                ancestor: `${parent.tagName.toLowerCase()}.${[...parent.classList].join('.')}`,
                ...(clipsX
                  ? {
                      left: bounds.left - left + marginX,
                      right: left + parent.clientWidth - bounds.right + marginX
                    }
                  : {}),
                ...(clipsY
                  ? {
                      top: bounds.top - top + marginY,
                      bottom: top + parent.clientHeight - bounds.bottom + marginY
                    }
                  : {})
              })
            }
            return ancestors
          })
          await info.attach(`${stage}-${selector}-clip-boundaries`, {
            body: JSON.stringify(clipping, null, 2),
            contentType: 'application/json'
          })
          for (const { ancestor, ...edges } of clipping) {
            for (const [edge, clearance] of Object.entries(edges)) {
              expect
                .soft(clearance, `${stage} ${selector} 在 ${ancestor} 的 ${edge} 绘制余量`)
                .toBeGreaterThanOrEqual(6)
            }
          }
        }
      }
      await assertCardClearance('normal')
      const search = panel.getByRole('textbox', { name: '搜索分组', exact: true })
      await search.fill('业务测试分组')
      const node = panel.getByRole('treeitem').filter({ hasText: '业务测试分组' })
      await expect(node).toBeVisible()
      await node.press('Enter')
      await expect
        .poll(() => groupFilters.some((filter) => filter.includes('group-test')))
        .toBe(true)
      await search.clear()
      const treeScroll = panel.locator('.art-section-card__scrollbar > .el-scrollbar__wrap')
      expect(
        await treeScroll.evaluate((element) => element.scrollHeight - element.clientHeight)
      ).toBeGreaterThan(0)
      if (mobile) await panel.getByRole('button', { name: '收起分组', exact: true }).click()
      await assertTableFocusContract(page, info, ['.master-group-panel'])
      await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
      await expect(page.locator('.art-table-query')).toHaveClass(/is-focus-mode/)
      await expect(panel).toBeVisible()
      await expect(page.locator('.art-table-query__search-scrollbar')).toBeVisible()
      await expect(page.locator('.art-table-card')).toBeVisible()
      await expect(page.getByRole('button', { name: '退出专注模式', exact: true })).toBeInViewport()
      await page.screenshot({
        path: info.outputPath(`customer-${theme}-${boxMode}-focus.png`),
        fullPage: true,
        animations: 'disabled'
      })
      await assertCardClearance('focus')
      await page.keyboard.press('Escape')
      await expect(page.locator('.art-table-query')).not.toHaveClass(/is-focus-mode/)

      if (!mobile) {
        const primary = splitter.locator(':scope > .el-splitter-panel').first()
        const beforeWidth = (await primary.boundingBox())!.width
        const grip = splitter.locator('.el-splitter-bar__dragger')
        const handle = (await grip.boundingBox())!
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
        await page.mouse.down()
        await page.mouse.move(handle.x + handle.width / 2 + 32, handle.y + handle.height / 2)
        await page.mouse.up()
        await expect
          .poll(async () => (await primary.boundingBox())!.width)
          .toBeGreaterThan(beforeWidth + 20)
        await grip.hover()
        await splitter.locator('.el-splitter-bar__horizontal-collapse-icon-start').click()
        await expect.poll(async () => (await primary.boundingBox())!.width).toBeLessThanOrEqual(1)
        await page.screenshot({
          path: info.outputPath('customer-collapsed.png'),
          animations: 'disabled'
        })
        await grip.hover()
        await splitter.locator('.el-splitter-bar__horizontal-collapse-icon-end').click()
        await expect.poll(async () => (await primary.boundingBox())!.width).toBeGreaterThan(240)
      }
      await page.screenshot({
        path: info.outputPath(`customer-${theme}-${boxMode}-restored.png`),
        fullPage: true,
        animations: 'disabled'
      })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      expect(errors).toEqual([])
    })
  }
}

for (const mode of ['supplier', 'project', 'route', 'customer', 'cargo']) {
  test(`${mode}公共分组布局保留筛选和专注工作区`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const groupFilters: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      if (!url.pathname.endsWith('/mdm_master_group')) {
        groupFilters.push(`${url.search} ${route.request().postData() ?? ''}`)
      }
      return route.fulfill({
        json: url.pathname.endsWith('/mdm_master_group')
          ? [
              {
                id: 'group-test',
                parent_id: null,
                code: 'GRP-001',
                name: '业务测试分组',
                enabled: true,
                sort: 0
              }
            ]
          : url.pathname.endsWith('/tms_list_customers_secure')
            ? { records: [], total: 0, fieldAccess: {} }
            : [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto(`/tests/e2e/fixtures/master-group-reuse.html?mode=${mode}`)
    const panel = page.locator('.master-group-panel')
    await expect(panel).toBeVisible()
    await expect(page.locator('.art-table-query')).toBeVisible()
    const mobile = (page.viewportSize()?.width ?? 1440) <= 900
    if (mobile) {
      await expect(panel.getByRole('button', { name: '展开分组', exact: true })).toHaveAttribute(
        'aria-expanded',
        'false'
      )
      await expect(panel.getByRole('textbox', { name: '搜索分组', exact: true })).toBeHidden()
      expect((await panel.boundingBox())?.height ?? Infinity).toBeLessThan(130)
      const primary = page.locator('.art-workspace-splitter__primary')
      expect((await primary.boundingBox())?.height ?? 0).toBeCloseTo(
        (await panel.boundingBox())?.height ?? -1,
        0
      )
      await panel.getByRole('button', { name: '展开分组', exact: true }).click()
    }
    const node = panel.getByRole('treeitem').filter({ hasText: '业务测试分组' })
    await expect(node).toBeVisible()
    await node.press('Enter')
    await expect.poll(() => groupFilters.some((filter) => filter.includes('group-test'))).toBe(true)
    if (mobile) {
      await expect(panel).toContainText('当前：业务测试分组')
      await panel.getByRole('button', { name: '收起分组', exact: true }).click()
    }
    await assertTableFocusContract(page, info, ['.master-group-panel'])
    await page.screenshot({ path: info.outputPath('workspace.png'), animations: 'disabled' })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`公共分组 ${theme} ${box} 状态、键盘和管理动作`, async ({ page }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto('/tests/e2e/fixtures/master-group-reuse.html')
      await page.evaluate(
        ({ theme, box }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.documentElement.dataset.boxMode = box
        },
        { theme, box }
      )
      const panel = page.locator('.master-group-panel')
      const mobile = (page.viewportSize()?.width ?? 1440) <= 900
      if (mobile) {
        const expand = panel.getByRole('button', { name: '展开分组', exact: true })
        await expand.focus()
        await page.keyboard.press('Enter')
        await expect(panel.getByRole('button', { name: '收起分组', exact: true })).toHaveAttribute(
          'aria-expanded',
          'true'
        )
      }
      await panel.getByRole('textbox', { name: '搜索分组', exact: true }).fill('下级测试')
      const node = panel.getByRole('treeitem').filter({ hasText: '下级测试分组' }).last()
      await expect(node).toBeVisible()
      await node.locator('.el-tree-node__content').click()
      if (mobile) {
        await panel.getByRole('button', { name: '收起分组', exact: true }).click()
        await expect(panel).toContainText('当前：下级测试分组')
        await panel.getByRole('button', { name: '展开分组', exact: true }).click()
        await expect(panel.getByRole('textbox', { name: '搜索分组', exact: true })).toHaveValue(
          '下级测试'
        )
        await expect(node).toBeVisible()
      }
      await node.getByRole('button', { name: '更多操作', exact: true }).press('Enter')
      await page.getByRole('menuitem', { name: '编辑分组', exact: true }).click()
      await expect(page.getByTestId('group-action')).toHaveText('编辑：下级测试分组')
      await node.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '新增下级分组', exact: true }).click()
      await expect(page.getByTestId('group-action')).toHaveText('新增下级：下级测试分组')
      await node.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '删除分组', exact: true }).click()
      await expect(page.getByTestId('group-action')).toHaveText('删除：下级测试分组')
      await panel.getByRole('button', { name: '新增分组', exact: true }).click()
      await expect(page.getByTestId('group-action')).toHaveText('新增分组')
      await page.getByRole('button', { name: '只读切换', exact: true }).click()
      await expect(panel.getByRole('button', { name: '编辑分组', exact: true })).toHaveCount(0)
      await expect(panel.getByRole('button', { name: '更多操作', exact: true })).toHaveCount(0)
      await expect(panel.getByRole('button', { name: '新增分组', exact: true })).toHaveCount(0)
      await panel.getByRole('textbox', { name: '搜索分组', exact: true }).fill('')
      const allGroupsButton = panel.getByRole('button', { name: /全部分组/ })
      await allGroupsButton.click()
      expect(
        await allGroupsButton.locator(':scope > span:first-child').evaluate((icon) => {
          const style = getComputedStyle(icon)
          return [style.display, style.width, style.height]
        })
      ).toEqual(['grid', '36px', '36px'])
      await page.screenshot({ path: info.outputPath('panel-success.png'), animations: 'disabled' })
      expect((await panel.boundingBox())?.height ?? Infinity).toBeLessThanOrEqual(
        mobile ? 440 : 520
      )
      const treeScroll = panel.locator('.art-section-card__scrollbar > .el-scrollbar__wrap')
      expect(
        await treeScroll.evaluate((element) => element.scrollHeight - element.clientHeight)
      ).toBeGreaterThan(0)
      await panel.getByRole('treeitem').filter({ hasText: '测试分组 23' }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: info.outputPath('panel-lower.png'), animations: 'disabled' })

      const groupSearch = panel.getByRole('textbox', { name: '搜索分组', exact: true })
      const unrelatedGroup = panel.getByText('测试分组 23', { exact: true })
      await groupSearch.fill('G01')
      await expect(node).toBeVisible()
      await expect(unrelatedGroup).toBeHidden()
      await page.getByRole('button', { name: 'error', exact: true }).click()
      await expect(panel.getByText('分组服务暂不可用，请重试', { exact: true })).toBeVisible()
      await panel.getByRole('button', { name: '重新加载', exact: true }).click()
      await expect(groupSearch).toHaveValue('G01')
      await expect(node).toBeVisible()
      await expect(unrelatedGroup).toBeHidden()
      await page.screenshot({
        path: info.outputPath('panel-filter-retry.png'),
        animations: 'disabled'
      })
      await groupSearch.clear()
      await expect(unrelatedGroup).toBeVisible()
      await page.getByRole('button', { name: 'loading', exact: true }).click()
      await expect(panel).toHaveAttribute('aria-busy', 'true')
      await page.getByRole('button', { name: 'empty', exact: true }).click()
      await expect(panel.getByText('尚未建立分组', { exact: true })).toBeVisible()
      if (mobile) {
        await panel.getByRole('button', { name: '收起分组', exact: true }).click()
        await expect(panel.getByText('尚未建立分组', { exact: true })).toBeHidden()
        await page.getByRole('button', { name: 'error', exact: true }).click()
        await expect(panel).toContainText('分组加载失败，请刷新重试')
        await panel.getByRole('button', { name: '刷新分组', exact: true }).click()
        await expect(panel).toContainText('当前：全部分组')
      }
      await page.screenshot({ path: info.outputPath('panel-state.png'), animations: 'disabled' })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      expect(errors).toEqual([])
    })
  }
}
