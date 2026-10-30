import { writeFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page, type Route, type TestInfo } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)

const fixture = '/tests/e2e/fixtures/treasury-accepted-state.html'
const accountSets = [
  {
    id: 'set-a',
    accountSetCode: 'A',
    accountSetName: 'A 账套',
    status: 'active',
    tenantId: 'tenant-a'
  },
  {
    id: 'set-b',
    accountSetCode: 'B',
    accountSetName: 'B 账套',
    status: 'active',
    tenantId: 'tenant-a'
  }
]
type Payload = Record<string, unknown>
type RpcHandler = (name: string, payload: Payload, route: Route) => Promise<boolean>

function records(rows: object[], total = rows.length, fieldAccess: object = {}) {
  return { records: rows, total, fieldAccess }
}

function payloadOf(route: Route): Payload {
  const value: unknown = route.request().postDataJSON()
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Read RPC payload must be an object')
  return value as Payload
}

async function mockTreasury(page: Page, handleRpc: RpcHandler) {
  const unexpectedWrites: string[] = []
  const deniedExternal: string[] = []
  const pageErrors: string[] = []
  const failedRequests: Array<{ name: string; to: number | null; error: string }> = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('requestfailed', (request) => {
    const name = new URL(request.url()).pathname.split('/').at(-1) ?? ''
    if (!name.startsWith('fms_')) return
    const payload = request.postDataJSON() as Payload | null
    failedRequests.push({
      name,
      to: typeof payload?.p_to === 'number' ? payload.p_to : null,
      error: request.failure()?.errorText ?? ''
    })
  })
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
    deniedExternal.push(url.pathname)
    return route.abort()
  })
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    if (request.method() === 'GET') {
      if (name === 'fms_currency')
        return route.fulfill({
          json: [{ id: 'currency-cny', currency_code: 'CNY', currency_name: '人民币' }]
        })
      return route.fallback()
    }
    if (request.method() !== 'POST' || !url.pathname.includes('/rpc/')) {
      unexpectedWrites.push(`${request.method()} ${name}`)
      return route.fulfill({ status: 403, json: { code: 'UNEXPECTED_WRITE' } })
    }
    if (name === 'current_is_super') return route.fulfill({ json: false })
    if (name === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    const payload = payloadOf(route)
    if (await handleRpc(name, payload, route)) return
    if (name === 'fms_list_account_set_options_secure') {
      const ids = Array.isArray(payload.p_ids) ? payload.p_ids : null
      const selected = ids ? accountSets.filter((item) => ids.includes(item.id)) : accountSets
      return route.fulfill({ json: records(selected) })
    }
    if (name === 'fms_list_fund_account_options_secure') return route.fulfill({ json: [] })
    if (name === 'fms_get_fund_account_overview_secure')
      return route.fulfill({
        json: {
          accountCount: 0,
          activeAccountCount: 0,
          foreignCurrencyAccountCount: 0,
          baseCurrencyCurrentBalance: 0,
          baseCurrencyAvailableBalance: 0,
          fieldAccess: {}
        }
      })
    if (
      [
        'fms_list_fund_accounts_secure',
        'fms_list_fund_ledger_entries_secure',
        'fms_list_fund_transfers_secure',
        'fms_list_bank_reconciliations_secure'
      ].includes(name)
    )
      return route.fulfill({ json: records([]) })
    unexpectedWrites.push(`POST ${name}`)
    return route.fulfill({ status: 403, json: { code: 'UNEXPECTED_RPC' } })
  })
  return { unexpectedWrites, deniedExternal, pageErrors, failedRequests }
}

async function assertUnclipped(locator: Locator, info: TestInfo, filename: string) {
  await expect(locator).toBeVisible()
  await locator.scrollIntoViewIfNeeded()
  const geometry = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      const x = /^(auto|scroll|hidden|clip)$/.test(style.overflowX)
      const y = /^(auto|scroll|hidden|clip)$/.test(style.overflowY)
      if (!x && !y) continue
      const bounds = parent.getBoundingClientRect()
      if (x) {
        clip.left = Math.max(clip.left, bounds.left)
        clip.right = Math.min(clip.right, bounds.right)
      }
      if (y) {
        clip.top = Math.max(clip.top, bounds.top)
        clip.bottom = Math.min(clip.bottom, bounds.bottom)
      }
    }
    return {
      bounds: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      clip
    }
  })
  await writeFile(info.outputPath(filename), JSON.stringify(geometry, null, 2))
  expect(geometry.bounds.left).toBeGreaterThanOrEqual(geometry.clip.left - 1)
  expect(geometry.bounds.right).toBeLessThanOrEqual(geometry.clip.right + 1)
  expect(geometry.bounds.top).toBeGreaterThanOrEqual(geometry.clip.top - 1)
  expect(geometry.bounds.bottom).toBeLessThanOrEqual(geometry.clip.bottom + 1)
}

function account(set: 'a' | 'b') {
  return {
    id: `account-${set}`,
    tenantId: 'tenant-a',
    accountSetId: `set-${set}`,
    currencyId: 'currency-cny',
    accountCode: `${set.toUpperCase()}-001`,
    accountName: `${set.toUpperCase()} 资金账户`,
    accountType: 'bank',
    status: 'active',
    isDefault: false,
    ledgerEntryCount: 0,
    bankName: `${set.toUpperCase()} 银行`,
    accountNoMasked: `****${set === 'a' ? '1111' : '2222'}`,
    currentBalance: set === 'a' ? 700 : 200,
    availableBalance: set === 'a' ? 690 : 180,
    fieldAccess: {
      accountDetails: set === 'a' ? 'read' : 'hidden',
      accountBalances: set === 'a' ? 'read' : 'hidden'
    }
  }
}

test('普通用户仅有真实菜单与动作授权时，账户和日记账仍接受列表与概览', async ({ page }) => {
  const calls: string[] = []
  const ledger = {
    id: 'ledger-ordinary',
    tenantId: 'tenant-a',
    entryNo: 'LEDGER-ORDINARY-001',
    entryDate: '2026-10-30',
    direction: 'inflow',
    sourceType: 'customer_receipt',
    status: 'posted',
    amount: 120,
    currencyCode: 'CNY',
    postedAt: '2026-10-30T09:00:00+08:00',
    fieldAccess: { ledgerAmounts: 'read' }
  }
  const evidence = await mockTreasury(page, async (name, _payload, route) => {
    if (name === 'fms_list_fund_accounts_secure') {
      calls.push(name)
      await route.fulfill({ json: records([account('a')], 1, { accountDetails: 'read' }) })
      return true
    }
    if (name === 'fms_get_fund_account_overview_secure') {
      calls.push(name)
      await route.fulfill({
        json: {
          accountCount: 1,
          activeAccountCount: 1,
          foreignCurrencyAccountCount: 0,
          baseCurrencyCurrentBalance: 700,
          baseCurrencyAvailableBalance: 690,
          fieldAccess: { accountBalances: 'read' }
        }
      })
      return true
    }
    if (name === 'fms_list_fund_ledger_entries_secure') {
      calls.push(name)
      await route.fulfill({ json: records([ledger], 1, { ledgerAmounts: 'read' }) })
      return true
    }
    return false
  })
  await page.goto(`${fixture}?mode=account`, { waitUntil: 'domcontentloaded' })
  const authorization = await page.evaluate(() => {
    const bridge = window as Window & {
      __treasuryAcceptedTest?: {
        authorization: () => { platformSuper: boolean; buttons: string[] }
      }
    }
    if (!bridge.__treasuryAcceptedTest) throw new Error('Treasury authorization bridge unavailable')
    return bridge.__treasuryAcceptedTest.authorization()
  })
  expect(authorization.platformSuper).toBe(false)
  expect(authorization.buttons).not.toContain('FinanceFundAccount:View')
  expect(authorization.buttons).not.toContain('FinanceFundJournal:View')
  expect(authorization.buttons).toContain('FinanceFundAccount:Add')
  const accountPage = page.locator('.fund-account-page')
  await expect(accountPage.getByText('A 资金账户', { exact: true })).toBeVisible()
  await expect(
    accountPage.locator('.business-workspace-header__metric').first().locator('strong')
  ).toHaveText('1')
  await page.evaluate(() => {
    const bridge = window as Window & {
      __treasuryAcceptedTest?: { navigate: (target: 'journal') => Promise<unknown> }
    }
    if (!bridge.__treasuryAcceptedTest) throw new Error('Treasury navigation bridge unavailable')
    return bridge.__treasuryAcceptedTest.navigate('journal')
  })
  const journalPage = page.locator('.fund-journal-page')
  await expect(journalPage.getByText('LEDGER-ORDINARY-001', { exact: true })).toBeVisible()
  await expect(
    journalPage.locator('.business-workspace-header__metric').first().locator('strong')
  ).toHaveText('1')
  expect(calls).toContain('fms_list_fund_accounts_secure')
  expect(calls).toContain('fms_get_fund_account_overview_secure')
  expect(calls.filter((name) => name === 'fms_list_fund_ledger_entries_secure')).toHaveLength(2)
  expect(evidence.unexpectedWrites).toEqual([])
  expect(evidence.deniedExternal).toEqual([])
  expect(evidence.pageErrors).toEqual([])
})

test('账户初始概览未知，A 迟到不能覆盖 B 严格字段权限与重试', async ({ page }, info) => {
  let releaseInitial!: () => void
  const initialHold = new Promise<void>((resolve) => (releaseInitial = resolve))
  let initialSeen!: () => void
  const initialStarted = new Promise<void>((resolve) => (initialSeen = resolve))
  let releaseAList!: () => void
  let releaseAOverview!: () => void
  const aListHold = new Promise<void>((resolve) => (releaseAList = resolve))
  const aOverviewHold = new Promise<void>((resolve) => (releaseAOverview = resolve))
  let aListCalls = 0
  let aOverviewCalls = 0
  let failBOverview = false
  let bOverviewCalls = 0
  const evidence = await mockTreasury(page, async (name, payload, route) => {
    if (name === 'fms_list_fund_accounts_secure') {
      const set = payload.p_account_set_id
      if (set === 'set-a') {
        aListCalls += 1
        await aListHold
      }
      const selected = set === 'set-a' ? 'a' : set === 'set-b' ? 'b' : null
      try {
        await route.fulfill({
          json: records(selected ? [account(selected)] : [], selected ? 1 : 0, {
            accountDetails: selected === 'a' ? 'read' : 'hidden',
            accountBalances: selected === 'a' ? 'read' : 'hidden'
          })
        })
      } catch {
        // A may already be aborted by the browser.
      }
      return true
    }
    if (name === 'fms_get_fund_account_overview_secure') {
      const set = payload.p_account_set_id
      if (!set) {
        initialSeen()
        await initialHold
      }
      if (set === 'set-a') {
        aOverviewCalls += 1
        await aOverviewHold
      }
      if (set === 'set-b') bOverviewCalls += 1
      if (set === 'set-b' && failBOverview)
        await route.fulfill({
          status: 400,
          json: { code: 'XX000', message: 'synthetic overview failure' }
        })
      else
        try {
          await route.fulfill({
            json: {
              accountCount: set === 'set-a' ? 7 : set === 'set-b' ? 2 : 0,
              activeAccountCount: set === 'set-a' ? 6 : set === 'set-b' ? 1 : 0,
              foreignCurrencyAccountCount: 0,
              baseCurrencyCurrentBalance: set === 'set-a' ? 700 : 200,
              baseCurrencyAvailableBalance: set === 'set-a' ? 690 : 180,
              fieldAccess: { accountBalances: set === 'set-a' ? 'read' : 'hidden' }
            }
          })
        } catch {
          // A may already be aborted by the browser.
        }
      return true
    }
    return false
  })
  try {
    await page.goto(`${fixture}?mode=account`, { waitUntil: 'domcontentloaded' })
    const root = page.locator('.fund-account-page')
    await expect(root).toBeVisible()
    await initialStarted
    const firstMetric = root.locator('.business-workspace-header__metric').first()
    await expect(firstMetric).toHaveAttribute('aria-busy', 'true')
    await expect(firstMetric.locator('strong')).toHaveCount(0)
    releaseInitial()
    const accountSet = root
      .locator('.art-search-bar .el-form-item')
      .filter({ hasText: '所属账套' })
      .locator('.el-select')
    await expect(accountSet).toBeVisible()
    await accountSet.click()
    await page.getByRole('option', { name: 'A 账套（A）' }).click()
    await expect.poll(() => aListCalls).toBeGreaterThan(0)
    await expect.poll(() => aOverviewCalls).toBeGreaterThan(0)
    await accountSet.click()
    await page.getByRole('option', { name: 'B 账套（B）' }).click()
    await expect(root.getByText('B 资金账户', { exact: true })).toBeVisible()
    await expect(root.getByRole('columnheader', { name: '开户机构' })).toHaveCount(0)
    await expect(root.getByRole('columnheader', { name: '当前 / 可用余额' })).toHaveCount(0)
    await expect(root.getByPlaceholder('账户编码或名称')).toBeVisible()
    await expect(root.getByRole('button', { name: /资金账户.*2/ })).toBeVisible()
    await expect
      .poll(
        () =>
          evidence.failedRequests.filter((item) => item.name === 'fms_list_fund_accounts_secure')
            .length
      )
      .toBeGreaterThan(0)
    releaseAList()
    releaseAOverview()
    await expect(root.getByText('A 资金账户', { exact: true })).toHaveCount(0)
    await expect(root.getByRole('columnheader', { name: '开户机构' })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('account-b-restricted.png'), fullPage: true })

    failBOverview = true
    await root.getByRole('button', { name: /资金账户.*2/ }).click()
    await expect(root.getByText('资金账户概览加载失败，当前指标暂不可用。')).toBeVisible()
    await expect(root.getByRole('button', { name: '重新加载概览' })).toBeVisible()
    failBOverview = false
    await root.getByRole('button', { name: '重新加载概览' }).click()
    await expect(root.getByRole('button', { name: /资金账户.*2/ })).toBeVisible()
    expect(bOverviewCalls).toBeGreaterThanOrEqual(3)
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    expect(evidence.unexpectedWrites).toEqual([])
    expect(evidence.deniedExternal).toEqual([])
    expect(evidence.pageErrors).toEqual([])
  } finally {
    releaseInitial()
    releaseAList()
    releaseAOverview()
  }
})

test('日记账列表和概览两次 RPC 同随旧作用域取消，B 空结果保持接受态', async ({ page }, info) => {
  let releaseA!: () => void
  const heldA = new Promise<void>((resolve) => (releaseA = resolve))
  let scope: 'a' | 'b' = 'a'
  const ranges = { a: [] as number[], b: [] as number[] }
  const evidence = await mockTreasury(page, async (name, payload, route) => {
    if (name !== 'fms_list_fund_ledger_entries_secure') return false
    const end = payload.p_to
    if (typeof end !== 'number') throw new Error('Ledger range missing')
    ranges[scope].push(end)
    if (scope === 'a') await heldA
    try {
      await route.fulfill({ json: records([]) })
    } catch {
      // The old pair may already be aborted by the browser.
    }
    return true
  })
  try {
    await page.goto(`${fixture}?mode=journal&scope-test=1`, { waitUntil: 'domcontentloaded' })
    const root = page.locator('.fund-journal-page')
    await expect(root).toBeVisible()
    await expect.poll(() => ranges.a.length).toBe(2)
    const firstMetric = root.locator('.business-workspace-header__metric').first()
    await expect(firstMetric).toHaveAttribute('aria-busy', 'true')
    await expect(firstMetric.locator('strong')).toHaveCount(0)
    scope = 'b'
    await page.evaluate(() => {
      const bridge = window as Window & {
        __treasuryAcceptedTest?: { switchTenant: (tenantId: string) => void }
      }
      if (!bridge.__treasuryAcceptedTest)
        throw new Error('Treasury fixture scope bridge unavailable')
      bridge.__treasuryAcceptedTest.switchTenant('tenant-b')
    })
    await expect.poll(() => ranges.b.length).toBe(2)
    await expect(
      root.locator('.business-workspace-header__metric').first().locator('strong')
    ).toHaveText('0')
    await expect(root.locator('.el-table__row')).toHaveCount(0)
    await expect
      .poll(() =>
        evidence.failedRequests
          .filter((item) => item.name === 'fms_list_fund_ledger_entries_secure')
          .map((item) => item.to)
          .sort((left, right) => (left ?? 0) - (right ?? 0))
      )
      .toEqual([19, 999])
    releaseA()
    await expect(
      root.locator('.business-workspace-header__metric').first().locator('strong')
    ).toHaveText('0')
    await expect(root.locator('.el-table__row')).toHaveCount(0)
    expect(ranges.a.sort((left, right) => left - right)).toEqual([19, 999])
    expect(ranges.b.sort((left, right) => left - right)).toEqual([19, 999])
    expect(evidence.unexpectedWrites).toEqual([])
    expect(evidence.deniedExternal).toEqual([])
    expect(evidence.pageErrors).toEqual([])
    await page.screenshot({ path: info.outputPath('journal-b-empty-accepted.png'), fullPage: true })
  } finally {
    releaseA()
  }
})

test('日记账列表先完成可见，概览迟到失败只使指标未知且不清列表', async ({ page }, info) => {
  let releaseSummary!: () => void
  const summaryHold = new Promise<void>((resolve) => (releaseSummary = resolve))
  let summaryStarted!: () => void
  const summarySeen = new Promise<void>((resolve) => (summaryStarted = resolve))
  let summaryCalls = 0
  let listCalls = 0
  const row = {
    id: 'ledger-a',
    tenantId: 'tenant-a',
    entryNo: 'LEDGER-ACCEPTED-001',
    entryDate: '2026-10-30',
    direction: 'inflow',
    sourceType: 'customer_receipt',
    status: 'posted',
    amount: 120,
    currencyCode: 'CNY',
    postedAt: '2026-10-30T09:00:00+08:00',
    fieldAccess: { ledgerAmounts: 'read' }
  }
  const evidence = await mockTreasury(page, async (name, payload, route) => {
    if (name !== 'fms_list_fund_ledger_entries_secure') return false
    if (payload.p_to === 999) {
      summaryCalls += 1
      if (summaryCalls === 1) {
        summaryStarted()
        await summaryHold
        await route.fulfill({
          status: 400,
          json: { code: 'XX000', message: 'synthetic summary failure' }
        })
      } else await route.fulfill({ json: records([row], 1, { ledgerAmounts: 'read' }) })
    } else {
      listCalls += 1
      await route.fulfill({ json: records([row], 1, { ledgerAmounts: 'read' }) })
    }
    return true
  })
  try {
    await page.goto(`${fixture}?mode=journal`, { waitUntil: 'domcontentloaded' })
    const root = page.locator('.fund-journal-page')
    const query = root.locator('.art-table-query')
    await summarySeen
    await expect(root.getByText('LEDGER-ACCEPTED-001', { exact: true })).toBeVisible()
    await expect(query.locator('.el-loading-mask:visible')).toHaveCount(0)
    await expect(query.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    const firstMetric = root.locator('.business-workspace-header__metric').first()
    await expect(firstMetric).toHaveAttribute('aria-busy', 'true')
    await expect(firstMetric.locator('strong')).toHaveCount(0)
    await page.screenshot({
      path: info.outputPath('journal-list-before-overview.png'),
      fullPage: true
    })
    releaseSummary()
    await expect(root.getByText('资金流水概览加载失败，当前指标暂不可用。')).toBeVisible()
    await expect(root.getByText('LEDGER-ACCEPTED-001', { exact: true })).toBeVisible()
    await expect(query.locator('.el-loading-mask:visible')).toHaveCount(0)
    await expect(
      root.locator('.business-workspace-header__metric').first().locator('strong')
    ).toHaveText('--')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await page.screenshot({
      path: info.outputPath('journal-list-preserved-after-overview-error.png'),
      fullPage: true
    })
    await root.getByRole('button', { name: '重新加载概览', exact: true }).click()
    await expect(
      root.locator('.business-workspace-header__metric').first().locator('strong')
    ).toHaveText('1')
    await expect(root.getByText('LEDGER-ACCEPTED-001', { exact: true })).toBeVisible()
    expect(listCalls).toBeGreaterThanOrEqual(2)
    expect(summaryCalls).toBeGreaterThanOrEqual(2)
    expect(evidence.unexpectedWrites).toEqual([])
    expect(evidence.deniedExternal).toEqual([])
    expect(evidence.pageErrors).toEqual([])
    await expect(page.getByText('synthetic summary failure')).toHaveCount(0)
  } finally {
    releaseSummary()
  }
})

test('调拨账户选项 A 慢 B 快，旧账户选项取消后不回写', async ({ page }, info) => {
  let releaseA!: () => void
  const heldA = new Promise<void>((resolve) => (releaseA = resolve))
  let aCalls = 0
  let bCalls = 0
  const evidence = await mockTreasury(page, async (name, payload, route) => {
    if (name === 'fms_list_fund_transfers_secure') {
      await route.fulfill({ json: records([], 0, { transferAccounts: 'read' }) })
      return true
    }
    if (name !== 'fms_list_fund_account_options_secure') return false
    const set = payload.p_account_set_id
    if (set === 'set-a') {
      aCalls += 1
      await heldA
    }
    if (set === 'set-b') bCalls += 1
    try {
      await route.fulfill({
        json: [
          {
            id: `option-${set}`,
            accountSetId: set,
            accountName: set === 'set-a' ? 'A 账户' : 'B 账户',
            accountNoMasked: set === 'set-a' ? '****1111' : '****2222',
            accountType: 'bank',
            status: 'active'
          }
        ]
      })
    } catch {
      // A may already be aborted by the browser.
    }
    return true
  })
  try {
    await page.goto(`${fixture}?mode=transfer`, { waitUntil: 'domcontentloaded' })
    const root = page.locator('.fund-transfer-page')
    const accountSet = root
      .locator('.art-search-bar .el-form-item')
      .filter({ hasText: '所属账套' })
      .locator('.el-select')
    await expect(accountSet).toBeVisible()
    await accountSet.click()
    await page.getByRole('option', { name: 'A 账套（A）' }).click()
    await expect.poll(() => aCalls).toBe(1)
    await accountSet.click()
    await page.getByRole('option', { name: 'B 账套（B）' }).click()
    await expect.poll(() => bCalls).toBe(1)
    const accountFilter = root
      .locator('.art-search-bar .el-form-item')
      .filter({ hasText: '调拨账户' })
      .locator('.el-select')
    await expect(accountFilter).toBeVisible()
    await accountFilter.click()
    const dropdown = page.locator('.el-select-dropdown:visible')
    await expect(dropdown.getByRole('option', { name: 'B 账户（****2222）' })).toBeVisible()
    await expect(dropdown.getByRole('option', { name: 'A 账户（****1111）' })).toHaveCount(0)
    releaseA()
    await expect
      .poll(
        () =>
          evidence.failedRequests.filter(
            (item) => item.name === 'fms_list_fund_account_options_secure'
          ).length
      )
      .toBeGreaterThan(0)
    await expect(dropdown.getByRole('option', { name: 'A 账户（****1111）' })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath('transfer-b-options-only.png'), fullPage: true })
    expect(evidence.unexpectedWrites).toEqual([])
    expect(evidence.deniedExternal).toEqual([])
    expect(evidence.pageErrors).toEqual([])
  } finally {
    releaseA()
  }
})

function transfer(index: number) {
  return {
    id: `transfer-${index}`,
    tenantId: 'tenant-a',
    accountSetId: 'set-a',
    transferNo: `TRF-${String(index).padStart(4, '0')}`,
    transferDate: '2026-10-30',
    updateTime: '2026-10-30T09:00:00+08:00',
    sourceAccountName: 'A 银行',
    targetAccountName: 'B 银行',
    sourceAccountNoMasked: '****1111',
    targetAccountNoMasked: '****2222',
    currencyCode: 'CNY',
    amount: 10,
    feeAmount: 0,
    status: 'completed',
    purpose: '合成测试调拨',
    fieldAccess: { transferAccounts: 'read', transferAmounts: 'read' }
  }
}

function bankBatch(index: number) {
  return {
    id: `batch-${index}`,
    tenantId: 'tenant-a',
    accountSetId: 'set-a',
    batchNo: `BANK-${String(index).padStart(4, '0')}`,
    accountName: 'A 银行',
    accountNoMasked: '****1111',
    currencyCode: 'CNY',
    statementStartDate: '2026-10-01',
    statementEndDate: '2026-10-30',
    closingBalance: 100,
    statementBalanceDifference: 0,
    matchedCount: 0,
    ignoredCount: 0,
    lineCount: 1,
    unmatchedCount: 1,
    partialCount: 0,
    status: 'reconciling',
    fieldAccess: { accountDetails: 'read', statementAmounts: 'read', bankReferences: 'read' }
  }
}

test('两笔已完成调拨币种不同只显示笔数，金额不跨币种相加', async ({ page }, info) => {
  const rows = [
    { ...transfer(1), currencyCode: 'CNY', amount: 10 },
    { ...transfer(2), currencyCode: 'USD', amount: 20 }
  ]
  const evidence = await mockTreasury(page, async (name, _payload, route) => {
    if (name !== 'fms_list_fund_transfers_secure') return false
    await route.fulfill({
      json: records(rows, 2, { transferAccounts: 'read', transferAmounts: 'read' })
    })
    return true
  })
  await page.goto(`${fixture}?mode=transfer`, { waitUntil: 'domcontentloaded' })
  const root = page.locator('.fund-transfer-page')
  await expect(root.getByText('TRF-0001', { exact: true })).toBeVisible()
  await expect(root.getByText('TRF-0002', { exact: true })).toBeVisible()
  const completed = root
    .locator('.business-workspace-header__metric')
    .filter({ hasText: '已完成调拨' })
  await expect(completed.locator('strong')).toHaveText('2')
  await expect(completed).toContainText('多币种金额不合计')
  await expect(completed).not.toContainText('30.00')
  expect(evidence.unexpectedWrites).toEqual([])
  expect(evidence.deniedExternal).toEqual([])
  expect(evidence.pageErrors).toEqual([])
  await page.screenshot({
    path: info.outputPath('transfer-mixed-currency-count-only.png'),
    fullPage: true
  })
})

for (const scenario of [
  {
    mode: 'transfer',
    root: '.fund-transfer-page',
    rpc: 'fms_list_fund_transfers_secure',
    firstMetric: '全部调拨',
    row: transfer,
    firstRow: 'TRF-0001',
    emptyText: '暂无资金调拨',
    access: { transferAccounts: 'read', transferAmounts: 'read' }
  },
  {
    mode: 'bank',
    root: '.bank-reconciliation-page',
    rpc: 'fms_list_bank_reconciliations_secure',
    firstMetric: '对账批次',
    row: bankBatch,
    firstRow: 'BANK-0001',
    emptyText: '暂无银行对账批次',
    access: { accountDetails: 'read', statementAmounts: 'read', bankReferences: 'read' }
  }
] as const) {
  test(`${scenario.mode} 总数 1001 时不把前 1000 条当完整金额或状态汇总`, async ({
    page
  }, info) => {
    const reads: number[] = []
    const evidence = await mockTreasury(page, async (name, payload, route) => {
      if (name !== scenario.rpc) return false
      const to = payload.p_to
      if (typeof to !== 'number') throw new Error('Treasury range missing')
      reads.push(to)
      const rows =
        to === 999
          ? Array.from({ length: 1000 }, (_, index) => scenario.row(index + 1))
          : [scenario.row(1)]
      await route.fulfill({ json: records(rows, 1001, scenario.access) })
      return true
    })
    await page.goto(`${fixture}?mode=${scenario.mode}`, { waitUntil: 'domcontentloaded' })
    const root = page.locator(scenario.root)
    await expect(root).toBeVisible()
    await expect(root.getByText(scenario.firstRow, { exact: true })).toBeVisible()
    const metric = root
      .locator('.business-workspace-header__metric')
      .filter({ hasText: scenario.firstMetric })
      .locator('strong')
    await expect(metric).toHaveText('1001')
    const values = await root.locator('.business-workspace-header__metric strong').allTextContents()
    expect(values).toHaveLength(4)
    expect(values.slice(1).every((value) => value.trim() === '--')).toBe(true)
    await expect(root.getByText(/概览超过 1000 条/)).toBeVisible()
    expect(reads).toContain(999)
    expect(reads.some((value) => value < 999)).toBe(true)
    expect(evidence.unexpectedWrites).toEqual([])
    expect(evidence.deniedExternal).toEqual([])
    expect(evidence.pageErrors).toEqual([])
    await page.screenshot({
      path: info.outputPath(`${scenario.mode}-over-1000-unknown.png`),
      fullPage: true
    })
  })

  test(`${scenario.mode} 列表与概览失败未知、手动重试后空结果`, async ({ page }, info) => {
    if (scenario.mode === 'bank') await page.setViewportSize({ width: 570, height: 900 })
    let fail = true
    const reads: number[] = []
    const evidence = await mockTreasury(page, async (name, payload, route) => {
      if (name !== scenario.rpc) return false
      const to = payload.p_to
      if (typeof to !== 'number') throw new Error('Treasury range missing')
      reads.push(to)
      if (fail)
        await route.fulfill({
          status: 400,
          json: { code: 'XX000', message: 'synthetic read failure' }
        })
      else await route.fulfill({ json: records([]) })
      return true
    })
    await page.goto(
      `${fixture}?mode=${scenario.mode}${scenario.mode === 'bank' ? '&theme=dark' : ''}`,
      { waitUntil: 'domcontentloaded' }
    )
    if (scenario.mode === 'bank') await expect(page.locator('html')).toHaveClass(/dark/)
    const root = page.locator(scenario.root)
    await expect(root).toBeVisible()
    await expect(root.getByText('数据加载失败', { exact: true })).toBeVisible()
    await expect(
      root.locator('.business-workspace-header__metric').first().locator('strong')
    ).toHaveText('--')
    await expect(root.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    fail = false
    const before = reads.length
    await root.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(root.getByText(scenario.emptyText, { exact: true })).toBeVisible()
    await expect(
      root.locator('.business-workspace-header__metric').first().locator('strong')
    ).toHaveText('--')
    await expect(root.getByRole('button', { name: '重新加载概览', exact: true })).toBeVisible()
    await root.getByRole('button', { name: '重新加载概览', exact: true }).click()
    await expect(
      root.locator('.business-workspace-header__metric').first().locator('strong')
    ).toHaveText('0')
    expect(reads.length).toBeGreaterThan(before)
    expect(evidence.unexpectedWrites).toEqual([])
    expect(evidence.deniedExternal).toEqual([])
    expect(evidence.pageErrors).toEqual([])
    await expect(page.getByText('synthetic read failure')).toHaveCount(0)
    if (scenario.mode === 'bank')
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
    await page.screenshot({
      path: info.outputPath(`${scenario.mode}-empty-after-retry.png`),
      fullPage: true
    })
  })
}

type TreasuryMode = 'account' | 'journal' | 'transfer' | 'bank' | 'idle'

async function navigateFixture(page: Page, mode: TreasuryMode) {
  await page.evaluate(async (target) => {
    const bridge = window as Window & {
      __treasuryAcceptedTest?: {
        switchTenant: (tenantId: string) => void
        navigate: (mode: TreasuryMode) => Promise<unknown>
      }
    }
    if (!bridge.__treasuryAcceptedTest) throw new Error('Treasury route fixture bridge unavailable')
    await bridge.__treasuryAcceptedTest.navigate(target)
  }, mode)
}

for (const scenario of [
  { mode: 'account', root: '.fund-account-page', rpc: 'fms_list_fund_accounts_secure' },
  { mode: 'journal', root: '.fund-journal-page', rpc: 'fms_list_fund_ledger_entries_secure' },
  { mode: 'transfer', root: '.fund-transfer-page', rpc: 'fms_list_fund_transfers_secure' },
  { mode: 'bank', root: '.bank-reconciliation-page', rpc: 'fms_list_bank_reconciliations_secure' }
] as const) {
  test(`${scenario.mode} KeepAlive 离页取消旧读，非活动切租户不读，返回只接受新租户`, async ({
    page
  }, info) => {
    let releaseA!: () => void
    const heldA = new Promise<void>((resolve) => (releaseA = resolve))
    let phase: 'a' | 'b' = 'a'
    const calls = { a: 0, b: 0 }
    const labelA = `A-${scenario.mode}-记录`
    const labelB = `B-${scenario.mode}-记录`
    const ledger = (label: string, tenantId: string) => ({
      id: `ledger-${label}`,
      tenantId,
      entryNo: label,
      entryDate: '2026-10-30',
      direction: 'inflow',
      sourceType: 'customer_receipt',
      status: 'posted',
      amount: 120,
      currencyCode: 'CNY',
      postedAt: '2026-10-30T09:00:00+08:00',
      fieldAccess: { ledgerAmounts: 'read' }
    })
    const access =
      scenario.mode === 'account'
        ? { accountDetails: 'read', accountBalances: 'read' }
        : scenario.mode === 'journal'
          ? { ledgerAmounts: 'read' }
          : scenario.mode === 'transfer'
            ? { transferAccounts: 'read', transferAmounts: 'read' }
            : { accountDetails: 'read', statementAmounts: 'read', bankReferences: 'read' }
    const evidence = await mockTreasury(page, async (name, _payload, route) => {
      if (scenario.mode === 'account' && name === 'fms_get_fund_account_overview_secure') {
        const requestPhase = phase
        calls[requestPhase] += 1
        if (requestPhase === 'a') await heldA
        try {
          await route.fulfill({
            json: {
              accountCount: requestPhase === 'a' ? 7 : 1,
              activeAccountCount: requestPhase === 'a' ? 6 : 1,
              foreignCurrencyAccountCount: 0,
              baseCurrencyCurrentBalance: 120,
              baseCurrencyAvailableBalance: 120,
              fieldAccess: { accountBalances: 'read' }
            }
          })
        } catch {
          // The deactivated A page may have aborted this old request.
        }
        return true
      }
      if (name !== scenario.rpc) return false
      const requestPhase = phase
      calls[requestPhase] += 1
      if (requestPhase === 'a') await heldA
      const label = requestPhase === 'a' ? labelA : labelB
      const tenantId = requestPhase === 'a' ? 'tenant-a' : 'tenant-b'
      const row =
        scenario.mode === 'account'
          ? {
              ...account('a'),
              id: `account-${label}`,
              tenantId,
              accountCode: label,
              accountName: label,
              fieldAccess: access
            }
          : scenario.mode === 'journal'
            ? ledger(label, tenantId)
            : scenario.mode === 'transfer'
              ? { ...transfer(1), id: `transfer-${label}`, tenantId, transferNo: label }
              : { ...bankBatch(1), id: `bank-${label}`, tenantId, batchNo: label }
      try {
        await route.fulfill({ json: records([row], 1, access) })
      } catch {
        // The deactivated A page may have aborted this old request.
      }
      return true
    })
    try {
      await page.goto(`${fixture}?mode=${scenario.mode}&scope-test=1`, {
        waitUntil: 'domcontentloaded'
      })
      const root = page.locator(scenario.root)
      await expect(root).toBeVisible()
      await expect.poll(() => calls.a).toBeGreaterThanOrEqual(2)
      await navigateFixture(page, 'idle')
      await expect(page.getByTestId('treasury-idle')).toBeVisible()
      await expect
        .poll(() => evidence.failedRequests.filter((item) => item.name === scenario.rpc).length)
        .toBeGreaterThan(0)
      phase = 'b'
      await page.evaluate(() => {
        const bridge = window as Window & {
          __treasuryAcceptedTest?: { switchTenant: (tenantId: string) => void }
        }
        if (!bridge.__treasuryAcceptedTest)
          throw new Error('Treasury scope fixture bridge unavailable')
        bridge.__treasuryAcceptedTest.switchTenant('tenant-b')
      })
      await page.waitForTimeout(150)
      expect(calls.b).toBe(0)
      await navigateFixture(page, scenario.mode)
      await expect(root.getByText(labelB, { exact: true })).toBeVisible()
      await expect(root.getByText(labelA, { exact: true })).toHaveCount(0)
      await expect.poll(() => calls.b).toBeGreaterThanOrEqual(2)
      releaseA()
      await page.waitForTimeout(100)
      await expect(root.getByText(labelB, { exact: true })).toBeVisible()
      await expect(root.getByText(labelA, { exact: true })).toHaveCount(0)
      expect(evidence.unexpectedWrites).toEqual([])
      expect(evidence.deniedExternal).toEqual([])
      expect(evidence.pageErrors).toEqual([])
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      await page.screenshot({
        path: info.outputPath(`${scenario.mode}-return-b-accepted.png`),
        fullPage: true
      })
    } finally {
      releaseA()
    }
  })
}

for (const scenario of [
  { mode: 'account', root: '.fund-account-page', rpc: 'fms_list_fund_accounts_secure' },
  { mode: 'journal', root: '.fund-journal-page', rpc: 'fms_list_fund_ledger_entries_secure' },
  { mode: 'transfer', root: '.fund-transfer-page', rpc: 'fms_list_fund_transfers_secure' },
  { mode: 'bank', root: '.bank-reconciliation-page', rpc: 'fms_list_bank_reconciliations_secure' }
] as const) {
  test(`${scenario.mode} 专注保留筛选与表格，隐藏指标和兄弟提示并可双方式退出`, async ({
    page
  }, info) => {
    if (scenario.mode === 'bank') await page.setViewportSize({ width: 570, height: 900 })
    const evidence = await mockTreasury(page, async (name, payload, route) => {
      if (scenario.mode === 'account' && name === 'fms_get_fund_account_overview_secure') {
        await route.fulfill({
          status: 400,
          json: { code: 'XX000', message: 'synthetic overview failure' }
        })
        return true
      }
      if (name !== scenario.rpc) return false
      const to = payload.p_to
      if (scenario.mode === 'journal' && to === 999) {
        await route.fulfill({
          status: 400,
          json: { code: 'XX000', message: 'synthetic overview failure' }
        })
        return true
      }
      if (scenario.mode === 'transfer' || scenario.mode === 'bank') {
        const row = scenario.mode === 'transfer' ? transfer(1) : bankBatch(1)
        const access =
          scenario.mode === 'transfer'
            ? { transferAccounts: 'read', transferAmounts: 'read' }
            : { accountDetails: 'read', statementAmounts: 'read', bankReferences: 'read' }
        await route.fulfill({ json: records([row], to === 999 ? 1001 : 1, access) })
      } else await route.fulfill({ json: records([]) })
      return true
    })
    await page.goto(
      `${fixture}?mode=${scenario.mode}${scenario.mode === 'bank' ? '&theme=dark' : ''}`,
      { waitUntil: 'domcontentloaded' }
    )
    const root = page.locator(scenario.root)
    const query = root.locator('.art-table-query')
    const header = root.locator('.business-workspace-header')
    const alerts = root.locator(':scope > .el-alert:visible')
    await expect(header).toBeVisible()
    await expect(query.locator('.el-table')).toBeVisible()
    await expect(alerts.first()).toBeVisible()
    await assertTableFocusContract(page, info)
    await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
    await expect(query).toHaveClass(/is-focus-mode/)
    await expect(header).toBeHidden()
    await expect(root.locator('.business-workspace-header__metric:visible')).toHaveCount(0)
    await expect(alerts).toHaveCount(0)
    await assertUnclipped(
      query.locator('.art-search-bar').first(),
      info,
      `${scenario.mode}-focus-search.json`
    )
    await assertUnclipped(
      query.locator('.el-table').first(),
      info,
      `${scenario.mode}-focus-table.json`
    )
    const pagination = query.locator('.el-pagination')
    if (await pagination.count())
      await assertUnclipped(pagination.first(), info, `${scenario.mode}-focus-pagination.json`)
    await page.mouse.move(1, 1)
    await expect(page.locator('.el-popper[role="tooltip"]:visible')).toHaveCount(0)
    await page.screenshot({
      path: info.outputPath(`${scenario.mode}-focus-accepted.png`),
      fullPage: true
    })
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(header).toBeVisible()
    await expect(alerts.first()).toBeVisible()
    expect(evidence.unexpectedWrites).toEqual([])
    expect(evidence.deniedExternal).toEqual([])
    expect(evidence.pageErrors).toEqual([])
  })
}
