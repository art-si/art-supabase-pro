import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('确认期间权限撤销后不执行表格业务操作', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/art-table-actions.html?mode=revoked')
  await page.getByRole('button', { name: '执行测试操作', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await page.evaluate(() => document.dispatchEvent(new Event('revoke-fixture-permission')))
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByText('操作权限已变化，请刷新页面后重试', { exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toHaveAttribute('data-attempts')
})

for (const mode of ['success', 'failure', 'notified']) {
  test(`共享表格操作锁覆盖确认、执行和${mode}恢复`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`/tests/e2e/fixtures/art-table-actions.html?mode=${mode}`)
    const action = page.getByRole('button', { name: '执行测试操作', exact: true })
    await action.click()
    await action.dispatchEvent('click')
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(action).toBeDisabled()
    await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
    await expect(action).toBeEnabled()
    await expect(page.locator('body')).not.toHaveAttribute('data-attempts')
    await action.click()
    await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.locator('body')).toHaveAttribute('data-attempts', '1')
    await expect(action).toBeDisabled()
    await expect(action).toHaveClass(/is-loading/)
    await action.dispatchEvent('click')
    await expect(page.locator('body')).toHaveAttribute('data-attempts', '1')
    await page.getByRole('button', { name: '结束测试请求' }).click()
    await expect(action).toBeEnabled()
    if (mode === 'success')
      await expect(page.locator('body')).toHaveAttribute('data-completed', '1')
    else await expect(page.locator('.el-message--error')).toHaveCount(1)
    expect(errors).toEqual([])
    await page.screenshot({
      path: `.artifacts/art-table-actions-${mode}-${testInfo.project.name}.png`,
      animations: 'disabled'
    })
    await action.click()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await page.getByRole('dialog').getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.locator('body')).toHaveAttribute('data-attempts', '2')
    await page.getByRole('button', { name: '结束测试请求' }).click()
    await expect(action).toBeEnabled()
  })
}
