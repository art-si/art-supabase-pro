import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('退出清空字典时，仍存活的业务控件不再请求；重新登录后恢复加载', async ({ page }, testInfo) => {
  const requests: string[] = []
  await page.route('**/rest/v1/**', async (route) => {
    if (route.request().url().includes('/sys_dictionary?')) requests.push(route.request().url())
    await route.fulfill({ json: [] })
  })
  await page.goto('#/auth/login')
  await expect(page.locator('input[type="password"]')).toBeVisible()
  const result = await page.evaluate(async () => {
    const storePath = '/src/store/index.ts'
    const userPath = '/src/store/modules/user.ts'
    const hookPath = '/src/hooks/core/useDictionaryOptions.ts'
    const { store } = await import(/* @vite-ignore */ storePath)
    const { useUserStore } = await import(/* @vite-ignore */ userPath)
    const { useDictionaryOptions } = await import(/* @vite-ignore */ hookPath)
    const user = useUserStore(store)
    user.setLoginStatus(true)
    user.setDictMap({ logoutRegression: [] })
    const options = useDictionaryOptions('logoutRegression')
    await user.logOut()
    // 包括历史值展示入口，避免旧组件在缓存失效后继续补查。
    await Promise.all([
      user.ensureDictLoaded('logoutRegression'),
      user.ensureDictDisplayItemLoaded('logoutRegression', 'old-value'),
      user.fetchDictList()
    ])
    return { isLogin: user.isLogin, map: user.getDictMap, options: [...options] }
  })
  expect(result).toEqual({ isLogin: false, map: {}, options: [] })
  expect(requests).toEqual([])
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  )
  await page.screenshot({
    path: testInfo.outputPath('logout-clean.png'),
    mask: [page.locator('input')]
  })
  await page.evaluate(async () => {
    const storePath = '/src/store/index.ts'
    const userPath = '/src/store/modules/user.ts'
    const { store } = await import(/* @vite-ignore */ storePath)
    const { useUserStore } = await import(/* @vite-ignore */ userPath)
    const user = useUserStore(store)
    user.setLoginStatus(true)
    await user.ensureDictLoaded('logoutRegression')
    user.setLoginStatus(false)
  })
  expect(requests.length).toBeGreaterThan(0)
})

test('退出前在途的字典失败响应不再触发错误或写回缓存', async ({ page }) => {
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let received: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    received = resolve
  })
  await page.route('**/rest/v1/sys_dictionary?**', async (route) => {
    received()
    await held
    await route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
  })
  await page.goto('#/auth/login')
  await expect(page.locator('input[type="password"]')).toBeVisible()
  const pending = page.evaluate(async () => {
    const storePath = '/src/store/index.ts'
    const userPath = '/src/store/modules/user.ts'
    const { store } = await import(/* @vite-ignore */ storePath)
    const { useUserStore } = await import(/* @vite-ignore */ userPath)
    const user = useUserStore(store)
    user.setLoginStatus(true)
    await user.ensureDictLoaded('logoutRegression')
    return user.getDictMap
  })
  await started
  await page.evaluate(async () => {
    const storePath = '/src/store/index.ts'
    const userPath = '/src/store/modules/user.ts'
    const { store } = await import(/* @vite-ignore */ storePath)
    const { useUserStore } = await import(/* @vite-ignore */ userPath)
    await useUserStore(store).logOut()
  })
  release()
  expect(await pending).toEqual({})
  await expect(page.locator('.el-message--error')).toHaveCount(0)
})
