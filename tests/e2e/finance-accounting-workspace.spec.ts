import { expect, test, type Page } from '@playwright/test'

const financeWorkspaces = [
  'account-set',
  'accounting-auxiliary',
  'accounting-currency',
  'accounting-subject',
  'auto-posting',
  'bank-reconciliation',
  'commercial-bill',
  'financial-reports',
  'fixed-asset',
  'fund-account',
  'fund-journal',
  'fund-transfer',
  'ledger-center',
  'opening-balance',
  'payroll',
  'period-close',
  'tax-management',
  'voucher-center',
  'voucher-template'
] as const

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const viewport = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth + 1)
}

test('财务工作台共享外壳覆盖全部页面且保持响应式稳定', async ({ page }) => {
  test.setTimeout(360_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  for (const workspace of financeWorkspaces) {
    await page.goto(`#/fms/${workspace}`, { waitUntil: 'domcontentloaded' })
    await expect(page).not.toHaveURL(/#\/(?:auth\/)?login/)

    const shell = page.locator('.accounting-workspace-shell').first()
    await expect(shell, `${workspace} 未渲染共享财务工作台外壳`).toBeVisible({ timeout: 60_000 })
    await expect(shell).toHaveClass(new RegExp(`${workspace}-page`))

    const layout = await shell.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        display: style.display,
        flexDirection: style.flexDirection,
        minWidth: style.minWidth
      }
    })
    expect(layout).toEqual({ display: 'flex', flexDirection: 'column', minWidth: '0px' })
    await expectNoHorizontalOverflow(page)
  }

  expect(pageErrors, `财务工作台出现未捕获错误：\n${pageErrors.join('\n')}`).toEqual([])
})
