import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

const runtimeErrors = new WeakMap<Page, string[]>()
test.beforeEach(async ({ page }) => {
  const errors: string[] = []
  runtimeErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
})
test.afterEach(async ({ page }) => expect(runtimeErrors.get(page) ?? []).toEqual([]))

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test('银行流水真实文件导入后复用公共金额格式', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/functions/v1/ai-bank-statement-batch-match', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.action).toBe('analyze')
    expect(body.rows).toHaveLength(3)
    await route.fulfill({
      json: {
        artifactId: 'test-artifact',
        runId: 'test-run',
        generatedAt: '2026-10-09T08:00:00Z',
        mapping: {},
        usedAi: false,
        confidence: 0.9,
        reviewConfidenceThreshold: 0.8,
        summary: { ready: 1, review: 0, duplicate: 0, invalid: 2 },
        rows: [1234.5, 0, -1234.5].map((amount, index) => ({
          rowId: `row-${index}`,
          sourceRow: index + 2,
          status: index === 0 ? 'ready' : 'invalid',
          direction: 'receipt',
          transactionDate: '2026-10-09',
          amount,
          bankReference: `BANK-${index}`,
          counterpartyName: '测试单位',
          counterpartyId: 'test-customer',
          counterpartyScore: 90,
          paymentMethod: 'bank_transfer',
          remark: null,
          statementMatches: [],
          allocations: [],
          issues: index === 0 ? [] : ['金额需核对']
        }))
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/bank-batch-money.html')
  await page.getByRole('button', { name: '打开流水导入', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'test-bank.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      '交易日期,金额,往来单位\n2026-10-09,1234.5,测试单位\n2026-10-09,0,测试单位\n2026-10-09,-1234.5,测试单位',
      'utf8'
    )
  })
  const amounts = dialog.locator('.el-table__body-wrapper')
  for (const value of ['¥1,234.50', '¥0.00', '¥-1,234.50']) {
    await expect(amounts.getByText(value, { exact: true })).toBeVisible()
  }
  await amounts.getByText('¥1,234.50', { exact: true }).scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('bank.png'), fullPage: true })
})

async function waitForBankAction(
  page: Page,
  action: 'analyze' | 'commit',
  key: string
): Promise<void> {
  const response = await page.waitForResponse((response) => {
    if (
      !response.url().endsWith('/ai-bank-statement-batch-match') ||
      response.request().method() !== 'POST'
    )
      return false
    const payload = response.request().postDataJSON() as {
      action?: string
      fileName?: string
      artifactId?: string
    }
    return (
      payload.action === action &&
      (action === 'analyze' ? payload.fileName : payload.artifactId) === key
    )
  })
  await response.finished()
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
}

const csv = (reference: string) => ({
  name: `${reference}.csv`,
  mimeType: 'text/csv',
  buffer: Buffer.from(
    `交易日期,金额,往来单位,银行流水号\n2026-10-09,1234.5,测试单位,${reference}`,
    'utf8'
  )
})

const analysis = (reference: string) => ({
  artifactId: `artifact-${reference}`,
  runId: `run-${reference}`,
  generatedAt: '2026-10-09T08:00:00Z',
  mapping: {},
  usedAi: false,
  confidence: 0.9,
  reviewConfidenceThreshold: 0.8,
  summary: { ready: 1, review: 0, duplicate: 0, invalid: 0 },
  rows: [
    {
      rowId: `row-${reference}`,
      sourceRow: 2,
      status: 'ready',
      direction: 'receipt',
      transactionDate: '2026-10-09',
      amount: 1234.5,
      bankReference: reference,
      counterpartyName: '测试单位',
      counterpartyId: 'test-customer',
      counterpartyScore: 90,
      paymentMethod: 'bank_transfer',
      remark: null,
      statementMatches: [],
      allocations: [],
      issues: []
    }
  ]
})

test('关闭重开后 A 的迟到分析不能覆盖 B，停用后也不回填', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const { promise: heldA, resolve: releaseA } = Promise.withResolvers<void>()
  const { promise: startedA, resolve: seenA } = Promise.withResolvers<void>()
  await page.route('**/functions/v1/ai-bank-statement-batch-match', async (route) => {
    const body = route.request().postDataJSON()
    if (body.action !== 'analyze') throw new Error(`意外操作 ${body.action}`)
    const reference = String(body.fileName).replace('.csv', '')
    if (reference === 'A') {
      seenA()
      await heldA
    }
    await route.fulfill({ json: analysis(reference) })
  })
  await page.goto('/tests/e2e/fixtures/bank-batch-money.html')
  await installActionFeedbackHistory(page)
  await page.getByRole('button', { name: '打开流水导入' }).click()
  let dialog = page.getByRole('dialog', { name: 'AI 银行流水批量导入' })
  await dialog.locator('input[type="file"]').setInputFiles(csv('A'))
  await startedA
  await page.screenshot({ path: info.outputPath('analysis-loading.png'), fullPage: true })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '打开流水导入' }).click()
  dialog = page.getByRole('dialog', { name: 'AI 银行流水批量导入' })
  await dialog.locator('input[type="file"]').setInputFiles(csv('B'))
  await expect(dialog.getByText('B', { exact: true })).toBeVisible()
  const oldAnalysisDone = waitForBankAction(page, 'analyze', 'A.csv')
  releaseA()
  await oldAnalysisDone
  expect(await readActionFeedbackHistory(page)).toEqual([
    { kind: 'success', text: '已完成 1 条流水匹配' }
  ])
  await expect(dialog.getByText('B', { exact: true })).toBeVisible()
  await expect(dialog.getByText('A', { exact: true })).toHaveCount(0)
  await page.evaluate(() => window.__bankBatchTest.setActive(false))
  await page.evaluate(() => window.__bankBatchTest.setActive(true))
  await page.getByRole('button', { name: '打开流水导入' }).click()
  await expect(
    page.getByRole('dialog', { name: 'AI 银行流水批量导入' }).getByText('B', { exact: true })
  ).toHaveCount(0)
})

test('外部业务控制器在确认等待和 POST 在途时重开，旧操作不影响新窗口', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const { promise: heldPost, resolve: releasePost } = Promise.withResolvers<void>()
  const { promise: startedPost, resolve: seenPost } = Promise.withResolvers<void>()
  const commits: Array<{ artifactId: string }> = []
  await page.route('**/functions/v1/ai-bank-statement-batch-match', async (route) => {
    const body = route.request().postDataJSON()
    if (body.action === 'analyze') {
      await route.fulfill({ json: analysis(String(body.fileName).replace('.csv', '')) })
      return
    }
    commits.push({ artifactId: String(body.artifactId) })
    seenPost()
    await heldPost
    await route.fulfill({ json: { committedCount: 1 } })
  })
  await page.goto('/tests/e2e/fixtures/bank-batch-money.html')
  await installActionFeedbackHistory(page)
  await page.getByRole('button', { name: '打开流水导入' }).click()
  let dialog = page.getByRole('dialog', { name: 'AI 银行流水批量导入' })
  await dialog.locator('input[type="file"]').setInputFiles(csv('A'))
  await expect(dialog.getByText('A', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: /确认入账/ }).click()
  const confirm = page.getByRole('dialog', { name: '确认批量入账' })
  await page.evaluate(() => window.__bankBatchTest.reopen())
  dialog = page.getByRole('dialog', { name: 'AI 银行流水批量导入' })
  await dialog.locator('input[type="file"]').setInputFiles(csv('B'))
  await confirm.getByRole('button', { name: '确认入账', exact: true }).click()
  expect(commits).toEqual([])
  await dialog.getByRole('button', { name: /确认入账/ }).click()
  await page
    .getByRole('dialog', { name: '确认批量入账' })
    .getByRole('button', { name: '确认入账', exact: true })
    .click()
  await startedPost
  await page.evaluate(() => window.__bankBatchTest.reopen())
  dialog = page.getByRole('dialog', { name: 'AI 银行流水批量导入' })
  await dialog.locator('input[type="file"]').setInputFiles(csv('C'))
  const oldCommitDone = waitForBankAction(page, 'commit', 'artifact-B')
  releasePost()
  await oldCommitDone
  expect(
    (await readActionFeedbackHistory(page)).filter((event) => event.text.includes('入账'))
  ).toEqual([])
  await expect(dialog.getByText('C', { exact: true })).toBeVisible()
  expect(commits).toEqual([{ artifactId: 'artifact-B' }])
  expect(await page.evaluate(() => window.__bankBatchTest.successCount())).toBe(0)
})

test('撤 Import 权限清除已完成的分析结果', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/functions/v1/ai-bank-statement-batch-match', (route) =>
    route.fulfill({ json: analysis('A') })
  )
  await page.goto('/tests/e2e/fixtures/bank-batch-money.html')
  await page.evaluate(() => {
    window.__bankBatchTest.setPlatformSuper(false)
    window.__bankBatchTest.grantImport(true)
  })
  await page.getByRole('button', { name: '打开流水导入' }).click()
  const dialog = page.getByRole('dialog', { name: 'AI 银行流水批量导入' })
  await dialog.locator('input[type="file"]').setInputFiles(csv('A'))
  await expect(dialog.locator('.bank-batch__source')).toContainText('A.csv')
  await expect(dialog.getByRole('button', { name: /确认入账/ })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('ordinary-read-only.png'), fullPage: true })
  await page.evaluate(() => window.__bankBatchTest.grantImport(false))
  await expect(dialog.locator('.bank-batch__source')).toHaveCount(0)
  await expect(dialog).toContainText('当前账号暂无银行流水导入权限')
  await expect(dialog.getByRole('button', { name: '选择流水文件' })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('import-permission-revoked.png'), fullPage: true })
})

test('成功事件同步重开窗口时旧提交不能再关闭新窗口', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  const commits: string[] = []
  await page.route('**/functions/v1/ai-bank-statement-batch-match', async (route) => {
    const body = route.request().postDataJSON()
    if (body.action === 'analyze') {
      await route.fulfill({ json: analysis('A') })
      return
    }
    commits.push(String(body.artifactId))
    await route.fulfill({ json: { committedCount: 1 } })
  })
  await page.goto('/tests/e2e/fixtures/bank-batch-money.html')
  await page.evaluate(() => {
    window.__bankBatchTest.reopenOnSuccess = true
  })
  await page.getByRole('button', { name: '打开流水导入' }).click()
  const dialog = page.getByRole('dialog', { name: 'AI 银行流水批量导入' })
  await dialog.locator('input[type="file"]').setInputFiles(csv('A'))
  await expect(dialog.getByText('A', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: /确认入账/ }).click()
  await page
    .getByRole('dialog', { name: '确认批量入账' })
    .getByRole('button', { name: '确认入账', exact: true })
    .click()
  await expect.poll(() => page.evaluate(() => window.__bankBatchTest.successCount())).toBe(1)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('A', { exact: true })).toHaveCount(0)
  expect(commits).toEqual(['artifact-A'])
})

test('当前分析失败保留可读反馈，重新选择文件后可恢复', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  let requests = 0
  await page.route('**/functions/v1/ai-bank-statement-batch-match', (route) => {
    requests++
    return requests === 1
      ? route.fulfill({
          status: 403,
          json: { code: '42501', message: 'permission denied for relation' }
        })
      : route.fulfill({ json: analysis('retry') })
  })
  await page.goto('/tests/e2e/fixtures/bank-batch-money.html')
  await page.getByRole('button', { name: '打开流水导入' }).click()
  const dialog = page.getByRole('dialog', { name: 'AI 银行流水批量导入' })
  await dialog.locator('input[type="file"]').setInputFiles(csv('failed'))
  await expect(dialog.getByRole('button', { name: '重新选择文件' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '重新选择文件' })).toBeInViewport()
  await expect(dialog).not.toContainText('permission denied')
  await page.screenshot({ path: info.outputPath('analysis-error-retry.png'), fullPage: true })
  await dialog.locator('input[type="file"]').setInputFiles(csv('retry'))
  await expect(dialog.getByText('retry', { exact: true })).toBeVisible()
  expect(requests).toBe(2)
})

test('平台全部租户下认证租户变化清空旧结果并允许重新分析', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/functions/v1/ai-bank-statement-batch-match', (route) =>
    route.fulfill({
      json: analysis(String(route.request().postDataJSON().fileName).replace('.csv', ''))
    })
  )
  await page.goto('/tests/e2e/fixtures/bank-batch-money.html')
  await page.getByRole('button', { name: '打开流水导入' }).click()
  const dialog = page.getByRole('dialog', { name: 'AI 银行流水批量导入' })
  expect(await page.evaluate(() => window.__bankBatchTest.effectiveTenant())).toBeNull()
  await dialog.locator('input[type="file"]').setInputFiles(csv('actor-a'))
  await expect(dialog.locator('.bank-batch__source')).toContainText('actor-a.csv')
  await page.evaluate(() => window.__bankBatchTest.setActorTenant('actor-tenant-b'))
  expect(await page.evaluate(() => window.__bankBatchTest.effectiveTenant())).toBeNull()
  await expect(dialog.locator('.bank-batch__source')).toHaveCount(0)
  await dialog.locator('input[type="file"]').setInputFiles(csv('actor-b'))
  await expect(dialog.locator('.bank-batch__source')).toContainText('actor-b.csv')
})

test('新文件解析失败后不能沿用旧结果入账，重试文件仍可分析', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  let analyses = 0
  const commits: unknown[] = []
  await page.route('**/functions/v1/ai-bank-statement-batch-match', (route) => {
    const body = route.request().postDataJSON()
    if (body.action === 'commit') {
      commits.push(body)
      return route.fulfill({ json: { committedCount: 1 } })
    }
    analyses++
    return route.fulfill({ json: analysis(String(body.fileName).replace('.csv', '')) })
  })
  await page.goto('/tests/e2e/fixtures/bank-batch-money.html')
  await page.getByRole('button', { name: '打开流水导入' }).click()
  const dialog = page.getByRole('dialog', { name: 'AI 银行流水批量导入' })
  await dialog.locator('input[type="file"]').setInputFiles(csv('original'))
  await expect(dialog.locator('.bank-batch__source')).toContainText('original.csv')
  await expect(dialog.getByRole('button', { name: /确认入账/ })).toBeEnabled()
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'broken.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])
  })
  await expect(dialog.getByRole('button', { name: '重新选择文件' })).toBeInViewport()
  await expect(dialog.locator('.bank-batch__source')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /确认入账/ })).toBeDisabled()
  expect(analyses).toBe(1)
  expect(commits).toEqual([])
  await page.screenshot({
    path: info.outputPath('parse-error-discarded-old-result.png'),
    fullPage: true
  })
  await dialog.locator('input[type="file"]').setInputFiles(csv('new-file'))
  await expect(dialog.locator('.bank-batch__source')).toContainText('new-file.csv')
  expect(analyses).toBe(2)
})

test(
  '新文件读取期间不能确认旧批次，读完后只提交新文件',
  { tag: '@bank-read-gate' },
  async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.addInitScript(() => {
      type ReadGate = { entered: boolean; release: () => void }
      const browserWindow = window as Window & { __bankReadGate?: ReadGate }
      const { promise, resolve } = Promise.withResolvers<void>()
      browserWindow.__bankReadGate = { entered: false, release: resolve }
      const read = File.prototype.arrayBuffer
      File.prototype.arrayBuffer = async function () {
        if (this.name === 'replacement.xlsx') {
          browserWindow.__bankReadGate!.entered = true
          await promise
        }
        return read.call(this)
      }
    })
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    const commits: string[] = []
    await page.route('**/functions/v1/ai-bank-statement-batch-match', (route) => {
      const body = route.request().postDataJSON()
      if (body.action === 'analyze')
        return route.fulfill({ json: analysis(String(body.fileName).replace(/\.(csv|xlsx)$/, '')) })
      commits.push(String(body.artifactId))
      return route.fulfill({ json: { committedCount: 1 } })
    })
    await page.goto('/tests/e2e/fixtures/bank-batch-money.html')
    try {
      await page.getByRole('button', { name: '打开流水导入' }).click()
      const dialog = page.getByRole('dialog', { name: 'AI 银行流水批量导入' })
      await dialog.locator('input[type="file"]').setInputFiles(csv('original'))
      await expect(dialog.locator('.bank-batch__source')).toContainText('original.csv')
      const workbook = new ExcelJS.Workbook()
      workbook.addWorksheet('流水').addRows([
        ['交易日期', '金额', '往来单位', '银行流水号'],
        ['2026-10-09', 1234.5, '测试单位', 'replacement']
      ])
      const replacement = {
        name: 'replacement.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(await workbook.xlsx.writeBuffer())
      }
      await dialog.locator('input[type="file"]').setInputFiles(replacement)
      await page.waitForFunction(
        () => (window as Window & { __bankReadGate?: { entered: boolean } }).__bankReadGate?.entered
      )
      await expect(dialog.getByRole('button', { name: /确认入账/ })).toBeDisabled()
      expect(commits).toEqual([])
      await page.screenshot({
        path: info.outputPath('replacement-read-blocks-old-commit.png'),
        fullPage: true
      })
      await page.evaluate(() =>
        (window as Window & { __bankReadGate?: { release: () => void } }).__bankReadGate?.release()
      )
      await expect(dialog.locator('.bank-batch__source')).toContainText('replacement.xlsx')
      await dialog.getByRole('button', { name: /确认入账/ }).click()
      await page
        .getByRole('dialog', { name: '确认批量入账' })
        .getByRole('button', { name: '确认入账', exact: true })
        .click()
      await expect(dialog).toBeHidden()
      expect(commits).toEqual(['artifact-replacement'])
    } finally {
      if (!page.isClosed())
        await page.evaluate(() =>
          (
            window as Window & { __bankReadGate?: { release: () => void } }
          ).__bankReadGate?.release()
        )
    }
  }
)
