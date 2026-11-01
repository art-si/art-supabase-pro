import { expect, test, type Locator } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { organization, tenantId } from './fixtures/form-standard-smis-data'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
const rows = Array.from({ length: 40 }, (_, index) => ({
  id: `group-${index}`,
  tenantId,
  parentId: null,
  typeName: `测试类型 ${String(index).padStart(2, '0')}`,
  typeCode: `T${index}`,
  standardName: `测试类型 ${String(index).padStart(2, '0')}`,
  standardCode: `T${index}`,
  status: 'enabled',
  sort: index,
  activityName: `测试活动 ${String(index).padStart(2, '0')}`,
  workStep: '检查设备后开始作业',
  hazardCount: 1,
  hazardNo: `R-WHYS-${index}`,
  hazardFactor: `测试危害 ${String(index).padStart(2, '0')}`,
  activityIds: [],
  accidentTypes: [],
  consequence: '测试后果'
}))
async function assertEdge(card: Locator): Promise<void> {
  await expect(card.locator('.el-scrollbar')).toHaveCount(1)
  const scrollbar = card.locator('.art-section-card__scrollbar')
  const cardBox = (await card.boundingBox())!
  const scrollBox = (await scrollbar.boundingBox())!
  expect(Math.abs(cardBox.x + cardBox.width - scrollBox.x - scrollBox.width)).toBeLessThanOrEqual(2)
}

for (const entry of [
  'inspection-plan-page',
  'hazard-governance-page',
  'inspection-standard-page'
]) {
  test(`${entry} 真实页面导航长列表边缘滚动、筛选与失败重试`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let state: 'success' | 'error' | 'empty' = 'success'
    const filters: string[] = []
    await page.route('**/rest/v1/**', async (route) => {
      const request = route.request()
      const table = new URL(request.url()).pathname.split('/').pop()
      if (
        table === 'smis_list_hidden_hazard_plan_options_secure' ||
        table === 'smis_inspection_standard'
      ) {
        if (state === 'error')
          return route.fulfill({ status: 503, json: { message: '导航服务暂不可用' } })
        return route.fulfill({
          json:
            table === 'smis_inspection_standard'
              ? state === 'empty'
                ? []
                : rows
              : { inspectionTypes: state === 'empty' ? [] : rows, organizations: [organization] }
        })
      }
      if (table?.startsWith('smis_list_hidden_hazard_')) {
        filters.push(request.postData() || '')
        return route.fulfill({ json: { records: [], total: 0 } })
      }
      if (table === 'mdm_organization') return route.fulfill({ json: [organization] })
      return route.fulfill({
        json: [],
        headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
      })
    })
    const url = `/tests/e2e/fixtures/form-standard-smis.html?entry=${entry}`
    await page.goto(url)
    const card = page.locator(
      entry === 'inspection-standard-page'
        ? '.inspection-standard-page__navigation-card'
        : entry === 'inspection-plan-page'
          ? '.hidden-hazard-plan-page__navigator-card'
          : '.hazard-governance-page__navigator-card'
    )
    const wrap = card.locator('.art-section-card__scrollbar > .el-scrollbar__wrap')
    const last =
      entry === 'inspection-standard-page'
        ? card.getByRole('treeitem').filter({ hasText: '测试类型 39' })
        : card.getByRole('button').filter({ hasText: '测试类型 39' })
    await expect(last).toBeAttached({ timeout: 60_000 })
    await assertEdge(card)
    expect(await wrap.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(0)
    await wrap.evaluate((node) => (node.scrollTop = node.scrollHeight))
    await expect(last).toBeVisible()
    await last.click()
    if (entry === 'inspection-standard-page') {
      const search = card.getByRole('textbox', { name: '筛选排查标准', exact: true })
      await search.fill('测试类型 39')
      await expect(card.getByRole('treeitem').filter({ visible: true })).toHaveCount(1)
      await search.fill('不存在的标准')
      await expect(card.getByText('未找到匹配项', { exact: true })).toBeVisible()
      await search.clear()
    } else await expect.poll(() => filters.some((filter) => filter.includes('group-39'))).toBe(true)
    await page.screenshot({ path: info.outputPath(`${entry}-desktop-light.png`) })
    state = 'error'
    await card.getByRole('button', { name: /刷新/ }).click()
    await expect(card.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${entry}-error.png`) })
    state = 'empty'
    await card.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(card.locator('.art-empty-state')).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${entry}-empty.png`) })
    state = 'success'
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${url}&theme=dark`)
    await expect(last).toBeAttached({ timeout: 60_000 })
    await card.scrollIntoViewIfNeeded()
    await assertEdge(card)
    await wrap.evaluate((node) => (node.scrollTop = node.scrollHeight))
    await expect(last).toBeVisible()
    expect(await card.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
      1
    )
    await page.screenshot({ path: info.outputPath(`${entry}-mobile-dark.png`) })
    expect(errors).toEqual([])
  })
}

test('hazard workspace 两个独立列表保持高度、末项和加载失败重试', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  let state: 'success' | 'error' | 'empty' = 'success'
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().url().includes('/smis_list_risk_hazard_workspace_secure'))
      return state === 'error'
        ? route.fulfill({ status: 503, json: { message: '测试加载失败' } })
        : route.fulfill({
            json: {
              activities: state === 'empty' ? [] : rows,
              hazards: state === 'empty' ? [] : rows
            }
          })
    return route.fulfill({ json: [] })
  })
  const url = '/tests/e2e/fixtures/form-standard-smis.html?entry=hazard-workspace'
  async function open(): Promise<Locator> {
    await page.getByRole('button', { name: '打开真实 SMIS 入口', exact: true }).click()
    const dialog = page.getByRole('dialog').last()
    await expect(dialog).toBeVisible()
    return dialog
  }
  await page.goto(url)
  let dialog = await open()
  for (const [index, label] of ['测试活动 39', '测试危害 39'].entries()) {
    const card = dialog.locator('.hazard-workspace__panel').nth(index)
    await expect(card.getByText(label, { exact: true })).toBeAttached()
    await assertEdge(card)
    const wrap = card.locator('.art-section-card__scrollbar > .el-scrollbar__wrap')
    await wrap.evaluate((node) => (node.scrollTop = node.scrollHeight))
    await expect(card.getByText(label, { exact: true })).toBeVisible()
  }
  await page.screenshot({ path: info.outputPath('hazard-lists-desktop-light.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${url}&theme=dark`)
  dialog = await open()
  for (const [index, label] of ['测试活动 39', '测试危害 39'].entries()) {
    const card = dialog.locator('.hazard-workspace__panel').nth(index)
    await card.scrollIntoViewIfNeeded()
    const wrap = card.locator('.art-section-card__scrollbar > .el-scrollbar__wrap')
    await expect(card.getByText(label, { exact: true })).toBeAttached()
    await wrap.evaluate((node) => (node.scrollTop = node.scrollHeight))
    await expect(card.getByText(label, { exact: true })).toBeVisible()
    expect(await card.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
      1
    )
    await page.screenshot({ path: info.outputPath(`hazard-list-${index}-mobile-dark.png`) })
  }
  state = 'error'
  await page.goto(`${url}&theme=dark`)
  dialog = await open()
  await expect(dialog.getByRole('button', { name: '重新加载', exact: true })).toHaveCount(2)
  state = 'success'
  await dialog.getByRole('button', { name: '重新加载', exact: true }).first().click()
  await expect(dialog.getByText('测试活动 39', { exact: true })).toBeAttached()
  state = 'empty'
  await page.goto(`${url}&theme=dark`)
  dialog = await open()
  await expect(dialog.getByText('暂无作业活动', { exact: true })).toBeVisible()
  await expect(dialog.getByText('暂无危害因素', { exact: true })).toBeVisible()
})

test('site navigator 保留全场所、选择和原mask/error分支', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/section-card-navigation.html?feature=smis-site')
  const card = page.locator('.site-navigator')
  await expect(card.getByText('测试分组 39', { exact: true })).toBeAttached()
  await assertEdge(card)
  const wrap = card.locator('.art-section-card__scrollbar > .el-scrollbar__wrap')
  await wrap.evaluate((node) => (node.scrollTop = node.scrollHeight))
  await card.getByText('测试分组 39', { exact: true }).click()
  await expect(page.getByLabel('选中分组')).toHaveText('group-39')
  await page.screenshot({ path: info.outputPath('site-desktop-light.png') })
  await page.getByRole('button', { name: 'error', exact: true }).click()
  await expect(card.getByText('导航加载失败，请重试', { exact: true })).toBeVisible()
  await card.getByRole('button', { name: '刷新场所树', exact: true }).click()
  await page.getByRole('button', { name: 'loading', exact: true }).click()
  await expect(card.getByText('正在加载场所树…', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'success', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '深色主题', exact: true }).click()
  await wrap.evaluate((node) => (node.scrollTop = node.scrollHeight))
  await expect(card.getByText('测试分组 39', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('site-mobile-dark.png') })
})

test('property panel 独立长属性表可滚动到末项并保留实际模型更新', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/section-card-navigation.html?feature=smis-property')
  const card = page.locator('.risk-map-property-panel')
  await assertEdge(card)
  const label = card.locator('[data-art-form-item-key="label"] input')
  await label.fill('优化后的图形')
  await expect(page.locator('output[aria-label="图形文字"]')).toHaveText('优化后的图形')
  const rotation = card.locator('[data-art-form-item-key="rotation"] input')
  await rotation.scrollIntoViewIfNeeded()
  await expect(rotation).toBeVisible()
  await page.screenshot({ path: info.outputPath('property-desktop-light.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '深色主题', exact: true }).click()
  await rotation.scrollIntoViewIfNeeded()
  await expect(rotation).toBeVisible()
  expect(await card.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('property-mobile-dark.png') })
  await page.getByRole('button', { name: 'empty', exact: true }).click()
  await expect(card.getByText('选择或添加一个图形', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('property-empty-mobile-dark.png') })
  await page.getByRole('button', { name: 'success', exact: true }).click()
  await expect(label).toHaveValue('优化后的图形')
  expect(errors).toEqual([])
})

test('risk site selector 长场所列表保留固定搜索和实际确认选择', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/section-card-navigation.html?feature=smis-site-select')
  await page.getByRole('button', { name: /选择风险点场所/ }).click()
  const dialog = page.getByRole('dialog').last()
  const card = dialog.locator('.risk-site-select__panel')
  const option = card.getByRole('button', { name: /测试分组 39/ })
  await expect(option).toBeAttached()
  await assertEdge(card)
  const wrap = card.locator('.art-section-card__scrollbar > .el-scrollbar__wrap')
  await wrap.evaluate((node) => (node.scrollTop = node.scrollHeight))
  await option.click()
  await dialog.getByRole('button', { name: '确认选择', exact: true }).click()
  await expect(page.getByLabel('选中分组')).toHaveText('group-39')
  await page.screenshot({ path: info.outputPath('site-selector-confirmed.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: '深色主题', exact: true }).click()
  await page.getByRole('button', { name: /测试分组 39/ }).click()
  const search = dialog.getByRole('textbox', { name: '搜索场所名称或所属组织', exact: true })
  await search.fill('测试分组 39')
  await expect(card.getByRole('listitem')).toHaveCount(1)
  await expect(option).toBeVisible()
  expect(await dialog.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
    1
  )
  await page.screenshot({ path: info.outputPath('site-selector-mobile-dark.png') })
  await search.fill('不存在的场所')
  await expect(card.getByText('暂无匹配场所', { exact: true })).toBeVisible()
})
