import { expect, test, type Page } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareIsolatedSession } from './support/isolated-session'
import {
  TENANT_SCOPE_MODE_STORAGE_KEY,
  TENANT_SCOPE_STORAGE_KEY
} from '../../src/utils/tenant-scope-context'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(120_000)
test.beforeEach(async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const code = new URL(route.request().url()).searchParams
      .get('dict_type_table.code')
      ?.replace(/^eq\./, '')
    const values =
      code === 'fmsVoucherStatus'
        ? [['draft', '草稿']]
        : code === 'fmsVoucherType'
          ? [['transfer', '转账凭证']]
          : code === 'fmsVoucherSourceType'
            ? [['system', '系统生成']]
            : []
    return route.fulfill({
      json: values.map(([value, label], index) => ({
        id: `${code}-${index}`,
        type_id: code,
        code: value,
        label,
        value,
        status: '1',
        sort: index,
        dict_type_table: { code, name: code }
      }))
    })
  })
})
const tenantId = '11111111-1111-4111-8111-111111111111'
const voucherId = (index: number) => `${index}1111111-1111-4111-8111-111111111111`

function voucher(index: number, access = 'read') {
  return {
    id: voucherId(index),
    accountSetId: '22222222-2222-4222-8222-222222222222',
    accountingPeriodId: 'period',
    voucherNo: `转-202610-00${index}`,
    voucherType: 'transfer',
    voucherDate: '2026-10-24',
    fiscalYear: 2026,
    periodNo: 10,
    status: 'draft',
    sourceType: 'system',
    sourceId: `writeoff-${index}`,
    sourceNo: `APHXD-QA-${index}`,
    sourceEventCode: 'ap_payable_refund_writeoff_approved',
    summary: '脱敏验收凭证',
    attachments: [],
    totalDebit: 168,
    totalCredit: 168,
    lineCount: 2,
    version: 1,
    createTime: '2026-10-24T00:00:00Z',
    updateTime: '2026-10-24T00:00:00Z',
    fieldAccess: {
      voucherAmounts: 'edit',
      sourceReferences: access,
      voucherAttachments: 'edit',
      auditTrail: 'read'
    },
    accountSet: {
      id: '22222222-2222-4222-8222-222222222222',
      accountSetName: '脱敏验收账套',
      accountSetCode: 'QA'
    },
    lines: [
      {
        lineNo: 10,
        summary: '应付退款原币核对',
        subjectId: 'subject-1',
        subjectCodeSnapshot: '2241',
        subjectNameSnapshot: '其他应付款',
        debitAmount: 168,
        creditAmount: 0,
        exchangeRate: 8,
        originalAmount: 21,
        currencyId: 'currency-EUR',
        currencyCodeSnapshot: 'EUR',
        auxiliaryValues: {}
      },
      {
        lineNo: 20,
        summary: '应付退款原币核对',
        subjectId: 'subject-2',
        subjectCodeSnapshot: '2202',
        subjectNameSnapshot: '应付账款',
        debitAmount: 0,
        creditAmount: 168,
        exchangeRate: 7,
        originalAmount: 24,
        currencyId: 'currency-USD',
        currencyCodeSnapshot: 'USD',
        auxiliaryValues: {}
      }
    ],
    actions: []
  }
}

function matched(index: number) {
  return {
    id: `writeoff-${index}`,
    tenantId,
    accountSetId: '22222222-2222-4222-8222-222222222222',
    recordNo: `APHX-QA-${index}`,
    relation: 'payable_refund',
    payableId: `payable-${index}`,
    payableNo: `AP-QA-${index}`,
    receiptId: `receipt-${index}`,
    paymentNo: `AR-RC-QA-${index}`,
    supplierId: 'supplier',
    supplierName: '脱敏供应商',
    writeoffDate: '2026-10-24',
    amount: 24,
    needsVoucher: true,
    status: 'active',
    remark: ''
  }
}

async function mock(
  page: Page,
  options: {
    access?: string
    fail?: boolean
    accessDenied?: boolean
    relation?: 'payable_payment' | 'payment_refund' | 'payable_receivable'
    delayRefresh?: Promise<void>
  } = {}
) {
  let reads = 0
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const rpc = new URL(route.request().url()).pathname.split('/').pop()
    const body = route.request().postDataJSON()
    if (rpc === 'fms_get_voucher_secure') {
      const index = body.p_voucher_id === voucherId(1) ? 1 : 2
      const current = voucher(index, options.access)
      current.sourceEventCode =
        options.relation === 'payable_receivable'
          ? 'ap_receivable_offset_approved'
          : options.relation
            ? 'ap_writeoff_approved'
            : current.sourceEventCode
      await route.fulfill({ json: current })
    } else if (rpc === 'fms_get_payable_writeoff_record_secure') {
      reads++
      if (reads > 1 && options.delayRefresh) await options.delayRefresh
      if (options.accessDenied)
        await route.fulfill({ status: 403, json: { code: '42501', message: '需要原收款查看权限' } })
      else if (options.fail && reads === 1)
        await route.fulfill({
          status: 500,
          json: { code: 'XX000', message: 'unexpected internal failure' }
        })
      else {
        const index = body.p_id === 'writeoff-1' ? 1 : 2
        await route.fulfill({
          json: {
            ...matched(index),
            ...(options.relation
              ? {
                  relation: options.relation,
                  payment_line_id: `payment-line-${index}`,
                  refund_line_id: `refund-line-${index}`,
                  receivable_line_id: `receivable-line-${index}`,
                  payment_document_id: `payment-header-${index}`,
                  refund_document_id: `refund-header-${index}`,
                  receivable_document_id: `receivable-header-${index}`,
                  payableNo:
                    options.relation === 'payment_refund' ? `FK-QA-${index}` : `AP-QA-${index}`,
                  paymentNo: `${options.relation === 'payment_refund' ? 'FKTK' : options.relation === 'payable_receivable' ? 'AR' : 'FK'}-QA-${index}`
                }
              : {})
          }
        })
      }
    } else if (rpc === 'fms_list_financial_statement_items_secure')
      await route.fulfill({ json: { records: [], fieldAccess: {} } })
    else await route.fulfill({ json: [] })
  })
  return () => reads
}

for (const [relation, target, label, prefix, identifier] of [
  ['payable_payment', 'FinancePayablePayment', '付款单', 'FK', 'payment-header'],
  ['payment_refund', 'FinancePayableRefund', '付款退款单', 'FKTK', 'refund-header'],
  ['payable_receivable', 'FinanceFinancialReceivable', '财务应收单', 'AR', 'receivable-header']
] as const) {
  test(`${relation} 两条关联使用原单主表标识联查`, async ({ page }, info) => {
    await mock(page, { relation })
    await page.goto('/tests/e2e/fixtures/voucher-related.html', {
      waitUntil: 'domcontentloaded',
      timeout: 90_000
    })
    for (const index of [1, 2]) {
      await page.getByRole('button', { name: `查看凭证${index}`, exact: true }).click()
      const detail = page.getByRole('dialog', { name: '会计凭证详情', exact: true })
      const related = detail.getByRole('complementary', { name: '凭证关联信息', exact: true })
      const link = related.getByRole('link', {
        name: `查看${label} ${prefix}-QA-${index}`,
        exact: true
      })
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', new RegExp(`recordId=${identifier}-${index}`))
      if (relation === 'payment_refund')
        await expect(
          related.getByRole('link', { name: `查看付款单 FK-QA-${index}`, exact: true })
        ).toHaveAttribute('href', new RegExp(`recordId=payment-header-${index}`))
      await captureBusinessEvidence(related, {
        path: info.outputPath(`${relation}-origin-${index}.png`)
      })
      await link.click()
      await expect(detail).toBeHidden()
      await expect(page.locator(`[data-destination="${target}"]`)).toHaveAttribute(
        'data-record-id',
        `${identifier}-${index}`
      )
    }
  })

  test(`${relation} 缺少目标查看权限保留单号但不能联查`, async ({ page }) => {
    await mock(page, { relation })
    await page.goto(`/tests/e2e/fixtures/voucher-related.html?denyTarget=${target}:View`, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000
    })
    await page.getByRole('button', { name: '查看凭证1', exact: true }).click()
    const related = page.getByRole('complementary', { name: '凭证关联信息', exact: true })
    await expect(related.getByText(`${prefix}-QA-1`, { exact: true })).toBeVisible()
    await expect(
      related.getByRole('link', { name: `查看${label} ${prefix}-QA-1`, exact: true })
    ).toHaveCount(0)
  })
}

for (const appearance of ['light', 'dark']) {
  test(`两张真实组件凭证关联栏、折叠、编辑保留和联查 ${appearance}`, async ({ page }, info) => {
    const reads = await mock(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(
      `/tests/e2e/fixtures/voucher-related.html?theme=${appearance}&box=${appearance === 'dark' ? 'shadow-mode' : 'border-mode'}`,
      { waitUntil: 'domcontentloaded', timeout: 90_000 }
    )
    for (const index of [1, 2]) {
      await page.getByRole('button', { name: `查看凭证${index}`, exact: true }).click()
      const detail = page.getByRole('dialog', { name: '会计凭证详情', exact: true })
      const aside = detail.getByRole('complementary', { name: '凭证关联信息', exact: true })
      await expect(
        aside.getByRole('link', { name: `查看供应商退款收款单 AR-RC-QA-${index}`, exact: true })
      ).toBeVisible()
      await captureBusinessEvidence(detail, {
        path: info.outputPath(`voucher-${appearance}-${index}-expanded.png`)
      })
      await aside.getByRole('button', { name: '收起关联信息', exact: true }).click()
      const expand = aside.getByRole('button', { name: '展开关联信息', exact: true })
      await expect(expand).toHaveAttribute('aria-expanded', 'false')
      await expand.focus()
      await expand.press('Enter')
      await expect(aside.getByText(`APHX-QA-${index}`, { exact: true })).toBeVisible()
      await aside
        .getByRole('link', { name: `查看供应商退款收款单 AR-RC-QA-${index}`, exact: true })
        .click()
      await expect(detail).toBeHidden()
      await expect(page.locator('[data-destination="FinanceReceipt"]')).toHaveAttribute(
        'data-record-id',
        `receipt-${index}`
      )
    }
    await page.getByRole('button', { name: '编辑凭证1', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '编辑凭证 · 转-202610-001', exact: true })
    const aside = editor.getByRole('complementary', { name: '凭证关联信息', exact: true })
    await expect(editor.getByRole('button', { name: '保存草稿', exact: true })).toHaveClass(
      /el-button--primary/
    )
    await expect(aside.getByText('APHX-QA-1', { exact: true })).toBeVisible()
    const usd = editor.locator('.el-select__selected-item').filter({ hasText: /^USD$/ }).first()
    await expect(usd).toBeVisible()
    expect(await usd.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    const summary = editor.getByPlaceholder('概括本次经济业务', { exact: true })
    await summary.fill('折叠关联栏不能清空本次填写')
    await aside.getByRole('button', { name: '收起关联信息', exact: true }).click()
    await expect(summary).toHaveValue('折叠关联栏不能清空本次填写')
    await captureBusinessEvidence(editor, {
      path: info.outputPath(`voucher-${appearance}-editor-collapsed.png`)
    })
    await aside.getByRole('button', { name: '展开关联信息', exact: true }).click()
    await expect(summary).toHaveValue('折叠关联栏不能清空本次填写')
    await captureBusinessEvidence(editor, {
      path: info.outputPath(`voucher-${appearance}-editor-expanded.png`)
    })
    expect(reads()).toBe(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}

for (const access of ['hidden', 'masked']) {
  test(`来源字段 ${access} 不查询或泄露关联业务`, async ({ page }, info) => {
    const reads = await mock(page, { access })
    await page.goto('/tests/e2e/fixtures/voucher-related.html')
    await page.getByRole('button', { name: '查看凭证1', exact: true }).click()
    const aside = page.getByRole('complementary', { name: '凭证关联信息', exact: true })
    await expect(aside).toContainText('关联信息不可查看')
    await expect(aside.getByRole('link')).toHaveCount(0)
    await expect(aside).not.toContainText('APHX-QA-1')
    expect(reads()).toBe(0)
    await captureBusinessEvidence(aside, { path: info.outputPath(`voucher-source-${access}.png`) })
  })
}

test('缺少核销查看权限不发起额外查询，拒绝读取不伪装成空数据', async ({ page }, info) => {
  const reads = await mock(page)
  await page.goto('/tests/e2e/fixtures/voucher-related.html?denyWriteoff=true')
  await page.getByRole('button', { name: '查看凭证1', exact: true }).click()
  const aside = page.getByRole('complementary', { name: '凭证关联信息', exact: true })
  await expect(aside).toContainText('仅显示凭证中已有来源')
  await expect(aside.getByRole('link')).toHaveCount(0)
  expect(reads()).toBe(0)
  await captureBusinessEvidence(aside, { path: info.outputPath('voucher-source-permission.png') })
})

test('关联查询失败可重试，刷新只转图标且保留已有资料', async ({ page }, info) => {
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await mock(page, { fail: true })
  await page.goto('/tests/e2e/fixtures/voucher-related.html')
  await page.getByRole('button', { name: '查看凭证1', exact: true }).click()
  const aside = page.getByRole('complementary', { name: '凭证关联信息', exact: true })
  await expect(aside).toContainText('内容加载失败')
  await expect(aside).not.toContainText('unexpected internal failure')
  await captureBusinessEvidence(aside, { path: info.outputPath('voucher-source-error.png') })
  await aside.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(aside.getByText('APHX-QA-1', { exact: true })).toBeVisible()
  await page.route('**/rest/v1/rpc/fms_get_payable_writeoff_record_secure', async (route) => {
    await held
    await route.fulfill({ json: matched(1) })
  })
  try {
    await aside.getByRole('button', { name: '刷新关联信息', exact: true }).click()
    await expect(aside.getByRole('button', { name: '刷新关联信息', exact: true })).toHaveAttribute(
      'aria-busy',
      'true'
    )
    await expect(aside.getByText('APHX-QA-1', { exact: true })).toBeVisible()
    await expect(aside.locator('.el-skeleton, .el-loading-mask')).toHaveCount(0)
    await captureBusinessEvidence(aside, {
      path: info.outputPath('voucher-related-refresh-retained.png')
    })
  } finally {
    release()
  }
})

test('来源业务拒绝读取时保留可读来源号，不显示其他关联标识', async ({ page }, info) => {
  await mock(page, { accessDenied: true })
  await page.goto('/tests/e2e/fixtures/voucher-related.html')
  await page.getByRole('button', { name: '查看凭证1', exact: true }).click()
  const aside = page.getByRole('complementary', { name: '凭证关联信息', exact: true })
  await expect(aside).toContainText('仅显示凭证中已有来源')
  await expect(aside).toContainText('APHXD-QA-1')
  await expect(aside).not.toContainText('AR-RC-QA-1')
  await expect(aside.getByRole('link')).toHaveCount(0)
  await captureBusinessEvidence(aside, { path: info.outputPath('voucher-source-denied.png') })
})

test('手工凭证没有来源时展示真实空态而不是权限错误', async ({ page }, info) => {
  const reads = await mock(page)
  await page.route('**/rest/v1/rpc/fms_get_voucher_secure', (route) =>
    route.fulfill({
      json: {
        ...voucher(1),
        sourceType: 'manual',
        sourceId: null,
        sourceNo: null,
        sourceEventCode: null
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/voucher-related.html')
  await page.getByRole('button', { name: '查看凭证1', exact: true }).click()
  const aside = page.getByRole('complementary', { name: '凭证关联信息', exact: true })
  await expect(aside).toContainText('暂无来源单据')
  await expect(aside).toContainText('手工凭证可通过摘要和原始附件保留记账依据')
  expect(reads()).toBe(0)
  await captureBusinessEvidence(aside, { path: info.outputPath('voucher-manual-empty.png') })
})

test('关联结果不属于凭证原账套时拒绝联查', async ({ page }) => {
  await mock(page)
  await page.route('**/rest/v1/rpc/fms_get_payable_writeoff_record_secure', (route) =>
    route.fulfill({ json: { ...matched(1), accountSetId: 'other-book' } })
  )
  await page.goto('/tests/e2e/fixtures/voucher-related.html')
  await page.getByRole('button', { name: '查看凭证1', exact: true }).click()
  const aside = page.getByRole('complementary', { name: '凭证关联信息', exact: true })
  await expect(aside).toContainText('凭证关联资料与当前来源不一致')
  await expect(aside.getByRole('link')).toHaveCount(0)
  await expect(aside).not.toContainText('AR-RC-QA-1')
})

test('旧凭证的迟到关联响应不能覆盖新凭证', async ({ page }) => {
  await mock(page)
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/rest/v1/rpc/fms_get_payable_writeoff_record_secure', async (route) => {
    const index = route.request().postDataJSON().p_id === 'writeoff-1' ? 1 : 2
    if (index === 1) await held
    await route.fulfill({ json: matched(index) })
  })
  try {
    await page.goto('/tests/e2e/fixtures/voucher-related.html')
    await page.getByRole('button', { name: '查看凭证1', exact: true }).click()
    await expect(page.getByRole('complementary').locator('.el-skeleton')).toBeVisible()
    await page
      .getByRole('dialog', { name: '会计凭证详情', exact: true })
      .getByRole('button', { name: '关闭此对话框', exact: true })
      .click()
    await page.getByRole('button', { name: '查看凭证2', exact: true }).click()
    const aside = page.getByRole('complementary', { name: '凭证关联信息', exact: true })
    await expect(aside.getByText('APHX-QA-2', { exact: true })).toBeVisible()
    release()
    await expect(aside).not.toContainText('APHX-QA-1')
    await expect(aside.getByText('APHX-QA-2', { exact: true })).toBeVisible()
  } finally {
    release()
  }
})

test('范围变化时拒绝迟到主单，重试后才展示当前关联', async ({ page }) => {
  await mock(page)
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/rest/v1/rpc/fms_get_voucher_secure', async (route) => {
    await held
    await route.fulfill({ json: voucher(1) })
  })
  try {
    await page.goto('/tests/e2e/fixtures/voucher-related.html')
    const requested = page.waitForRequest((request) =>
      request.url().endsWith('/rpc/fms_get_voucher_secure')
    )
    await page.getByRole('button', { name: '查看凭证1', exact: true }).click()
    await requested
    await page.evaluate(
      ({ active, scope }) => {
        sessionStorage.setItem(active, '1')
        sessionStorage.setItem(scope, '33333333-3333-4333-8333-333333333333')
      },
      { active: TENANT_SCOPE_MODE_STORAGE_KEY, scope: TENANT_SCOPE_STORAGE_KEY }
    )
    release()
    const detail = page.getByRole('dialog', { name: '会计凭证详情', exact: true })
    await expect(detail).toContainText('凭证详情加载失败')
    await expect(
      detail.getByRole('complementary', { name: '凭证关联信息', exact: true })
    ).toHaveCount(0)
    await page.evaluate(
      ({ active, scope }) => {
        sessionStorage.removeItem(active)
        sessionStorage.removeItem(scope)
      },
      { active: TENANT_SCOPE_MODE_STORAGE_KEY, scope: TENANT_SCOPE_STORAGE_KEY }
    )
    await detail.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(
      detail.getByRole('complementary').getByText('APHX-QA-1', { exact: true })
    ).toBeVisible()
  } finally {
    release()
  }
})

test('窄容器关联栏下移，专注填单隐藏辅助栏且保留输入', async ({ page }, info) => {
  await page.setViewportSize({ width: 800, height: 900 })
  await mock(page)
  await page.goto('/tests/e2e/fixtures/voucher-related.html')
  await page.getByRole('button', { name: '编辑凭证1', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑凭证 · 转-202610-001', exact: true })
  const aside = editor.getByRole('complementary', { name: '凭证关联信息', exact: true })
  await expect(aside.getByText('APHX-QA-1', { exact: true })).toBeVisible()
  const main = await editor.locator('.voucher-dialog').boundingBox()
  const side = await aside.boundingBox()
  expect(main && side && side.y >= main.y + main.height).toBe(true)
  const summary = editor.getByPlaceholder('概括本次经济业务', { exact: true })
  await summary.fill('窄屏专注填写保留内容')
  await editor.getByRole('button', { name: '进入专注填单', exact: true }).click()
  await expect(aside).toBeHidden()
  await expect(summary).toHaveValue('窄屏专注填写保留内容')
  await captureBusinessEvidence(editor, { path: info.outputPath('voucher-narrow-focus.png') })
  await editor.getByRole('button', { name: '退出专注填单', exact: true }).click()
  await expect(aside).toBeVisible()
  await expect(summary).toHaveValue('窄屏专注填写保留内容')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
