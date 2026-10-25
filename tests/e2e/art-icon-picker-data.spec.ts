import { expect, test } from '@playwright/test'
import { blockExternalIconRequests } from './support/icons'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript(
    ({ dark, boxMode }) => {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.dataset.boxMode = boxMode
        },
        { once: true }
      )
    },
    {
      dark: testInfo.project.name.includes('dark'),
      boxMode: testInfo.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    }
  )
})

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.project.name.includes('dark')) {
    await expect(page.locator('html')).toHaveClass(/dark/)
  } else {
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  }
  await expect(page.locator('html')).toHaveAttribute(
    'data-box-mode',
    testInfo.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
  )
})

test('损坏缓存重新加载，过滤异常条目后仍可选择图标', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const externalRequests = await blockExternalIconRequests(page)
  let collectionRequests = 0
  await page.route('https://api.iconify.design/collection**', (route) => {
    collectionRequests += 1
    return route.fulfill({
      json: {
        prefix: 'ri',
        uncategorized: ['home-line', null],
        categories: { general: ['menu-line', 42], broken: {} }
      }
    })
  })
  await page.addInitScript(() =>
    localStorage.setItem(
      'art-icon-picker:ri:v1',
      JSON.stringify({
        expiresAt: Date.now() + 60_000,
        icons: [null, 'ri:home-line']
      })
    )
  )
  await page.goto('/tests/e2e/fixtures/art-icon-picker.html')
  await page.getByRole('button', { name: '选择图标', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.art-icon-picker__item')).toHaveCount(2)
  await expect(dialog.locator('.art-icon-picker__item svg')).toHaveCount(2)
  await page.screenshot({ path: testInfo.outputPath('recovered-picker.png') })
  await page.getByRole('button', { name: '选择图标 ri:menu-line', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('output')).toHaveText('ri:menu-line')
  expect(collectionRequests).toBe(1)
  expect(externalRequests).toEqual([])
  expect(errors).toEqual([])
})

test('外部图标目录失败时常用图标仍可选择', async ({ page }) => {
  await page.route('https://api.iconify.design/collection**', (route) => route.abort())
  await page.goto('/tests/e2e/fixtures/art-icon-picker.html')
  await page.getByRole('button', { name: '选择图标', exact: true }).click()
  await page.getByPlaceholder('搜索图标名称，如 user、menu、setting').fill('home-line')
  await page.getByRole('button', { name: '选择图标 ri:home-line', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.locator('output')).toHaveText('ri:home-line')
})

test('其他图标库目录失败时仅提供可渲染的本地图标', async ({ page }, testInfo) => {
  const externalRequests = await blockExternalIconRequests(page)
  await page.route('https://api.iconify.design/collection**', (route) => route.abort())
  await page.goto('/tests/e2e/fixtures/art-icon-picker.html?prefix=vaadin')
  await page.getByRole('button', { name: '选择图标', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.art-icon-picker__meta')).toContainText('vaadin')
  const icons = dialog.locator('.art-icon-picker__item')
  await expect(icons.first()).toBeVisible()
  const names = await icons.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('aria-label') ?? '')
  )
  expect(names.every((name) => name.startsWith('选择图标 vaadin:'))).toBe(true)
  await expect(dialog.locator('.art-icon-picker__item svg')).toHaveCount(names.length)
  await page.screenshot({ path: testInfo.outputPath('local-library-fallback.png') })
  await icons.first().click()
  await expect(page.locator('output')).toHaveText(names[0].replace('选择图标 ', ''))
  expect(externalRequests).toEqual([])
})

test('图标目录恢复后可重新加载完整集合', async ({ page }, testInfo) => {
  const externalRequests = await blockExternalIconRequests(page)
  let collectionRequests = 0
  await page.route('https://api.iconify.design/collection**', (route) => {
    collectionRequests += 1
    return collectionRequests === 1
      ? route.abort()
      : route.fulfill({ json: { prefix: 'ri', uncategorized: ['home-line', 'menu-line'] } })
  })
  await page.goto('/tests/e2e/fixtures/art-icon-picker.html')
  await page.getByRole('button', { name: '选择图标', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const localStatus = dialog.getByText('本地图标', { exact: true })
  await expect(localStatus).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('local-icons-retry.png') })
  await dialog.getByRole('button', { name: '加载完整图标库', exact: true }).click()
  await expect(localStatus).toBeHidden()
  await expect(dialog.locator('.art-icon-picker__item')).toHaveCount(2)
  await expect(dialog.locator('.art-icon-picker__item svg')).toHaveCount(2)
  await dialog.getByRole('button', { name: '选择图标 ri:menu-line', exact: true }).click()
  await expect(page.locator('output')).toHaveText('ri:menu-line')
  expect(collectionRequests).toBe(2)
  expect(externalRequests).toEqual([])
})
