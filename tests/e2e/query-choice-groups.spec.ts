import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareAppearance } from './support/appearance'
import { installDictionaryOptions } from './support/dictionary-options'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

async function limitQueryWidth(page: Page, width: number) {
  await page.addStyleTag({
    content: `.art-table-query .art-search-bar { width: min(100%, ${width}px); }`
  })
}

async function expectRadioButtonsAligned(field: Locator, labels: string[]) {
  const buttons = field.locator('.el-radio-button__inner')
  await expect(buttons).toHaveText(labels)
  const geometry = await field.evaluate((column) => {
    const item = column.querySelector('.el-form-item')
    const labelElement = item?.querySelector('.el-form-item__label')
    const content = item?.querySelector('.art-form-item__content')?.getBoundingClientRect()
    const group = item?.querySelector('.el-radio-group')?.getBoundingClientRect()
    if (!labelElement || !content || !group) throw new Error('未找到筛选标签或选项组')

    const center = ({ top, height }: DOMRect) => top + height / 2
    const options = Array.from(column.querySelectorAll('.el-radio-button__inner'), (option) =>
      option.getBoundingClientRect()
    )
    return {
      labelAlignment: getComputedStyle(labelElement).textAlign,
      labelCenterOffset: Math.abs(center(labelElement.getBoundingClientRect()) - center(group)),
      optionRowDifference: Math.max(...options.map(center)) - Math.min(...options.map(center)),
      optionsWithinField: options.every(
        ({ left, right }) => left >= content.left - 1 && right <= content.right + 1
      )
    }
  })
  expect(geometry.labelAlignment).toBe('right')
  expect(geometry.labelCenterOffset).toBeLessThanOrEqual(2)
  expect(geometry.optionRowDifference).toBeLessThanOrEqual(1)
  expect(geometry.optionsWithinField).toBe(true)
}

test('库存盘点的两种展示方式在窄栏和手机上完整对齐', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  await installDictionaryOptions(page, {
    commonDocumentDisplayMode: [
      { value: 'document', label: '按单据' },
      { value: 'line', label: '按明细' }
    ]
  })
  const path = '/wms/count-business/count'
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'wms', name: '仓储管理', baseUrl: '/wms/' }] })
  )
  await mockApplicationMenus(page, {
    wms: [
      {
        id: 'stock-count',
        parentId: null,
        name: 'WmsCount',
        path,
        component: `${path}/index`,
        type: 'menu',
        sort: 1,
        meta: { title: '库存盘点', is_enable: true, is_hide: false, roles: [] }
      }
    ]
  })
  await page.goto(`#${path}`)
  await expect(page.getByRole('heading', { name: '库存盘点', exact: true })).toBeVisible()
  await limitQueryWidth(page, 600)

  const field = page.locator('[data-art-form-item-key="displayMode"]')
  const document = field.getByRole('radio', { name: '按单据', exact: true })
  const lines = field.getByRole('radio', { name: '按明细', exact: true })
  await expect(document).toBeChecked()
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 850 })
    await expectRadioButtonsAligned(field, ['按单据', '按明细'])
    await field.screenshot({ path: info.outputPath(`wms-display-mode-${width}.png`) })
  }
  await document.focus()
  await document.press('ArrowRight')
  await expect(lines).toBeChecked()
})

test('应收报表的窄栏选项可辨认并按所选范围查询', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await installDictionaryOptions(page, {
    arReportMode: [
      { value: 'detail', label: '应收明细' },
      { value: 'summary', label: '应收汇总与账龄' }
    ]
  })
  const reportModes: unknown[] = []
  await page.route('**/rest/v1/rpc/fms_ar_report_secure', (route) => {
    reportModes.push(route.request().postDataJSON().p_query.mode)
    return route.fulfill({ json: { records: [], total: 0 } })
  })
  await page.setViewportSize({ width: 1024, height: 850 })
  await page.goto(
    '/tests/e2e/fixtures/receivable-workspace.html?kind=report&arNavigation=1&theme=dark&box=shadow-mode&permissions=FinanceReceivableReport:View'
  )
  await expect(page.getByRole('heading', { name: '应收汇总与账龄', exact: true })).toBeVisible()
  await limitQueryWidth(page, 480)

  const field = page.locator('[data-art-form-item-key="mode"]')
  await expectRadioButtonsAligned(field, ['应收明细', '应收汇总与账龄'])
  await field.screenshot({ path: info.outputPath('fms-receivable-report-mode-480.png') })
  await field.getByText('应收汇总与账龄', { exact: true }).click()
  await expect(field.getByRole('radio', { name: '应收汇总与账龄', exact: true })).toBeChecked()
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect.poll(() => reportModes.at(-1)).toBe('summary')
})

test('分段和复选查询保持选项单行，窄栏可访问所有选项并提交', async ({ page }, info) => {
  await prepareAppearance(page, { theme: 'dark', boxBorderMode: false })
  await page.goto('/tests/e2e/fixtures/query-choice-groups.html')
  for (const [key, optionSelector] of [
    ['view', '.el-segmented__item-label'],
    ['scope', '.el-checkbox__label']
  ]) {
    const field = page.locator(`[data-art-form-item-key="${key}"]`)
    const options = field.locator(optionSelector)
    await expect(options).toHaveCount(3)
    for (const width of [1440, 330]) {
      await page.setViewportSize({ width, height: 850 })
      const geometry = await options.evaluateAll((labels) =>
        labels.map((label) => {
          const content = label.closest('.art-form-item__content')?.getBoundingClientRect()
          const option = label.closest('label')?.getBoundingClientRect()
          const glyphs = document.createRange()
          glyphs.selectNodeContents(label)
          return {
            value: label.textContent,
            singleLine: glyphs.getClientRects().length === 1,
            fullyReadable: label.clientWidth >= label.scrollWidth - 1,
            insideField: Boolean(
              content &&
              option &&
              option.left >= content.left - 1 &&
              option.right <= content.right + 1
            )
          }
        })
      )
      for (const option of geometry) {
        expect(option.singleLine, `${option.value}不应折行`).toBe(true)
        expect(option.fullyReadable, `${option.value}应完整可读`).toBe(true)
        if (key === 'scope') {
          expect(option.insideField, `${option.value}应在字段内`).toBe(true)
        }
      }
      if (key === 'view') {
        const viewport = field.locator('.art-form-item__content')
        await viewport.evaluate((element) => (element.scrollLeft = element.scrollWidth))
        const last = await options.last().boundingBox()
        const bounds = await viewport.boundingBox()
        expect(last && bounds && last.x + last.width <= bounds.x + bounds.width + 1).toBe(true)
      }
      await field.screenshot({ path: info.outputPath(`${key}-choices-${width}.png`) })
    }
  }

  await page.getByRole('radio', { name: '按单据明细', exact: true }).press('Space')
  await page.getByRole('checkbox', { name: '按业务部门', exact: true }).press('Space')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  const output = page.getByRole('status', { name: '已提交筛选' })
  await expect(output).toHaveText('{"view":"lines","scope":["documents","department"]}')
})
