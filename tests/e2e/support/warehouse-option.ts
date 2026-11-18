import { expect, type Locator } from '@playwright/test'

export async function expectWarehouseCodeVisible(option: Locator, code: string): Promise<void> {
  await expect(option).toHaveCSS('white-space', 'nowrap')
  const fits = await option.evaluate((element, code) => {
    const label = element.querySelector('span')?.firstChild ?? element.firstChild
    const start = label?.textContent?.indexOf(code) ?? -1
    if (!label || start < 0) return false
    const textRange = new Range()
    textRange.setStart(label, start)
    textRange.setEnd(label, start + code.length)
    const bounds = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return textRange.getBoundingClientRect().right <= bounds.right - parseFloat(style.paddingRight)
  }, code)
  expect(fits, `窄屏须完整显示仓库编码 ${code}`).toBe(true)
}
