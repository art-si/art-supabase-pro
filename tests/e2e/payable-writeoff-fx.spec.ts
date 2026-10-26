import { expect, test, type Page, type TestInfo } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)
const pageErrors = new WeakMap<Page, string[]>()
test.beforeEach(({ page }) => {
  const errors: string[] = []
  pageErrors.set(page, errors)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
})
test.afterEach(async ({ page }, info) => {
  expect(pageErrors.get(page)).toEqual([])
  if (page.url().includes('/tests/e2e/fixtures/')) {
    await expect(page.locator('html')).toHaveAttribute(
      'data-box-mode',
      info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    )
    if (info.project.use.colorScheme === 'dark')
      await expect(page.locator('html')).toHaveClass(/dark/)
    else await expect(page.locator('html')).not.toHaveClass(/dark/)
  }
})

const tenant = '11111111-1111-4111-8111-111111111111'
const relations = [
  { value: 'payable_payment', label: '应付付款核销' },
  { value: 'payable_receivable', label: '应付应收抵销' },
  { value: 'payment_refund', label: '付款冲退款' }
]

function fixtureOptions(info: TestInfo): string {
  return new URLSearchParams({
    theme: info.project.use.colorScheme === 'dark' ? 'dark' : 'light',
    box: info.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
  }).toString()
}

function sources(side: 'primary' | 'secondary') {
  return [1, 2].map((index) => ({
    id: `${side}-${index}`,
    tenantId: tenant,
    documentId: `${side}-document-${index}`,
    documentNo: `QA-FX-${side}-${index}`,
    businessDate: '2026-10-25',
    supplierId: `supplier-${index}`,
    supplierName: index === 1 ? '验收往来单位甲' : '验收往来单位乙·长名称对照',
    counterpartyKey: `party-${index}`,
    currencyCode: side === 'primary' && index === 1 ? 'CNY' : 'USD',
    baseCurrencyCode: 'CNY',
    exchangeRate: side === 'primary' && index === 1 ? 1 : 7.2,
    accountSetId: index === 1 ? 'same-book' : 'other-book',
    accountSetName: index === 1 ? '验收原账套' : '另一个验收账套',
    amount: side === 'primary' && index === 1 ? 700 : 100,
    availableAmount: side === 'primary' && index === 1 ? 700 : 100,
    unpaidAmount: side === 'primary' && index === 1 ? 700 : 100,
    availableBaseAmount: side === 'primary' && index === 1 ? 700 : 720
  }))
}

async function selectRow(page: Page, side: 'primary' | 'secondary', index = 1) {
  const row = page.getByRole('row').filter({ hasText: `QA-FX-${side}-${index}` })
  const checkbox = row.getByRole('checkbox')
  if (!(await checkbox.isChecked())) await row.locator('label.el-checkbox').click()
  await expect(checkbox).toBeChecked()
}

for (const relation of relations) {
  test(`${relation.label}保留双方原币并提交各自金额，刷新仅转原图标`, async ({ page }, info) => {
    let captured: unknown
    let written = false
    let hold = false
    let release: (() => void) | undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_writeoff_workspace_secure') {
        if (hold) await held
        return route.fulfill({
          json: {
            primary: written ? [] : sources('primary'),
            secondary: written ? [] : sources('secondary'),
            history: [],
            blockedSources: [],
            organizations: [],
            relations,
            schemes: [
              {
                id: 'manual',
                code: relation.value === 'payable_receivable' ? 'AP-AR-MANUAL' : 'AP-MANUAL',
                name: '验收手工核销方案',
                enabled: true
              }
            ]
          }
        })
      }
      if (name === 'fms_payable_writeoff_secure') {
        captured = route.request().postDataJSON()
        written = true
        return route.fulfill({ json: ['record-1'] })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&${fixtureOptions(info)}&relation=${relation.value}`
    )
    await expect(page.getByText('QA-FX-primary-1', { exact: true })).toBeVisible()
    await selectRow(page, 'primary')
    await selectRow(page, 'secondary')
    hold = true
    const refresh = page.getByRole('button', { name: '刷新', exact: true })
    await refresh.click()
    await expect(refresh).toHaveClass(/art-icon-button--loading/)
    await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
    await expect(page.locator('.el-skeleton:visible')).toHaveCount(0)
    await expect(page.getByText('QA-FX-primary-1', { exact: true })).toBeVisible()
    await expect(refresh.locator('svg')).toHaveCount(1)
    release?.()
    await expect(refresh).not.toHaveClass(/art-icon-button--loading/)
    await selectRow(page, 'primary')
    await selectRow(page, 'secondary')
    if (relation.value === 'payable_receivable' || info.project.name === 'desktop-1440')
      await page.screenshot({
        path: `.artifacts/payable-fx-${relation.value}-${info.project.name}-ready.png`,
        fullPage: true
      })
    await page.getByRole('button', { name: '核销', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '核销确认', exact: true })
    await expect(confirmation).toContainText('USD')
    await expect(confirmation).toContainText('700.00')
    await expect(confirmation).toContainText('100.00')
    await confirmation.getByRole('button', { name: '执行核销', exact: true }).click()
    const secondaryKey =
      relation.value === 'payable_receivable'
        ? 'receivable_amount'
        : relation.value === 'payment_refund'
          ? 'refund_amount'
          : 'payment_face_amount'
    await expect
      .poll(() => captured)
      .toMatchObject({ p_items: [{ amount: 700, [secondaryKey]: 100 }] })
    await expect(page.getByText('QA-FX-primary-1', { exact: true })).toHaveCount(0)
  })
}

test('异币手工核销不能跨账套，未核实来源保留可读原因', async ({ page }, info) => {
  let calls = 0
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_payable_writeoff_workspace_secure')
      return route.fulfill({
        json: {
          primary: sources('primary'),
          secondary: sources('secondary'),
          history: [],
          organizations: [],
          relations,
          blockedSources: [
            {
              id: 'blocked',
              tenantId: tenant,
              documentId: 'original-ar',
              documentNo: 'QA-AR-待核实',
              sourceType: 'receivable',
              balanceState: 'unverified_book',
              balanceMessage: '原账套尚未核实，不能套用当前默认账套'
            }
          ],
          schemes: [{ id: 'manual', code: 'AP-AR-MANUAL', name: '验收手工方案', enabled: true }]
        }
      })
    if (name === 'fms_payable_writeoff_secure') calls++
    return route.fulfill({ json: [] })
  })
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&relation=payable_receivable&${fixtureOptions(info)}`
  )
  await expect(page.getByText('1 条来源暂不可核销', { exact: true })).toBeVisible()
  await expect(
    page.getByText('原账套尚未核实，不能套用当前默认账套', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'QA-AR-待核实', exact: true })).toHaveAttribute(
    'href',
    /financial-receivable\?recordId=original-ar/
  )
  await selectRow(page, 'primary')
  await selectRow(page, 'secondary', 2)
  await page.getByRole('button', { name: '核销', exact: true }).click()
  await expect(page.getByText('核销双方不能跨账套，请重新选择来源', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog', { name: '核销确认', exact: true })).toHaveCount(0)
  expect(calls).toBe(0)
  await page.screenshot({
    path: `.artifacts/payable-fx-book-guard-${info.project.name}.png`,
    fullPage: true
  })
})

test('核销凭证预览同时显示两方原币、原汇率和实际本位币', async ({ page }, info) => {
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_payable_writeoff_workspace_secure')
      return route.fulfill({
        json: {
          primary: [],
          secondary: [],
          organizations: [],
          relations,
          schemes: [],
          history: [
            {
              id: 'history',
              tenantId: tenant,
              recordNo: 'QA-FX-REC-001',
              documentNo: 'QA-FX-DOC-001',
              payableNo: 'QA-AP-1',
              paymentNo: 'QA-AR-1',
              supplierId: 'supplier',
              supplierName: '验收往来单位',
              currencyCode: 'CNY',
              secondaryCurrencyCode: 'USD',
              amount: 700,
              receivableAmount: 100,
              payableBaseAmount: 700,
              receivableBaseAmount: 720,
              primaryExchangeRate: 1,
              secondaryExchangeRate: 7.2,
              exchangeDifference: -20,
              baseCurrencyCode: 'CNY',
              status: 'active',
              needsVoucher: true,
              writeoffDate: '2026-10-25'
            }
          ]
        }
      })
    if (name === 'fms_payable_settlement_voucher_secure')
      return route.fulfill({
        json: {
          message: '按双方原记账汇率预览',
          lines: [
            {
              summary: '核减应付',
              subjectCode: '2202',
              subjectName: '应付账款',
              debitAmount: 700,
              creditAmount: 0,
              baseCurrencyCode: 'CNY'
            },
            {
              summary: '核减应收',
              subjectCode: '1122',
              subjectName: '应收账款',
              debitAmount: 0,
              creditAmount: 720,
              currencyCode: 'USD',
              originalAmount: 100,
              exchangeRate: 7.2,
              baseCurrencyCode: 'CNY'
            },
            {
              summary: '汇兑损失',
              subjectCode: '6603',
              subjectName: '汇兑损益',
              debitAmount: 20,
              creditAmount: 0,
              baseCurrencyCode: 'CNY'
            }
          ]
        }
      })
    return route.fulfill({ json: [] })
  })
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&relation=payable_receivable&tab=history&${fixtureOptions(info)}`
  )
  await page.getByRole('button', { name: '预览凭证', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '凭证预览', exact: true })
  const row = dialog.getByRole('row').filter({ hasText: '应收账款' })
  await expect(row).toContainText('USD')
  await expect(row).toContainText('100.00')
  await expect(row).toContainText('7.2')
  await expect(row).toContainText('720.00')
  await expect(
    dialog.getByRole('columnheader', { name: '借方(本位币)', exact: true })
  ).toBeVisible()
  await page.screenshot({
    path: `.artifacts/payable-fx-voucher-${info.project.name}.png`,
    fullPage: true
  })
  await dialog.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await page.screenshot({
    path: `.artifacts/payable-fx-voucher-base-${info.project.name}.png`,
    fullPage: true
  })
})

for (const relation of relations) {
  test(`${relation.label}自动清单展示双方原币与本位币并可切换三种分配方式`, async ({
    page
  }, info) => {
    const calls: unknown[] = []
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_writeoff_workspace_secure')
        return route.fulfill({
          json: {
            primary: [],
            secondary: [],
            history: [],
            organizations: [],
            relations,
            schemes: [
              { id: 'auto', code: 'QA-AUTO', name: '验收自动方案', enabled: true, automatic: true }
            ]
          }
        })
      if (name === 'fms_auto_payable_writeoff_secure') {
        const body: unknown = route.request().postDataJSON()
        calls.push(body)
        const query =
          body && typeof body === 'object' && 'p_query' in body ? body.p_query : undefined
        const mode =
          query && typeof query === 'object' && 'cross_currency_mode' in query
            ? query.cross_currency_mode
            : undefined
        const secondary = mode === 'full_pair' ? 100 : 97.22
        const secondaryBase = mode === 'full_pair' ? 720 : 699.98
        const item = {
          relation: relation.value,
          payableNo: 'QA-AUTO-AP',
          paymentNo: 'QA-AUTO-SIDE',
          supplierName: '验收主方',
          paymentSupplierName: '验收辅方',
          accountSetId: 'same-book',
          currencyCode: 'CNY',
          secondaryCurrencyCode: 'USD',
          baseCurrencyCode: 'CNY',
          primaryExchangeRate: 1,
          secondaryExchangeRate: 7.2,
          amount: 700,
          needsVoucher: true,
          ...(relation.value === 'payable_payment'
            ? {
                paymentFaceAmount: secondary,
                paymentAmount: secondary,
                cashDiscountAmount: 0,
                payableBaseAmount: 700,
                paymentBaseAmount: secondaryBase,
                cashDiscountBaseAmount: 0
              }
            : relation.value === 'payable_receivable'
              ? {
                  receivableAmount: secondary,
                  payableBaseAmount: 700,
                  receivableBaseAmount: secondaryBase
                }
              : {
                  paymentAmount: 700,
                  refundAmount: secondary,
                  paymentBaseAmount: 700,
                  refundBaseAmount: secondaryBase
                }),
          exchangeDifference:
            relation.value === 'payment_refund' ? secondaryBase - 700 : 700 - secondaryBase
        }
        return route.fulfill({
          json: {
            items: mode === 'same_currency' ? [] : [item],
            recordCount: mode === 'same_currency' ? 0 : 1,
            totalAmount: mode === 'same_currency' ? 0 : 700,
            planToken: `plan-${String(mode)}`,
            schemeName: '验收自动方案',
            recordIds: [],
            executed: false,
            message: '按双方原记账汇率分配'
          }
        })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&relation=${relation.value}&${fixtureOptions(info)}`
    )
    await page.getByRole('combobox', { name: '核销方案', exact: true }).press('Enter')
    await page.getByRole('option', { name: '验收自动方案', exact: true }).click()
    await page.getByRole('button', { name: '按方案自动核销', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '按方案自动核销', exact: true })
    const confirm = dialog.getByRole('button', { name: '确认自动核销', exact: true })
    await expect(confirm).toBeEnabled()
    const row = dialog.getByRole('row').filter({ hasText: 'QA-AUTO-AP' })
    await expect(row).toContainText('97.22')
    await expect(row).toContainText('699.98')
    await expect(row).toContainText('CNY / USD')
    await dialog.getByRole('radio', { name: '匹配余量全部对冲', exact: true }).locator('..').click()
    await expect
      .poll(() => calls.at(-1))
      .toMatchObject({ p_query: { cross_currency_mode: 'full_pair' } })
    await expect(row).toContainText('100.00')
    await expect(row).toContainText('720.00')
    await expect(row).toContainText(relation.value === 'payment_refund' ? '收益' : '损失')
    const scroll = dialog.locator('.el-table__body-wrapper .el-scrollbar__wrap')
    await scroll.evaluate((element) => {
      element.scrollLeft = (element.scrollWidth - element.clientWidth) * 0.6
    })
    if (relation.value === 'payable_receivable' || info.project.name === 'desktop-1440')
      await page.screenshot({
        path: `.artifacts/payable-fx-auto-${relation.value}-${info.project.name}-original.png`,
        fullPage: true
      })
    await scroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    if (relation.value === 'payable_receivable' || info.project.name === 'desktop-1440')
      await page.screenshot({
        path: `.artifacts/payable-fx-auto-${relation.value}-${info.project.name}-base.png`,
        fullPage: true
      })
    await dialog.getByRole('radio', { name: '仅同币种', exact: true }).locator('..').click()
    await expect(confirm).toBeDisabled()
    await expect(dialog.getByText('暂无符合方案的单据', { exact: true })).toBeVisible()
  })
}

test('缺少原应收异币权限时只允许同币自动预览', async ({ page }, info) => {
  const calls: unknown[] = []
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_payable_writeoff_workspace_secure')
      return route.fulfill({
        json: {
          primary: [],
          secondary: [],
          history: [],
          relations,
          organizations: [],
          schemes: [
            { id: 'auto', code: 'QA-AUTO', name: '验收自动方案', enabled: true, automatic: true }
          ]
        }
      })
    if (name === 'fms_auto_payable_writeoff_secure') {
      calls.push(route.request().postDataJSON())
      return route.fulfill({
        json: {
          items: [],
          recordCount: 0,
          totalAmount: 0,
          planToken: 'same-only',
          schemeName: '验收自动方案',
          recordIds: [],
          executed: false
        }
      })
    }
    return route.fulfill({ json: [] })
  })
  const permissions = [
    'FinancePayableWriteoff:View',
    'FinancePayableWriteoff:AutoWriteoff',
    'FinanceReceiptWriteoff:Writeoff'
  ].join(',')
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&relation=payable_receivable&permissions=${permissions}&${fixtureOptions(info)}`
  )
  await page.getByRole('combobox', { name: '核销方案', exact: true }).press('Enter')
  await page.getByRole('option', { name: '验收自动方案', exact: true }).click()
  await page.getByRole('button', { name: '按方案自动核销', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '按方案自动核销', exact: true })
  await expect(dialog.getByRole('radio', { name: '仅同币种', exact: true })).toBeChecked()
  await expect(dialog.getByRole('radio', { name: '本位币等值分配', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('radio', { name: '匹配余量全部对冲', exact: true })).toBeDisabled()
  await expect
    .poll(() => calls.at(-1))
    .toMatchObject({ p_query: { cross_currency_mode: 'same_currency' } })
  await page.screenshot({
    path: `.artifacts/payable-fx-native-permission-${info.project.name}.png`,
    fullPage: true
  })
})

test('成功响应内容不完整时不盲目恢复选择，须先核对原核销记录', async ({ page }, info) => {
  let committed = false
  let writes = 0
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_payable_writeoff_workspace_secure') {
      const row = (side: string) => ({
        id: side,
        tenantId: tenant,
        documentNo: `QA-UNKNOWN-${side}`,
        supplierId: 'supplier',
        supplierName: '不确定结果验收往来',
        accountSetId: 'book',
        accountSetName: '验收账套',
        currencyCode: 'CNY',
        baseCurrencyCode: 'CNY',
        exchangeRate: 1,
        amount: 100,
        availableAmount: committed ? 60 : 100,
        availableBaseAmount: committed ? 60 : 100
      })
      return route.fulfill({
        json: {
          primary: [row('primary')],
          secondary: [row('secondary')],
          organizations: [],
          history: committed
            ? [
                {
                  id: 'done',
                  tenantId: tenant,
                  recordNo: 'QA-已核销40',
                  supplierId: 'supplier',
                  supplierName: '不确定结果验收往来',
                  amount: 40,
                  paymentAmount: 40,
                  cashDiscountAmount: 0,
                  currencyCode: 'CNY',
                  status: 'active',
                  needsVoucher: false
                }
              ]
            : [],
          schemes: [{ id: 'manual', code: 'AP-MANUAL', name: '结果核对方案', enabled: true }]
        }
      })
    }
    if (name === 'fms_payable_writeoff_secure') {
      writes++
      committed = true
      return route.fulfill({ json: [] })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&${fixtureOptions(info)}`)
  for (const side of ['primary', 'secondary']) {
    const row = page.getByRole('row').filter({ hasText: `QA-UNKNOWN-${side}` })
    await row.getByRole('spinbutton').fill('40')
    await row.getByRole('spinbutton').press('Tab')
    await row.locator('label.el-checkbox').click()
  }
  await page.getByRole('button', { name: '核销', exact: true }).click()
  await page
    .getByRole('dialog', { name: '核销确认', exact: true })
    .getByRole('button', { name: '执行核销', exact: true })
    .click()
  await expect(page.getByText('上次核销结果未确认，请先核对记录', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '核销', exact: true })).toBeDisabled()
  await expect(
    page.getByRole('row').filter({ hasText: 'QA-UNKNOWN-primary' }).getByRole('checkbox')
  ).not.toBeChecked()
  await page.getByRole('button', { name: '查看核销记录', exact: true }).click()
  await expect(page.getByText('QA-已核销40', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '已核对，重新选择', exact: true }).click()
  await page.getByRole('tab', { name: '待核销单据', exact: true }).click()
  await expect(page.getByRole('button', { name: '核销', exact: true })).toBeDisabled()
  expect(writes).toBe(1)
})
