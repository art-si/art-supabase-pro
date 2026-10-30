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

async function openPicker(page: Page, theme: 'light' | 'dark' = 'light') {
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
  await page.getByRole('button', { name: '打开车型参选' }).click()
  const dialog = page.getByRole('dialog', { name: '参选车型' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.vehicle-type-profile-picker__choice')).toHaveCount(2)
  expect(scopes).toEqual([tenantId])
  expect(unexpected).toEqual([])
  return { dialog, unexpected }
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
