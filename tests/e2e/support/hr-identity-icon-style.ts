import { expect, type Locator } from '@playwright/test'

export async function expectHrIdentityIconStyle(icon: Locator): Promise<void> {
  await expect(icon).toBeVisible()
  const { actual, expected } = await icon.evaluate((element) => {
    const reference = document.createElement('span')
    reference.style.cssText =
      'display:grid;place-items:center;width:46px;height:46px;color:var(--theme-color);background:color-mix(in srgb,var(--theme-color) 12%,transparent);border-radius:var(--el-border-radius-base);position:fixed;visibility:hidden'
    element.after(reference)
    const values = (target: Element) => {
      const style = getComputedStyle(target)
      return {
        display: style.display,
        placeItems: style.placeItems,
        width: style.width,
        height: style.height,
        color: style.color,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderRadius: style.borderRadius
      }
    }
    const actual = values(element)
    const expected = values(reference)
    reference.remove()
    return { actual, expected }
  })
  expect(actual).toEqual(expected)
  expect(actual.width).toBe('46px')
  expect(actual.height).toBe('46px')
}
