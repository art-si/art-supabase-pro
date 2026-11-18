import { expect, type Locator } from '@playwright/test'

export async function expectCompactOverlayLabel(field: Locator): Promise<Locator> {
  const caption = field.locator('.art-form-item__label-text')
  await expect(caption).toBeVisible()
  const geometry = await caption.evaluate((element) => {
    const label = element.closest('.el-form-item__label')
    const control = element.closest('.el-form-item')?.querySelector('.el-form-item__content')
    if (!label || !control) throw new Error('缺少弹层字段的标签或控件')
    const captionRect = element.getBoundingClientRect()
    const labelRect = label.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      whiteSpace: style.whiteSpace,
      overflow: style.overflowX,
      ellipsis: style.textOverflow,
      labelSpace: labelRect.right - captionRect.right,
      controlSpace: control.getBoundingClientRect().left - captionRect.right
    }
  })
  const measured = JSON.stringify(geometry)
  expect(geometry.clientWidth, measured).toBeGreaterThan(0)
  expect(geometry.scrollWidth, measured).toBeGreaterThan(geometry.clientWidth + 1)
  expect(geometry.whiteSpace, measured).toBe('nowrap')
  expect(geometry.overflow, measured).toBe('hidden')
  expect(geometry.ellipsis, measured).toBe('ellipsis')
  expect(geometry.labelSpace, measured).toBeGreaterThanOrEqual(-1)
  expect(geometry.controlSpace, measured).toBeGreaterThanOrEqual(-1)
  return caption
}
