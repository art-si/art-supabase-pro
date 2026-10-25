import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const action of ['保存', '记账'] as const) {
  test(`盘点${action}进行中关闭重开不会刷新或锁住当前抽屉`, async ({ page }, testInfo) => {
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    let reads = 0
    await page.route('**/rest/v1/wms_count_line?*', (route) => {
      reads++
      return route.fulfill({
        json: [
          {
            id: 'save-line',
            batch_id: 'batch-save',
            material_id: 'material-save',
            expected_quantity: 2,
            counted_quantity: 1,
            expected_serial_ids: [],
            counted_serial_ids: [],
            new_serial_nos: [],
            material: {
              material_name: '保存上下文物料',
              material_code: 'SAVE-MAT',
              serial_management_enabled: false
            }
          }
        ]
      })
    })
    let release = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let saves = 0
    const rpc = action === '保存' ? 'wms_record_count_line_secure' : 'wms_post_count_plan_secure'
    const payloads: unknown[] = []
    await page.route(`**/rpc/${rpc}`, async (route) => {
      saves++
      payloads.push(route.request().postDataJSON())
      await pending
      await route.fulfill({ json: true })
    })
    await page.goto('/tests/e2e/fixtures/wms-count-form.html?counting=true')
    const open = page.getByRole('button', { name: '打开已记账盘点详情', exact: true })
    await open.click()
    const drawer = page.getByRole('dialog', { name: '盘点表', exact: true })
    const missingBatch = drawer.getByText('批次资料不可用', { exact: true })
    await expect(missingBatch).toBeVisible()
    await expect(drawer).not.toContainText('batch-save')
    await missingBatch.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('count-missing-batch.png'),
      animations: 'disabled'
    })
    const save = drawer.getByRole('button', { name: '保存实盘', exact: true })
    if (action === '保存') await save.click()
    else {
      await drawer.getByRole('button', { name: '确认盘盈盘亏', exact: true }).click()
      await page.getByRole('button', { name: '确认记账', exact: true }).click()
    }
    await expect.poll(() => saves).toBe(1)
    await drawer
      .getByRole('button', { name: /关闭此对话框|Close this dialog/, exact: true })
      .click()
    await open.click()
    await expect(save).toBeEnabled()
    await expect.poll(() => reads).toBe(2)
    await drawer.getByRole('spinbutton').fill('3')
    await drawer.getByRole('spinbutton').blur()
    const response = page.waitForResponse((item) => item.url().includes(`/rpc/${rpc}`))
    release()
    await (await response).finished()
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    )
    expect(reads).toBe(2)
    await expect(drawer.getByRole('spinbutton')).toHaveValue('3.000')
    await expect(save).toBeEnabled()
    await expect(drawer.getByRole('button', { name: '确认盘盈盘亏', exact: true })).toBeEnabled()
    expect(payloads).toHaveLength(1)
    if (action === '记账')
      expect(payloads[0]).toEqual({ p_plan_id: '33333333-3333-4333-8333-333333333333' })
  })
}

test('盘点详情关闭重开同一单据隔离旧读取', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  let release = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let reads = 0
  await page.route('**/rest/v1/wms_count_line?*', async (route) => {
    const old = ++reads === 1
    if (old) await pending
    await route.fulfill({
      json: [
        {
          id: old ? 'old-line' : 'new-line',
          batch_id: 'batch-test',
          material_id: 'material-test',
          expected_quantity: 2,
          counted_quantity: null,
          expected_serial_ids: [],
          counted_serial_ids: [],
          new_serial_nos: [],
          material: {
            material_code: 'COUNT-MAT',
            material_name: old ? '旧盘点物料' : '当前盘点物料',
            serial_management_enabled: false
          }
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-count-form.html?counting=true')
  const open = page.getByRole('button', { name: '打开已记账盘点详情', exact: true })
  await open.click()
  await expect.poll(() => reads).toBe(1)
  const drawer = page.getByRole('dialog', { name: '盘点表', exact: true })
  await drawer.getByRole('button', { name: /关闭此对话框|Close this dialog/, exact: true }).click()
  await open.click()
  await expect(drawer.getByText('当前盘点物料', { exact: true })).toBeVisible()
  const response = page.waitForResponse((item) => item.url().includes('/wms_count_line?'))
  release()
  await (await response).finished()
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  )
  await expect(drawer.getByText('当前盘点物料', { exact: true })).toBeVisible()
  await expect(drawer.getByText('旧盘点物料', { exact: true })).toHaveCount(0)
})

test('盘点详情未录入不保存，明确零值失败后可重试', async ({ page }, testInfo) => {
  const payloads: unknown[] = []
  let failed = true
  let quantity: number | null = null
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/wms_count_line?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'line-zero',
          batch_id: 'batch-zero',
          material_id: 'material-zero',
          project_id: null,
          expected_quantity: 2,
          counted_quantity: quantity,
          expected_serial_ids: [],
          counted_serial_ids: [],
          new_serial_nos: [],
          material: {
            material_code: 'MAT-ZERO',
            material_name: '测试零数量物料',
            serial_management_enabled: false
          }
        }
      ]
    })
  )
  await page.route('**/rpc/wms_record_count_line_secure', (route) => {
    payloads.push(route.request().postDataJSON())
    if (!failed) quantity = 0
    return route.fulfill(
      failed
        ? { status: 400, json: { code: 'P0001', message: '测试实盘保存失败' } }
        : { json: true }
    )
  })
  await page.goto('/tests/e2e/fixtures/wms-count-form.html?counting=true')
  await page.getByRole('button', { name: '打开已记账盘点详情', exact: true }).click()
  const drawer = page.locator('.el-drawer:visible')
  const save = drawer.getByRole('button', { name: '保存实盘', exact: true })
  await save.click()
  await expect(page.getByText('请填写实盘数量，实盘为零时请明确输入 0')).toBeVisible()
  expect(payloads).toHaveLength(0)
  const input = drawer.getByRole('spinbutton')
  await input.fill('0')
  await input.blur()
  await save.click()
  await expect(page.getByText('测试实盘保存失败', { exact: false })).toBeVisible()
  await expect(input).toHaveValue('0.000')
  failed = false
  await save.click()
  await expect.poll(() => payloads.length).toBe(2)
  expect(payloads[1]).toEqual(payloads[0])
  expect(payloads[0]).toMatchObject({ p_counted_quantity: 0 })
  await expect(drawer.getByRole('button', { name: '确认盘盈盘亏', exact: true })).toBeEnabled()
  const post = drawer.getByRole('button', { name: '确认盘盈盘亏', exact: true })
  const posts: unknown[] = []
  let postFailed = true
  await page.route('**/rpc/wms_post_count_plan_secure', (route) => {
    posts.push(route.request().postDataJSON())
    return route.fulfill(
      postFailed
        ? { status: 400, json: { code: 'P0001', message: '测试库存已变化，请重新复核' } }
        : { json: true }
    )
  })
  await post.click()
  await page.getByRole('button', { name: '继续复核', exact: true }).click()
  expect(posts).toHaveLength(0)
  await post.click()
  await page.getByRole('button', { name: '确认记账', exact: true }).click()
  await expect(page.getByText('测试库存已变化，请重新复核', { exact: false })).toBeVisible()
  await expect(post).toBeEnabled()
  await expect(input).toHaveValue('0.000')
  await page.screenshot({
    path: testInfo.outputPath('count-post-rejected.png'),
    animations: 'disabled'
  })
  postFailed = false
  await post.click()
  await page.getByRole('button', { name: '确认记账', exact: true }).click()
  await expect(post).toHaveCount(0)
  await expect(save).toHaveCount(0)
  expect(posts).toHaveLength(2)
  expect(posts[1]).toEqual(posts[0])
})

test('已记账盘点详情完整显示盘盈盘亏和新增序列号', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/wms_count_line?*', (route) =>
    route.fulfill({
      json: ['gain', 'loss'].map((kind) => ({
        id: `line-${kind}`,
        batch_id: `batch-${kind}`,
        material_id: `material-${kind}`,
        project_id: null,
        construction_no: 'SECTION-TEST-001',
        expected_quantity: 10,
        counted_quantity: kind === 'gain' ? 12 : 7,
        expected_serial_ids: [],
        counted_serial_ids: [],
        new_serial_nos: kind === 'gain' ? ['COUNT-SN-001', 'COUNT-SN-002'] : [],
        gain_movement_id: kind === 'gain' ? 'move-gain' : null,
        loss_movement_id: kind === 'loss' ? 'move-loss' : null,
        batch: kind === 'gain' ? null : { batch_no: `BATCH-${kind.toUpperCase()}` },
        material: {
          material_code: `MAT-${kind}`,
          material_name: `测试${kind === 'gain' ? '盘盈' : '盘亏'}物料`,
          serial_management_enabled: false
        }
      }))
    })
  )
  await page.route('**/rest/v1/wms_count_variance_document?*', (route) =>
    route.fulfill({
      json: ['gain', 'loss'].map((kind) => ({
        id: `document-${kind}`,
        kind,
        document_no: `COUNT-${kind.toUpperCase()}-001`,
        posted_at: '2026-10-05T01:02:03Z'
      }))
    })
  )
  await page.route('**/rest/v1/wms_inventory_movement?*', (route) =>
    route.fulfill({
      json: [
        { id: 'move-gain', quantity: 2, area_sqm: 4 },
        { id: 'move-loss', quantity: 3, area_sqm: 6 }
      ]
    })
  )
  await page.goto('/tests/e2e/fixtures/wms-count-form.html')
  await page.getByRole('button', { name: '打开已记账盘点详情', exact: true }).click()
  const drawer = page.locator('.el-drawer:visible')
  await expect(drawer.locator('.el-table__header th').filter({ hasText: /^操作$/ })).toHaveCount(0)
  await expect(
    drawer.getByText('新增 SN：COUNT-SN-001、COUNT-SN-002', { exact: true })
  ).toBeVisible()
  for (const quantity of ['+2', '−3', '+4㎡', '−6㎡']) {
    await expect(drawer.getByText(quantity, { exact: true })).toBeVisible()
  }
  await expect(drawer.getByText('批次资料不可用', { exact: true })).toHaveCount(1)
  await expect(drawer).not.toContainText('batch-gain')
  await expect(drawer).toContainText('BATCH-LOSS')
  await drawer.getByText('−3', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('count-variance-lines.png'),
    animations: 'disabled'
  })
  await drawer.getByRole('button', { name: /关闭此对话框|Close this dialog/, exact: true }).click()
})

test('盘点详情差异单过账时间按上海时区显示', async ({ page }, testInfo) => {
  let linesFailed = true
  let documentsFailed = true
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/wms_count_line?*', (route) =>
    route.fulfill(
      linesFailed
        ? { status: 503, json: { code: 'XX000', message: '测试盘点行加载失败' } }
        : { json: [] }
    )
  )
  await page.route('**/rest/v1/wms_count_variance_document?*', (route) =>
    route.fulfill(
      documentsFailed
        ? {
            status: 503,
            json: { code: 'XX000', message: '测试差异单据加载失败' }
          }
        : {
            json: [
              {
                id: 'variance-test',
                kind: 'gain',
                document_no: 'COUNT-GAIN-TIME-001',
                posted_at: '2026-10-05T01:02:03Z'
              }
            ]
          }
    )
  )
  await page.goto('/tests/e2e/fixtures/wms-count-form.html')
  await page.getByRole('button', { name: '打开已记账盘点详情', exact: true }).click()
  const drawer = page.locator('.el-drawer:visible')
  await expect(drawer.getByText('盘点表加载失败，请重试', { exact: true }).first()).toBeVisible()
  await expect(drawer.getByText('COUNT-GAIN-TIME-001', { exact: false })).toHaveCount(0)
  linesFailed = false
  await drawer
    .getByRole('button', { name: /重试|重新加载/, exact: true })
    .first()
    .click()
  await expect(drawer.getByText('差异单据加载失败，请重试', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('count-variance-load-error.png'),
    animations: 'disabled'
  })
  documentsFailed = false
  await drawer
    .getByRole('button', { name: /重试|重新加载/, exact: true })
    .first()
    .click()
  const time = drawer.getByText('2026-10-05 09:02:03', { exact: false })
  await expect(time).toBeVisible()
  await time.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: testInfo.outputPath('count-posted-time.png'),
    animations: 'disabled'
  })
  await drawer.getByRole('button', { name: /关闭此对话框|Close this dialog/, exact: true }).click()
})

test('盘点表单提交编辑后的零值，重新打开恢复原始数量', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  let payload: unknown
  await page.route('**/rest/v1/rpc/wms_record_count_line_secure', async (route) => {
    payload = route.request().postDataJSON()
    await route.fulfill({ json: true })
  })
  await page.goto('/tests/e2e/fixtures/wms-count-form.html')
  await page.getByRole('button', { name: '打开测试盘点' }).click()
  const dialog = page.getByRole('dialog')
  const quantity = dialog.getByRole('spinbutton')
  await expect.poll(async () => Number(await quantity.inputValue())).toBe(2)
  await quantity.fill('0')
  await quantity.blur()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByTestId('saved-count')).toHaveText('1')
  expect(payload).toEqual({
    p_line_id: '11111111-1111-4111-8111-111111111111',
    p_counted_quantity: 0,
    p_counted_serial_ids: [],
    p_new_serial_nos: []
  })
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '打开测试盘点' }).click()
  await expect.poll(async () => Number(await dialog.getByRole('spinbutton').inputValue())).toBe(2)
  expect(errors).toEqual([])
})

test('SN 盘点允许逐行输入多个新增序列号并完整提交', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  let payload: unknown
  await page.route('**/rest/v1/rpc/wms_record_count_line_secure', async (route) => {
    payload = route.request().postDataJSON()
    await route.fulfill({ json: true })
  })
  await page.goto('/tests/e2e/fixtures/wms-count-form.html')
  await page.getByRole('button', { name: '打开测试 SN 盘点', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const serials = dialog.locator('textarea')
  await expect(serials).toBeVisible()
  await expect(serials).not.toHaveAttribute('maxlength')
  await expect(dialog.getByRole('spinbutton')).toBeDisabled()
  await serials.fill('SN-COUNT-001\nSN-COUNT-002')
  await expect.poll(async () => Number(await dialog.getByRole('spinbutton').inputValue())).toBe(2)
  await page.screenshot({
    path: testInfo.outputPath('wms-count-new-serials.png'),
    animations: 'disabled'
  })
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(payload).toEqual({
    p_line_id: '11111111-1111-4111-8111-111111111111',
    p_counted_quantity: 2,
    p_counted_serial_ids: [],
    p_new_serial_nos: ['SN-COUNT-001', 'SN-COUNT-002']
  })
})
