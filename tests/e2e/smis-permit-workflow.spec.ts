import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('快速切换作业票状态后旧概览不能覆盖当前统计', async ({ page }) => {
  let releaseOld!: () => void
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  let requests = 0
  let oldFinished = false
  await page.route('**/rest/v1/**', async (route) => {
    if (!route.request().url().includes('smis_list_special_operation_permits_secure')) {
      await route.fulfill({ json: [] })
      return
    }
    const isOld = ++requests === 1
    if (isOld) await oldGate
    await route.fulfill({
      json: {
        records: [],
        total: 0,
        overview: {
          total: isOld ? 99 : 2,
          draft: isOld ? 99 : 2,
          pendingApproval: 0,
          inProgress: 0,
          pendingAcceptance: 0
        }
      }
    })
    if (isOld) oldFinished = true
  })
  await page.goto('/tests/e2e/fixtures/smis-permit-batch.html')
  await expect.poll(() => requests).toBe(1)
  const draft = page.getByRole('radio', { name: /^草稿/ })
  await page.locator('.el-segmented__item').filter({ has: draft }).click()
  await expect.poll(() => requests).toBe(2)
  const total = page.locator('.business-workspace-header__metric').filter({ hasText: '作业票总数' })
  await expect(total.locator('strong')).toHaveText('2')
  releaseOld()
  await expect.poll(() => oldFinished).toBe(true)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(total.locator('strong')).toHaveText('2')
  await expect(page.getByText('99', { exact: true })).toHaveCount(0)
})

for (const scenario of [
  {
    status: 'pending_approval',
    menu: '审批 / 开始作业',
    action: 'start',
    button: '确认审批',
    result: 'approved'
  },
  {
    status: 'pending_acceptance',
    menu: '作业验收',
    action: 'accept',
    button: '确认验收',
    result: 'passed'
  },
  { status: 'draft', menu: '作废', action: 'void', button: '确认作废', result: null }
]) {
  test(`作业票${scenario.menu}保留表单输入并提交`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const row = {
      id: '33333333-3333-4333-8333-000000000001',
      tenantId: '11111111-1111-4111-8111-111111111111',
      permitNo: 'TEST-WORKFLOW-1',
      status: scenario.status,
      relatedPermits: []
    }
    let writes = 0
    await page.route('**/rest/v1/**', async (route) => {
      const url = route.request().url()
      if (url.includes('smis_list_special_operation_permits_secure')) {
        await route.fulfill({ json: { records: [row], total: 1, overview: { total: 1 } } })
      } else if (url.includes('smis_transition_special_operation_permit_secure')) {
        const body = route.request().postDataJSON()
        expect(body.p_action).toBe(scenario.action)
        expect(body.p_tenant_id).toBe(row.tenantId)
        expect(JSON.stringify(body)).toContain('测试处理说明')
        expect(JSON.stringify(body)).toContain(scenario.result ?? '测试处理说明')
        writes++
        await route.fulfill({ json: 'completed' })
      } else await route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/smis-permit-batch.html')
    await expect(page.getByText(row.permitNo, { exact: true })).toBeVisible()
    const more = page.getByRole('button', { name: '更多操作', exact: true }).first()
    if (page.viewportSize()!.width <= 640) await more.tap()
    else await more.hover()
    await page.getByRole('menuitem', { name: scenario.menu, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('textarea').fill('测试处理说明')
    await dialog.getByRole('button', { name: scenario.button, exact: true }).click()
    await expect.poll(() => writes).toBe(1)
    await expect(dialog).toBeHidden()
    expect(errors).toEqual([])
  })
}
