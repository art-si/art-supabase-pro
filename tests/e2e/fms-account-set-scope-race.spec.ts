import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

const tenantA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const tenantB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const accountSet = (tenantId: string) => ({
  id: tenantId === tenantA ? 'set-a' : 'set-b',
  tenantId,
  accountSetCode: tenantId === tenantA ? 'A-SET' : 'B-SET',
  accountSetName: tenantId === tenantA ? '甲租户账套' : '乙租户账套',
  legalEntityName: tenantId === tenantA ? '甲公司' : '乙公司',
  tenant: {
    tenantCode: tenantId === tenantA ? 'A' : 'B',
    tenantName: tenantId === tenantA ? '租户甲' : '租户乙'
  },
  status: 'active',
  isDefault: false,
  fieldAccess: {
    accountingPolicy: tenantId === tenantA ? 'read' : 'hidden',
    taxRegistration: tenantId === tenantA ? 'read' : 'hidden',
    administrativeAudit: tenantId === tenantA ? 'read' : 'hidden'
  }
})

const selectScope = async (page: Page, scope: 'a' | 'b' | 'all'): Promise<void> => {
  const label = {
    a: '切至租户甲',
    b: '切至租户乙',
    all: '切至全部租户'
  }[scope]
  await page.getByRole('button', { name: label }).click()
}

test('账套切租户丢弃旧权限与概览，失败保留页内重试', async ({ page }, info) => {
  test.setTimeout(420_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  let releaseAList = () => {}
  let releaseAOverview = () => {}
  let releaseBList = () => {}
  let releaseBOverview = () => {}
  const holdAList = new Promise<void>((resolve) => (releaseAList = resolve))
  const holdAOverview = new Promise<void>((resolve) => (releaseAOverview = resolve))
  const holdBList = new Promise<void>((resolve) => (releaseBList = resolve))
  const holdBOverview = new Promise<void>((resolve) => (releaseBOverview = resolve))
  let aListCalls = 0
  let aOverviewCalls = 0
  let bListCalls = 0
  let bOverviewCalls = 0
  const bListPayloads: Array<{ p_status?: string | null; p_tenant_id?: string | null }> = []
  let failNextBList = false
  let failNextBOverview = false

  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/sys_tenant')) {
      return route.fulfill({
        json: [
          { id: tenantA, tenant_code: 'A', tenant_name: '租户甲', status: '1' },
          { id: tenantB, tenant_code: 'B', tenant_name: '租户乙', status: '1' }
        ]
      })
    }
    if (url.pathname.endsWith('/sys_dictionary')) {
      return route.fulfill({
        json: url.search.includes('fmsAccountSetStatus')
          ? [
              {
                id: 'account-set-status-active',
                code: 'active',
                label: '启用',
                value: 'active',
                status: '1',
                sort: 1,
                dict_type_table: { code: 'fmsAccountSetStatus', name: '账套状态' }
              }
            ]
          : []
      })
    }
    if (url.pathname.endsWith('/rpc/fms_list_account_sets_secure')) {
      const payload = route.request().postDataJSON()
      const tenantId = payload.p_tenant_id as string | null
      if (tenantId === tenantA) {
        aListCalls++
        await holdAList
      }
      if (tenantId === tenantB) {
        bListCalls++
        bListPayloads.push(payload)
        await holdBList
      }
      if (tenantId === tenantB && failNextBList) {
        failNextBList = false
        return route.fulfill({ status: 503, json: { code: 'XX000', message: '测试列表失败' } })
      }
      const records = tenantId ? [accountSet(tenantId)] : [accountSet(tenantA), accountSet(tenantB)]
      await route.fulfill({
        json: {
          records,
          total: records.length,
          fieldAccess: {
            accountingPolicy: tenantId === tenantA ? 'read' : 'hidden',
            taxRegistration: tenantId === tenantA ? 'read' : 'hidden',
            administrativeAudit: tenantId === tenantA ? 'read' : 'hidden'
          }
        }
      })
      return
    }
    if (url.pathname.endsWith('/rpc/fms_get_account_set_overview_secure')) {
      const tenantId = route.request().postDataJSON().p_tenant_id as string | null
      if (tenantId === tenantA) {
        aOverviewCalls++
        await holdAOverview
      }
      if (tenantId === tenantB) {
        bOverviewCalls++
        await holdBOverview
      }
      if (tenantId === tenantB && failNextBOverview) {
        failNextBOverview = false
        return route.fulfill({ status: 503, json: { code: 'XX000', message: '测试概览失败' } })
      }
      await route.fulfill({
        json: {
          totalCount: tenantId === tenantA ? 7 : 2,
          activeCount: tenantId === tenantA ? 6 : 1,
          draftCount: 0,
          suspendedCount: 0
        }
      })
      return
    }
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/fms-account-set-scope.html', {
    waitUntil: 'domcontentloaded',
    timeout: 180_000
  })
  const root = page.locator('.account-set-page')
  await expect(root).toBeVisible({ timeout: 120_000 })
  await selectScope(page, 'a')
  await expect.poll(() => aListCalls).toBe(1)
  await expect.poll(() => aOverviewCalls).toBe(1)
  await selectScope(page, 'b')
  await expect.poll(() => bListCalls).toBe(1)
  await expect.poll(() => bOverviewCalls).toBe(1)
  await expect(root.getByText('甲租户账套', { exact: true })).toHaveCount(0)
  await expect(root.getByText('乙租户账套', { exact: true })).toHaveCount(0)
  await root.screenshot({ path: info.outputPath('account-set-switching-b-1440.png') })
  releaseBList()
  releaseBOverview()
  await expect(root.getByText('乙租户账套', { exact: true })).toBeVisible()
  await expect(root.getByRole('button', { name: /全部账套.*2/ })).toBeVisible()
  expect(bListCalls).toBe(1)
  expect(bOverviewCalls).toBe(1)
  await expect(root.getByRole('columnheader', { name: '会计准则' })).toHaveCount(0)
  await expect(root.getByRole('columnheader', { name: '纳税人类型' })).toHaveCount(0)
  const oldResponses = Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/fms_list_account_sets_secure') &&
        response.request().postDataJSON().p_tenant_id === tenantA
    ),
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/fms_get_account_set_overview_secure') &&
        response.request().postDataJSON().p_tenant_id === tenantA
    )
  ])
  releaseAList()
  releaseAOverview()
  await oldResponses
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(root.getByText('甲租户账套', { exact: true })).toHaveCount(0)
  await expect(root.getByRole('columnheader', { name: '会计准则' })).toHaveCount(0)
  await expect(root.getByRole('button', { name: /全部账套.*2/ })).toBeVisible()
  await root.screenshot({ path: info.outputPath('account-set-b-scope-1440.png') })

  const overviewRequestsBeforeStatus = bOverviewCalls
  await root.getByRole('button', { name: /启用账套.*1/ }).click()
  await expect.poll(() => bListCalls).toBe(2)
  expect(bListPayloads.at(-1)?.p_status).toBe('active')
  expect(bListPayloads.at(-1)?.p_tenant_id).toBe(tenantB)
  expect(bOverviewCalls).toBe(overviewRequestsBeforeStatus)
  await root.getByRole('button', { name: '重置' }).click()
  await expect.poll(() => bListCalls).toBe(3)
  expect(bListPayloads.at(-1)?.p_status).toBeNull()
  expect(bListPayloads.at(-1)?.p_tenant_id).toBe(tenantB)

  failNextBOverview = true
  await selectScope(page, 'a')
  await selectScope(page, 'b')
  await expect(root.getByText('账套概览加载失败，当前指标暂不可用。')).toBeVisible()
  await expect(root.getByRole('button', { name: '重新加载概览' })).toBeVisible()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await root.screenshot({ path: info.outputPath('account-set-overview-error-1440.png') })
  await root.getByRole('button', { name: '重新加载概览' }).click()
  await expect(root.getByRole('button', { name: /全部账套.*2/ })).toBeVisible()

  failNextBList = true
  await root.getByRole('button', { name: /全部账套.*2/ }).click()
  await expect(root.getByText('数据加载失败', { exact: true })).toBeVisible()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await root.screenshot({ path: info.outputPath('account-set-list-error-1440.png') })
  await root.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(root.getByText('乙租户账套', { exact: true })).toBeVisible()

  await page.setViewportSize({ width: 570, height: 900 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  const hero = root.locator('.business-workspace-header')
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await expect(hero).toBeHidden()
  await expect(root.locator('.art-table-query')).toBeVisible()
  await selectScope(page, 'all')
  await expect(hero).toBeHidden()
  await expect(root.getByText('甲租户账套', { exact: true })).toBeVisible()
  await expect(root.getByText('乙租户账套', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '退出专注模式' }).click()
  await expect(hero).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await page.keyboard.press('Escape')
  await expect(hero).toBeVisible()
  expect(pageErrors).toEqual([])
  await root.screenshot({ path: info.outputPath('account-set-all-recovered-570.png') })
})
