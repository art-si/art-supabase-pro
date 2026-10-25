import { expect, test } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.beforeAll(async ({ browser, baseURL }) => {
  if (process.env.E2E_USE_DEV_SERVER === 'false') return
  test.setTimeout(240000)
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  try {
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith('fms_purchase_payable_list_secure')
          ? { data: [], total: 0 }
          : []
      })
    )
    await page.goto('/tests/e2e/fixtures/purchase-payable.html?kind=estimated', {
      waitUntil: 'domcontentloaded',
      timeout: 210000
    })
    await expect(page.getByRole('heading', { name: '暂估应付单', exact: true })).toBeVisible({
      timeout: 30000
    })
  } finally {
    await context.close()
  }
})
test.beforeEach(async ({ page }) => {
  page.setDefaultNavigationTimeout(90000)
})
test.setTimeout(120000)
for (const kind of ['estimated', 'financial'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const box of ['border-mode', 'shadow-mode'] as const) {
      test(`${kind} ${theme} ${box} 两条应付数据、明细查看、错误重试和专注模式`, async ({
        page
      }, testInfo) => {
        let fail = false
        let empty = false
        const data = [1, 2].map((n) => ({
          id: `payable-${n}`,
          tenant_id: '11111111-1111-4111-8111-111111111111',
          kind,
          document_no: `${kind === 'estimated' ? 'ZGYF' : 'CWYF'}-202610-${n}`,
          source_type: 'purchase_inbound',
          source_document_id: `inbound-${n}`,
          source_document_no: `CGRK202610-${n}`,
          supplier_name: `项目供应商${n}`,
          business_date: '2026-10-10',
          status: 'draft',
          amount: 100 * n,
          tax_amount: 13 * n,
          total_amount: 113 * n,
          lines: [
            {
              id: `line-${n}`,
              source_line_id: `inbound-line-${n}`,
              line_no: 10,
              material_code: `MAT-${n}`,
              material_description: `项目物料${n}`,
              project_name: '机房装修工程',
              construction_no: null,
              unit_name: '件',
              quantity: 10 * n,
              unit_price: 10,
              amount: 100 * n,
              tax_amount: 13 * n,
              total_amount: 113 * n
            }
          ]
        }))
        const errors: string[] = []
        page.on('pageerror', (e) => errors.push(e.message))
        await page.route('**/rest/v1/**', (route) => {
          const name = new URL(route.request().url()).pathname.split('/').at(-1)
          if (name === 'fms_purchase_payable_list_secure') {
            const request = route.request().postDataJSON()
            const records = request.p_id
              ? data.filter((record) => record.id === request.p_id)
              : data
            return fail
              ? route.fulfill({ status: 500, json: { code: 'XX000', message: 'internal error' } })
              : route.fulfill({
                  json: { data: empty ? [] : records, total: empty ? 0 : records.length }
                })
          }
          return route.fulfill({ json: [], headers: { 'content-range': '*/0' } })
        })
        await page.goto(
          `/tests/e2e/fixtures/purchase-payable.html?kind=${kind}&theme=${theme}&box=${box}`,
          { waitUntil: 'domcontentloaded' }
        )
        const rows = page.locator('.el-table__body-wrapper tbody tr')
        await expect(rows).toHaveCount(2)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
        ).toBe(true)
        await expect(page.getByRole('textbox', { name: '组合查询' })).toBeVisible()
        const heading = page.getByRole('heading', {
          name: kind === 'estimated' ? '暂估应付单' : '财务应付单',
          exact: true
        })
        await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
        await expect(heading).not.toBeVisible()
        await expect(rows).toHaveCount(2)
        await expect(page.getByRole('textbox', { name: '组合查询' })).toBeVisible()
        await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
        await expect(heading).toBeVisible()
        await page.getByRole('switch', { name: '进入专注模式', exact: true }).locator('..').click()
        await expect(heading).not.toBeVisible()
        await page.keyboard.press('Escape')
        await expect(
          page.getByRole('heading', {
            name: kind === 'estimated' ? '暂估应付单' : '财务应付单',
            exact: true
          })
        ).toBeVisible()
        await captureBusinessEvidence(page, {
          path: testInfo.outputPath(`${kind}-list.png`),
          fullPage: true
        })
        for (const n of [1, 2]) {
          await rows
            .nth(n - 1)
            .getByRole('button', { name: '查看', exact: true })
            .click()
          const drawer = page.getByRole('dialog')
          await expect(drawer).toContainText(`来源采购入库单：CGRK202610-${n}`)
          await expect(drawer).toContainText(`项目物料${n}`)
          await expect(drawer).toContainText(`项目供应商${n}`)
          await expect(drawer.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
          await expect(drawer.getByRole('columnheader').filter({ hasText: '必填' })).toHaveCount(0)
          await expect(drawer).not.toContainText(`项目物料${n === 1 ? 2 : 1}`)
          await captureBusinessEvidence(page, {
            path: testInfo.outputPath(`${kind}-detail-${n}.png`),
            fullPage: true
          })
          await page.keyboard.press('Escape')
          await expect(drawer).not.toBeVisible()
        }
        fail = true
        await page.getByRole('button', { name: '查询', exact: true }).click()
        await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
        fail = false
        const retry = page.getByRole('button', { name: /重试|重新加载/ })
        if (await retry.count()) await retry.first().click()
        else await page.getByRole('button', { name: '查询', exact: true }).click()
        await expect(rows).toHaveCount(2)
        empty = true
        await page.getByRole('button', { name: '查询', exact: true }).click()
        await expect(page.getByText('暂无应付单', { exact: true })).toBeVisible()
        empty = false
        await page.getByRole('button', { name: '查询', exact: true }).click()
        await expect(rows).toHaveCount(2)
        expect(errors).toEqual([])
      })
    }
  }
}
for (const theme of ['light', 'dark'] as const) {
  test(`${theme} 财务应付编辑、赠品清零、付款计划比例与金额切换及保存`, async ({
    page
  }, testInfo) => {
    const tenant = '11111111-1111-4111-8111-111111111111'
    const record = {
      id: '22222222-2222-4222-8222-222222222222',
      tenant_id: tenant,
      kind: 'financial',
      document_no: 'CWYF-EDIT-001',
      document_type_id: 'type',
      document_type_name: '标准采购应付',
      source_type: 'manual',
      supplier_id: 'supplier',
      supplier_name: '编辑供应商',
      payee_supplier_id: 'supplier',
      business_date: '2026-10-21',
      posting_date: '2026-10-21',
      status: 'draft',
      source_document_no: '',
      source_document_id: null,
      total_amount: 113,
      amount: 100,
      tax_amount: 13,
      version: 1,
      lines: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          line_no: 10,
          material_id: 'material',
          material_code: 'MAT-EDIT',
          material_description: '编辑验证物料',
          inventory_unit_id: 'unit',
          unit_name: '件',
          quantity: 1,
          unit_price: 100,
          tax_inclusive_unit_price: 113,
          tax_rate: 13,
          amount: 100,
          tax_amount: 13,
          total_amount: 113
        }
      ]
    }
    let saved: Record<string, unknown> | undefined
    const options: Record<string, unknown[]> = {
      supplier: [{ id: 'supplier', name: '编辑供应商', code: 'SUP-EDIT' }],
      financial_type: [{ id: 'type', name: '标准采购应付' }],
      unit: [{ id: 'unit', name: '件' }],
      tax: [{ id: 'tax', code: '13', name: '13%' }],
      organization: [],
      project: [],
      payment_term: []
    }
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      const body = route.request().postDataJSON()
      if (name === 'fms_purchase_payable_list_secure')
        return route.fulfill({ json: { data: [record], total: 1 } })
      if (name === 'mdm_organization')
        return route.fulfill({
          json: [
            {
              id: 'org-parent',
              tenant_id: tenant,
              parent_id: null,
              organization_code: 'GROUP',
              organization_name: '树形验收集团',
              organization_type: 'group',
              status: '1',
              sort: 0
            },
            {
              id: 'org-child',
              tenant_id: tenant,
              parent_id: 'org-parent',
              organization_code: 'COMPANY',
              organization_name: '树形验收公司',
              organization_type: 'company',
              status: '1',
              sort: 1
            }
          ]
        })
      if (name === 'fms_payable_options_secure')
        return route.fulfill({ json: options[body.p_kind] || [] })
      if (name === 'fms_payable_currency_context_secure')
        return route.fulfill({
          json: {
            configured: true,
            currency_code: 'CNY',
            base_currency_code: 'CNY',
            exchange_rate: 1,
            account_set_name: '验收账套',
            currencies: [{ id: 'CNY', name: '人民币 CNY' }],
            message: ''
          }
        })
      if (name === 'fms_save_purchase_payable_secure') {
        saved = body.p_document
        return route.fulfill({ json: record })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/purchase-payable.html?kind=financial&theme=${theme}`)
    await page.getByRole('button', { name: '编辑', exact: true }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('编辑验证物料', { exact: true })).toBeVisible()
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeVisible()
    await expect(drawer.getByText('标准采购应付', { exact: true })).toBeVisible()
    await drawer.getByLabel('付款组织', { exact: true }).click()
    await page
      .getByRole('treeitem', { name: '树形验收集团', exact: true })
      .locator('.el-tree-node__expand-icon')
      .first()
      .click()
    await page.getByRole('treeitem', { name: '树形验收公司', exact: true }).click()
    await expect(drawer.getByText('树形验收公司', { exact: true })).toBeVisible()
    await expect(drawer.getByRole('columnheader').filter({ hasText: '必填' })).toHaveCount(5)
    await captureBusinessEvidence(page, {
      path: testInfo.outputPath('financial-edit-header.png'),
      fullPage: true
    })
    await drawer.getByRole('spinbutton', { name: '含税单价', exact: true }).fill('226')
    await drawer.getByRole('spinbutton', { name: '含税单价', exact: true }).blur()
    await expect(drawer.getByText(/共 1 行 · (?:立账)?价税合计.*226\.00/)).toBeVisible()
    const gift = drawer.getByRole('checkbox', { name: '赠品', exact: true })
    await gift.locator('..').click()
    await expect(gift).toBeChecked()
    await expect(drawer.getByText(/共 1 行 · (?:立账)?价税合计.*0\.00/)).toBeVisible()
    await gift.locator('..').click()
    await expect(gift).not.toBeChecked()
    await drawer.getByRole('button', { name: '增加付款期次', exact: true }).click()
    await drawer.getByRole('spinbutton', { name: '应付金额', exact: true }).fill('226')
    await drawer.getByRole('spinbutton', { name: '应付金额', exact: true }).blur()
    await drawer
      .getByRole('switch', { name: '按比例计算付款计划', exact: true })
      .locator('..')
      .click()
    await expect(drawer.getByRole('spinbutton', { name: '应付比例', exact: true })).toHaveValue(
      /^100(?:\.0+)?$/
    )
    const planSection = drawer
      .locator('.art-section-card')
      .filter({ hasText: '按比例开启后，应付金额自动计算。' })
    await expect(
      planSection.getByRole('spinbutton', { name: '应付金额', exact: true })
    ).toHaveCount(0)
    await expect(planSection.getByText(/226\.00/)).toBeVisible()
    await captureBusinessEvidence(page, {
      path: testInfo.outputPath('financial-edit-plans.png'),
      fullPage: true
    })
    await drawer
      .getByRole('switch', { name: '按比例计算付款计划', exact: true })
      .locator('..')
      .click()
    await expect(drawer.getByRole('spinbutton', { name: '应付金额', exact: true })).toBeEnabled()
    await expect(
      planSection.getByRole('spinbutton', { name: '应付比例', exact: true })
    ).toHaveCount(0)
    await drawer.getByRole('button', { name: '保存', exact: true }).click()
    await expect(drawer).not.toBeVisible()
    expect(saved?.plans_by_ratio).toBe(false)
    expect(saved?.organization_id).toBe('org-child')
    expect(saved?.payment_plans).toEqual([
      expect.objectContaining({ amount: 226, ratio: 100, due_date: '2026-10-21' })
    ])
    expect(errors).toEqual([])
  })
}

for (const theme of ['light', 'dark'] as const) {
  for (const box of ['border-mode', 'shadow-mode'] as const) {
    test(`${theme} ${box} 付款条件查询、新增与服务端错误重试`, async ({ page }, testInfo) => {
      let rejected = true
      let saved: Record<string, unknown> | undefined
      await page.route('**/rest/v1/**', async (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1)
        if (name === 'mdm_payment_terms_list_secure')
          return route.fulfill({
            json: {
              data: [30, 60].map((days) => ({
                id: `term-${days}`,
                tenant_id: '11111111-1111-4111-8111-111111111111',
                code: `NET${days}`,
                name: `月结${days}天`,
                days,
                enabled: true,
                preset: true,
                remark: '预置账期'
              })),
              total: 2
            }
          })
        if (name === 'mdm_save_payment_term_secure') {
          if (rejected) {
            rejected = false
            return route.fulfill({
              status: 400,
              json: { code: '23505', message: '付款条件编号重复' }
            })
          }
          saved = route.request().postDataJSON().p_term
          return route.fulfill({ json: { ...saved, id: 'new-term' } })
        }
        return route.fulfill({ json: [] })
      })
      await page.goto(
        `/tests/e2e/fixtures/purchase-payable.html?kind=payment-term&theme=${theme}&box=${box}`
      )
      await expect(page.getByText('月结30天', { exact: true })).toBeVisible()
      await expect(page.getByText('月结60天', { exact: true })).toBeVisible()
      await expect(page.getByRole('textbox', { name: '查询条件', exact: true })).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true)
      await captureBusinessEvidence(page, {
        path: testInfo.outputPath('payment-terms-list.png'),
        fullPage: true
      })
      await page.getByRole('button', { name: '新增', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await dialog
        .locator('.el-form-item')
        .filter({ hasText: '编号' })
        .getByRole('textbox')
        .fill('NET45')
      await dialog
        .locator('.el-form-item')
        .filter({ hasText: '名称' })
        .getByRole('textbox')
        .fill('月结45天')
      await dialog.getByRole('spinbutton').fill('45')
      await dialog.getByRole('button', { name: '保存付款条件', exact: true }).click()
      await expect(page.getByText('付款条件编号重复', { exact: true })).toBeVisible()
      await expect(dialog).toBeVisible()
      await captureBusinessEvidence(page, {
        path: testInfo.outputPath('payment-term-error-retry.png'),
        fullPage: true
      })
      await dialog.getByRole('button', { name: '保存付款条件', exact: true }).click()
      await expect(dialog).not.toBeVisible()
      expect(saved).toMatchObject({ code: 'NET45', name: '月结45天', days: 45 })
    })
  }
}
