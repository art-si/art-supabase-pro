import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

test('折旧批次与两条明细加载失败后原位重试', async ({ page }, info) => {
  test.setTimeout(120_000)
  page.setDefaultTimeout(15_000)
  await prepareIsolatedSession(page)
  const accountId = 'cccccccc-cccc-4ccc-accc-cccccccccccc'
  const readonlyAccountId = 'dddddddd-dddd-4ddd-addd-dddddddddddd'
  const access = { assetValues: 'edit', assetReferences: 'edit' }
  const periodScopes: Array<string | null> = []
  const writes: string[] = []
  await page.route(
    /\/rest\/v1\/rpc\/(calculate_fms_asset_depreciation_secure|act_fms_asset_depreciation_run_secure)(?:\?|$)/,
    (route) => {
      writes.push(new URL(route.request().url()).pathname)
      return route.abort('blockedbyclient')
    }
  )
  await page.route('**/rest/v1/rpc/fms_accounting_readiness', (route) =>
    route.fulfill({ json: { foundationReady: true } })
  )
  await page.route('**/rest/v1/rpc/fms_list_account_set_options_secure', (route) =>
    route.fulfill({
      json: {
        total: 2,
        records: [
          { id: accountId, accountSetCode: 'QA', accountSetName: '折旧验收账套', status: 'active' },
          {
            id: readonlyAccountId,
            accountSetCode: 'QR',
            accountSetName: '折旧验收只读账套',
            status: 'active'
          }
        ]
      }
    })
  )
  await page.route('**/rest/v1/rpc/fms_list_fixed_assets_secure', (route) =>
    route.fulfill({ json: { records: [], total: 0, fieldAccess: access } })
  )
  await page.route('**/rest/v1/fms_accounting_period?*', (route) => {
    const scope = new URL(route.request().url()).searchParams.get('account_set_id')
    periodScopes.push(scope)
    const readonly = scope === `eq.${readonlyAccountId}`
    return route.fulfill({
      json: (readonly ? [11, 12] : [10]).map((month) => ({
        id: `period-${month}`,
        account_set_id: readonly ? readonlyAccountId : accountId,
        fiscal_year: 2026,
        period_no: month,
        start_date: `2026-${month}-01`,
        end_date: `2026-${month}-${month === 11 ? 30 : 31}`,
        status: 'open'
      }))
    })
  })
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
    if (route.request().postDataJSON().p_account_set_id === readonlyAccountId)
      return route.fulfill({ json: { records: [], fieldAccess: { assetValues: 'read' } } })
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
  await page.goto('/tests/e2e/fixtures/record-delete-context.html?target=fixed-asset', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  })
  await page.getByRole('button', { name: '折旧管理', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '固定资产折旧管理', exact: true })
  const account = drawer.getByRole('combobox', { name: '所属账套', exact: true })
  const period = drawer.getByRole('combobox', { name: '会计期间', exact: true })
  const accountField = drawer.locator('[data-art-form-item-key="accountSetId"]')
  const periodField = drawer.locator('[data-art-form-item-key="periodId"]')
  const periodRange = periodField.locator('.art-form-item__description')
  const calculate = drawer.getByRole('button', { name: '计算本期折旧', exact: true })
  await expect(account).toBeVisible()
  await expect(period).toBeVisible()
  await expect(periodField).toContainText('2026 年第 10 期')
  await expect(periodRange).toHaveText('2026-10-01 至 2026-10-31')
  await expect(account).not.toHaveAttribute('readonly', '')
  await expect(period).toHaveAttribute('readonly', '')
  for (const field of [accountField, periodField]) {
    await field.locator('.el-select').hover()
    await expect(field.locator('.el-select__clear')).toHaveCount(0)
  }
  await expect(drawer.getByText('折旧批次加载失败，请重试。', { exact: true })).toBeVisible()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await expect(calculate).toBeDisabled()
  const [periodControlBounds, actionBounds] = await Promise.all([
    periodField.locator('.el-select').boundingBox(),
    calculate.boundingBox()
  ])
  expect(
    Math.abs(
      periodControlBounds!.y +
        periodControlBounds!.height / 2 -
        (actionBounds!.y + actionBounds!.height / 2)
    )
  ).toBeLessThanOrEqual(2)
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

  await page.setViewportSize({ width: 390, height: 844 })
  await account.click()
  await page.getByRole('option', { name: '折旧验收只读账套（QR）', exact: true }).click()
  await expect(periodField).toContainText('2026 年第 11 期')
  await expect(periodRange).toHaveText('2026-11-01 至 2026-11-30')
  await expect(periodField).not.toContainText('2026 年第 10 期')
  await expect(drawer.getByRole('button', { name: 'QA-ZJ-2', exact: true })).toHaveCount(0)
  await expect(drawer.getByText('折旧验收设备2', { exact: false })).toHaveCount(0)
  await expect(drawer.getByText('暂无折旧批次', { exact: true })).toBeVisible()
  await expect(calculate).toBeDisabled()
  await periodField.locator('.el-select').click()
  await page.getByRole('option', { name: '2026 年第 12 期 · 2026-12-01 至 2026-12-31' }).click()
  await expect(periodField.locator('.el-select__placeholder')).toHaveText('2026 年第 12 期')
  await expect(periodRange).toHaveText('2026-12-01 至 2026-12-31')
  await expect(periodRange).toBeVisible()
  expect(await periodRange.evaluate((range) => range.scrollWidth <= range.clientWidth)).toBe(true)
  await expect(periodField.getByText('会计期间', { exact: true })).toBeVisible()
  await expect(drawer.getByText('所属账套', { exact: true })).toBeVisible()
  await expect(calculate).toBeDisabled()
  expect(periodScopes.filter((scope) => scope === `eq.${readonlyAccountId}`)).toHaveLength(1)
  expect(writes).toEqual([])
  await drawer.screenshot({ path: info.outputPath('depreciation-controls-390.png') })
})
