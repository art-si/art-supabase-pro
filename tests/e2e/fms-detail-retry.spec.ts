import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

const fixtureUrl = '/tests/e2e/fixtures/fms-detail-retry.html'

async function openFixture(page: Page, projectName: string): Promise<void> {
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.evaluate(
    ({ dark, shadow }) => {
      if (dark) document.documentElement.classList.add('dark')
      if (shadow) document.documentElement.setAttribute('data-box-mode', 'shadow-mode')
    },
    { dark: projectName.includes('dark'), shadow: projectName.includes('shadow') }
  )
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
  const drawer = page.locator('.el-drawer')
  await expect(
    drawer.getByText('银行对账详情加载失败，请重试或返回列表重新选择。', { exact: true })
  ).toBeVisible()
  await expect(drawer.getByText('technical failure')).toHaveCount(0)
  await drawer.getByRole('button', { name: '重新加载' }).click()
  await expect(drawer.getByText('暂无银行对账详情')).toBeVisible()
  await drawer.getByRole('button', { name: '重新加载' }).click()
  await expect(drawer.getByText('暂无银行流水')).toBeVisible()
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
