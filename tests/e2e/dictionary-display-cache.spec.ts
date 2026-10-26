import { expect, test } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120000)

test('清空缓存后文字标签徽标及表格自动重载字典，不依赖主题切换重建', async ({ page }, info) => {
  const errors: string[] = []
  const requests: string[] = []
  let release: () => void = () => {}
  const reloaded = new Promise<void>((resolve) => {
    release = resolve
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/sys_dictionary')) return route.fulfill({ json: [] })
    if (url.searchParams.has('value')) return route.fulfill({ json: [] })
    requests.push(url.pathname)
    const revision = requests.length
    if (revision === 2) await reloaded
    return route.fulfill({
      json: [
        { value: 'self', label: revision === 1 ? '自有' : '重载自有', status: '1', sort: 0 },
        { value: 'supplier', label: revision === 1 ? '供应商' : '重载供应商', status: '1', sort: 1 }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/dictionary-display-cache.html')
  for (const display of ['text', 'tag', 'badge']) {
    await expect(page.getByTestId(`${display}-self`)).toHaveText('自有')
    await expect(page.getByTestId(`${display}-supplier`)).toHaveText('供应商')
  }
  await expect(page.getByTestId('dictionary-cache-table')).toContainText('自有')
  await expect.poll(() => requests.length).toBe(1)
  await page.getByRole('button', { name: '更新无关展示字典', exact: true }).click()
  expect(requests).toHaveLength(1)
  await page.getByRole('button', { name: '清空展示字典缓存', exact: true }).click()
  await expect.poll(() => requests.length).toBe(2)
  release()
  for (const display of ['text', 'tag', 'badge']) {
    await expect(page.getByTestId(`${display}-self`)).toHaveText('重载自有')
    await expect(page.getByTestId(`${display}-supplier`)).toHaveText('重载供应商')
    await expect(page.getByTestId(`${display}-legacy`)).toHaveText('legacy')
  }
  await expect(page.getByTestId('dictionary-cache-table')).toContainText('重载自有')
  await expect(page.getByTestId('dictionary-cache-table')).toContainText('重载供应商')
  expect(requests).toHaveLength(2)
  await captureBusinessEvidence(page, {
    path: info.outputPath('dictionary-display-cache-reloaded.png'),
    fullPage: true
  })
  expect(errors).toEqual([])
})
