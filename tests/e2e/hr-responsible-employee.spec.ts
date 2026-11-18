import { expect, test } from '@playwright/test'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'
import { expectCompactOverlayLabel } from './support/overlay-label-layout'

test.use({ storageState: { cookies: [], origins: [] } })

test('编辑组织变革方案在专注填单中显示长标签全文并保留草稿', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  const appearance = { theme: 'dark', boxBorderMode: false } as const
  await prepareAppearance(page, appearance)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tests/e2e/fixtures/hr-responsible-employee.html?feature=organization')
  await assertAppearance(page, appearance)

  const dialog = page.getByRole('dialog', { name: '编辑组织变革方案', exact: true })
  const field = dialog.locator('[data-art-form-item-key="objective"]')
  const label = '变革目标与业务理由'
  const objective = field.getByRole('textbox', { name: new RegExp(`${label}$`) })
  const draft = '保留未提交的变革目标与业务理由'
  await expect(objective).toHaveValue('测试组织变革')
  await objective.fill(draft)
  await dialog.getByRole('button', { name: '进入专注填单', exact: true }).click()
  await expect(objective).toHaveValue(draft)

  const caption = await expectCompactOverlayLabel(field)
  await caption.hover()
  const tooltip = page.getByRole('tooltip').filter({ hasText: label })
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toHaveText(label)
  await dialog.screenshot({ path: testInfo.outputPath('organization-focus-label-tooltip.png') })

  await page.mouse.move(0, 0)
  await expect(tooltip).toBeHidden()
  await objective.focus()
  await expect(tooltip).toHaveText(label)
  await expect(objective).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(tooltip).toBeHidden()
  await expect(dialog).toBeVisible()
  await expect(objective).toBeFocused()

  await dialog.getByRole('button', { name: '退出专注填单', exact: true }).click()
  await expect(tooltip).toBeHidden()
  await expect(dialog.getByRole('button', { name: '进入专注填单', exact: true })).toBeVisible()
  await expect(objective).toHaveValue(draft)
})

test('窄屏员工名单行省略且可通过键盘核对完整身份', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  const appearance = {
    theme: testInfo.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !testInfo.project.name.includes('shadow')
  } as const
  await prepareAppearance(page, appearance)
  const tenantId = '11111111-1111-4111-8111-111111111111'
  const name = '阿布都热依木江·买买提艾力'
  const code = 'HR-ORG-2026-00120'
  const fullLabel = `${name} · ${code}`
  const saveUrl = '**/rest/v1/rpc/hr_save_organization_design_scenario_secure'
  await page.route('**/rest/v1/rpc/hr_list_organization_design_options_secure', (route) =>
    route.fulfill({
      json:
        route.request().postDataJSON()?.p_kind === 'employee'
          ? [
              { id: 'employee-001', tenant_id: tenantId, name: '测试负责人', code: 'EMP-001' },
              { id: 'employee-002', tenant_id: tenantId, name, code }
            ]
          : []
    })
  )
  await page.route(saveUrl, (route) => route.fulfill({ json: 'scenario-001' }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/e2e/fixtures/hr-responsible-employee.html?feature=organization')
  const dialog = page.getByRole('dialog', { name: '编辑组织变革方案', exact: true })
  const owner = dialog.getByRole('textbox', { name: '方案负责人', exact: true })
  await expect(owner).toBeVisible()
  await assertAppearance(page, appearance)
  const picker = page.getByRole('dialog', { name: '选择员工', exact: true })
  const row = picker.getByRole('row').filter({ hasText: name })
  const summary = picker.locator('.art-dialog__footer-left')
  const choose = row.getByRole('checkbox', { name: fullLabel, exact: true })
  const confirm = picker.getByRole('button', { name: '确定', exact: true })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await owner.press('Enter')
    const identity = row.getByText(name, { exact: true })
    await expect(identity).toBeInViewport({ ratio: 1 })
    const cell = await identity.evaluate((node) => {
      const { whiteSpace, textOverflow } = getComputedStyle(node)
      return { whiteSpace, textOverflow, overflow: node.scrollWidth - node.clientWidth }
    })
    expect(cell, `${width}px 下长姓名保持单行省略`).toMatchObject({
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis'
    })
    expect(cell.overflow).toBeGreaterThan(0)
    await choose.press('Space')
    await expect(choose).toBeChecked()
    await expect(summary).toHaveText(`当前选择：${fullLabel}`)
    expect(await summary.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
    await expect(confirm).toBeInViewport({ ratio: 1 })
    await picker.screenshot({ path: testInfo.outputPath(`employee-picker-${width}.png`) })
    if (width === 390) await page.keyboard.press('Escape')
    else await confirm.press('Enter')
    await expect(picker).toBeHidden()
    await expect(owner).toBeFocused()
  }
  await expect(owner).toHaveValue(fullLabel)
  await expect(owner).toHaveAttribute('title', fullLabel)
  await owner.press('Enter')
  await expect(summary).toHaveText(`当前选择：${fullLabel}`)
  await expect(choose).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(owner).toBeFocused()

  const save = page.waitForRequest(saveUrl)
  await dialog.getByRole('button', { name: '保存更改', exact: true }).press('Enter')
  expect((await save).postDataJSON()).toMatchObject({
    p_payload: { owner_employee_id: 'employee-002', tenant_id: tenantId }
  })
})

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
        '历史关联岗位 · POS-001'
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
    field: '方案负责人',
    rpc: 'hr_save_organization_design_scenario_secure'
  },
  {
    feature: 'contingent',
    title: '编辑用工任务与内部责任',
    field: '内部负责人',
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
    await expect(dialog.getByRole('textbox', { name: scenario.field })).toHaveValue(/^测试负责人/)
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
