import { expect, type Locator } from '@playwright/test'

export async function expectQueryLabelLayout(field: Locator) {
  const geometry = await field.evaluate((field) => {
    const label = field.querySelector('label')
    const text = label?.querySelector('.art-form-item__label > span')
    const editor = field.querySelector('.el-input__wrapper')
    if (!label || !text || !editor) throw new Error('缺少查询标签或输入框')
    const range = document.createRange()
    range.selectNodeContents(text)
    const caption = range.getBoundingClientRect()
    const labelRect = label.getBoundingClientRect()
    const labelStyle = getComputedStyle(label)
    const editorRect = editor.getBoundingClientRect()
    const start = labelRect.left + parseFloat(labelStyle.paddingLeft)
    const end = labelRect.right - parseFloat(labelStyle.paddingRight)
    return {
      text: text.textContent?.trim(),
      textWidth: caption.width,
      labelContentWidth: end - start,
      lines: range.getClientRects().length,
      leftSpace: caption.left - start,
      rightOffset: Math.abs(end - caption.right),
      centerOffset: Math.abs(
        (editorRect.top + editorRect.bottom - caption.top - caption.bottom) / 2
      ),
      alignment: labelStyle.textAlign,
      labelControlsInput: label.htmlFor === field.querySelector('input')?.id
    }
  })
  const measured = JSON.stringify(geometry)
  expect(geometry.lines, measured).toBe(1)
  expect(geometry.leftSpace, measured).toBeGreaterThanOrEqual(-1)
  expect(geometry.rightOffset, measured).toBeLessThanOrEqual(1)
  expect(geometry.centerOffset, measured).toBeLessThanOrEqual(2)
  expect(geometry.alignment, measured).toBe('right')
  expect(geometry.labelControlsInput, measured).toBe(true)
  return geometry
}
