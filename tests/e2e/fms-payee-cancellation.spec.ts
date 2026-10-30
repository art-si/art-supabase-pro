import { expect, test, type Page, type Route } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { installDictionaryOptions } from './support/dictionary-options'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const endpoint = '/fms_payee_information'
const row = (suffix: string, tenantId = tenantA) => ({
  id: `payee-${suffix}`,
  tenant_id: tenantId,
  payee_name: `收款人${suffix}`,
  payee_employee_no: `EMP-${suffix}`,
  is_employee: false,
  organization_name: '验收组织',
  bank_name: '验收银行',
  bank_account: `BANK-${suffix}`,
  currency_code: 'CNY',
  authorized_use: false,
  is_default: false,
  create_time: '2026-10-30T00:00:00Z'
})

async function fulfillPayee(route: Route, suffix: string, tenantId = tenantA): Promise<void> {
  await route.fulfill({
    json: [row(suffix, tenantId)],
    headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
  })
}

async function refreshTable(page: Page): Promise<void> {
  await page.locator('.art-table-query').evaluate(async (element) => {
    const api = (
      element as HTMLElement & {
        __vueParentComponent?: { exposed?: { getData?: () => Promise<unknown> } }
      }
    ).__vueParentComponent?.exposed
    if (!api?.getData) throw new Error('ArtTableQuery.getData unavailable')
    await api.getData()
  })
}

async function preparePayee(page: Page, onPayee: (route: Route) => Promise<void>) {
  const unknownWrites: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (request.method() !== 'GET') {
      unknownWrites.push(`${request.method()} ${pathname}`)
      return route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
    }
    return pathname.endsWith(endpoint) ? onPayee(route) : route.fallback()
  })
  await installDictionaryOptions(page, {
    commonBoolean: [
      { value: 'true', label: '是' },
      { value: 'false', label: '否' }
    ]
  })
  await page.route('**/rest/v1/rpc/get_table_column_runtime*', (route) =>
    route.fulfill({ json: { enabled: false, profiles: [] } })
  )
  return { unknownWrites, pageErrors }
}

test('收款信息 A 慢 B 快：旧 HTTP 中止且表格仅接受 B', async ({ page }, info) => {
  let racing = false
  let raceReads = 0
  let startA: (() => void) | undefined
  let releaseA: (() => void) | undefined
  const aStarted = new Promise<void>((resolve) => (startA = resolve))
  const aRelease = new Promise<void>((resolve) => (releaseA = resolve))
  const { unknownWrites, pageErrors } = await preparePayee(page, async (route) => {
    if (!racing) return fulfillPayee(route, 'SEED')
    raceReads++
    if (raceReads !== 1) return fulfillPayee(route, 'B')
    startA?.()
    await aRelease
    try {
      await fulfillPayee(route, 'A')
    } catch (error) {
      if (!route.request().failure()) throw error
    }
  })
  await page.goto('/tests/e2e/fixtures/receivable-workspace.html?kind=expense_payee')
  await expect(page.getByText('收款人SEED', { exact: true })).toBeVisible()
  racing = true
  const failedA = page.waitForEvent('requestfailed', {
    predicate: (request) => new URL(request.url()).pathname.endsWith(endpoint),
    timeout: 15_000
  })
  const olderRequest = refreshTable(page)
  await aStarted
  await refreshTable(page)
  await expect.poll(() => raceReads).toBe(2)
  const aborted = await failedA
  expect(aborted.failure()?.errorText).toMatch(/ERR_ABORTED|NS_BINDING_ABORTED|cancel/i)
  await expect(page.getByText('收款人B', { exact: true })).toBeVisible()
  await expect(page.locator('.el-pagination__total')).toHaveText(/共\s*1\s*条/)
  releaseA?.()
  await olderRequest
  await expect(page.getByText('收款人A', { exact: true })).toHaveCount(0)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await expect(page.getByPlaceholder('输入收款人')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: info.outputPath('payee-aborted-A-accepted-B.png') })
  await writeFile(
    info.outputPath('payee-aborted-A-accepted-B.json'),
    `${JSON.stringify({ raceReads, abortText: aborted.failure()?.errorText, unknownWrites, pageErrors }, null, 2)}\n`
  )
  expect(unknownWrites).toEqual([])
  expect(pageErrors).toEqual([])
})

test('收款信息切租户中止 A，B 请求传递租户读取范围头', async ({ page }, info) => {
  let racing = false
  let startA: (() => void) | undefined
  let releaseA: (() => void) | undefined
  const aStarted = new Promise<void>((resolve) => (startA = resolve))
  const aRelease = new Promise<void>((resolve) => (releaseA = resolve))
  const scopes: string[] = []
  const { unknownWrites, pageErrors } = await preparePayee(page, async (route) => {
    const tenant = route.request().headers()['x-art-tenant-scope'] ?? ''
    scopes.push(tenant)
    if (!racing) return fulfillPayee(route, 'SEED')
    if (tenant === tenantB) return fulfillPayee(route, 'B', tenantB)
    startA?.()
    await aRelease
    try {
      await fulfillPayee(route, 'A')
    } catch (error) {
      if (!route.request().failure()) throw error
    }
  })
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({
      json: [
        { id: tenantA, tenant_code: 'A', tenant_name: '租户 A' },
        { id: tenantB, tenant_code: 'B', tenant_name: '租户 B' }
      ]
    })
  )
  await page.goto(
    '/tests/e2e/fixtures/receivable-workspace.html?kind=expense_payee&arNavigation=1&scopeControls=1'
  )
  await expect(page.getByText('收款人SEED', { exact: true })).toBeVisible()
  racing = true
  const failedA = page.waitForEvent('requestfailed', {
    predicate: (request) => new URL(request.url()).pathname.endsWith(endpoint),
    timeout: 15_000
  })
  const olderRequest = refreshTable(page)
  await aStarted
  await page.getByRole('button', { name: '切换租户2' }).click()
  await expect(page.getByText('收款人B', { exact: true })).toBeVisible()
  const aborted = await failedA
  expect(aborted.failure()?.errorText).toMatch(/ERR_ABORTED|NS_BINDING_ABORTED|cancel/i)
  releaseA?.()
  await olderRequest
  await expect(page.getByText('收款人A', { exact: true })).toHaveCount(0)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  expect(scopes).toContain(tenantB)
  expect(unknownWrites).toEqual([])
  expect(pageErrors).toEqual([])
  await writeFile(
    info.outputPath('payee-tenant-abort.json'),
    `${JSON.stringify({ scopes }, null, 2)}\n`
  )
})

test('旧单参数 provider 读取不受表格自身刷新取消', async ({ page }, info) => {
  let releaseDirect: (() => void) | undefined
  let startDirect: (() => void) | undefined
  const directStarted = new Promise<void>((resolve) => (startDirect = resolve))
  const directRelease = new Promise<void>((resolve) => (releaseDirect = resolve))
  const failed: string[] = []
  page.on('requestfailed', (request) => failed.push(new URL(request.url()).pathname))
  const { unknownWrites, pageErrors } = await preparePayee(page, async (route) => {
    const name = new URL(route.request().url()).searchParams.get('payee_name') ?? ''
    if (!name.includes('NO-SIGNAL')) return fulfillPayee(route, 'TABLE')
    startDirect?.()
    await directRelease
    await fulfillPayee(route, 'DIRECT')
  })
  await page.goto('/tests/e2e/fixtures/receivable-workspace.html?kind=expense_payee')
  await expect(page.getByText('收款人TABLE', { exact: true })).toBeVisible()
  const direct = page.evaluate(async () => {
    const providerUrl = '/modules/art-supabase-fms/src/api/modules/expense/payee-information.ts'
    const { fetchPayeeInformationList } = (await import(
      providerUrl
    )) as typeof import('../../modules/art-supabase-fms/src/api/modules/expense/payee-information')
    const result = await fetchPayeeInformationList({ payeeName: 'NO-SIGNAL' })
    return { id: result.data?.[0]?.id, total: result.total, error: result.error }
  })
  await directStarted
  await refreshTable(page)
  releaseDirect?.()
  const result = await direct
  expect(result).toMatchObject({ id: 'payee-DIRECT', total: 1, error: null })
  expect(failed.filter((path) => path.endsWith(endpoint))).toEqual([])
  expect(unknownWrites).toEqual([])
  expect(pageErrors).toEqual([])
  await writeFile(info.outputPath('payee-no-options.json'), `${JSON.stringify(result, null, 2)}\n`)
})
