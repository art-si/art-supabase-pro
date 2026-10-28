import { expect, test, type Page } from '@playwright/test'
import { loadEnv } from 'vite'
import { prepareIsolatedSession } from './support/isolated-session'

const appVersion = loadEnv('e2e', process.cwd(), '').VITE_VERSION
const fixtureUrl = '/tests/e2e/fixtures/appearance-local-preferences.html'
const remoteAppearance = {
  systemThemeColor: '#b46519',
  boxBorderMode: false,
  customRadius: '1.5',
  showCrumbs: false,
  showWorkTab: false
}

interface AppearanceState {
  systemThemeColor: string
  boxBorderMode: boolean
  customRadius: string
  showCrumbs: boolean
  showWorkTab: boolean
}

const appearance = (page: Page) =>
  page
    .getByTestId('appearance')
    .evaluate((element) => JSON.parse(element.textContent || '{}') as AppearanceState)

async function mockAppearanceParam(
  page: Page,
  waitForRead?: Promise<void>,
  firstReadOutcome: 'present' | 'missing' | 'error' = 'present'
) {
  const requests = {
    reads: 0,
    writes: 0,
    saved: null as Record<string, unknown> | null,
    failReads: firstReadOutcome === 'error'
  }
  await page.route('**/rest/v1/sys_param?*', async (route) => {
    const request = route.request()
    const key = new URL(request.url()).searchParams.get('param_key')
    if (request.method() === 'GET' && key === 'eq.ui.appearance.config') {
      requests.reads++
      await waitForRead
      if (firstReadOutcome === 'missing' && requests.reads === 1) {
        await route.fulfill({ status: 204, body: '' })
        return
      }
      if (requests.failReads) {
        await route.fulfill({
          status: 403,
          json: { code: '42501', message: 'permission denied in isolated test' }
        })
        return
      }
      await route.fulfill({
        json: {
          id: 'appearance-test-param',
          param_key: 'ui.appearance.config',
          param_value: JSON.stringify(remoteAppearance),
          enabled: true
        }
      })
      return
    }
    if (request.method() === 'PATCH') {
      requests.writes++
      requests.saved = request.postDataJSON() as Record<string, unknown>
      await route.fulfill({ status: 200, headers: { 'content-range': '0-0/1' }, json: [] })
      return
    }
    await route.fulfill({ json: [] })
  })
  return requests
}

test.use({ storageState: { cookies: [], origins: [] } })

test('全新客户端采用远端外观默认值，重复加载合并请求', async ({ page }) => {
  await prepareIsolatedSession(page)
  let releaseRead: () => void = () => {}
  const readGate = new Promise<void>((resolve) => (releaseRead = resolve))
  const requests = await mockAppearanceParam(page, readGate)
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await expect.poll(() => requests.reads).toBe(1)
  await page.getByRole('button', { name: '再次读取默认外观' }).click()
  expect(requests.reads).toBe(1)
  releaseRead()
  await expect(page.getByTestId('load-state')).toHaveText('done')
  await expect.poll(() => appearance(page)).toMatchObject(remoteAppearance)
})

test('已有本地缓存刷新后仍保留主题色、盒子、圆角和开关', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.addInitScript(
    ({ version }) => {
      localStorage.setItem(
        `sys-v${version}-setting`,
        JSON.stringify({
          systemThemeColor: '#118855',
          boxBorderMode: true,
          customRadius: '1.25',
          showCrumbs: true,
          showWorkTab: true
        })
      )
    },
    { version: appVersion }
  )
  const requests = await mockAppearanceParam(page)
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('load-state')).toHaveText('done')
  await expect
    .poll(() => appearance(page))
    .toMatchObject({
      systemThemeColor: '#118855',
      boxBorderMode: true,
      customRadius: '1.25',
      showCrumbs: true,
      showWorkTab: true
    })
  expect(requests.reads).toBe(0)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('load-state')).toHaveText('done')
  expect((await appearance(page)).systemThemeColor).toBe('#118855')
  expect(requests.reads).toBe(0)
})

test('远端响应晚到时，用户改动后改回仍由本地决定', async ({ page }) => {
  await prepareIsolatedSession(page)
  let releaseRead: () => void = () => {}
  const requests = await mockAppearanceParam(
    page,
    new Promise<void>((resolve) => (releaseRead = resolve))
  )
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await expect.poll(() => requests.reads).toBe(1)
  const defaultColor = (await page.getByTestId('defaults').textContent()) || '{}'
  await page.getByRole('button', { name: '改动后改回主题色' }).click()
  releaseRead()
  await expect(page.getByTestId('load-state')).toHaveText('done')
  expect((await appearance(page)).systemThemeColor).toBe(JSON.parse(defaultColor).systemThemeColor)
  expect((await appearance(page)).boxBorderMode).toBe(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  expect((await appearance(page)).systemThemeColor).toBe(JSON.parse(defaultColor).systemThemeColor)
})

test('首次没有远端配置时，自动生成的设置缓存不阻止下次采用远端默认', async ({ page }) => {
  await prepareIsolatedSession(page)
  const requests = await mockAppearanceParam(page, undefined, 'missing')
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('load-state')).toHaveText('done')
  expect(requests.reads).toBe(1)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('load-state')).toHaveText('done')
  await expect.poll(() => appearance(page)).toMatchObject(remoteAppearance)
  expect(requests.reads).toBe(2)
})

test('首次远端读取失败后，自动生成的设置缓存不阻止重试', async ({ page }) => {
  await prepareIsolatedSession(page)
  const requests = await mockAppearanceParam(page, undefined, 'error')
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('load-state')).not.toHaveText('loading')
  const readsBeforeReload = requests.reads
  expect(readsBeforeReload).toBeGreaterThan(0)
  requests.failReads = false
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('load-state')).toHaveText('done')
  await expect.poll(() => appearance(page)).toMatchObject(remoteAppearance)
  expect(requests.reads).toBeGreaterThan(readsBeforeReload)
})

test('首次采用远端默认后，用户再调整会成为本地偏好并在刷新后保留', async ({ page }) => {
  await prepareIsolatedSession(page)
  const requests = await mockAppearanceParam(page)
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('load-state')).toHaveText('done')
  await expect.poll(() => appearance(page)).toMatchObject(remoteAppearance)
  await page.getByRole('button', { name: '调整本地外观' }).click()
  await expect
    .poll(() => appearance(page))
    .toMatchObject({
      systemThemeColor: '#118855',
      boxBorderMode: false,
      customRadius: '1.25',
      showCrumbs: true
    })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('load-state')).toHaveText('done')
  expect((await appearance(page)).systemThemeColor).toBe('#118855')
  expect(requests.reads).toBe(1)
})

test('远端读取期间仅有运行状态变化，仍采用远端默认', async ({ page }) => {
  await prepareIsolatedSession(page)
  let releaseRead: () => void = () => {}
  const requests = await mockAppearanceParam(
    page,
    new Promise<void>((resolve) => (releaseRead = resolve))
  )
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await expect.poll(() => requests.reads).toBe(1)
  await page.getByRole('button', { name: '仅改变运行状态' }).click()
  releaseRead()
  await expect(page.getByTestId('load-state')).toHaveText('done')
  await expect.poll(() => appearance(page)).toMatchObject(remoteAppearance)
})

test('普通用户无保存入口，直接调用保存也不读取或写入参数', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  const requests = await mockAppearanceParam(page)
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('load-state')).toHaveText('done')
  await expect(page.getByRole('button', { name: '保存到参数配置' })).toHaveCount(0)
  await page.locator('.setting-actions').screenshot({
    path: testInfo.outputPath('ordinary-local-preferences.jpg'),
    type: 'jpeg',
    quality: 90
  })
  const readsBeforeSave = requests.reads
  await page.getByRole('button', { name: '直接调用保存' }).click()
  await expect(page.getByTestId('save-state')).toContainText('没有保存默认外观的权限')
  expect(requests.reads).toBe(readsBeforeSave)
  expect(requests.writes).toBe(0)
})

test('授权用户可将当前本地外观保存到参数配置', async ({ page }) => {
  await prepareIsolatedSession(page)
  const requests = await mockAppearanceParam(page)
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('load-state')).toHaveText('done')
  await page.getByRole('button', { name: '授予保存权限' }).click()
  await expect(page.getByRole('button', { name: '保存到参数配置' })).toBeVisible()
  await page.getByRole('button', { name: '调整本地外观' }).click()
  await page.getByRole('button', { name: '保存到参数配置' }).click()
  await expect.poll(() => requests.writes).toBe(1)
  const saved = JSON.parse(String(requests.saved?.param_value || '{}')) as AppearanceState
  expect(saved.systemThemeColor).toBe('#118855')
  expect(saved.customRadius).toBe('1.25')
})

test('重置默认外观刷新后保留，远端默认不再覆盖', async ({ page }) => {
  await prepareIsolatedSession(page)
  const requests = await mockAppearanceParam(page)
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('load-state')).toHaveText('done')
  await page.getByRole('button', { name: '调整本地外观' }).click()
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.getByRole('button', { name: '重置配置' }).click()
  ])
  await expect(page.getByTestId('load-state')).toHaveText('done')
  const defaults = JSON.parse(
    (await page.getByTestId('defaults').textContent()) || '{}'
  ) as AppearanceState
  await expect
    .poll(() => appearance(page))
    .toMatchObject({
      systemThemeColor: defaults.systemThemeColor,
      boxBorderMode: defaults.boxBorderMode,
      customRadius: defaults.customRadius,
      showCrumbs: defaults.showCrumbs,
      showWorkTab: defaults.showWorkTab
    })
  expect(requests.writes).toBe(0)
})
