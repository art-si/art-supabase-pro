import { expect, test, type Page } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(150000)
const tenant = '11111111-1111-4111-8111-111111111111'
const makeWriteoffCandidate = (index: number, side: string) => ({
  id: `${side}-${index}`,
  tenant_id: tenant,
  supplier_id: `supplier-${index}`,
  supplier_name: `示例供应商${index}`,
  document_no: `${side}-${index}`,
  business_date: '2026-10-22',
  document_type_name: side === 'AP' ? '标准采购应付' : '采购付款',
  currency_code: 'CNY',
  amount: index * 100,
  available_amount: index * 100
})
const makeWriteoffSchemes = () =>
  [1, 2].map((index) => ({
    id: `scheme-${index}`,
    tenant_id: tenant,
    code: `SCHEME-${index}`,
    name: `同单位核销方案${index}`,
    enabled: true,
    automatic: index === 2,
    rules: [
      {
        primary_field: 'supplier_id',
        secondary_field: 'supplier_id',
        operator: 'eq',
        empty_matches: false
      },
      {
        primary_field: 'currency_code',
        secondary_field: 'currency_code',
        operator: 'eq',
        empty_matches: false
      }
    ]
  }))
const makeLine = (index: number) => ({
  id: `line-${index}`,
  line_no: index * 10,
  purpose_id: 'purpose-1',
  supplier_id: `supplier-${index}`,
  payee_supplier_id: `supplier-${index}`,
  supplier_name: `示例供应商${index}`,
  payee_supplier_name: `示例供应商${index}`,
  settlement_method_id: 'method-2',
  settlement_method_name: '电汇',
  fund_account_id: 'fund-1',
  fund_account_name: '示例银行账户',
  amount: index * 100,
  approved_amount: index * 100,
  planned_amount: index * 100,
  cash_discount: 0,
  tax_rate: 0,
  bank_account: `622200000000000${index}`,
  bank_account_name: `示例供应商${index}`,
  bank_name: '示例开户银行',
  bank_reference: '',
  fund_purpose: '采购货款',
  remark: '',
  details: {},
  source_document_no: `CWYF-${index}`
})
const makeDocument = (index: number, kind: string) => ({
  id: `document-${index}`,
  record_key: `document-${index}`,
  tenant_id: tenant,
  kind,
  document_no: `${kind === 'application' ? 'FKSQ' : 'FK'}-202610-00${index}`,
  document_type_id: 'type-1',
  document_type_name: kind === 'application' ? '采购付款申请' : '采购付款',
  status: 'draft',
  business_date: '2026-10-22',
  currency_code: 'CNY',
  counterparty_name: '示例供应商1、示例供应商2',
  organization_name: '示例付款组织',
  applicant_name: '示例申请人',
  amount: 300,
  approved_amount: 300,
  planned_amount: 300,
  payment_status: 'none',
  frozen: false,
  reason: `示例采购货款${index}`,
  remark: '',
  version: 1,
  details: { fee: 0 },
  lines: [makeLine(1), makeLine(2)]
})
const optionData = {
  tenant_id: tenant,
  supplier: [1, 2].map((index) => ({
    id: `supplier-${index}`,
    code: `SUP-${index}`,
    name: `示例供应商${index}`
  })),
  purpose: [
    { id: 'purpose-1', code: '201', name: '采购付款' },
    { id: 'purpose-2', code: '202', name: '预付款' }
  ],
  method: [
    { id: 'method-1', code: 'JSFS01', name: '现金', category: 'cash' },
    { id: 'method-2', code: 'JSFS04', name: '电汇', category: 'remittance' }
  ],
  fund: [
    { id: 'fund-1', code: 'BANK-01', name: '示例银行账户', category: 'bank', currency_code: 'CNY' }
  ],
  document_type: [{ id: 'type-1', code: 'AP_PURCHASE', name: '采购付款', is_default: true }],
  project: [],
  organization: [],
  currency: [{ id: 'CNY', name: '人民币', code: 'CNY' }],
  payable: [],
  purchase: [],
  expense: []
}
const optionsFor = (kind: string) => ({
  ...optionData,
  document_type: optionData.document_type.map((option) => ({
    ...option,
    name: kind === 'application' ? '采购付款申请' : '采购付款'
  }))
})
for (const kind of ['application', 'payment'] as const) {
  test(`${kind} 两空白新增草稿组织树、撤权与失败重试`, async ({ page }, info) => {
    const attempts: Array<{
      id: string
      kind: string
      organization_id: string
      reason: string
      lines: Array<{ supplier_id: string; amount: number }>
    }> = []
    const documents: ReturnType<typeof makeDocument>[] = []
    let fail = true
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_settlement_list_secure')
        return route.fulfill({ json: { data: documents, total: documents.length } })
      if (name === 'fms_payable_settlement_options_secure')
        return route.fulfill({ json: optionsFor(kind) })
      if (name === 'mdm_organization')
        return route.fulfill({
          json: [
            {
              id: 'group',
              tenant_id: tenant,
              parent_id: null,
              organization_name: '新增验收集团',
              organization_type: 'group',
              status: '1'
            },
            {
              id: 'company',
              tenant_id: tenant,
              parent_id: 'group',
              organization_name: '新增验收公司',
              organization_type: 'company',
              status: '1'
            },
            ...[1, 2].map((index) => ({
              id: `department-${index}`,
              tenant_id: tenant,
              parent_id: 'company',
              organization_name: `新增验收部门${index}`,
              organization_type: 'department',
              status: '1'
            }))
          ]
        })
      if (name === 'fms_save_payable_settlement_secure') {
        const payload = route.request().postDataJSON().p_document
        attempts.push(payload)
        if (fail)
          return route.fulfill({
            status: 409,
            json: { code: 'P0001', message: '新增资料已变化，请核对后重试' }
          })
        const index = documents.length + 1
        const created = {
          ...makeDocument(index, kind),
          ...payload,
          id: `new-${index}`,
          document_no: `QA-NEW-${index}`,
          amount: index * 100
        }
        documents.push(created)
        return route.fulfill({ json: created })
      }
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const menu = kind === 'application' ? 'FinancePayableApplication' : 'FinancePayablePayment'
    for (const index of [1, 2]) {
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}&permissionControls&permissions=${menu}:View,${menu}:Add`
      )
      await page.getByRole('button', { name: '新增', exact: true }).click()
      const drawer = page.getByRole('dialog', {
        name: kind === 'application' ? '新增付款申请单' : '新增付款单',
        exact: true
      })
      const save = drawer.getByRole('button', { name: '保存', exact: true })
      await expect(save).toBeEnabled()
      const before = attempts.length
      await save.click()
      await expect(page.getByText('请至少添加一行付款明细', { exact: true })).toBeVisible()
      expect(attempts).toHaveLength(before)
      await drawer.getByLabel('付款组织', { exact: true }).click()
      await page
        .getByRole('treeitem', { name: '新增验收集团', exact: true })
        .locator('.el-tree-node__expand-icon')
        .first()
        .click()
      await page
        .getByRole('treeitem', { name: '新增验收公司', exact: true })
        .locator('.el-tree-node__expand-icon')
        .first()
        .click()
      if (index === 2) {
        await expect(page.locator('.el-message')).toHaveCount(0)
        await page
          .getByRole('tree')
          .screenshot({ path: info.outputPath('create-organization-tree.png') })
      }
      await page.getByRole('treeitem', { name: `新增验收部门${index}`, exact: true }).click()
      await drawer
        .getByRole('textbox', { name: kind === 'application' ? '请款事由' : '摘要', exact: true })
        .fill(`独立新增事由${index}`)
      await drawer.getByRole('button', { name: '新增明细', exact: true }).click()
      const row = drawer.locator('.el-table__body-wrapper tbody tr').first()
      await row.getByRole('combobox', { name: '往来单位', exact: true }).click()
      await page
        .getByRole('option', { name: `示例供应商${index} · SUP-${index}`, exact: true })
        .click()
      const amount = row.getByRole('spinbutton', {
        name: kind === 'application' ? '申请金额' : '实付金额',
        exact: true
      })
      await amount.fill(`${index * 100}`)
      await amount.press('Tab')
      if (index === 2) await drawer.screenshot({ path: info.outputPath('create-filled.png') })
      await page.keyboard.press('Alt+Shift+4')
      await save.click()
      await expect(
        page.getByText('操作范围或权限已变化，请重新打开付款单据', { exact: true })
      ).toBeVisible()
      expect(attempts).toHaveLength(before)
      await page.keyboard.press('Alt+Shift+5')
      await save.click()
      if (index === 1) {
        await expect(page.getByText('新增资料已变化，请核对后重试', { exact: true })).toBeVisible()
        fail = false
        await save.click()
      }
      await expect(drawer).not.toBeVisible()
      await expect(page.getByText(`QA-NEW-${index}`, { exact: true })).toBeVisible()
      expect(attempts.at(-1)).toMatchObject({
        id: '',
        kind,
        tenant_id: tenant,
        organization_id: `department-${index}`,
        reason: `独立新增事由${index}`,
        lines: [{ supplier_id: `supplier-${index}`, amount: index * 100 }]
      })
    }
    expect(documents).toHaveLength(2)
    expect(attempts).toHaveLength(3)
  })
}
for (const kind of ['estimated', 'financial', 'application', 'payment', 'writeoff'] as const) {
  test(`${kind} 手动刷新只旋转原图标并保留列表`, async ({ page }, info) => {
    let release: (() => void) | undefined
    let requests = 0
    const deferred = new Promise<void>((resolve) => {
      release = resolve
    })
    const isWriteoff = kind === 'writeoff'
    const isPurchase = kind === 'estimated' || kind === 'financial'
    const endpoint = isWriteoff
      ? 'fms_payable_writeoff_workspace_secure'
      : isPurchase
        ? 'fms_purchase_payable_list_secure'
        : 'fms_payable_settlement_list_secure'
    const documents = [1, 2].map((index) => ({
      ...makeDocument(index, kind),
      supplier_name: `示例供应商${index}`,
      total_amount: index * 100,
      tax_amount: 0,
      source_type: 'manual'
    }))
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === endpoint) {
        requests += 1
        if (requests === 2) await deferred
        if (isWriteoff && requests === 3)
          return route.fulfill({
            status: 503,
            json: { code: 'P0001', message: '核销资料暂不可用，请重试' }
          })
        return route.fulfill({
          json: isWriteoff
            ? {
                primary: [makeWriteoffCandidate(1, 'AP'), makeWriteoffCandidate(2, 'AP')],
                secondary: [makeWriteoffCandidate(1, 'PAY'), makeWriteoffCandidate(2, 'PAY')],
                history: [],
                schemes: makeWriteoffSchemes()
              }
            : { data: documents, total: 2 }
        })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=${kind}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    })
    const rows = page.locator('.el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(isWriteoff ? 4 : 2)
    await expect(page.locator('.el-skeleton:visible')).toHaveCount(0, { timeout: 120000 })
    if (!isWriteoff)
      await page
        .getByRole('switch', { name: '显示表格右侧工具栏', exact: true })
        .locator('..')
        .click()
    const refresh = page.getByRole('button', {
      name: isWriteoff ? '刷新' : '刷新表格',
      exact: true
    })
    await refresh.click()
    try {
      await expect(refresh).toHaveAttribute('aria-busy', 'true')
      await expect(refresh.locator('svg')).toHaveCount(1)
      await expect(rows).toHaveCount(isWriteoff ? 4 : 2)
      await expect(
        page.locator(
          '.el-skeleton:visible, .el-loading-spinner:visible, .art-overlay-loading:visible'
        )
      ).toHaveCount(0)
      await expect(page.getByRole('button', { name: '查询', exact: true })).not.toHaveClass(
        /is-loading/
      )
      await captureBusinessEvidence(page, {
        path: info.outputPath(`${kind}-refresh.png`),
        fullPage: true
      })
    } finally {
      release?.()
    }
    await expect(refresh).not.toHaveAttribute('aria-busy', 'true')
    await expect(rows).toHaveCount(isWriteoff ? 4 : 2)
    expect(requests).toBe(2)
    if (!isWriteoff) await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
    for (const label of isWriteoff
      ? ['核销', '按方案自动核销']
      : ['提交', '审核', '删除', '打印']) {
      await expect(
        page.getByRole('button', { name: label, exact: true }).locator('svg')
      ).toHaveCount(1)
    }
    if (isWriteoff) {
      await refresh.click()
      await expect(
        page.getByRole('alert').getByText('核销资料加载失败，请重新加载', { exact: true })
      ).toBeVisible()
      await expect(rows).toHaveCount(4)
      await expect(page.getByRole('button', { name: '按方案自动核销', exact: true })).toBeDisabled()
      await page.getByRole('alert').getByRole('button', { name: '重新加载', exact: true }).click()
      await expect(page.getByRole('button', { name: '按方案自动核销', exact: true })).toBeEnabled()
      await expect(rows).toHaveCount(4)
    }
  })
}
for (const kind of ['application', 'payment'] as const) {
  test(`${kind} 单据类型筛选保留停用类型并正确重置`, async ({ page }, info) => {
    const documents = [
      makeDocument(1, kind),
      { ...makeDocument(2, kind), document_type_id: 'type-2', document_type_name: '其他付款' }
    ]
    let queriedType = ''
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const request: { p_query?: { id?: string; document_type_id?: string } } =
        route.request().postDataJSON() || {}
      if (name === 'fms_payable_settlement_type_options_secure')
        return route.fulfill({
          json: [
            { id: 'type-1', code: 'PURCHASE', name: '采购付款', enabled: true },
            { id: 'type-2', code: 'OTHER', name: '其他付款', enabled: false }
          ]
        })
      if (name === 'fms_payable_settlement_list_secure') {
        queriedType = request.p_query?.document_type_id || ''
        const data = documents.filter((row) => !queriedType || row.document_type_id === queriedType)
        return route.fulfill({ json: { data, total: data.length } })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=${kind}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    })
    const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled({
      timeout: 60000
    })
    await expect(page.getByRole('combobox', { name: '单据类型', exact: true })).toBeVisible({
      timeout: 60000
    })
    await page.getByRole('combobox', { name: '单据类型', exact: true }).press('Enter')
    await page.getByRole('option', { name: '其他付款（已停用）', exact: true }).click()
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(rows).toHaveCount(1)
    expect(queriedType).toBe('type-2')
    await expect(rows.first()).toContainText(documents[1].document_no)
    await captureBusinessEvidence(page, {
      path: info.outputPath(`${kind}-type-filter.png`),
      fullPage: true
    })
    await page.getByRole('button', { name: '重置', exact: true }).click()
    await expect(rows).toHaveCount(2)
    expect(queriedType).toBe('')
  })
}
async function focusCheck(page: Page, title: string) {
  const heading = page.getByRole('heading', { name: title, exact: true })
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(heading).not.toBeVisible()
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(heading).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await page.keyboard.press('Escape')
  await expect(heading).toBeVisible()
}
for (const theme of ['light', 'dark'] as const) {
  test(`payment ${theme} 两张应付来源付款仅参选同账套账号`, async ({ page }, info) => {
    let documents = [makeDocument(1, 'payment'), makeDocument(2, 'payment')].map((document) => ({
      ...document,
      lines: document.lines.map((line, index) => ({
        ...line,
        payable_id: `ap-${index + 1}`,
        fund_account_id: 'fund-2'
      }))
    }))
    const savedIds: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const request: { p_query?: { id?: string }; p_document?: (typeof documents)[number] } =
        route.request().postDataJSON() || {}
      if (name === 'fms_payable_settlement_type_options_secure') return route.fulfill({ json: [] })
      if (name === 'fms_payable_settlement_list_secure') {
        const data = documents.filter(
          (row) => !request.p_query?.id || row.id === request.p_query.id
        )
        return route.fulfill({ json: { data, total: data.length } })
      }
      if (name === 'fms_payable_settlement_options_secure')
        return route.fulfill({
          json: {
            ...optionsFor('payment'),
            fund: [1, 2].map((index) => ({
              ...optionData.fund[0],
              id: `fund-${index}`,
              code: `BANK-${index}`,
              name: '同名付款账户',
              account_set_id: `book-${index}`,
              account_set_name: index === 1 ? '其他账套' : '验收账套'
            })),
            payable: [1, 2].map((index) => ({
              id: `ap-${index}`,
              code: `AP-${index}`,
              name: `示例供应商${index}`,
              account_set_id: 'book-2',
              supplier_id: `supplier-${index}`,
              amount: index * 100
            }))
          }
        })
      if (name === 'fms_save_payable_settlement_secure' && request.p_document) {
        const record = request.p_document
        expect(record.lines.every((line) => line.fund_account_id === 'fund-2')).toBe(true)
        savedIds.push(record.id)
        documents = documents.map((row) => (row.id === record.id ? record : row))
        return route.fulfill({ json: record })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=payment&theme=${theme}&box=${theme === 'dark' ? 'shadow-mode' : 'border-mode'}`,
      { waitUntil: 'domcontentloaded', timeout: 120000 }
    )
    const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(2)
    for (const index of [0, 1]) {
      await rows.nth(index).getByRole('button', { name: '编辑', exact: true }).click()
      const drawer = page.getByRole('dialog')
      await drawer.getByRole('combobox', { name: '付款账号', exact: true }).first().press('Enter')
      const option = page.getByRole('option', {
        name: '同名付款账户 · BANK-2 · 验收账套',
        exact: true
      })
      await expect(option).toBeVisible()
      await expect(page.getByRole('option', { name: /其他账套/ })).toHaveCount(0)
      await captureBusinessEvidence(drawer, {
        path: info.outputPath(`payment-${theme}-book-${index + 1}.png`)
      })
      await option.click()
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      await expect(drawer).not.toBeVisible()
    }
    expect(savedIds).toEqual(['document-1', 'document-2'])
  })
}

test.beforeAll(async ({ browser, baseURL }) => {
  if (process.env.E2E_USE_DEV_SERVER === 'false') return
  test.setTimeout(360000)
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  try {
    const page = await context.newPage()
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      return route.fulfill({
        json:
          name === 'fms_payable_settlement_list_secure'
            ? { data: [], total: 0 }
            : name === 'fms_payable_writeoff_workspace_secure'
              ? { primary: [], secondary: [], history: [], schemes: [] }
              : []
      })
    })
    for (const [kind, title] of [
      ['application', '付款申请单'],
      ['payment', '付款单'],
      ['purpose', '付款用途'],
      ['method', '结算方式'],
      ['writeoff', '应付核销工作台'],
      ['purchase_contract', '采购合同'],
      ['purchase_order', '采购订单']
    ]) {
      await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=${kind}`, {
        waitUntil: 'domcontentloaded',
        timeout: 210000
      })
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
        timeout: 90000
      })
    }
  } finally {
    await context.close()
  }
})
for (const theme of ['light', 'dark']) {
  const box = theme === 'light' ? 'border-mode' : 'shadow-mode'
  for (const kind of ['application', 'payment']) {
    test(`${kind} ${theme} 两张多往来单据、编辑、提交审核及付款确认`, async ({ page }, info) => {
      let documents = [makeDocument(1, kind), makeDocument(2, kind)]
      let fail = false
      let saved = 0
      const savedIds: string[] = []
      const actionCalls: Array<{ ids: string[]; action: string }> = []
      const savedReasons: string[] = []
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1)
        const request: {
          p_query?: { id?: string }
          p_document?: ReturnType<typeof makeDocument>
          p_ids?: string[]
          p_action?: string
        } = route.request().postDataJSON() || {}
        if (name === 'fms_payable_settlement_list_secure')
          return fail
            ? route.fulfill({ status: 500, json: { code: 'XX000', message: 'internal error' } })
            : route.fulfill({
                json: {
                  data: request.p_query?.id
                    ? documents.filter((row) => row.id === request.p_query?.id)
                    : documents,
                  total: request.p_query?.id ? 1 : documents.length
                }
              })
        if (name === 'fms_payable_settlement_options_secure')
          return route.fulfill({ json: optionsFor(kind) })
        if (name === 'fms_save_payable_settlement_secure' && request.p_document) {
          saved++
          const record = request.p_document
          savedIds.push(record.id)
          savedReasons.push(record.reason)
          documents = documents.map((row) => (row.id === record.id ? record : row))
          return route.fulfill({ json: record })
        }
        if (name === 'fms_act_payable_settlement_secure') {
          actionCalls.push({ ids: request.p_ids ?? [], action: request.p_action ?? '' })
          documents = documents.map((row) =>
            request.p_ids?.includes(row.id)
              ? {
                  ...row,
                  status:
                    request.p_action === 'submit'
                      ? 'submitted'
                      : request.p_action === 'confirm'
                        ? 'confirmed'
                        : 'approved',
                  payment_status: request.p_action === 'confirm' ? 'full' : 'none'
                }
              : row
          )
          return route.fulfill({ json: documents })
        }
        return route.fulfill({ json: [] })
      })
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}&box=${box}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 }
      )
      const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
      await expect(rows).toHaveCount(2)
      await focusCheck(page, kind === 'application' ? '付款申请单' : '付款单')
      await captureBusinessEvidence(page, {
        path: info.outputPath(`${kind}-${theme}-list.png`),
        fullPage: true
      })
      for (const index of [0, 1]) {
        await rows.nth(index).getByRole('button', { name: '编辑', exact: true }).click()
        const drawer = page.getByRole('dialog')
        await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeVisible()
        if (kind === 'payment')
          await expect(drawer.getByText('主动付款', { exact: true })).toBeVisible()
        await expect(drawer.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
        await expect(
          drawer.getByRole('combobox', { name: '往来单位', exact: true }).first()
        ).toBeVisible()
        await captureBusinessEvidence(drawer, {
          path: info.outputPath(`${kind}-${theme}-editor-${index + 1}.png`)
        })
        await drawer.getByText('金额与付款说明', { exact: true }).scrollIntoViewIfNeeded()
        await drawer
          .getByRole('textbox', { name: kind === 'application' ? '请款事由' : '摘要', exact: true })
          .fill(`两单编辑复核${index + 1}`)
        await captureBusinessEvidence(drawer, {
          path: info.outputPath(`${kind}-${theme}-editor-total-${index + 1}.png`)
        })
        await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
        await drawer.getByRole('button', { name: '保存', exact: true }).click()
        await expect(drawer).not.toBeVisible()
        expect(saved).toBe(index + 1)
        await expect(rows.nth(index)).toContainText(`两单编辑复核${index + 1}`)
      }
      expect(savedIds).toEqual(['document-1', 'document-2'])
      expect(savedReasons).toEqual(['两单编辑复核1', '两单编辑复核2'])
      for (const action of ['提交', '审核']) {
        await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
        await page.getByRole('button', { name: action, exact: true }).click()
        await expect(rows.first()).toContainText(action === '提交' ? '已提交' : '已审核')
        await expect(rows.nth(1)).toContainText(action === '提交' ? '已提交' : '已审核')
      }
      if (kind === 'payment') {
        await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
        await page.getByRole('button', { name: '确认付款', exact: true }).click()
        await page.getByRole('menuitem', { name: '确认付款', exact: true }).click()
        await page.getByRole('button', { name: '确认登记', exact: true }).click()
        await expect(rows.first()).toContainText('已确认付款')
        await expect(rows.nth(1)).toContainText('已确认付款')
      }
      expect(actionCalls).toEqual(
        (kind === 'payment' ? ['submit', 'approve', 'confirm'] : ['submit', 'approve']).map(
          (action) => ({ ids: ['document-1', 'document-2'], action })
        )
      )
      fail = true
      await page.getByRole('button', { name: '查询', exact: true }).click()
      await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
      fail = false
      await page
        .getByRole('button', { name: /重试|重新加载/ })
        .first()
        .click()
      await expect(rows).toHaveCount(2)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      expect(errors).toEqual([])
    })
  }
  for (const kind of ['purpose', 'method']) {
    test(`${kind} ${theme} 两条配置、新增与错误重试`, async ({ page }, info) => {
      const records = [1, 2].map((index) => ({
        id: `reference-${index}`,
        tenant_id: tenant,
        code: `CFG-${index}`,
        name: `${kind === 'purpose' ? '采购用途' : '结算方式'}${index}`,
        enabled: true,
        business_type: 'purchase',
        payable_writeoff: true,
        receivable_writeoff: false,
        category: 'remittance',
        cash_method: 'bank_transfer',
        description: '示例配置'
      }))
      let failSave = true
      await page.route('**/rest/v1/**', (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1)
        if (name === 'fms_payable_reference_list_secure') return route.fulfill({ json: records })
        if (name === 'fms_save_payable_reference_secure')
          return failSave
            ? route.fulfill({
                status: 400,
                json: { code: '23514', message: '配置暂不可用，请核对后重试' }
              })
            : route.fulfill({ json: 'new-reference' })
        return route.fulfill({ json: [] })
      })
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}&box=${box}`,
        { waitUntil: 'domcontentloaded', timeout: 120000 }
      )
      await expect(page.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
      await focusCheck(page, kind === 'purpose' ? '付款用途' : '结算方式')
      await captureBusinessEvidence(page, {
        path: info.outputPath(`${kind}-${theme}-list.png`),
        fullPage: true
      })
      await page.getByRole('button', { name: '新增', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('textbox', { name: /编码$/ }).fill('NEW-CFG')
      await dialog.getByRole('textbox', { name: /^\*?\s*名称$/ }).fill('新增示例配置')
      await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
      await expect(dialog).toBeVisible()
      await expect(page.getByText('配置暂不可用，请核对后重试', { exact: true })).toBeVisible()
      failSave = false
      await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
      await expect(dialog).not.toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
    })
  }
  test(`writeoff ${theme} 双方各两条、核销方案、核销记录与核销单`, async ({ page }, info) => {
    let schemes = makeWriteoffSchemes()
    let savedRules: ReturnType<typeof makeWriteoffSchemes>[number]['rules'] = []
    const history = [1, 2].map((index) => ({
      id: `history-${index}`,
      tenant_id: tenant,
      supplier_id: `supplier-${index}`,
      record_no: `APHX-${index}`,
      document_no: `APHXD-${index}`,
      supplier_name: `示例供应商${index}`,
      payable_no: `AP-${index}`,
      payment_no: `PAY-${index}`,
      amount: index * 10,
      payment_amount: index * 9,
      cash_discount_amount: index,
      match_snapshot: {
        scheme_code: `SCHEME-${index}`,
        scheme_name: `核销时方案${index}`,
        rules: makeWriteoffSchemes()[0].rules
      },
      writeoff_date: '2026-10-21',
      status: 'active',
      needs_voucher: true
    }))
    let written = false
    let called = 0
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_writeoff_workspace_secure')
        return route.fulfill({
          json: {
            primary: written
              ? []
              : [makeWriteoffCandidate(1, 'AP'), makeWriteoffCandidate(2, 'AP')],
            secondary: written
              ? []
              : [makeWriteoffCandidate(1, 'PAY'), makeWriteoffCandidate(2, 'PAY')],
            history,
            schemes
          }
        })
      if (name === 'fms_payable_writeoff_secure') {
        called++
        written = true
        return route.fulfill({ json: ['new-writeoff'] })
      }
      if (name === 'fms_save_payable_reference_secure') {
        const request: { p_record: (typeof schemes)[number] } = route.request().postDataJSON()
        savedRules = request.p_record.rules
        schemes = schemes.map((row) => (row.id === request.p_record.id ? request.p_record : row))
        return route.fulfill({ json: request.p_record.id })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&theme=${theme}&box=${box}`,
      { waitUntil: 'domcontentloaded', timeout: 120000 }
    )
    await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible()
    const tables = page
      .locator('.el-table')
      .filter({ has: page.locator('.el-table__header-wrapper .el-checkbox') })
    await expect(tables).toHaveCount(2)
    for (const table of await tables.all())
      await expect(table.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
    await expect(page.getByRole('combobox', { name: '核销方案', exact: true })).toBeVisible({
      timeout: 120000
    })
    await expect(page.getByRole('combobox', { name: '结算组织', exact: true })).toBeVisible()
    await captureBusinessEvidence(page, {
      path: info.outputPath(`writeoff-${theme}.png`),
      fullPage: true
    })
    await page.getByRole('button', { name: '核销方案', exact: true }).click()
    await expect(page.getByRole('dialog').locator('.el-table__body-wrapper tbody tr')).toHaveCount(
      2
    )
    await page
      .getByRole('dialog', { name: '应付核销方案', exact: true })
      .getByRole('button', { name: '编辑方案', exact: true })
      .first()
      .click()
    const ruleDialog = page.getByRole('dialog', { name: '编辑核销方案', exact: true })
    const ruleRows = ruleDialog.locator('.el-table__body-wrapper tbody tr')
    await expect(ruleRows).toHaveCount(2)
    await ruleRows.nth(1).getByRole('button', { name: '移除匹配规则', exact: true }).click()
    await page.getByRole('button', { name: '删除', exact: true }).click()
    await expect(ruleRows).toHaveCount(1)
    await ruleDialog.getByRole('button', { name: '新增规则', exact: true }).click()
    await expect(ruleRows).toHaveCount(2)
    await ruleRows
      .first()
      .getByRole('combobox', { name: '主方单据字段', exact: true })
      .press('Enter')
    await page.getByRole('option', { name: '单据编号', exact: true }).click()
    await ruleRows
      .first()
      .getByRole('combobox', { name: '辅方单据字段', exact: true })
      .press('Enter')
    await page.getByRole('option', { name: '源单据号', exact: true }).click()
    await ruleRows.first().getByRole('combobox', { name: '匹配关系', exact: true }).press('Enter')
    await page.getByRole('option', { name: '开头为', exact: true }).click()
    for (const name of ['主方单据字段', '辅方单据字段']) {
      await ruleRows.nth(1).getByRole('combobox', { name, exact: true }).press('Enter')
      await page.getByRole('option', { name: '币种', exact: true }).click()
    }
    await ruleRows.nth(1).locator('.el-switch').click()
    await expect(
      ruleRows.nth(1).getByRole('switch', { name: '为空时匹配', exact: true })
    ).toBeChecked()
    await captureBusinessEvidence(ruleDialog, {
      path: info.outputPath(`scheme-${theme}-editor.png`)
    })
    await ruleDialog.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(ruleDialog).not.toBeVisible()
    expect(savedRules).toHaveLength(2)
    expect(savedRules[0]).toMatchObject({
      primary_field: 'document_no',
      secondary_field: 'source_document_no',
      operator: 'starts_with'
    })
    expect(savedRules[1].empty_matches).toBe(true)
    await page.keyboard.press('Escape')
    for (const table of await tables.all())
      await table.locator('.el-table__header-wrapper .el-checkbox').first().click()
    await page.getByRole('button', { name: '核销', exact: true }).click()
    await page.getByRole('button', { name: '执行核销', exact: true }).click()
    await expect(page.getByText('应付付款已核销', { exact: true })).toBeVisible()
    expect(called).toBe(1)
    await page.getByRole('tab', { name: '核销单（2）', exact: true }).click()
    await expect(page.getByRole('button', { name: 'APHXD-1', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'APHXD-1', exact: true }).click()
    await expect(page.getByRole('dialog').getByText('AP-1', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog').getByText('¥9.00', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog').getByText('¥1.00', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog').getByText('匹配依据', { exact: true })).toBeVisible()
    await captureBusinessEvidence(page.getByRole('dialog'), {
      path: info.outputPath(`writeoff-${theme}-discount.png`)
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
  test(`writeoff ${theme} 自动核销预览、余额变化阻断与重新确认`, async ({ page }, info) => {
    const schemes = makeWriteoffSchemes()
    let previews = 0
    let executions = 0
    let executed = false
    let token = ''
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const items = [1, 2].map((index) => ({
      payable_id: `AP-${index}`,
      payment_line_id: `PAY-${index}`,
      payable_no: `AP-${index}`,
      payment_no: `PAY-${index}`,
      supplier_name: `示例供应商${index}`,
      payment_supplier_name: `示例供应商${index}`,
      amount: index * 100,
      needs_voucher: true
    }))
    await page.route('**/rest/v1/**', (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_writeoff_workspace_secure')
        return route.fulfill({
          json: {
            primary: executed
              ? []
              : [makeWriteoffCandidate(1, 'AP'), makeWriteoffCandidate(2, 'AP')],
            secondary: executed
              ? []
              : [makeWriteoffCandidate(1, 'PAY'), makeWriteoffCandidate(2, 'PAY')],
            history: [],
            schemes
          }
        })
      if (name === 'fms_auto_payable_writeoff_secure') {
        const request: {
          p_scheme_id: string
          p_execute: boolean
          p_plan_token?: string
          p_query: { supplier_id?: string }
        } = route.request().postDataJSON()
        expect(request.p_scheme_id).toBe('scheme-2')
        expect(request.p_query.supplier_id).toBe('supplier-1')
        if (request.p_execute) {
          executions++
          expect(request.p_plan_token).toBe(token)
          if (executions === 1)
            return route.fulfill({
              status: 409,
              json: { code: '40001', message: '余额或核销方案已变化，请重新预览后再确认' }
            })
          executed = true
        } else {
          previews++
          if (previews === 1)
            return route.fulfill({
              status: 503,
              json: { code: 'P0001', message: '方案暂不可用，请稍后重试' }
            })
          token = `plan-${previews}`
        }
        return route.fulfill({
          json: {
            items,
            total_amount: 300,
            record_count: 2,
            plan_token: token,
            record_ids: executed ? ['record-1', 'record-2'] : [],
            executed,
            scheme_name: schemes[1].name,
            message: executed
              ? '已按方案完成 2 笔核销，未发起银行付款。'
              : '按业务日期、单据编号和行号顺序分配；确认时重新校验本清单。'
          }
        })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&theme=${theme}&box=${box}`,
      { waitUntil: 'domcontentloaded', timeout: 120000 }
    )
    await expect(page.getByRole('combobox', { name: '核销方案', exact: true })).toBeVisible({
      timeout: 120000
    })
    await page.getByRole('combobox', { name: '核销方案', exact: true }).press('Enter')
    await page.getByRole('option', { name: schemes[1].name, exact: true }).click()
    await page.locator('.el-tree-node__content').filter({ hasText: '示例供应商1' }).click()
    await page.getByRole('button', { name: '按方案自动核销', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '按方案自动核销', exact: true })
    await expect(
      dialog.getByText('匹配清单加载失败，请重新预览；未执行任何核销。', { exact: true })
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: '确认自动核销', exact: true })).toBeDisabled()
    await dialog.getByRole('button', { name: '重新预览', exact: true }).click()
    await expect(dialog.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
    await captureBusinessEvidence(dialog, {
      path: info.outputPath(`automatic-${theme}-preview.png`)
    })
    await dialog.getByRole('button', { name: '确认自动核销', exact: true }).click()
    await expect(
      dialog.getByText('核销结果未确认，请重新预览，并核对最新余额与核销记录。', { exact: true })
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: '确认自动核销', exact: true })).toBeDisabled()
    await captureBusinessEvidence(dialog, { path: info.outputPath(`automatic-${theme}-stale.png`) })
    await dialog.getByRole('button', { name: '重新预览', exact: true }).click()
    await expect(dialog.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
    await dialog.getByRole('button', { name: '确认自动核销', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(executions).toBe(2)
    expect(executed).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
  })
}
for (const kind of ['purchase_contract', 'purchase_order']) {
  test(`${kind} 两张采购来源下推预付款申请`, async ({ page }, info) => {
    const sources = [1, 2].map((index) => ({
      id: `source-${index}`,
      tenant_id: tenant,
      kind,
      document_no: `${kind === 'purchase_contract' ? 'CGHT' : 'CGDD'}-${index}`,
      document_date: '2026-10-22',
      status: kind === 'purchase_contract' ? 'effective' : 'approved',
      supplier_id: 'supplier-1',
      project_id: null,
      total_amount: 100,
      subtotal: 100,
      tax_amount: 0,
      details: {},
      payment_plans: [],
      delivery_plans: [],
      clauses: [],
      lines: [
        {
          line_id: `source-line-${index}`,
          line_no: 10,
          material_id: 'material-1',
          material_code: 'MAT-1',
          material_description: '示例采购物料',
          unit: '件',
          quantity: 1,
          unit_price: 100,
          tax_rate: 0,
          discount_rate: 0,
          gift: false
        }
      ],
      remark: ''
    }))
    let pushed = 0
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1)
      if (name === 'scm_purchase_document')
        return route.fulfill({ json: sources, headers: { 'content-range': '0-1/2' } })
      if (name === 'scm_purchase_line_progress_secure')
        return route.fulfill({
          json: sources.map((source) => ({
            document_id: source.id,
            line_id: source.lines[0].line_id,
            delivered_quantity: 0,
            received_quantity: 0,
            returned_quantity: 0
          }))
        })
      if (name === 'mdm_supplier' || name === 'scm_purchase_suppliers_secure')
        return route.fulfill({
          json: [
            {
              id: 'supplier-1',
              tenant_id: tenant,
              supplier_code: 'SUP-1',
              supplier_name: '示例供应商1'
            }
          ]
        })
      if (name === 'mdm_unit_of_measure')
        return route.fulfill({
          json: [{ id: 'unit-1', tenant_id: tenant, unit_code: 'EA', unit_name: '件' }]
        })
      if (name === 'fms_payable_settlement_options_secure')
        return route.fulfill({ json: optionsFor('application') })
      if (name === 'fms_push_payable_settlement_secure') {
        const request: { p_id: string; p_source: string; p_kind: string } = route
          .request()
          .postDataJSON()
        expect(request.p_source).toBe('purchase')
        expect(request.p_kind).toBe('application')
        expect(request.p_id).toBe('source-1')
        pushed++
        return route.fulfill({
          json: {
            ...makeDocument(1, 'application'),
            reason: '采购预付款申请',
            lines: [
              {
                ...makeLine(1),
                purchase_id: 'source-1',
                source_document_no: sources[0].document_no,
                purpose_id: 'purpose-2'
              }
            ]
          }
        })
      }
      return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
    })
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=${kind}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    })
    const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(2)
    await rows.first().locator('.el-checkbox').first().click()
    await page.getByRole('button', { name: '下推预付款申请', exact: true }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByRole('heading', { name: '编辑付款申请单', exact: true })).toBeVisible()
    await expect(drawer.getByRole('textbox', { name: '请款事由', exact: true })).toHaveValue(
      '采购预付款申请'
    )
    expect(pushed).toBe(1)
    await captureBusinessEvidence(drawer, { path: info.outputPath(`${kind}-prepayment.png`) })
    expect(errors).toEqual([])
  })
}
test('付款申请明细新增复制删除与多往来保存', async ({ page }, info) => {
  let savedLines: Array<{ supplier_id: string; amount: number }> = []
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'fms_payable_settlement_list_secure')
      return route.fulfill({
        json: { data: [makeDocument(1, 'application'), makeDocument(2, 'application')], total: 2 }
      })
    if (name === 'fms_payable_settlement_options_secure')
      return route.fulfill({ json: optionsFor('application') })
    if (name === 'fms_save_payable_settlement_secure') {
      const request: { p_document: { lines: typeof savedLines } } = route.request().postDataJSON()
      savedLines = request.p_document.lines
      return route.fulfill({
        json: { ...request.p_document, id: 'created-application', document_no: 'FKSQ-202610-003' }
      })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/purchase-payable.html?kind=application', {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  })
  await expect(page.locator('.art-table-query .el-table__body-wrapper tbody tr')).toHaveCount(2)
  await page.getByRole('button', { name: '新增', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '新增付款申请单', exact: true })
  await drawer.getByRole('button', { name: '新增明细', exact: true }).click()
  const rows = drawer.locator('.el-table__body-wrapper tbody tr')
  await rows.first().getByRole('combobox', { name: '往来单位', exact: true }).click()
  await page.getByRole('option', { name: '示例供应商1 · SUP-1', exact: true }).click()
  await rows.first().getByRole('spinbutton', { name: '申请金额', exact: true }).fill('100')
  await rows.first().getByRole('spinbutton', { name: '申请金额', exact: true }).press('Tab')
  await rows.first().getByRole('button', { name: '复制明细', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await rows.nth(1).getByRole('combobox', { name: '往来单位', exact: true }).click()
  await page.getByRole('option', { name: '示例供应商2 · SUP-2', exact: true }).click()
  await rows.first().getByRole('button', { name: '删除明细', exact: true }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await rows.first().getByRole('button', { name: '复制明细', exact: true }).click()
  await rows.nth(1).getByRole('combobox', { name: '往来单位', exact: true }).click()
  await page.getByRole('option', { name: '示例供应商1 · SUP-1', exact: true }).click()
  await expect(rows).toHaveCount(2)
  await captureBusinessEvidence(drawer, {
    path: info.outputPath('application-multiple-parties.png')
  })
  await drawer.getByRole('button', { name: '保存', exact: true }).click()
  await expect(drawer).not.toBeVisible()
  expect(savedLines.map((row) => row.supplier_id)).toEqual(['supplier-2', 'supplier-1'])
  expect(savedLines.every((row) => row.amount === 100)).toBe(true)
})
test('付款申请删除预检及并发引用拒绝后重新检查', async ({ page }) => {
  let documents = [makeDocument(1, 'application'), makeDocument(2, 'application')]
  let concurrentReference = false
  let deleteCalls = 0
  let checkCalls = 0
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const request: { p_query?: { id?: string }; p_ids?: string[]; p_action?: string } =
      route.request().postDataJSON() || {}
    if (name === 'fms_payable_settlement_list_secure')
      return route.fulfill({
        json: {
          data: request.p_query?.id
            ? documents.filter((row) => row.id === request.p_query?.id)
            : documents,
          total: documents.length
        }
      })
    if (name === 'fms_payable_settlement_delete_dependencies_secure') {
      checkCalls++
      return route.fulfill({
        json: concurrentReference
          ? [
              {
                resource_id: 'document-2',
                dependency_code: 'payment',
                record_id: 'linked-payment',
                target_id: 'linked-payment',
                record_no: 'FK-GUARD-001',
                record_summary: '并发生成的付款单',
                record_status: 'approved',
                created_at: '2026-10-22T00:00:00Z',
                cleanup_allowed: false
              }
            ]
          : []
      })
    }
    if (name === 'fms_act_payable_settlement_secure' && request.p_action === 'delete') {
      deleteCalls++
      if (request.p_ids?.includes('document-2')) {
        concurrentReference = true
        return route.fulfill({
          status: 400,
          json: { code: '23503', message: '付款申请已被关联，请重新检查' }
        })
      }
      documents = documents.filter((row) => !request.p_ids?.includes(row.id))
      return route.fulfill({ json: [] })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/purchase-payable.html?kind=application', {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  })
  const rows = page.locator('.art-table-query .el-table__body-wrapper tbody tr')
  await expect(rows).toHaveCount(2)
  await rows.first().locator('.el-checkbox').first().click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '删除', exact: true }).click()
  await expect(rows).toHaveCount(1)
  expect(deleteCalls).toBe(1)
  await rows.first().locator('.el-checkbox').first().click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('FK-GUARD-001', { exact: true })).toBeVisible()
  expect(deleteCalls).toBe(2)
  expect(checkCalls).toBeGreaterThanOrEqual(3)
  await expect(rows).toHaveCount(1)
})
