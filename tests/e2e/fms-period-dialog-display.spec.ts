import { expect, test, type Locator, type Page } from '@playwright/test'
import { installDictionaryOptions } from './support/dictionary-options'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const accountA = 'cccccccc-cccc-4ccc-accc-cccccccccccc'
const accountB = 'dddddddd-dddd-4ddd-addd-dddddddddddd'
const recordId = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee'
const scenarios = [
  {
    key: 'period-close',
    entry: 'period-close-start-dialog',
    title: '执行月末关账检查',
    action: '开始检查',
    write: 'run_fms_period_close_checks_secure'
  },
  {
    key: 'payroll',
    entry: 'payroll-run-dialog',
    title: '新建薪资批次',
    action: '创建批次',
    write: 'save_fms_payroll_run_secure'
  },
  {
    key: 'tax-management',
    entry: 'tax-period-dialog',
    title: '新建税务期间',
    action: '创建台账',
    write: 'save_fms_tax_period_secure'
  }
] as const
type Scenario = (typeof scenarios)[number]

const startDate = (month: number) => `2026-${String(month).padStart(2, '0')}-01`
const endDate = (month: number) =>
  `2026-${String(month).padStart(2, '0')}-${[9, 11].includes(month) ? 30 : 31}`
const periodName = (month: number) => `2026 年第 ${month} 期`
const dateRange = (month: number) => `${startDate(month)} 至 ${endDate(month)}`
const fullLabel = (month: number) => `${periodName(month)} · ${dateRange(month)}`

async function openDialog(
  page: Page,
  scenario: Scenario,
  detail?: { rpc: string; record: Record<string, unknown> },
  appearance?: Parameters<typeof prepareAppearance>[1]
) {
  await prepareIsolatedSession(page, { platformSuper: false })
  if (appearance) await prepareAppearance(page, appearance)
  if (scenario.key === 'tax-management') {
    await installDictionaryOptions(page, { fmsTaxType: [{ value: 'vat', label: '增值税' }] })
  }
  await page.addInitScript((record) => {
    window.formsMigrationInput = { args: record ? [record] : [] }
  }, detail?.record)
  const periodScopes: Array<string | null> = []
  const writes: unknown[] = []
  const verifyPending = !detail && scenario.key !== 'tax-management'
  let releaseSave = () => {}
  const firstSave = new Promise<void>((resolve) => (releaseSave = resolve))
  await page.route('**/rest/v1/rpc/fms_accounting_readiness', (route) =>
    route.fulfill({ json: { foundationReady: true } })
  )
  await page.route('**/rest/v1/rpc/fms_list_account_set_options_secure', (route) =>
    route.fulfill({
      json: {
        total: 2,
        records: [
          {
            id: accountA,
            accountSetCode: 'QA',
            accountSetName: '期间验收甲账套',
            status: 'active'
          },
          { id: accountB, accountSetCode: 'QB', accountSetName: '期间验收乙账套', status: 'active' }
        ]
      }
    })
  )
  await page.route('**/rest/v1/fms_accounting_period?*', (route) => {
    const account = new URL(route.request().url()).searchParams.get('account_set_id')
    periodScopes.push(account)
    const fromAccountB = account === `eq.${accountB}`
    return route.fulfill({
      json: (fromAccountB ? [11, 12, 9, 8] : [10]).map((month) => ({
        id: `period-${month}`,
        account_set_id: fromAccountB ? accountB : accountA,
        fiscal_year: 2026,
        period_no: month,
        start_date: startDate(month),
        end_date: endDate(month),
        status: month === 8 ? 'closed' : month === 9 ? 'closing' : 'open'
      }))
    })
  })
  await page.route(`**/rest/v1/rpc/${scenario.write}`, async (route) => {
    writes.push(route.request().postDataJSON())
    if (verifyPending && writes.length === 1) {
      await firstSave
      return route.fulfill({
        status: 503,
        json: { code: 'XX000', message: 'database unavailable' }
      })
    }
    return route.fulfill({ json: { id: recordId } })
  })
  if (detail) {
    await page.route(`**/rest/v1/rpc/${detail.rpc}`, (route) =>
      route.fulfill({ json: detail.record })
    )
  }
  const entry = `modules/art-supabase-fms/src/views/specialized-accounting/${scenario.key}/modules/${scenario.entry}.vue`
  await page.goto(
    `/tests/e2e/fixtures/forms-migration-business.html?entry=${encodeURIComponent(entry)}&theme=${appearance?.theme ?? (detail ? 'dark' : 'light')}`,
    { waitUntil: 'domcontentloaded', timeout: 60_000 }
  )
  const dialog = page.getByRole('dialog')
  const account = dialog.getByRole('combobox', { name: /所属账套$/ })
  const period = dialog.getByRole('combobox', { name: /会计期间$/ })
  const accountField = dialog.locator('.el-form-item').filter({
    has: page.getByRole('combobox', { name: /所属账套$/ })
  })
  const field = dialog.locator('.el-form-item').filter({
    has: page.getByRole('combobox', { name: /会计期间$/ })
  })
  const selected = field.locator('.el-select__placeholder')
  return {
    dialog,
    account,
    accountField,
    period,
    field,
    selected,
    periodScopes,
    writes,
    releaseSave
  }
}

for (const scenario of scenarios.filter(({ key }) => key !== 'period-close')) {
  const isPayroll = scenario.key === 'payroll'
  test(`${isPayroll ? '薪资' : '税务'}编辑保留已关账历史期间并保护只读字段`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const { dialog, account, period, field, selected, periodScopes, writes } = await openDialog(
      page,
      scenario,
      {
        rpc: isPayroll ? 'fms_get_payroll_run_secure' : 'fms_get_tax_period_secure',
        record: {
          id: recordId,
          accountSetId: accountB,
          accountingPeriodId: 'period-8',
          status: 'draft',
          runNo: 'QA-历史批次',
          taxType: 'vat',
          salaryExpenseSubjectId: 'office-subject',
          transferableInputAmount: 310,
          adjustmentAmount: 20,
          fieldAccess: isPayroll ? { payrollReferences: 'read' } : { taxAmounts: 'read' }
        }
      }
    )
    await expectReadablePeriod(field, selected, 8)
    await expect(account).toBeDisabled()
    await expect(period).toBeDisabled()
    if (!isPayroll) {
      await expect(dialog.getByText('增值税', { exact: true })).toBeVisible()
      await expect(dialog.getByRole('spinbutton')).toHaveCount(0)
    }
    expect(periodScopes).toEqual([`eq.${accountB}`])
    await dialog.getByRole('button', { name: '保存修改', exact: true }).click()
    await expect(page.getByTestId('successes')).toHaveText('1')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({ p_payload: { id: recordId, accountingPeriodId: 'period-8' } })
    for (const key of isPayroll
      ? [
          'salaryExpenseSubjectId',
          'salaryPayableSubjectId',
          'taxPayableSubjectId',
          'socialSecurityPayableSubjectId'
        ]
      : ['transferableInputAmount', 'adjustmentAmount']) {
      expect(writes[0]).not.toHaveProperty(['p_payload', key])
    }
  })
}

async function expectReadablePeriod(field: Locator, selected: Locator, month: number) {
  await expect(selected).toHaveText(periodName(month))
  const dates = field.locator('.art-form-item__description')
  await expect(dates).toHaveText(dateRange(month))
  await expect(dates).toBeVisible()
  await expect(field.getByRole('combobox')).toHaveAccessibleDescription(dateRange(month))
  const { text, available } = await dates.evaluate((element) => ({
    text: element.scrollWidth,
    available: element.clientWidth
  }))
  expect(available).toBeGreaterThan(0)
  expect(text).toBeLessThanOrEqual(available)
}

for (const scenario of scenarios) {
  test(`${scenario.title}窄屏显示完整期间并提交正确期次`, async ({ page }, info) => {
    const verifyPending = scenario.key !== 'tax-management'
    const narrow = (page.viewportSize()?.width ?? 1440) <= 640
    const width = verifyPending && !narrow ? 1440 : 390
    const appearance: Parameters<typeof prepareAppearance>[1] = {
      theme: narrow ? 'dark' : 'light',
      boxBorderMode: !narrow
    }
    await page.setViewportSize({ width, height: narrow || !verifyPending ? 844 : 900 })
    const {
      dialog,
      account,
      accountField,
      period,
      field,
      selected,
      periodScopes,
      writes,
      releaseSave
    } = await openDialog(page, scenario, undefined, verifyPending ? appearance : undefined)
    await expect(dialog).toContainText(scenario.title)
    await expect(selected).toContainText(periodName(10), { timeout: 60_000 })
    const viewport = dialog.locator('.art-dialog__viewport')
    const content = dialog.locator('.art-dialog__content')
    const confirm = dialog.getByRole('button', { name: scenario.action, exact: true })
    if (verifyPending) {
      await assertAppearance(page, appearance)
      await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
      await expect(viewport).toHaveAttribute('aria-busy', 'false')
      await field.locator('.el-select').hover()
      await field.locator('.el-select__clear').click()
      await confirm.click()
      await expect(
        dialog.getByText(scenario.key === 'payroll' ? '请选择开放期间' : '请选择会计期间', {
          exact: true
        })
      ).toBeVisible()
      await expect(period).toBeFocused()
      await expect(period).toBeEnabled()
      await expect(viewport).toHaveAttribute('aria-busy', 'false')
      await expect(content).toHaveJSProperty('inert', false)
      await expect(dialog.locator('.art-overlay-loading')).toHaveCount(0)
      expect(writes).toEqual([])
      await field.locator('.el-select').click()
      await page.getByRole('option', { name: fullLabel(10), exact: true }).click()
      await expectReadablePeriod(field, selected, 10)
    }
    if (scenario.key === 'tax-management') {
      await expect(dialog.getByText('增值税', { exact: true })).toBeVisible()
    }
    const clippedWidths: Array<{ viewport: number; text: number; available: number }> = []
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await page.evaluate(() => document.fonts.ready)
      const { text, available } = await selected.evaluate((element) => ({
        text: element.scrollWidth,
        available: element.clientWidth
      }))
      if (text > available) clippedWidths.push({ viewport: width, text, available })
      await dialog.screenshot({ path: info.outputPath(`period-${width}.png`) })
    }
    expect(clippedWidths, '当前选中的会计期间文字不能被省略').toEqual([])
    await expectReadablePeriod(field, selected, 10)

    await page.setViewportSize({ width, height: narrow || !verifyPending ? 844 : 900 })
    await expectReadablePeriod(field, selected, 10)
    await accountField.locator('.el-select').click()
    await page.getByRole('option', { name: '期间验收乙账套（QB）', exact: true }).click()
    await expectReadablePeriod(field, selected, 11)

    await field.locator('.el-select').click()
    await expect(page.getByRole('option', { name: fullLabel(8), exact: true })).toHaveCount(0)
    const closing = page.getByRole('option', { name: fullLabel(9), exact: true })
    const isPeriodClose = scenario.key === 'period-close'
    const nextPeriod = isPeriodClose ? 9 : 12
    if (isPeriodClose) await expect(closing).toBeVisible()
    else await expect(closing).toHaveCount(0)
    await page.getByRole('option', { name: fullLabel(nextPeriod), exact: true }).click()
    await expectReadablePeriod(field, selected, nextPeriod)
    expect(periodScopes).toEqual([`eq.${accountA}`, `eq.${accountB}`])
    const remark = dialog.locator('[data-art-form-item-key="remark"] textarea')
    if (verifyPending && !isPeriodClose) await remark.fill('首次薪资批次说明')
    const readSubmitLayout = () =>
      dialog.evaluate((element) => {
        const viewport = element.querySelector('.art-dialog__viewport')!
        const footer = element.querySelector('.el-dialog__footer')!
        const bounds = (node: Element) => {
          const { x, y, width, height } = node.getBoundingClientRect()
          return { x, y, width, height }
        }
        return {
          dialog: bounds(element),
          viewport: bounds(viewport),
          footer: bounds(footer),
          viewportMinHeight: getComputedStyle(viewport).minHeight
        }
      })
    const beforeSubmitLayout = verifyPending ? await readSubmitLayout() : undefined
    await confirm.click()
    await expect.poll(() => writes.length).toBe(1)
    if (verifyPending) {
      const expectedPayload = isPeriodClose
        ? { p_accounting_period_id: `period-${nextPeriod}` }
        : {
            p_payload: {
              accountingPeriodId: `period-${nextPeriod}`,
              salaryExpenseSubjectId: null,
              salaryPayableSubjectId: null,
              taxPayableSubjectId: null,
              socialSecurityPayableSubjectId: null,
              remark: '首次薪资批次说明'
            }
          }
      const accountInput = dialog.locator(
        '[data-art-form-item-key="accountSetId"] input[role="combobox"]'
      )
      const periodInput = dialog.locator(
        `[data-art-form-item-key="${isPeriodClose ? 'periodId' : 'accountingPeriodId'}"] input[role="combobox"]`
      )
      const selectedPeriod = dialog.locator(
        `[data-art-form-item-key="${isPeriodClose ? 'periodId' : 'accountingPeriodId'}"] .el-select__placeholder`
      )
      try {
        expect(writes[0]).toEqual(expectedPayload)
        const originalInputs = {
          account: await accountInput.inputValue(),
          period: await periodInput.inputValue()
        }
        await info.attach('pending-submit-state', {
          body: JSON.stringify(
            await viewport.evaluate((element) => ({
              busy: element.getAttribute('aria-busy'),
              inert: element.querySelector('.art-dialog__content')?.hasAttribute('inert'),
              loaders: element.querySelectorAll('.art-overlay-loading').length
            })),
            null,
            2
          ),
          contentType: 'application/json'
        })
        await dialog.screenshot({
          path: info.outputPath('period-pending-submit.png'),
          animations: 'disabled'
        })
        await expect(viewport).toHaveAttribute('aria-busy', 'true')
        if (!beforeSubmitLayout) throw new Error('缺少提交前的弹窗布局测量')
        const pendingSubmitLayout = await readSubmitLayout()
        const regions = ['dialog', 'viewport', 'footer'] as const
        const dimensions = ['x', 'y', 'width', 'height'] as const
        const layoutDeltas = Object.fromEntries(
          regions.map((region) => [
            region,
            Object.fromEntries(
              dimensions.map((dimension) => [
                dimension,
                pendingSubmitLayout[region][dimension] - beforeSubmitLayout[region][dimension]
              ])
            )
          ])
        )
        await info.attach('pending-submit-layout', {
          body: JSON.stringify(
            { before: beforeSubmitLayout, pending: pendingSubmitLayout, deltas: layoutDeltas },
            null,
            2
          ),
          contentType: 'application/json'
        })
        for (const region of regions) {
          for (const dimension of dimensions) {
            expect
              .soft(
                Math.abs(
                  pendingSubmitLayout[region][dimension] - beforeSubmitLayout[region][dimension]
                ),
                `提交期间 ${region}.${dimension} 不应跳动`
              )
              .toBeLessThanOrEqual(1)
          }
        }
        await expect(content).toHaveJSProperty('inert', true)
        await expect(content).toHaveAttribute('aria-hidden', 'true')
        await expect(viewport.locator(':scope > .art-overlay-loading')).toHaveCount(1)
        await expect(dialog.locator('.art-overlay-loading')).toHaveCount(1)
        await expect(
          dialog.getByText(isPeriodClose ? '正在执行关账检查…' : '正在保存薪资批次…', {
            exact: true
          })
        ).toBeVisible()
        await expect(confirm).toBeDisabled()
        await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeDisabled()
        for (const input of [accountInput, periodInput, ...(!isPeriodClose ? [remark] : [])]) {
          expect(
            await input.evaluate((element: HTMLElement) => {
              element.focus()
              return document.activeElement === element
            })
          ).toBe(false)
          await page.keyboard.type('提交期间不能改写')
          await page.keyboard.press('ArrowDown')
          await page.keyboard.press('Enter')
        }
        await expect(accountInput).toHaveValue(originalInputs.account)
        await expect(periodInput).toHaveValue(originalInputs.period)
        await expect(selectedPeriod).toHaveText(periodName(nextPeriod))
        if (!isPeriodClose) await expect(remark).toHaveValue('首次薪资批次说明')
        await expect(page.getByRole('option')).toHaveCount(0)
        await confirm.dispatchEvent('click')
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        )
        expect(writes).toEqual([expectedPayload])
        await expect(page.getByTestId('successes')).toHaveText('0')
      } finally {
        releaseSave()
      }
      await expect(confirm).toBeEnabled()
      await expect(dialog).toBeVisible()
      await expect(viewport).toHaveAttribute('aria-busy', 'false')
      await expect(content).toHaveJSProperty('inert', false)
      await expect(dialog.locator('.art-overlay-loading')).toHaveCount(0)
      await expect(
        page
          .locator('.el-message--error, .el-message--warning')
          .filter({ hasText: /稍后重试|暂时不可用|保存失败|检查失败/ })
      ).toBeVisible()
      await expect(page.getByTestId('successes')).toHaveText('0')
      await expect(account).toBeEnabled()
      await expect(period).toBeEnabled()
      await expect(accountField.locator('.el-select__placeholder')).toHaveText(
        '期间验收乙账套（QB）'
      )
      await expectReadablePeriod(field, selected, nextPeriod)
      if (!isPeriodClose) {
        await expect(remark).toBeEditable()
        await expect(remark).toHaveValue('首次薪资批次说明')
        await remark.fill('重试薪资批次说明')
      }
      await field.locator('.el-select').click()
      await page.getByRole('option', { name: fullLabel(11), exact: true }).click()
      await expectReadablePeriod(field, selected, 11)
      await dialog.screenshot({
        path: info.outputPath('period-retry-editable.png'),
        animations: 'disabled'
      })
      await confirm.click()
      await expect.poll(() => writes.length).toBe(2)
      expect(writes[1]).toEqual(
        isPeriodClose
          ? { p_accounting_period_id: 'period-11' }
          : {
              p_payload: {
                accountingPeriodId: 'period-11',
                salaryExpenseSubjectId: null,
                salaryPayableSubjectId: null,
                taxPayableSubjectId: null,
                socialSecurityPayableSubjectId: null,
                remark: '重试薪资批次说明'
              }
            }
      )
      await expect(page.getByTestId('successes')).toHaveText('1')
      await expect(dialog).toBeHidden()
      expect(writes).toHaveLength(2)
      expect(periodScopes).toEqual([`eq.${accountA}`, `eq.${accountB}`])
      return
    }
    await expect(page.getByTestId('successes')).toHaveText('1')
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject(
      isPeriodClose
        ? { p_accounting_period_id: `period-${nextPeriod}` }
        : { p_payload: { accountingPeriodId: `period-${nextPeriod}` } }
    )
  })
}
