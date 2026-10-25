import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(300_000)

for (const scenario of [
  {
    feature: 'organization',
    dialogTitle: '新增组织',
    summaryTitle: '建立新的组织节点',
    description: '组织建立后，可在用户与角色管理中直接选择该节点完成授权归属。',
    tag: '新增节点'
  },
  {
    feature: 'user-role',
    dialogTitle: '分配用户角色',
    summaryTitle: '跨区域系统管理员',
    description: 'context.user@example.invalid',
    tag: '已选 2 项'
  }
]) {
  test(`系统弹窗复用上下文摘要：${scenario.dialogTitle}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const boxMode = testInfo.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'
    const dark = testInfo.project.name.includes('dark')
    await page.addInitScript(
      ({ boxMode, dark }) => {
        document.addEventListener(
          'DOMContentLoaded',
          () => {
            document.documentElement.dataset.boxMode = boxMode
            document.documentElement.classList.toggle('dark', dark)
          },
          { once: true }
        )
      },
      { boxMode, dark }
    )
    await page.goto(`/tests/e2e/fixtures/system-dialog-context.html?feature=${scenario.feature}`)
    await expect(page.locator('html')).toHaveAttribute('data-box-mode', boxMode)
    if (dark) await expect(page.locator('html')).toHaveClass(/dark/)

    const dialog = page.getByRole('dialog', { name: scenario.dialogTitle, exact: true })
    await expect(dialog).toBeVisible()
    const summary = dialog.getByRole('group', { name: scenario.summaryTitle, exact: true })
    await expect(summary).toContainText(scenario.description)
    await expect(summary.locator('.el-tag')).toContainText(scenario.tag)
    await expect(summary.locator('.art-entity-summary__icon')).toBeVisible()
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await page.screenshot({
      path: testInfo.outputPath('context-summary.png'),
      animations: 'disabled'
    })
  })
}
