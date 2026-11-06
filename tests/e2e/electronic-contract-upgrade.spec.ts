import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(300_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const carrierId = '22222222-2222-4222-8222-222222222222'
const seedRecords = [
  {
    id: '33333333-3333-4333-8333-333333333331',
    tenant_id: tenantId,
    customer_id: null,
    contract_no: 'HT-202611-001',
    contract_name: '月度干线运输合同',
    party_a_company: '测试货主甲',
    party_a_representative: '甲方代表',
    party_a_subject: '测试货主甲',
    party_b_carrier_id: carrierId,
    party_b_company: '测试承运商乙',
    party_b_representative: '乙方代表',
    party_b_subject: '测试承运商乙',
    starts_on: '2026-08-10',
    ends_on: '2027-08-09',
    content_html: '<p>双方按月核对运单并支付应付款。</p>',
    attachments: [],
    settlement_cycle: 'monthly',
    cycle_start_day: 10,
    payment_term_days: 45,
    tax_rate: 0.09,
    approval_status: 'draft',
    status: 'pending_signed',
    party_a_signature_url: null,
    party_a_seal_url: null,
    party_b_signature_url: null,
    party_b_seal_url: null,
    party_a_signed_at: null,
    party_b_signed_at: null,
    create_by: '测试人员',
    create_time: '2026-11-01T08:00:00Z',
    update_time: '2026-11-01T08:00:00Z'
  },
  {
    id: '33333333-3333-4333-8333-333333333332',
    tenant_id: tenantId,
    customer_id: null,
    contract_no: 'HT-202611-002',
    contract_name: '季度城市配送合同',
    party_a_company: '测试货主丙',
    party_a_representative: '甲方代表',
    party_a_subject: '测试货主丙',
    party_b_carrier_id: carrierId,
    party_b_company: '测试承运商乙',
    party_b_representative: '乙方代表',
    party_b_subject: '测试承运商乙',
    starts_on: '2026-10-01',
    ends_on: '2027-09-30',
    content_html: '<p>季度结算。'.repeat(80) + '</p>',
    attachments: [],
    settlement_cycle: 'quarterly',
    cycle_start_day: null,
    payment_term_days: 30,
    tax_rate: 0.06,
    approval_status: 'approved',
    status: 'pending_signed',
    party_a_signature_url: null,
    party_a_seal_url: null,
    party_b_signature_url: null,
    party_b_seal_url: null,
    party_a_signed_at: null,
    party_b_signed_at: null,
    create_by: '测试人员',
    create_time: '2026-11-02T08:00:00Z',
    update_time: '2026-11-02T08:00:00Z'
  }
]

async function mockContracts(page: Page) {
  const records = structuredClone(seedRecords)
  let listFailure = false
  let emptyList = false
  let listRequests = 0
  let detailRequests = 0
  let failedRequests = 0
  let submitted = false
  const writes: Array<{ method: string; body: Record<string, unknown> }> = []
  const signatures: Record<string, unknown>[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'tms_electronic_contract') {
      if (request.method() === 'GET') {
        listRequests += 1
        if (listFailure) {
          failedRequests += 1
          return route.fulfill({ status: 503, json: { message: 'unavailable' } })
        }
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        if (id) detailRequests += 1
        const rows = id ? records.filter((row) => row.id === id) : emptyList ? [] : records
        return route.fulfill({
          status: id ? 200 : 206,
          headers: {
            'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}`,
            'range-unit': 'items',
            'access-control-expose-headers': 'content-range'
          },
          json: id ? (rows[0] ?? null) : rows
        })
      }
      if (request.method() === 'PATCH' || request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>
        writes.push({ method: request.method(), body })
        const row = request.method() === 'PATCH' ? records[0] : records[1]
        Object.assign(row, body)
        return route.fulfill({ json: [row], headers: { 'content-range': '0-0/1' } })
      }
    }
    if (endpoint === 'tms_list_carrier_options_secure')
      return route.fulfill({ json: [{ id: carrierId, company_name: '测试承运商乙' }] })
    if (endpoint === 'tms_list_customer_options_secure') return route.fulfill({ json: [] })
    if (endpoint === 'tms_submit_electronic_contract_secure') {
      records[0].approval_status = 'pending'
      submitted = true
      return route.fulfill({ json: records[0] })
    }
    if (endpoint === 'tms_sign_electronic_contract_secure') {
      const payload = request.postDataJSON() as {
        p_id: string
        p_signatures: Record<string, unknown>
      }
      const record = records.find((row) => row.id === payload.p_id)
      if (!record) return route.fulfill({ status: 404, json: { message: 'missing' } })
      signatures.push(payload.p_signatures)
      Object.assign(record, payload.p_signatures, {
        status: 'signed',
        party_a_signed_at: '2026-11-04T08:00:00Z',
        party_b_signed_at: '2026-11-04T08:00:00Z'
      })
      return route.fulfill({ json: record })
    }
    if (endpoint === 'sys_dictionary') return route.fulfill({ json: [] })
    return route.fulfill({ json: [] })
  })
  return {
    writes,
    signatures,
    listRequests: () => listRequests,
    detailRequests: () => detailRequests,
    failedRequests: () => failedRequests,
    wasSubmitted: () => submitted,
    failList: () => {
      listFailure = true
    },
    restoreList: () => {
      listFailure = false
    },
    setEmpty: (value: boolean) => {
      emptyList = value
    }
  }
}

async function openFixture(page: Page, limited = false, noView = false, embedded = false) {
  await page.goto(
    `/tests/e2e/fixtures/electronic-contract-upgrade.html${embedded ? '?embedded=1' : noView ? '?noView=1&deep=1' : limited ? '?limited=1' : ''}`,
    { waitUntil: 'domcontentloaded' }
  )
  await expect(page.locator('html[data-electronic-fixture-ready="true"]')).toHaveCount(1)
  const mock = await mockContracts(page)
  await page.evaluate(() => document.dispatchEvent(new Event('electronic-contract-fixture-start')))
  return mock
}

test('缺少查看权限时合同号不可打开全文，深链也不请求详情', async ({ page }) => {
  const mock = await openFixture(page, false, true)
  const row = page.locator('.el-table__row').filter({ hasText: '月度干线运输合同' })
  await expect(row).toBeVisible()
  await expect(row.getByRole('link', { name: /HT-202611-001/ })).toHaveCount(0)
  await expect(row.getByRole('button', { name: '查看' })).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: /电子合同/ })).toHaveCount(0)
  expect(mock.detailRequests()).toBe(0)
})

test('其他业务的 recordId 不触发缓存电子合同弹窗', async ({ page }) => {
  const mock = await openFixture(page)
  await expect(page.getByText('月度干线运输合同')).toBeVisible()
  await page.evaluate(() => document.dispatchEvent(new Event('electronic-contract-fixture-leave')))
  await expect(page.locator('html[data-electronic-fixture-left="true"]')).toHaveCount(1)
  await expect(page.getByRole('dialog', { name: /电子合同/ })).toHaveCount(0)
  expect(mock.detailRequests()).toBe(0)
})

test('电子合同本页合同号仍可打开详情', async ({ page }) => {
  const mock = await openFixture(page)
  await page.getByRole('link', { name: 'HT-202611-001' }).click()
  await expect(page.getByRole('dialog', { name: '电子合同 · HT-202611-001' })).toBeVisible()
  expect(mock.detailRequests()).toBe(1)
})

test('客户内嵌电子合同在当前页打开详情且不改客户路由', async ({ page }) => {
  const mock = await openFixture(page, false, false, true)
  await expect(page.locator('html')).toHaveAttribute('data-electronic-route-query', '{}')
  await page.getByRole('button', { name: 'HT-202611-001' }).click()
  await expect(page.getByRole('dialog', { name: '电子合同 · HT-202611-001' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-electronic-route-query', '{}')
  expect(mock.detailRequests()).toBe(1)
})

test('两条电子合同可预览、编辑结算约定并提交审批', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const mock = await openFixture(page)
  await expect(page.getByText('月度干线运输合同')).toBeVisible()
  await expect(page.getByText('季度城市配送合同')).toBeVisible()

  const firstRow = page.locator('.el-table__row').filter({ hasText: '月度干线运输合同' })
  await firstRow.getByRole('button', { name: '预览合同' }).click()
  await expect(page.getByText('双方按月核对运单并支付应付款。')).toBeVisible()
  await expect(page.getByText(/账期 45 天/)).toBeVisible()
  await page.keyboard.press('Escape')
  const secondRow = page.locator('.el-table__row').filter({ hasText: '季度城市配送合同' })
  await secondRow.getByRole('button', { name: '预览合同' }).click()
  await expect(page.getByText(/按季度 · 账期 30 天 · 税率 6%/)).toBeVisible()
  await page.keyboard.press('Escape')

  await firstRow.getByRole('button', { name: '编辑' }).click()
  await expect(page.getByText('编辑电子合同')).toBeVisible()
  await expect(page.getByText('11 月 15 日')).toBeVisible()
  await expect(page.getByText('按月', { exact: true })).toBeVisible()
  await page.screenshot({ path: '.artifacts/electronic-contract-edit.png', fullPage: true })
  await page
    .locator('.el-form-item')
    .filter({ hasText: '账期（天）' })
    .getByRole('spinbutton')
    .fill('60')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => mock.writes.length).toBe(1)
  expect(mock.writes[0].body).toMatchObject({
    settlement_cycle: 'monthly',
    cycle_start_day: 10,
    payment_term_days: 60,
    tax_rate: 0.09
  })
  await firstRow.getByRole('button', { name: '更多操作' }).hover()
  await page.getByText('提交审批', { exact: true }).click()
  await expect.poll(mock.wasSubmitted).toBe(true)
  await expect(firstRow.getByRole('button', { name: '编辑' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('已通过审批的第二条合同可完成手写签署并预览签署信息', async ({ page }) => {
  const mock = await openFixture(page)
  const secondRow = page.locator('.el-table__row').filter({ hasText: '季度城市配送合同' })
  await expect(secondRow).toBeVisible()
  await expect(secondRow.getByRole('button', { name: '编辑' })).toHaveCount(0)
  await secondRow.getByRole('button', { name: '更多操作' }).hover()
  await page.getByText('签署合同', { exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('canvas')).toHaveCount(2)
  await page.route('**/rest/v1/sys_attachment*', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: null })
    return route.fulfill({
      json: { id: 'contract-signature-resource', ...route.request().postDataJSON() }
    })
  })
  await page.route('**/storage/v1/object/attachments/**', (route) =>
    route.fulfill({ json: { Key: 'contract-signature' } })
  )
  await page.route('**/storage/v1/object/public/attachments/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="90"><path d="M10 66 Q45 12 60 62 T115 39 T177 55 M30 75 L200 18" fill="none" stroke="#25334a" stroke-width="3" stroke-linecap="round"/></svg>'
    })
  )
  for (const canvas of await dialog.locator('canvas').all()) {
    await canvas.scrollIntoViewIfNeeded()
    const box = await canvas.boundingBox()
    if (!box) throw new Error('签名画布不可见')
    await page.mouse.move(box.x + 30, box.y + 35)
    await page.mouse.down()
    await page.mouse.move(box.x + 70, box.y + 100, { steps: 8 })
    await page.mouse.move(box.x + 130, box.y + 40, { steps: 8 })
    await page.mouse.up()
  }
  await dialog.locator('label.el-checkbox').click()
  await dialog.getByRole('button', { name: '确认签署', exact: true }).click()
  await expect.poll(() => mock.signatures.length).toBe(1)
  expect(mock.signatures[0].party_a_signature_url).toContain(`/attachments/${tenantId}/`)
  expect(mock.signatures[0].party_b_signature_url).toContain(`/attachments/${tenantId}/`)
  await expect(dialog).toBeHidden()
  await secondRow.getByRole('button', { name: '预览合同' }).click()
  await expect(page.getByText('签署日期：2026-11-04', { exact: true })).toHaveCount(2)
  await expect(page.getByAltText('甲方手写签名')).toBeVisible()
  await expect(page.getByAltText('乙方手写签名')).toBeVisible()
  for (const label of ['甲方手写签名', '乙方手写签名']) {
    await expect
      .poll(() =>
        page.getByAltText(label).evaluate((element: HTMLImageElement) => element.naturalWidth)
      )
      .toBeGreaterThan(0)
  }
  await page.getByText('签署日期：2026-11-04', { exact: true }).last().scrollIntoViewIfNeeded()
  await dialog.screenshot({ path: '.artifacts/electronic-contract-signed-footer.png' })
})

test('仅查看权限隐藏写入动作，窄屏长内容无页面横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await openFixture(page, true)
  await expect(page.getByText('季度城市配送合同')).toBeVisible()
  await expect(page.getByRole('button', { name: '创建合同' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '编辑' })).toHaveCount(0)
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    inner: innerWidth
  }))
  expect(width.scroll).toBeLessThanOrEqual(width.inner)
  await page.screenshot({ path: '.artifacts/electronic-contract-limited-1024.png', fullPage: true })
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await expect(page.locator('.art-table-query')).toHaveClass(/is-focus-mode/)
  await expect(page.getByText('月度干线运输合同')).toBeVisible()
  await expect(page.getByText('电子合同', { exact: true })).toBeHidden()
  await page.screenshot({ path: '.artifacts/electronic-contract-focus-1024.png', fullPage: true })
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(page.locator('.art-table-query')).not.toHaveClass(/is-focus-mode/)
  await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
  await page.keyboard.press('Escape')
  await expect(page.locator('.art-table-query')).not.toHaveClass(/is-focus-mode/)
})

test('列表错误与空数据均可反馈，重试后恢复合同', async ({ page }) => {
  const mock = await openFixture(page)
  await expect(page.getByText('月度干线运输合同')).toBeVisible()
  const initialRequests = mock.listRequests()
  await page.getByRole('textbox', { name: '合同号' }).fill('HT')
  mock.failList()
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect.poll(mock.listRequests).toBeGreaterThan(initialRequests)
  await expect.poll(mock.failedRequests).toBeGreaterThan(0)
  await expect(page.locator('.el-message--error')).toBeVisible()
  mock.restoreList()
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('月度干线运输合同')).toBeVisible()
  mock.setEmpty(true)
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('暂无电子合同')).toBeVisible()
  mock.setEmpty(false)
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('月度干线运输合同')).toBeVisible()
})
