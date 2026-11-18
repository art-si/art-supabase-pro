import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(300_000)

test.beforeEach(async ({ page }, { project }) => {
  await prepareIsolatedSession(page)
  await page.addInitScript(
    ({ boxMode, dark }) => {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          document.documentElement.dataset.boxMode = boxMode
          document.documentElement.classList.toggle('dark', dark)
        },
        { once: true }
      )
    },
    {
      boxMode: project.name.includes('shadow') ? 'shadow-mode' : 'border-mode',
      dark: project.name.includes('dark')
    }
  )
})

for (const scenario of [
  {
    feature: 'organization',
    dialogTitle: '新增组织',
    summaryTitle: '建立新的组织节点',
    description: '组织建立后，可在用户与角色管理中直接选择该节点完成授权归属。',
    tag: '新增节点'
  },
  {
    feature: 'user-role',
    dialogTitle: '分配用户角色',
    summaryTitle: '跨区域系统管理员',
    description: 'context.user@example.invalid',
    tag: '已选 2 项'
  }
]) {
  test(`系统弹窗复用上下文摘要：${scenario.dialogTitle}`, async ({ page }, testInfo) => {
    const boxMode = testInfo.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    const dark = testInfo.project.name.includes('dark')
    await page.goto(`/tests/e2e/fixtures/system-dialog-context.html?feature=${scenario.feature}`)
    await expect(page.locator('html')).toHaveAttribute('data-box-mode', boxMode)
    if (dark) await expect(page.locator('html')).toHaveClass(/dark/)

    const dialog = page.getByRole('dialog', { name: scenario.dialogTitle, exact: true })
    await expect(dialog).toBeVisible()
    const summary = dialog.getByRole('group', { name: scenario.summaryTitle, exact: true })
    await expect(summary).toContainText(scenario.description)
    await expect(summary.locator('.el-tag')).toContainText(scenario.tag)
    await expect(summary.locator('.art-entity-summary__icon')).toBeVisible()
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await page.screenshot({
      path: testInfo.outputPath('context-summary.png'),
      animations: 'disabled'
    })
  })
}

test.describe('角色分配窄屏多选', () => {
  test.use({ hasTouch: true })

  test('折叠后可通过键盘和触屏核对完整角色并提交编码', async ({ page }, testInfo) => {
    const roles = [
      { code: 'role-a', name: '华中生产系统运营管理员' },
      { code: 'role-b', name: '区域仓储和库存报表审核员' },
      { code: 'role-c', name: '总部运输调度与客户结算审批员' },
      { code: 'role-d', name: '物料主数据维护专员' },
      { code: 'role-e', name: '跨区供应链审计查看员' }
    ] as const
    const roleNames = roles.map(({ name }) => name)
    const tenantId = '11111111-1111-4111-8111-111111111111'
    const rolesUrl = '**/rest/v1/sys_role?*'
    const writeUrl = '**/functions/v1/sync-user'
    await page.route(rolesUrl, (route) =>
      route.fulfill({
        json: roles.map(({ code, name }, index) => ({
          id: `role-record-${index + 1}`,
          role_code: code,
          role_name: name,
          tenant_id: tenantId,
          enabled: true
        }))
      })
    )
    await page.route(writeUrl, (route) => route.fulfill({ json: {} }))
    await page.setViewportSize({ width: 1440, height: 900 })
    const rolesRequest = page.waitForRequest(rolesUrl)
    await page.goto('/tests/e2e/fixtures/system-dialog-context.html?feature=user-role')
    const dialog = page.getByRole('dialog', { name: '分配用户角色', exact: true })
    const field = dialog.locator('[data-art-form-item-key="userRoles"]')
    const combobox = field.getByRole('combobox', { name: '已分配角色', exact: true })
    const control = field.locator('.el-select__wrapper')
    const summary = control.locator('.el-select__collapse-item')
    const chips = control.locator(
      '.el-select__selected-item:not(.el-select__collapse-item) .el-select__tags-text'
    )
    const selected = page.getByRole('option', { selected: true })
    const roleFilters = new URL((await rolesRequest).url()).searchParams
    expect(roleFilters.get('tenant_id')).toBe(`eq.${tenantId}`)
    expect(roleFilters.get('enabled')).toBe('eq.true')

    await combobox.press('ArrowDown')
    await expect(selected).toHaveText(roleNames.slice(0, 2))
    for (const name of roleNames.slice(2)) {
      await page.getByRole('option', { name, exact: true }).click()
    }
    await combobox.press('Escape')
    await expect(dialog.getByText('已选 5 项', { exact: true })).toBeVisible()

    const dimensions: Array<{ viewport: number; width: number; height: number }> = []
    for (const viewport of [1440, 390, 320]) {
      await page.setViewportSize({ width: viewport, height: viewport === 1440 ? 900 : 844 })
      const visibleRoles = viewport === 1440 ? 3 : 1
      await expect(chips).toHaveCount(visibleRoles)
      await expect(summary).toHaveText(new RegExp(`\\+\\s*${roleNames.length - visibleRoles}$`))
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
      const controlBounds = await control.boundingBox()
      if (!controlBounds) throw new Error('找不到已分配角色控件')
      const { width, height } = controlBounds
      dimensions.push({ viewport, width, height })
      await dialog.screenshot({ path: testInfo.outputPath(`role-selection-${viewport}.png`) })

      await combobox.press('ArrowDown')
      await expect(selected).toHaveText(roleNames)
      const clippedRoles = await selected.evaluateAll((options) =>
        options.flatMap((option) => {
          const label = option.querySelector('span') ?? option
          const range = document.createRange()
          range.selectNodeContents(label)
          const bounds = option.getBoundingClientRect()
          return option.scrollWidth > option.clientWidth + 1 ||
            range.getBoundingClientRect().right > bounds.right + 1 ||
            bounds.left < 0 ||
            bounds.right > innerWidth + 1
            ? [label.textContent]
            : []
        })
      )
      expect(clippedRoles, `${viewport}px 下展开的角色名称应完整可读`).toEqual([])
      await combobox.press('Escape')

      await combobox.tap()
      await expect(selected).toHaveText(roleNames)
      await combobox.press('Escape')
    }
    await testInfo.attach('role-selection-dimensions', {
      body: JSON.stringify(dimensions),
      contentType: 'application/json'
    })

    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(chips).toHaveCount(3)
    await page.setViewportSize({ width: 320, height: 844 })
    await expect(chips).toHaveCount(1)
    const removedRole = roles[3]
    const remainingRoles = roles.filter(({ code }) => code !== removedRole.code)
    await combobox.tap()
    await page.getByRole('option', { name: removedRole.name, exact: true }).tap()
    await expect(selected).toHaveText(remainingRoles.map(({ name }) => name))
    await combobox.press('Escape')
    await expect(dialog.getByText('已选 4 项', { exact: true })).toBeVisible()

    const write = page.waitForRequest(writeUrl)
    await dialog.getByRole('button', { name: '确定', exact: true }).tap()
    const writeRequest = await write
    expect(writeRequest.method()).toBe('POST')
    expect(writeRequest.postDataJSON()).toMatchObject({
      action: 'assign_roles',
      id: 'user-context-test',
      app_user_data: {
        tenant_id: tenantId,
        user_roles: remainingRoles.map(({ code }) => code)
      }
    })
    await expect(dialog).toBeHidden()
    for (const { viewport, height } of dimensions) {
      expect(height, `${viewport}px 下已选角色应压缩为至多两行`).toBeLessThanOrEqual(68)
    }
  })
})
