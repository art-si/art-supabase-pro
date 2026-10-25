import { expect, test, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
async function fillTemplate(page: Page, edit = false) {
  const dialog = page.getByRole('dialog', {
    name: edit ? '编辑作业模板' : '新增作业模板',
    exact: true
  })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: /作业模板$/ }).fill('测试模板', { timeout: 10_000 })
  await dialog.getByRole('textbox', { name: '任务分类', exact: true }).fill('质量检查')
  await dialog.getByRole('textbox', { name: '任务项名称', exact: true }).fill('检查外观')
  return dialog
}
for (const scope of ['all', 'selected', 'ordinary', 'edit'] as const) {
  test(`作业模板提交保留目标租户 ${scope}`, async ({ page }, testInfo) => {
    await prepareIsolatedSession(page)
    const writes: Array<{ method: string; payload: unknown }> = []
    await page.route('**/rest/v1/mdm_operation_template?**', (route) => {
      writes.push({ method: route.request().method(), payload: route.request().postDataJSON() })
      return route.fulfill({ json: [{ id: 'saved-template' }] })
    })
    await page.goto(`/tests/e2e/fixtures/operation-template-scope.html?scope=${scope}`)
    await page.getByRole('button', { name: '打开模板', exact: true }).click()
    const dialog = await fillTemplate(page, scope === 'edit')
    await page.screenshot({
      path: testInfo.outputPath('template-filled.png'),
      animations: 'disabled'
    })
    await dialog
      .getByRole('button', { name: scope === 'edit' ? '保存更改' : '创建模板', exact: true })
      .click()
    await expect(page.getByTestId('success-count')).toHaveText('1')
    expect(writes).toHaveLength(1)
    expect(writes[0].method).toBe(scope === 'edit' ? 'PATCH' : 'POST')
    expect(writes[0].payload).toMatchObject({
      tenant_id:
        scope === 'selected'
          ? '22222222-2222-4222-8222-222222222222'
          : scope === 'edit'
            ? '33333333-3333-4333-8333-333333333333'
            : '11111111-1111-4111-8111-111111111111'
    })
  })
}

test('作业模板保存失败只提示一次并保留填写', async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/mdm_operation_template?**', (route) =>
    route.fulfill({ status: 500, json: { code: 'XX000', message: 'technical save failure' } })
  )
  await page.goto('/tests/e2e/fixtures/operation-template-scope.html?scope=all')
  await page.getByRole('button', { name: '打开模板', exact: true }).click()
  const dialog = await fillTemplate(page)
  await dialog.getByRole('button', { name: '创建模板', exact: true }).click()
  await expect(page.locator('.el-message:visible')).toHaveCount(1)
  await expect(
    page.getByText('作业模板保存失败，请检查任务项和网络后重试', { exact: true })
  ).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: /作业模板$/ })).toHaveValue('测试模板')
  await expect(page.getByTestId('success-count')).toHaveText('0')
})

test('离开模板页面后迟到的保存不触发成功反馈', async ({ page }) => {
  await prepareIsolatedSession(page)
  const pending: Route[] = []
  await page.route('**/rest/v1/mdm_operation_template?**', (route) => {
    pending.push(route)
  })
  await page.goto('/tests/e2e/fixtures/operation-template-scope.html?scope=all')
  await page.getByRole('button', { name: '打开模板', exact: true }).click()
  const dialog = await fillTemplate(page)
  await dialog.getByRole('button', { name: '创建模板', exact: true }).click()
  await expect.poll(() => pending.length).toBe(1)
  // 触发夹具路由导航，覆盖真实路由强制关闭不会调用业务 onClose 的路径。
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('main button')].find(
      (item) => item.textContent === '离开模板页面'
    )
    if (!(button instanceof HTMLButtonElement)) throw new Error('缺少夹具导航')
    button.click()
  })
  await expect(dialog).not.toBeVisible()
  await pending[0].fulfill({ json: [{ id: 'saved-template' }] })
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(page.getByTestId('success-count')).toHaveText('0')
  await expect(page.getByText('作业模板已保存', { exact: true })).toHaveCount(0)
})
