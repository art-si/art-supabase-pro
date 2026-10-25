import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test('用工组织切换租户后忽略迟到的旧选项', async ({ page }) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  const home = '11111111-1111-4111-8111-111111111111'
  const other = '22222222-2222-4222-8222-222222222222'
  await page.addInitScript((tenantId) => {
    const key = `sys-v${localStorage.getItem('sys-version')}-user`
    const profile = JSON.parse(localStorage.getItem(key) || '{}')
    profile.info = { ...profile.info, tenantId, platformSuper: true }
    localStorage.setItem(key, JSON.stringify(profile))
  }, home)
  let releaseOther: (() => void) | undefined
  let homeRequests = 0
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/sys_tenant?'))
      return route.fulfill({
        json: [
          { id: home, tenant_name: '平台租户', tenant_code: 'PLATFORM', status: '1' },
          { id: other, tenant_name: '业务租户', tenant_code: 'BUSINESS', status: '1' }
        ]
      })
    if (url.includes('hr_list_business_organization_options_secure')) {
      const tenant = route.request().postDataJSON().p_tenant_id
      if (tenant === other)
        await new Promise<void>((resolve) => {
          releaseOther = resolve
        })
      else homeRequests += 1
      return route.fulfill({
        json: [
          {
            id: tenant === home ? 'home-org' : 'other-org',
            tenant_id: tenant,
            organization_name: tenant === home ? '平台组织' : '业务组织',
            organization_code: 'ORG',
            organization_type: 'department',
            parent_id: null,
            status: '1'
          }
        ]
      })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto(
    '/tests/e2e/fixtures/hr-all-pages.html?page=operations/contingent-workforce&scope-test=1'
  )
  await page.getByRole('button', { name: '新增用工任务', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: '新增用工任务与内部责任', exact: true })
  await expect(dialog).toBeVisible()
  await expect.poll(() => homeRequests).toBeGreaterThan(0)
  await page.getByRole('button', { name: '切换业务租户', exact: true }).click()
  await expect.poll(() => Boolean(releaseOther)).toBe(true)
  const previousHomeRequests = homeRequests
  await page.getByRole('button', { name: '切换平台租户', exact: true }).click()
  await expect.poll(() => homeRequests).toBeGreaterThan(previousHomeRequests)
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().includes('hr_list_business_organization_options_secure') &&
      response.request().postDataJSON().p_tenant_id === other
  )
  releaseOther!()
  await oldResponse
  await dialog.getByRole('combobox', { name: /用工组织$/ }).click()
  await expect(page.getByRole('treeitem').filter({ hasText: '平台组织' })).toBeVisible()
  await expect(page.getByRole('treeitem').filter({ hasText: '业务组织' })).toHaveCount(0)
})
