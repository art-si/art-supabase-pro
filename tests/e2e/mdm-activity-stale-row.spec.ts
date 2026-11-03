import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(180000)

test('工艺活动替换后旧删除与旧下移不会改动当前活动', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  const writes: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (
      path.startsWith('/rest/v1/') &&
      (['PATCH', 'PUT', 'DELETE'].includes(request.method()) ||
        (request.method() === 'POST' && !path.includes('/rpc/')))
    )
      writes.push(`${request.method()} ${path}`)
  })
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    let json: object = []
    if (path.endsWith('/mdm_process_route'))
      json = [
        {
          id: 'route-stale',
          tenant_id: 'test-tenant',
          code: 'ROUTE-STALE',
          name: '旧活动回调测试路线',
          enabled: true,
          material: null
        }
      ]
    if (path.endsWith('/mdm_process_route_sequence'))
      json = [
        {
          id: 'sequence-stale',
          route_id: 'route-stale',
          sequence_no: 1,
          sequence_type: 'main',
          remark: ''
        }
      ]
    if (path.endsWith('/mdm_process_route_step'))
      json = [
        {
          id: 'step-stale',
          tenant_id: 'test-tenant',
          route_id: 'route-stale',
          sequence_id: 'sequence-stale',
          code: '10',
          name: '旧活动回调测试工序',
          sort: 10,
          work_center_ids: [],
          activities: [
            {
              name: '过期活动',
              activity_type: 'processing',
              basic_quantity: 1,
              activity_unit: 'minute',
              maintenance_rule: 'no_check'
            }
          ],
          sop_documents: []
        }
      ]
    if (path.endsWith('/rpc/mdm_process_route_references'))
      json = {
        groups: [],
        operations: [],
        controlCodes: [],
        units: [],
        departments: [],
        workCenters: [],
        activityFormulas: [],
        suppliers: [],
        esopDocuments: []
      }
    const count = Array.isArray(json) ? json.length : 0
    return route.fulfill({
      json,
      headers: {
        'content-range': count ? `0-${count - 1}/${count}` : '*/0',
        'access-control-expose-headers': 'content-range'
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/process-number-reuse.html?edit=1', {
    waitUntil: 'commit'
  })
  await expect(page.getByRole('button', { name: '查看工艺数量' })).toBeVisible({ timeout: 120000 })
  await page.getByRole('button', { name: '查看工艺数量' }).click()
  await page
    .locator('.route-maintenance__steps')
    .getByRole('button', { name: '编辑', exact: true })
    .click()
  const detail = page.getByRole('dialog', { name: '编辑工序明细' })
  await detail.getByRole('tab', { name: /活动信息/ }).click()
  const table = detail.locator('.art-table.process-activity-table')
  const names = detail.getByRole('textbox', { name: /第 \d+ 行活动名称/ })
  await expect(names).toHaveCount(1)
  await detail.getByRole('button', { name: '新增活动', exact: true }).click()
  await names.nth(1).fill('当前活动一')
  await page
    .getByRole('button', { name: '捕获工艺旧活动操作' })
    .evaluate((button) => (button as HTMLButtonElement).click())
  await expect(page.getByTestId('mdm-stale-captured')).toHaveText('{"delete":true,"down":true}')
  await table.getByRole('button', { name: '删除活动', exact: true }).first().click()
  await expect(names).toHaveCount(1)
  await expect(names.first()).toHaveValue('当前活动一')
  await detail.getByRole('button', { name: '新增活动', exact: true }).click()
  await names.nth(1).fill('当前活动二')
  await page
    .getByRole('button', { name: '触发工艺旧删除' })
    .evaluate((button) => (button as HTMLButtonElement).click())
  await expect(names).toHaveCount(2)
  await expect(names.nth(0)).toHaveValue('当前活动一')
  await expect(names.nth(1)).toHaveValue('当前活动二')
  await page
    .getByRole('button', { name: '触发工艺旧下移' })
    .evaluate((button) => (button as HTMLButtonElement).click())
  await expect(page.getByTestId('mdm-stale-invoked')).toHaveText('{"delete":1,"down":1}')
  await expect(names).toHaveCount(2)
  await expect(names.nth(0)).toHaveValue('当前活动一')
  await expect(names.nth(1)).toHaveValue('当前活动二')
  await detail.screenshot({
    path: info.outputPath('mdm-activity-stale-row.png'),
    animations: 'disabled'
  })
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
