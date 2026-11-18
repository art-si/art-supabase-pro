import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { expectOverlayTabPanel } from './support/overlay-tab-card'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const path = (relative: string) => 'modules/art-supabase-fms/src/views/' + relative
const scenarios = [
  {
    name: '资金调拨',
    path: path('treasury/fund-transfer/modules/fund-transfer-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '银行对账',
    path: path('treasury/bank-reconciliation/modules/bank-reconciliation-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '商业票据',
    path: path('specialized-accounting/commercial-bill/modules/commercial-bill-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '税务期间',
    path: path('specialized-accounting/tax-management/modules/tax-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '薪资批次',
    path: path('specialized-accounting/payroll/modules/payroll-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '关账检查',
    path: path('specialized-accounting/period-close/modules/period-close-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '承运商对账',
    path: path('settlement/carrier-settlement/modules/carrier-statement-detail-drawer.vue'),
    tabs: 3
  },
  {
    name: '客户对账',
    path: path('settlement/customer-settlement/modules/customer-statement-detail-drawer.vue'),
    tabs: 3
  },
  {
    name: '收付款',
    path: path('settlement/cash-transaction/modules/cash-transaction-detail-drawer.vue'),
    tabs: 3
  },
  {
    name: '会计凭证',
    path: path('accounting/voucher-center/modules/voucher-detail-drawer.vue'),
    tabs: 4
  },
  {
    name: '发票',
    path: path('settlement/invoice-management/modules/invoice-detail-drawer.vue'),
    tabs: 4
  },
  {
    name: '付款申请',
    path: path('settlement/payment-application/modules/payment-application-detail-drawer.vue'),
    tabs: 4
  },
  {
    name: '自动入账事件',
    path: path('accounting/auto-posting/modules/posting-event-detail-drawer.vue'),
    tabs: 2
  },
  {
    name: '自动入账无数据权限紧凑',
    path: path('accounting/auto-posting/modules/posting-event-detail-drawer.vue'),
    tabs: 0
  }
]
for (const [scenarioIndex, scenario] of scenarios.entries()) {
  test(`FMS ${scenario.name} 详情分组可切换且权限不泄漏`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const isPayroll = scenario.name === '薪资批次'
    const isTax = scenario.name === '税务期间'
    const hasMobileIdentity = isPayroll || isTax
    const narrow = !hasMobileIdentity && scenarioIndex % 3 === 1
    await page.setViewportSize({ width: narrow ? 570 : 1440, height: 900 })
    if (hasMobileIdentity) await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
    const errors: string[] = []
    const writes: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const fieldAccess = Object.fromEntries(
      [
        'transferAccounts',
        'transferAmounts',
        'statementAmounts',
        'billParties',
        'billAmounts',
        'billReferences',
        'taxAmounts',
        'taxSources',
        'taxReferences',
        'taxFiling',
        'employeeIdentity',
        'salaryAmounts',
        'closeDiagnostics',
        'statementLines',
        'statementAmounts',
        'voucherEvidence',
        'allocations',
        'cashAmounts',
        'cashAccounts',
        'cashReferences',
        'voucherAmounts',
        'voucherAttachments',
        'auditTrail',
        'sourceReferences',
        'taxIdentity',
        'invoiceAmounts',
        'invoiceAttachments',
        'paymentAmounts',
        'paymentReferences',
        'applicationAmounts',
        'basisEvidence',
        'eventAmounts',
        'eventPayloadDetails',
        'eventSourceReferences',
        'processingDiagnostics'
      ].map((key) => [key, 'read'])
    )
    if (scenario.tabs === 0) {
      fieldAccess.eventAmounts = 'hidden'
      fieldAccess.eventPayloadDetails = 'hidden'
      fieldAccess.eventSourceReferences = 'hidden'
    }
    const row = {
      id: '44444444-4444-4444-8444-444444444444',
      tenantId: '11111111-1111-4111-8111-111111111111',
      accountSetId: '55555555-5555-4555-8555-555555555555',
      accountSet: { accountSetName: '验收账套' },
      transferNo: 'TRANSFER-001',
      batchNo: 'BANK-001',
      billNo: 'BILL-001',
      runNo: 'RUN-001',
      periodNo: 'PERIOD-001',
      statementNo: 'STMT-001',
      voucherNo: 'VOUCHER-001',
      invoiceNo: 'INV-001',
      applicationNo: 'PAY-001',
      transactionNo: 'CASH-001',
      eventNo: 'EVENT-001',
      eventDate: '2026-11-01',
      sourceType: 'waybill_cost',
      sourceEvent: 'confirmed',
      sourceNo: 'SOURCE-001',
      payload: { amount: 100, sourceNo: 'SOURCE-001', costType: 'freight' },
      summary: '验收业务摘要',
      title: '验收业务详情',
      amount: 100,
      faceAmount: 100,
      totalAmount: 100,
      paidAmount: 0,
      receivedAmount: 0,
      unpaidAmount: 100,
      unreceivedAmount: 100,
      taxAmount: 6,
      netAmount: 94,
      direction: scenario.name === '收付款' ? 'payment' : 'receivable',
      billType: 'bank_acceptance',
      currencyCode: 'CNY',
      currencyName: '人民币',
      transferDate: '2026-11-01',
      transactionDate: '2026-11-01',
      issueDate: '2026-11-01',
      dueDate: '2027-01-01',
      statementStartDate: '2026-11-01',
      statementEndDate: '2026-11-30',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      payrollMonth: '2026-11-01',
      sourceAccountName: '验收来源账户',
      targetAccountName: '验收目标账户',
      accountName: '验收银行账户',
      carrierName: '验收承运商',
      customerName: '验收客户',
      counterpartyName: '验收往来主体',
      status: 'draft',
      createTime: '2026-11-01T08:00:00Z',
      updateTime: '2026-11-01T08:00:00Z',
      version: 1,
      passedCount: 1,
      warningCount: 0,
      blockingCount: 0,
      lineCount: 0,
      matchedCount: 0,
      partialCount: 0,
      ignoredCount: 0,
      unmatchedCount: 0,
      lines: [],
      entries: [],
      attachments: [],
      actions: [],
      events: [],
      allocations: [],
      statementLinks: [],
      workflowInstances: [],
      cashFlowAllocations: [],
      fieldAccess
    }
    const payrollLine = {
      id: '66666666-6666-4666-8666-666666666666',
      runId: row.id,
      employeeId: '77777777-7777-4777-8777-777777777777',
      employeeNameSnapshot: '阿依古丽·阿卜杜热合曼·买买提',
      employeeNoSnapshot: 'EMP-EAST-OPS-2026-VERIFICATION',
      grossAmount: 12345.67,
      deductionAmount: 234.56,
      employerCostAmount: 789.12,
      netAmount: 12111.11,
      createTime: row.createTime
    } satisfies Api.Fms.PayrollLineRecord
    const taxLine = {
      id: '88888888-8888-4888-8888-888888888888',
      taxPeriodId: row.id,
      sourceType: 'manual',
      sourceNo: 'TAX-CROSS-REGION-ENGINEERING-SERVICE-CENTER-RECONCILIATION-REFERENCE-FULL-END',
      occurredOn: '2026-11-01',
      direction: 'output',
      taxableAmount: 23456.78,
      taxRate: 0.06,
      taxAmount: 1407.41,
      isDeductible: false,
      createTime: row.createTime
    } satisfies Api.Fms.TaxLedgerLineRecord
    const primaryIdentity = isPayroll ? payrollLine.employeeNameSnapshot : taxLine.sourceNo
    const secondaryIdentity = isPayroll ? payrollLine.employeeNoSnapshot : '2026-11-01 · 手工录入'
    const detailClass = isPayroll ? 'payroll-detail' : 'tax-detail'
    const mobileIdentityClass = isPayroll
      ? 'payroll-detail__employee'
      : 'tax-detail__mobile-identity'
    const detailTab = isPayroll ? '员工薪资' : '税务台账'
    const overviewTab = isPayroll ? '批次信息' : '期间与申报'
    const lineRpc = isPayroll ? 'fms_list_payroll_lines_secure' : 'fms_list_tax_ledger_lines_secure'
    const writePermission = isPayroll
      ? 'FinancePayroll:Calculate'
      : 'FinanceTaxManagement:Calculate'
    const mutationLabels = isPayroll
      ? /同步 HR 薪酬|新增员工|编辑员工薪资|删除员工薪资/
      : /新增明细|编辑税务明细|删除税务明细/
    let sensitiveHidden = false
    const effectiveAccess = () =>
      hasMobileIdentity && sensitiveHidden
        ? {
            ...fieldAccess,
            employeeIdentity: 'hidden',
            salaryAmounts: 'hidden',
            taxSources: 'hidden',
            taxAmounts: 'hidden'
          }
        : fieldAccess
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url()),
        rpc = url.pathname.split('/rpc/')[1]
      if (
        route.request().method() !== 'GET' &&
        (!rpc || (/(^|_)(fms|tms)_/.test(rpc) && !/^(fms|tms)_(get|list)_/.test(rpc)))
      )
        writes.push(route.request().url())
      if (rpc?.match(/^(fms|tms)_get_/))
        return route.fulfill({ json: { ...row, fieldAccess: effectiveAccess() } })
      if (hasMobileIdentity && rpc === lineRpc)
        return route.fulfill({
          json: {
            records: [{ ...(isPayroll ? payrollLine : taxLine), fieldAccess: effectiveAccess() }],
            fieldAccess: effectiveAccess(),
            isRecordOwner: false
          }
        })
      if (
        rpc === 'fms_list_bank_statement_lines_secure' ||
        rpc === 'fms_list_payroll_lines_secure' ||
        rpc?.includes('tax_ledger')
      )
        return route.fulfill({ json: { records: [], fieldAccess } })
      if (rpc === 'current_is_super') return route.fulfill({ json: true })
      if (route.request().method() !== 'GET' && !rpc)
        return route.fulfill({ status: 400, json: { message: '详情不应写入业务数据' } })
      return route.fulfill({ json: [] })
    })
    await page.addInitScript(
      (input) => {
        window.formsMigrationInput = input
      },
      { args: [row], permissions: hasMobileIdentity ? [writePermission] : [] }
    )
    await page.goto(
      '/tests/e2e/fixtures/forms-migration-business.html?entry=' +
        encodeURIComponent(scenario.path) +
        '&theme=' +
        (narrow ? 'dark' : 'light')
    )
    const drawer = page.locator('.el-drawer:visible')
    await expect(drawer).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('open-error')).toBeEmpty()
    const tabs = drawer.getByRole('tab')
    await expect(tabs).toHaveCount(scenario.tabs, { timeout: 30_000 })
    const panes = drawer.locator('.el-tab-pane')
    await expect(panes).toHaveCount(scenario.tabs)
    for (let index = 0; index < scenario.tabs; index++) {
      const tab = tabs.nth(index)
      await tab.click()
      const panel = await expectOverlayTabPanel(drawer, (await tab.innerText()).trim())
      expect((await panel.innerText()).trim().length).toBeGreaterThan(0)
      expect(await drawer.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    }
    await page.screenshot({
      path: testInfo.outputPath('detail-last-tab.png'),
      animations: 'disabled'
    })
    if (scenario.tabs) {
      await tabs.first().click()
      await expect(panes.first()).toBeVisible()
    }
    if (scenario.tabs === 0) {
      await expect(drawer.locator('.art-overlay-tab-card')).toHaveCount(0)
      await expect(drawer.getByText('SOURCE-001', { exact: true })).toHaveCount(0)
    }
    if (hasMobileIdentity) {
      for (const appearance of [
        { width: 1440, theme: 'light', boxBorderMode: true },
        { width: 390, theme: 'dark', boxBorderMode: false },
        { width: 320, theme: 'light', boxBorderMode: true }
      ] as const) {
        if (appearance.width !== 1440) {
          await prepareAppearance(page, appearance)
          await page.setViewportSize({ width: appearance.width, height: 844 })
          await page.goto(
            '/tests/e2e/fixtures/forms-migration-business.html?entry=' +
              encodeURIComponent(scenario.path) +
              '&theme=' +
              appearance.theme
          )
        }
        await assertAppearance(page, appearance)
        await expect(drawer).toBeVisible()
        await expect(drawer.locator('.art-drawer__viewport')).toHaveAttribute('aria-busy', 'false')
        await drawer.getByRole('tab', { name: detailTab, exact: true }).click()
        const panel = await expectOverlayTabPanel(drawer, detailTab)
        await expect(panel.getByRole('button', { name: mutationLabels })).toHaveCount(0)
        const amounts = isPayroll
          ? ['¥12,345.67', '¥234.56', '¥789.12', '¥12,111.11']
          : ['¥23,456.78', '6.0000%', '¥1,407.41']
        if (appearance.width === 1440) {
          const identity = panel.locator(
            isPayroll ? '.business-table-identity-cell' : '.tax-detail__source'
          )
          await expect(identity.locator('strong')).toHaveText(primaryIdentity)
          await expect(identity.locator('strong')).toHaveAttribute('title', primaryIdentity)
          if (isPayroll)
            await expect(identity.locator('small')).toHaveAttribute('title', secondaryIdentity)
          else await expect(identity.locator('small')).toHaveText('手工录入')
          for (const amount of amounts)
            await expect(panel.getByText(amount, { exact: true })).toBeVisible()
          await page.screenshot({
            path: testInfo.outputPath(`${detailClass}-identity-1440-light.png`),
            animations: 'disabled'
          })
        } else {
          const card = panel.locator(`.${detailClass}__mobile-item`)
          const identity = card.locator(`.${mobileIdentityClass}`)
          await expect(identity.locator('strong')).toHaveText(primaryIdentity)
          await expect(identity.locator('small')).toHaveText(secondaryIdentity)
          for (const amount of amounts)
            await expect(card.getByText(amount, { exact: true })).toBeVisible()
          await card.scrollIntoViewIfNeeded()
          await page.evaluate(() => document.fonts.ready.then(() => undefined))
          const geometry = await identity.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const card = element.closest('article')!.getBoundingClientRect()
            const scrollport = element
              .closest('.art-drawer__scrollbar')!
              .querySelector('.el-scrollbar__wrap')!
              .getBoundingClientRect()
            const fits = (line: DOMRect, container: DOMRect) =>
              line.left >= container.left - 1 &&
              line.right <= container.right + 1 &&
              line.top >= container.top - 1 &&
              line.bottom <= container.bottom + 1
            return {
              fields: Array.from(element.children).map((field) => {
                const range = document.createRange()
                range.selectNodeContents(field)
                const lines = Array.from(range.getClientRects())
                return {
                  text: field.textContent,
                  lineCount: lines.length,
                  field: field.getBoundingClientRect().toJSON(),
                  lines: lines.map((line) => line.toJSON()),
                  fitsField: lines.every((line) => fits(line, field.getBoundingClientRect())),
                  fitsIdentity: lines.every((line) => fits(line, bounds)),
                  fitsCard: lines.every((line) => fits(line, card)),
                  fitsScrollport: lines.every((line) => fits(line, scrollport)),
                  fitsViewport: lines.every(
                    (line) =>
                      line.left >= -1 &&
                      line.right <= innerWidth + 1 &&
                      line.top >= -1 &&
                      line.bottom <= innerHeight + 1
                  )
                }
              }),
              identity: bounds.toJSON(),
              card: card.toJSON(),
              scrollport: scrollport.toJSON(),
              cardContainsIdentity: bounds.bottom <= card.bottom + 1,
              horizontalOverflow: document.documentElement.scrollWidth - innerWidth
            }
          })
          await testInfo.attach(`${detailClass}-identity-${appearance.width}-${appearance.theme}`, {
            body: JSON.stringify(geometry, null, 2),
            contentType: 'application/json'
          })
          await page.screenshot({
            path: testInfo.outputPath(
              `${detailClass}-identity-${appearance.width}-${appearance.theme}.png`
            ),
            animations: 'disabled'
          })
          for (const field of geometry.fields) {
            expect.soft(field.lineCount).toBeGreaterThan(0)
            expect.soft(field.fitsField, `${appearance.width}px ${field.text} field`).toBe(true)
            expect.soft(field.fitsIdentity, `${appearance.width}px identity`).toBe(true)
            expect.soft(field.fitsCard, `${appearance.width}px card`).toBe(true)
            expect.soft(field.fitsScrollport, `${appearance.width}px scrollport`).toBe(true)
            expect.soft(field.fitsViewport, `${appearance.width}px viewport`).toBe(true)
          }
          expect.soft(geometry.cardContainsIdentity).toBe(true)
          expect.soft(geometry.horizontalOverflow).toBeLessThanOrEqual(1)
        }
        await drawer.getByRole('tab', { name: overviewTab, exact: true }).click()
        await expectOverlayTabPanel(drawer, overviewTab)
        await drawer.getByRole('tab', { name: detailTab, exact: true }).click()
        await expect(panel.getByText(primaryIdentity, { exact: true })).toBeVisible()

        await drawer.getByRole('button', { name: '关闭抽屉', exact: true }).click()
        await expect(drawer).toBeHidden()
        sensitiveHidden = true
        const hiddenLines = page.waitForResponse(
          (response) => response.url().includes('/rpc/' + lineRpc) && response.status() === 200
        )
        await page.getByTestId('open-entry').click()
        await hiddenLines
        await expect(drawer).toBeVisible()
        await expect(drawer.locator('.art-drawer__viewport')).toHaveAttribute('aria-busy', 'false')
        await drawer.getByRole('tab', { name: detailTab, exact: true }).click()
        await expect(
          panel.getByText(isPayroll ? '暂无员工薪资明细' : '暂无税务台账明细', { exact: true })
        ).toHaveCount(0)
        if (appearance.width !== 1440)
          await expect(
            panel.locator(`.${detailClass}__mobile-item > .${detailClass}__mobile-heading strong`)
          ).toHaveText(isPayroll ? '员工薪资' : '税务明细')
        await expect(panel.getByText(primaryIdentity, { exact: true })).toHaveCount(0)
        if (isPayroll)
          await expect(panel.getByText(secondaryIdentity, { exact: true })).toHaveCount(0)
        else await expect(panel.getByText('手工录入', { exact: false })).toHaveCount(0)
        expect(
          await drawer
            .locator('[title]')
            .evaluateAll(
              (elements, values) =>
                elements.some((element) => values.includes(element.getAttribute('title') || '')),
              [primaryIdentity, secondaryIdentity]
            )
        ).toBe(false)
        for (const amount of amounts)
          await expect(drawer.getByText(amount, { exact: true })).toHaveCount(0)
        await expect(panel.locator(`.${detailClass}__mobile-amounts`)).toHaveCount(0)
        await expect(panel.getByRole('button', { name: mutationLabels })).toHaveCount(0)
        await expect(page.getByTestId('successes')).toHaveText('0')
        sensitiveHidden = false
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      )
    ).toBe(true)
    expect(errors).toEqual([])
    expect(writes).toEqual([])
  })
}
