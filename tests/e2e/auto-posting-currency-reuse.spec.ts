import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

test('自动入账金额复用与专注模式', async ({ page }, info) => {
  test.setTimeout(180_000)
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const amounts = [1234.567, -1234.567, 0, null, '***', 'invalid', false]
  let readableAmounts = true
  await page.route('**/rest/v1/rpc/fms_list_posting_events_secure', (route) =>
    route.fulfill({
      json: {
        total: amounts.length,
        fieldAccess: { eventAmounts: readableAmounts ? 'read' : 'hidden' },
        records: amounts.map((value, index) => ({
          id: `event-${index}`,
          eventNo: `EV-${index}`,
          sourceType: 'test',
          eventCode: 'test',
          status: 'pending',
          payload: { gross_amount: value },
          fieldAccess: { eventAmounts: readableAmounts ? 'read' : 'hidden' }
        }))
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/explicit-locale-reuse.html?mode=auto-posting')
  await page.getByRole('tab', { name: /事件监控/ }).click({ timeout: 120_000 })
  const table = page.locator('#pane-events .el-table__body')
  const rows = table.locator('tr')
  await expect(rows).toHaveCount(amounts.length)
  for (const [index, amount] of [
    '¥1,234.57',
    '-¥1,234.57',
    '¥0.00',
    '--',
    '***',
    '--',
    '--'
  ].entries())
    await expect(rows.nth(index)).toContainText(amount)
  await page.screenshot({ path: info.outputPath('auto-posting.png'), fullPage: true })
  const hero = page.locator('.auto-posting-page > .business-workspace-header')
  for (const theme of ['light', 'dark']) {
    for (const box of ['border-mode', 'shadow-mode']) {
      await page.evaluate(
        ({ theme, box }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.documentElement.dataset.boxMode = box
        },
        { theme, box }
      )
      await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
      await expect(hero).toBeHidden()
      await expect(table).toBeVisible()
      await expect(page.getByRole('tab', { name: /事件监控/ })).toBeVisible()
      await expect(page.locator('#pane-events .el-pagination')).toBeInViewport({ ratio: 1 })
      const focusLayout = await page
        .locator('#pane-events .art-table-query')
        .evaluate((element) => {
          const measure = (target: Element | null) => {
            if (!target) return null
            const style = getComputedStyle(target)
            return {
              height: target.getBoundingClientRect().height,
              scrollHeight: target.scrollHeight,
              cssHeight: style.height,
              maxHeight: style.maxHeight,
              minHeight: style.minHeight,
              flex: style.flex,
              className: String(target.className)
            }
          }
          return {
            query: measure(element),
            search: measure(element.querySelector('.art-search-bar')),
            card: measure(element.querySelector('.art-table-card')),
            parent: measure(element.parentElement),
            container: measure(element.parentElement?.parentElement ?? null)
          }
        })
      await writeFile(
        info.outputPath(`focus-layout-${theme}-${box}.json`),
        JSON.stringify(focusLayout, null, 2)
      )
      expect(focusLayout.search?.height).toBeGreaterThanOrEqual(100)
      await page.screenshot({
        path: info.outputPath(`auto-posting-focus-${theme}-${box}.png`),
        fullPage: true
      })
      await page.getByRole('button', { name: '退出专注模式' }).click()
      await expect(hero).toBeVisible()
    }
  }
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark')
    document.documentElement.dataset.boxMode = 'border-mode'
  })
  readableAmounts = false
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(
    page.locator('#pane-events .el-table__header').getByText('业务金额', { exact: true })
  ).toHaveCount(0)
  await expect(table).not.toContainText('¥1,234.57')
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await page.keyboard.press('Escape')
  await expect(hero).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await page.getByRole('tab', { name: /制证规则/ }).click()
  await expect(hero).toBeHidden()
  await expect(page.getByRole('tab', { name: /制证规则/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#pane-rules .art-table-query')).toHaveClass(/is-focus-mode/)
  await page.screenshot({
    path: info.outputPath('auto-posting-switched-focus.png'),
    fullPage: true
  })
  await page.getByRole('button', { name: '退出专注模式' }).click()
  await expect(hero).toBeVisible()
  await page.getByRole('tab', { name: /事件监控/ }).click()
  await expect(table).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
