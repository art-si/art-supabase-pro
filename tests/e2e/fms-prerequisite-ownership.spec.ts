import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const accountA = 'cccccccc-cccc-4ccc-accc-cccccccccccc'
const accountB = 'dddddddd-dddd-4ddd-addd-dddddddddddd'
const periodEntry =
  'modules/art-supabase-fms/src/views/specialized-accounting/period-close/modules/period-close-start-dialog.vue'
const fundEntry = 'modules/art-supabase-fms/src/views/modules/fund-execution-dialog.vue'
type ReadinessOutcome = 'ready' | 'not-ready' | 'error'

async function preparePrerequisite(
  page: Page,
  info: TestInfo,
  {
    outcome = 'ready',
    gateFirstLocal = false,
    fundExecution = false
  }: { outcome?: ReadinessOutcome; gateFirstLocal?: boolean; fundExecution?: boolean } = {}
) {
  const narrow = info.project.name === 'mobile-390'
  const appearance = {
    theme: narrow ? ('dark' as const) : ('light' as const),
    boxBorderMode: !narrow
  }
  await prepareIsolatedSession(page, { platformSuper: false })
  await prepareAppearance(page, appearance)
  await page.addInitScript(
    ({ accountId, fundExecution }) => {
      window.formsMigrationInput = {
        args: fundExecution
          ? [
              {
                accountSetId: accountId,
                amount: 120,
                direction: 'outflow',
                title: '资金执行前置检查验收',
                subtitle: '核对付款账户后登记实际资金流出。',
                confirmText: '确认付款'
              }
            ]
          : [],
        prerequisiteAccountSetId: accountId,
        admin: false,
        permissions: ['FinancePeriodClose:View', 'FinancePeriodClose:Add']
      }
    },
    { accountId: accountA, fundExecution }
  )
  const readinessGate = Promise.withResolvers<void>()
  const firstLocalGate = Promise.withResolvers<void>()
  const secondLocalGate = Promise.withResolvers<void>()
  let readinessReads = 0
  let localReads = 0
  const periodScopes: Array<string | null> = []
  const unexpectedWrites: string[] = []
  const unexpectedReads: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1)
    if (name === 'fms_accounting_readiness') {
      expect(request.method()).toBe('POST')
      expect(request.postDataJSON()).toMatchObject({ p_account_set_id: accountA })
      readinessReads++
      await readinessGate.promise
      return outcome === 'error'
        ? route.fulfill({ status: 503, json: { code: 'XX000', message: 'database unavailable' } })
        : route.fulfill({
            json: { foundationReady: outcome === 'ready', fundAccountCount: 1 }
          })
    }
    if (
      name ===
      (fundExecution
        ? 'fms_list_fund_account_options_secure'
        : 'fms_list_account_set_options_secure')
    ) {
      expect(request.method()).toBe('POST')
      const attempt = ++localReads
      if (attempt === 1 && gateFirstLocal) await firstLocalGate.promise
      if (attempt === 2) await secondLocalGate.promise
      const id = attempt === 1 ? accountA : accountB
      return route.fulfill({
        json: fundExecution
          ? [
              {
                id,
                accountSetId: id,
                accountName: attempt === 1 ? '初次资金账户甲' : '当前资金账户乙',
                accountNoMasked: '尾号 1234',
                accountType: 'bank',
                currencyCode: 'CNY',
                status: 'active'
              }
            ]
          : {
              total: 1,
              records: [
                {
                  id,
                  accountSetCode: attempt === 1 ? 'QA' : 'QB',
                  accountSetName: attempt === 1 ? '初次检查账套甲' : '当前检查账套乙',
                  status: 'active'
                }
              ]
            }
      })
    }
    if (name === 'fms_accounting_period' && request.method() === 'GET') {
      const scope = url.searchParams.get('account_set_id')
      periodScopes.push(scope)
      expect([`eq.${accountA}`, `eq.${accountB}`]).toContain(scope)
      return route.fulfill({
        json: [
          {
            id: scope === `eq.${accountA}` ? 'period-a' : 'period-b',
            account_set_id: scope === `eq.${accountA}` ? accountA : accountB,
            fiscal_year: 2026,
            period_no: scope === `eq.${accountA}` ? 10 : 11,
            start_date: scope === `eq.${accountA}` ? '2026-10-01' : '2026-11-01',
            end_date: scope === `eq.${accountA}` ? '2026-10-31' : '2026-11-30',
            status: 'open'
          }
        ]
      })
    }
    if (name === 'current_is_super') return route.fulfill({ json: false })
    if (name === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      unexpectedWrites.push(`${request.method()} ${url.pathname}`)
      return route.fulfill({
        status: 403,
        json: { code: '42501', message: '隔离测试阻止未预期写请求' }
      })
    }
    if (!['sys_param', 'sys_dictionary', 'sys_user', 'sys_tenant'].includes(name ?? ''))
      unexpectedReads.push(url.pathname)
    return route.fulfill({ json: [] })
  })
  const entry = fundExecution ? fundEntry : periodEntry
  await page.goto(
    `/tests/e2e/fixtures/forms-migration-business.html?entry=${encodeURIComponent(entry)}&prerequisite=1&theme=${appearance.theme}`,
    { waitUntil: 'domcontentloaded', timeout: 60_000 }
  )
  await assertAppearance(page, appearance)
  const dialog = page.getByRole('dialog', {
    name: fundExecution ? '资金执行前置检查验收' : '执行月末关账检查',
    exact: true
  })
  const viewport = dialog.locator('.art-dialog__viewport')
  const content = dialog.locator('.art-dialog__content')
  const confirm = dialog.getByRole('button', {
    name: fundExecution ? '确认付款' : '开始检查',
    exact: true
  })
  const completed = page.getByTestId('open-completions')
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => readinessReads).toBe(1)
  await expect.poll(() => localReads).toBe(1)
  return {
    dialog,
    viewport,
    content,
    confirm,
    completed,
    periodScopes,
    pageErrors,
    unexpectedWrites,
    unexpectedReads,
    readinessGate,
    firstLocalGate,
    secondLocalGate,
    localReads: () => localReads,
    releaseAll: () => {
      readinessGate.resolve()
      firstLocalGate.resolve()
      secondLocalGate.resolve()
    }
  }
}

for (const outcome of ['ready', 'not-ready', 'error'] as const) {
  test(`财务前置检查 ${outcome} 旧结果不关闭或解锁直接重开的弹窗`, async ({ page }, info) => {
    const state = await preparePrerequisite(page, info, { outcome })
    try {
      await expect.poll(() => state.periodScopes.length).toBe(1)
      await page.getByTestId('open-entry').dispatchEvent('click')
      await expect.poll(state.localReads).toBe(2)
      await expect(state.viewport).toHaveAttribute('aria-busy', 'true')
      const response = page.waitForResponse('**/rest/v1/rpc/fms_accounting_readiness')
      state.readinessGate.resolve()
      await (await response).finished()
      const oldPrompt = page.locator('.el-message-box')
      await expect
        .poll(async () => {
          if (await oldPrompt.isVisible()) return 'obsolete-prompt'
          return (await state.completed.textContent()) === '1' ? 'completed' : 'pending'
        })
        .not.toBe('pending')
      const prompted = await oldPrompt.isVisible()
      if (prompted) await oldPrompt.getByRole('button', { name: '暂不处理', exact: true }).click()
      await expect(state.completed).toHaveText('1')
      expect.soft(prompted, '过期检查不能再弹出补齐资料提示').toBe(false)
      await expect.soft(state.dialog).toBeVisible()
      await expect.soft(state.viewport).toHaveAttribute('aria-busy', 'true')
      await expect.soft(state.content).toHaveJSProperty('inert', true)
      await expect.soft(state.confirm).toBeDisabled()
      await expect(page.getByTestId('prerequisite-route')).toHaveText('/')
      state.secondLocalGate.resolve()
      await expect(state.completed).toHaveText('2')
      await expect(state.dialog).toBeVisible()
      await expect(state.viewport).toHaveAttribute('aria-busy', 'false')
      await expect(state.confirm).toBeEnabled()
      await expect(state.dialog.locator('[data-art-form-item-key="accountSetId"]')).toContainText(
        '当前检查账套乙（QB）'
      )
      await expect(state.dialog.locator('[data-art-form-item-key="periodId"]')).toContainText(
        '2026 年第 11 期'
      )
      await state.dialog.screenshot({ path: info.outputPath(`prerequisite-stale-${outcome}.png`) })
      expect(state.periodScopes).toEqual([`eq.${accountA}`, `eq.${accountB}`])
      expect(state.unexpectedWrites).toEqual([])
      expect(state.unexpectedReads).toEqual([])
      expect(state.pageErrors).toEqual([])
    } finally {
      state.releaseAll()
    }
  })
}

test('财务前置检查等待中直接重开，当前资料先完成即可使用', async ({ page }, info) => {
  const state = await preparePrerequisite(page, info)
  try {
    await expect.poll(() => state.periodScopes.length).toBe(1)
    await page.getByTestId('open-entry').dispatchEvent('click')
    await expect.poll(state.localReads).toBe(2)
    state.secondLocalGate.resolve()
    await expect(state.completed).toHaveText('1')
    await expect.soft(state.viewport).toHaveAttribute('aria-busy', 'false')
    await expect.soft(state.confirm).toBeEnabled()
    state.readinessGate.resolve()
    await expect(state.completed).toHaveText('2')
    await expect(state.viewport).toHaveAttribute('aria-busy', 'false')
    await expect(state.dialog.locator('[data-art-form-item-key="accountSetId"]')).toContainText(
      '当前检查账套乙（QB）'
    )
    expect(state.unexpectedWrites).toEqual([])
    expect(state.pageErrors).toEqual([])
  } finally {
    state.releaseAll()
  }
})

for (const first of ['local', 'readiness'] as const) {
  test(`财务前置检查与资料加载 ${first} 先完成仍保留另一项的加载锁`, async ({ page }, info) => {
    const state = await preparePrerequisite(page, info, { gateFirstLocal: true })
    try {
      await expect(state.viewport).toHaveAttribute('aria-busy', 'true')
      if (first === 'local') {
        state.firstLocalGate.resolve()
        await expect.poll(() => state.periodScopes.length).toBe(1)
      } else {
        const response = page.waitForResponse('**/rest/v1/rpc/fms_accounting_readiness')
        state.readinessGate.resolve()
        await (await response).finished()
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        )
      }
      await expect(state.completed).toHaveText('0')
      await expect(state.viewport).toHaveAttribute('aria-busy', 'true')
      await expect(state.content).toHaveJSProperty('inert', true)
      await expect(state.confirm).toBeDisabled()
      await state.dialog.screenshot({ path: info.outputPath(`prerequisite-${first}-first.png`) })
      state.readinessGate.resolve()
      state.firstLocalGate.resolve()
      await expect(state.completed).toHaveText('1')
      await expect(state.viewport).toHaveAttribute('aria-busy', 'false')
      await expect(state.content).toHaveJSProperty('inert', false)
      await expect(state.confirm).toBeEnabled()
      expect(state.unexpectedWrites).toEqual([])
      expect(state.unexpectedReads).toEqual([])
      expect(state.pageErrors).toEqual([])
    } finally {
      state.releaseAll()
    }
  })
}

test('财务前置检查当前资料未就绪时保留补齐提示和跳转', async ({ page }, info) => {
  const state = await preparePrerequisite(page, info, { outcome: 'not-ready' })
  try {
    await expect.poll(() => state.periodScopes.length).toBe(1)
    state.readinessGate.resolve()
    const prompt = page.locator('.el-message-box')
    await expect(prompt).toBeVisible()
    await expect(prompt).toContainText('核算基础尚未就绪')
    await prompt.getByRole('button', { name: '前往会计科目', exact: true }).click()
    await expect(state.completed).toHaveText('1')
    await expect(page.getByTestId('prerequisite-route')).toHaveText('/accounting-subject')
    await expect(state.dialog).toBeHidden()
    expect(state.unexpectedWrites).toEqual([])
    expect(state.pageErrors).toEqual([])
  } finally {
    state.releaseAll()
  }
})

test('财务前置检查旧提示确认后不跳转或关闭后来打开的弹窗', async ({ page }, info) => {
  const state = await preparePrerequisite(page, info, { outcome: 'not-ready' })
  try {
    await expect.poll(() => state.periodScopes.length).toBe(1)
    state.readinessGate.resolve()
    const prompt = page.locator('.el-message-box')
    await expect(prompt).toBeVisible()
    await expect(prompt).toContainText('核算基础尚未就绪')
    await page.getByTestId('open-entry').dispatchEvent('click')
    await expect.poll(state.localReads).toBe(2)
    await expect(state.viewport).toHaveAttribute('aria-busy', 'true')
    await prompt.getByRole('button', { name: '前往会计科目', exact: true }).click()
    await expect(state.completed).toHaveText('1')
    await expect(prompt).toBeHidden()
    await expect(page.getByTestId('prerequisite-route')).toHaveText('/')
    await expect(state.dialog).toBeVisible()
    await expect(state.viewport).toHaveAttribute('aria-busy', 'true')
    await expect(state.content).toHaveJSProperty('inert', true)
    await expect(state.confirm).toBeDisabled()
    state.secondLocalGate.resolve()
    await expect(state.completed).toHaveText('2')
    await expect(state.dialog).toBeVisible()
    await expect(state.viewport).toHaveAttribute('aria-busy', 'false')
    await expect(state.confirm).toBeEnabled()
    await expect(state.dialog.locator('[data-art-form-item-key="accountSetId"]')).toContainText(
      '当前检查账套乙（QB）'
    )
    await expect(state.dialog.locator('[data-art-form-item-key="periodId"]')).toContainText(
      '2026 年第 11 期'
    )
    await state.dialog.screenshot({ path: info.outputPath('prerequisite-stale-confirm.png') })
    expect(state.periodScopes).toEqual([`eq.${accountA}`, `eq.${accountB}`])
    expect(state.unexpectedWrites).toEqual([])
    expect(state.unexpectedReads).toEqual([])
    expect(state.pageErrors).toEqual([])
  } finally {
    state.releaseAll()
  }
})

test('资金执行等待打开前重置后仍保留前置检查加载锁', async ({ page }, info) => {
  const state = await preparePrerequisite(page, info, { fundExecution: true })
  try {
    await expect(state.dialog.locator('[data-art-form-item-key="fundAccountId"]')).toContainText(
      '仅显示当前账套、本位币且状态正常的资金账户'
    )
    await expect(state.completed).toHaveText('0')
    await expect(state.viewport).toHaveAttribute('aria-busy', 'true')
    await expect(state.content).toHaveJSProperty('inert', true)
    await expect(state.confirm).toBeDisabled()
    state.readinessGate.resolve()
    await expect(state.completed).toHaveText('1')
    await expect(state.viewport).toHaveAttribute('aria-busy', 'false')
    await expect(state.confirm).toBeEnabled()
    await state.dialog.screenshot({ path: info.outputPath('prerequisite-fund-preopen.png') })
    expect(state.unexpectedWrites).toEqual([])
    expect(state.unexpectedReads).toEqual([])
    expect(state.pageErrors).toEqual([])
  } finally {
    state.releaseAll()
  }
})

for (const available of [true, false]) {
  test(`资金账户延后新增 ${available ? '已有账套' : '缺少账套'} 不干扰后来打开的编辑窗口`, async ({
    page
  }, info) => {
    const appearance = {
      theme: info.project.name === 'mobile-390' ? ('dark' as const) : ('light' as const),
      boxBorderMode: info.project.name !== 'mobile-390'
    }
    const preflightGate = Promise.withResolvers<void>()
    const currentGate = Promise.withResolvers<void>()
    const currencyId = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee'
    const recordId = 'ffffffff-ffff-4fff-afff-ffffffffffff'
    await prepareIsolatedSession(page, { platformSuper: false })
    await prepareAppearance(page, appearance)
    await page.addInitScript(() => {
      window.formsMigrationInput = {
        args: [],
        admin: false,
        permissions: [
          'FinanceFundAccount:View',
          'FinanceFundAccount:Add',
          'FinanceFundAccount:Edit'
        ],
        dicts: {
          fmsFundAccountType: [{ label: '银行账户', value: 'bank', status: '1' }],
          fmsFundAccountStatus: [{ label: '启用', value: 'active', status: '1' }],
          commonBoolean: [
            { label: '是', value: 'true', status: '1' },
            { label: '否', value: 'false', status: '1' }
          ]
        }
      }
    })
    let accountReads = 0
    let currencyReads = 0
    const unexpectedWrites: string[] = []
    const unexpectedReads: string[] = []
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const name = url.pathname.split('/').at(-1)
      if (name === 'fms_list_account_set_options_secure') {
        expect(request.method()).toBe('POST')
        const attempt = ++accountReads
        if (attempt === 1) await preflightGate.promise
        if (attempt === 2) await currentGate.promise
        const records =
          attempt === 1 && !available
            ? []
            : [
                {
                  id: accountB,
                  accountSetCode: 'QB',
                  accountSetName: '当前编辑账套乙',
                  status: 'active'
                }
              ]
        return route.fulfill({ json: { total: records.length, records } })
      }
      if (name === 'fms_currency' && request.method() === 'GET') {
        currencyReads++
        expect(url.searchParams.get('account_set_id')).toBe(`eq.${accountB}`)
        return route.fulfill({
          json: [
            {
              id: currencyId,
              account_set_id: accountB,
              currency_code: 'CNY',
              currency_name: '人民币',
              is_base: true,
              is_enabled: true,
              sort: 1
            }
          ]
        })
      }
      if (name === 'current_is_super') return route.fulfill({ json: false })
      if (name === 'get_table_column_runtime')
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        unexpectedWrites.push(`${request.method()} ${url.pathname}`)
        return route.fulfill({
          status: 403,
          json: { code: '42501', message: '隔离测试阻止未预期写请求' }
        })
      }
      if (!['sys_param', 'sys_dictionary', 'sys_user', 'sys_tenant'].includes(name ?? ''))
        unexpectedReads.push(url.pathname)
      return route.fulfill({ json: [] })
    })
    try {
      const entry =
        'modules/art-supabase-fms/src/views/treasury/fund-account/modules/fund-account-dialog.vue'
      await page.goto(
        `/tests/e2e/fixtures/forms-migration-business.html?entry=${encodeURIComponent(entry)}&prerequisite=1&prerequisiteUnavailable=1&theme=${appearance.theme}`,
        { waitUntil: 'domcontentloaded', timeout: 60_000 }
      )
      await assertAppearance(page, appearance)
      await expect.poll(() => accountReads).toBe(1)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.evaluate(
        ({ id, accountSetId, currencyId }) => {
          if (!window.formsMigrationInput) throw new Error('资金账户测试入口未就绪')
          window.formsMigrationInput.args = [
            {
              id,
              accountSetId,
              currencyId,
              accountCode: 'CURRENT_BANK_B',
              accountName: '当前编辑账户乙',
              accountType: 'bank',
              status: 'active',
              isDefault: false,
              onlineBankingEnabled: false,
              reconciliationEnabled: true,
              accountNoMasked: '尾号 5678',
              fieldAccess: { accountDetails: 'read', accountBalances: 'hidden' }
            }
          ]
        },
        { id: recordId, accountSetId: accountB, currencyId }
      )
      await page.getByTestId('open-entry').click()
      const dialog = page.getByRole('dialog', {
        name: '编辑资金账户 · 当前编辑账户乙',
        exact: true
      })
      const viewport = dialog.locator('.art-dialog__viewport')
      const completed = page.getByTestId('open-completions')
      await expect(dialog).toBeVisible()
      await expect.poll(() => accountReads).toBe(2)
      await expect(viewport).toHaveAttribute('aria-busy', 'true')
      preflightGate.resolve()
      const prompt = page.locator('.el-message-box')
      await expect
        .poll(async () => {
          if (await prompt.isVisible()) return 'obsolete-prompt'
          return (await completed.textContent()) === '1' ? 'completed' : 'pending'
        })
        .not.toBe('pending')
      const prompted = await prompt.isVisible()
      if (prompted) await prompt.getByRole('button', { name: '暂不处理', exact: true }).click()
      await expect(completed).toHaveText('1')
      expect.soft(prompted, '旧新增预检查不能显示账套配置提示').toBe(false)
      expect.soft(accountReads, '旧新增不能再次打开业务弹窗并发出第三次账套读取').toBe(2)
      await expect.soft(dialog).toBeVisible()
      await expect.soft(viewport).toHaveAttribute('aria-busy', 'true')
      await expect.soft(dialog.locator('.art-dialog__content')).toHaveJSProperty('inert', true)
      await expect(page.getByTestId('prerequisite-route')).toHaveText('/')
      currentGate.resolve()
      await expect(completed).toHaveText('2')
      await expect(dialog).toBeVisible()
      await expect(viewport).toHaveAttribute('aria-busy', 'false')
      await expect(dialog.getByRole('button', { name: '保存修改', exact: true })).toBeEnabled()
      await expect(dialog.getByRole('textbox', { name: /账户名称$/ })).toHaveValue('当前编辑账户乙')
      await expect(dialog.getByRole('textbox', { name: /账户编码$/ })).toHaveValue('CURRENT_BANK_B')
      await expect(dialog.locator('[data-art-form-item-key="accountSetId"]')).toContainText(
        '当前编辑账套乙（QB）'
      )
      await expect(dialog.locator('[data-art-form-item-key="currencyId"]')).toContainText(
        'CNY · 人民币（本位币）'
      )
      await dialog.screenshot({
        path: info.outputPath(`fund-account-reservation-${available}.png`)
      })
      expect(accountReads).toBe(2)
      expect(currencyReads).toBe(1)
      expect(unexpectedReads).toEqual([])
      expect(unexpectedWrites).toEqual([])
      expect(pageErrors).toEqual([])
      await expect(page.getByTestId('open-error')).toHaveText('')
      await expect(page.getByTestId('successes')).toHaveText('0')
    } finally {
      preflightGate.resolve()
      currentGate.resolve()
    }
  })
}
