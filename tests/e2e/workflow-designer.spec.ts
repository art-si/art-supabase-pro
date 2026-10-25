import { expect, test } from '@playwright/test'

test('普通租户只读查看流程且无法进入设计器', async ({ page }) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('#/workflow/definition', { waitUntil: 'domcontentloaded' })
  await expect(page).not.toHaveURL(/#\/(?:auth\/)?login|#\/403/)
  await expect(page.locator('.workflow-definition')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })

  await expect(page.getByText('租户只读', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '新建流程', exact: true })).toHaveCount(0)

  await page.goto('#/workflow/definition?designer=new&template=custom', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('.workflow-designer-page')).toBeVisible({ timeout: 60_000 })
  await expect(
    page.getByText('流程配置仅允许平台超级管理员访问；普通用户可在流程管理中只读查看。', {
      exact: true
    })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '发布新版', exact: true })).toHaveCount(0)

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
  expect(pageErrors, `页面出现未捕获错误：\n${pageErrors.join('\n')}`).toEqual([])
})
