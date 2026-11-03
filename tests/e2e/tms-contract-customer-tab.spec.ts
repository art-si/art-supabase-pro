import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

test('客户页签复用运输合同列表、状态和复制操作', async ({ page }, testInfo) => {
  const customerId = '11111111-1111-4111-8111-111111111112'
  const tenantId = '11111111-1111-4111-8111-111111111111'
  const contract = {
    id: '22222222-2222-4222-8222-222222222222',
    tenantId,
    contractNo: 'HT-2026-001',
    contractName: '年度运输框架合同',
    contractStatus: 'approved',
    businessContractType: 'customer',
    contractCategory: 'annual_framework',
    transportMode: 'road',
    customerId,
    customer: { id: customerId, customerName: '测试客户' },
    billingMethod: 'by_weight',
    billingUnit: 'ton',
    signTime: '2026-10-01T00:00:00Z',
    handler: '测试经办人',
    effectiveDate: '2026-10-01',
    expiryDate: '2027-10-01',
    attachments: [],
    transportDetails: []
  }
  const requests: Array<Record<string, unknown>> = []
  const copyRequests: Array<Record<string, unknown>> = []
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const body = route.request().postDataJSON() as Record<string, unknown> | null
    if (name === 'tms_list_contracts_secure') {
      if (body) requests.push(body)
      return route.fulfill({ json: { records: [contract], total: 1, fieldAccess: {} } })
    }
    if (name === 'tms_get_contract_secure') return route.fulfill({ json: contract })
    if (name === 'tms_copy_contract_secure') {
      if (body) copyRequests.push(body)
      return route.fulfill({ json: '33333333-3333-4333-8333-333333333333' })
    }
    if (name === 'tms_list_customer_options_secure')
      return route.fulfill({ json: [contract.customer] })
    if (name === 'tms_list_carrier_options_secure') return route.fulfill({ json: [] })
    return route.fulfill({ json: [] })
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/tms-contract-customer-tab.html', {
    waitUntil: 'domcontentloaded',
    timeout: 90_000
  })
  await expect(page.getByText('年度运输框架合同')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('#contract-customer-tab .el-tag').getByText('生效中')).toBeVisible()
  await expect.poll(() => requests.at(-1)?.p_customer_id).toBe(customerId)
  await page.screenshot({
    path: testInfo.outputPath('contract-customer-tab.png'),
    animations: 'disabled'
  })
  await page.getByRole('button', { name: /更多/ }).first().click()
  await page.getByText('复制', { exact: true }).click()
  const copyDialog = page.getByRole('dialog').filter({ hasText: '复制合同' })
  await expect(copyDialog).toBeVisible()
  await copyDialog.getByRole('button', { name: '复制' }).click()
  await expect.poll(() => copyRequests.length).toBe(1)
  expect(copyRequests[0]).toEqual({ p_source_id: contract.id })
  expect(errors).toEqual([])
})

test('仅有复制权限时可复制已有合同，不能打开任意新增表单', async ({ page }) => {
  const contract = {
    id: '22222222-2222-4222-8222-222222222222',
    contractNo: 'HT-2026-001',
    contractName: '年度运输框架合同',
    contractStatus: 'approved',
    businessContractType: 'customer',
    customerId: '11111111-1111-4111-8111-111111111112',
    billingMethod: 'by_weight',
    signTime: '2026-10-01T00:00:00Z',
    handler: '测试经办人'
  }
  let copyPayload: Record<string, unknown> | null = null
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'tms_list_contracts_secure')
      return route.fulfill({ json: { records: [contract], total: 1, fieldAccess: {} } })
    if (name === 'tms_copy_contract_secure') {
      copyPayload = route.request().postDataJSON() as Record<string, unknown>
      return route.fulfill({ json: '33333333-3333-4333-8333-333333333333' })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/tms-contract-customer-tab.html?copyOnly=1', {
    waitUntil: 'domcontentloaded',
    timeout: 90_000
  })
  await expect(page.getByText('年度运输框架合同')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: /新增/ })).toHaveCount(0)
  await page.getByRole('button', { name: /更多/ }).first().click()
  await page.getByText('复制', { exact: true }).click()
  await page
    .getByRole('dialog')
    .filter({ hasText: '复制合同' })
    .getByRole('button', { name: '复制' })
    .click()
  await expect.poll(() => copyPayload).toEqual({ p_source_id: contract.id })
})

test('运输合同终止要求原因并刷新为已终止', async ({ page }) => {
  const contract = {
    id: '22222222-2222-4222-8222-222222222222',
    contractNo: 'HT-2026-001',
    contractName: '年度运输框架合同',
    contractStatus: 'approved',
    businessContractType: 'customer',
    customerId: '11111111-1111-4111-8111-111111111112',
    billingMethod: 'by_weight',
    signTime: '2026-10-01T00:00:00Z',
    handler: '测试经办人'
  }
  let terminatePayload: Record<string, unknown> | null = null
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'tms_list_contracts_secure')
      return route.fulfill({ json: { records: [contract], total: 1, fieldAccess: {} } })
    if (name === 'tms_terminate_contract_secure') {
      terminatePayload = route.request().postDataJSON() as Record<string, unknown>
      contract.contractStatus = 'terminated'
      return route.fulfill({ json: true })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/tms-contract-customer-tab.html', {
    waitUntil: 'domcontentloaded',
    timeout: 90_000
  })
  await expect(page.getByText('年度运输框架合同')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: /更多/ }).first().hover()
  const terminateAction = page.getByRole('menuitem', { name: '终止合同' })
  await expect(terminateAction).toBeVisible({ timeout: 5_000 })
  await terminateAction.click()
  const dialog = page.getByRole('dialog').filter({ hasText: '终止运输合同' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: '确认终止' }).click()
  await expect(dialog.getByText('请填写终止原因')).toBeVisible()
  await dialog.getByRole('textbox', { name: '终止原因' }).fill('双方协商提前终止')
  await dialog.getByRole('button', { name: '确认终止' }).click()
  await expect
    .poll(() => terminatePayload)
    .toEqual({ p_id: contract.id, p_reason: '双方协商提前终止' })
  await expect(page.locator('#contract-customer-tab .el-tag').getByText('已终止')).toBeVisible()
})

test('合同表单用标准参选控件展示承运商五列信息', async ({ page }) => {
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'tms_list_contracts_secure')
      return route.fulfill({ json: { records: [], total: 0, fieldAccess: {} } })
    if (name === 'tms_list_carrier_options_secure')
      return route.fulfill({
        json: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            carrierCode: 'CY-001',
            companyName: '测试承运公司',
            carrierTypes: ['enterprise'],
            dispatchChannels: ['offline'],
            parentUnitName: '华东运输集团'
          }
        ]
      })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/tms-contract-customer-tab.html', {
    waitUntil: 'domcontentloaded',
    timeout: 90_000
  })
  await expect(page.getByRole('button', { name: /新增/ }).first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: /新增/ }).first().click()
  const form = page.getByRole('dialog').filter({ hasText: '新增合同' })
  await expect(form).toBeVisible()
  await form.getByRole('textbox', { name: '承运商' }).click()
  const selector = page.getByRole('dialog').filter({ hasText: '选择承运商' })
  await expect(selector).toBeVisible()
  for (const label of ['承运商编码', '公司名称', '承运商类型', '调度渠道', '上级单位'])
    await expect(selector.getByRole('columnheader', { name: label })).toBeVisible()
  await expect(selector.getByText('测试承运公司')).toBeVisible()
})
