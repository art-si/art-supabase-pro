import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(180_000)

test('公共字典仅响应自身变化并在清空缓存后重载', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const requests: string[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/sys_dictionary')) {
      const boolean = url.search.includes('commonBoolean')
      requests.push(boolean ? 'boolean' : 'watched')
      await gate
      return route.fulfill({
        json: [
          {
            label: '',
            name: boolean ? '重载否定' : '重载名称',
            value: boolean ? 'false' : 'reloaded',
            status: '1'
          },
          { label: '停用选项', value: 'obsolete', status: '0' }
        ]
      })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/dictionary-options-reactivity.html')
  await expect(page.getByLabel('当前选项名称')).toHaveText('初始名称')
  await page.getByRole('button', { name: '更新无关字典', exact: true }).click()
  await expect(page.getByLabel('重建次数')).toHaveText('0')
  await expect(page.getByLabel('选项身份稳定')).toHaveText('true')
  await page.getByRole('button', { name: '更新当前字典', exact: true }).click()
  await expect(page.getByLabel('当前选项名称')).toHaveText('更新名称')
  await expect(page.getByLabel('重建次数')).toHaveText('1')
  await expect(page.getByLabel('数组身份稳定')).toHaveText('true')
  await page.getByRole('button', { name: '清空字典缓存', exact: true }).click()
  await expect(page.getByLabel('选项数量')).toHaveText('0')
  await expect.poll(() => requests.length).toBe(2)
  await page.screenshot({ path: info.outputPath('dictionary-cache-cleared.png') })
  release()
  await expect(page.getByLabel('当前选项名称')).toHaveText('重载名称')
  await expect(page.getByLabel('布尔选项值')).toHaveText('[false]')
  await expect(page.getByLabel('数组身份稳定')).toHaveText('true')
  await expect(page.getByLabel('重建次数')).toHaveText('3')
  expect(requests.sort()).toEqual(['boolean', 'watched'])
  await page.screenshot({ path: info.outputPath('dictionary-cache-reloaded.png') })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})
