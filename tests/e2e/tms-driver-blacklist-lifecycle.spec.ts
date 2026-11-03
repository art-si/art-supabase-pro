import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const activeId = '11111111-1111-4111-8111-111111111201'
const driverId = '11111111-1111-4111-8111-111111111301'
const now = '2026-11-02T08:00:00+08:00'
const dictionaryValues: Record<string, Array<[string, string]>> = {
  tmsDriverOwnership: [
    ['self', '自有司机'],
    ['carrier', '承运商司机']
  ],
  tmsDriverType: [
    ['primary', '主驾'],
    ['secondary', '副驾']
  ],
  tmsDriverBlacklistStatus: [
    ['active', '黑名单'],
    ['released', '已解除']
  ]
}
const dictionaryRows = Object.entries(dictionaryValues).flatMap(([code, values]) =>
  values.map(([value, label], sort) => ({
    id: `${code}-${value}`,
    code: value,
    label,
    value,
    status: '1',
    sort,
    dict_type_table: { code, name: code }
  }))
)

const exactDetailRow = {
  id: activeId,
  tenantId,
  driverId,
  driverName: '验收司机甲',
  driverOwnership: 'carrier',
  driverType: 'primary',
  blacklistedAt: now,
  reason: '违反安全要求',
  status: 'released',
  createBy: '验收员',
  createTime: now,
  updateTime: now
}

async function mockExactDetail(
  page: Page,
  onRead: (id: string) => Promise<typeof exactDetailRow | null> | typeof exactDetailRow | null
): Promise<string[]> {
  const requestedIds: string[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'sys_dictionary') {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      return route.fulfill({
        json: code
          ? dictionaryRows.filter((row) => row.dict_type_table.code === code)
          : dictionaryRows
      })
    }
    if (endpoint === 'tms_list_driver_blacklist_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    if (endpoint === 'tms_get_driver_blacklist_secure') {
      const request = route.request().postDataJSON() as { p_id?: string }
      const id = request.p_id ?? ''
      requestedIds.push(id)
      return route.fulfill({ json: await onRead(id) })
    }
    return route.fulfill({ json: [] })
  })
  return requestedIds
}

test('司机黑名单展示关联资料、司机选择及解除历史', async ({ page }, info) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
    process.stderr.write(`页面异常：${error.message}\n`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') process.stderr.write(`浏览器错误：${message.text()}\n`)
  })
  page.on('requestfailed', (request) =>
    process.stderr.write(`请求失败：${request.url()} ${request.failure()?.errorText}\n`)
  )
  page.on('response', (response) => {
    if (response.status() >= 400)
      process.stderr.write(`响应失败：${response.status()} ${response.url()}\n`)
  })
  let released = false
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'sys_dictionary') {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      return route.fulfill({
        json: code
          ? dictionaryRows.filter((row) => row.dict_type_table.code === code)
          : dictionaryRows
      })
    }
    if (endpoint === 'tms_list_driver_blacklist_secure') {
      return route.fulfill({
        json: {
          records: [
            {
              id: activeId,
              tenantId,
              driverId,
              driverName: '验收司机甲',
              phone: '13800000001',
              organizationName: '验收物流公司',
              driverOwnership: 'carrier',
              driverType: 'primary',
              carrierName: '验收承运商',
              companyName: '验收物流公司',
              plateNo: '测A·10001',
              blacklistedAt: now,
              reason: '违反安全要求',
              remark: null,
              status: released ? 'released' : 'active',
              releasedAt: released ? now : null,
              createBy: '验收员',
              createTime: now,
              updateTime: now
            }
          ],
          total: 1
        }
      })
    }
    if (endpoint === 'tms_list_blacklist_driver_candidates_secure') {
      return route.fulfill({
        json: {
          records: [
            {
              id: '11111111-1111-4111-8111-111111111302',
              tenantId,
              driverName: '验收司机乙',
              phone: '13900000002',
              driverOwnership: 'self',
              driverType: 'secondary',
              carrierName: '验收承运商',
              companyName: '验收物流公司',
              organizationName: '验收物流公司',
              plateNo: '测A·10002',
              enabled: true
            }
          ],
          total: 1
        }
      })
    }
    if (endpoint === 'tms_release_driver_blacklist_secure') {
      released = true
      return route.fulfill({ json: { id: activeId, driverId, restoredEnabled: true } })
    }
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/tms-blacklist-visual.html', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000
  })
  await expect(page.getByText('验收司机甲').first()).toBeVisible()
  const activeRow = page.getByRole('row').filter({ hasText: '验收司机甲' })
  await expect(activeRow).toContainText('承运商司机')
  await expect(activeRow).toContainText('主驾')
  await expect(activeRow).toContainText('黑名单')
  await expect(page.getByText('已使用前端默认列')).toBeHidden({ timeout: 10_000 })
  await page.screenshot({ path: info.outputPath('blacklist-list-light.png'), fullPage: true })

  await page.getByRole('button', { name: '新增黑名单' }).click()
  const driverField = page
    .getByRole('dialog', { name: '新增黑名单' })
    .getByRole('textbox', { name: /选择司机/ })
  await expect(driverField).toBeVisible()
  await driverField.click()
  await expect(page.getByText('验收司机乙').first()).toBeVisible()
  const candidateRow = page.getByRole('row').filter({ hasText: '验收司机乙' })
  await expect(candidateRow).toContainText('自有司机')
  await expect(candidateRow).toContainText('副驾')
  await page.screenshot({ path: info.outputPath('blacklist-driver-selector.png'), fullPage: true })

  await page.setViewportSize({ width: 1100, height: 760 })
  await page.screenshot({
    path: info.outputPath('blacklist-driver-selector-narrow.png'),
    fullPage: true
  })
  await candidateRow.click()
  await page.getByRole('button', { name: '确定' }).last().click()
  await expect(driverField).toHaveValue('验收司机乙')
  const blacklistDialog = page.getByRole('dialog', { name: '新增黑名单' })
  await expect(blacklistDialog.getByRole('textbox', { name: '手机号' })).toHaveValue('13900000002')
  await expect(blacklistDialog.getByRole('textbox', { name: '所属组织' })).toHaveValue(
    '验收物流公司'
  )
  await expect(blacklistDialog.getByText('自有司机', { exact: true })).toBeVisible()
  await expect(blacklistDialog.getByText('副驾', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('blacklist-driver-autofill.png'), fullPage: true })

  await page.getByRole('button', { name: '取消' }).last().click()
  await page.getByRole('button', { name: '解除黑名单' }).click()
  await page.getByRole('button', { name: '确认解除' }).click()
  await expect(page.getByText('已解除').first()).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('黑名单引用按记录 ID 打开对应历史，缺失记录给出提示', async ({ page }) => {
  const requestedIds: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url())
    const endpoint = url.pathname.split('/').at(-1)
    if (endpoint === 'sys_dictionary') {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      return route.fulfill({
        json: code
          ? dictionaryRows.filter((row) => row.dict_type_table.code === code)
          : dictionaryRows
      })
    }
    if (endpoint === 'tms_list_driver_blacklist_secure')
      return route.fulfill({ json: { records: [], total: 0 } })
    if (endpoint === 'tms_get_driver_blacklist_secure') {
      const request = route.request().postDataJSON() as { p_id?: string }
      requestedIds.push(request.p_id ?? '')
      return route.fulfill({
        json:
          request.p_id === activeId
            ? {
                id: activeId,
                tenantId,
                driverId,
                driverName: '验收司机甲',
                driverOwnership: 'carrier',
                driverType: 'primary',
                blacklistedAt: now,
                reason: '违反安全要求',
                status: 'released',
                createBy: '验收员',
                createTime: now,
                updateTime: now
              }
            : null
      })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto(`/tests/e2e/fixtures/tms-blacklist-visual.html?recordId=${activeId}`)
  const detail = page.getByRole('dialog', { name: '黑名单详情 · 验收司机甲' })
  await expect(detail).toBeVisible()
  await expect(detail.getByText('已解除')).toBeVisible()
  expect(requestedIds).toEqual([activeId])

  const missingId = '11111111-1111-4111-8111-111111111299'
  await page.goto(`/tests/e2e/fixtures/tms-blacklist-visual.html?recordId=${missingId}`)
  await expect(page.getByText('黑名单记录不存在或当前账号无权查看，请返回列表核对')).toBeVisible()
  expect(requestedIds).toEqual([activeId, missingId])
})

test('离开黑名单页后延迟返回的详情不得重新打开', async ({ page }) => {
  let releaseRead: (() => void) | undefined
  const readGate = new Promise<void>((resolve) => {
    releaseRead = resolve
  })
  const requestedIds = await mockExactDetail(page, async () => {
    await readGate
    return exactDetailRow
  })
  await page.goto(`/tests/e2e/fixtures/tms-blacklist-visual.html?recordId=${activeId}`)
  await expect.poll(() => requestedIds.length).toBe(1)
  await page.evaluate(() => window.dispatchEvent(new Event('tms-qa-leave-blacklist')))
  await expect(page.getByText('测试路由已切换')).toBeVisible()
  releaseRead?.()
  await expect(page.getByRole('dialog', { name: '黑名单详情 · 验收司机甲' })).toBeHidden()
  expect(requestedIds).toEqual([activeId])
})

test('同一记录在切换租户后重查且关闭旧详情', async ({ page }) => {
  let reads = 0
  const requestedIds = await mockExactDetail(page, () => (++reads === 1 ? exactDetailRow : null))
  await page.goto(`/tests/e2e/fixtures/tms-blacklist-visual.html?recordId=${activeId}`)
  const detail = page.getByRole('dialog', { name: '黑名单详情 · 验收司机甲' })
  await expect(detail).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('tms-qa-switch-tenant')))
  await expect(detail).toBeHidden()
  await expect.poll(() => requestedIds.length).toBe(2)
  expect(requestedIds).toEqual([activeId, activeId])
  await expect(page.getByText('黑名单记录不存在或当前账号无权查看，请返回列表核对')).toBeVisible()
})

test('查看权限撤销时关闭当前详情并抑制后续打开', async ({ page }) => {
  const requestedIds = await mockExactDetail(page, () => exactDetailRow)
  await page.goto(`/tests/e2e/fixtures/tms-blacklist-visual.html?recordId=${activeId}`)
  const detail = page.getByRole('dialog', { name: '黑名单详情 · 验收司机甲' })
  await expect(detail).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new Event('tms-qa-revoke-view')))
  await expect(detail).toBeHidden()
  expect(requestedIds).toEqual([activeId])
})
