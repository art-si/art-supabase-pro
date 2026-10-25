import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

test('折旧批次与两条明细加载失败后原位重试', async ({ page }, info) => {
  test.setTimeout(120_000)
  page.setDefaultTimeout(15_000)
  await prepareIsolatedSession(page)
  const accountId = 'cccccccc-cccc-4ccc-accc-cccccccccccc'
  const access = { assetValues: 'edit', assetReferences: 'edit' }
  await page.route('**/rest/v1/rpc/fms_accounting_readiness', (route) =>
    route.fulfill({ json: { foundationReady: true } })
  )
  await page.route('**/rest/v1/rpc/fms_list_account_set_options_secure', (route) =>
    route.fulfill({
      json: {
        total: 1,
        records: [
          { id: accountId, accountSetCode: 'QA', accountSetName: '折旧验收账套', status: 'active' }
        ]
      }
    })
  )
  await page.route('**/rest/v1/rpc/fms_list_fixed_assets_secure', (route) =>
    route.fulfill({ json: { records: [], total: 0, fieldAccess: access } })
  )
  await page.route('**/rest/v1/fms_accounting_period?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'period-1',
          account_set_id: accountId,
          fiscal_year: 2026,
          period_no: 10,
          start_date: '2026-10-01',
          end_date: '2026-10-31',
          status: 'open'
        }
      ]
    })
  )
  const batches = [1, 2].map((index) => ({
    id: `run-${index}`,
    runNo: `QA-ZJ-${index}`,
    status: 'posted',
    assetCount: 1,
    totalAmount: index * 20,
    period: { fiscalYear: 2026, periodNo: index + 9 },
    fieldAccess: access
  }))
  let batchRequests = 0
  await page.route('**/rest/v1/rpc/fms_list_asset_depreciation_runs_secure', (route) => {
    batchRequests++
    return batchRequests === 1
      ? route.fulfill({ status: 503, json: { code: 'XX000', message: 'database unavailable' } })
      : route.fulfill({ json: { records: batches, fieldAccess: access } })
  })
  const lineRequests = new Map<string, number>()
  await page.route('**/rest/v1/rpc/fms_list_asset_depreciation_lines_secure', (route) => {
    const id = route.request().postDataJSON().p_run_id as string
    const count = (lineRequests.get(id) ?? 0) + 1
    lineRequests.set(id, count)
    const index = id === 'run-1' ? 1 : 2
    return count === 1
      ? route.fulfill({ status: 503, json: { code: 'XX000', message: 'database unavailable' } })
      : route.fulfill({
          json: {
            records: [
              {
                id: `line-${index}`,
                asset: { assetNo: `QA-ASSET-${index}`, assetName: `折旧验收设备${index}` },
                openingAccumulatedDepreciation: 0,
                depreciationAmount: index * 20,
                closingAccumulatedDepreciation: index * 20,
                fieldAccess: access
              }
            ],
            fieldAccess: access
          }
        })
  })
  await page.goto('/tests/e2e/fixtures/record-delete-context.html?target=fixed-asset')
  await page.getByRole('button', { name: '折旧管理', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '固定资产折旧管理', exact: true })
  await expect(drawer.getByText('折旧批次加载失败，请重试。', { exact: true })).toBeVisible()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: '计算本期折旧', exact: true })).toBeDisabled()
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer.getByRole('button', { name: 'QA-ZJ-2', exact: true })).toBeVisible()
  expect(batchRequests).toBe(2)
  for (const index of [1, 2]) {
    await drawer.getByRole('button', { name: `QA-ZJ-${index}`, exact: true }).click()
    await expect(drawer.getByText('资产折旧明细加载失败，请重试。', { exact: true })).toBeVisible()
    await expect(page.locator('.el-message')).toHaveCount(0)
    await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
    const identity = drawer.getByText(new RegExp(`^(?:QA-ASSET-${index} · )?折旧验收设备${index}$`))
    await expect(identity).toBeVisible()
    await expect(drawer.getByText(new RegExp(`折旧验收设备${3 - index}$`))).toHaveCount(0)
    expect(lineRequests.get(`run-${index}`)).toBe(2)
    await identity.scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`depreciation-recovered-${index}.png`) })
  }
})
