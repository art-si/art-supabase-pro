import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const fail of [false, true]) {
  test(`作业票批量作废限制并发并刷新${fail ? '部分失败' : '成功'}结果`, async ({ page }) => {
    let active = 0
    let maximum = 0
    let refreshDuringWrite = false
    let listCalls = 0
    let writes = 0
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const rows = Array.from({ length: 8 }, (_, index) => ({
      id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
      tenantId: '11111111-1111-4111-8111-111111111111',
      permitNo: `TEST-PERMIT-${index + 1}`,
      status: 'draft',
      operationTypeName: '测试动火',
      relatedPermits: [],
      workContent: '测试作业内容',
      workStartTime: '2026-10-03T08:00:00Z',
      workEndTime: '2026-10-03T09:00:00Z'
    }))
    await page.route('**/rest/v1/**', async (route) => {
      const url = route.request().url()
      if (url.includes('smis_list_special_operation_permits_secure')) {
        listCalls++
        refreshDuringWrite ||= active > 0
        await route.fulfill({
          json: {
            records: rows,
            total: rows.length,
            overview: {
              total: rows.length,
              draft: rows.filter((row) => row.status === 'draft').length,
              voided: rows.filter((row) => row.status === 'voided').length
            }
          }
        })
      } else if (url.includes('smis_transition_special_operation_permit_secure')) {
        const body = route.request().postDataJSON()
        expect(body.p_tenant_id).toBe(rows[0].tenantId)
        expect(body.p_action).toBe('void')
        active++
        writes++
        maximum = Math.max(maximum, active)
        await new Promise((resolve) => setTimeout(resolve, body.p_id === rows[0].id ? 50 : 250))
        active--
        if (fail && body.p_id === rows[0].id) {
          await route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '作业票状态已变更，请刷新后重试' }
          })
        } else {
          const row = rows.find((item) => item.id === body.p_id)
          if (row) row.status = 'voided'
          await route.fulfill({ json: 'voided' })
        }
      } else if (url.includes('smis_list_special_operation_types_secure')) {
        await route.fulfill({ json: { records: [], total: 0 } })
      } else {
        await route.fulfill({ json: [] })
      }
    })
    await page.goto('/tests/e2e/fixtures/smis-permit-batch.html', {
      waitUntil: 'domcontentloaded',
      timeout: 120_000
    })
    await expect(page.getByText('TEST-PERMIT-8', { exact: true })).toBeVisible({ timeout: 120_000 })
    const focusSwitch = page.getByRole('switch', { name: '进入专注模式' })
    await page.locator('.el-switch').filter({ has: focusSwitch }).click()
    await expect(page.getByRole('heading', { name: '测试作业票', exact: true })).toBeHidden()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('heading', { name: '测试作业票', exact: true })).toBeVisible()
    await page.locator('.el-switch').filter({ has: focusSwitch }).click()
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(page.getByRole('heading', { name: '测试作业票', exact: true })).toBeVisible()
    await page.locator('.el-table__header-wrapper .el-checkbox').first().click()
    await page.getByRole('button', { name: '批量作废', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click()
    await expect.poll(() => writes).toBeGreaterThan(0)
    await expect(page.getByRole('button', { name: '批量作废', exact: true })).toBeDisabled()
    if (fail)
      await expect(page.getByText('作业票状态已变更，请刷新后重试', { exact: true })).toBeVisible()
    await expect.poll(() => listCalls).toBeGreaterThan(1)
    expect(maximum).toBe(3)
    expect(active).toBe(0)
    expect(refreshDuringWrite).toBe(false)
    expect(writes).toBe(fail ? 3 : rows.length)
    expect(pageErrors).toEqual([])
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }))
    expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
    await page.screenshot({
      path: `.artifacts/smis-permit-batch-${fail ? 'failure' : 'success'}.png`,
      animations: 'disabled'
    })
  })
}
