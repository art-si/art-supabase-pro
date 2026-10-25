import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const config of [
  {
    target: 'accounting-auxiliary',
    label: '辅助核算维度',
    code: 'AUX-001',
    table: 'fms_auxiliary_type',
    listRpc: null,
    deleteRpc: 'delete_fms_auxiliary_type',
    idKey: 'p_id',
    referenceTable: 'fms_voucher',
    referenceNo: 'VOUCHER-001',
    referenceStatus: 'posted'
  },
  {
    target: 'opening-balance',
    label: '期初余额',
    code: '1001',
    table: 'fms_opening_balance',
    listRpc: 'fms_list_opening_balances_secure',
    deleteRpc: 'delete_fms_opening_balance_secure',
    idKey: 'p_balance_id',
    referenceTable: 'fms_voucher',
    referenceNo: 'VOUCHER-001',
    referenceStatus: 'posted'
  },
  {
    target: 'voucher-template',
    label: '凭证模板',
    code: 'TPL-001',
    table: 'fms_voucher_template',
    listRpc: 'fms_list_voucher_templates_secure',
    deleteRpc: 'delete_fms_voucher_template_secure',
    idKey: 'p_template_id',
    referenceTable: 'fms_voucher',
    referenceNo: 'VOUCHER-001',
    referenceStatus: 'posted'
  },
  {
    target: 'auto-posting',
    label: '自动入账规则',
    code: 'RULE-001',
    table: 'fms_posting_rule',
    listRpc: 'fms_list_posting_rules_secure',
    deleteRpc: 'delete_fms_posting_rule_secure',
    idKey: 'p_rule_id',
    referenceTable: 'fms_posting_event',
    referenceNo: 'EVENT-001',
    referenceStatus: 'generated'
  },
  {
    target: 'fund-account',
    label: '资金账户',
    code: 'ACCOUNT-001',
    table: 'fms_fund_account',
    listRpc: 'fms_list_fund_accounts_secure',
    deleteRpc: 'delete_fms_fund_account_secure',
    idKey: 'p_account_id',
    referenceTable: 'fms_fund_ledger_entry',
    referenceNo: 'LEDGER-001',
    referenceStatus: 'posted'
  },
  {
    target: 'asset-category',
    label: '资产类别',
    code: 'CATEGORY-001',
    table: 'fms_asset_category',
    listRpc: 'fms_list_asset_categories_secure',
    deleteRpc: 'delete_fms_asset_category_secure',
    idKey: 'p_category_id',
    referenceTable: 'fms_fixed_asset',
    referenceNo: 'ASSET-001',
    referenceStatus: 'active'
  },
  {
    target: 'fixed-asset',
    label: '固定资产',
    code: 'ASSET-001',
    table: 'fms_fixed_asset',
    listRpc: 'fms_list_fixed_assets_secure',
    deleteRpc: 'delete_fms_fixed_asset_secure',
    idKey: 'p_asset_id',
    referenceTable: 'fms_asset_depreciation_line',
    referenceNo: 'DEPRECIATION-001',
    referenceStatus: 'posted'
  },
  {
    target: 'fund-transfer',
    label: '资金调拨',
    code: 'TRANSFER-001',
    table: 'fms_fund_transfer',
    listRpc: 'fms_list_fund_transfers_secure',
    deleteRpc: 'delete_fms_fund_transfer_secure',
    idKey: 'p_transfer_id',
    referenceTable: 'fms_fund_ledger_entry',
    referenceNo: 'LEDGER-001',
    referenceStatus: 'posted'
  }
] as const) {
  const modes = ['blocked', 'error', 'clear', 'concurrent', 'revoked', 'failure'] as const
  const scenarioModes =
    config.target === 'auto-posting'
      ? [...modes, 'readonly' as const]
      : config.target === 'asset-category'
        ? [...modes, 'view-denied' as const]
        : modes
  for (const mode of scenarioModes) {
    test(`${config.label}删除 ${mode}`, async ({ page }, testInfo) => {
      await prepareIsolatedSession(page)
      const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
      const events: string[] = []
      let deleted = false
      let blocked = mode === 'blocked' || mode === 'view-denied'
      await page.route('**/rest/v1/sys_tenant**', (route) => route.fulfill({ json: [] }))
      await page.route('**/rest/v1/rpc/fms_list_account_set_options_secure**', (route) =>
        route.fulfill({
          json:
            config.target === 'opening-balance' || config.target === 'accounting-auxiliary'
              ? {
                  records: [
                    {
                      id: 'test-account-set',
                      accountSetCode: 'TEST',
                      accountSetName: '测试账套',
                      status: 'active',
                      tenantId: 'test-tenant'
                    }
                  ],
                  total: 1
                }
              : []
        })
      )
      if (config.target === 'accounting-auxiliary')
        await page.route('**/rest/v1/fms_auxiliary_type?*', (route) =>
          route.fulfill({
            json: deleted
              ? []
              : [
                  {
                    id,
                    type_code: config.code,
                    type_name: `测试${config.label}`,
                    source_type: 'manual',
                    is_system: false,
                    is_enabled: true,
                    sort: 1
                  }
                ]
          })
        )
      if (config.target === 'opening-balance')
        await page.route('**/rest/v1/rpc/fms_opening_balance_summary_secure**', (route) =>
          route.fulfill({
            json: { status: 'draft', entryCount: deleted ? 0 : 1, isBalanced: true }
          })
        )
      await page.route('**/rest/v1/rpc/fms_list_posting_events_secure**', (route) =>
        route.fulfill({ json: { records: [], total: 0 } })
      )
      if (config.listRpc)
        await page.route(`**/rest/v1/rpc/${config.listRpc}**`, (route) =>
          route.fulfill({
            json:
              config.target === 'asset-category'
                ? deleted
                  ? []
                  : [
                      {
                        id,
                        categoryCode: config.code,
                        categoryName: `测试${config.label}`,
                        defaultUsefulLifeMonths: 60,
                        defaultResidualRate: 0.05,
                        isEnabled: true
                      }
                    ]
                : {
                    records: deleted
                      ? []
                      : [
                          {
                            id,
                            subject: {
                              subjectCode: config.code,
                              subjectName: `测试${config.label}`,
                              balanceDirection: 'debit'
                            },
                            accountName: config.code,
                            assetName: `测试${config.label}`,
                            assetNo: config.code,
                            transferNo: config.code,
                            transferDate: '2026-10-07',
                            amount: 100,
                            feeAmount: 0,
                            version: 1,
                            usefulLifeMonths: 60,
                            depreciatedMonths: 0,
                            status: ['fixed-asset', 'fund-transfer'].includes(config.target)
                              ? 'draft'
                              : 'active',
                            accountType: 'bank',
                            currentBalance: 0,
                            openingBalance: 0,
                            templateCode: config.code,
                            templateName: `测试${config.label}`,
                            ruleCode: config.code,
                            ruleName: `测试${config.label}`,
                            sourceType: 'receipt',
                            eventCode: 'confirmed',
                            fieldAccess: {
                              ruleIdentity: 'view',
                              ruleConfiguration: mode === 'readonly' ? 'view' : 'edit'
                            },
                            voucherType: 'general',
                            isEnabled: true,
                            entries: []
                          }
                        ],
                    total: deleted ? 0 : 1
                  }
          })
        )
      await page.route('**/rest/v1/rpc/get_record_delete_dependency_details**', (route) => {
        events.push('inspect')
        expect(route.request().postDataJSON()).toMatchObject({
          p_table: config.table,
          p_ids: [id]
        })
        if (mode === 'error')
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'database unavailable' }
          })
        return route.fulfill({
          json: blocked
            ? [
                {
                  resourceId: id,
                  sourceTable: config.referenceTable,
                  recordId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
                  targetId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
                  recordNo: config.referenceNo,
                  recordSummary: '测试关联业务记录',
                  recordStatus: config.referenceStatus
                }
              ]
            : []
        })
      })
      await page.route(`**/rest/v1/rpc/${config.deleteRpc}**`, (route) => {
        events.push('delete')
        expect(route.request().postDataJSON()[config.idKey]).toBe(id)
        if (mode === 'concurrent') {
          blocked = true
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: `${config.label}新增了关联业务，请重新检查` }
          })
        }
        if (mode === 'failure')
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'database unavailable' }
          })
        deleted = true
        return route.fulfill({ json: null })
      })
      await page.goto(
        `/tests/e2e/fixtures/record-delete-context.html?target=${config.target}${mode === 'view-denied' ? '&view=denied' : ''}`
      )
      if (config.target === 'asset-category')
        await page.getByRole('button', { name: '打开资产类别', exact: true }).click()
      const body =
        config.target === 'opening-balance'
          ? page.locator('.accounting-workspace-content-state')
          : config.target === 'accounting-auxiliary'
            ? page.locator('.accounting-auxiliary-page__types')
            : page.locator('.el-table__body-wrapper').first()
      await expect(body).toContainText(config.code)
      if (mode === 'readonly') {
        await expect(body.getByRole('button', { name: '删除', exact: true })).toHaveCount(0)
        expect(events).toEqual([])
        return
      }
      if (config.target === 'accounting-auxiliary') {
        await body.getByRole('button', { name: '更多操作', exact: true }).click()
        await page.getByRole('menuitem', { name: '删除维度', exact: true }).click()
      } else if (config.target === 'fixed-asset' || config.target === 'fund-transfer') {
        await body.getByRole('button', { name: '更多操作', exact: true }).click()
        await page.getByRole('menuitem', { name: '删除草稿' }).click()
      } else {
        const deleteButton = body.getByRole('button', { name: '删除', exact: true })
        await expect(deleteButton).toBeVisible()
        await deleteButton.click()
      }
      if (mode === 'error') {
        const failure = page.getByRole('dialog', { name: '删除检查未完成' })
        await expect(failure).toContainText('关联资料未完成核验，删除已停止')
        await failure.getByRole('button', { name: '重新检查', exact: true }).click()
        await expect.poll(() => events.length).toBe(2)
        expect(events).toEqual(['inspect', 'inspect'])
        return
      }
      if (mode !== 'blocked' && mode !== 'view-denied') {
        const confirmation = page.getByRole('dialog', { name: '删除确认' })
        await expect(confirmation).toContainText(
          config.target === 'fund-account' || config.target === 'fund-transfer'
            ? config.code
            : `测试${config.label}`
        )
        if (mode === 'revoked')
          await page
            .getByTestId('revoke-delete-permission')
            .evaluate((button: HTMLButtonElement) => button.click())
        await confirmation.getByRole('button', { name: '删除', exact: true }).click()
      }
      if (mode === 'failure') {
        await expect(page.locator('.el-message--error')).toHaveCount(1)
        await expect(page.locator('.el-message--error')).not.toContainText('database unavailable')
        await expect(body).toContainText(config.code)
        expect(events).toEqual(['inspect', 'delete', 'inspect'])
      } else if (mode === 'revoked') {
        await expect(
          page.getByText('删除权限已变化，请刷新页面后重试', { exact: true })
        ).toBeVisible()
        expect(events).toEqual(['inspect'])
      } else if (mode === 'clear') {
        await expect(body).not.toContainText(config.code)
        expect(events).toEqual(['inspect', 'delete'])
      } else {
        await expect(
          page.getByRole('dialog', { name: `暂时无法删除${config.label}` })
        ).toContainText(config.referenceNo)
        if (config.target === 'auto-posting') {
          const references = page.getByRole('dialog', { name: '暂时无法删除自动入账规则' })
          await expect(references).toContainText('测试关联业务记录 · 已生成')
          await expect(references).not.toContainText('工单已生成')
        }
        expect(events).toEqual(
          mode === 'blocked' || mode === 'view-denied'
            ? ['inspect']
            : ['inspect', 'delete', 'inspect']
        )
        await expect(page.locator('.el-message--error')).toHaveCount(0)
        await page.screenshot({
          path: testInfo.outputPath('finance-configuration-reference.png'),
          animations: 'disabled'
        })
        if (config.target === 'asset-category' && mode === 'blocked') {
          await page.getByRole('button', { name: '查看关联', exact: true }).click()
          await expect(page.getByTestId('navigation-path')).toContainText(
            '/fms/specialized-accounting/fixed-asset?'
          )
          await expect(page.getByTestId('navigation-path')).toContainText(
            'recordId=bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
          )
          await expect(page.getByTestId('navigation-path')).toContainText(
            `recordNo=${config.referenceNo}`
          )
          expect(events).toEqual(['inspect'])
        }
        if (mode === 'view-denied') {
          await expect(page.getByRole('button', { name: '查看关联', exact: true })).toHaveCount(0)
          await expect(page.getByTestId('navigation-path')).toHaveText('/')
        }
      }
    })
  }
}
