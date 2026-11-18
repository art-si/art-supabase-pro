import { expect, test } from '@playwright/test'
import { expectInputTextUnclipped } from './support/input-text-width'
import {
  expectQueryDateRangeReadable,
  expectStackedQueryRangeAligned,
  installQueryDateClock,
  selectQueryDateRange
} from './support/query-date-range'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('共享表单提交和重置保留日期范围、文件及有效空值', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/art-form-values.html')
  const name = page.locator('.el-input__inner').first()
  await expect(name).toHaveValue('初始名称')
  await expect(
    page.getByRole('combobox', { name: '日期范围 Start Date', exact: true })
  ).toBeVisible()
  await expect(page.getByRole('combobox', { name: '日期范围 End Date', exact: true })).toBeVisible()
  await name.fill('编辑后的名称')
  const output = page.getByTestId('form-output')
  for (const expectedName of ['编辑后的名称', '初始名称']) {
    if (expectedName === '初始名称') await page.getByRole('button', { name: '重置测试' }).click()
    await page.getByRole('button', { name: '提交测试' }).click()
    await expect
      .poll(async () => JSON.parse(await output.innerText()))
      .toEqual({
        name: expectedName,
        period: ['2026-10-03T00:00:00.000Z', '2026-10-04T00:00:00.000Z'],
        attachment: { name: 'test.txt', content: '测试附件内容' },
        hasBlank: false,
        count: 0,
        enabled: false,
        acknowledged: false
      })
  }
  expect(errors).toEqual([])
})

test('单个复选框保留可识别文字、键盘操作和布尔值', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/art-form-values.html')
  const checkbox = page.getByRole('checkbox', { name: '确认业务值', exact: true })
  await expect(checkbox).not.toBeChecked()
  await page.locator('label.el-checkbox').filter({ hasText: '确认业务值' }).click()
  await expect(checkbox).toBeChecked()
  await page.getByRole('button', { name: '提交测试' }).click()
  await expect
    .poll(async () => JSON.parse(await page.getByTestId('form-output').innerText()))
    .toMatchObject({ acknowledged: true })
  await checkbox.focus()
  await page.keyboard.press('Space')
  await expect(checkbox).not.toBeChecked()
  await page.getByRole('button', { name: '提交测试' }).click()
  await expect
    .poll(async () => JSON.parse(await page.getByTestId('form-output').innerText()))
    .toMatchObject({ acknowledged: false })
})

test('字段说明关联实际输入，保留调用方说明及不同表单的独立关联', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/art-form-values.html?descriptions', {
    waitUntil: 'domcontentloaded'
  })
  const firstForm = page.getByRole('region', { name: '甲表单', exact: true })
  const secondForm = page.getByRole('region', { name: '乙表单', exact: true })
  const first = firstForm.getByRole('textbox', { name: '说明输入', exact: true })
  const second = secondForm.getByRole('textbox', { name: '说明输入', exact: true })
  const slotted = firstForm.getByRole('textbox', { name: '自定义输入', exact: true })
  const group = firstForm.getByRole('radiogroup', { name: '确认方式', exact: true })
  const range = ['开始日期', '结束日期'].map((name) =>
    firstForm.getByPlaceholder(name, { exact: true })
  )
  await expect(first).toHaveAccessibleDescription('外部填写规则 甲填写提示')
  await expect(second).toHaveAccessibleDescription('外部填写规则 乙填写提示')
  await expect(slotted).toHaveAccessibleDescription('甲槽说明')
  await expect(group).toHaveAccessibleDescription('甲组说明')
  await expect(group.getByRole('radio', { name: '人工确认', exact: true })).not.toHaveAttribute(
    'aria-describedby',
    /.+/
  )
  for (const input of range) await expect(input).toHaveAccessibleDescription('甲日期说明')

  const toggle = page.getByRole('button', { name: '切换字段说明', exact: true })
  await toggle.click()
  await expect(first).toHaveAccessibleDescription('外部填写规则')
  await expect(first).toHaveAttribute('aria-describedby', 'existing-field-instruction')
  await expect(slotted).not.toHaveAttribute('aria-describedby', /.+/)
  await expect(group).not.toHaveAttribute('aria-describedby', /.+/)
  for (const input of range) await expect(input).not.toHaveAttribute('aria-describedby', /.+/)
  await toggle.click()
  await expect(first).toHaveAccessibleDescription('外部填写规则 甲填写提示')
  await expect(second).toHaveAccessibleDescription('外部填写规则 乙填写提示')
  await expect(slotted).toHaveAccessibleDescription('甲槽说明')
  await expect(group).toHaveAccessibleDescription('甲组说明')
  for (const input of range) await expect(input).toHaveAccessibleDescription('甲日期说明')
})

test('共享查询日期在嵌入容器内按宽度排版且不改变筛选折叠顺序', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installQueryDateClock(page)
  await page.goto('/tests/e2e/fixtures/art-form-values.html?query-range&theme=dark&box=shadow-mode')

  const search = page.locator('.art-search-bar')
  const field = (name: string) => search.locator(`[data-art-form-item-key="${name}"]`)
  const editor = (name: string) => field(name).locator('.el-range-editor')
  await expect(search.locator('[data-art-form-item-key]')).toHaveCount(3)
  await expect(field('archive')).toHaveCount(0)
  await search.getByRole('button', { name: '展开', exact: true }).click()
  await expect(field('archive')).toBeVisible()
  expect(
    await field('archive').evaluate((element) => {
      const width = element.getBoundingClientRect().width
      return Math.abs(width - (element.parentElement!.clientWidth * 16) / 24)
    })
  ).toBeLessThan(1)
  await search.getByRole('button', { name: '收起', exact: true }).click()
  await expect(field('archive')).toHaveCount(0)

  await selectQueryDateRange(field('period'))
  await expectQueryDateRangeReadable(field('period'))
  await expectQueryDateRangeReadable(field('inspection'))
  await expect(editor('inspection')).toHaveCSS('display', 'inline-flex')
  await expect(editor('inspection').locator('.el-range-input').first()).toHaveCSS(
    'text-align',
    'center'
  )
  await search.screenshot({ path: info.outputPath('date-range-embedded-640.png') })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(editor('inspection')).toHaveCSS('display', 'inline-flex')
  await expectQueryDateRangeReadable(field('period'))
  await expectQueryDateRangeReadable(field('inspection'))

  await page.evaluate(() =>
    document.documentElement.style.setProperty('--query-test-width', '330px')
  )
  await expectStackedQueryRangeAligned(editor('inspection'))
  await expectStackedQueryRangeAligned(editor('period'))
  await expectQueryDateRangeReadable(field('period'))
  await expectQueryDateRangeReadable(field('inspection'))
  const labelPosition = await field('inspection').evaluate((element) => {
    const label = element.querySelector('.el-form-item__label')!
    const labelBox = label.getBoundingClientRect()
    const editorBox = element.querySelector('.el-range-editor')!.getBoundingClientRect()
    return {
      align: getComputedStyle(label).textAlign,
      centerOffset: Math.abs(
        (labelBox.top + labelBox.bottom - editorBox.top - editorBox.bottom) / 2
      ),
      noOverflow: element.scrollWidth === element.clientWidth
    }
  })
  expect(labelPosition.align).toBe('right')
  expect(labelPosition.centerOffset).toBeLessThan(1)
  expect(labelPosition.noOverflow).toBe(true)
  await search.screenshot({ path: info.outputPath('date-range-embedded-330.png') })

  await search.getByRole('button', { name: '重置', exact: true }).click()
  await expect(field('period').getByPlaceholder('开始日期')).toHaveValue('')
  await expectStackedQueryRangeAligned(editor('period'))
  await expectQueryDateRangeReadable(field('inspection'))
})

test('普通筛选在桌面窄嵌入栏保留可编辑宽度和右对齐标签', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tests/e2e/fixtures/art-form-values.html?query-range')

  const search = page.locator('.art-search-bar')
  const owner = search.getByRole('textbox', { name: '责任人', exact: true })
  await owner.fill('XM20261116001')
  await expect(owner).toHaveValue('XM20261116001')
  await expectInputTextUnclipped(owner)
  await expect(search.locator('[data-art-form-item-key="owner"] .el-form-item__label')).toHaveCSS(
    'text-align',
    'right'
  )
  await expect(search.locator('[data-art-form-item-key]')).toHaveCount(3)

  await page.evaluate(() =>
    document.documentElement.style.setProperty('--query-test-width', '330px')
  )
  await expectInputTextUnclipped(owner)
  expect(await search.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await search.screenshot({ path: info.outputPath('ordinary-query-embedded-330.png') })
})

test('独立查询收起后只提示已填的高级条件', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tests/e2e/fixtures/art-form-values.html?query-retained')
  const search = page.locator('.art-search-bar')
  await expect(search.getByRole('button', { name: /展开.*已填 4 项隐藏条件/ })).toBeVisible()
  await expect(search.getByText('已填 4 项', { exact: true })).toBeVisible()
  await expect(search.getByText(/已应用/)).toHaveCount(0)
  await search.getByRole('button', { name: /展开.*已填 4 项隐藏条件/ }).click()
  await expect(search.getByText('隐藏字段', { exact: true })).toHaveCount(0)
  await search.getByRole('textbox', { name: '匹配用语', exact: true }).fill('')
  await search.getByRole('button', { name: '收起', exact: true }).click()
  await expect(search.getByRole('button', { name: /展开.*已填 3 项隐藏条件/ })).toBeVisible()
  await search.getByRole('button', { name: '查询', exact: true }).click()
  await expect
    .poll(async () => JSON.parse(await page.getByTestId('query-output').innerText()))
    .toEqual({ count: 0, enabled: false, range: ['2026-11-07', '2026-11-10'], status: 'all' })
})

test('换行和折叠的多选标签都与控件居中，查询保留所选值', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tests/e2e/fixtures/art-form-values.html?query-multi')

  const search = page.locator('.art-search-bar')
  const areas = search.locator('[data-art-form-item-key="areas"]')
  const groups = search.locator('[data-art-form-item-key="groups"]')
  const fullName = '华东跨区域仓储协调中心（一期）'
  await expect(areas.locator('.el-select__tags-text')).toHaveCount(3)
  await expect(groups.locator('.el-select__collapse-item')).toHaveText('+ 2')

  for (const width of [640, 330]) {
    await page.evaluate((width) => {
      document.documentElement.style.setProperty('--query-test-width', `${width}px`)
    }, width)
    for (const field of [areas, groups]) {
      await expect(field.locator('.el-select__tags-text [title]').first()).toHaveAttribute(
        'title',
        fullName
      )
      const labels = await field.evaluate((field) => {
        const label = field.querySelector('.el-form-item__label')!
        const text = label.querySelector('.art-form-item__label')!.getBoundingClientRect()
        const control = field.querySelector('.el-select__wrapper')!.getBoundingClientRect()
        return {
          align: getComputedStyle(label).justifyContent,
          gap: control.left - text.right,
          offset: Math.abs((text.top + text.bottom - control.top - control.bottom) / 2),
          fits: field.clientWidth >= field.scrollWidth
        }
      })
      expect(labels.align).toBe('flex-end')
      expect(labels.gap).toBeCloseTo(8, 0)
      expect(labels.offset).toBeLessThanOrEqual(2)
      expect(labels.fits).toBe(true)
    }
    expect(
      await areas.locator('.el-select__wrapper').evaluate((el) => el.clientHeight)
    ).toBeGreaterThan(await groups.locator('.el-select__wrapper').evaluate((el) => el.clientHeight))
    await search.screenshot({ path: info.outputPath(`multi-query-embedded-${width}.png`) })
  }

  const area = areas.getByRole('combobox', { name: '负责区域' })
  await area.press('ArrowDown')
  await expect(page.getByRole('option', { name: fullName, exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await area.press('Escape')
  await expect(area).toHaveAttribute('aria-expanded', 'false')

  const keyword = search.getByRole('textbox', { name: '关键词' })
  await keyword.fill('库存')
  await keyword.press('Enter')
  await expect(page.getByTestId('query-output')).toHaveText(
    JSON.stringify({
      areas: ['east', 'south', 'north'],
      groups: ['east', 'south', 'north'],
      keyword: '库存'
    })
  )
})

test('日期时间和月份范围在窄分栏中保留完整值与编辑操作', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(
    '/tests/e2e/fixtures/art-form-values.html?query-range-time&theme=dark&box=shadow-mode'
  )

  const search = page.locator('.art-search-bar')
  const timeEditor = search.locator('.el-date-editor--datetimerange')
  const monthEditor = search.locator('.el-date-editor--monthrange')
  const start = timeEditor.getByPlaceholder('开始时间')
  const end = timeEditor.getByPlaceholder('结束时间')
  const expectCompleteRanges = async () => {
    await expect(start).toHaveValue('2026-11-07 09:35:30')
    await expect(end).toHaveValue('2026-11-10 21:44:01')
    await expect(monthEditor.getByPlaceholder('开始月份')).toHaveValue('2026-07')
    await expect(monthEditor.getByPlaceholder('结束月份')).toHaveValue('2026-11')
    await expectInputTextUnclipped(search.locator('input.el-range-input'))
  }

  await expect(timeEditor).toHaveCSS('display', 'inline-flex')
  await expect(monthEditor).toHaveCSS('display', 'inline-flex')
  await expectCompleteRanges()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(timeEditor).toHaveCSS('display', 'grid')
  await expect(monthEditor).toHaveCSS('display', 'inline-flex')
  await expectCompleteRanges()

  await page.evaluate(() =>
    document.documentElement.style.setProperty('--query-test-width', '330px')
  )
  await expectStackedQueryRangeAligned(monthEditor)
  await expectStackedQueryRangeAligned(timeEditor)
  await expectCompleteRanges()
  const labelGeometry = await timeEditor.evaluate((editor) => {
    const label = editor.closest('.el-form-item')!.querySelector('.el-form-item__label')!
    const labelBox = label.getBoundingClientRect()
    const editorBox = editor.getBoundingClientRect()
    return {
      align: getComputedStyle(label).textAlign,
      centerOffset: Math.abs(
        (labelBox.top + labelBox.bottom - editorBox.top - editorBox.bottom) / 2
      )
    }
  })
  expect(labelGeometry.align).toBe('right')
  expect(labelGeometry.centerOffset).toBeLessThan(1)
  await search.screenshot({ path: info.outputPath('time-month-ranges-embedded-330.png') })

  await start.click()
  const picker = page.locator('.el-date-range-picker.has-time:visible')
  await expect(picker).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()

  await timeEditor.hover()
  await timeEditor.locator('.el-range__close-icon:not(.el-range__close-icon--hidden)').click()
  await expect(start).toHaveValue('')
  await expect(end).toHaveValue('')
  await search.getByRole('button', { name: '重置', exact: true }).click()
  await expectCompleteRanges()
})
