import { expect, type Locator } from '@playwright/test'

export async function expectInputTextUnclipped(
  inputs: Locator,
  kind: 'value' | 'placeholder' = 'value'
): Promise<void> {
  const measurements = await inputs.evaluateAll((elements, kind) => {
    const context = document.createElement('canvas').getContext('2d')
    if (!context) throw new Error('无法测量输入文本')

    return elements.map((input) => {
      if (!(input instanceof HTMLInputElement)) throw new Error('宽度检查需要定位到输入框')
      const style = getComputedStyle(input)
      const textStyle = kind === 'placeholder' ? getComputedStyle(input, '::placeholder') : style
      const text = input[kind]
      context.font = `${textStyle.fontStyle} ${textStyle.fontWeight} ${textStyle.fontSize} ${textStyle.fontFamily}`
      let available =
        input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const bounds = input.getBoundingClientRect()
      const suffix = input
        .closest('.el-input')
        ?.querySelector('.el-input__suffix')
        ?.getBoundingClientRect()
      if (suffix && suffix.width > 0) {
        available = Math.min(available, suffix.left - bounds.left - parseFloat(style.paddingLeft))
      }
      const editor = input.closest('.el-date-editor')?.getBoundingClientRect()
      return {
        label: input.getAttribute('aria-label') || input.placeholder || '输入框',
        text,
        available,
        required: context.measureText(text).width,
        insideRangeEditor:
          !input.matches('.el-range-input') ||
          (!!editor && bounds.left >= editor.left && bounds.right <= editor.right)
      }
    })
  }, kind)

  expect(measurements.length, '应存在需要检查的输入框').toBeGreaterThan(0)
  for (const { label, text, available, required, insideRangeEditor } of measurements) {
    expect(available, `${label}「${text}」应完整可读`).toBeGreaterThanOrEqual(required)
    expect(insideRangeEditor, `${label}应位于范围选择器内`).toBe(true)
  }
}
