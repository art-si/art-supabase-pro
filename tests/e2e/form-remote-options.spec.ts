import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('远程选项失败有重试且保留输入', async ({ page }, testInfo) => {
  let failed = true
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.name))
  await page.route('**/form-options-test?**', (route) =>
    route.fulfill({
      json: failed
        ? { data: null, error: { message: 'synthetic SQL error' } }
        : { data: [{ label: '成员 B', value: 'b' }], error: null }
    })
  )
  await page.goto('/tests/e2e/fixtures/form-remote-options.html')
  await expect(page.getByText('选项加载失败', { exact: true })).toBeVisible()
  await expect(page.getByRole('combobox')).toBeDisabled()
  await expect(page.getByRole('button', { name: '提交表单', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '外部保存', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '校验表单', exact: true }).click()
  await expect(page.getByTestId('validity')).toHaveText('false')
  await page.getByRole('button', { name: '无回调校验', exact: true }).click()
  await expect(page.getByTestId('validity')).toHaveText('已阻止')
  await expect(page.getByTestId('submissions')).toHaveText('0')
  await page.getByRole('textbox', { name: '原因', exact: true }).fill('保留原因')
  await page.screenshot({ path: testInfo.outputPath('options-error.png'), fullPage: true })
  failed = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByRole('combobox')).toBeEnabled()
  await expect(page.getByTestId('member')).toHaveText('b')
  await expect(page.getByRole('button', { name: '外部保存', exact: true })).toBeEnabled()
  await expect(page.getByRole('textbox', { name: '原因', exact: true })).toHaveValue('保留原因')
  await expect(page.getByText('选项加载失败', { exact: true })).not.toBeVisible()
  await page.getByRole('button', { name: '校验表单', exact: true }).click()
  await expect(page.getByTestId('validity')).toHaveText('true')
  await page.getByRole('button', { name: '提交表单', exact: true }).click()
  await expect(page.getByTestId('submissions')).toHaveText('1')
  await page.screenshot({ path: testInfo.outputPath('options-recovered.png'), fullPage: true })
  expect(errors).toEqual([])
})

for (const phase of ['before', 'api', 'after']) {
  test(`选项 ${phase} 异常可重试且不产生未捕获错误`, async ({ page }) => {
    const errors: string[] = []
    let failed = true
    page.on('pageerror', (error) => errors.push(error.name))
    await page.route('**/form-options-test?**', (route) =>
      phase === 'api' && failed
        ? route.abort('failed')
        : route.fulfill({ json: { data: [{ label: '成员 B', value: 'b' }] } })
    )
    await page.goto(`/tests/e2e/fixtures/form-remote-options.html?phase=${phase}`)
    await expect(page.getByText('选项加载失败', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '提交表单', exact: true })).toBeDisabled()
    failed = false
    await page.getByRole('button', { name: '允许加载', exact: true }).click()
    await page.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(page.getByTestId('member')).toHaveText('b')
    await expect(page.getByRole('button', { name: '提交表单', exact: true })).toBeEnabled()
    expect(errors).toEqual([])
  })
}

test('旧请求完成不会解除新请求加载状态', async ({ page }) => {
  let releaseOld: () => void = () => {}
  let releaseNew: () => void = () => {}
  const oldHeld = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  const newHeld = new Promise<void>((resolve) => {
    releaseNew = resolve
  })
  let oldStarted = false
  let newStarted = false
  let oldReturned = false
  await page.route('**/form-options-test?**', async (route) => {
    const old = new URL(route.request().url()).searchParams.get('tenant') === 'a'
    if (old) {
      oldStarted = true
      await oldHeld
    } else {
      newStarted = true
      await newHeld
    }
    await route.fulfill({
      json: { data: [{ label: old ? '旧成员' : '新成员', value: old ? 'a' : 'b' }] }
    })
    if (old) oldReturned = true
  })
  await page.goto('/tests/e2e/fixtures/form-remote-options.html')
  await expect.poll(() => oldStarted).toBe(true)
  await page.getByRole('button', { name: '切换租户', exact: true }).click()
  await expect.poll(() => newStarted).toBe(true)
  releaseOld()
  await expect.poll(() => oldReturned).toBe(true)
  await expect(page.getByRole('combobox')).toBeDisabled()
  await expect(page.getByRole('button', { name: '提交表单', exact: true })).toBeDisabled()
  await expect(page.getByTestId('member')).toHaveText('')
  releaseNew()
  await expect(page.getByTestId('member')).toHaveText('b')
  await expect(page.getByRole('combobox')).toBeEnabled()
})

test('手动加载字段切换租户后旧选项失效', async ({ page }) => {
  await page.route('**/form-options-test?**', (route) => {
    const tenant = new URL(route.request().url()).searchParams.get('tenant')
    return route.fulfill({ json: { data: [{ label: `成员 ${tenant}`, value: tenant }] } })
  })
  await page.goto('/tests/e2e/fixtures/form-remote-options.html?manual')
  await page.getByRole('button', { name: '刷新选项', exact: true }).click()
  await expect(page.getByTestId('member')).toHaveText('a')
  await page.getByRole('button', { name: '切换租户', exact: true }).click()
  await expect(page.getByText('选项加载失败', { exact: true })).toBeVisible()
  await expect(page.getByRole('combobox')).toBeDisabled()
  await expect(page.getByRole('button', { name: '提交表单', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByRole('combobox')).toBeEnabled()
  await page.getByRole('combobox').click()
  await expect(page.getByRole('option', { name: '成员 b', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: '成员 a', exact: true })).not.toBeVisible()
})

for (const failed of [false, true]) {
  test(`旧租户选项${failed ? '失败' : '成功'}不覆盖新租户`, async ({ page }) => {
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let started = false
    let returned = false
    await page.route('**/form-options-test?**', async (route) => {
      if (new URL(route.request().url()).searchParams.get('tenant') === 'a') {
        started = true
        await held
        await route.fulfill({
          json: failed
            ? { data: null, error: { message: 'old error' } }
            : { data: [{ label: '旧成员', value: 'a' }] }
        })
        returned = true
      } else {
        await route.fulfill({ json: { data: [{ label: '新成员', value: 'b' }] } })
      }
    })
    await page.goto('/tests/e2e/fixtures/form-remote-options.html')
    await expect.poll(() => started).toBe(true)
    await page.getByRole('button', { name: '切换租户', exact: true }).click()
    await expect(page.getByTestId('member')).toHaveText('b')
    release()
    await expect.poll(() => returned).toBe(true)
    await expect(page.getByRole('combobox')).toBeEnabled()
    await page.getByRole('combobox').click()
    await expect(page.getByRole('option', { name: '新成员', exact: true })).toBeVisible()
    await expect(page.getByRole('option', { name: '旧成员', exact: true })).not.toBeVisible()
    await expect(page.getByText('选项加载失败', { exact: true })).not.toBeVisible()
    await expect(page.getByTestId('member')).toHaveText('b')
  })
}
