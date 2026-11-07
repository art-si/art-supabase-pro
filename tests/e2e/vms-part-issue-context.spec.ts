import { expect, test, type Page, type Route } from '@playwright/test'
import { isPlainObjectRecord } from '../../src/utils/type-guards'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

const fixture = '/tests/e2e/fixtures/vms-parts-review.html'
const vehicleA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const vehicleB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const partId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const tenantA = '11111111-1111-4111-8111-111111111111'
const stock = (name = '当前库存配件') => ({
  id: partId,
  partId,
  partCode: 'PART-1',
  partName: name,
  model: '合成规格',
  brand: '合成品牌',
  unit: '件',
  stockQty: 20,
  updatedAt: null
})

async function mockParts(page: Page) {
  const state = {
    reads: 0,
    holdFirstStock: false,
    failFirstStock: false,
    holdSave: false,
    stockState: 'success' as 'success' | 'error' | 'empty',
    releaseStock: undefined as (() => void) | undefined,
    releaseSave: undefined as (() => void) | undefined,
    writeReleases: [] as Array<() => void>,
    writes: [] as Array<Record<string, unknown>>,
    unexpected: [] as string[]
  }
  await page.route('**/*', (route) => {
    if (route.request().method() === 'GET') return route.continue()
    state.unexpected.push(route.request().method() + ' ' + route.request().url())
    return route.fulfill({ status: 400, json: { message: 'unexpected isolated request' } })
  })
  await prepareIsolatedSession(page)
  const handle = async (route: Route) => {
    const resource = new URL(route.request().url()).pathname.split('/').at(-1)
    if (resource === 'vms_list_part_stock_secure') {
      const call = ++state.reads
      if (state.holdFirstStock && call === 1)
        await new Promise<void>((resolve) => {
          state.releaseStock = resolve
        })
      if (state.failFirstStock && call === 1)
        return route.fulfill({ status: 503, json: { code: 'XX000', message: 'old stock lookup' } })
      if (state.stockState === 'error')
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'current stock lookup' }
        })
      return route.fulfill({
        json: {
          records:
            state.stockState === 'empty'
              ? []
              : [stock(call === 1 && state.holdFirstStock ? '旧库存配件' : '当前库存配件')],
          total: state.stockState === 'empty' ? 0 : 1
        }
      })
    }
    if (resource === 'vms_list_vehicle_archives_secure')
      return route.fulfill({
        json: {
          records: [
            {
              id: vehicleA,
              tenantId: tenantA,
              plateNo: '合成车辆 A',
              companyName: '合成公司',
              auditStatus: 'approved'
            },
            {
              id: vehicleB,
              tenantId: tenantA,
              plateNo: '合成车辆 B',
              companyName: '合成公司',
              auditStatus: 'approved'
            }
          ],
          total: 2,
          fieldAccess: {}
        }
      })
    if (resource === 'vms_create_part_issue_secure') {
      const body: unknown = route.request().postDataJSON()
      if (!isPlainObjectRecord(body) || !isPlainObjectRecord(body.p_payload))
        throw new Error('领用夹具请求结构无效')
      state.writes.push(body.p_payload)
      if (state.holdSave)
        await new Promise<void>((resolve) => {
          state.releaseSave = resolve
          state.writeReleases.push(resolve)
        })
      return route.fulfill({ json: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })
    }
    if (resource === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    if (resource?.startsWith('vms_')) {
      state.unexpected.push(resource)
      return route.fulfill({ status: 400, json: { message: 'unexpected VMS fixture request' } })
    }
    return route.fulfill({ json: [] })
  }
  await page.route('**/rest/v1/**', handle)
  await page.route('**/v1/rdb/rest/**', handle)
  return state
}

async function openIssue(page: Page, query = '') {
  await page.goto(`${fixture}?issueContext${query}`)
  await page.getByTestId('issue-open').click()
  const dialog = page.getByRole('dialog', { name: '新建领用单', exact: true })
  await expect(dialog.getByRole('button', { name: '确认领用', exact: true })).toBeEnabled()
  return dialog
}

async function fillIssue(page: Page, vehicle: 'A' | 'B' = 'A', quantity = 1) {
  const dialog = page.getByRole('dialog', { name: '新建领用单', exact: true })
  await dialog.getByRole('textbox', { name: /领用车辆/ }).click()
  const picker = page.getByRole('dialog', { name: '选择领用车辆', exact: true })
  await picker
    .getByRole('row')
    .filter({ hasText: `合成车辆 ${vehicle}` })
    .click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await dialog.getByRole('combobox', { name: '物料描述', exact: true }).click()
  await page.getByRole('option', { name: '当前库存配件 · PART-1', exact: true }).click()
  const amount = dialog.getByRole('spinbutton', { name: '领用数量', exact: true })
  await amount.fill(String(quantity))
  await amount.blur()
  return dialog
}

async function controller(page: Page, id: string) {
  // External public controller competition; this is not a normal click through the modal mask.
  await page.getByTestId(id).evaluate((button: HTMLButtonElement) => button.click())
}
async function releaseValidation(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('issue-validation-result')))
  await expect(page.locator('html')).toHaveAttribute('data-issue-validation', 'resolved')
  await page.waitForLoadState('networkidle')
}

test('普通用户领用正常提交并在写入期间锁定表单', async ({ page }, info) => {
  const state = await mockParts(page)
  state.holdSave = true
  await openIssue(page)
  await page
    .getByRole('dialog', { name: '新建领用单', exact: true })
    .screenshot({ path: info.outputPath('issue-ready.png'), animations: 'disabled' })
  const dialog = await fillIssue(page)
  await dialog.getByRole('button', { name: '添加明细', exact: true }).click()
  await dialog.getByRole('combobox', { name: '物料描述', exact: true }).nth(1).click()
  await page.getByRole('option', { name: '当前库存配件 · PART-1', exact: true }).click()
  await dialog.screenshot({ path: info.outputPath('issue-filled.png'), animations: 'disabled' })
  await dialog.getByRole('button', { name: '确认领用', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  await expect(dialog.getByRole('button', { name: '添加明细', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('textbox', { name: /领用车辆/ })).toBeDisabled()
  for (let index = 0; index < 2; index++) {
    await expect(
      dialog.getByRole('spinbutton', { name: '领用数量', exact: true }).nth(index)
    ).toBeDisabled()
    await expect(
      dialog.getByRole('combobox', { name: '物料描述', exact: true }).nth(index)
    ).toBeDisabled()
    await expect(
      dialog.getByRole('button', { name: '移除领用明细', exact: true }).nth(index)
    ).toBeDisabled()
  }
  await expect(dialog.locator('input[type="file"]')).toHaveCount(0)
  await dialog.screenshot({ path: info.outputPath('issue-writing.png'), animations: 'disabled' })
  expect(state.writes[0]).toMatchObject({
    vehicle_id: vehicleA,
    lines: [
      { part_id: partId, issued_qty: 1 },
      { part_id: partId, issued_qty: 1 }
    ]
  })
  state.releaseSave?.()
  await expect(page.getByTestId('issue-successes')).toHaveText('1')
  await expect(dialog).toHaveCount(0)
  expect(state.unexpected).toEqual([])
})

for (const failed of [false, true]) {
  test(`旧库存${failed ? '失败' : '成功'}晚于新打开时不覆盖或提示`, async ({ page }, info) => {
    const state = await mockParts(page)
    state.holdFirstStock = true
    state.failFirstStock = failed
    await page.goto(`${fixture}?issueContext`)
    await page.getByTestId('issue-open').click()
    await expect.poll(() => state.reads).toBe(1)
    if (!failed)
      await page
        .getByRole('dialog', { name: '新建领用单', exact: true })
        .screenshot({ path: info.outputPath('issue-loading.png'), animations: 'disabled' })
    await controller(page, 'issue-open')
    const dialog = page.getByRole('dialog', { name: '新建领用单', exact: true })
    await expect.poll(() => state.reads).toBe(2)
    await expect(dialog.getByRole('button', { name: '确认领用', exact: true })).toBeEnabled()
    state.releaseStock?.()
    await page.waitForLoadState('networkidle')
    await dialog.getByRole('combobox', { name: '物料描述', exact: true }).click()
    await expect(
      page.getByRole('option', { name: '当前库存配件 · PART-1', exact: true })
    ).toBeVisible()
    await expect(page.getByText('旧库存配件 · PART-1', { exact: true })).toHaveCount(0)
    await expect(dialog).not.toContainText('配件库存加载失败')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    expect(state.writes).toEqual([])
    expect(state.unexpected).toEqual([])
  })
}

for (const mode of ['reopen', 'quantity', 'permission', 'scope', 'actor', 'demote'] as const) {
  test(`领用明细校验等待期间 ${mode} 不提交未确认内容`, async ({ page }, info) => {
    const state = await mockParts(page)
    const platform = ['scope', 'actor', 'demote'].includes(mode)
    const query = `&deferIssueValidation${platform ? '&platformScope' : ''}${mode === 'demote' ? '&selectedScope' : ''}`
    const dialog = await openIssue(page, query)
    await fillIssue(page)
    const effectiveBefore = await page.getByTestId('issue-effective-scope').textContent()
    const revisionBefore = await page.getByTestId('issue-scope-revision').textContent()
    await dialog.getByRole('button', { name: '确认领用', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-issue-validation', 'pending')
    if (mode === 'reopen') {
      await controller(page, 'issue-open')
      await expect(dialog.getByRole('button', { name: '确认领用', exact: true })).toBeEnabled()
      await fillIssue(page, 'B', 2)
    } else if (mode === 'quantity') {
      await dialog.getByRole('spinbutton', { name: '领用数量', exact: true }).fill('2')
      await dialog.getByRole('spinbutton', { name: '领用数量', exact: true }).press('Tab')
    } else {
      await controller(page, `issue-${mode === 'permission' ? 'revoke' : mode}`)
      await expect(
        dialog.getByText('操作权限或租户范围已变化，请关闭后重新打开领用单', { exact: true })
      ).toBeVisible()
      await expect(dialog.getByRole('button', { name: '添加明细', exact: true })).toBeDisabled()
      if (mode === 'actor')
        await dialog.screenshot({
          path: info.outputPath('issue-context-stale.png'),
          animations: 'disabled'
        })
      if (mode === 'actor' || mode === 'demote') {
        await expect(page.getByTestId('issue-effective-scope')).toHaveText(effectiveBefore ?? '')
        await expect(page.getByTestId('issue-scope-revision')).toHaveText(revisionBefore ?? '')
      }
    }
    await releaseValidation(page)
    expect(state.writes).toEqual([])
    await expect(page.getByTestId('issue-successes')).toHaveText('0')
    await expect(dialog).toBeVisible()
    if (mode === 'reopen')
      await expect(dialog.getByRole('spinbutton', { name: '领用数量', exact: true })).toHaveValue(
        '2'
      )
    if (mode === 'quantity')
      await expect(
        page.getByText('领用内容已变化，请重新确认后提交', { exact: true })
      ).toBeVisible()
    expect(state.unexpected).toEqual([])
  })
}

test('打开微任务期间撤权会结束加载且不查询库存', async ({ page }) => {
  const state = await mockParts(page)
  await page.goto(`${fixture}?issueContext`)
  await page.getByTestId('issue-open').evaluate((button: HTMLButtonElement) => {
    button.click()
    document.querySelector<HTMLButtonElement>('[data-testid="issue-revoke"]')?.click()
  })
  const dialog = page.getByRole('dialog', { name: '新建领用单', exact: true })
  await expect(
    dialog.getByText('操作权限或租户范围已变化，请关闭后重新打开领用单', { exact: true })
  ).toBeVisible()
  await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
  expect(state.reads).toBe(0)
  expect(state.writes).toEqual([])
})

test('车辆切换会销毁旧照片输入控件', async ({ page }) => {
  const state = await mockParts(page)
  await openIssue(page)
  const dialog = await fillIssue(page)
  const oldInput = await dialog.locator('input[type="file"]').elementHandle()
  expect(oldInput).not.toBeNull()
  await fillIssue(page, 'B')
  expect(await oldInput?.evaluate((element) => element.isConnected)).toBe(false)
  await expect(dialog.locator('input[type="file"]')).toHaveCount(1)
  expect(state.writes).toEqual([])
})

test('旧领用完成不释放新领用写入锁或提示', async ({ page }) => {
  const state = await mockParts(page)
  state.holdSave = true
  const dialog = await openIssue(page)
  await fillIssue(page)
  await dialog.getByRole('button', { name: '确认领用', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(1)
  await controller(page, 'issue-open')
  await expect(dialog.getByRole('button', { name: '确认领用', exact: true })).toBeEnabled()
  await fillIssue(page, 'B', 2)
  await dialog.getByRole('button', { name: '确认领用', exact: true }).click()
  await expect.poll(() => state.writes.length).toBe(2)
  expect(state.writes[0].idempotency_key).not.toBe(state.writes[1].idempotency_key)
  state.writeReleases[0]()
  await expect(page.getByTestId('issue-successes')).toHaveText('1')
  await expect(dialog.getByRole('spinbutton', { name: '领用数量', exact: true })).toBeDisabled()
  await expect(dialog.getByRole('spinbutton', { name: '领用数量', exact: true })).toHaveValue('2')
  await expect(page.locator('.el-message--success')).toHaveCount(0)
  state.writeReleases[1]()
  await expect(page.getByTestId('issue-successes')).toHaveText('2')
  await expect(dialog).toHaveCount(0)
  expect(state.unexpected).toEqual([])
})

test('只读权限不能通过公开入口打开领用或读取库存', async ({ page }) => {
  const state = await mockParts(page)
  await page.goto(`${fixture}?issueContext&issuePermission=View`)
  await page.getByTestId('issue-open').click()
  await expect(
    page.getByText('当前账号没有配件领用权限，请联系管理员', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.reads).toBe(0)
  expect(state.writes).toEqual([])
})

test('缓存页面离开后旧库存返回不重开领用弹窗', async ({ page }) => {
  const state = await mockParts(page)
  state.holdFirstStock = true
  await page.goto(`${fixture}?issueContext`)
  await page.getByTestId('issue-open').click()
  await expect.poll(() => state.reads).toBe(1)
  await controller(page, 'issue-away')
  await expect(page.getByText('已离开领用页面', { exact: true })).toBeVisible()
  state.releaseStock?.()
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('dialog', { name: '新建领用单', exact: true })).toHaveCount(0)
  await controller(page, 'issue-back')
  await expect(page.getByRole('dialog', { name: '新建领用单', exact: true })).toHaveCount(0)
  expect(state.writes).toEqual([])
})

for (const mode of ['error', 'empty'] as const) {
  test(`库存 ${mode} 状态可见且关闭后能重试`, async ({ page }, info) => {
    const state = await mockParts(page)
    state.stockState = mode
    await page.goto(`${fixture}?issueContext`)
    await page.getByTestId('issue-open').click()
    const dialog = page.getByRole('dialog', { name: '新建领用单', exact: true })
    await expect(dialog.getByRole('button', { name: '确认领用', exact: true })).toBeDisabled()
    await expect(
      dialog.getByText(
        mode === 'error'
          ? '配件库存加载失败，请关闭后重试'
          : '暂无可领用库存，请先登记配件入库后重新打开',
        { exact: true }
      )
    ).toBeVisible()
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await page.screenshot({
      path: info.outputPath(`issue-stock-${mode}.png`),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    state.stockState = 'success'
    await page.getByTestId('issue-open').click()
    await expect(dialog.getByRole('button', { name: '确认领用', exact: true })).toBeEnabled()
    expect(state.reads).toBe(2)
    expect(state.writes).toEqual([])
  })
}
