import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
for (const scenario of [
  {
    feature: 'organization',
    title: '编辑组织变革方案',
    field: '方案负责人',
    rpc: 'hr_list_organization_design_options_secure',
    kind: 'employee'
  },
  {
    feature: 'contingent',
    title: '编辑用工任务与内部责任',
    field: '内部负责人',
    rpc: 'hr_list_contingent_workforce_options_secure',
    kind: 'sponsor'
  }
]) {
  test(`${scenario.field} 编辑显示姓名工号且使用业务授权员工选择器`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width: 570, height: 900 })
    const tenantId = '11111111-1111-4111-8111-111111111111'
    const scopes: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const body = route.request().postDataJSON()
      if (scenario.feature === 'contingent' && body?.p_kind === 'position') {
        return route.fulfill({
          json: [
            {
              id: 'position-001',
              name: '历史关联岗位',
              code: 'POS-001',
              organization_id: 'organization-001'
            }
          ]
        })
      }
      if (route.request().url().includes(scenario.rpc) && body?.p_kind === scenario.kind) {
        scopes.push(body.p_tenant_id)
        return route.fulfill({
          json: [
            {
              id: 'employee-001',
              tenant_id: tenantId,
              name: '测试负责人',
              code: 'EMP-001'
            }
          ]
        })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/hr-responsible-employee.html?feature=${scenario.feature}`)
    const dialog = page.getByRole('dialog', { name: scenario.title, exact: true })
    await expect(dialog).toBeVisible({ timeout: 90_000 })
    const owner = dialog.getByRole('textbox', { name: scenario.field })
    await expect(owner).toHaveValue('测试负责人 · EMP-001')
    if (scenario.feature === 'contingent') {
      await expect(dialog.locator('.el-form-item').filter({ hasText: '关联岗位' })).toContainText(
        '历史关联岗位（POS-001）'
      )
    }
    await owner.click()
    const picker = page.getByRole('dialog', { name: '选择员工', exact: true })
    await expect(picker).toBeVisible()
    await expect(picker.getByText('EMP-001', { exact: true })).toBeVisible()
    expect(scopes.length).toBeGreaterThan(0)
    expect(scopes.every((scope) => scope === tenantId)).toBe(true)
    expect(await picker.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await page.screenshot({
      path: testInfo.outputPath('employee-picker.png'),
      animations: 'disabled'
    })
  })
}

for (const scenario of [
  {
    feature: 'organization',
    title: '编辑组织变革方案',
    rpc: 'hr_save_organization_design_scenario_secure'
  },
  {
    feature: 'contingent',
    title: '编辑用工任务与内部责任',
    rpc: 'hr_save_contingent_workforce_record_secure'
  }
]) {
  test(`${scenario.feature} 编辑记录不被当前其他租户范围覆盖`, async ({ page }) => {
    test.setTimeout(120_000)
    await prepareIsolatedSession(page)
    const home = '11111111-1111-4111-8111-111111111111'
    let payload: Record<string, unknown> | undefined
    const scopes: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const body = route.request().postDataJSON()
      if (body?.p_tenant_id) scopes.push(body.p_tenant_id)
      if (route.request().url().includes(scenario.rpc)) {
        payload = body.p_payload
        return route.fulfill({ json: '33333333-3333-4333-8333-333333333333' })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/hr-responsible-employee.html?feature=${scenario.feature}&other-scope=1`
    )
    const dialog = page.getByRole('dialog', { name: scenario.title, exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: '保存更改', exact: true }).click()
    await expect.poll(() => payload).toMatchObject({ tenant_id: home })
    if (scenario.feature === 'contingent') expect(scopes.length).toBeGreaterThan(0)
    expect(scopes.every((scope) => scope === home)).toBe(true)
  })
}

for (const scenario of [
  {
    feature: 'organization',
    title: '新增组织变更项',
    field: '所属方案',
    kind: 'scenario',
    id: 'scenario-001',
    name: '测试方案',
    code: 'SCENARIO-001'
  },
  {
    feature: 'contingent',
    title: '新增准入与退场控制项',
    field: '用工任务',
    kind: 'engagement',
    id: 'engagement-001',
    name: '测试服务',
    code: 'EXT-001'
  }
]) {
  test(`${scenario.field} 关联新增保留父记录及原租户`, async ({ page }) => {
    test.setTimeout(120_000)
    await prepareIsolatedSession(page)
    const home = '11111111-1111-4111-8111-111111111111'
    const scopes: string[] = []
    await page.route('**/rest/v1/**', (route) => {
      const body = route.request().postDataJSON()
      if (body?.p_tenant_id) scopes.push(body.p_tenant_id)
      return route.fulfill({
        json:
          body?.p_kind === scenario.kind
            ? [{ id: scenario.id, tenant_id: home, name: scenario.name, code: scenario.code }]
            : []
      })
    })
    await page.goto(
      `/tests/e2e/fixtures/hr-responsible-employee.html?feature=${scenario.feature}&child=1&other-scope=1`
    )
    const dialog = page.getByRole('dialog', { name: scenario.title, exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.el-form-item').filter({ hasText: scenario.field })).toContainText(
      scenario.name
    )
    expect(scopes.length).toBeGreaterThan(0)
    expect(scopes.every((scope) => scope === home)).toBe(true)
  })
}
