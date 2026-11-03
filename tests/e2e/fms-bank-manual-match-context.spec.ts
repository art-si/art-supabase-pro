import { expect, test, type Page } from '@playwright/test'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const fixtureUrl = '/tests/e2e/fixtures/fms-bank-manual-match-context.html'
const lineAId = '77777777-7777-4777-8777-777777777777'
const lineBId = '88888888-8888-4888-8888-888888888888'
const candidateAId = '99999999-9999-4999-8999-999999999999'
const candidateBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const otherTenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

type RpcPayload = Record<string, unknown>
type ManualMockOptions = { failCandidateOnce?: boolean; emptyCandidates?: boolean }

async function mockManualRpc(page: Page, options: ManualMockOptions = {}) {
  const state = {
    candidates: [] as RpcPayload[],
    writes: [] as RpcPayload[],
    unknownRest: [] as string[],
    failCandidateRemaining: options.failCandidateOnce ? 1 : 0,
    holdCandidateId: '',
    holdWrite: false,
    releaseCandidate: undefined as (() => void) | undefined,
    releaseWrite: undefined as (() => void) | undefined
  }
  await page.route('**/rest/v1/**', (route) => {
    state.unknownRest.push(new URL(route.request().url()).pathname)
    return route.abort()
  })
  for (const service of ['auth', 'storage', 'functions']) {
    await page.route(`**/${service}/v1/**`, (route) => route.abort())
  }
  await page.route('**/rest/v1/rpc/fms_list_bank_match_candidates_secure', async (route) => {
    const payload = route.request().postDataJSON() as RpcPayload
    state.candidates.push(payload)
    const lineId = String(payload.p_statement_line_id)
    if (state.holdCandidateId === lineId)
      await new Promise<void>((resolve) => (state.releaseCandidate = resolve))
    if (state.failCandidateRemaining > 0) {
      state.failCandidateRemaining -= 1
      return route.fulfill({
        status: 503,
        json: { code: 'PGRST000', message: 'technical candidate failure' }
      })
    }
    return route.fulfill({
      json: {
        records: options.emptyCandidates
          ? []
          : [
              {
                id: lineId === lineAId ? candidateAId : candidateBId,
                entryDate: '2026-10-02',
                summary: lineId === lineAId ? 'A 候选资金流水' : 'B 候选资金流水',
                amount: 80,
                sourceNo: lineId === lineAId ? 'A-001' : 'B-001'
              }
            ]
      }
    })
  })
  await page.route('**/rest/v1/rpc/match_fms_bank_statement_line_secure', async (route) => {
    const payload = route.request().postDataJSON() as RpcPayload
    state.writes.push(payload)
    if (state.holdWrite) await new Promise<void>((resolve) => (state.releaseWrite = resolve))
    return route.fulfill({
      json: {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
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

async function openFixture(page: Page, projectName: string, platform = false) {
  const params = new URLSearchParams({
    theme: projectName.includes('dark') ? 'dark' : 'light',
    box: projectName.includes('shadow') ? 'shadow' : 'border'
  })
  if (platform) params.set('platform', '1')
  await page.goto(`${fixtureUrl}?${params}`, { waitUntil: 'domcontentloaded' })
  await installActionFeedbackHistory(page)
}

async function expectNoViewportOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)
}

test('手工匹配正常提交真实ArtForm金额说明且只反馈一次', async ({ page }, info) => {
  const state = await mockManualRpc(page)
  await openFixture(page, info.project.name)
  await expect(page.getByTestId('manual-identity')).toHaveText('ordinary')
  await expect(page.getByTestId('manual-grants')).toHaveText('1')
  await page.getByRole('button', { name: '打开手工匹配 A' }).click()
  const dialog = page.getByRole('dialog', { name: '手工匹配 · 第 1 行' })
  await expect(dialog.getByRole('button', { name: '确认匹配' })).toBeEnabled()
  await dialog.getByRole('combobox', { name: '资金流水' }).click()
  await page.getByRole('option', { name: /A 候选资金流水/ }).click()
  await dialog.getByRole('spinbutton', { name: '匹配金额' }).fill('12.34')
  await dialog.getByRole('textbox', { name: '匹配说明' }).fill('  核对金额  ')
  await expectNoViewportOverflow(page)
  await page.screenshot({
    path: info.outputPath('manual-match-filled.png'),
    fullPage: false,
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '确认匹配' }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.candidates).toEqual([{ p_statement_line_id: lineAId, p_date_tolerance_days: 30 }])
  expect(state.writes).toEqual([
    {
      p_statement_line_id: lineAId,
      p_ledger_entry_id: candidateAId,
      p_matched_amount: 12.34,
      p_remark: '核对金额'
    }
  ])
  await expect(page.getByTestId('manual-changed')).toHaveText('1')
  await expect(page.locator('.el-message--success')).toHaveCount(1)
  await expect(page.locator('.el-message--success')).toContainText('银行流水已匹配')
  await expect
    .poll(() => readActionFeedbackHistory(page))
    .toEqual([{ kind: 'success', text: '银行流水已匹配' }])
  await expect(dialog).toBeHidden()
  expect(state.unknownRest).toEqual([])
})

test('候选503只显示局部错误并可独立重试', async ({ page }, info) => {
  const state = await mockManualRpc(page, { failCandidateOnce: true })
  await openFixture(page, info.project.name)
  await page.getByRole('button', { name: '打开手工匹配 A' }).click()
  const dialog = page.getByRole('dialog', { name: '手工匹配 · 第 1 行' })
  const ledgerField = dialog
    .locator('.el-form-item')
    .filter({ has: page.getByRole('combobox', { name: '资金流水' }) })
  await expect(ledgerField.getByText('选项加载失败', { exact: true })).toBeVisible()
  await expect(
    ledgerField.getByText('数据库服务暂时不可用，请稍后重试', { exact: true })
  ).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确认匹配' })).toBeDisabled()
  await expect(page.getByText('technical candidate failure')).toHaveCount(0)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  expect(await readActionFeedbackHistory(page)).toEqual([])
  await expectNoViewportOverflow(page)
  await page.screenshot({
    path: info.outputPath('manual-candidates-error.png'),
    fullPage: false,
    animations: 'disabled'
  })
  await ledgerField.getByRole('button', { name: '重新加载' }).click()
  await expect(dialog.getByRole('button', { name: '确认匹配' })).toBeEnabled()
  await dialog.getByRole('combobox', { name: '资金流水' }).click()
  await expect(page.getByRole('option', { name: /A 候选资金流水/ })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '确认匹配' })).toBeEnabled()
  await expectNoViewportOverflow(page)
  await page.screenshot({
    path: info.outputPath('manual-candidates-recovered.png'),
    fullPage: false,
    animations: 'disabled'
  })
  expect(state.candidates).toEqual([
    { p_statement_line_id: lineAId, p_date_tolerance_days: 30 },
    { p_statement_line_id: lineAId, p_date_tolerance_days: 30 }
  ])
  expect(state.writes).toEqual([])
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(state.unknownRest).toEqual([])
})

test('手工匹配无候选时显示友好空态且阻止提交', async ({ page }, info) => {
  const state = await mockManualRpc(page, { emptyCandidates: true })
  await openFixture(page, info.project.name)
  await page.getByRole('button', { name: '打开手工匹配 A' }).click()
  const dialog = page.getByRole('dialog', { name: '手工匹配 · 第 1 行' })
  await expect.poll(() => state.candidates.length).toBe(1)
  expect(state.candidates).toEqual([{ p_statement_line_id: lineAId, p_date_tolerance_days: 30 }])
  await expect(dialog.getByRole('button', { name: '确认匹配' })).toBeDisabled()
  await dialog.getByRole('combobox', { name: '资金流水' }).click()
  await expect(page.getByText('暂无同账户、同方向的可匹配资金流水', { exact: true })).toBeVisible()
  await expectNoViewportOverflow(page)
  await page.screenshot({
    path: info.outputPath('manual-candidates-empty.png'),
    fullPage: false,
    animations: 'disabled'
  })
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(state.writes).toEqual([])
  expect(state.unknownRest).toEqual([])
  await expect(page.getByTestId('manual-changed')).toHaveText('0')
})

test('A候选晚于B返回时不覆盖新弹窗候选', async ({ page }, info) => {
  const state = await mockManualRpc(page)
  state.holdCandidateId = lineAId
  await openFixture(page, info.project.name)
  await page.getByRole('button', { name: '打开手工匹配 A' }).click()
  await expect.poll(() => state.candidates.length).toBe(1)
  // External fixture button bypasses the open modal; the product still receives its public handleOpen.
  await page
    .getByRole('button', { name: '打开手工匹配 B' })
    .evaluate((button: HTMLButtonElement) => button.click())
  const dialog = page.getByRole('dialog', { name: '手工匹配 · 第 2 行' })
  await expect(dialog.getByRole('button', { name: '确认匹配' })).toBeEnabled()
  await dialog.getByRole('combobox', { name: '资金流水' }).click()
  await expect(page.getByRole('option', { name: /B 候选资金流水/ })).toBeVisible()
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/fms_list_bank_match_candidates_secure') &&
      response.request().postDataJSON().p_statement_line_id === lineAId
  )
  state.releaseCandidate?.()
  await oldResponse
  await page.waitForTimeout(100)
  await expect(page.getByRole('option', { name: /B 候选资金流水/ })).toBeVisible()
  await expect(page.getByRole('option', { name: /A 候选资金流水/ })).toHaveCount(0)
  expect(state.candidates.map((payload) => payload.p_statement_line_id)).toEqual([lineAId, lineBId])
  expect(state.writes).toEqual([])
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(state.unknownRest).toEqual([])
})

test('A表单校验异步延续到B后不写入或污染B错误', async ({ page }, info) => {
  const state = await mockManualRpc(page)
  await openFixture(page, info.project.name)
  await page.getByRole('button', { name: '打开手工匹配 A' }).click()
  const dialogA = page.getByRole('dialog', { name: '手工匹配 · 第 1 行' })
  await expect(dialogA.getByRole('button', { name: '确认匹配' })).toBeEnabled()
  await dialogA.getByRole('combobox', { name: '资金流水' }).click()
  await page.getByRole('option', { name: /A 候选资金流水/ }).click()
  await dialogA.getByRole('spinbutton', { name: '匹配金额' }).fill('12.34')
  const confirm = dialogA.getByRole('button', { name: '确认匹配' })
  await expect(confirm).toBeEnabled()
  // One browser task clicks the real confirm button and then the external B opener. The actual
  // ArtForm validation promise supplies the async boundary; no validator or handler is replaced.
  await confirm.evaluate((button: HTMLButtonElement) => {
    button.click()
    const openB = document.querySelector<HTMLButtonElement>('[data-testid="open-manual-b"]')
    if (!openB) throw new Error('B 公开入口缺失')
    openB.click()
  })
  const dialogB = page.getByRole('dialog', { name: '手工匹配 · 第 2 行' })
  await expect(dialogB.getByRole('button', { name: '确认匹配' })).toBeEnabled()
  await page.waitForTimeout(100)
  await expect(dialogB.locator('.el-form-item__error')).toHaveCount(0)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  expect(state.writes).toEqual([])
  await expect(page.getByTestId('manual-changed')).toHaveText('0')
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(state.unknownRest).toEqual([])
})

test('A匹配响应晚于B打开时不提示不变更也不关闭B', async ({ page }, info) => {
  const state = await mockManualRpc(page)
  state.holdWrite = true
  await openFixture(page, info.project.name)
  await page.getByRole('button', { name: '打开手工匹配 A' }).click()
  const dialogA = page.getByRole('dialog', { name: '手工匹配 · 第 1 行' })
  await expect(dialogA.getByRole('button', { name: '确认匹配' })).toBeEnabled()
  await dialogA.getByRole('combobox', { name: '资金流水' }).click()
  await page.getByRole('option', { name: /A 候选资金流水/ }).click()
  await dialogA.getByRole('button', { name: '确认匹配' }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  // External fixture control switches the public dialog context behind the pending modal.
  await page
    .getByRole('button', { name: '打开手工匹配 B' })
    .evaluate((button: HTMLButtonElement) => button.click())
  const dialogB = page.getByRole('dialog', { name: '手工匹配 · 第 2 行' })
  await expect(dialogB.getByRole('button', { name: '确认匹配' })).toBeEnabled()
  const oldResponse = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/match_fms_bank_statement_line_secure')
  )
  state.releaseWrite?.()
  await oldResponse
  await page.waitForTimeout(100)
  await expect(dialogB).toBeVisible()
  await expect(dialogB.getByRole('button', { name: '确认匹配' })).toBeEnabled()
  await expect(page.getByTestId('manual-changed')).toHaveText('0')
  await expect(page.locator('.el-message--success, .el-message--error')).toHaveCount(0)
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(state.writes[0].p_statement_line_id).toBe(lineAId)
  expect(state.unknownRest).toEqual([])
})

test('手工匹配必填校验可见且修正后正常提交', async ({ page }, info) => {
  const state = await mockManualRpc(page)
  await openFixture(page, info.project.name)
  await page.getByRole('button', { name: '打开手工匹配 A' }).click()
  const dialog = page.getByRole('dialog', { name: '手工匹配 · 第 1 行' })
  const confirm = dialog.getByRole('button', { name: '确认匹配' })
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(dialog.getByText('请选择资金流水', { exact: true })).toBeVisible()
  expect(state.writes).toEqual([])
  expect(await readActionFeedbackHistory(page)).toEqual([])
  await dialog.getByRole('combobox', { name: '资金流水' }).click()
  await page.getByRole('option', { name: /A 候选资金流水/ }).click()
  await dialog.getByRole('spinbutton', { name: '匹配金额' }).fill('')
  await confirm.click()
  await expect(dialog.locator('.el-form-item__error')).toContainText(/请输入匹配金额|匹配金额必须/)
  expect(state.writes).toEqual([])
  expect(await readActionFeedbackHistory(page)).toEqual([])
  await expectNoViewportOverflow(page)
  await page.screenshot({
    path: info.outputPath('manual-required-error.png'),
    fullPage: false,
    animations: 'disabled'
  })
  await dialog.getByRole('spinbutton', { name: '匹配金额' }).fill('12.34')
  await confirm.click()
  await expect.poll(() => state.writes.length).toBe(1)
  expect(state.writes).toEqual([
    {
      p_statement_line_id: lineAId,
      p_ledger_entry_id: candidateAId,
      p_matched_amount: 12.34,
      p_remark: null
    }
  ])
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('manual-changed')).toHaveText('1')
  expect(await readActionFeedbackHistory(page)).toEqual([
    { kind: 'success', text: '银行流水已匹配' }
  ])
  expect(state.unknownRest).toEqual([])
})

test('平台租户切换后旧匹配响应不反馈或发成功事件', async ({ page }, info) => {
  const state = await mockManualRpc(page)
  state.holdWrite = true
  await openFixture(page, info.project.name, true)
  await expect(page.getByTestId('manual-identity')).toHaveText('platform')
  await page.getByRole('button', { name: '打开手工匹配 A' }).click()
  const dialog = page.getByRole('dialog', { name: '手工匹配 · 第 1 行' })
  await expect(dialog.getByRole('button', { name: '确认匹配' })).toBeEnabled()
  await dialog.getByRole('combobox', { name: '资金流水' }).click()
  await page.getByRole('option', { name: /A 候选资金流水/ }).click()
  await dialog.getByRole('button', { name: '确认匹配' }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  // External fixture control changes the real platform tenant scope behind the pending modal.
  await page
    .getByRole('button', { name: '切换测试租户' })
    .evaluate((button: HTMLButtonElement) => button.click())
  await expect(page.getByTestId('manual-context')).toHaveText(`/:${otherTenantId}`)
  const oldResponse = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/match_fms_bank_statement_line_secure')
  )
  state.releaseWrite?.()
  await oldResponse
  await page.waitForTimeout(100)
  await expect(page.getByTestId('manual-changed')).toHaveText('0')
  await expect(page.locator('.el-message--success, .el-message--error')).toHaveCount(0)
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(state.writes[0].p_statement_line_id).toBe(lineAId)
  expect(state.unknownRest).toEqual([])
})
