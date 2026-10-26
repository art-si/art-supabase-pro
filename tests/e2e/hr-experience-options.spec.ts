import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

const tenantA = 'tenant-a'
const tenantB = 'tenant-b'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

async function prepareDialogFixture(page: Page): Promise<void> {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({
      json: [
        { id: tenantA, tenant_code: 'A', tenant_name: '甲租户', status: '1' },
        { id: tenantB, tenant_code: 'B', tenant_name: '乙租户', status: '1' }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/hr_list_business_organization_options_secure', (route) =>
    route.fulfill({ json: [] })
  )
  await page.goto('/tests/e2e/fixtures/hr-experience-options.html', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  })
  await expect(page.locator('#hr-experience-options')).toBeVisible({ timeout: 60_000 })
}

async function openAction(page: Page, tenantId?: string): Promise<void> {
  await page.evaluate((targetTenant) => {
    window.dispatchEvent(new CustomEvent('hr-experience-open-action', { detail: targetTenant }))
  }, tenantId)
}

async function openSurvey(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('hr-experience-open-survey')))
}

async function selectTenantScope(page: Page, tenantId: string): Promise<void> {
  await page.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('hr-experience-set-scope', { detail: id }))
  }, tenantId)
}

function surveyRow(tenantId: string, index: number) {
  return {
    id: `survey-${tenantId}-${index}`,
    tenant_id: tenantId,
    survey_name: `${tenantId}-${index}`,
    survey_code: `CODE-${tenantId}-${index}`,
    status: 'open',
    minimum_group_size: 5
  }
}

test('行动选租户后读取该租户全部调查分页', async ({ page }) => {
  await prepareDialogFixture(page)
  await selectTenantScope(page, tenantA)
  const ranges: Array<{ tenantId: string | null; from: number; to: number }> = []
  await page.route('**/rest/v1/rpc/hr_list_employee_experience_records_secure', (route) => {
    const body = route.request().postDataJSON()
    if (body.p_tenant_id !== tenantB) return route.fulfill({ json: { records: [], total: 0 } })
    ranges.push({ tenantId: body.p_tenant_id, from: body.p_from, to: body.p_to })
    const start = Number(body.p_from)
    const count = Math.min(200, 205 - start)
    return route.fulfill({
      json: {
        records: Array.from({ length: count }, (_, offset) => surveyRow(tenantB, start + offset)),
        total: 205
      }
    })
  })

  await openAction(page)
  const dialog = page.getByRole('dialog', { name: '新增员工体验改善行动' })
  await expect(dialog).toBeVisible()
  await selectTenantScope(page, tenantB)
  await expect.poll(() => ranges.length).toBe(2)
  expect(ranges).toEqual([
    { tenantId: tenantB, from: 0, to: 199 },
    { tenantId: tenantB, from: 200, to: 399 }
  ])
  await dialog.getByRole('combobox', { name: /关联调查/ }).click()
  await expect(
    page.locator('.el-select-dropdown:visible').getByText(`${tenantB}-204（CODE-${tenantB}-204）`)
  ).toBeVisible()
})

test('行动关闭再打开时旧调查结果与预设回填不会覆盖新会话', async ({ page }) => {
  await prepareDialogFixture(page)
  let releaseA: (() => void) | undefined
  const heldA = new Promise<void>((resolve) => {
    releaseA = resolve
  })
  let markARequested: (() => void) | undefined
  const aRequested = new Promise<void>((resolve) => {
    markARequested = resolve
  })
  await page.route('**/rest/v1/rpc/hr_list_employee_experience_records_secure', async (route) => {
    const tenantId = route.request().postDataJSON().p_tenant_id as string
    if (tenantId === tenantA) {
      markARequested?.()
      await heldA
    }
    return route.fulfill({
      json: { records: [surveyRow(tenantId, 0)], total: 1 }
    })
  })

  await openAction(page, tenantA)
  const first = page.getByRole('dialog', { name: '新增员工体验改善行动' })
  await expect(first).toBeVisible()
  await aRequested
  await first.getByRole('button', { name: 'Close this dialog', exact: true }).click()
  await expect(first).toBeHidden()

  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().includes('hr_list_employee_experience_records_secure') &&
      response.request().postDataJSON()?.p_tenant_id === tenantA
  )
  await openAction(page, tenantB)
  const current = page.getByRole('dialog', { name: '新增员工体验改善行动' })
  await expect(current).toBeVisible()
  await expect(current.getByRole('combobox', { name: '关联调查' })).toBeEnabled()
  releaseA?.()
  await oldResponse
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  await current.getByRole('combobox', { name: '关联调查' }).click()
  await expect(page.locator('.el-select-dropdown:visible').getByText(`${tenantB}-0`)).toBeVisible()
  await expect(page.locator('.el-select-dropdown:visible').getByText(`${tenantA}-0`)).toHaveCount(0)
})

for (const kind of ['action', 'survey'] as const) {
  test(`${kind} 关联选项失败后阻止确认并支持重试`, async ({ page }, testInfo) => {
    await prepareDialogFixture(page)
    await page.setViewportSize({ width: 390, height: 900 })
    await selectTenantScope(page, tenantB)
    let failedRequests = 0
    if (kind === 'action') {
      await page.route('**/rest/v1/rpc/hr_list_employee_experience_records_secure', (route) => {
        failedRequests += 1
        return failedRequests === 1
          ? route.fulfill({ status: 503, json: { code: 'PGRST500', message: 'temporary failure' } })
          : route.fulfill({ json: { records: [surveyRow(tenantB, 0)], total: 1 } })
      })
    } else {
      await page.route('**/rest/v1/rpc/hr_list_business_organization_options_secure', (route) => {
        failedRequests += 1
        return failedRequests === 1
          ? route.fulfill({ status: 503, json: { code: 'PGRST500', message: 'temporary failure' } })
          : route.fulfill({
              json: [
                {
                  id: 'organization-b',
                  tenant_id: tenantB,
                  organization_name: '乙租户组织',
                  organization_code: 'ORG-B',
                  status: '1'
                }
              ]
            })
      })
    }
    if (kind === 'action') await openAction(page)
    else await openSurvey(page)
    const dialog = page.getByRole('dialog', {
      name: kind === 'action' ? '新增员工体验改善行动' : '新建员工体验调查'
    })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByText(kind === 'action' ? '行动所需资料加载失败' : '调查所需资料加载失败', {
        exact: true
      })
    ).toBeVisible()
    const confirm = dialog.getByRole('button', {
      name: kind === 'action' ? '创建行动' : '创建草稿'
    })
    await expect(confirm).toBeDisabled()
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true)
    await dialog.screenshot({
      path: testInfo.outputPath(`${kind}-error.png`),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '重新加载' }).click()
    await expect(dialog.getByText(/所需资料加载失败/)).toHaveCount(0)
    await expect(confirm).toBeEnabled()
    if (kind === 'action') {
      const survey = dialog.getByRole('combobox', { name: /关联调查/ })
      await expect(survey).toBeVisible({ timeout: 60_000 })
      await survey.click()
      await page
        .locator('.el-select-dropdown:visible')
        .getByText(`${tenantB}-0（CODE-${tenantB}-0）`, { exact: true })
        .click()
    } else {
      await expect(dialog.getByPlaceholder('例如 ENGAGEMENT-2027-Q1')).toBeVisible({
        timeout: 60_000
      })
      await expect(dialog.getByPlaceholder('输入员工可理解的调查名称')).toBeEnabled()
    }
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      .toBe(true)
    await dialog.screenshot({
      path: testInfo.outputPath(`${kind}-recovered.png`),
      animations: 'disabled'
    })
    expect(failedRequests).toBe(2)
  })
}
