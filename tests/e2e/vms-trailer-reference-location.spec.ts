import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

const fixture = '/tests/e2e/fixtures/vms-trailer-reference-location.html'

for (const scenario of [
  { name: '1440 明亮', width: 1440, height: 900, theme: 'light' },
  { name: '570 暗色', width: 570, height: 844, theme: 'dark' }
] as const) {
  test(`${scenario.name} 挂车 A→B→A→清空定位与专注模式`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height })
    await page.emulateMedia({ colorScheme: scenario.theme, reducedMotion: 'reduce' })
    await prepareIsolatedSession(page)
    const reads: string[] = []
    let listReads = 0
    const unexpected: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [] })
      unexpected.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
      return route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
    })
    await page.route('**/rest/v1/rpc/vms_get_trailer_secure', (route) => {
      const id = String((route.request().postDataJSON() as { p_id?: string }).p_id)
      reads.push(id)
      return route.fulfill({
        json: {
          id,
          tenant_id: '22222222-2222-4222-8222-222222222222',
          plate_no: id === 'trailer-ref-a' ? '沪A-定位挂车' : '沪B-定位挂车',
          trailer_type: '标准挂车',
          status: 'active',
          license_front_url: null,
          license_back_url: null
        }
      })
    })
    await page.route('**/rest/v1/rpc/vms_list_trailers_secure', (route) => {
      listReads++
      return route.fulfill({
        json: {
          records: [{ id: 'trailer-list-row', plate_no: '沪C-普通列表', trailer_type: '标准挂车' }],
          total: 1
        }
      })
    })

    await page.goto(scenario.theme === 'dark' ? `${fixture}?theme=dark` : fixture)
    if (scenario.theme === 'dark') {
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
        .toBe(true)
      expect(
        await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
      ).toBe('dark')
    }
    const table = page.locator('.trailer-manage .art-table-query')
    const body = table.locator('.el-table__body-wrapper')
    await expect(body.getByText('沪A-定位挂车')).toBeVisible()
    await expect(page.getByText('已找到关联记录')).toBeVisible()
    const search = table.locator('.art-search-bar')
    await expect(search.getByRole('textbox', { name: '车牌号' })).toBeVisible()
    await expect(search.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    const header = page.locator('.trailer-manage .business-workspace-header')
    const metrics = header.locator('.business-workspace-header__metrics')
    const notice = page.locator('.trailer-manage .master-delete-notice')
    const pagination = table.locator('.el-pagination')
    await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await expect(table).toHaveClass(/is-focus-mode/)
    await expect(header).toBeHidden()
    await expect(metrics).toBeHidden()
    await expect(notice).toBeHidden()
    await expect(search).toBeVisible()
    await expect(body.getByText('沪A-定位挂车')).toBeVisible()
    await expect(pagination).toBeVisible()
    for (const region of [search, body, pagination]) {
      const box = await region.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.width).toBeGreaterThan(0)
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(scenario.width + 1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await page.screenshot({ path: testInfo.outputPath(`trailer-focus-${scenario.width}.png`) })
    await table.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(table).not.toHaveClass(/is-focus-mode/)
    await expect(header).toBeVisible()
    await expect(metrics).toBeVisible()
    await expect(notice).toBeVisible()
    await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await expect(table).toHaveClass(/is-focus-mode/)
    await page.keyboard.press('Escape')
    await expect(table).not.toHaveClass(/is-focus-mode/)
    await expect(header).toBeVisible()
    await expect(notice).toBeVisible()
    await page.getByRole('button', { name: '定位挂车 B' }).click()
    await expect(body.getByText('沪B-定位挂车')).toBeVisible()
    await expect(body.getByText('沪A-定位挂车')).toHaveCount(0)
    await page.getByRole('button', { name: '定位挂车 A' }).click()
    await expect(body.getByText('沪A-定位挂车')).toBeVisible()
    await expect(body.getByText('沪B-定位挂车')).toHaveCount(0)
    await page.getByRole('button', { name: '清除定位' }).click()
    await expect(body.getByText('沪C-普通列表')).toBeVisible()
    await expect(body.getByText('沪A-定位挂车')).toHaveCount(0)
    await expect(search.getByRole('textbox', { name: '车牌号' })).toBeVisible()
    await expect(search.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    await expect(notice).toHaveCount(0)
    expect(reads).toEqual(['trailer-ref-a', 'trailer-ref-b', 'trailer-ref-a'])
    expect(listReads).toBe(1)
    expect(unexpected).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`trailer-cleared-${scenario.width}.png`) })
  })
}
