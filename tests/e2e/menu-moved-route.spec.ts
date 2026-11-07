import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('采购入库单保留旧网址时仍显示在 SCM 菜单并选中 SCM 应用', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const missingApplicationTitles: string[] = []
  page.on('console', (message) => {
    if (
      message.type() === 'warning' &&
      /\[intlify\].*Not found.*(?:SCM供应链管理|WMS仓储管理)/.test(message.text())
    )
      missingApplicationTitles.push(message.text())
  })
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'scm', name: 'SCM供应链管理', baseUrl: '/scm/' },
        { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
      ]
    })
  )
  await page.goto('/tests/e2e/fixtures/menu-moved-route.html')
  await expect(page.getByRole('button', { name: '切换业务应用' })).toContainText('SCM', {
    timeout: 60_000
  })
  await expect(page.getByRole('button', { name: 'SCM供应链管理' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'WMS仓储管理' })).toBeVisible()
  await page.getByRole('button', { name: 'SCM供应链管理' }).hover()
  await expect(page.getByRole('tooltip')).toContainText('SCM供应链管理')
  await expect(page.getByRole('menuitem', { name: '采购管理' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '采购入库单' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '采购入库单' })).toHaveClass(/is-active/)
  await page.screenshot({
    path: testInfo.outputPath('menu-moved-route.png'),
    animations: 'disabled'
  })
  expect(missingApplicationTitles).toEqual([])
})
