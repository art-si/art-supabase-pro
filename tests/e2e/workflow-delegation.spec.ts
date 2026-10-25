import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const failed of [true, false]) {
  test(`创建委托${failed ? '失败保留表单且只提示一次' : '成功后刷新失败明确提示'}`, async ({
    page
  }) => {
    let writes = 0
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/rpc/create_workflow_delegation')) {
        writes += 1
        expect(route.request().postDataJSON()).toMatchObject({
          p_delegate_user_id: 'colleague',
          p_reason: '委托创建测试原因'
        })
        return route.fulfill(
          failed
            ? {
                status: 503,
                json: { code: 'XX000', message: 'synthetic create failure' }
              }
            : { json: 'delegation-created' }
        )
      }
      if (writes && !failed && path.endsWith('/wf_delegation')) {
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'synthetic refresh failure' }
        })
      }
      const data = path.endsWith('/sys_user')
        ? [
            {
              id: 'colleague',
              user_name: '同事 B',
              nick_name: '同事 B',
              user_email: 'test@example.invalid'
            }
          ]
        : []
      return route.fulfill({
        headers: {
          'content-range': data.length ? '0-0/1' : '*/0',
          'access-control-expose-headers': 'content-range'
        },
        json: data
      })
    })
    await page.goto('/tests/e2e/fixtures/workflow-delegation.html')
    await page.getByRole('button', { name: '打开委托', exact: true }).click()
    await page.getByRole('combobox', { name: /受托人/ }).click()
    await page.getByRole('option', { name: /同事 B/ }).click()
    await page.getByPlaceholder('开始时间', { exact: true }).fill('2099-01-01 09:00:00')
    await page.getByPlaceholder('开始时间', { exact: true }).press('Tab')
    await page.getByPlaceholder('结束时间', { exact: true }).fill('2099-01-02 18:00:00')
    await page.getByPlaceholder('结束时间', { exact: true }).press('Tab')
    await page.getByRole('textbox', { name: /委托原因/ }).fill('委托创建测试原因')
    await page.getByRole('button', { name: '创建委托', exact: true }).click()
    if (failed) {
      await expect(page.locator('.el-message--warning')).toHaveCount(1)
      await expect(page.locator('.el-message--warning')).toContainText('审批委托创建失败')
      await expect(page.getByRole('textbox', { name: /委托原因/ })).toHaveValue('委托创建测试原因')
      await expect(page.getByPlaceholder('开始时间', { exact: true })).not.toHaveValue('')
      await expect(page.getByPlaceholder('结束时间', { exact: true })).not.toHaveValue('')
      await expect(page.getByTestId('success-count')).toHaveText('0')
    } else {
      await expect(page.locator('.el-message--success')).toContainText('审批委托已创建')
      await expect(page.locator('.el-message--warning')).toContainText(
        '审批委托已创建，但列表刷新失败'
      )
      await expect(page.getByTestId('success-count')).toHaveText('1')
      await expect(page.getByRole('dialog')).not.toBeVisible()
    }
    expect(writes).toBe(1)
  })
}

for (const failed of [false, true]) {
  test(`旧撤销${failed ? '失败' : '成功'}返回不影响新用户委托`, async ({ page }) => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let saving = false
    let returned = false
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.name))
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/rpc/revoke_workflow_delegation')) {
        saving = true
        await held
        await route.fulfill(
          failed
            ? { status: 503, json: { code: 'XX000', message: 'synthetic stale revoke' } }
            : { json: 'delegation-a' }
        )
        returned = true
        return
      }
      const data =
        url.pathname.endsWith('/wf_delegation') && url.searchParams.get('or')?.includes('user-a')
          ? [
              {
                id: 'delegation-a',
                tenant_id: 'tenant-a',
                delegator_user_id: 'user-a',
                delegate_user_id: 'colleague',
                starts_at: '2026-01-01',
                ends_at: '2099-01-01',
                reason: '离岗委托',
                delegate: {
                  id: 'colleague',
                  user_name: '同事 B',
                  user_email: 'test@example.invalid'
                }
              }
            ]
          : []
      await route.fulfill({
        headers: {
          'content-range': data.length ? '0-0/1' : '*/0',
          'access-control-expose-headers': 'content-range'
        },
        json: data
      })
    })
    await page.goto('/tests/e2e/fixtures/workflow-delegation.html')
    await page.getByRole('button', { name: '打开委托', exact: true }).click()
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    const prompt = page.locator('.el-message-box')
    await prompt.getByRole('textbox').fill('旧撤销原因')
    await prompt.getByRole('button', { name: '确定', exact: true }).click()
    await expect.poll(() => saving).toBe(true)
    // 模拟外部上下文重开，不代表遮罩下真实指针操作。
    await page.getByRole('button', { name: '打开另一用户委托' }).evaluate((button) => {
      ;(button as HTMLButtonElement).click()
    })
    await expect(page.getByRole('button', { name: '创建委托', exact: true })).toBeEnabled()
    await page.getByRole('textbox', { name: /委托原因/ }).fill('新用户填写内容')
    release()
    await expect.poll(() => returned).toBe(true)
    await expect(page.getByTestId('success-count')).toHaveText('0')
    await expect(page.locator('.el-message')).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: /委托原因/ })).toHaveValue('新用户填写内容')
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(errors).toEqual([])
  })
}

for (const failed of [false, true]) {
  test(`撤销委托${failed ? '失败保留记录' : '成功后刷新失败明确提示'}`, async ({ page }) => {
    let writes = 0
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.name))
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/rpc/revoke_workflow_delegation')) {
        writes += 1
        expect(route.request().postDataJSON()).toMatchObject({
          p_delegation_id: 'delegation-a',
          p_reason: '撤销测试原因'
        })
        return route.fulfill(
          failed
            ? { status: 503, json: { code: 'XX000', message: 'synthetic revoke failure' } }
            : { json: 'delegation-a' }
        )
      }
      if (writes && !failed && path.endsWith('/wf_delegation')) {
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'synthetic refresh failure' }
        })
      }
      const data = path.endsWith('/wf_delegation')
        ? [
            {
              id: 'delegation-a',
              tenant_id: 'tenant-a',
              delegator_user_id: 'user-a',
              delegate_user_id: 'colleague',
              starts_at: '2026-01-01',
              ends_at: '2099-01-01',
              reason: '离岗委托',
              delegate: { id: 'colleague', user_name: '同事 B', user_email: 'test@example.invalid' }
            }
          ]
        : []
      return route.fulfill({
        headers: {
          'content-range': data.length ? '0-0/1' : '*/0',
          'access-control-expose-headers': 'content-range'
        },
        json: data
      })
    })
    await page.goto('/tests/e2e/fixtures/workflow-delegation.html')
    await page.getByRole('button', { name: '打开委托', exact: true }).click()
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    const prompt = page.locator('.el-message-box')
    await prompt.getByRole('textbox').fill('撤销测试原因')
    await prompt.getByRole('button', { name: '确定', exact: true }).click()
    if (failed) {
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(page.locator('.el-message--error')).toContainText('审批委托撤销失败')
      await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeVisible()
      await expect(page.getByTestId('success-count')).toHaveText('0')
    } else {
      await expect(page.locator('.el-message--success')).toContainText('审批委托已撤销')
      await expect(page.locator('.el-message--warning')).toContainText(
        '审批委托已撤销，但列表刷新失败'
      )
      await expect(page.getByTestId('success-count')).toHaveText('1')
      await expect(page.getByText('委托数据加载失败', { exact: true })).toBeVisible()
    }
    expect(writes).toBe(1)
    expect(errors).toEqual([])
  })
}

test('委托旧用户加载失败不覆盖新用户内容', async ({ page }) => {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let pending = false
  let returned = false
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/wf_delegation') && url.searchParams.get('or')?.includes('user-a')) {
      pending = true
      await held
      await route.fulfill({
        status: 503,
        json: { code: 'XX000', message: 'synthetic stale failure' }
      })
      returned = true
      return
    }
    const data = url.pathname.endsWith('/sys_user')
      ? [
          {
            id: 'colleague',
            user_name: '同事 B',
            nick_name: '同事 B',
            user_email: 'test@example.invalid'
          }
        ]
      : []
    await route.fulfill({
      headers: {
        'content-range': data.length ? '0-0/1' : '*/0',
        'access-control-expose-headers': 'content-range'
      },
      json: data
    })
  })
  await page.goto('/tests/e2e/fixtures/workflow-delegation.html')
  await page.getByRole('button', { name: '打开委托', exact: true }).click()
  await expect.poll(() => pending).toBe(true)
  // 外部上下文重开回调，不代表遮罩下真实指针操作。
  await page.getByRole('button', { name: '打开另一用户委托' }).evaluate((button) => {
    ;(button as HTMLButtonElement).click()
  })
  await expect(page.getByRole('button', { name: '创建委托', exact: true })).toBeEnabled()
  await page.getByRole('textbox', { name: /委托原因/ }).fill('新用户委托内容')
  release()
  await expect.poll(() => returned).toBe(true)
  await expect(page.getByText('委托数据加载失败', { exact: true })).toHaveCount(0)
  await expect(page.locator('.el-message')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: /委托原因/ })).toHaveValue('新用户委托内容')
  await expect(page.getByRole('button', { name: '创建委托', exact: true })).toBeEnabled()
})

test('取消撤销委托不写入且不产生异常', async ({ page }) => {
  let writes = 0
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.name))
  await page.route('**/rest/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.includes('/rpc/')) writes += 1
    const data = path.endsWith('/wf_delegation')
      ? [
          {
            id: 'delegation-a',
            tenant_id: 'tenant-a',
            delegator_user_id: 'user-a',
            delegate_user_id: 'colleague',
            starts_at: '2026-01-01',
            ends_at: '2099-01-01',
            reason: '离岗委托',
            delegate: { id: 'colleague', user_name: '同事 B', user_email: 'test@example.invalid' }
          }
        ]
      : []
    return route.fulfill({
      headers: {
        'content-range': data.length ? '0-0/1' : '*/0',
        'access-control-expose-headers': 'content-range'
      },
      json: data
    })
  })
  await page.goto('/tests/e2e/fixtures/workflow-delegation.html')
  await page.getByRole('button', { name: '打开委托', exact: true }).click()
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  const prompt = page.locator('.el-message-box')
  await expect(prompt).toBeVisible()
  await prompt.getByRole('button', { name: '取消', exact: true }).click()
  await expect(prompt).toBeHidden()
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeVisible()
  expect(writes).toBe(0)
  expect(errors).toEqual([])
  await expect(page.locator('.el-message')).toHaveCount(0)
})

for (const failedTable of ['sys_user', 'wf_delegation']) {
  test(`委托 ${failedTable} 失败阻止提交且重试保留原因`, async ({ page }, testInfo) => {
    let failed = true
    let writes = 0
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.name))
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.includes('/rpc/')) writes += 1
      if (failed && path.endsWith(`/${failedTable}`)) {
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'synthetic unavailable' }
        })
      }
      const data = path.endsWith('/sys_user')
        ? [
            {
              id: 'colleague',
              user_name: '同事 B',
              nick_name: '同事 B',
              user_email: 'test@example.invalid'
            }
          ]
        : []
      return route.fulfill({
        headers: {
          'content-range': data.length ? '0-0/1' : '*/0',
          'access-control-expose-headers': 'content-range'
        },
        json: data
      })
    })
    await page.goto('/tests/e2e/fixtures/workflow-delegation.html')
    await page.getByRole('button', { name: '打开委托', exact: true }).click()
    await expect(page.getByText('委托数据加载失败', { exact: true })).toBeVisible()
    const reason = page.getByRole('textbox', { name: /委托原因/ })
    await reason.fill('保留委托填写内容')
    await expect(page.getByRole('button', { name: '创建委托', exact: true })).toBeDisabled()
    expect(writes).toBe(0)
    await page.screenshot({ path: testInfo.outputPath('delegation-error.png'), fullPage: true })
    failed = false
    await page
      .locator('.workflow-delegation__create')
      .getByRole('button', { name: '重新加载' })
      .click()
    await expect(page.getByText('委托数据加载失败', { exact: true })).toHaveCount(0)
    await expect(reason).toHaveValue('保留委托填写内容')
    await expect(page.getByRole('button', { name: '创建委托', exact: true })).toBeEnabled()
    await expect(page.getByText('暂无委托记录', { exact: true })).toBeVisible()
    expect(errors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('delegation-recovered.png'), fullPage: true })
  })
}
