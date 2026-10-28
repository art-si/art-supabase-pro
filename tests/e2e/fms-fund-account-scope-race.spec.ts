import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(420_000)

const accountSets = [
  {
    id: 'set-a',
    accountSetCode: 'A',
    accountSetName: 'A 账套',
    status: 'active',
    tenantId: 'tenant-test'
  },
  {
    id: 'set-b',
    accountSetCode: 'B',
    accountSetName: 'B 账套',
    status: 'active',
    tenantId: 'tenant-test'
  }
]

const account = (set: 'a' | 'b') => ({
  id: `account-${set}`,
  tenantId: 'tenant-test',
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
})

test('切账套丢弃 A 迟到权限与概览，B 失败保留可重试反馈', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let releaseAList = () => {}
  let releaseAOverview = () => {}
  const holdAList = new Promise<void>((resolve) => (releaseAList = resolve))
  const holdAOverview = new Promise<void>((resolve) => (releaseAOverview = resolve))
  let aListCalls = 0
  let aOverviewCalls = 0
  let bListCalls = 0
  let bOverviewCalls = 0
  let aSettled = 0
  let failNextBList = false
  let failNextBOverview = false

  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/rpc/fms_list_account_set_options_secure', (route) => {
    const payload = route.request().postDataJSON()
    const ids = Array.isArray(payload.p_ids) ? payload.p_ids : null
    const rows = ids ? accountSets.filter((item) => ids.includes(item.id)) : accountSets
    return route.fulfill({ json: { records: rows, total: rows.length } })
  })
  await page.route('**/rest/v1/fms_currency?*', (route) =>
    route.fulfill({
      json: [{ id: 'currency-cny', currency_code: 'CNY', currency_name: '人民币' }]
    })
  )
  await page.route('**/rest/v1/rpc/fms_list_fund_accounts_secure', async (route) => {
    const setId = route.request().postDataJSON().p_account_set_id
    if (setId === 'set-a') {
      aListCalls++
      await holdAList
    }
    if (setId === 'set-b') bListCalls++
    if (setId === 'set-b' && failNextBList) {
      failNextBList = false
      return route.fulfill({ status: 503, json: { code: 'XX000', message: '测试 B 列表失败' } })
    }
    const set = setId === 'set-a' ? 'a' : setId === 'set-b' ? 'b' : null
    const rows = set ? [account(set)] : []
    await route.fulfill({
      json: {
        records: rows,
        total: rows.length,
        fieldAccess: {
          accountDetails: set === 'a' ? 'read' : 'hidden',
          accountBalances: set === 'a' ? 'read' : 'hidden'
        }
      }
    })
    if (set === 'a') aSettled++
  })
  await page.route('**/rest/v1/rpc/fms_get_fund_account_overview_secure', async (route) => {
    const setId = route.request().postDataJSON().p_account_set_id
    if (setId === 'set-a') {
      aOverviewCalls++
      await holdAOverview
    }
    if (setId === 'set-b') bOverviewCalls++
    if (setId === 'set-b' && failNextBOverview) {
      failNextBOverview = false
      return route.fulfill({ status: 503, json: { code: 'XX000', message: '测试 B 概览失败' } })
    }
    await route.fulfill({
      json: {
        accountCount: setId === 'set-a' ? 7 : setId === 'set-b' ? 2 : 0,
        activeAccountCount: setId === 'set-a' ? 6 : setId === 'set-b' ? 1 : 0,
        foreignCurrencyAccountCount: 0,
        baseCurrencyCurrentBalance: setId === 'set-a' ? 700 : 200,
        baseCurrencyAvailableBalance: setId === 'set-a' ? 690 : 180,
        fieldAccess: { accountBalances: setId === 'set-a' ? 'read' : 'hidden' }
      }
    })
    if (setId === 'set-a') aSettled++
  })

  await page.goto('/tests/e2e/fixtures/fms-fund-account-scope.html', {
    waitUntil: 'commit',
    timeout: 180_000
  })
  const pageRoot = page.locator('.fund-account-page')
  await expect(pageRoot).toBeVisible({ timeout: 120_000 })
  const accountSet = pageRoot
    .locator('.art-search-bar .el-form-item')
    .filter({ hasText: '所属账套' })
    .locator('.el-select')
  await expect(accountSet).toBeVisible({ timeout: 120_000 })
  await accountSet.click()
  await page.getByRole('option', { name: 'A 账套（A）' }).click()
  await expect.poll(() => aListCalls).toBe(1)
  await expect.poll(() => aOverviewCalls).toBe(1)
  await accountSet.click()
  await page.getByRole('option', { name: 'B 账套（B）' }).click()
  await expect(pageRoot.getByText('B 资金账户', { exact: true })).toBeVisible()
  expect(bListCalls).toBe(1)
  expect(bOverviewCalls).toBe(1)
  await expect(pageRoot.getByRole('columnheader', { name: '开户机构' })).toHaveCount(0)
  await expect(pageRoot.getByRole('columnheader', { name: '当前 / 可用余额' })).toHaveCount(0)
  await expect(pageRoot.getByPlaceholder('账户编码或名称')).toBeVisible()
  await expect(pageRoot.getByRole('button', { name: /资金账户.*2/ })).toBeVisible()
  releaseAList()
  releaseAOverview()
  await expect.poll(() => aSettled).toBe(2)
  await expect(pageRoot.getByText('A 资金账户', { exact: true })).toHaveCount(0)
  await expect(pageRoot.getByRole('columnheader', { name: '开户机构' })).toHaveCount(0)
  await expect(pageRoot.getByRole('columnheader', { name: '当前 / 可用余额' })).toHaveCount(0)
  await expect(pageRoot.getByRole('button', { name: /资金账户.*2/ })).toBeVisible()
  await page.screenshot({ path: info.outputPath('fund-account-b-scope.png') })

  failNextBOverview = true
  await pageRoot.getByRole('button', { name: /资金账户.*2/ }).click()
  await expect(pageRoot.getByText('资金账户概览加载失败，当前指标暂不可用。')).toBeVisible()
  await expect(pageRoot.getByRole('button', { name: '重新加载概览' })).toBeVisible()
  await pageRoot.getByRole('button', { name: '重新加载概览' }).click()
  await expect(pageRoot.getByText('资金账户概览加载失败，当前指标暂不可用。')).toHaveCount(0)
  await expect(pageRoot.getByRole('button', { name: /资金账户.*2/ })).toBeVisible()

  failNextBList = true
  await pageRoot.getByRole('button', { name: /正常账户.*1/ }).click()
  await expect(pageRoot.getByText('数据加载失败', { exact: true })).toBeVisible()
  await expect(pageRoot.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await pageRoot.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(pageRoot.getByText('B 资金账户', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 570, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  expect(errors).toEqual([])
  await page.screenshot({ path: info.outputPath('fund-account-b-recovered-570.png') })
})
