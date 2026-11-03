import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

const fixture = '/tests/e2e/fixtures/fms-waybill-payment-context.html'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const reimbursementA = '44444444-4444-4444-8444-444444444444'
const accountA = 'account-a-real'
const accountB = 'account-b-real'

type RpcPayload = Record<string, unknown>
type AccountOption = Record<string, unknown>

const accounts: AccountOption[] = [
  {
    id: accountA,
    tenant_id: tenantA,
    account_set_id: 'set-a',
    currency_id: 'currency-cny',
    currency_code: 'CNY',
    account_code: 'CASH-A',
    account_name: '隔离本币现金账户',
    account_type: 'cash',
    status: 'active',
    reconciliation_enabled: false,
    is_demo: false
  },
  {
    id: accountB,
    tenant_id: tenantB,
    account_set_id: 'set-b',
    currency_id: 'currency-cny',
    currency_code: 'CNY',
    account_code: 'CASH-B',
    account_name: '其他租户本币账户',
    account_type: 'cash',
    status: 'active',
    reconciliation_enabled: false,
    is_demo: false
  },
  {
    id: 'account-a-demo',
    tenant_id: tenantA,
    account_set_id: 'set-a',
    currency_id: 'currency-cny',
    currency_code: 'CNY',
    account_code: 'DEMO-A',
    account_name: '界面验收账户',
    account_type: 'cash',
    status: 'active',
    reconciliation_enabled: false,
    is_demo: true
  }
]

async function mockPayment(page: Page) {
  const state = {
    ruleReads: [] as string[],
    accountReads: [] as RpcPayload[],
    writes: [] as RpcPayload[],
    unknownRest: [] as string[],
    pageErrors: [] as string[],
    failAccountRemaining: 0,
    emptyAccounts: false,
    holdFirstAccount: false,
    releaseFirstAccount: undefined as (() => void) | undefined,
    holdWrite: false,
    releaseWrite: undefined as (() => void) | undefined
  }
  page.on('pageerror', (error) => state.pageErrors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (/\/(?:sys_user|sys_dictionary|sys_param)$/.test(path)) return route.fallback()
    state.unknownRest.push(`${route.request().method()} ${path}`)
    return route.abort()
  })
  await page.route('**/rest/v1/sys_document_number_rule?*', (route) => {
    const url = new URL(route.request().url())
    state.ruleReads.push(url.searchParams.get('tenant_id') ?? '')
    return route.fulfill({
      json: [
        {
          id: 'payment-rule-a',
          tenant_id: tenantA,
          rule_key: 'tms.expense_payment',
          rule_name: '费用付款单号',
          category: 'business_document',
          target_table: 'tms_expense_payment',
          target_column: 'payment_no',
          auto_enabled: false,
          template: 'FEP-{YYYYMM}-{SEQ:3}',
          reset_cycle: 'month',
          sequence_start: 1,
          timezone: 'Asia/Shanghai',
          rule_version: 1,
          manual_required: false,
          builtin: false,
          enabled: true,
          counters: []
        }
      ]
    })
  })
  await page.route('**/rest/v1/rpc/fms_list_fund_account_options_secure', async (route) => {
    const payload = route.request().postDataJSON() as RpcPayload
    state.accountReads.push(payload)
    const call = state.accountReads.length
    if (state.holdFirstAccount && call === 1)
      await new Promise<void>((resolve) => (state.releaseFirstAccount = resolve))
    if (state.failAccountRemaining > 0) {
      state.failAccountRemaining -= 1
      return route.fulfill({
        status: 503,
        json: { code: 'PGRST000', message: 'technical account failure' }
      })
    }
    return route.fulfill({
      json: state.emptyAccounts
        ? []
        : state.holdFirstAccount
          ? [
              {
                ...accounts[0],
                id: call === 1 ? 'account-old' : 'account-current',
                account_name: call === 1 ? '旧请求账户' : '当前请求账户'
              }
            ]
          : accounts
    })
  })
  await page.route('**/rest/v1/rpc/execute_fms_expense_reimbursement_secure', async (route) => {
    const payload = route.request().postDataJSON() as RpcPayload
    state.writes.push(payload)
    if (state.holdWrite) await new Promise<void>((resolve) => (state.releaseWrite = resolve))
    return route.fulfill({ json: 'payment-created' })
  })
  return state
}

async function openFixture(page: Page, projectName: string, platform = false) {
  const query = new URLSearchParams({
    theme: projectName.includes('dark') ? 'dark' : 'light',
    box: projectName.includes('shadow') ? 'shadow' : 'border'
  })
  if (platform) query.set('platform', '1')
  await page.goto(`${fixture}?${query}`, { waitUntil: 'domcontentloaded' })
  await installActionFeedbackHistory(page)
}

const paymentDialog = (page: Page) => page.getByRole('dialog', { name: '出纳登记付款' })

async function selectAccount(page: Page, name = '隔离本币现金账户') {
  await paymentDialog(page).getByRole('combobox', { name: '付款账户' }).click()
  await page.getByRole('option', { name, exact: true }).click()
}

async function expectClean(page: Page, state: Awaited<ReturnType<typeof mockPayment>>) {
  expect(state.unknownRest).toEqual([])
  expect(state.pageErrors).toEqual([])
  expect(await readActionFeedbackHistory(page)).toEqual([])
}

test('普通用户现金部分付款保留单据金额和一次成功反馈', async ({ page }, info) => {
  const state = await mockPayment(page)
  await openFixture(page, info.project.name)
  await expect(page.getByTestId('payment-context')).toContainText('ordinary')
  await expect(page.getByTestId('payment-grants')).toHaveText('1')
  await page.getByRole('button', { name: '打开付款 A' }).click()
  const dialog = paymentDialog(page)
  await expect(dialog).toContainText('PAY-A-001')
  await expect(dialog).toContainText('待付 ¥150.00')
  await dialog.getByRole('textbox', { name: '付款单号' }).fill('CASH-A-001')
  await selectAccount(page)
  await dialog.getByRole('spinbutton', { name: '实付金额(元)' }).fill('45.25')
  await dialog.getByRole('textbox', { name: '付款备注' }).fill('  部分现金付款  ')
  const paymentDate = await dialog.getByRole('combobox', { name: '付款日期' }).inputValue()
  await dialog.getByRole('button', { name: '确认登记付款' }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes).toEqual([
    {
      p_reimbursement_id: reimbursementA,
      p_fund_account_id: accountA,
      p_amount: 45.25,
      p_payment_date: paymentDate,
      p_bank_reference: null,
      p_voucher_urls: [],
      p_remark: '部分现金付款',
      p_payment_no: 'CASH-A-001'
    }
  ])
  await expect(page.getByTestId('payment-changed')).toHaveText('1')
  await expect(dialog).toBeHidden()
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([{ kind: 'success', text: '付款已登记，报销单付款进度已更新' }])
  expect(state.ruleReads).toEqual([`eq.${tenantA}`])
  expect(state.accountReads).toEqual([
    { p_account_set_id: null, p_status: 'active', p_base_currency_only: true }
  ])
  expect(state.unknownRest).toEqual([])
  expect(state.pageErrors).toEqual([])
})

test('资金账户503留在字段局部并可重试', async ({ page }, info) => {
  const state = await mockPayment(page)
  state.failAccountRemaining = 1
  await openFixture(page, info.project.name)
  await page.getByRole('button', { name: '打开付款 A' }).click()
  const dialog = paymentDialog(page)
  const accountField = dialog
    .locator('.el-form-item')
    .filter({ has: page.getByRole('combobox', { name: '付款账户' }) })
  await expect(accountField.getByText('选项加载失败', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确认登记付款' })).toBeDisabled()
  await expect(page.getByText('technical account failure')).toHaveCount(0)
  await expectClean(page, state)
  await accountField.getByRole('button', { name: '重新加载' }).click()
  await expect(dialog.getByRole('button', { name: '确认登记付款' })).toBeEnabled()
  await dialog.getByRole('combobox', { name: '付款账户' }).click()
  await expect(page.getByRole('option', { name: '隔离本币现金账户' })).toBeVisible()
  expect(state.accountReads).toHaveLength(2)
  expect(state.writes).toEqual([])
  await expectClean(page, state)
})

test('无可用本币付款账户时禁用确认并显示空候选', async ({ page }, info) => {
  const state = await mockPayment(page)
  state.emptyAccounts = true
  await openFixture(page, info.project.name)
  await page.getByRole('button', { name: '打开付款 A' }).click()
  const dialog = paymentDialog(page)
  await expect.poll(() => state.accountReads.length).toBe(1)
  await expect(dialog.getByRole('button', { name: '确认登记付款' })).toBeDisabled()
  await dialog.getByRole('combobox', { name: '付款账户' }).click()
  await expect(page.getByText(/暂无.*付款账户/)).toBeVisible()
  expect(state.writes).toEqual([])
  await expect(page.getByTestId('payment-changed')).toHaveText('0')
  await expectClean(page, state)
})

test('平台全部范围打开A只读取A编号规则与真实本币账户', async ({ page }, info) => {
  const state = await mockPayment(page)
  await openFixture(page, info.project.name, true)
  await expect(page.getByTestId('payment-context')).toContainText(':all:platform')
  await page.getByRole('button', { name: '打开付款 A' }).click()
  const dialog = paymentDialog(page)
  await expect(dialog).toContainText('PAY-A-001')
  await expect.poll(() => state.ruleReads.length).toBe(1)
  expect(state.ruleReads).toEqual([`eq.${tenantA}`])
  await dialog.getByRole('combobox', { name: '付款账户' }).click()
  const dropdown = page.locator('.el-select-dropdown:visible')
  await expect(dropdown.getByRole('option', { name: '隔离本币现金账户' })).toBeVisible()
  await expect(dropdown.getByRole('option', { name: '其他租户本币账户' })).toHaveCount(0)
  await expect(dropdown.getByRole('option', { name: '界面验收账户' })).toHaveCount(0)
  expect(state.writes).toEqual([])
  await expectClean(page, state)
})

test('A账户读取慢于B时不回写旧选项', async ({ page }, info) => {
  const state = await mockPayment(page)
  state.holdFirstAccount = true
  await openFixture(page, info.project.name)
  await page.getByRole('button', { name: '打开付款 A' }).click()
  await expect.poll(() => state.accountReads.length).toBe(1)
  // External fixture control bypasses the loading overlay; the real public handleOpen receives B.
  await page.getByTestId('open-payment-b').evaluate((button: HTMLButtonElement) => button.click())
  const dialog = paymentDialog(page)
  await expect(dialog).toContainText('PAY-B-001')
  await expect.poll(() => state.accountReads.length).toBe(2)
  await dialog.getByRole('combobox', { name: '付款账户' }).click()
  await expect(page.getByRole('option', { name: '当前请求账户' })).toBeVisible()
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/fms_list_fund_account_options_secure') &&
      response.request().postDataJSON().p_status === 'active'
  )
  state.releaseFirstAccount?.()
  await oldResponse
  await page.waitForTimeout(100)
  await expect(page.getByRole('option', { name: '当前请求账户' })).toBeVisible()
  await expect(page.getByRole('option', { name: '旧请求账户' })).toHaveCount(0)
  expect(state.writes).toEqual([])
  await expectClean(page, state)
})

test('A表单校验未完成时公开打开B不派发旧或新付款', async ({ page }, info) => {
  const state = await mockPayment(page)
  await openFixture(page, info.project.name)
  await page.getByRole('button', { name: '打开付款 A' }).click()
  const dialog = paymentDialog(page)
  await selectAccount(page)
  const confirm = dialog.getByRole('button', { name: '确认登记付款' })
  await expect(confirm).toBeEnabled()
  // One browser task clicks the real confirm button then the external public B opener. ArtForm's
  // actual validate promise supplies the async boundary; no validator or product handler is replaced.
  await confirm.evaluate((button: HTMLButtonElement) => {
    button.click()
    const openB = document.querySelector<HTMLButtonElement>('[data-testid="open-payment-b"]')
    if (!openB) throw new Error('B 公开入口缺失')
    openB.click()
  })
  await expect(dialog).toContainText('PAY-B-001')
  await page.waitForTimeout(100)
  expect(state.writes).toEqual([])
  await expect(page.getByTestId('payment-changed')).toHaveText('0')
  await expect(dialog.locator('.el-form-item__error')).toHaveCount(0)
  await expectClean(page, state)
})

test('A付款写入晚于B打开时不提示不变更不关闭B', async ({ page }, info) => {
  const state = await mockPayment(page)
  state.holdWrite = true
  await openFixture(page, info.project.name)
  await page.getByRole('button', { name: '打开付款 A' }).click()
  const dialog = paymentDialog(page)
  await selectAccount(page)
  await dialog.getByRole('button', { name: '确认登记付款' }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0].p_reimbursement_id).toBe(reimbursementA)
  await page.getByTestId('open-payment-b').evaluate((button: HTMLButtonElement) => button.click())
  await expect(dialog).toContainText('PAY-B-001')
  const oldResponse = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/execute_fms_expense_reimbursement_secure')
  )
  state.releaseWrite?.()
  await oldResponse
  await page.waitForTimeout(100)
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('PAY-B-001')
  await expect(page.getByTestId('payment-changed')).toHaveText('0')
  await expectClean(page, state)
})

test('普通用户确认前撤销Pay权限不派发付款', async ({ page }, info) => {
  const state = await mockPayment(page)
  await openFixture(page, info.project.name)
  await expect(page.getByTestId('payment-grants')).toHaveText('1')
  await page.getByRole('button', { name: '打开付款 A' }).click()
  const dialog = paymentDialog(page)
  await selectAccount(page)
  await page
    .getByRole('button', { name: '撤销付款权限' })
    .evaluate((button: HTMLButtonElement) => button.click())
  await expect(page.getByTestId('payment-grants')).toHaveText('0')
  await dialog.getByRole('button', { name: '确认登记付款' }).click()
  expect(state.writes).toEqual([])
  await expect(page.getByTestId('payment-changed')).toHaveText('0')
  await expectClean(page, state)
})

test('平台切换租户后旧付款不写入也不反馈', async ({ page }, info) => {
  const state = await mockPayment(page)
  await openFixture(page, info.project.name, true)
  await page.getByRole('button', { name: '打开付款 A' }).click()
  const dialog = paymentDialog(page)
  await expect.poll(() => state.ruleReads.length).toBe(1)
  await selectAccount(page)
  await page
    .getByRole('button', { name: '切换测试租户' })
    .evaluate((button: HTMLButtonElement) => button.click())
  await expect(page.getByTestId('payment-context')).toContainText(`:${tenantB}:platform`)
  await dialog.getByRole('button', { name: '确认登记付款' }).click()
  expect(state.writes).toEqual([])
  await expect(page.getByTestId('payment-changed')).toHaveText('0')
  await expectClean(page, state)
})

test('缺付款账户和实付金额先显示字段错误修正后仅写一次', async ({ page }, info) => {
  const state = await mockPayment(page)
  await openFixture(page, info.project.name)
  await page.getByRole('button', { name: '打开付款 A' }).click()
  const dialog = paymentDialog(page)
  const confirm = dialog.getByRole('button', { name: '确认登记付款' })
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(dialog.getByText('请选择实际付款账户', { exact: true })).toBeVisible()
  expect(state.writes).toEqual([])
  await selectAccount(page)
  await dialog.getByRole('spinbutton', { name: '实付金额(元)' }).fill('')
  await confirm.click()
  await expect(dialog.getByText('请输入大于 0 的实付金额', { exact: true })).toBeVisible()
  expect(state.writes).toEqual([])
  await dialog.getByRole('spinbutton', { name: '实付金额(元)' }).fill('45.25')
  await confirm.click()
  await expect.poll(() => state.writes.length).toBe(1)
  await expect(page.getByTestId('payment-changed')).toHaveText('1')
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([{ kind: 'success', text: '付款已登记，报销单付款进度已更新' }])
  expect(state.unknownRest).toEqual([])
  expect(state.pageErrors).toEqual([])
})
