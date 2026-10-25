import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)
for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    for (const generic of [false, true]) {
      test(`${generic ? '公共卡片' : 'BOM组件类型'}头部和排序布局 ${theme} ${box}`, async ({
        page
      }, info) => {
        await prepareIsolatedSession(page)
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.route('**/rest/v1/**', (route) => {
          const path = new URL(route.request().url()).pathname
          const json = path.endsWith('/mdm_master_group')
            ? [
                {
                  id: 'group-test',
                  tenant_id: 'test-tenant',
                  code: 'TEST',
                  name: '测试行业',
                  sort: 1,
                  enabled: true
                }
              ]
            : path.endsWith('/mdm_component_type')
              ? [
                  {
                    id: 'type-test',
                    tenant_id: 'test-tenant',
                    component_type_code: 'TEST-TYPE',
                    component_type_name: '测试组件',
                    sort_order: 10,
                    enabled: true,
                    group: { id: 'group-test', name: '测试行业' }
                  }
                ]
              : []
          return route.fulfill({
            json,
            headers: {
              'content-range': path.endsWith('/mdm_component_type') ? '0-0/1' : '*/0',
              'access-control-expose-headers': 'content-range'
            }
          })
        })
        await page.goto(
          `/tests/e2e/fixtures/card-sort-layout.html?theme=${theme}&box=${box}${generic ? '&generic=1' : ''}`
        )
        const cards = generic
          ? page.locator('.art-section-card')
          : page.locator('.component-type-page__navigation')
        await expect(cards.first()).toBeVisible()
        if (generic) await expect(cards).toHaveCount(4)
        if (generic) {
          const accountSelect = page.locator('.accounting-readiness-panel__account-set')
          await expect(accountSelect).toContainText('选择核算账套')
          expect((await accountSelect.boundingBox())!.width).toBeGreaterThanOrEqual(240)
          const summaryAside = page.locator('.art-entity-summary__aside')
          const asideBox = (await summaryAside.boundingBox())!
          const lastActionBox = (await summaryAside.getByRole('button').last().boundingBox())!
          expect(
            Math.abs(asideBox.x + asideBox.width - lastActionBox.x - lastActionBox.width)
          ).toBeLessThanOrEqual(2)
        }
        for (const card of await cards.all()) {
          const header = card.locator('.art-section-card__header')
          const actions = card.locator('.art-section-card__actions')
          const headerBox = await header.boundingBox()
          const actionsBox = await actions.boundingBox()
          const headerPaddingRight = await header.evaluate((element) =>
            Number.parseFloat(getComputedStyle(element).paddingRight)
          )
          expect(headerBox).not.toBeNull()
          expect(actionsBox).not.toBeNull()
          expect(
            Math.abs(
              headerBox!.x +
                headerBox!.width -
                headerPaddingRight -
                actionsBox!.x -
                actionsBox!.width
            )
          ).toBeLessThanOrEqual(2)
          if (generic && (await card.locator('.art-section-card__subtitle').count())) {
            const subtitle = (await card.locator('.art-section-card__subtitle').boundingBox())!
            const identity = (await card.locator('.art-section-card__identity').boundingBox())!
            const title = (await card.locator('.art-section-title').boundingBox())!
            expect(identity.width).toBeGreaterThanOrEqual(140)
            expect(subtitle.x).toBeGreaterThanOrEqual(identity.x)
            expect(subtitle.x + subtitle.width).toBeLessThanOrEqual(identity.x + identity.width + 1)
            expect(subtitle.y).toBeGreaterThanOrEqual(title.y + title.height - 1)
          }
          if (!generic) {
            const identity = await card.locator('.art-section-card__identity').boundingBox()
            expect(Math.abs(actionsBox!.y - identity!.y)).toBeLessThanOrEqual(2)
            await expect(card.getByText('测试行业', { exact: true })).toBeVisible()
          }
        }
        if (!generic) {
          const workspaceActions = page.locator('.business-workspace-header__actions')
          const actionsBox = (await workspaceActions.boundingBox())!
          const toolbarBox = (await workspaceActions
            .locator('.business-table-workspace-actions')
            .boundingBox())!
          const addBox = (await workspaceActions
            .getByRole('button', { name: '新增组件类型', exact: true })
            .boundingBox())!
          expect(
            Math.abs(actionsBox.x + actionsBox.width - toolbarBox.x - toolbarBox.width)
          ).toBeLessThanOrEqual(2)
          expect(
            Math.abs(toolbarBox.x + toolbarBox.width - addBox.x - addBox.width)
          ).toBeLessThanOrEqual(6)
          const header = page.locator('th.is-sortable').filter({ hasText: '排序' })
          const headerLeft = (await header.boundingBox())!.x
          await page
            .locator('.art-table .el-table__body-wrapper .el-scrollbar__wrap')
            .evaluate((element, left) => {
              element.scrollLeft += left - element.getBoundingClientRect().x - 80
            }, headerLeft)
          await header.scrollIntoViewIfNeeded()
          await expect(header).toBeInViewport({ ratio: 1 })
          await expect(header).toBeVisible()
          const cell = header.locator('.cell')
          const caret = cell.locator('.caret-wrapper')
          const label = await cell.evaluate((element) => {
            const node = Array.from(element.childNodes).find(
              (item) => item.nodeType === Node.TEXT_NODE && item.textContent?.includes('排序')
            )
            if (!node) throw new Error('Missing sorting label')
            const range = document.createRange()
            range.selectNode(node)
            const rect = range.getBoundingClientRect()
            return { y: rect.y, bottom: rect.bottom }
          })
          const caretBox = await caret.boundingBox()
          expect(caretBox).not.toBeNull()
          expect(caretBox!.y).toBeLessThan(label.bottom)
          expect(caretBox!.y + caretBox!.height).toBeGreaterThan(label.y)
          expect((await header.boundingBox())!.width).toBeGreaterThanOrEqual(100)
          await header.click()
          await expect(header).toHaveClass(/ascending/)
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        ).toBeLessThanOrEqual(1)
        await page.screenshot({
          path: info.outputPath('card-sort-layout.png'),
          fullPage: true,
          animations: 'disabled'
        })
        expect(errors).toEqual([])
      })
    }
  }
}

test('生产组织树保持紧凑头部和手机说明隐藏', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/card-sort-layout.html?production=1')
  const tree = page.locator('.production-tree')
  await expect(tree).toContainText('尚未建立生产组织')
  const subtitle = tree.locator('.art-section-card__subtitle')
  if ((page.viewportSize()?.width ?? 1440) <= 767) await expect(subtitle).toBeHidden()
  else await expect(subtitle).toBeVisible()
  const header = (await tree.locator('.art-section-card__header').boundingBox())!
  const actions = (await tree.locator('.art-section-card__actions').boundingBox())!
  expect(Math.abs(header.x + header.width - actions.x - actions.width)).toBeLessThanOrEqual(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('production-tree-header.png') })
})

test('窄卡片图标留在右上，带搜索框的操作整体换行', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/card-sort-layout.html?header-reflow=1')

  const cards = page.locator('.art-section-card')
  await expect(cards).toHaveCount(2)
  const iconCard = cards.first()
  const searchCard = cards.last()
  const iconTitle = (await iconCard.locator('.art-section-card__identity').boundingBox())!
  const iconActions = (await iconCard.locator('.art-section-card__actions').boundingBox())!
  expect(Math.abs(iconTitle.y - iconActions.y)).toBeLessThanOrEqual(2)

  const searchTitle = (await searchCard.locator('.art-section-card__identity').boundingBox())!
  const searchActions = (await searchCard.locator('.art-section-card__actions').boundingBox())!
  const searchHeading = (await searchCard.locator('.art-section-title').boundingBox())!
  expect(searchTitle.width).toBeGreaterThanOrEqual(140)
  expect(searchActions.y).toBeGreaterThanOrEqual(searchTitle.y + searchTitle.height - 1)
  expect(searchHeading.height).toBeLessThanOrEqual(28)
  expect(searchActions.x + searchActions.width).toBeLessThanOrEqual(
    (await searchCard.boundingBox())!.x + (await searchCard.boundingBox())!.width
  )
})
