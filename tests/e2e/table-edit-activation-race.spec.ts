import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

const fixtureUrl = '/tests/e2e/fixtures/table-edit-activation-race.html'

for (const scenario of ['normal', 'loading', 'disabled', 'before', 'clear'] as const) {
  test(`ArtTable 公开编辑 API 在 ${scenario} 场景只激活仍有效的单元格`, async ({ page }, info) => {
    const unexpectedRequests: string[] = []
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/*', (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (
        (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
        request.method() === 'GET'
      )
        return route.continue()
      unexpectedRequests.push(`${request.method()} ${url.pathname}`)
      return route.abort()
    })
    await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'ArtTable 编辑激活竞态验收' })).toBeVisible()
    await expect(page.getByText('可编辑记录')).toBeVisible()
    await page.getByTestId(`start-${scenario}`).click()
    const accepted = scenario === 'normal'
    await expect(page.getByTestId('edit-result')).toHaveText(String(accepted))
    await expect(page.getByTestId('edit-activated')).toHaveText(accepted ? '1' : '0')
    await expect(page.getByTestId('edit-active-record')).toHaveText(accepted ? 'name' : 'none')
    if (accepted) await expect(page.locator('[data-art-edit-field="name"] input')).toBeFocused()
    expect(unexpectedRequests).toEqual([])
    expect(pageErrors).toEqual([])
    await page.screenshot({
      path: info.outputPath(`edit-activation-${scenario}.png`),
      fullPage: true
    })
  })
}

for (const virtual of [false, true] as const) {
  test(`ArtTable 公开批量移除保留原始行与工作行身份（${virtual ? '虚拟' : '普通'}）`, async ({
    page
  }, info) => {
    const unexpectedRequests: string[] = []
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/*', (route) => {
      const request = route.request()
      const url = new URL(request.url())
      if (
        (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
        request.method() === 'GET'
      )
        return route.continue()
      unexpectedRequests.push(`${request.method()} ${url.pathname}`)
      return route.abort()
    })
    await page.goto(`${fixtureUrl}?batch=1${virtual ? '&virtual=1' : ''}`, {
      waitUntil: 'domcontentloaded'
    })
    await expect(page.getByRole('heading', { name: 'ArtTable 编辑激活竞态验收' })).toBeVisible()
    await expect(page.getByText('记录 1', { exact: true })).toBeVisible()
    const count = virtual ? 1200 : 3
    const removed = {
      virtual,
      rowCount: count - 1,
      firstId: 2,
      lastId: count,
      hasSameIdForeignTarget: true,
      insertedIds: [],
      removedIds: [1],
      removedByCall: [1, count + 1],
      sourceCount: count,
      sourceFirstId: 1
    }
    await page.getByTestId('batch-remove').click()
    await expect(page.getByTestId('batch-report')).toHaveText(JSON.stringify(removed))
    await expect(page.getByText('记录 1', { exact: true })).toHaveCount(0)
    await expect(page.getByText('记录 2', { exact: true })).toBeVisible()
    await page.getByTestId('batch-undo').click()
    await expect(page.getByTestId('batch-report')).toHaveText(
      JSON.stringify({
        virtual,
        rowCount: count + 1,
        firstId: 1,
        lastId: count + 1,
        hasSameIdForeignTarget: true,
        insertedIds: [count + 1],
        removedIds: [],
        removedByCall: [1, count + 1],
        sourceCount: count,
        sourceFirstId: 1
      })
    )
    await expect(page.getByText('记录 1', { exact: true })).toBeVisible()
    await page.getByTestId('batch-redo').click()
    await expect(page.getByTestId('batch-report')).toHaveText(JSON.stringify(removed))
    await expect(page.getByText('记录 1', { exact: true })).toHaveCount(0)
    expect(unexpectedRequests).toEqual([])
    expect(pageErrors).toEqual([])
    await page.screenshot({
      path: info.outputPath(`batch-remove-${virtual ? 'virtual' : 'normal'}.png`),
      fullPage: true
    })
  })
}
