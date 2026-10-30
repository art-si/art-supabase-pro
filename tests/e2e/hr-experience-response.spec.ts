import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { expectHrIdentityIconStyle } from './support/hr-identity-icon-style'

test.use({ storageState: { cookies: [], origins: [] } })
const survey = {
  availability: 'available',
  id: 'participant-test',
  survey_code: 'SURVEY-001',
  survey_name: '测试体验调查',
  end_date: '2026-10-31',
  minimum_group_size: 5,
  privacy_note: '答案匿名保存。',
  questions: [
    {
      id: 'question-test',
      dimension: 'experience',
      question_text: '您是否愿意推荐团队？',
      answer_type: 'enps_11',
      required: true,
      enabled: true,
      sort: 1
    }
  ]
}
for (const width of [570, 1440]) {
  test(`体验调查 ${width}px 加载失败可重试，题目就绪前禁止提交`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width, height: 900 })
    let requests = 0
    await page.route('**/rest/v1/**', (route) => {
      if (route.request().url().includes('hr_get_employee_experience_detail_secure')) {
        requests++
        return requests === 1
          ? route.fulfill({
              status: 503,
              json: { code: 'temporary_unavailable', message: 'temporary unavailable' }
            })
          : route.fulfill({ json: survey })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/hr-talent-dialogs.html?feature=experience')
    const dialog = page.getByRole('dialog', { name: '填写匿名员工体验调查', exact: true })
    await expect(
      dialog.getByText('调查题目加载失败，请重新加载后填写', { exact: true })
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: '匿名提交', exact: true })).toBeDisabled()
    await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(dialog.getByText('1. 您是否愿意推荐团队？', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '匿名提交', exact: true })).toBeEnabled()
    expect(requests).toBe(2)
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0)
    await dialog.getByRole('button', { name: '匿名提交', exact: true }).click()
    await expect(dialog.getByText('请完成此必答题', { exact: true })).toBeVisible()
    await dialog.locator('label.el-radio-button').filter({ hasText: /^0$/ }).click()
    await expect(dialog.getByRole('radio', { name: '0', exact: true })).toBeChecked()
    await dialog.getByRole('button', { name: '匿名提交', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '确认匿名提交', exact: true })
    await expect(confirmation).toBeVisible()
    await confirmation.getByRole('button', { name: '返回检查', exact: true }).click()
    await expect(dialog).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('experience-ready.png'),
      animations: 'disabled'
    })
  })
}

test('体验调查无题目时保留说明并禁止匿名提交', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: route.request().url().includes('hr_get_employee_experience_detail_secure')
        ? { ...survey, questions: [] }
        : []
    })
  )
  await page.goto('/tests/e2e/fixtures/hr-talent-dialogs.html?feature=experience')
  const dialog = page.getByRole('dialog', { name: '填写匿名员工体验调查', exact: true })
  await expect(dialog.getByText('调查暂无可填写题目', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '匿名提交', exact: true })).toBeDisabled()
})

test('体验调查加载后已结束时不再开放作答', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: route.request().url().includes('hr_get_employee_experience_detail_secure')
        ? { ...survey, availability: 'expired' }
        : []
    })
  )
  await page.goto('/tests/e2e/fixtures/hr-talent-dialogs.html?feature=experience')
  const dialog = page.getByRole('dialog', { name: '填写匿名员工体验调查', exact: true })
  await expect(dialog.getByText('本次调查已结束', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '匿名提交', exact: true })).toBeDisabled()
  await expect(dialog.getByText('1. 您是否愿意推荐团队？', { exact: true })).toHaveCount(0)
})

for (const variant of [
  { name: 'light', width: 1440 },
  { name: 'dark', width: 570 }
]) {
  test(`体验调查图标 ${variant.width}px ${variant.name} 保持原尺寸与主题色`, async ({
    page
  }, testInfo) => {
    await prepareIsolatedSession(page)
    await page.setViewportSize({ width: variant.width, height: 900 })
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: route.request().url().includes('hr_get_employee_experience_detail_secure')
          ? survey
          : []
      })
    )
    await page.goto(
      `/tests/e2e/fixtures/hr-talent-dialogs.html?feature=experience&theme=${variant.name}`
    )
    const dialog = page.getByRole('dialog', { name: '填写匿名员工体验调查', exact: true })
    await expect(dialog.getByText('1. 您是否愿意推荐团队？', { exact: true })).toBeVisible()
    const options = dialog.locator('.experience-response-dialog__form label.el-radio-button')
    await expect(options).toHaveCount(11)
    const zeroOption = options.filter({ hasText: /^0$/ })
    await expect(zeroOption).toBeVisible()
    await expect(zeroOption.locator('input[type="radio"]')).toBeEnabled()
    await expect(dialog.getByRole('button', { name: '匿名提交', exact: true })).toBeEnabled()
    await expect(dialog.locator('.experience-response-dialog__form .el-skeleton')).toHaveCount(0)
    await expect
      .poll(() =>
        page.evaluate(() => ({
          dark: document.documentElement.classList.contains('dark'),
          colorScheme: getComputedStyle(document.documentElement).colorScheme
        }))
      )
      .toEqual({ dark: variant.name === 'dark', colorScheme: variant.name })
    await expectHrIdentityIconStyle(
      dialog.locator('.experience-response-dialog__hero > div:first-child > span')
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: testInfo.outputPath(`experience-${variant.name}-${variant.width}.png`),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/hr-talent-dialogs\.html\?feature=experience/)
  })
}
