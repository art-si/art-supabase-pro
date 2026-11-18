import { expect, type Locator } from '@playwright/test'

/** A long tree choice stays on one line and exposes its full name without widening the page. */
export async function expectTreeChoiceReadable(choice: Locator): Promise<void> {
  await expect(choice).toBeVisible()
  await expect(choice).toHaveCSS('white-space', 'nowrap')
  const name = await choice.innerText()
  await expect
    .poll(() => choice.evaluate((element) => element.closest('[title]')?.getAttribute('title')))
    .toBe(name)
  await expect
    .poll(() =>
      choice.evaluate((element) => {
        const popup = element.closest('.el-select__popper.el-tree-select__popper')
        if (!popup) throw new Error('未找到组织下拉')
        const { left, right } = popup.getBoundingClientRect()
        return Math.max(
          -left,
          right - innerWidth,
          document.documentElement.scrollWidth - innerWidth
        )
      })
    )
    .toBeLessThanOrEqual(1)
}
