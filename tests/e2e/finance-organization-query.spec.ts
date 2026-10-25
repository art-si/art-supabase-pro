import { expect, test } from '@playwright/test'
import { sumBy } from 'lodash-es'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

const tenant = '11111111-1111-4111-8111-111111111111'
const organizations = [
  {
    id: 'group',
    tenant_id: tenant,
    parent_id: null,
    organization_code: 'GROUP',
    organization_name: '验收集团',
    organization_type: 'group',
    status: '1'
  },
  ...[1, 2].map((index) => ({
    id: `org-${index}`,
    tenant_id: tenant,
    parent_id: 'group',
    organization_code: `ORG-${index}`,
    organization_name: `验收结算公司${index}`,
    organization_type: 'company',
    status: '1'
  }))
]

for (const kind of ['payable', 'receivable'] as const) {
  test(`${kind}核销组织树保留禁选祖先、两家子公司查询隔离与失败恢复`, async ({ page }, info) => {
    const queries: Array<Record<string, unknown>> = []
    const writes: string[] = []
    let fail = false
    let releaseCheck = () => {}
    const checkGate = new Promise<void>((resolve) => {
      releaseCheck = resolve
    })
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      const name = url.pathname.split('/').at(-1) || ''
      const body = route.request().postDataJSON()
      if (name === 'sys_dictionary') {
        const code = (url.searchParams.get('dict_type_table.code') || '').replace(/^eq\./, '')
        const entries =
          code === 'arCounterpartyType'
            ? [['customer', '客户']]
            : code === 'arWriteoffRelation'
              ? [['receivable_receipt', '应收收款核销']]
              : []
        return route.fulfill({
          json: entries.map(([value, label]) => ({
            id: value,
            code: value,
            value,
            label,
            status: '1',
            dict_type_table: { code }
          }))
        })
      }
      if (name === 'mdm_organization') return route.fulfill({ json: organizations })
      if (name === 'fms_check_receivable_writeoff_secure') {
        await checkGate
        return route.fulfill({
          json: [
            {
              documentNo: 'QA-primary-2',
              currencyCode: 'CNY',
              availableAmount: 200,
              message: '状态与余额查验通过'
            }
          ]
        })
      }
      if (name === 'fms_ar_options_secure')
        return route.fulfill({
          json:
            body.p_type === 'initialized_organization'
              ? [1, 2].map((index) => ({
                  id: `org-${index}`,
                  tenant_id: tenant,
                  name: `验收结算公司${index}`
                }))
              : []
        })
      if (
        name === 'fms_payable_writeoff_workspace_secure' ||
        name === 'fms_receivable_writeoff_candidates_secure'
      ) {
        const query = body.p_query
        queries.push(query)
        if (fail)
          return route.fulfill({
            status: 503,
            json: { code: 'P0001', message: '组织核销资料暂不可用，请重试' }
          })
        const selected = query.organization_id || query.organizationId
        const rows = (side: string) =>
          [1, 2]
            .filter((index) => !selected || selected === `org-${index}`)
            .map((index) => ({
              id: `${side}-${index}`,
              tenantId: tenant,
              documentId: `${side}-${index}`,
              documentNo: `QA-${side}-${index}`,
              organizationId: `org-${index}`,
              supplierId: 'party',
              supplierName: '验收供应商',
              customerId: 'party',
              customerName: '验收客户',
              sourceType: side === 'primary' ? 'financial' : 'receipt',
              status: side === 'primary' ? 'approved' : 'confirmed',
              businessDate: '2026-10-24',
              currencyCode: 'CNY',
              exchangeRate: 1,
              amount: index * 100,
              availableAmount: index * 100
            }))
        return route.fulfill({
          json:
            kind === 'payable'
              ? {
                  primary: rows('primary'),
                  secondary: rows('secondary'),
                  history: [],
                  organizations: [1, 2].map((index) => ({
                    id: `org-${index}`,
                    tenantId: tenant,
                    name: `验收结算公司${index}`
                  })),
                  schemes: [
                    {
                      id: 'manual',
                      code: 'AP-MANUAL',
                      name: '验收手工方案',
                      enabled: true,
                      automatic: false
                    }
                  ]
                }
              : {
                  records: [...rows('primary'), ...rows('secondary')],
                  summary: {
                    receivableAmount: sumBy(rows('primary'), 'amount'),
                    dueThisMonthAmount: sumBy(rows('primary'), 'amount'),
                    unallocatedReceiptAmount: sumBy(rows('secondary'), 'amount')
                  }
                }
        })
      }
      if (/^fms_(execute_receivable_writeoff|payable_writeoff)_secure$/.test(name))
        writes.push(name)
      return route.fulfill({ json: [] })
    })
    const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    await page.goto(
      `/tests/e2e/fixtures/${kind === 'payable' ? 'purchase-payable' : 'receivable-workspace'}.html?kind=writeoff&theme=${theme}`
    )
    const queryButton = page.getByRole('button', {
      name: kind === 'payable' ? '查询' : '查询待核销单据',
      exact: true
    })
    const execute = page.getByRole('button', { name: '核销', exact: true })
    for (const index of [1, 2]) {
      await page.getByRole('combobox', { name: '结算组织', exact: true }).click()
      const parent = page.getByRole('treeitem', { name: '验收集团', exact: true })
      await expect(parent).toHaveAttribute('aria-disabled', 'true')
      if ((await parent.getAttribute('aria-expanded')) !== 'true')
        await parent.locator('.el-tree-node__expand-icon').first().click()
      await page.getByRole('treeitem', { name: `验收结算公司${index}`, exact: true }).click()
      await queryButton.click()
      await expect(page.getByText(`QA-primary-${index}`, { exact: true })).toBeVisible()
      await expect(
        page.getByText(`QA-primary-${index === 1 ? 2 : 1}`, { exact: true })
      ).toHaveCount(0)
      expect(queries.at(-1)?.[kind === 'payable' ? 'organization_id' : 'organizationId']).toBe(
        `org-${index}`
      )
      const headers = page.locator('.el-table__header-wrapper label.el-checkbox')
      await headers.nth(0).click()
      await headers.nth(1).click()
      await expect(execute).toBeEnabled()
    }
    if (kind === 'receivable') {
      const check = page.getByRole('button', { name: '单据查验', exact: true })
      try {
        await check.click()
        await expect(check).toBeDisabled()
        await expect(queryButton).toBeDisabled()
        await expect(execute).toBeDisabled()
        await expect(page.getByRole('combobox', { name: '结算组织', exact: true })).toBeDisabled()
      } finally {
        releaseCheck()
      }
      const dialog = page.getByRole('dialog', { name: '单据查验结果', exact: true })
      await expect(dialog).toContainText('状态与余额查验通过')
      await dialog.getByRole('button', { name: '关闭此对话框' }).click()
      await expect(check).toBeEnabled()
    }
    fail = true
    await queryButton.click()
    await expect(execute).toBeDisabled()
    if (kind === 'payable') {
      await expect(page.getByText('QA-primary-2', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '按方案自动核销', exact: true })).toBeDisabled()
      await expect(
        page.getByText('当前保留上次查询结果，核销操作已停用。', { exact: false })
      ).toBeVisible()
      fail = false
      await page.getByRole('button', { name: '重新加载', exact: true }).click()
    } else {
      await expect(page.getByText('QA-primary-2', { exact: true })).toHaveCount(0)
      fail = false
      await queryButton.click()
    }
    await expect(page.getByText('QA-primary-2', { exact: true })).toBeVisible()
    await expect(execute).toBeDisabled()
    if (kind === 'receivable') {
      await expect(
        page.getByText('应收收款核销', { exact: true }).filter({ visible: true })
      ).toBeVisible()
      await expect(page.getByText('receivable_receipt', { exact: true })).toHaveCount(0)
    }
    await page.screenshot({
      path: info.outputPath(`${kind}-organization-retry.png`),
      fullPage: true
    })
    expect(writes).toEqual([])
  })
}
