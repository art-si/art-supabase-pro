import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

const fixture = '/tests/e2e/fixtures/fms-fund-transfer-context.html'
const transferId = '44444444-4444-4444-8444-444444444444'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const actions = [
  {
    key: 'submit',
    label: '提交审批',
    title: '提交审批',
    initial: 'draft',
    next: 'pending_review',
    reason: false
  },
  {
    key: 'approve',
    label: '审批通过',
    title: '审批通过',
    initial: 'pending_review',
    next: 'approved',
    reason: false
  },
  {
    key: 'reject',
    label: '驳回',
    title: '驳回资金调拨',
    initial: 'pending_review',
    next: 'rejected',
    reason: true
  },
  {
    key: 'execute',
    label: '执行入账',
    title: '执行入账',
    initial: 'approved',
    next: 'completed',
    reason: false
  },
  {
    key: 'reverse',
    label: '冲销调拨',
    title: '冲销资金调拨',
    initial: 'completed',
    next: 'reversed',
    reason: true
  }
] as const
type Action = (typeof actions)[number]
type TransferRow = {
  id: string
  tenantId: string
  accountSetId: string
  transferNo: string
  transferDate: string
  amount: number
  feeAmount: number
  sourceAccountName: string
  targetAccountName: string
  currencyCode: string
  status: string
  purpose: string
  version: number
  fieldAccess: { transferAccounts: 'read'; transferAmounts: 'read' }
}

function transfer(status: string): TransferRow {
  return {
    id: transferId,
    tenantId: tenantA,
    accountSetId: '33333333-3333-4333-8333-333333333333',
    transferNo: 'TRF-CONTEXT-A',
    transferDate: '2026-10-30',
    amount: 100,
    feeAmount: 0,
    sourceAccountName: '测试转出账户',
    targetAccountName: '测试转入账户',
    currencyCode: 'CNY',
    status,
    purpose: '合成测试调拨',
    version: 7,
    fieldAccess: { transferAccounts: 'read', transferAmounts: 'read' }
  }
}

function payloadOf(route: Route): Record<string, unknown> {
  const payload: unknown = route.request().postDataJSON()
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('RPC payload must be an object')
  return payload as Record<string, unknown>
}

async function mockPage(page: Page, initial: Action, platformSuper = true) {
  const state = {
    rows: [transfer(initial.initial)],
    listCalls: 0,
    transitions: [] as Record<string, unknown>[],
    unexpectedRest: [] as string[],
    deniedExternal: [] as string[],
    pageErrors: [] as string[]
  }
  page.on('pageerror', (error) => state.pageErrors.push(error.message))
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
    state.deniedExternal.push(`${route.request().method()} ${url.pathname}`)
    return route.abort()
  })
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').at(-1) ?? ''
    if (request.method() === 'GET') {
      if (name === 'sys_dictionary' || name === 'sys_param' || name === 'sys_tenant')
        return route.fulfill({ json: [] })
      if (name === 'sys_user') return route.fallback()
      if (name === 'fms_currency')
        return route.fulfill({
          json: [{ id: 'currency-cny', currency_code: 'CNY', currency_name: '人民币' }]
        })
    }
    if (request.method() === 'POST' && request.url().includes('/rpc/')) {
      if (name === 'current_is_super') return route.fulfill({ json: platformSuper })
      if (name === 'get_organization_list_secure') return route.fulfill({ json: [] })
      if (name === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      if (name === 'fms_list_account_set_options_secure')
        return route.fulfill({
          json: {
            records: [
              {
                id: '33333333-3333-4333-8333-333333333333',
                accountSetCode: 'TEST',
                accountSetName: '测试账套',
                status: 'active',
                tenantId: tenantA
              }
            ],
            total: 1
          }
        })
      if (name === 'fms_list_fund_account_options_secure') return route.fulfill({ json: [] })
      if (name === 'fms_list_fund_transfers_secure') {
        state.listCalls += 1
        const rows = request.headers()['x-art-tenant-scope'] === tenantB ? [] : state.rows
        return route.fulfill({
          json: {
            records: rows,
            total: rows.length,
            fieldAccess: { transferAccounts: 'read', transferAmounts: 'read' }
          }
        })
      }
      if (name === 'transition_fms_fund_transfer_secure') {
        const payload = payloadOf(route)
        state.transitions.push(payload)
        state.rows = state.rows.map((row) =>
          row.id === payload.p_transfer_id
            ? { ...row, status: initial.next, version: row.version + 1 }
            : row
        )
        return route.fulfill({ json: { id: payload.p_transfer_id, status: initial.next } })
      }
    }
    state.unexpectedRest.push(`${request.method()} ${name}`)
    return route.fulfill({ status: 403, json: { code: 'UNEXPECTED_TEST_REQUEST' } })
  })
  return state
}

async function openConfirmation(page: Page, action: Action) {
  const table = page.locator('.fund-transfer-page .el-table__body-wrapper').first()
  await expect(table).toContainText('TRF-CONTEXT-A')
  await table.getByRole('button', { name: '更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: action.label, exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: action.title, exact: true })
  await expect(confirmation).toBeVisible()
  if (action.reason) await confirmation.getByRole('textbox').fill('业务核验原因')
  return confirmation
}

async function confirm(page: Page, action: Action): Promise<void> {
  const confirmation = page.getByRole('dialog', { name: action.title, exact: true })
  await confirmation
    .getByRole('button', {
      name: action.reason ? '确定' : action.label,
      exact: true
    })
    .click()
  await expect(confirmation).toBeHidden()
}

for (const action of actions) {
  test(`资金调拨${action.label}确认后写入固定记录和版本，仅反馈一次`, async ({ page }) => {
    const state = await mockPage(page, action)
    await page.goto(fixture, { waitUntil: 'domcontentloaded' })
    await openConfirmation(page, action)
    await confirm(page, action)
    await expect.poll(() => state.transitions.length).toBe(1)
    expect(state.transitions[0]).toMatchObject({
      p_transfer_id: transferId,
      p_action: action.key,
      p_expected_version: 7,
      p_remark: action.reason ? '业务核验原因' : null,
      p_execution_date:
        action.key === 'execute' || action.key === 'reverse'
          ? expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
          : null
    })
    await expect(page.locator('.el-message--success')).toHaveCount(1)
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    expect(state.unexpectedRest).toEqual([])
    expect(state.deniedExternal).toEqual([])
    expect(state.pageErrors).toEqual([])
  })
}

const staleCases = [
  { action: actions[0], change: 'route', label: '路由切换' },
  { action: actions[1], change: 'tenant', label: '租户切换' },
  { action: actions[2], change: 'replacement', label: '已接受行替换' },
  { action: actions[3], change: 'version', label: '已接受行版本变化' },
  { action: actions[4], change: 'status', label: '已接受行状态变化' },
  { action: actions[0], change: 'permission', label: '操作权限撤销' }
] as const

for (const scenario of staleCases) {
  test(`资金调拨${scenario.action.label}确认期间${scenario.label}不发起写入`, async ({ page }) => {
    const platformSuper = scenario.change !== 'permission'
    const state = await mockPage(page, scenario.action, platformSuper)
    await page.goto(platformSuper ? fixture : `${fixture}?ordinary`, {
      waitUntil: 'domcontentloaded'
    })
    await openConfirmation(page, scenario.action)
    if (
      scenario.change === 'route' ||
      scenario.change === 'tenant' ||
      scenario.change === 'permission'
    ) {
      const button = page.getByTestId(
        scenario.change === 'permission'
          ? `revoke-${scenario.action.key}`
          : `switch-${scenario.change}`
      )
      // The modal blocks ordinary clicks. This deliberately models an external context-change seam.
      await button.evaluate((element: HTMLButtonElement) => element.click())
      if (scenario.change === 'route')
        await expect(page.getByTestId('current-context')).toContainText(
          '/fund-transfer-context/other'
        )
      if (scenario.change === 'tenant')
        await expect(page.getByTestId('current-context')).toContainText(tenantB)
      if (scenario.change === 'permission')
        await expect(page.getByTestId('permission-state')).not.toContainText(
          'FinanceFundTransfer:Submit'
        )
      if (scenario.change === 'permission')
        await expect(page.getByTestId('submit-allowed')).toHaveText('false')
    } else {
      const original = state.rows[0]
      state.rows = [
        {
          ...original,
          id:
            scenario.change === 'replacement'
              ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
              : original.id,
          version: scenario.change === 'version' ? original.version + 1 : original.version,
          status: scenario.change === 'status' ? 'reversed' : original.status,
          transferNo: `TRF-${scenario.change.toUpperCase()}`
        }
      ]
      const before = state.listCalls
      // The visible search action refreshes the accepted table. The modal makes this an external seam.
      await page
        .locator('.fund-transfer-page .art-search-bar')
        .getByRole('button', { name: '查询', exact: true })
        .evaluate((element: HTMLButtonElement) => element.click())
      await expect.poll(() => state.listCalls).toBeGreaterThan(before)
      await expect(
        page.locator('.fund-transfer-page .el-table__body-wrapper').first()
      ).toContainText(`TRF-${scenario.change.toUpperCase()}`)
    }
    await confirm(page, scenario.action)
    await page.waitForTimeout(150)
    expect(state.transitions).toEqual([])
    await expect(page.locator('.el-message--success')).toHaveCount(0)
    expect(state.unexpectedRest).toEqual([])
    expect(state.deniedExternal).toEqual([])
    expect(state.pageErrors).toEqual([])
  })
}

test('资金调拨真实页面专注模式保留查询表格和分页并可两种方式退出', async ({ page }, info) => {
  const state = await mockPage(page, actions[0])
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  const root = page.locator('.fund-transfer-page')
  await expect(root.getByText('TRF-CONTEXT-A', { exact: true })).toBeVisible()
  await expect(root.locator('.business-workspace-header__metric').first()).toBeVisible()
  await expect(root.locator('.art-search-bar')).toBeVisible()
  await assertTableFocusContract(page, info)
  await expect(root.locator('.business-workspace-header__metric').first()).toBeVisible()
  await expect(root.locator('.art-search-bar')).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(root.locator('.business-workspace-header')).toBeHidden()
  await expect(root.locator('.business-workspace-header__metric').first()).toBeHidden()
  await expect(root.locator('.art-search-bar')).toBeVisible()
  await expect(root.locator('.art-table-query .el-table')).toBeVisible()
  await expect(root.locator('.art-table-query .el-pagination')).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.keyboard.press('Escape')
  await expect(root.locator('.business-workspace-header')).toBeVisible()
  expect(state.transitions).toEqual([])
  expect(state.unexpectedRest).toEqual([])
  expect(state.deniedExternal).toEqual([])
  expect(state.pageErrors).toEqual([])
})
