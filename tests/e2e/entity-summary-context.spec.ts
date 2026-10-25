import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)

for (const scenario of [
  {
    feature: 'calendar',
    dialogTitle: '设置日期类型',
    summaryTitle: '2026 年 10 月 23 日',
    description: '星期五 · 点击类型后立即保存'
  },
  {
    feature: 'hidden-task',
    dialogTitle: '转交隐患排查任务',
    summaryTitle: 'TASK-2026-001',
    description: '危险化学品储罐区 · 储罐区年度隐患排查计划'
  }
]) {
  test(`跨仓弹窗复用上下文摘要：${scenario.dialogTitle}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const dark = testInfo.project.name.includes('dark')
    const boxMode = testInfo.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    await page.addInitScript(
      ({ dark, boxMode }) => {
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            document.documentElement.classList.toggle('dark', dark)
            document.documentElement.dataset.boxMode = boxMode
          },
          { once: true }
        )
      },
      { dark, boxMode }
    )
    await page.goto(`/tests/e2e/fixtures/entity-summary-context.html?feature=${scenario.feature}`)

    const dialog = page.getByRole('dialog', { name: scenario.dialogTitle, exact: true })
    await expect(dialog).toBeVisible()
    const summary = dialog.getByRole('group', { name: scenario.summaryTitle, exact: true })
    await expect(summary).toContainText(scenario.description)
    await expect(summary.locator('.art-entity-summary__icon')).toBeVisible()
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true
    )
    await page.screenshot({
      path: testInfo.outputPath('entity-summary.png'),
      animations: 'disabled'
    })
  })
}
