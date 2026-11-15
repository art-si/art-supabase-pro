import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.describe.configure({ timeout: 90_000 })

const dictionaryItem = (dictCode: string, label: string) => ({
  id: dictCode,
  code: 'sample',
  label,
  value: 'sample',
  sort: 1,
  status: '1',
  dict_type_table: { code: dictCode, name: dictCode }
})

async function evaluateDictionary({
  action,
  codes,
  obsoleteCode
}: {
  action: 'ensure' | 'refresh'
  codes: string[]
  obsoleteCode?: string
}): Promise<Record<string, string[] | null>> {
  const storePath = '/src/store/index.ts'
  const userPath = '/src/store/modules/user.ts'
  const { store } = await import(/* @vite-ignore */ storePath)
  const { useUserStore } = await import(/* @vite-ignore */ userPath)
  const user = useUserStore(store)
  if (action === 'refresh') {
    await user.fetchDictList()
  } else {
    user.setLoginStatus(true)
    if (obsoleteCode) user.setDictMap({ [obsoleteCode]: [] })
    await Promise.all(codes.map((code) => user.ensureDictLoaded(code)))
  }
  return Object.fromEntries(
    codes.map((code) => [
      code,
      user.getDictMap[code]?.map((item: { label: string }) => item.label) ?? null
    ])
  )
}

async function openDictionaryTestPage(page: Page) {
  await page.goto('#/auth/login')
  await expect(page.locator('input[type="password"]')).toBeVisible()
}

test('全量刷新移除缓存键后会按字典类型重新加载，空结果也会缓存', async ({ page }) => {
  const filledCode = 'concurrentFilled'
  const emptyCode = 'concurrentEmpty'
  const obsoleteCode = 'previouslyCached'
  const fullOnlyCode = 'fullSnapshotOnly'
  const codes = [filledCode, emptyCode]
  const byCodeRequested = Promise.withResolvers<void>()
  const releaseByCode = Promise.withResolvers<void>()
  const snapshotRead = Promise.withResolvers<void>()
  const releaseFull = Promise.withResolvers<void>()
  const counts = new Map<string, number>()

  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/sys_dictionary')) {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      if (code && codes.includes(code)) {
        counts.set(code, (counts.get(code) ?? 0) + 1)
        if (counts.size === codes.length) byCodeRequested.resolve()
        await releaseByCode.promise
        return route.fulfill({
          json: code === filledCode ? [dictionaryItem(code, '有效标签')] : []
        })
      }
      if (!code) return route.fulfill({ json: [dictionaryItem(fullOnlyCode, '全量标签')] })
    }
    if (url.pathname.endsWith('/rpc/material_unit_compatibility_options')) {
      // 全量字典行已取回，等待单位数据时按类型请求可以先完成。
      snapshotRead.resolve()
      await releaseFull.promise
    }
    return route.fulfill({ json: [] })
  })

  await openDictionaryTestPage(page)
  const ensuredByCode = page.evaluate(evaluateDictionary, { action: 'ensure', codes, obsoleteCode })
  try {
    await byCodeRequested.promise
    const fullRefresh = page.evaluate(evaluateDictionary, {
      action: 'refresh',
      codes: [...codes, obsoleteCode, fullOnlyCode]
    })
    await snapshotRead.promise
    releaseByCode.resolve()
    expect(await ensuredByCode).toEqual({ [filledCode]: ['有效标签'], [emptyCode]: [] })
    releaseFull.resolve()
    expect(await fullRefresh).toEqual({
      [filledCode]: null,
      [emptyCode]: null,
      [obsoleteCode]: null,
      [fullOnlyCode]: ['全量标签']
    })

    const reloaded = await page.evaluate(evaluateDictionary, { action: 'ensure', codes })
    expect(reloaded).toEqual({ [filledCode]: ['有效标签'], [emptyCode]: [] })
    expect(await page.evaluate(evaluateDictionary, { action: 'ensure', codes })).toEqual(reloaded)
    expect(codes.map((code) => counts.get(code))).toEqual([2, 2])
  } finally {
    releaseByCode.resolve()
    releaseFull.resolve()
  }
})

test('全量刷新完成后，较早发出的按类型结果不会覆盖新标签', async ({ page }) => {
  const code = 'concurrentFilled'
  const byCodeRequested = Promise.withResolvers<void>()
  const releaseByCode = Promise.withResolvers<void>()
  let byCodeRequests = 0

  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (!url.pathname.endsWith('/sys_dictionary')) return route.fulfill({ json: [] })

    const filter = url.searchParams.get('dict_type_table.code')
    if (filter === `eq.${code}`) {
      byCodeRequests++
      byCodeRequested.resolve()
      await releaseByCode.promise
      return route.fulfill({ json: [dictionaryItem(code, '旧标签')] })
    }
    return route.fulfill({ json: filter ? [] : [dictionaryItem(code, '新标签')] })
  })

  await openDictionaryTestPage(page)
  const ensuredByCode = page.evaluate(evaluateDictionary, { action: 'ensure', codes: [code] })
  try {
    await byCodeRequested.promise
    expect(await page.evaluate(evaluateDictionary, { action: 'refresh', codes: [code] })).toEqual({
      [code]: ['新标签']
    })
    releaseByCode.resolve()
    expect(await ensuredByCode).toEqual({ [code]: ['新标签'] })
    expect(await page.evaluate(evaluateDictionary, { action: 'ensure', codes: [code] })).toEqual({
      [code]: ['新标签']
    })
    expect(byCodeRequests).toBe(1)
  } finally {
    releaseByCode.resolve()
  }
})
