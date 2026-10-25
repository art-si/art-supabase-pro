import { expect, test } from '@playwright/test'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('现金流归集只读标识与公共表格校验', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/statement-label-reuse.html?mode=cash-edit')
  const panel = page.locator('.cash-flow-allocation-panel')
  const lines = panel.locator('article')
  await expect(lines).toHaveCount(2)
  await expect(panel.locator('.art-table__required-marker')).toHaveCount(0)
  await expect(lines.first().getByRole('combobox')).toBeDisabled()
  await expect(panel.getByRole('button', { name: '删除归集项目' })).toHaveCount(0)
  await expect
    .poll(() =>
      lines
        .first()
        .locator('.el-table__body-wrapper')
        .evaluate((element) => element.getBoundingClientRect().height)
    )
    .toBeGreaterThan(40)
  await page.screenshot({ path: info.outputPath('cash-readonly.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '切换归集编辑', exact: true }).click()
  await expect(panel.locator('.art-table__required-marker')).toHaveCount(4)
  await expect(lines.first().getByRole('combobox')).toBeEnabled()
  await page.getByRole('button', { name: '验证归集', exact: true }).click()
  await expect(page.getByLabel('归集验证结果')).toHaveText('false')
  await lines.first().getByRole('combobox').click()
  await page.getByRole('option', { name: 'CF-1 经营现金流入', exact: true }).click()
  await page.getByRole('button', { name: '验证归集', exact: true }).click()
  await expect(page.getByText('第 2 条现金分录尚未完成全额归集', { exact: true })).toBeVisible()
  await lines.nth(1).getByRole('button', { name: '添加归集', exact: true }).click()
  await lines.nth(1).getByRole('combobox').click()
  await page.getByRole('option', { name: 'CF-2 经营现金流出', exact: true }).click()
  await page.getByRole('button', { name: '验证归集', exact: true }).click()
  await expect(page.getByLabel('归集验证结果')).toHaveText('true')
  await lines.nth(1).getByRole('button', { name: '删除归集项目', exact: true }).click()
  await expect(lines.nth(1).getByRole('combobox')).toHaveCount(0)
  await page.getByRole('button', { name: '切换归集编辑', exact: true }).click()
  await expect(panel.locator('.art-table__required-marker')).toHaveCount(0)
  await expect(lines.first().getByRole('combobox')).toBeDisabled()
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1)
  await page.screenshot({
    path: info.outputPath('cash-return-readonly.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})

for (const access of ['read', 'edit', 'hidden'] as const) {
  test(`报表口径公共行操作 ${access}`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const fieldAccess = { reportRules: access }
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({
        json: path.endsWith('/fms_list_financial_statement_items_secure')
          ? {
              records: [
                {
                  id: 'formula-item',
                  itemCode: 'FORM-001',
                  itemName: '权限公式项目',
                  accountSetId: 'test-account',
                  statementType: 'cash_flow_statement',
                  lineNo: 1,
                  itemLevel: 1,
                  displayStyle: 'normal',
                  calculationMethod: 'formula',
                  isEnabled: true,
                  ruleCount: 0,
                  fieldAccess
                }
              ],
              total: 1,
              fieldAccess
            }
          : [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    })
    await page.goto(
      `/tests/e2e/fixtures/statement-label-reuse.html?mode=config&configAccess=${access === 'read' ? 'read' : 'edit'}`
    )
    await page.getByRole('button', { name: '查看报表口径', exact: true }).click()
    const drawer = page.getByRole('dialog').filter({ hasText: '财务报表取数口径' })
    await expect(drawer).toContainText('权限公式项目')
    const edit = drawer.getByRole('button', { name: '编辑报表项目', exact: true })
    if (access === 'hidden') {
      await expect(edit).toHaveCount(0)
      await expect(drawer.getByRole('button', { name: /公式/ })).toHaveCount(0)
      await expect(drawer).not.toContainText('规则数')
    } else {
      if (access === 'edit') {
        await edit.click()
        const itemDialog = page.getByRole('dialog').filter({ hasText: '编辑报表项目' })
        await expect(itemDialog.getByRole('textbox', { name: /项目名称/ })).toHaveValue(
          '权限公式项目'
        )
        await itemDialog.getByRole('button', { name: '取消', exact: true }).click()
      } else await expect(edit).toHaveCount(0)
      await drawer
        .getByRole('button', { name: access === 'edit' ? '配置公式' : '查看公式', exact: true })
        .click()
      const ruleDialog = page
        .getByRole('dialog')
        .filter({ hasText: access === 'edit' ? '配置报表公式' : '查看报表公式' })
      await expect(ruleDialog).toContainText('FORM-001 权限公式项目')
      await expect(ruleDialog.getByRole('button', { name: '添加规则', exact: true })).toHaveCount(
        access === 'edit' ? 1 : 0
      )
    }
    await page.screenshot({
      path: info.outputPath('statement-actions.png'),
      animations: 'disabled'
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}

for (const configured of [false, true]) {
  for (const mode of ['report', 'config', 'cash']) {
    test(`财务公共标签 ${mode} ${configured ? '配置字典' : '标准回退'}`, async ({ page }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const row = {
        id: 'statement-test',
        itemCode: 'ST-001',
        itemName: '公共标签报表项目',
        accountSetId: 'test-account',
        statementType: 'cash_flow_statement',
        lineNo: 1,
        itemLevel: 1,
        displayStyle: 'total',
        calculationMethod: 'mapping',
        cashFlowDirection: 'receipt',
        isEnabled: true,
        ruleCount: 0,
        primaryAmount: 10,
        secondaryAmount: 10,
        mappings: [],
        formulas: [],
        fieldAccess: { reportAmounts: 'read', reportRules: 'read' }
      }
      await page.route('**/rest/v1/**', (route) => {
        const url = new URL(route.request().url())
        const path = url.pathname
        const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
        const dictionary = {
          fmsFinancialStatementType: [
            { value: 'cash_flow_statement', label: '配置现金流量表', sort: 0 }
          ],
          fmsStatementCalculationMethod: [{ value: 'mapping', label: '配置科目取数', sort: 0 }],
          fmsStatementDisplayStyle: [{ value: 'total', label: '配置合计行', sort: 0 }],
          fmsCashFlowDirection: [
            { value: 'receipt', label: '配置流入', sort: 0 },
            { value: 'payment', label: '配置流出', sort: 1 }
          ]
        }
        const dict = Object.entries(dictionary).find(([key]) => key === code)?.[1] ?? []
        return route.fulfill({
          json: path.endsWith('/sys_dictionary')
            ? configured
              ? dict
              : []
            : path.endsWith('/fms_list_account_set_options_secure')
              ? {
                  records: [
                    {
                      id: 'test-account',
                      accountSetName: '测试账套',
                      accountSetCode: 'AC-001',
                      status: 'active'
                    }
                  ],
                  total: 1
                }
              : path.endsWith('/fms_list_financial_statement_items_secure') ||
                  path.endsWith('/fms_financial_statement_report_secure')
                ? {
                    records: [
                      row,
                      {
                        ...row,
                        id: 'legacy-test',
                        itemCode: 'ST-002',
                        itemName: '历史标签报表项目',
                        displayStyle: 'legacy-style',
                        calculationMethod: 'legacy-method',
                        cashFlowDirection: null
                      }
                    ],
                    total: 2,
                    fieldAccess: { reportAmounts: 'read', reportRules: 'read' }
                  }
                : [],
          headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
        })
      })
      await page.goto(`/tests/e2e/fixtures/statement-label-reuse.html?mode=${mode}`)
      const root = mode === 'config' ? page.getByRole('dialog') : page.locator('main')
      if (mode === 'config')
        await page.getByRole('button', { name: '查看报表口径', exact: true }).click()
      if (mode === 'cash') {
        await expect(root).toContainText(configured ? '配置流入' : '流入')
        await expect(root).toContainText(configured ? '配置流出' : '流出')
      } else {
        await expect(root).toContainText(configured ? '配置合计行' : '合计行')
        await expect(root).toContainText('legacy-style')
        if (mode === 'config') {
          await expect(root).toContainText(configured ? '配置科目取数' : '科目取数')
          await expect(root).toContainText('legacy-method')
          await expect(root).toContainText(configured ? '配置现金流量表' : '现金流量表')
          if ((page.viewportSize()?.width ?? 1440) > 640) {
            const legacy = root.getByRole('row').filter({ hasText: 'ST-002' })
            await legacy.locator('.el-tag').first().hover()
            await expect(
              page.getByRole('tooltip').filter({ hasText: 'legacy-method' })
            ).toBeVisible()
          }
        } else await assertTableFocusContract(page, info)
      }
      await page.screenshot({
        path: info.outputPath('statement-label.png'),
        animations: 'disabled'
      })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      expect(errors).toEqual([])
    })
  }
}
