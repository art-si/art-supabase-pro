import { expect, type Locator } from '@playwright/test'

export async function expectInputTextUnclipped(inputs: Locator): Promise<void> {
  expect(await inputs.count(), '应存在需要检查的输入框').toBeGreaterThan(0)
  const clipped = await inputs.evaluateAll((elements) =>
    elements.some((element) => {
      const input = element as HTMLInputElement
      const context = document.createElement('canvas').getContext('2d')
      if (!context) throw new Error('无法测量输入文本')
      const style = getComputedStyle(input)
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      let available =
        input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      const suffix = input.closest('.el-input')?.querySelector('.el-input__suffix')
      if (suffix && suffix.getBoundingClientRect().width > 0) {
        available = Math.min(
          available,
          suffix.getBoundingClientRect().left -
            input.getBoundingClientRect().left -
            parseFloat(style.paddingLeft)
        )
      }
      return context.measureText(input.value).width > available
    })
  )
  expect(clipped, '完整输入文本不得被输入框宽度截断').toBe(false)
}
