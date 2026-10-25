import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const entity of ['contract', 'qualification']) {
  test(`普通用户 ${entity} 关联定位随实际表格状态更新`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let stage: 'matched' | 'empty' | 'error' | 'unrelated' = 'matched'
    let release: (() => void) | undefined
    let held = new Promise<void>((resolve) => {
      release = resolve
    })
    let requests = 0
    let releaseLate: (() => void) | undefined
    const lateGate = new Promise<void>((resolve) => {
      releaseLate = resolve
    })
    let lateFinished = false
    await page.route('**/rest/v1/rpc/hr_compliance_overview_secure**', (route) =>
      route.fulfill({ json: {} })
    )
    await page.route('**/rest/v1/rpc/hr_list_compliance_records_secure**', async (route) => {
      requests++
      const currentStage = stage
      const currentGate = held
      const isLate = currentGate === lateGate
      await currentGate
      if (currentStage === 'error') {
        await route.fulfill({ status: 400, json: { message: '合规资料加载失败，请重试' } })
        return
      }
      const rows =
        currentStage === 'empty'
          ? []
          : [
              {
                id: currentStage === 'unrelated' ? 'other-record' : id,
                contract_no: 'CONTRACT-001',
                contract_status: 'draft',
                qualification_name: '测试资质',
                certificate_no: 'QUAL-001',
                verification_status: 'pending',
                status: 'active',
                tenant_id: 'permission-test-tenant',
                employee: { employee_name: '测试员工', employee_no: 'EMP-001' }
              }
            ]
      await route.fulfill({ json: { records: rows, total: rows.length } })
      if (isLate) lateFinished = true
    })
    await page.goto(
      `/tests/e2e/fixtures/hr-delete-workflows.html?page=compliance&entity=${entity}&location`
    )
    const notice = page.locator('.master-delete-notice')
    await expect(notice).toContainText('定位待完成', { timeout: 120_000 })
    await expect.poll(() => requests).toBeGreaterThan(0)
    held = Promise.resolve()
    release?.()
    await expect(notice).toContainText('已找到关联记录')
    await page
      .getByRole('switch', { name: '显示表格右侧工具栏', exact: true })
      .locator('..')
      .click()
    const refresh = page.getByRole('button', { name: '刷新表格', exact: true })
    for (const nextStage of ['error', 'empty', 'unrelated', 'matched'] as const) {
      stage = nextStage
      await refresh.click()
      await expect(notice).toContainText(nextStage === 'matched' ? '已找到关联记录' : '定位待完成')
      if (nextStage === 'error')
        await expect(
          page.getByText('合规资料加载失败，请重试', { exact: true }).first()
        ).toBeVisible()
    }
    held = lateGate
    stage = 'unrelated'
    const beforeLateRequest = requests
    await refresh.click()
    await expect.poll(() => requests).toBeGreaterThan(beforeLateRequest)
    await expect(notice).toContainText('定位待完成')
    held = Promise.resolve()
    stage = 'matched'
    await page
      .getByRole('tab')
      .filter({ hasText: entity === 'contract' ? '员工资质' : '劳动合同' })
      .click()
    await expect(notice).toContainText('定位待完成')
    await page
      .getByRole('tab')
      .filter({ hasText: entity === 'contract' ? '劳动合同' : '员工资质' })
      .click()
    await expect(notice).toContainText('已找到关联记录')
    releaseLate?.()
    await expect.poll(() => lateFinished).toBe(true)
    await expect(notice).toContainText('已找到关联记录')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await notice.screenshot({ path: info.outputPath('hr-location-found.png') })
    expect(errors).toEqual([])
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
  })
}

test('员工花名册定位复用公共表格状态', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
  let mode: 'matched' | 'empty' | 'error' = 'matched'
  await page.route('**/rest/v1/rpc/hr_list_employees_secure**', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ p_record_id: id })
    if (mode === 'error') {
      await route.fulfill({ status: 400, json: { message: '员工资料加载失败，请重试' } })
      return
    }
    const rows =
      mode === 'empty'
        ? []
        : [
            {
              id,
              employee_name: '测试员工',
              employee_no: 'EMP-001',
              tenant_id: 'permission-test-tenant',
              employment_status: 'active'
            }
          ]
    await route.fulfill({ json: { records: rows, total: rows.length, field_access: {} } })
  })
  await page.goto('/tests/e2e/fixtures/hr-delete-workflows.html?page=employee&location')
  const notice = page.locator('.master-delete-notice')
  await expect(notice).toContainText('已找到关联记录', { timeout: 120_000 })
  await page.getByRole('switch', { name: '显示表格右侧工具栏', exact: true }).locator('..').click()
  const refresh = page.getByRole('button', { name: '刷新表格', exact: true })
  for (const next of ['empty', 'error', 'matched'] as const) {
    mode = next
    await refresh.click()
    await expect(notice).toContainText(next === 'matched' ? '已找到关联记录' : '定位待完成')
    if (next === 'error')
      await expect(
        page.getByText('员工资料加载失败，请重试', { exact: true }).first()
      ).toBeVisible()
  }
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await notice.screenshot({ path: info.outputPath('roster-location-found.png') })
})
