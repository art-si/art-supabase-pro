import { expect, type Locator, type Page } from '@playwright/test'
import { expectInputTextUnclipped } from './input-text-width'

// Vue compares event and listener timestamps, so the clock must keep ticking during input.
export const installQueryDateClock = (page: Page) =>
  page.clock.install({ time: new Date('2026-11-16T03:30:00Z') })

export async function selectQueryDateRange(field: Locator): Promise<void> {
  await field.getByPlaceholder('开始日期').click()
  const dates = field
    .page()
    .locator('.el-date-range-picker:visible .el-date-range-picker__content')
    .first()
    .locator('td.available')
  await dates.filter({ hasText: /^7$/ }).click({ timeout: 15_000 })
  await dates.filter({ hasText: /^10$/ }).click({ timeout: 15_000 })
}

export async function expectQueryDateRangeReadable(field: Locator): Promise<void> {
  const start = field.getByPlaceholder('开始日期')
  const end = field.getByPlaceholder('结束日期')
  await expect(start).toHaveValue('2026-11-07')
  await expect(end).toHaveValue('2026-11-10')
  await expectInputTextUnclipped(start.or(end))
}

export async function expectStackedQueryRangeAligned(editor: Locator): Promise<void> {
  await expect(editor).toHaveCSS('display', 'grid')
  const layout = await editor.evaluate((element) => {
    const inputs = Array.from(element.querySelectorAll<HTMLInputElement>('.el-range-input'))
    const separator = element.querySelector('.el-range-separator')
    if (inputs.length !== 2 || !separator) throw new Error('未找到完整范围控件')
    const textBounds = document.createRange()
    textBounds.selectNodeContents(separator)
    const { right: separatorRight } = textBounds.getBoundingClientRect()
    const marker = separator.getBoundingClientRect()
    const rows = inputs.map((input) => {
      const bounds = input.getBoundingClientRect()
      const style = getComputedStyle(input)
      return {
        left: bounds.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth),
        align: style.textAlign,
        center: bounds.top + bounds.height / 2
      }
    })
    const [start, end] = rows
    return {
      startAlign: start.align,
      endAlign: end.align,
      offset: Math.abs(start.left - end.left),
      gap:
        Math.abs(marker.top + marker.height / 2 - end.center) < 4 ? end.left - separatorRight : null
    }
  })
  expect(layout.startAlign).toBe('start')
  expect(layout.endAlign).toBe('start')
  expect(layout.offset).toBeLessThanOrEqual(1)
  if (layout.gap !== null) {
    expect(layout.gap).toBeGreaterThanOrEqual(0)
    expect(layout.gap).toBeLessThanOrEqual(8)
  }
}
