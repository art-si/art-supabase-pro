import { expect, type Locator } from '@playwright/test'

export async function expectOverlayTabPanel(overlay: Locator, tabName: string | RegExp) {
  const name = { name: tabName, exact: typeof tabName === 'string' }
  const tab = overlay.getByRole('tab', name)
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const panelId = await tab.getAttribute('aria-controls')
  if (!panelId) throw new Error('当前页签缺少面板关联')

  const tabs = tab.locator(
    'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " el-tabs ")][1]'
  )
  await expect
    .poll(() =>
      tabs.evaluate((element) => {
        for (let node: Element | null = element; node; node = node.parentElement) {
          if (node.matches('.el-dialog, .el-drawer')) break
          if (!node.matches('.art-card, .art-card-sm, .art-card-xs, .art-form__tabs--overlay'))
            continue
          const { borderTopWidth, boxShadow } = getComputedStyle(node)
          if (parseFloat(borderTopWidth) > 0 || boxShadow !== 'none') return true
        }
        return false
      })
    )
    .toBe(true)
  const panel = tabs.getByRole('tabpanel', name)
  await expect(panel).toBeVisible()
  await expect(panel).toHaveAttribute('id', panelId)
  return panel
}
