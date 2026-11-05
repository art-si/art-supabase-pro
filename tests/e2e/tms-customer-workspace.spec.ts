import { expect, test, type Page } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
test.describe.configure({ timeout: 120_000 })

async function setFixtureTheme(page: Page, dark: boolean) {
  await page.evaluate(async (dark) => {
    const { useTheme }: typeof import('../../src/hooks/core/useTheme') = await import(
      new URL('/src/hooks/core/useTheme.ts', location.origin).href
    )
    const { SystemThemeEnum }: typeof import('../../src/enums/app-enum') = await import(
      new URL('/src/enums/app-enum.ts', location.origin).href
    )
    useTheme().switchThemeStyles(dark ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT)
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    )
  }, dark)
}

test('客户名称打开档案，子表独立编辑且关联页签锁定客户', async ({ page }, testInfo) => {
  test.slow()
  const customer = {
    id: '11111111-1111-4111-8111-111111111112',
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerCode: 'KH-TEST-01',
    customerName: '测试客户长名称运输有限公司',
    enabled: true,
    tags: [],
    fieldAccess: {
      contactPhone: 'edit',
      addressDetail: 'edit',
      taxNo: 'edit',
      bankAccount: 'edit'
    },
    isRecordOwner: true
  }
  const requests: Array<{ name: string; body: Record<string, unknown> }> = []
  let failContacts = false
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.pathname.split('/').at(-1) ?? ''
    const body = route.request().postDataJSON() as Record<string, unknown> | null
    if (body) requests.push({ name, body })
    let json: unknown = []
    if (name === 'tms_list_customers_secure')
      json = { records: [customer], total: 1, fieldAccess: customer.fieldAccess }
    else if (name === 'get_table_column_runtime') json = { enabled: false, profiles: [] }
    else if (name === 'tms_list_customer_contacts_secure') {
      if (failContacts)
        return route.fulfill({ status: 503, json: { message: '联系人读取失败，请重试' } })
      json = [
        {
          id: 'contact-1',
          customerId: customer.id,
          name: '测试联系人',
          mobile: '13800000001',
          isDefault: true
        }
      ]
    } else if (name === 'tms_list_customer_finances_secure')
      json = [
        {
          id: 'finance-1',
          customerId: customer.id,
          invoiceTitle: '测试开票主体',
          taxNo: 'TEST-TAX-01',
          bankName: '测试银行',
          bankAccount: '1234567890',
          bankBranch: '测试支行',
          isDefaultInvoice: true,
          fieldAccess: customer.fieldAccess
        }
      ]
    else if (name === 'tms_list_dispatch_workbench_secure')
      json = {
        records: [
          {
            id: 'waybill-fixture',
            waybillNo: 'YS-TEST-01',
            orderNo: 'YD-TEST-01',
            originStation: '测试始发站',
            destinationStation: '测试目的站',
            waybillStatus: 'loaded'
          }
        ],
        total: 1,
        fieldAccess: {}
      }
    else if (
      name === 'tms_list_contracts_secure' ||
      name === 'tms_list_customer_prices_secure' ||
      name === 'tms_list_customer_statements_secure'
    )
      json = { records: [], total: 0, fieldAccess: {} }
    return route.fulfill({ json })
  })
  await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByText(customer.customerName, { exact: true }).first().click()
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('tab', { name: '客户识别' }) })
  await expect(dialog).toBeVisible()
  for (const name of [
    '联系人',
    '财务信息',
    '运输合同',
    '客户协议价',
    '运单列表',
    '电子合同',
    '运输协议',
    '客户对账'
  ])
    await expect(dialog.getByRole('tab', { name, exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: '联系人', exact: true }).click()
  await expect(dialog.getByText('测试联系人', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('columnheader', { name: '别名' })).toBeVisible()
  await dialog.getByRole('button', { name: '新增联系人', exact: true }).click()
  const contactEditor = page
    .getByRole('dialog')
    .filter({ has: page.getByText('新增联系人', { exact: true }) })
    .last()
  await expect(contactEditor.getByText('固定电话', { exact: true })).toBeVisible()
  await expect(contactEditor.getByText('角色', { exact: true })).toBeVisible()
  await contactEditor.getByRole('button', { name: '取消', exact: true }).click()
  await dialog.getByRole('tab', { name: '财务信息', exact: true }).click()
  await expect(dialog.getByText('测试开票主体', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('columnheader', { name: '默认开票账户' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('customer-finance.png'), fullPage: true })
  const financeCard = dialog.locator('[data-art-form-tab="financeSection"] .art-table-card')
  const standardCardHeight = await financeCard.evaluate(
    (element) => element.getBoundingClientRect().height
  )
  await dialog.getByRole('button', { name: '全屏', exact: true }).click()
  await expect(dialog.locator('.tms-customer-dialog')).toHaveClass(/is-fullscreen/)
  await expect
    .poll(() => financeCard.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(standardCardHeight + 80)
  const footerGap = await dialog.evaluate((element) => {
    const card = element.querySelector('[data-art-form-tab="financeSection"] .art-table-card')
    const footer = element.querySelector('.el-dialog__footer')
    if (!card || !footer) return Number.POSITIVE_INFINITY
    return footer.getBoundingClientRect().top - card.getBoundingClientRect().bottom
  })
  expect(footerGap).toBeLessThan(48)
  await page.screenshot({
    path: testInfo.outputPath('customer-finance-fullscreen.png'),
    fullPage: true
  })
  await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
  failContacts = true
  await dialog.getByRole('tab', { name: '联系人', exact: true }).click()
  await expect(dialog.getByText('数据加载失败', { exact: true })).toBeVisible()
  failContacts = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('测试联系人', { exact: true })).toBeVisible()
  await setFixtureTheme(page, true)
  await expect(dialog.locator('.el-loading-mask:visible')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('customer-dark.png'), fullPage: true })
  await setFixtureTheme(page, false)
  await dialog.getByRole('tab', { name: '运单列表', exact: true }).click()
  await expect
    .poll(
      () => requests.find((r) => r.name === 'tms_list_dispatch_workbench_secure')?.body.p_filters
    )
    .toMatchObject({ customer_id: customer.id })
  await expect(dialog.getByText('测试始发站', { exact: true })).toBeVisible()
  await expect(dialog.getByText('测试目的站', { exact: true })).toBeVisible()
  await dialog.getByRole('tab', { name: '客户对账', exact: true }).click()
  await expect
    .poll(
      () =>
        requests.find((r) => r.name === 'tms_list_customer_statements_secure')?.body.p_customer_id
    )
    .toBe(customer.id)
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.screenshot({ path: testInfo.outputPath('customer-narrow.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
  await dialog.getByRole('tab', { name: '财务信息', exact: true }).click()
  await expect(dialog.getByText('测试开票主体', { exact: true })).toBeVisible()
  await dialog
    .locator('.art-dialog__scrollbar > .el-scrollbar__wrap')
    .evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  await expect(
    dialog.locator('[data-art-form-tab="financeSection"] .el-pagination')
  ).toBeInViewport()
})

test('仅查看权限打开同一客户档案，基础字段和维护按钮不可写', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    return route.fulfill({
      json:
        name === 'tms_list_customers_secure'
          ? {
              records: [
                {
                  id: 'customer-readonly',
                  customerName: '只读测试客户',
                  customerCode: 'KH-READ',
                  enabled: true,
                  fieldAccess: {}
                }
              ],
              total: 1,
              fieldAccess: {}
            }
          : name === 'get_table_column_runtime'
            ? { enabled: false, profiles: [] }
            : []
    })
  })
  await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html?readonly=1', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('body')).toHaveAttribute('data-fixture-readonly', 'true')
  await page.getByText('只读测试客户', { exact: true }).first().click()
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('tab', { name: '客户识别' }) })
  await expect(dialog.locator('[data-art-form-item-key="customerName"] input')).toBeDisabled()
  await expect(dialog.getByRole('button', { name: '保存客户', exact: true })).toHaveCount(0)
  await dialog.getByRole('tab', { name: '联系人', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '新增联系人', exact: true })).toHaveCount(0)
})
