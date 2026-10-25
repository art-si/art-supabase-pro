import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)
const ownTenant = '55555555-5555-4555-8555-555555555555'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const tables = [
  'wms_inventory_batch',
  'wms_serial_number',
  'wms_inventory_reservation',
  'scm_receipt_target_document'
]

for (const mode of ['platform-all', 'platform-selected', 'ordinary', 'ordinary-forged']) {
  test(`${mode}仓储统计范围及迟到请求状态`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const platform = mode.startsWith('platform')
    const queries: Array<string | null> = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let race = false
    let received = 0
    let finished = 0
    let releaseOld: (() => void) | undefined
    const oldGate = new Promise<void>((resolve) => {
      releaseOld = resolve
    })
    const oldTenant = mode === 'platform-all' ? tenantA : tenantB
    const latestTenant = mode === 'platform-all' ? tenantB : tenantA
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      if (!tables.some((table) => url.pathname.endsWith(`/${table}`))) {
        await route.fulfill({ json: [] })
        return
      }
      const queryScope = url.searchParams.get('tenant_id')
      const headerScope = route.request().headers()['x-art-tenant-scope']
      const scope = platform ? (headerScope ? `eq.${headerScope}` : null) : queryScope
      if (platform) expect(queryScope).toBeNull()
      queries.push(scope)
      if (race && scope === `eq.${oldTenant}`) {
        received++
        await oldGate
        await route.fulfill(
          mode === 'platform-selected'
            ? { status: 503, body: '' }
            : {
                status: 200,
                headers: {
                  'content-range': '0-98/99',
                  'access-control-expose-headers': 'content-range'
                },
                body: ''
              }
        )
        finished++
        return
      }
      const total = scope === `eq.${tenantA}` ? 11 : scope === `eq.${tenantB}` ? 22 : 7
      await route.fulfill({
        status: 200,
        headers: {
          'content-range': `0-${total - 1}/${total}`,
          'access-control-expose-headers': 'content-range'
        },
        body: ''
      })
    })
    await page.goto(`/tests/e2e/fixtures/wms-workbench-scope.html?mode=${mode}`)
    const metrics = page.getByLabel('业务概览', { exact: true })
    await expect(
      metrics.getByText(mode === 'platform-selected' ? '11' : '7', { exact: true })
    ).toHaveCount(4, { timeout: 120_000 })
    expect(queries).toHaveLength(4)
    expect(
      queries.every(
        (value) =>
          value === (mode === 'platform-all' ? null : `eq.${platform ? tenantA : ownTenant}`)
      )
    ).toBe(true)
    if (platform) {
      race = true
      await page
        .getByRole('button', { name: oldTenant === tenantA ? '租户 A' : '租户 B', exact: true })
        .click()
      await expect.poll(() => received).toBe(4)
      await expect(
        metrics.getByText(mode === 'platform-selected' ? '11' : '7', { exact: true })
      ).toHaveCount(0)
      await page
        .getByRole('button', { name: latestTenant === tenantA ? '租户 A' : '租户 B', exact: true })
        .click()
      await expect(
        metrics.getByText(latestTenant === tenantA ? '11' : '22', { exact: true })
      ).toHaveCount(4)
      releaseOld?.()
      await expect.poll(() => finished).toBe(4)
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      await expect(
        metrics.getByText(latestTenant === tenantA ? '11' : '22', { exact: true })
      ).toHaveCount(4)
      await expect(metrics.getByText('99', { exact: true })).toHaveCount(0)
      await expect(
        page.getByText('仓储概览加载失败，业务页面仍可使用。', { exact: false })
      ).toHaveCount(0)
      await metrics.screenshot({ path: info.outputPath('latest-scope-statistics.png') })
    } else {
      await expect(page.getByRole('navigation', { name: '测试租户范围' })).toHaveCount(0)
      const entries = page
        .locator('.art-section-card')
        .filter({ has: page.getByText('仓内作业', { exact: true }) })
      await expect(entries.getByText('暂无可用作业入口', { exact: true })).toBeVisible()
      await expect(entries.getByRole('link')).toHaveCount(0)
      await entries.screenshot({ path: info.outputPath('permission-empty.png') })
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
