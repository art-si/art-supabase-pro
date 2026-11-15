import { expect, type Locator } from '@playwright/test'

export async function expectPaginationControlsInView(pager: Locator): Promise<void> {
  await expect(pager).toBeVisible()
  await expect
    .poll(() =>
      pager.evaluate((element) => {
        let left = 0
        let right = innerWidth
        for (let parent = element.parentElement; parent; parent = parent.parentElement) {
          if (getComputedStyle(parent).overflowX === 'visible') continue
          const start = parent.getBoundingClientRect().left + parent.clientLeft
          left = Math.max(left, start)
          right = Math.min(right, start + parent.clientWidth)
        }
        return [...element.querySelectorAll('button, .el-pager li, .el-pagination__total')].every(
          (control) => {
            const rect = control.getBoundingClientRect()
            return !rect.width || (rect.left >= left - 1 && rect.right <= right + 1)
          }
        )
      })
    )
    .toBe(true)
}
