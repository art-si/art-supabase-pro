import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const mode of ['type', 'item']) {
  test(`字典${mode === 'type' ? '类型' : '项'}定位以对应读取结果为准`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let fail = true
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/rest/v1/sys_dict_type?*', async (route) => {
      await gate
      if (fail) {
        await route.fulfill({ status: 503, json: { message: '字典目录暂时无法加载' } })
        return
      }
      await route.fulfill({
        json: [
          {
            id: 'type-test',
            parent_id: null,
            name: '测试字典类型',
            code: 'location-test',
            node_type: 'dictionary',
            status: '1',
            sort: 1,
            cascade_parent_type_id: null
          }
        ]
      })
    })
    await page.route('**/rest/v1/sys_dictionary?*', async (route) => {
      const rows =
        mode === 'item'
          ? [
              {
                id: 'item-test',
                type_id: 'type-test',
                label: '定位测试项',
                value: 'test',
                code: 'location-test',
                status: '1',
                sort: 1,
                parent_id: null
              }
            ]
          : []
      await route.fulfill({
        json: rows,
        headers: {
          'content-range': rows.length ? '0-0/1' : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
    })
    await page.goto(`/tests/e2e/fixtures/master-delete-location.html?mode=${mode}`)
    const notice = page.locator('.master-delete-notice')
    await expect(notice).toContainText('定位待完成', { timeout: 120_000 })
    release?.()
    const panel = page.locator('.dict-tree-panel')
    await expect(panel.getByText('字典目录加载失败', { exact: true })).toBeVisible()
    await expect(notice).toContainText('定位待完成')
    fail = false
    await panel.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(notice).toContainText('已找到关联记录')
    if (mode === 'item') await expect(page.locator('.art-table')).toContainText('定位测试项')
    else await expect(page.locator('.art-table')).not.toContainText('定位测试项')
    await page.screenshot({
      path: info.outputPath('dictionary-location-found.png'),
      fullPage: true
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
