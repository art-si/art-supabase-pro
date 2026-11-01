import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

const fixture = '/tests/e2e/fixtures/art-form-tabs.html'
const categoryOptions = [
  { label: '标准业务', value: 'standard' },
  { label: '加急业务', value: 'urgent' }
]

async function openFixture(page: Page, query = '') {
  await prepareIsolatedSession(page)
  await page.route('**/__art-form-tab-options', (route) => route.fulfill({ json: categoryOptions }))
  await page.goto(fixture + query)
  await expect(page.getByRole('tab', { name: '基本信息', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '保存表单', exact: true })).toBeEnabled()
}

function tab(page: Page, name: string) {
  return page.getByRole('tab', { name, exact: true })
}

async function fillRequired(page: Page) {
  await tab(page, '基本信息').click()
  await page.getByRole('textbox', { name: /^\*?\s*名称$/ }).fill('横向试点工单')
  const product = page.getByRole('button', { name: '展开产品信息', exact: true })
  if (await product.count()) await product.click()
  await page.getByRole('textbox', { name: /^\*?\s*产品规格$/ }).fill('1000 × 50')
  await tab(page, '业务信息').click()
  await page.getByRole('textbox', { name: /^\*?\s*联系人$/ }).fill('业务负责人')
}

test('页签分区保留公共字段、字段实例、输入值和业务插槽', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await openFixture(page)
  await expect(tab(page, '基本信息')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: '单据编号', exact: true })).toHaveValue('DEMO-001')
  await expect(tab(page, '内部信息')).toHaveCount(0)
  await tab(page, '归档配置').click()
  await expect(tab(page, '基本信息')).toHaveAttribute('aria-selected', 'true')
  const name = page.getByRole('textbox', { name: /^\*?\s*名称$/ })
  await name.fill('保留名称')
  await name.evaluate((element) => element.setAttribute('data-kept-field', 'name'))
  await tab(page, '业务信息').click()
  await expect(page.locator('[data-kept-field="name"]')).toHaveCount(1)
  await expect(page.locator('[data-kept-field="name"]')).toBeHidden()
  await expect(page.getByRole('textbox', { name: '单据编号', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: /^\*?\s*联系人$/ }).fill('保留联系人')
  await page.getByRole('combobox', { name: '业务分类', exact: true }).click()
  await page.getByRole('option', { name: '加急业务', exact: true }).click()
  await tab(page, '附加说明').click()
  await page.getByRole('textbox', { name: '备注内容', exact: true }).fill('业务插槽保留值')
  await tab(page, '基本信息').click()
  await expect(page.locator('[data-kept-field="name"]')).toHaveValue('保留名称')
  await tab(page, '业务信息').click()
  await expect(page.getByRole('textbox', { name: /^\*?\s*联系人$/ })).toHaveValue('保留联系人')
  await expect(
    page
      .getByRole('tabpanel', { name: '业务信息', exact: true })
      .getByText('加急业务', { exact: true })
  ).toBeVisible()
  await tab(page, '附加说明').click()
  await expect(page.getByRole('textbox', { name: '备注内容', exact: true })).toHaveValue(
    '业务插槽保留值'
  )
  expect(errors).toEqual([])
})

test('完整校验切到首个错误页签并展开错误分区，未活动字段不能绕过校验', async ({ page }) => {
  await openFixture(page)
  await tab(page, '附加说明').click()
  await page.getByRole('button', { name: '外部校验', exact: true }).click()
  await expect(page.getByLabel('校验结果', { exact: true })).toHaveText('校验未通过')
  await expect(tab(page, '基本信息')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('请输入名称', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: /^\*?\s*名称$/ })).toBeFocused()
  await page.getByRole('textbox', { name: /^\*?\s*名称$/ }).fill('已填名称')
  await tab(page, '业务信息').click()
  await page.getByRole('button', { name: '外部校验', exact: true }).click()
  await expect(tab(page, '基本信息')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: /^\*?\s*产品规格$/ })).toBeVisible()
  await expect(page.getByText('请输入产品规格', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: /^\*?\s*产品规格$/ })).toBeFocused()
  await page.getByRole('textbox', { name: /^\*?\s*产品规格$/ }).fill('可用规格')
  await page.getByRole('button', { name: '外部校验', exact: true }).click()
  await expect(tab(page, '业务信息')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('请输入联系人', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: /^\*?\s*联系人$/ })).toBeFocused()
  await page.getByRole('textbox', { name: /^\*?\s*联系人$/ }).fill('已填联系人')
  await page.getByRole('button', { name: '外部校验', exact: true }).click()
  await expect(page.getByLabel('校验结果', { exact: true })).toHaveText('校验通过')
})

test('回调、单字段校验和程序定位都能跨页签显示目标字段', async ({ page }) => {
  await openFixture(page)
  await tab(page, '附加说明').click()
  await page.getByRole('button', { name: '回调校验', exact: true }).click()
  await expect(page.getByLabel('校验结果', { exact: true })).toContainText('name')
  await expect(tab(page, '基本信息')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: /^\*?\s*名称$/ })).toBeFocused()
  await expect(page.getByLabel('校验结果', { exact: true })).not.toContainText('internalValue')
  await page.getByRole('button', { name: '单字段校验', exact: true }).click()
  await expect(tab(page, '业务信息')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByLabel('校验结果', { exact: true })).toHaveText('联系人校验未通过')
  await page.getByRole('textbox', { name: /^\*?\s*联系人$/ }).fill('有效联系人')
  await tab(page, '附加说明').click()
  await page.getByRole('button', { name: '定位业务字段', exact: true }).click()
  await expect(tab(page, '业务信息')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: /^\*?\s*联系人$/ })).toBeVisible()
  await tab(page, '基本信息').click()
  await page.getByRole('button', { name: '外部切换业务页签', exact: true }).click()
  await expect(tab(page, '业务信息')).toHaveAttribute('aria-selected', 'true')
})

test('保存与重置覆盖所有页签，结构标记与隐藏页签不进入业务输出', async ({ page }) => {
  await openFixture(page)
  await fillRequired(page)
  await tab(page, '附加说明').click()
  await page.getByRole('textbox', { name: '备注内容', exact: true }).fill('提交后保留的备注')
  await page.getByRole('button', { name: '保存表单', exact: true }).click()
  const output = page.getByTestId('form-output')
  await expect(output).toContainText('"name"')
  await expect
    .poll(async () => JSON.parse(await output.innerText()))
    .toMatchObject({
      documentNo: 'DEMO-001',
      name: '横向试点工单',
      specification: '1000 × 50',
      contact: '业务负责人',
      category: 'standard',
      notes: '提交后保留的备注'
    })
  const result: Record<string, unknown> = JSON.parse(await output.innerText())
  for (const key of [
    'general',
    'business',
    'productSection',
    'internal',
    'internalValue',
    'notesTab',
    'frozen'
  ])
    expect(result).not.toHaveProperty(key)
  await page.getByRole('button', { name: '重置表单', exact: true }).click()
  await expect(tab(page, '基本信息')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: /^\*?\s*名称$/ })).toHaveValue('')
  await expect(page.getByRole('button', { name: '展开产品信息', exact: true })).toBeVisible()
  await tab(page, '附加说明').click()
  await expect(page.getByRole('textbox', { name: '备注内容', exact: true })).toHaveValue('初始备注')
})

test('隐藏当前页签回到可用页签，再显示时保留该页签输入', async ({ page }) => {
  await openFixture(page)
  await tab(page, '附加说明').click()
  await page.getByRole('textbox', { name: '备注内容', exact: true }).fill('临时隐藏后还在')
  await page.getByRole('button', { name: '隐藏备注页签', exact: true }).click()
  await expect(tab(page, '附加说明')).toHaveCount(0)
  await expect(tab(page, '基本信息')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: '备注内容', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '显示备注页签', exact: true }).click()
  await tab(page, '附加说明').click()
  await expect(page.getByRole('textbox', { name: '备注内容', exact: true })).toHaveValue(
    '临时隐藏后还在'
  )
})

test('左右键切换横向页签并跳过隐藏和停用项', async ({ page }) => {
  await openFixture(page)
  await tab(page, '基本信息').focus()
  await page.keyboard.press('ArrowRight')
  await expect(tab(page, '业务信息')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(tab(page, '附加说明')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(tab(page, '基本信息')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(tab(page, '附加说明')).toHaveAttribute('aria-selected', 'true')
})

test('未活动页签的异步选项仍加载，失败阻止提交并能重试', async ({ page }) => {
  await prepareIsolatedSession(page)
  let held: Route | undefined
  let fail = true
  await page.route('**/__art-form-tab-options', (route) => {
    held = route
    if (!fail) return route.fulfill({ json: categoryOptions })
  })
  await page.goto(fixture)
  await expect(tab(page, '基本信息')).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => Boolean(held)).toBe(true)
  await expect(page.getByRole('button', { name: '保存表单', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '回调校验', exact: true }).click()
  await expect(page.getByLabel('校验结果', { exact: true })).toContainText('category')
  await held?.fulfill({ status: 503, json: {} })
  await page.getByRole('button', { name: '外部切换业务页签', exact: true }).click()
  await expect(page.getByText('选项加载失败，请重新加载后再选择', { exact: true })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByRole('button', { name: '保存表单', exact: true })).toBeEnabled()
  await expect(
    page
      .getByRole('tabpanel', { name: '业务信息', exact: true })
      .getByText('标准业务', { exact: true })
  ).toBeVisible()
})

test('确认校验自动聚焦并滚动到 ElScrollbar 内未显示的错误字段', async ({ page }) => {
  await openFixture(page, '?scroll=1')
  await page.getByRole('textbox', { name: /^\*?\s*名称$/ }).fill('滚动校验工单')
  await page.getByRole('button', { name: '展开产品信息', exact: true }).click()
  await page.getByRole('textbox', { name: /^\*?\s*产品规格$/ }).fill('1000 × 50')
  await tab(page, '业务信息').click()
  const contact = page.getByRole('textbox', { name: /^\*?\s*联系人$/ })
  await expect(contact).not.toBeInViewport()
  await tab(page, '附加说明').click()
  await page.getByRole('button', { name: '外部校验', exact: true }).click()
  await expect(tab(page, '业务信息')).toHaveAttribute('aria-selected', 'true')
  await expect(contact).toBeFocused()
  await expect(contact).toBeInViewport({ ratio: 1 })
  await expect
    .poll(() =>
      page
        .getByTestId('form-scroll')
        .locator('.el-scrollbar__wrap')
        .evaluate((el) => el.scrollTop)
    )
    .toBeGreaterThan(100)
  await contact.fill('有效联系人')
  await page
    .getByTestId('form-scroll')
    .locator('.el-scrollbar__wrap')
    .evaluate((el) => {
      el.scrollTop = 0
    })
  await tab(page, '附加说明').click()
  await page.getByRole('button', { name: '聚焦业务字段', exact: true }).click()
  await expect(contact).toBeFocused()
  await expect(contact).toBeInViewport({ ratio: 1 })
  await page
    .getByTestId('form-scroll')
    .locator('.el-scrollbar__wrap')
    .evaluate((el) => {
      el.scrollTop = 0
    })
  await tab(page, '附加说明').click()
  await page.getByRole('button', { name: '定位业务字段', exact: true }).click()
  await expect(tab(page, '业务信息')).toHaveAttribute('aria-selected', 'true')
  await expect(contact).toBeInViewport({ ratio: 1 })
})

test('停用页签禁止用户切换，单字段校验仍能进入并定位错误', async ({ page }) => {
  await openFixture(page)
  await tab(page, '归档配置').click()
  await expect(tab(page, '基本信息')).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: '校验归档字段', exact: true }).click()
  await expect(tab(page, '归档配置')).toHaveAttribute('aria-selected', 'true')
  const frozen = page.getByRole('textbox', { name: /^\*?\s*归档负责人$/ })
  await expect(frozen).toBeFocused()
  await expect(page.getByText('请输入归档负责人', { exact: true })).toBeVisible()
})

for (const theme of ['light', 'dark'])
  for (const width of [1440, 768])
    test(`横向页签 ${theme}/${width} 无页面溢出且内容只占当前页签高度`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await openFixture(page, `?theme=${theme}`)
      await expect(tab(page, '基本信息')).toHaveAttribute('aria-selected', 'true')
      const boxes = await page.getByRole('tab').evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect()
          return { x: box.x, y: box.y, height: box.height }
        })
      )
      expect(boxes.every((box) => Math.abs(box.y - boxes[0].y) <= 1)).toBe(true)
      expect(boxes.every((box, index) => index === 0 || box.x > boxes[index - 1].x)).toBe(true)
      await tab(page, '附加说明').click()
      await expect(page.getByRole('textbox', { name: '备注内容', exact: true })).toBeVisible()
      await expect(page.getByRole('textbox', { name: /^\*?\s*名称$/ })).toHaveCount(0)
      const geometry = await page.locator('.art-form').evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        overflow: document.documentElement.scrollWidth - window.innerWidth
      }))
      expect(geometry.height).toBeLessThan(530)
      expect(geometry.overflow).toBeLessThanOrEqual(1)
      await page.screenshot({ path: info.outputPath(`tabs-${theme}-${width}.png`), fullPage: true })
    })
