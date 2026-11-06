import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const entry of [
  {
    page: 'personnel/organization-design',
    rpc: 'hr_list_organization_design_records_secure',
    kind: 'scenario',
    target: 'change',
    action: '查看变更清单',
    title: '只读组织方案'
  },
  {
    page: 'operations/policy-acknowledgement',
    rpc: 'hr_list_policy_acknowledgement_records_secure',
    kind: 'policy',
    target: 'receipt',
    action: '查看员工签收',
    title: '只读政策制度'
  }
]) {
  test(`普通只读账号可使用 ${entry.action}，不能获得管理动作`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.route(`**/rest/v1/rpc/${entry.rpc}`, (route) => {
      const kind = route.request().postDataJSON().p_kind
      const record = {
        id: '11111111-1111-4111-8111-111111111191',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        scenario_name: entry.title,
        scenario_code: 'ORG-READ',
        scenario_type: 'restructure',
        policy_title: entry.title,
        policy_code: 'POL-READ',
        version_no: '1.0',
        status: entry.kind === 'scenario' ? 'approved' : 'published',
        risk_level: 'low'
      }
      return route.fulfill({
        json: {
          records: kind === entry.kind ? [record] : [],
          total: kind === entry.kind ? 1 : 0,
          evidence_access: false
        }
      })
    })
    await page.goto(`/tests/e2e/fixtures/hr-all-pages.html?page=${entry.page}&role=ordinary`, {
      waitUntil: 'commit'
    })
    await expect(page.getByText(entry.title, { exact: true }).first()).toBeVisible({
      timeout: 90_000
    })
    await page.getByRole('button', { name: '更多操作', exact: true }).first().click()
    await expect(page.getByRole('menuitem', { name: entry.action, exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /编辑|删除|发布|移交|批准/ })).toHaveCount(0)
    await page.screenshot({
      path: info.outputPath('ordinary-read-entry.png'),
      animations: 'disabled'
    })
    const selected = page.waitForRequest(
      (request) =>
        request.url().includes(entry.rpc) && request.postDataJSON()?.p_kind === entry.target
    )
    await page.getByRole('menuitem', { name: entry.action, exact: true }).click()
    await selected
    expect(errors).toEqual([])
  })
}
