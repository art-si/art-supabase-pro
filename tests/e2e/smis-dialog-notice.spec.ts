import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(240_000)

for (const scenario of [
  {
    feature: 'auto-confirm',
    dialogTitle: '自动确认规则',
    noticeTitle:
      '发放后领用人未主动确认时，系统将在设定天数到期后自动确认，并记录确认来源为“系统”。',
    description: ''
  },
  {
    feature: 'tool-return',
    dialogTitle: '新增工器具归还单',
    noticeTitle: '按源发放明细办理归还',
    description: '支持同一领用人跨发放单多选；系统会汇总源单号，并逐行校验剩余可归还数量。'
  }
]) {
  test(`SMIS 弹窗说明复用语义提示：${scenario.dialogTitle}`, async ({ page }, testInfo) => {
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
    await page.route('**/rest/v1/rpc/smis_get_ppe_setting_secure', (route) =>
      route.fulfill({ json: { autoConfirmDays: 3 } })
    )
    await page.goto(`/tests/e2e/fixtures/smis-dialog-notice.html?feature=${scenario.feature}`)

    const dialog = page.getByRole('dialog', { name: scenario.dialogTitle, exact: true })
    await expect(dialog).toBeVisible()
    const notice = dialog.locator('.el-alert--info').first()
    await expect(notice).toContainText(scenario.noticeTitle)
    if (scenario.description) await expect(notice).toContainText(scenario.description)
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true
    )
    await page.screenshot({
      path: testInfo.outputPath('dialog-notice.png'),
      animations: 'disabled'
    })
  })
}
