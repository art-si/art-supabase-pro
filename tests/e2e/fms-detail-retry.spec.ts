import { expect, test, type Page } from '@playwright/test'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const fixtureUrl = '/tests/e2e/fixtures/fms-detail-retry.html'

async function openFixture(page: Page, projectName: string, query = ''): Promise<void> {
  const separator = query ? '&' : '?'
  const appearance = `theme=${projectName.includes('dark') ? 'dark' : 'light'}&box=${projectName.includes('shadow') ? 'shadow' : 'border'}`
  await page.goto(`${fixtureUrl}${query}${separator}${appearance}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  await installActionFeedbackHistory(page)
}

test('关账数量保留权限掩码并区分数字和原始文本', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  let attempts = 0
  await page.route('**/rest/v1/rpc/fms_get_period_close_run_secure', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST000', message: 'technical failure' })
      })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: '88888888-8888-4888-8888-888888888888',
        runNo: 'TEST-CLOSE-001',
        status: 'checking',
        createTime: '2026-10-02T08:00:00Z',
        passedCount: 1234,
        warningCount: '01234',
        blockingCount: '***',
        fieldAccess: { closeDiagnostics: 'read' }
      })
    })
  })
  await page.route('**/rest/v1/rpc/fms_list_period_close_checks_secure', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' })
  )
  await openFixture(page, testInfo.project.name)
  await page.getByRole('button', { name: '打开关账检查详情' }).click()
  const drawer = page.locator('.el-drawer')
  await expect(
    drawer.getByText('关账检查详情加载失败，请重新加载。', { exact: true })
  ).toBeVisible()
  await expect(drawer.getByText('technical failure')).toHaveCount(0)
  await drawer.getByRole('button', { name: '重新加载' }).click()
  await expect(drawer.getByText('1,234', { exact: true })).toBeVisible()
  await expect(drawer.getByText('01234', { exact: true })).toBeVisible()
  await expect(drawer.getByText('***', { exact: true })).toBeVisible()
  await expectNoViewportOverflow(page)
  await page.screenshot({
    path: `.artifacts/fms-period-close-count-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
})

async function expectNoViewportOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const code = new URL(route.request().url()).searchParams.get('dict_type_table.code')
    const dictionary = [
      { code: 'fmsFundTransferStatus', value: 'draft', label: '草稿' },
      { code: 'fmsBankReconciliationStatus', value: 'draft', label: '草稿' },
      { code: 'fmsBillStatus', value: 'draft', label: '草稿' },
      { code: 'fmsBillDirection', value: 'receivable', label: '应收票据' },
      { code: 'fmsBillType', value: 'bank_acceptance', label: '银行承兑汇票' }
    ].filter((item) => code?.endsWith(item.code))
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(
        dictionary.map((item) => ({ ...item, id: item.value, sort: 1, status: '1' }))
      )
    })
  })
})

const batchAId = '55555555-5555-4555-8555-555555555555'
const batchBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const lineA1Id = '77777777-7777-4777-8777-777777777777'
const lineA2Id = '88888888-8888-4888-8888-888888888888'
const lineB1Id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const matchA1Id = '99999999-9999-4999-8999-999999999999'

type BankWrite = { rpc: string; payload: Record<string, unknown> }
type BankMockOptions = { lineCount?: 0 | 1 | 2; failMatchesOnce?: boolean }

async function mockBankContext(page: Page, options: BankMockOptions = {}) {
  const tenantId = '11111111-1111-4111-8111-111111111111'
  const accountSetId = '33333333-3333-4333-8333-333333333333'
  const fundAccountId = '66666666-6666-4666-8666-666666666666'
  const writes: BankWrite[] = []
  const unexpectedRpcs: string[] = []
  const state = {
    batchReads: [] as string[],
    lineReads: [] as string[],
    matchReads: [] as string[],
    writes,
    unexpectedRpcs,
    failMatchesRemaining: options.failMatchesOnce ? 1 : 0,
    holdBatchId: '' as string,
    holdMatchId: '' as string,
    holdWriter: '' as string,
    releaseBatch: undefined as (() => void) | undefined,
    releaseMatch: undefined as (() => void) | undefined,
    releaseWriter: undefined as (() => void) | undefined
  }
  const lineCount = options.lineCount ?? 0
  const batch = (id: string) => ({
    id,
    tenantId,
    accountSetId,
    fundAccountId,
    batchNo: id === batchAId ? 'TEST-BANK-001' : 'TEST-BANK-002',
    statementStartDate: '2026-10-01',
    statementEndDate: '2026-10-02',
    importedAt: '2026-10-02T08:00:00Z',
    importedBy: '测试用户',
    status: 'draft',
    version: 1,
    accountName: '测试银行账户',
    currencyCode: 'CNY',
    lineCount: id === batchAId ? lineCount : lineCount ? 1 : 0,
    matchedCount: lineCount ? 1 : 0,
    partialCount: lineCount ? 1 : 0,
    ignoredCount: 0,
    unmatchedCount: lineCount === 2 ? 1 : 0,
    fieldAccess: { statementAmounts: 'read' }
  })
  const lines = (id: string) =>
    lineCount
      ? [
          {
            id: id === batchAId ? lineA1Id : lineB1Id,
            tenantId,
            accountSetId,
            batchId: id,
            fundAccountId,
            lineNo: 1,
            transactionDate: '2026-10-01',
            direction: 'inflow',
            amount: 100,
            matchedAmount: 40,
            remainingAmount: 60,
            matchCount: 1,
            status: 'partial_matched'
          },
          ...(id === batchAId && lineCount === 2
            ? [
                {
                  id: lineA2Id,
                  tenantId,
                  accountSetId,
                  batchId: id,
                  fundAccountId,
                  lineNo: 2,
                  transactionDate: '2026-10-02',
                  direction: 'inflow',
                  amount: 80,
                  matchedAmount: 0,
                  remainingAmount: 80,
                  matchCount: 0,
                  status: 'unmatched'
                }
              ]
            : [])
        ]
      : []
  const matches = (lineId: string): Api.Fms.BankStatementMatchRecord[] =>
    lineId === lineA1Id || lineId === lineB1Id
      ? [
          {
            id: matchA1Id,
            tenantId,
            statementLineId: lineId,
            ledgerEntryId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            matchedAmount: 40,
            matchType: 'manual',
            matchedBy: '测试用户',
            matchedAt: '2026-10-02T08:00:00Z'
          }
        ]
      : []
  await page.route('**/rest/v1/**', (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/sys_dictionary')) return route.fallback()
    unexpectedRpcs.push(pathname)
    return route.abort()
  })
  for (const service of ['auth', 'storage', 'functions']) {
    await page.route(`**/${service}/v1/**`, (route) => route.abort())
  }
  await page.route('**/rest/v1/rpc/fms_get_bank_reconciliation_secure', async (route) => {
    const id = String(route.request().postDataJSON().p_batch_id)
    state.batchReads.push(id)
    if (state.holdBatchId === id)
      await new Promise<void>((resolve) => (state.releaseBatch = resolve))
    return route.fulfill({ json: batch(id) })
  })
  await page.route('**/rest/v1/rpc/fms_list_bank_statement_lines_secure', (route) => {
    const id = String(route.request().postDataJSON().p_batch_id)
    state.lineReads.push(id)
    return route.fulfill({ json: { records: lines(id) } })
  })
  await page.route('**/rest/v1/rpc/fms_list_bank_statement_matches_secure', async (route) => {
    const id = String(route.request().postDataJSON().p_statement_line_id)
    state.matchReads.push(id)
    if (state.holdMatchId === id)
      await new Promise<void>((resolve) => (state.releaseMatch = resolve))
    if (state.failMatchesRemaining > 0) {
      state.failMatchesRemaining -= 1
      return route.fulfill({
        status: 503,
        json: { code: 'PGRST000', message: 'technical match failure' }
      })
    }
    return route.fulfill({ json: matches(id) })
  })
  for (const rpc of [
    'auto_match_fms_bank_reconciliation_secure',
    'unmatch_fms_bank_statement_line_secure',
    'ignore_fms_bank_statement_line_secure',
    'transition_fms_bank_reconciliation_secure'
  ]) {
    await page.route(`**/rest/v1/rpc/${rpc}`, async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>
      writes.push({ rpc, payload })
      if (state.holdWriter === rpc)
        await new Promise<void>((resolve) => (state.releaseWriter = resolve))
      return route.fulfill({
        json: rpc.startsWith('auto_match')
          ? 1
          : rpc.startsWith('unmatch')
            ? payload.p_match_id
            : rpc.startsWith('ignore')
              ? { ...lines(batchAId)[1], status: 'ignored' }
              : batch(String(payload.p_batch_id))
      })
    })
  }
  return state
}

test('银行对账匹配读取失败保留已加载的批次和流水', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const evidence = await mockBankContext(page, { lineCount: 1, failMatchesOnce: true })
  await openFixture(page, testInfo.project.name, '?bank-context')
  await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await expect(drawer.getByRole('tab', { name: '流水与匹配' })).toBeVisible()
  await drawer.getByRole('tab', { name: '流水与匹配' }).click()
  await expect(drawer).toContainText('TEST-BANK-001')
  await expect(drawer).toContainText('2026-10-01')
  await expect(drawer.getByText('匹配记录加载失败，请重试。', { exact: true })).toBeVisible()
  await expect(drawer.getByText('银行对账详情加载失败，请重试或返回列表重新选择。')).toHaveCount(0)
  expect(evidence.writes).toEqual([])
  expect(evidence.unexpectedRpcs).toEqual([])
})

test('银行对账匹配503只重试匹配记录并保留批次和流水', async ({ page }, testInfo) => {
  const state = await mockBankContext(page, { lineCount: 1, failMatchesOnce: true })
  await openFixture(page, testInfo.project.name, '?bank-context')
  await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await drawer.getByRole('tab', { name: '流水与匹配' }).click()
  const matchCard = drawer.locator('.art-section-card').filter({ hasText: '匹配记录 · 第 1 行' })
  await expect(matchCard.getByText('匹配记录加载失败，请重试。', { exact: true })).toBeVisible()
  await expectNoViewportOverflow(page)
  await page.screenshot({
    path: testInfo.outputPath('bank-matches-error.png'),
    fullPage: false,
    animations: 'disabled'
  })
  const batchReads = [...state.batchReads]
  const lineReads = [...state.lineReads]
  await matchCard.getByRole('button', { name: '重新加载' }).click()
  await expect(matchCard).toContainText('测试用户')
  await expectNoViewportOverflow(page)
  await page.screenshot({
    path: testInfo.outputPath('bank-matches-recovered.png'),
    fullPage: false,
    animations: 'disabled'
  })
  expect(state.matchReads).toEqual([lineA1Id, lineA1Id])
  expect(state.batchReads).toEqual(batchReads)
  expect(state.lineReads).toEqual(lineReads)
  await expect(drawer).toContainText('TEST-BANK-001')
  await expect(drawer).toContainText('2026-10-01')
  expect(state.unexpectedRpcs).toEqual([])
})

test('银行对账自动匹配写入当前批次且只反馈一次', async ({ page }, testInfo) => {
  const state = await mockBankContext(page, { lineCount: 2 })
  await openFixture(page, testInfo.project.name, '?bank-context&bank-ordinary')
  await expect(page.getByTestId('bank-auth')).toHaveText('ordinary')
  await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await expect(drawer).toContainText('TEST-BANK-001')
  await drawer.getByRole('button', { name: '自动匹配' }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes).toEqual([
    {
      rpc: 'auto_match_fms_bank_reconciliation_secure',
      payload: { p_batch_id: batchAId, p_date_tolerance_days: 3 }
    }
  ])
  await expect(page.getByTestId('bank-changed')).toHaveText('1')
  await expect(page.locator('.el-message--success')).toHaveCount(1)
  await expect(page.locator('.el-message--success')).toContainText('自动匹配已完成')
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([{ kind: 'success', text: '自动匹配已完成' }])
  expect(state.unexpectedRpcs).toEqual([])
})

for (const action of ['complete', 'void'] as const) {
  test(`银行对账${action}写入当前版本原因且只反馈一次`, async ({ page }, testInfo) => {
    const state = await mockBankContext(page)
    await openFixture(page, testInfo.project.name, '?bank-context&bank-ordinary')
    await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
    await expect(drawer).toContainText('TEST-BANK-001')
    await drawer
      .getByRole('button', { name: action === 'complete' ? '完成对账' : '作废批次' })
      .click()
    const confirmation = page.getByRole('dialog', {
      name: action === 'complete' ? '完成银行对账' : '作废对账批次'
    })
    if (action === 'void') await confirmation.getByRole('textbox').fill('测试作废原因')
    await confirmation
      .getByRole('button', { name: action === 'complete' ? '确认完成' : '确定', exact: true })
      .click()
    await expect.poll(() => state.writes.length).toBe(1)
    expect(state.writes).toEqual([
      {
        rpc: 'transition_fms_bank_reconciliation_secure',
        payload: {
          p_batch_id: batchAId,
          p_action: action,
          p_reason: action === 'void' ? '测试作废原因' : null,
          p_expected_version: 1
        }
      }
    ])
    await expect(page.getByTestId('bank-changed')).toHaveText('1')
    await expect(page.locator('.el-message--success')).toHaveCount(1)
    await expect(page.locator('.el-message--success')).toContainText('银行对账状态已更新')
    await expect
      .poll(() => readActionFeedbackHistory(page))
      .toEqual([{ kind: 'success', text: '银行对账状态已更新' }])
    expect(state.unexpectedRpcs).toEqual([])
  })
}

test('银行流水忽略写入正确流水和原因且只反馈一次', async ({ page }, testInfo) => {
  const state = await mockBankContext(page, { lineCount: 2 })
  await openFixture(page, testInfo.project.name, '?bank-context&bank-ordinary')
  await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await drawer.getByRole('tab', { name: '流水与匹配' }).click()
  await drawer.getByRole('button', { name: '忽略流水' }).click()
  const prompt = page.getByRole('dialog', { name: '忽略银行流水' })
  await prompt.getByRole('textbox').fill('银行利息待补录')
  await prompt.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes).toEqual([
    {
      rpc: 'ignore_fms_bank_statement_line_secure',
      payload: { p_statement_line_id: lineA2Id, p_reason: '银行利息待补录' }
    }
  ])
  await expect(page.getByTestId('bank-changed')).toHaveText('1')
  await expect(page.locator('.el-message--success')).toHaveCount(1)
  await expect(page.locator('.el-message--success')).toContainText('银行流水已忽略')
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([{ kind: 'success', text: '银行流水已忽略' }])
  expect(state.unexpectedRpcs).toEqual([])
})

test('银行流水撤销匹配写入正确匹配ID且只反馈一次', async ({ page }, testInfo) => {
  const state = await mockBankContext(page, { lineCount: 2 })
  await openFixture(page, testInfo.project.name, '?bank-context&bank-ordinary')
  await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await drawer.getByRole('tab', { name: '流水与匹配' }).click()
  await expect(
    drawer.locator('.art-section-card').filter({ hasText: '匹配记录 · 第 1 行' })
  ).toContainText('测试用户')
  await drawer.getByRole('button', { name: '撤销匹配' }).click()
  await page
    .getByRole('dialog', { name: '撤销银行流水匹配' })
    .getByRole('button', { name: '确认撤销' })
    .click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes).toEqual([
    {
      rpc: 'unmatch_fms_bank_statement_line_secure',
      payload: { p_match_id: matchA1Id }
    }
  ])
  await expect(page.getByTestId('bank-changed')).toHaveText('1')
  await expect(page.locator('.el-message--success')).toHaveCount(1)
  await expect(page.locator('.el-message--success')).toContainText('匹配已撤销')
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([{ kind: 'success', text: '匹配已撤销' }])
  expect(state.unexpectedRpcs).toEqual([])
})

test('忽略原因输入期间切换批次不写入旧流水', async ({ page }, testInfo) => {
  const state = await mockBankContext(page, { lineCount: 2 })
  await openFixture(page, testInfo.project.name, '?bank-context')
  await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await drawer.getByRole('tab', { name: '流水与匹配' }).click()
  await drawer.getByRole('button', { name: '忽略流水' }).click()
  const prompt = page.getByRole('dialog', { name: '忽略银行流水' })
  await prompt.getByRole('textbox').fill('旧批次原因')
  // External fixture control bypasses the modal backdrop to simulate a workspace context switch.
  await page
    .getByRole('button', { name: '打开银行对账详情 B', exact: true })
    .evaluate((element: HTMLButtonElement) => element.click())
  await expect(drawer).toContainText('TEST-BANK-002')
  await prompt
    .getByRole('button', { name: '确定', exact: true })
    .evaluate((element: HTMLButtonElement) => element.click())
  await expect(prompt).toBeHidden()
  expect(state.writes).toEqual([])
  await expect(page.getByTestId('bank-changed')).toHaveText('0')
  expect(state.unexpectedRpcs).toEqual([])
})

test('撤销匹配确认期间改选同批次另一流水不写旧匹配', async ({ page }, testInfo) => {
  const state = await mockBankContext(page, { lineCount: 2 })
  await openFixture(page, testInfo.project.name, '?bank-context')
  await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await drawer.getByRole('tab', { name: '流水与匹配' }).click()
  await expect(
    drawer.locator('.art-section-card').filter({ hasText: '匹配记录 · 第 1 行' })
  ).toContainText('测试用户')
  await drawer.getByRole('button', { name: '撤销匹配' }).click()
  const confirmation = page.getByRole('dialog', { name: '撤销银行流水匹配' })
  await expect(confirmation).toBeVisible()
  // This is the real View Match action, forced only through the modal backdrop.
  const backgroundDrawer = page.getByRole('dialog', {
    name: '银行对账',
    exact: true,
    includeHidden: true
  })
  await backgroundDrawer
    .getByRole('button', { name: '查看匹配', includeHidden: true })
    .nth(1)
    .evaluate((element: HTMLButtonElement) => element.click())
  await expect(backgroundDrawer).toContainText('匹配记录 · 第 2 行')
  await confirmation
    .getByRole('button', { name: '确认撤销' })
    .evaluate((element: HTMLButtonElement) => element.click())
  await expect(confirmation).toBeHidden()
  expect(state.matchReads).toContain(lineA2Id)
  expect(state.writes).toEqual([])
  await expect(page.getByTestId('bank-changed')).toHaveText('0')
  expect(state.unexpectedRpcs).toEqual([])
})

test('普通用户确认期间撤销银行权限不派发写入', async ({ page }, testInfo) => {
  const state = await mockBankContext(page)
  await openFixture(page, testInfo.project.name, '?bank-context&bank-ordinary')
  await expect(page.getByTestId('bank-auth')).toHaveText('ordinary')
  await expect(page.getByTestId('bank-grants')).toHaveText('5')
  await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await expect(drawer).toContainText('TEST-BANK-001')
  await drawer.getByRole('button', { name: '完成对账' }).click()
  const confirmation = page.getByRole('dialog', { name: '完成银行对账' })
  await expect(confirmation).toBeVisible()
  // External fixture control changes the real menu grants while confirmation remains open.
  await page
    .getByRole('button', { name: '撤销银行权限', exact: true })
    .evaluate((element: HTMLButtonElement) => element.click())
  await expect(page.getByTestId('bank-grants')).toHaveText('0')
  await confirmation
    .getByRole('button', { name: '确认完成' })
    .evaluate((element: HTMLButtonElement) => element.click())
  await expect(confirmation).toBeHidden()
  expect(state.writes).toEqual([])
  await expect(page.getByTestId('bank-changed')).toHaveText('0')
  expect(state.unexpectedRpcs).toEqual([])
})

test('旧批次主读取晚于新批次返回时保持新批次内容', async ({ page }, testInfo) => {
  const state = await mockBankContext(page, { lineCount: 1 })
  state.holdBatchId = batchAId
  await openFixture(page, testInfo.project.name, '?bank-context')
  await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
  await expect.poll(() => state.batchReads.includes(batchAId)).toBe(true)
  // External fixture control bypasses the open drawer backdrop.
  await page
    .getByRole('button', { name: '打开银行对账详情 B', exact: true })
    .evaluate((element: HTMLButtonElement) => element.click())
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await expect(drawer).toContainText('TEST-BANK-002')
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/fms_get_bank_reconciliation_secure') &&
      response.request().postDataJSON().p_batch_id === batchAId
  )
  state.releaseBatch?.()
  await oldResponse
  await page.waitForTimeout(100)
  await expect(drawer).toContainText('TEST-BANK-002')
  await expect(drawer).not.toContainText('TEST-BANK-001')
  expect(state.batchReads).toContain(batchBId)
  expect(state.lineReads).toContain(batchBId)
  expect(state.writes).toEqual([])
  expect(state.unexpectedRpcs).toEqual([])
})

test('旧流水匹配读取晚于新流水返回时保持新选择', async ({ page }, testInfo) => {
  const state = await mockBankContext(page, { lineCount: 2 })
  state.holdMatchId = lineA1Id
  await openFixture(page, testInfo.project.name, '?bank-context')
  await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await drawer.getByRole('tab', { name: '流水与匹配' }).click()
  await expect.poll(() => state.matchReads.includes(lineA1Id)).toBe(true)
  await drawer.getByRole('button', { name: '查看匹配' }).nth(1).click()
  await expect(drawer).toContainText('匹配记录 · 第 2 行')
  await expect(drawer.getByText('该银行流水暂无匹配记录', { exact: true })).toBeVisible()
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/fms_list_bank_statement_matches_secure') &&
      response.request().postDataJSON().p_statement_line_id === lineA1Id
  )
  state.releaseMatch?.()
  await oldResponse
  await page.waitForTimeout(100)
  await expect(drawer).toContainText('匹配记录 · 第 2 行')
  await expect(drawer.getByText('测试用户', { exact: true })).toHaveCount(0)
  expect(state.matchReads).toEqual([lineA1Id, lineA2Id])
  expect(state.writes).toEqual([])
  expect(state.unexpectedRpcs).toEqual([])
})

test('旧批次写入晚于新批次返回时不发陈旧反馈或变更事件', async ({ page }, testInfo) => {
  const state = await mockBankContext(page)
  state.holdWriter = 'auto_match_fms_bank_reconciliation_secure'
  await openFixture(page, testInfo.project.name, '?bank-context')
  await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await expect(drawer).toContainText('TEST-BANK-001')
  await drawer.getByRole('button', { name: '自动匹配' }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes[0].payload.p_batch_id).toBe(batchAId)
  // External fixture control bypasses the open drawer backdrop while the RPC is pending.
  await page
    .getByRole('button', { name: '打开银行对账详情 B', exact: true })
    .evaluate((element: HTMLButtonElement) => element.click())
  await expect(drawer).toContainText('TEST-BANK-002')
  const oldResponse = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/auto_match_fms_bank_reconciliation_secure')
  )
  state.releaseWriter?.()
  await oldResponse
  await page.waitForTimeout(100)
  await expect(drawer).toContainText('TEST-BANK-002')
  await expect(page.getByTestId('bank-changed')).toHaveText('0')
  await expect(page.locator('.el-message--success, .el-message--error')).toHaveCount(0)
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(state.unexpectedRpcs).toEqual([])
})

for (const { action, context } of [
  { action: 'complete', context: 'batch' },
  { action: 'void', context: 'batch' },
  { action: 'complete', context: 'route' },
  { action: 'void', context: 'tenant' }
] as const) {
  test(`银行对账${action}确认期间切换${context}不写入旧上下文`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const evidence = await mockBankContext(page)
    await openFixture(page, testInfo.project.name, '?bank-context')
    await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
    await expect(drawer).toContainText('TEST-BANK-001')
    await drawer
      .getByRole('button', { name: action === 'complete' ? '完成对账' : '作废批次' })
      .click()
    const confirmation = page.getByRole('dialog', {
      name: action === 'complete' ? '完成银行对账' : '作废对账批次'
    })
    await expect(confirmation).toBeVisible()
    if (action === 'void') await confirmation.getByRole('textbox').fill('测试作废原因')
    const switchButton = page.getByRole('button', {
      name:
        context === 'batch'
          ? '打开银行对账详情 B'
          : context === 'route'
            ? '切换测试路由'
            : '切换测试租户',
      exact: true
    })
    await switchButton.evaluate((element: HTMLButtonElement) => element.click())
    if (context === 'batch') await expect(drawer).toContainText('TEST-BANK-002')
    else
      await expect(page.getByTestId('bank-context')).toHaveText(
        context === 'route'
          ? '/other:11111111-1111-4111-8111-111111111111'
          : '/:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      )
    await expect(confirmation).toBeVisible()
    await confirmation
      .getByRole('button', { name: action === 'complete' ? '确认完成' : '确定', exact: true })
      .evaluate((element: HTMLButtonElement) => element.click())
    await expect(confirmation).toBeHidden()
    await page.waitForTimeout(250)
    expect(evidence.writes).toEqual([])
    expect(evidence.unexpectedRpcs).toEqual([])
  })
}

test('资金调拨详情区分请求失败、记录不存在并可重试', async ({ page }, testInfo) => {
  let attempts = 0
  await page.route('**/rest/v1/rpc/fms_get_fund_transfer_secure', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'PGRST000', message: 'technical failure' })
      })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      body:
        attempts === 2
          ? 'null'
          : JSON.stringify({
              id: '44444444-4444-4444-8444-444444444444',
              tenantId: '11111111-1111-4111-8111-111111111111',
              accountSetId: '33333333-3333-4333-8333-333333333333',
              transferNo: 'TEST-TRANSFER-001',
              transferDate: '2026-10-02',
              amount: 10,
              purpose: '验收测试',
              status: 'draft',
              version: 1,
              createTime: '2026-10-02T08:00:00Z',
              updateTime: '2026-10-02T08:00:00Z',
              sourceAccountName: '测试账户 A',
              targetAccountName: '测试账户 B',
              currencyCode: 'CNY',
              currencyName: '人民币',
              fieldAccess: { transferAccounts: 'read', transferAmounts: 'read' }
            })
    })
  })
  await page.route('**/rest/v1/rpc/fms_list_fund_transfer_actions_secure', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' })
  )

  await openFixture(page, testInfo.project.name)
  await page.getByRole('button', { name: '打开资金调拨详情' }).click()
  const drawer = page.locator('.el-drawer')
  await expect(
    drawer.getByText('资金调拨详情加载失败，请重试或返回列表重新选择。', { exact: true })
  ).toBeVisible()
  await expect(drawer.getByText('technical failure')).toHaveCount(0)
  await drawer.getByRole('button', { name: '重新加载' }).click()
  await expect(drawer.getByText('暂无资金调拨详情')).toBeVisible()
  await drawer.getByRole('button', { name: '重新加载' }).click()
  await expect(drawer.getByText('测试账户 A')).toBeVisible()
  await expect(drawer.getByText('暂无操作记录')).toBeVisible()
  expect(attempts).toBe(3)
  await expectNoViewportOverflow(page)
  await page.screenshot({
    path: `.artifacts/fms-fund-transfer-detail-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
})

test('银行对账详情区分接口错误与空批次，重试后显示空流水', async ({ page }, testInfo) => {
  let attempts = 0
  await page.route('**/rest/v1/rpc/fms_get_bank_reconciliation_secure', async (route) => {
    attempts += 1
    await route.fulfill({
      status: attempts === 1 ? 503 : 200,
      contentType: 'application/json',
      body:
        attempts === 1
          ? JSON.stringify({ code: 'PGRST000', message: 'technical failure' })
          : attempts === 2
            ? 'null'
            : JSON.stringify({
                id: '55555555-5555-4555-8555-555555555555',
                tenantId: '11111111-1111-4111-8111-111111111111',
                accountSetId: '33333333-3333-4333-8333-333333333333',
                fundAccountId: '66666666-6666-4666-8666-666666666666',
                batchNo: 'TEST-BANK-001',
                statementStartDate: '2026-10-01',
                statementEndDate: '2026-10-02',
                importedAt: '2026-10-02T08:00:00Z',
                importedBy: '测试用户',
                status: 'draft',
                version: 1,
                createTime: '2026-10-02T08:00:00Z',
                updateTime: '2026-10-02T08:00:00Z',
                accountCode: 'TEST-ACCOUNT',
                accountName: '测试银行账户',
                currencyCode: 'CNY',
                lineCount: 0,
                matchedCount: 0,
                partialCount: 0,
                ignoredCount: 0,
                unmatchedCount: 0,
                fieldAccess: { statementAmounts: 'read' }
              })
    })
  })
  await page.route('**/rest/v1/rpc/fms_list_bank_statement_lines_secure', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"records":[]}' })
  )

  await openFixture(page, testInfo.project.name)
  await page.getByRole('button', { name: '打开银行对账详情' }).click()
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await expect(
    drawer.getByText('银行对账详情加载失败，请重试或返回列表重新选择。', { exact: true })
  ).toBeVisible()
  await expect(drawer.getByText('technical failure')).toHaveCount(0)
  await drawer.getByRole('button', { name: '重新加载' }).click()
  await expect(drawer.getByText('暂无银行对账详情')).toBeVisible()
  await drawer.getByRole('button', { name: '重新加载' }).click()
  await drawer.getByRole('tab', { name: '流水与匹配' }).click()
  await expect(drawer.getByText('暂无银行流水', { exact: true })).toBeVisible()
  await expect(drawer.getByText('余额差待核算')).toBeVisible()
  expect(attempts).toBe(3)
  await expectNoViewportOverflow(page)
  await page.screenshot({
    path: `.artifacts/fms-bank-reconciliation-detail-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
})

test('会计期间查询失败后可重试到业务空态', async ({ page }, testInfo) => {
  let attempts = 0
  await page.route('**/rest/v1/fms_accounting_period?*', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' })
  )
  await page.route('**/rest/v1/rpc/fms_accounting_foundation_summary', async (route) => {
    attempts += 1
    await route.fulfill({
      status: attempts === 1 ? 503 : 200,
      contentType: 'application/json',
      body:
        attempts === 1
          ? JSON.stringify({ code: 'PGRST000', message: 'technical failure' })
          : JSON.stringify({
              accountSetId: '33333333-3333-4333-8333-333333333333',
              subjectCount: 0,
              enabledSubjectCount: 0,
              currencyCount: 0,
              auxiliaryTypeCount: 0,
              openPeriodCount: 0,
              closedPeriodCount: 0,
              openingBalanceCount: 0
            })
    })
  })

  await openFixture(page, testInfo.project.name)
  await page.getByRole('button', { name: '打开会计期间' }).click()
  const drawer = page.locator('.el-drawer')
  await expect(drawer.getByText('会计期间加载失败，请稍后重试。', { exact: true })).toBeVisible()
  await expect(drawer.getByText('technical failure')).toHaveCount(0)
  await drawer.getByRole('button', { name: '重新加载' }).click()
  await expect(drawer.getByText('暂无会计期间')).toBeVisible()
  await expect(drawer.getByRole('combobox', { name: '会计年度' })).toBeDisabled()
  await expect(drawer.getByText('暂无会计年度', { exact: true })).toBeVisible()
  const card = drawer.locator('.art-section-card').filter({ hasText: '暂无会计期间' })
  const identity = await card.locator('.art-section-card__identity').boundingBox()
  const actions = await card.locator('.art-section-card__actions').boundingBox()
  expect(identity).not.toBeNull()
  expect(actions).not.toBeNull()
  if (page.viewportSize()!.width <= 640) {
    expect(identity!.width).toBeGreaterThan(240)
    expect(actions!.y).toBeGreaterThanOrEqual(identity!.y + identity!.height)
  }
  expect(attempts).toBe(2)
  await expectNoViewportOverflow(page)
  await page.screenshot({
    path: `.artifacts/fms-accounting-period-empty-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
})

test('商业票据详情在错误和空结果后仍保留重试能力', async ({ page }, testInfo) => {
  let attempts = 0
  await page.route('**/rest/v1/rpc/fms_get_commercial_bill_secure', async (route) => {
    attempts += 1
    await route.fulfill({
      status: attempts === 1 ? 503 : 200,
      contentType: 'application/json',
      body:
        attempts === 1
          ? JSON.stringify({ code: 'PGRST000', message: 'technical failure' })
          : attempts === 2
            ? 'null'
            : JSON.stringify({
                id: '77777777-7777-4777-8777-777777777777',
                tenantId: '11111111-1111-4111-8111-111111111111',
                accountSetId: '33333333-3333-4333-8333-333333333333',
                billNo: 'TEST-BILL-001',
                direction: 'receivable',
                billType: 'bank_acceptance',
                status: 'draft',
                issueDate: '2026-10-02',
                dueDate: '2026-11-02',
                currencyCode: 'CNY',
                transferable: true,
                version: 1,
                createTime: '2026-10-02T08:00:00Z',
                updateTime: '2026-10-02T08:00:00Z',
                fieldAccess: { billAmounts: 'read', billParties: 'read', billReferences: 'read' }
              })
    })
  })
  await page.route('**/rest/v1/rpc/fms_list_commercial_bill_events_secure', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' })
  )

  await openFixture(page, testInfo.project.name)
  await page.getByRole('button', { name: '打开商业票据详情' }).click()
  const drawer = page.locator('.el-drawer')
  await expect(
    drawer.getByText('票据详情加载失败，请重试或返回列表重新选择。', { exact: true })
  ).toBeVisible()
  await expect(drawer.getByText('technical failure')).toHaveCount(0)
  await drawer.getByRole('button', { name: '重新加载' }).click()
  await expect(drawer.getByText('暂无票据详情')).toBeVisible()
  await drawer.getByRole('button', { name: '重新加载' }).click()
  await expect(drawer.getByText('草稿尚未产生流转记录')).toBeVisible()
  expect(attempts).toBe(3)
  await expectNoViewportOverflow(page)
  await page.screenshot({
    path: `.artifacts/fms-commercial-bill-detail-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
  await drawer.getByText('草稿尚未产生流转记录').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: `.artifacts/fms-commercial-bill-detail-lower-${testInfo.project.name}.png`,
    animations: 'disabled'
  })
})

const manualCandidateId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

async function mockParentManualMatch(page: Page) {
  const candidates: Record<string, unknown>[] = []
  const writes: Record<string, unknown>[] = []
  const state = {
    candidates,
    writes,
    holdWrite: false,
    releaseWrite: undefined as (() => void) | undefined
  }
  await page.route('**/rest/v1/rpc/fms_list_bank_match_candidates_secure', (route) => {
    candidates.push(route.request().postDataJSON() as Record<string, unknown>)
    return route.fulfill({
      json: {
        records: [
          {
            id: manualCandidateId,
            entryDate: '2026-10-02',
            summary: 'A 候选资金流水',
            amount: 80,
            sourceNo: 'A-001'
          }
        ]
      }
    })
  })
  await page.route('**/rest/v1/rpc/match_fms_bank_statement_line_secure', async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>
    writes.push(payload)
    if (state.holdWrite) await new Promise<void>((resolve) => (state.releaseWrite = resolve))
    return route.fulfill({
      json: {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        tenantId: '11111111-1111-4111-8111-111111111111',
        statementLineId: payload.p_statement_line_id,
        ledgerEntryId: payload.p_ledger_entry_id,
        matchedAmount: payload.p_matched_amount,
        matchType: 'manual',
        matchedBy: '测试用户',
        matchedAt: '2026-10-02T08:00:00Z'
      }
    })
  })
  return state
}

async function openParentManualMatch(page: Page) {
  await page.getByRole('button', { name: '打开银行对账详情', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '银行对账', exact: true })
  await expect(drawer).toContainText('TEST-BANK-001')
  await drawer.getByRole('tab', { name: '流水与匹配' }).click()
  await drawer
    .getByRole('row')
    .filter({ hasText: '2026-10-02' })
    .getByRole('button', {
      name: '手工匹配'
    })
    .click()
  const dialog = page.getByRole('dialog', { name: '手工匹配 · 第 2 行' })
  await expect(dialog.getByRole('button', { name: '确认匹配' })).toBeEnabled()
  await dialog.getByRole('combobox', { name: '资金流水' }).click()
  await page.getByRole('option', { name: /A 候选资金流水/ }).click()
  await dialog.getByRole('spinbutton', { name: '匹配金额' }).fill('12.34')
  await dialog.getByRole('textbox', { name: '匹配说明' }).fill('  核对金额  ')
  return { drawer, dialog }
}

test('父银行对账抽屉手工匹配提交后只反馈一次并刷新父详情', async ({ page }, testInfo) => {
  const parent = await mockBankContext(page, { lineCount: 2 })
  const manual = await mockParentManualMatch(page)
  await openFixture(page, testInfo.project.name, '?bank-context')
  const { drawer, dialog } = await openParentManualMatch(page)
  const initialBatchReads = parent.batchReads.length
  const initialLineReads = parent.lineReads.length
  await dialog.getByRole('button', { name: '确认匹配' }).click()
  await expect.poll(() => manual.writes.length).toBe(1)
  expect(manual.candidates).toEqual([{ p_statement_line_id: lineA2Id, p_date_tolerance_days: 30 }])
  expect(manual.writes).toEqual([
    {
      p_statement_line_id: lineA2Id,
      p_ledger_entry_id: manualCandidateId,
      p_matched_amount: 12.34,
      p_remark: '核对金额'
    }
  ])
  await expect(page.getByTestId('bank-changed')).toHaveText('1')
  await expect.poll(() => parent.batchReads.length).toBeGreaterThan(initialBatchReads)
  await expect.poll(() => parent.lineReads.length).toBeGreaterThan(initialLineReads)
  await expect(drawer).toContainText('TEST-BANK-001')
  await expect(dialog).toBeHidden()
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([{ kind: 'success', text: '银行流水已匹配' }])
  expect(parent.writes).toEqual([])
  expect(parent.unexpectedRpcs).toEqual([])
})

test('父抽屉切到B后晚到的A手工匹配不反馈或刷新B', async ({ page }, testInfo) => {
  const parent = await mockBankContext(page, { lineCount: 2 })
  const manual = await mockParentManualMatch(page)
  manual.holdWrite = true
  await openFixture(page, testInfo.project.name, '?bank-context')
  const { dialog } = await openParentManualMatch(page)
  await dialog.getByRole('button', { name: '确认匹配' }).click()
  await expect.poll(() => manual.writes.length).toBe(1)
  // External fixture seam switches the real parent drawer while its modal child is pending.
  await page
    .getByRole('button', { name: '打开银行对账详情 B', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click())
  const backgroundDrawer = page.getByRole('dialog', {
    name: '银行对账',
    exact: true,
    includeHidden: true
  })
  await expect(backgroundDrawer).toContainText('TEST-BANK-002')
  await expect
    .poll(() => parent.batchReads.filter((id) => id === batchBId).length)
    .toBeGreaterThan(0)
  const bReads = parent.batchReads.filter((id) => id === batchBId).length
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/match_fms_bank_statement_line_secure') &&
      response.request().postDataJSON().p_statement_line_id === lineA2Id
  )
  manual.releaseWrite?.()
  await oldResponse
  const oldDialog = page.getByRole('dialog', {
    name: '手工匹配 · 第 2 行',
    includeHidden: true
  })
  await expect
    .poll(async () => {
      if (!(await oldDialog.count()) || !(await oldDialog.isVisible())) return true
      return oldDialog.getByRole('button', { name: '确认匹配', includeHidden: true }).isEnabled()
    })
    .toBe(true)
  expect(manual.writes).toEqual([
    {
      p_statement_line_id: lineA2Id,
      p_ledger_entry_id: manualCandidateId,
      p_matched_amount: 12.34,
      p_remark: '核对金额'
    }
  ])
  await expect(backgroundDrawer).toContainText('TEST-BANK-002')
  await expect(page.getByTestId('bank-changed')).toHaveText('0')
  expect(parent.batchReads.filter((id) => id === batchBId)).toHaveLength(bReads)
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(parent.writes).toEqual([])
  expect(parent.unexpectedRpcs).toEqual([])
})
