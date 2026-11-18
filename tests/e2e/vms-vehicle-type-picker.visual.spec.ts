import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

const fixture = '/tests/e2e/fixtures/vms-vehicle-type-picker.html'
const tenantId = '22222222-2222-4222-8222-222222222222'
const profiles = [
  {
    id: 'profile-semi-13',
    category: '半挂车',
    length_m: 13,
    volume_m3: 68,
    load_tons: 28,
    sort: 10
  },
  {
    id: 'profile-semi-17',
    category: '半挂车',
    length_m: 17.5,
    volume_m3: null,
    load_tons: 30,
    sort: 20
  },
  {
    id: 'profile-load-30',
    category: '按载重',
    length_m: null,
    volume_m3: 52,
    load_tons: 30,
    sort: 10
  }
].map((profile) => ({ ...profile, tenant_id: tenantId, image_url: null, status: '1' }))

async function preparePicker(page: Page, theme: 'light' | 'dark' = 'light') {
  await prepareIsolatedSession(page)
  const unexpected: string[] = []
  const scopes: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    unexpected.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
  })
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) => {
    const body = route.request().postDataJSON() as { p_tenant_id?: string }
    scopes.push(String(body.p_tenant_id))
    return route.fulfill({ json: profiles })
  })
  await page.goto(theme === 'dark' ? `${fixture}?theme=dark` : fixture)
  if (theme === 'dark') {
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(true)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
      'dark'
    )
  }
  const dialog = page.getByRole('dialog', { name: '参选车型' })
  return { dialog, unexpected, scopes }
}

async function openPicker(page: Page, theme: 'light' | 'dark' = 'light') {
  const prepared = await preparePicker(page, theme)
  const { dialog, unexpected, scopes } = prepared
  await page.getByRole('button', { name: '打开车型参选' }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.vehicle-type-profile-picker__choice')).toHaveCount(2)
  expect(scopes).toEqual([tenantId])
  expect(unexpected).toEqual([])
  return prepared
}

test('1440 明亮：分类与规格可键盘选择，缺失指标清楚显示并带入所选 ID', async ({
  page
}, testInfo) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' })
  const { dialog, unexpected } = await openPicker(page)
  const categories = dialog.locator('.vehicle-type-profile-picker__category')
  await expect(categories).toHaveCount(7)
  await expect(categories.filter({ hasText: '冷藏车' })).toBeDisabled()
  const transition = await categories.first().evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      token: style.getPropertyValue('--art-motion-duration-fast').trim(),
      duration: style.transitionDuration
    }
  })
  expect(transition.token).toBe('180ms')
  expect(transition.duration.split(',').map((value) => value.trim())).toEqual(['0.18s', '0.18s'])

  const customLength = dialog
    .locator('.vehicle-type-profile-picker__choice')
    .filter({ hasText: '17.5 米' })
  await customLength.focus()
  await expect(customLength).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(customLength).toHaveAttribute('aria-pressed', 'true')
  const summary = dialog.locator('.vehicle-type-profile-picker__summary')
  await expect(summary).toContainText('半挂车 · 17.5 米')
  await expect(summary).toContainText('容积 未配置')
  await page.screenshot({ path: testInfo.outputPath('picker-light-1440.png') })

  await categories.filter({ hasText: '按载重' }).click()
  await expect(summary).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '使用此车型' })).toBeDisabled()
  const loadChoice = dialog
    .locator('.vehicle-type-profile-picker__choice')
    .filter({ hasText: '30 吨' })
  await loadChoice.click()
  await expect(summary).toContainText('车长 未配置')
  await dialog.getByRole('button', { name: '使用此车型' }).click()
  await expect(page.getByRole('status', { name: '已确认车型' })).toHaveText('profile-load-30')
  expect(unexpected).toEqual([])
})

test('570 暗色：弹窗内容可读无横向溢出，全局减少动态覆盖项目过渡', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 570, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  const { dialog, unexpected } = await openPicker(page, 'dark')
  const category = dialog.locator('.vehicle-type-profile-picker__category').first()
  const duration = await category.evaluate(
    (element) => getComputedStyle(element).transitionDuration
  )
  expect(
    duration.split(',').every((value) => Number(value.trim().replace(/s$/, '')) <= 0.001)
  ).toBe(true)
  const box = await dialog.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(570)
  const horizontalOverflow = await dialog.evaluate((element) => {
    const picker = element.querySelector('.vehicle-type-profile-picker')
    return picker ? picker.scrollWidth > picker.clientWidth + 1 : true
  })
  expect(horizontalOverflow).toBe(false)
  await page.screenshot({ path: testInfo.outputPath('picker-dark-570-top.png') })
  await dialog.locator('.vehicle-type-profile-picker__choice').filter({ hasText: '13 米' }).click()
  const summary = dialog.locator('.vehicle-type-profile-picker__summary')
  await expect(summary).toContainText('容积 68 立方米')
  await summary.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('picker-dark-570-summary.png') })
  expect(unexpected).toEqual([])
})

for (const profile of [
  { theme: 'light', width: 1440, height: 1000 },
  { theme: 'dark', width: 390, height: 844 }
] as const) {
  test(`车型参选已选规格在底部可核对并用键盘确认 ${profile.theme}${profile.width}`, async ({
    page
  }, info) => {
    await page.setViewportSize({ width: profile.width, height: profile.height })
    const { dialog, unexpected } = await openPicker(page, profile.theme)
    await expect(dialog.locator('.vehicle-type-profile-picker__category')).toHaveCount(7)
    const choice = dialog
      .locator('.vehicle-type-profile-picker__choice')
      .filter({ hasText: '13 米' })
    await choice.click()
    await expect(choice).toHaveAttribute('aria-pressed', 'true')

    const footer = dialog.locator('.el-dialog__footer')
    const reconciliation = footer.locator('.art-dialog__footer-left')
    await expect(reconciliation).toBeVisible()
    const identity = reconciliation.getByText('半挂车 · 13 米', { exact: true })
    const volume = reconciliation.getByText(/容积\s*68\s*立方米/).first()
    const load = reconciliation.getByText(/载重\s*28\s*吨/).first()
    const confirm = footer.getByRole('button', { name: '使用此车型', exact: true })
    await expect(confirm).toBeEnabled()
    for (const control of [identity, volume, load, confirm])
      await expect(control).toBeInViewport({ ratio: 1 })
    for (const value of [identity, volume, load])
      expect(
        await value.evaluate((element) => element.scrollWidth - element.clientWidth)
      ).toBeLessThanOrEqual(1)
    expect(
      await footer.evaluate((element) => element.scrollWidth - element.clientWidth)
    ).toBeLessThanOrEqual(1)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await dialog.screenshot({
      path: info.outputPath(`picker-footer-selected-${profile.width}.png`),
      animations: 'disabled'
    })
    await confirm.focus()
    await expect(confirm).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('status', { name: '已确认车型' })).toHaveText('profile-semi-13')
    expect(unexpected).toEqual([])
  })
}

test('车型参选当前请求失败后原位重试，底部按加载和选择状态确认缺失指标', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { dialog, unexpected, scopes } = await preparePicker(page, 'dark')
  const retryRead = Promise.withResolvers<void>()
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', async (route) => {
    scopes.push(String(route.request().postDataJSON().p_tenant_id))
    if (scopes.length === 1)
      return route.fulfill({
        status: 503,
        json: { code: 'XX000', message: 'database unavailable' }
      })
    await retryRead.promise
    return route.fulfill({ json: profiles })
  })
  const viewport = dialog.locator('.art-dialog__viewport')
  const footer = dialog.locator('.el-dialog__footer')
  const confirm = footer.getByRole('button', { name: '使用此车型', exact: true })
  const cancel = footer.getByRole('button', { name: '取消', exact: true })
  try {
    await page.getByRole('button', { name: '打开车型参选', exact: true }).click()
    await expect(dialog.getByText('内容加载失败', { exact: true })).toBeVisible()
    await expect(footer.getByText('加载失败，请重试', { exact: true })).toBeVisible()
    await expect(viewport).toHaveAttribute('aria-busy', 'false')
    await expect(confirm).toBeDisabled()
    await expect(cancel).toBeEnabled()
    await expect(dialog.locator('.vehicle-type-profile-picker__choice')).toHaveCount(0)
    const retry = dialog.getByRole('button', { name: '重新加载', exact: true })
    await retry.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => scopes.length).toBe(2)
    await expect(viewport).toHaveAttribute('aria-busy', 'true')
    await expect(confirm).toBeDisabled()
    await expect(cancel).toBeDisabled()
    await dialog.screenshot({ path: info.outputPath('picker-current-retry-pending-390.png') })
    retryRead.resolve()
    await expect(viewport).toHaveAttribute('aria-busy', 'false')
    await expect(dialog.locator('.vehicle-type-profile-picker__choice')).toHaveCount(2)
    await expect(dialog.locator('.vehicle-type-profile-picker__category')).toHaveCount(7)
    await expect(confirm).toBeDisabled()
    await expect(cancel).toBeEnabled()
    await expect(footer.getByText('请选择具体规格', { exact: true })).toBeVisible()
    await expect(retry).toHaveCount(0)
    await dialog
      .locator('.vehicle-type-profile-picker__choice')
      .filter({ hasText: '17.5 米' })
      .click()
    const reconciliation = footer.locator('.art-dialog__footer-left')
    await expect(reconciliation).toContainText('半挂车 · 17.5 米')
    await expect(reconciliation).toContainText('容积 未配置')
    await expect(reconciliation).toContainText('载重 30 吨')
    await expect(reconciliation).toBeInViewport({ ratio: 1 })
    await expect(confirm).toBeEnabled()
    await expect(confirm).toBeInViewport({ ratio: 1 })
    await confirm.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('status', { name: '已确认车型' })).toHaveText('profile-semi-17')
    expect(scopes).toEqual([tenantId, tenantId])
    expect(unexpected).toEqual([])
  } finally {
    retryRead.resolve()
  }
})

test('车型参选空结果保留清晰空态与可用取消，不提交任何规格', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { dialog, unexpected, scopes } = await preparePicker(page, 'dark')
  await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', (route) => {
    scopes.push(String(route.request().postDataJSON().p_tenant_id))
    return route.fulfill({ json: [] })
  })
  await page.getByRole('button', { name: '打开车型参选', exact: true }).click()
  await expect(dialog.getByText('暂无已启用的车型规格', { exact: true })).toBeInViewport({
    ratio: 1
  })
  await expect(dialog.getByText('请先在车辆档案维护车型。', { exact: true })).toBeInViewport({
    ratio: 1
  })
  await expect(dialog.locator('.vehicle-type-profile-picker__category:not(:disabled)')).toHaveCount(
    0
  )
  await expect(dialog.locator('.vehicle-type-profile-picker__choice')).toHaveCount(0)
  const footer = dialog.locator('.el-dialog__footer')
  const confirm = footer.getByRole('button', { name: '使用此车型', exact: true })
  const cancel = footer.getByRole('button', { name: '取消', exact: true })
  await expect(footer.getByText('暂无可用规格', { exact: true })).toBeVisible()
  await expect(confirm).toBeDisabled()
  await expect(cancel).toBeEnabled()
  await expect(cancel).toBeInViewport({ ratio: 1 })
  await dialog.screenshot({ path: info.outputPath('picker-empty-footer-390.png') })
  await cancel.focus()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('status', { name: '已确认车型' })).toHaveText('未选择')
  expect(scopes).toEqual([tenantId])
  expect(unexpected).toEqual([])
})

for (const outcome of ['success', 'failure'] as const) {
  test(`关闭重开车型参选后，旧请求${outcome === 'success' ? '成功' : '失败'}不覆盖新列表与选择`, async ({
    page
  }, info) => {
    await prepareIsolatedSession(page)
    const oldRead = Promise.withResolvers<void>()
    const scopes: string[] = []
    const unexpected: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: [] })
      unexpected.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
      return route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
    })
    const freshProfiles = [15, 19].map((length, index) => ({
      ...profiles[0],
      id: `profile-current-${length}`,
      length_m: length,
      sort: index
    }))
    await page.route('**/rest/v1/rpc/vms_list_vehicle_type_profiles_secure', async (route) => {
      const body = route.request().postDataJSON() as { p_tenant_id?: string }
      scopes.push(String(body.p_tenant_id))
      if (scopes.length === 1) {
        await oldRead.promise
        return outcome === 'success'
          ? route.fulfill({ json: profiles })
          : route.fulfill({
              status: 400,
              json: { code: 'P0001', message: '旧车型规格读取失败' }
            })
      }
      return route.fulfill({ json: freshProfiles })
    })
    const narrow = outcome === 'failure'
    if (narrow) await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(narrow ? `${fixture}?theme=dark` : fixture)
    if (narrow) await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    const open = page.getByRole('button', { name: '打开车型参选', exact: true })
    const dialog = page.getByRole('dialog', { name: '参选车型', exact: true })
    const viewport = dialog.locator('.art-dialog__viewport')
    const choices = dialog.locator('.vehicle-type-profile-picker__choice')
    const selected = choices.filter({ hasText: '19 米' })
    const summary = dialog.locator('.vehicle-type-profile-picker__summary')
    const confirm = dialog.getByRole('button', { name: '使用此车型', exact: true })
    try {
      await open.click()
      await expect.poll(() => scopes.length).toBe(1)
      await expect(viewport).toHaveAttribute('aria-busy', 'true')
      await expect(confirm).toBeDisabled()
      await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
      await expect(dialog).toBeHidden()
      await open.click()
      await expect.poll(() => scopes.length).toBe(2)
      await expect(viewport).toHaveAttribute('aria-busy', 'false')
      await expect(choices).toHaveText(['15 米', '19 米'])
      await selected.click()
      await expect(selected).toHaveAttribute('aria-pressed', 'true')
      await expect(summary).toContainText('半挂车 · 19 米')
      await expect(confirm).toBeEnabled()
      const response = page.waitForResponse((item) =>
        item.url().endsWith('/rpc/vms_list_vehicle_type_profiles_secure')
      )
      oldRead.resolve()
      await (await response).finished()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      await dialog.screenshot({ path: info.outputPath(`picker-old-${outcome}.png`) })
      await expect(viewport).toHaveAttribute('aria-busy', 'false')
      await expect(choices).toHaveText(['15 米', '19 米'])
      await expect(selected).toHaveAttribute('aria-pressed', 'true')
      await expect(summary).toContainText('半挂车 · 19 米')
      await expect(dialog.getByRole('button', { name: '重新加载', exact: true })).toHaveCount(0)
      await expect(dialog.getByText('旧车型规格读取失败', { exact: true })).toHaveCount(0)
      await expect(confirm).toBeEnabled()
      await confirm.click()
      await expect(dialog).toBeHidden()
      await expect(page.getByRole('status', { name: '已确认车型' })).toHaveText(
        'profile-current-19'
      )
      expect(scopes).toEqual([tenantId, tenantId])
      expect(unexpected).toEqual([])
      expect(errors).toEqual([])
    } finally {
      oldRead.resolve()
    }
  })
}

test('共享车型分类保留原数组顺序并响应 props 替换、原数组追加与排序字段变化', async ({ page }) => {
  await prepareIsolatedSession(page)
  const unexpected: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    unexpected.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
  })
  await page.goto(`${fixture}?mode=reactivity`)
  const picker = page.locator('.vehicle-type-profile-picker')
  const choices = picker.locator('.vehicle-type-profile-picker__choice')
  const inputOrder = page.getByRole('status', { name: '输入规格顺序' })
  const selected = page.getByRole('status', { name: '当前所选规格' })
  await expect(picker.locator('.vehicle-type-profile-picker__category')).toHaveCount(2)
  await expect(inputOrder).toHaveText('p-b,p-a,p-z,p-t')
  await expect(choices).toHaveText(['8 米', '13 米', '15 米'])
  await page.getByRole('button', { name: '替换规格输入数组' }).click()
  await expect(inputOrder).toHaveText('p-b,p-a,p-z,p-t,p-c')
  await expect(choices).toHaveText(['8 米', '12 米', '13 米', '15 米'])
  await page.getByRole('button', { name: '原数组追加规格' }).click()
  await expect(inputOrder).toHaveText('p-b,p-a,p-z,p-t,p-c,p-d')
  await expect(choices).toHaveText(['6 米', '8 米', '12 米', '13 米', '15 米'])
  await page.getByRole('button', { name: '调整规格排序' }).click()
  await expect(inputOrder).toHaveText('p-b,p-a,p-z,p-t,p-c,p-d')
  await expect(choices).toHaveText(['15 米', '6 米', '8 米', '12 米', '13 米'])
  await choices.first().focus()
  await page.keyboard.press('Enter')
  await expect(selected).toHaveText('p-b')
  await expect(picker.locator('.vehicle-type-profile-picker__summary')).toContainText('容积 未配置')
  await picker
    .locator('.vehicle-type-profile-picker__category')
    .filter({ hasText: 'toString' })
    .click()
  await expect(choices).toHaveText(['20 米'])
  await expect(selected).toHaveText('未选择')
  await picker
    .locator('.vehicle-type-profile-picker__category')
    .filter({ hasText: '__proto__' })
    .click()
  await expect(choices).toHaveText(['15 米', '6 米', '8 米', '12 米', '13 米'])
  expect(unexpected).toEqual([])
})
