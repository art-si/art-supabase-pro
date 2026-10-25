import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const failed of [false, true]) {
  test(`旧转交保存${failed ? '失败' : '成功'}不影响新任务`, async ({ page }) => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let saving = false
    let returned = false
    let payload: { p_task_id: string; p_reason: string; p_assignee_user_id: string } | undefined
    await page.route('**/rest/v1/**', async (route) => {
      if (new URL(route.request().url()).pathname.endsWith('/rpc/transfer_workflow_task')) {
        payload = route.request().postDataJSON()
        saving = true
        await held
        await route.fulfill(
          failed
            ? { status: 503, json: { code: 'XX000', message: 'synthetic stale save' } }
            : { json: 'task-a' }
        )
        returned = true
        return
      }
      await route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'next-user',
            user_name: '审核员 B',
            nick_name: '审核员 B',
            user_email: 'test@example.invalid'
          }
        ]
      })
    })
    await page.goto('/tests/e2e/fixtures/workflow-transfer.html')
    await page.getByRole('button', { name: '打开转交' }).click()
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: /审核员 B/ }).click()
    await page.getByRole('textbox', { name: /转交原因/ }).fill('原任务转交原因')
    await page.getByRole('button', { name: '确认转交', exact: true }).click()
    await expect.poll(() => saving).toBe(true)
    expect(payload).toMatchObject({
      p_task_id: 'task-a',
      p_reason: '原任务转交原因',
      p_assignee_user_id: 'next-user'
    })
    await page.getByRole('button', { name: '打开另一租户任务' }).evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect(page.getByRole('button', { name: '确认转交', exact: true })).toBeEnabled()
    await page.getByRole('textbox', { name: /转交原因/ }).fill('新任务填写内容')
    release()
    await expect.poll(() => returned).toBe(true)
    await expect(page.getByTestId('success-count')).toHaveText('0')
    await expect(page.locator('.el-message')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: /转交原因/ })).toHaveValue('新任务填写内容')
    await expect(page.getByRole('dialog')).toBeVisible()
  })
}

test('审批人失败可重试且保留转交原因', async ({ page }, testInfo) => {
  let failed = true
  let writes = 0
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.includes('/rpc/')) writes += 1
    if (path.endsWith('/sys_user') && failed) {
      return route.fulfill({
        status: 503,
        json: { code: 'XX000', message: 'synthetic unavailable' }
      })
    }
    return route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: 'next-user',
          user_name: '审核员 B',
          nick_name: '审核员 B',
          user_email: 'test@example.invalid'
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/workflow-transfer.html')
  await page.getByRole('button', { name: '打开转交' }).click()
  await expect(page.getByText('审批人加载失败', { exact: true })).toBeVisible()
  const reason = page.getByRole('textbox', { name: /转交原因/ })
  await reason.fill('保留已填写的转交原因')
  await expect(page.getByRole('button', { name: '确认转交', exact: true })).toBeDisabled()
  expect(writes).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('transfer-error.png'), fullPage: true })
  failed = false
  await page.getByRole('button', { name: /重试|重新加载/ }).click()
  await expect(page.getByText('审批人加载失败', { exact: true })).toHaveCount(0)
  await expect(reason).toHaveValue('保留已填写的转交原因')
  await expect(page.getByRole('button', { name: '确认转交', exact: true })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath('transfer-recovered.png'), fullPage: true })
})

test('审批转交旧租户失败不覆盖新任务', async ({ page }) => {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let pending = false
  let returned = false
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('tenant_id') === 'eq.tenant-a') {
      pending = true
      await held
      await route.fulfill({
        status: 503,
        json: { code: 'XX000', message: 'synthetic old failure' }
      })
      returned = true
      return
    }
    await route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: 'next-b',
          user_name: '审核员 B',
          nick_name: '审核员 B',
          user_email: 'test@example.invalid'
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/workflow-transfer.html')
  await page.getByRole('button', { name: '打开转交' }).click()
  await expect.poll(() => pending).toBe(true)
  // 仅模拟外部任务上下文重开回调，不代表遮罩下的真实指针交互。
  await page.getByRole('button', { name: '打开另一租户任务' }).evaluate((button) => {
    ;(button as HTMLButtonElement).click()
  })
  await expect(page.getByRole('button', { name: '确认转交', exact: true })).toBeEnabled()
  await page.getByRole('textbox', { name: /转交原因/ }).fill('当前任务原因')
  release()
  await expect.poll(() => returned).toBe(true)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  await expect(page.getByText('审批人加载失败', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: /转交原因/ })).toHaveValue('当前任务原因')
  await expect(page.getByRole('button', { name: '确认转交', exact: true })).toBeEnabled()
})
