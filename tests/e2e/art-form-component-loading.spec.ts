import { expect, test, type Page, type Request, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`自定义布局不加载预置控件，切换后拦截提交和校验 ${theme}/${box}`, async ({
      page
    }, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      let registryRoute: Route | undefined
      await page.route('**/src/components/core/forms/art-form/components.ts*', (route) => {
        registryRoute = route
      })
      await page.goto(
        `/tests/e2e/fixtures/art-form-values.html?layout=custom&theme=${theme}&box=${box}`
      )
      await expect(page.getByTestId('custom-layout-content')).toBeVisible()
      expect(registryRoute).toBeUndefined()
      await page.getByRole('button', { name: '切换自定义布局', exact: true }).click()
      await expect.poll(() => Boolean(registryRoute)).toBe(true)
      await expect(page.locator('.art-form .art-async-state[aria-busy="true"]')).toHaveCount(3)
      await expect(page.getByRole('button', { name: '提交测试', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: '重置测试', exact: true })).toBeDisabled()
      await page.getByRole('button', { name: '外部校验', exact: true }).click()
      await expect(page.getByLabel('校验结果')).toHaveText('校验未通过')
      await page.getByRole('button', { name: '回调校验', exact: true }).click()
      await expect(page.getByLabel('校验结果')).toHaveText('校验未通过：name、period、acknowledged')
      await page.screenshot({
        path: testInfo.outputPath('form-controls-loading.png'),
        fullPage: true
      })
      await registryRoute?.continue()
      await expect(page.locator('.art-form .art-async-state')).toHaveCount(0, { timeout: 60_000 })
      await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('初始名称')
      expect(
        await page.locator('.art-form .el-date-editor').evaluate((control) => {
          const field = control.closest('.el-form-item__content')
          if (!field) return false
          const controlBounds = control.getBoundingClientRect()
          const fieldBounds = field.getBoundingClientRect()
          return (
            controlBounds.left >= fieldBounds.left - 1 &&
            controlBounds.right <= fieldBounds.right + 1
          )
        })
      ).toBe(true)
      await expect(page.getByRole('button', { name: '提交测试', exact: true })).toBeEnabled()
      await page.getByRole('button', { name: '外部校验', exact: true }).click()
      await expect(page.getByLabel('校验结果')).toHaveText('校验通过')
      await page.getByRole('button', { name: '提交测试', exact: true }).click()
      await expect(page.getByTestId('form-output')).toContainText('初始名称')
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath('form-controls-loaded.png'),
        fullPage: true
      })
      expect(errors).toEqual([])
    })
  }
}

test('预置控件持续失败显示共享错误状态并保持提交拦截', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/src/components/core/forms/art-form/components.ts*', (route) =>
    route.fulfill({ status: 503, contentType: 'text/javascript', body: 'unavailable' })
  )
  await page.goto('/tests/e2e/fixtures/art-form-values.html')
  await expect(page.getByText('表单控件加载失败，请重试', { exact: true })).toHaveCount(3)
  await expect(page.getByRole('button', { name: '提交测试', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '回调校验', exact: true }).click()
  await expect(page.getByLabel('校验结果')).toHaveText('校验未通过：name、period、acknowledged')
  await page.getByRole('button', { name: '重新加载', exact: true }).first().click()
  await expect(
    page.getByText('表单控件暂时无法加载，请保留已填内容后刷新页面', { exact: true })
  ).toHaveCount(3)
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '提交测试', exact: true })).toBeDisabled()
  await page.screenshot({ path: testInfo.outputPath('form-controls-error.png'), fullPage: true })
})

test('预置控件请求恢复后可以重试并保留表单默认值', async ({ page }) => {
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  let attempts = 0
  await page.route('**/src/components/core/forms/art-form/components.ts*', (route) => {
    attempts++
    return attempts === 1
      ? route.fulfill({ status: 503, contentType: 'text/javascript', body: 'unavailable' })
      : route.continue()
  })
  await page.goto('/tests/e2e/fixtures/art-form-values.html')
  await expect(page.getByText('表单控件加载失败，请重试', { exact: true })).toHaveCount(3)
  await page.getByRole('button', { name: '重新加载', exact: true }).first().click()
  await expect(page.getByRole('textbox', { name: '名称', exact: true })).toHaveValue('初始名称')
  await expect(page.getByRole('button', { name: '提交测试', exact: true })).toBeEnabled()
  expect(attempts).toBe(2)
})

async function prepareRegistryBoundary(
  page: Page,
  mode: 'mixed' | 'slot' | 'hidden' | 'fields' | 'query' | 'mounted',
  network: 'hold' | 'first-error' = 'hold',
  nestedLayout = false
) {
  await prepareIsolatedSession(page, { platformSuper: false })
  await page.setViewportSize({ width: mode === 'slot' ? 390 : 1280, height: 900 })
  const errors: string[] = []
  const warnings: string[] = []
  const requests: string[] = []
  const held: Route[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (
      /maximum recursive updates|slot.+invoked outside|unhandled error during execution/i.test(
        message.text()
      )
    )
      warnings.push(message.text())
  })
  await page.route('**/src/components/core/forms/art-form/components.ts*', (route) => {
    requests.push(route.request().url())
    if (network === 'first-error')
      return requests.length === 1
        ? route.fulfill({ status: 503, contentType: 'text/javascript', body: 'unavailable' })
        : route.continue()
    held.push(route)
  })
  await page.goto(
    `/tests/e2e/fixtures/art-form-values.html?registry-boundary=${mode}&theme=${mode === 'slot' ? 'dark' : 'light'}&box=shadow-mode${nestedLayout ? '&nested-layout=1' : ''}`,
    { waitUntil: 'domcontentloaded' }
  )
  await expect(page.getByRole('heading', { name: '实际渲染控件依赖边界' })).toBeVisible()
  let validations = 0
  const validate = async (valid: boolean, keys: string[] = [], callback = true) => {
    await page
      .getByRole('button', { name: callback ? '回调边界校验' : 'Promise边界校验', exact: true })
      .click()
    await expect(page.getByTestId('boundary-validation')).toHaveText(
      JSON.stringify({ sequence: ++validations, valid, keys })
    )
  }
  const release = async (fail = false) => {
    const routes = held.splice(0)
    if (!routes.length) throw new Error('尚无待放行的预置控件请求')
    for (const route of routes)
      await (fail
        ? route.fulfill({ status: 503, contentType: 'text/javascript', body: 'unavailable' })
        : route.continue())
  }
  const assertClean = async () => {
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
  }
  return { requests, release, validate, assertClean }
}

test('实际需求边界 mixed 隐藏租户与原生字段不阻止独立渲染表单', async ({ page }, info) => {
  const boundary = await prepareRegistryBoundary(page, 'mixed')
  const name = page.getByRole('textbox', { name: '独立渲染名称', exact: true })
  const submit = page.getByRole('button', { name: '边界提交', exact: true })
  const reset = page.getByRole('button', { name: '边界重置', exact: true })
  await expect(name).toHaveValue('初始名称')
  await expect(page.locator('[data-art-form-item-key="hiddenName"]')).toHaveCount(0)
  await expect(page.locator('[data-art-form-item-key="tenantId"]')).toHaveCount(0)
  await expect(page.getByTestId('boundary-ready')).toHaveText('true')
  await expect(submit).toBeEnabled()
  await expect(reset).toBeEnabled()
  await name.fill('已就绪的独立输入')
  await boundary.validate(true)
  await boundary.validate(true, [], false)
  await submit.click()
  await expect(page.getByTestId('boundary-submissions')).toHaveText('1')
  await expect(page.getByTestId('boundary-output')).toContainText('已就绪的独立输入')
  await reset.click()
  await expect(page.getByTestId('boundary-resets')).toHaveText('1')
  await expect(name).toHaveValue('初始名称')
  expect(boundary.requests).toEqual([])
  await page.screenshot({ path: info.outputPath('no-preset-demand.png'), fullPage: true })
  await boundary.assertClean()
})

test('实际需求边界 slot 动态移除与空返回触发fallback，恢复完整槽释放等待', async ({
  page
}, info) => {
  const boundary = await prepareRegistryBoundary(page, 'slot')
  const composite = page.getByRole('textbox', { name: '组合名称', exact: true })
  const submit = page.getByRole('button', { name: '边界提交', exact: true })
  const reset = page.getByRole('button', { name: '边界重置', exact: true })
  await expect(submit).toBeEnabled()
  await composite.fill('跨渲染方式保留的草稿')
  const form = page.locator('.art-form')
  const original = await form.elementHandle()
  if (!original) throw new Error('实际依赖边界表单未挂载')
  await boundary.validate(true)
  expect(boundary.requests).toEqual([])
  for (const transition of ['移除命名插槽', '命名插槽返回空']) {
    await page.getByRole('button', { name: transition, exact: true }).click()
    await expect.poll(() => boundary.requests.length).toBe(1)
    await expect(page.locator('.art-async-state[aria-busy="true"]')).toHaveCount(1)
    await expect(submit).toBeDisabled()
    await expect(reset).toBeDisabled()
    await boundary.validate(false, ['name'])
    await page.getByRole('button', { name: '完整命名插槽', exact: true }).click()
    await expect(submit).toBeEnabled()
    await expect(reset).toBeEnabled()
    await expect(page.locator('.art-async-state')).toHaveCount(0)
    await expect(composite).toHaveValue('跨渲染方式保留的草稿')
    await boundary.validate(true)
    expect(await form.evaluate((current, previous) => current === previous, original)).toBe(true)
  }
  await boundary.release(true)
  await submit.click()
  await expect(page.getByTestId('boundary-submissions')).toHaveText('1')
  await expect(page.getByTestId('boundary-output')).toContainText('跨渲染方式保留的草稿')
  expect(boundary.requests).toHaveLength(1)
  await page.screenshot({ path: info.outputPath('dynamic-slot-ready.png'), fullPage: true })
  await boundary.assertClean()
})

test('实际需求边界 hidden 失败字段隐藏后可操作，重显保留唯一显式重试', async ({ page }, info) => {
  const boundary = await prepareRegistryBoundary(page, 'hidden', 'first-error')
  const submit = page.getByRole('button', { name: '边界提交', exact: true })
  await expect(submit).toBeEnabled()
  expect(boundary.requests).toEqual([])
  await page.getByRole('button', { name: '显示原生字段', exact: true }).click()
  const error = page.getByText('表单控件加载失败，请重试', { exact: true })
  await expect(error).toBeVisible()
  await expect(submit).toBeDisabled()
  await boundary.validate(false, ['hiddenName'])
  expect(boundary.requests).toHaveLength(1)
  await page.getByRole('button', { name: '隐藏原生字段', exact: true }).click()
  await expect(submit).toBeEnabled()
  await expect(page.getByRole('button', { name: '边界重置', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '修改隐藏值', exact: true }).click()
  await boundary.validate(true)
  await page.getByRole('button', { name: '显示原生字段', exact: true }).click()
  await expect(error).toBeVisible()
  await expect(submit).toBeDisabled()
  await boundary.validate(false, ['hiddenName'], false)
  expect(boundary.requests).toHaveLength(1)
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  const input = page.getByRole('textbox', { name: /隐藏原生字段$/ })
  await expect(input).toHaveValue('修改后的隐藏草稿')
  expect(boundary.requests).toHaveLength(2)
  await input.fill('')
  await boundary.validate(false, ['hiddenName'])
  await expect(page.getByText('请填写隐藏字段', { exact: true })).toBeVisible()
  await input.fill('恢复后修正的字段')
  await boundary.validate(true)
  await submit.click()
  await expect(page.getByTestId('boundary-output')).toContainText('恢复后修正的字段')
  await page.getByRole('button', { name: '边界重置', exact: true }).click()
  await expect(page.getByTestId('boundary-resets')).toHaveText('1')
  await expect(input).toHaveValue('初始隐藏值')
  await page.getByRole('button', { name: '隐藏原生字段', exact: true }).click()
  await page.getByRole('button', { name: '显示原生字段', exact: true }).click()
  await expect(input).toHaveValue('初始隐藏值')
  expect(boundary.requests).toHaveLength(2)
  await page.screenshot({ path: info.outputPath('hidden-demand-recovered.png'), fullPage: true })
  await boundary.assertClean()
})

test('实际需求边界 fields 复合槽子schema必须等待，首次函数ref即阻止真实子字段', async ({
  page
}, info) => {
  const boundary = await prepareRegistryBoundary(page, 'fields')
  await expect(page.getByTestId('boundary-first-ref')).toHaveText(
    JSON.stringify({ ready: false, valid: false, keys: ['nestedName'] })
  )
  await expect.poll(() => boundary.requests.length).toBe(1)
  await expect(page.getByRole('button', { name: '边界提交', exact: true })).toBeDisabled()
  await expect(page.locator('.art-async-state[aria-busy="true"]')).toHaveCount(1)
  await boundary.validate(false, ['nestedName'])
  await boundary.validate(false, ['nestedName'], false)
  await boundary.release()
  const input = page.getByRole('textbox', { name: /子业务名称$/ })
  await expect(input).toHaveValue('')
  await boundary.validate(false, ['nestedName'])
  await expect(page.getByText('请填写子业务名称', { exact: true })).toBeVisible()
  await input.fill('复合分区中的真实业务字段')
  await boundary.validate(true)
  await page.getByRole('button', { name: '边界提交', exact: true }).click()
  await expect(page.getByTestId('boundary-output')).toContainText('复合分区中的真实业务字段')
  expect(boundary.requests).toHaveLength(1)
  await page.screenshot({ path: info.outputPath('nested-fields-loaded.png'), fullPage: true })
  await boundary.assertClean()
})

test('实际需求边界 nested 子schema等待与错误定位揭示外层页签和折叠分区', async ({ page }, info) => {
  const boundary = await prepareRegistryBoundary(page, 'fields', 'hold', true)
  const overview = page.getByRole('tab', { name: '概览', exact: true })
  const details = page.getByRole('tab', { name: '详情', exact: true })
  await expect(page.getByTestId('boundary-ready')).toHaveText('false')
  await expect.poll(() => boundary.requests.length).toBe(1)
  await details.click()
  const toggle = page.getByRole('button', { name: /组合分区$/ })
  if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click()
  await overview.click()
  await expect(overview).toHaveAttribute('aria-selected', 'true')
  const child = page.locator('[data-art-form-item-key="nestedName"]')
  await expect(child).toBeHidden()

  // Run after the native form and DOM exist; the first-ref check only establishes the loading gate.
  await boundary.validate(false, ['nestedName'])
  await expect(details).toHaveAttribute('aria-selected', 'true')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(child.locator('.art-async-state[aria-busy="true"]')).toBeVisible()
  await boundary.release()
  const input = page.getByRole('textbox', { name: /子业务名称$/ })
  await expect(input).toBeVisible()
  await boundary.validate(false, ['nestedName'])
  await expect(input).toBeFocused()
  await expect(page.getByText('请填写子业务名称', { exact: true })).toBeVisible()
  await input.fill('隐藏组合页签中的草稿')
  await overview.click()
  await boundary.validate(true)
  await page.getByRole('button', { name: '边界提交', exact: true }).click()
  await expect(page.getByTestId('boundary-output')).toContainText('隐藏组合页签中的草稿')
  expect(boundary.requests).toHaveLength(1)
  await page.screenshot({ path: info.outputPath('nested-owner-revealed.png'), fullPage: true })
  await boundary.assertClean()
})

test('实际需求边界 query 未展开预置筛选延迟加载，折叠释放且保留筛选值', async ({ page }, info) => {
  const boundary = await prepareRegistryBoundary(page, 'query')
  const search = page.getByRole('button', { name: '查询', exact: true })
  const reset = page.getByRole('button', { name: '重置', exact: true })
  await expect(search).toBeEnabled()
  await expect(reset).toBeEnabled()
  await expect(page.locator('[data-art-form-item-key="advanced"]')).toHaveCount(0)
  await boundary.validate(true)
  await search.click()
  await expect(page.getByTestId('boundary-submissions')).toHaveText('1')
  await expect(page.getByTestId('boundary-output')).toContainText('保留的高级值')
  expect(boundary.requests).toEqual([])
  await page.getByRole('button', { name: /展开/ }).click()
  await expect.poll(() => boundary.requests.length).toBe(1)
  await expect(search).toBeDisabled()
  await expect(reset).toBeDisabled()
  await expect(page.locator('.art-async-state[aria-busy="true"]')).toHaveCount(1)
  await boundary.validate(false, ['advanced'])
  await page.getByRole('textbox', { name: '组合名称', exact: true }).fill('折叠后保留的查询名称')
  await page.getByRole('button', { name: '收起', exact: true }).click()
  await expect(search).toBeEnabled()
  await expect(reset).toBeEnabled()
  await expect(page.locator('[data-art-form-item-key="advanced"]')).toHaveCount(0)
  await boundary.validate(true)
  await boundary.release(true)
  await search.click()
  await expect(page.getByTestId('boundary-submissions')).toHaveText('2')
  await expect(page.getByTestId('boundary-output')).toContainText('保留的高级值')
  await expect(page.getByTestId('boundary-output')).toContainText('折叠后保留的查询名称')
  await reset.click()
  await expect(page.getByTestId('boundary-resets')).toHaveText('1')
  await expect(page.getByRole('textbox', { name: '组合名称', exact: true })).toHaveValue('初始名称')
  await expect(page.getByTestId('boundary-values')).toContainText('保留的高级值')
  expect(boundary.requests).toHaveLength(1)
  await page.screenshot({ path: info.outputPath('query-collapsed-ready.png'), fullPage: true })
  await boundary.assertClean()
})

test('实际需求边界 mounted 折叠分区与未活动页签仍挂载并参与完整校验', async ({ page }, info) => {
  const boundary = await prepareRegistryBoundary(page, 'mounted')
  await expect.poll(() => boundary.requests.length).toBe(1)
  await expect(page.locator('.art-async-state[aria-busy="true"]')).toHaveCount(2)
  await expect(page.locator('[data-art-form-item-key="dividerName"]')).toBeHidden()
  await expect(page.locator('[data-art-form-item-key="tabName"]')).toBeHidden()
  await expect(page.getByRole('button', { name: '边界提交', exact: true })).toBeDisabled()
  await boundary.validate(false, ['dividerName', 'tabName'])
  await boundary.release()
  await boundary.validate(false, ['dividerName', 'tabName'])
  const first = page.getByRole('textbox', { name: /分区名称$/ })
  await expect(first).toBeVisible()
  await first.fill('折叠分区草稿')
  await page.getByRole('tab', { name: '详情', exact: true }).click()
  await page.getByRole('textbox', { name: /页签名称$/ }).fill('非活动页签草稿')
  await boundary.validate(true)
  await page.getByRole('button', { name: '边界提交', exact: true }).click()
  await expect(page.getByTestId('boundary-output')).toContainText('折叠分区草稿')
  await expect(page.getByTestId('boundary-output')).toContainText('非活动页签草稿')
  expect(boundary.requests).toHaveLength(1)
  await page.screenshot({ path: info.outputPath('mounted-presets-loaded.png'), fullPage: true })
  await boundary.assertClean()
})

test('仅需原生输入时不依赖未使用的签名模块', async ({ page }, info) => {
  await prepareIsolatedSession(page, { platformSuper: false })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))

  const signaturePath = '/src/components/core/forms/art-signature-pad/index.vue'
  const signatureRequests: string[] = []
  const errors: string[] = []
  const isSignatureEntry = (request: Request) => {
    const url = new URL(request.url())
    return (
      request.resourceType() === 'script' &&
      url.pathname === signaturePath &&
      !url.searchParams.has('vue')
    )
  }
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (isSignatureEntry(request)) {
      const url = new URL(request.url())
      signatureRequests.push(url.pathname + url.search)
    }
  })
  await page.route('**/src/components/core/forms/art-signature-pad/index.vue*', (route) => {
    // Abort only the unused component entry; leave SFC submodules and every other module alone.
    return isSignatureEntry(route.request()) ? route.abort('failed') : route.continue()
  })

  await page.goto(
    '/tests/e2e/fixtures/art-form-values.html?registry-boundary=hidden&theme=light&box=border-mode',
    { waitUntil: 'domcontentloaded' }
  )
  const ready = page.getByTestId('boundary-ready')
  const submit = page.getByRole('button', { name: '边界提交', exact: true })
  const input = page.getByRole('textbox', { name: /隐藏原生字段$/ })
  const loadError = page.getByText('表单控件加载失败，请重试', { exact: true })
  await expect(ready).toHaveText('true')
  await expect(submit).toBeEnabled()
  expect(signatureRequests).toEqual([])

  await page.getByRole('button', { name: '显示原生字段', exact: true }).click()
  await expect(page.getByTestId('boundary-native-shown')).toHaveText('true')
  // Record a settled shared error as well as a usable control, so RED identifies the failed boundary.
  await expect
    .poll(async () => (await input.isVisible()) || (await loadError.isVisible()), {
      timeout: 60_000
    })
    .toBe(true)
  await info.attach('unused-signature-dependency', {
    contentType: 'application/json',
    body: JSON.stringify({
      signatureRequests,
      ready: await ready.textContent(),
      inputVisible: await input.isVisible(),
      loadErrorVisible: await loadError.isVisible(),
      submitEnabled: await submit.isEnabled()
    })
  })

  // No unused request is allowed; swallowing the rejected import cannot satisfy this contract.
  expect(signatureRequests).toEqual([])
  await expect(loadError).toHaveCount(0)
  await expect(input).toHaveValue('初始隐藏值')
  await expect(ready).toHaveText('true')
  await expect(submit).toBeEnabled()

  await input.fill('')
  await page.getByRole('button', { name: '回调边界校验', exact: true }).click()
  await expect(page.getByTestId('boundary-validation')).toHaveText(
    JSON.stringify({ sequence: 1, valid: false, keys: ['hiddenName'] })
  )
  await expect(page.getByText('请填写隐藏字段', { exact: true })).toBeVisible()
  const draft = '未使用签名模块不影响原生输入草稿'
  await input.fill(draft)
  await page.getByRole('button', { name: '回调边界校验', exact: true }).click()
  await expect(page.getByTestId('boundary-validation')).toHaveText(
    JSON.stringify({ sequence: 2, valid: true, keys: [] })
  )
  await submit.click()
  await expect(page.getByTestId('boundary-submissions')).toHaveText('1')
  await expect(page.getByTestId('boundary-output')).toContainText(draft)
  expect(signatureRequests).toEqual([])
  expect(errors).toEqual([])
})

test('动态加载单位并行启动，同key切回原生后隔离旧请求失败与重试预算', async ({ page }, info) => {
  await prepareIsolatedSession(page, { platformSuper: false })
  await page.setViewportSize({ width: 1280, height: 900 })
  const paths = {
    tagStyleSelect: '/src/components/core/forms/art-tag-style-select/index.vue',
    cascader: '/src/components/core/forms/art-cascader/index.vue'
  } as const
  const held: Record<keyof typeof paths, Route[]> = { tagStyleSelect: [], cascader: [] }
  const requests: Array<{ unit: keyof typeof paths; url: string }> = []
  const nativeRequests: string[] = []
  const errors: string[] = [],
    warnings: string[] = []
  const phases: Array<{ phase: string; ready: string | null; values: string | null }> = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (
      /maximum recursive updates|slot.+invoked outside|unhandled error during execution/i.test(
        message.text()
      )
    )
      warnings.push(message.text())
  })
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      request.resourceType() === 'script' &&
      url.pathname === '/src/components/core/forms/art-form/components.ts'
    )
      nativeRequests.push(url.pathname + url.search)
  })
  for (const unit of ['tagStyleSelect', 'cascader'] as const) {
    await page.route(`**${paths[unit]}*`, (route) => {
      const request = route.request(),
        url = new URL(request.url())
      if (
        request.resourceType() !== 'script' ||
        url.pathname !== paths[unit] ||
        url.searchParams.has('vue')
      )
        return route.continue()
      requests.push({ unit, url: url.pathname + url.search })
      held[unit].push(route)
    })
  }
  const ready = page.getByTestId('units-ready')
  const form = page.locator('.art-form')
  const submit = page.getByRole('button', { name: '单位提交', exact: true })
  const native = form.locator('[data-art-form-item-key="nativeName"] input')
  const style = form.locator('[data-art-form-item-key="tagStyle"]')
  const dynamic = form.locator('[data-art-form-item-key="dynamicValue"]')
  let validationSequence = 0
  const validate = async (valid: boolean, keys: string[] = []) => {
    await page.getByRole('button', { name: '单位回调校验', exact: true }).click()
    await expect(page.getByTestId('units-validation')).toHaveText(
      JSON.stringify({ sequence: ++validationSequence, valid, keys })
    )
  }
  const record = async (phase: string) =>
    phases.push({
      phase,
      ready: await ready.textContent(),
      values: await page.getByTestId('units-values').textContent()
    })
  try {
    await page.goto(
      '/tests/e2e/fixtures/art-form-values.html?registry-units=1&theme=light&box=border-mode',
      { waitUntil: 'domcontentloaded' }
    )
    await expect(page.getByRole('heading', { name: '动态控件加载单位', exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(form.locator('.art-async-state')).toHaveCount(0, { timeout: 60_000 })
    await expect(native).toHaveValue('初始原生名称')
    await expect(ready).toHaveText('true')
    await expect(submit).toBeEnabled()
    expect(requests).toEqual([])
    expect(nativeRequests).toHaveLength(1)
    const originalForm = await form.elementHandle()
    const originalNative = await native.elementHandle()
    if (!originalForm || !originalNative) throw new Error('初始原生表单或输入未挂载')
    await validate(true)
    await native.fill('标签等待期间的原生草稿')

    await page.getByRole('button', { name: '显示标签控件', exact: true }).click()
    await expect
      .poll(() => requests.filter((request) => request.unit === 'tagStyleSelect').length)
      .toBe(1)
    await expect(style.locator('.art-async-state[aria-busy="true"]')).toBeVisible()
    await expect(ready).toHaveText('false')
    await expect(submit).toBeDisabled()
    await validate(false, ['tagStyle'])
    await record('tag-style-pending')

    await page.getByRole('button', { name: '显示级联控件', exact: true }).click()
    await expect
      .poll(() => requests.filter((request) => request.unit === 'cascader').length)
      .toBe(1)
    await expect(style.locator('.art-async-state[aria-busy="true"]')).toBeVisible()
    await expect(dynamic.locator('.art-async-state[aria-busy="true"]')).toBeVisible()
    await expect(ready).toHaveText('false')
    await expect(submit).toBeDisabled()
    await validate(false, ['tagStyle', 'dynamicValue'])
    const nativeDraft = '两个单位等待时仍可编辑的原生草稿'
    await native.fill(nativeDraft)
    const originalDynamic = await dynamic.elementHandle()
    if (!originalDynamic) throw new Error('动态字段尚未挂载')
    await record('both-units-pending')
    await page.screenshot({
      path: info.outputPath('dynamic-units-pending.png'),
      fullPage: true,
      animations: 'disabled'
    })

    const tagRoute = held.tagStyleSelect.shift()
    if (!tagRoute) throw new Error('标签样式单位尚无待放行请求')
    await tagRoute.continue()
    await expect(style.locator('.art-async-state')).toHaveCount(0, { timeout: 60_000 })
    await expect(style.getByRole('combobox')).toBeVisible()
    await style.locator('.el-select__wrapper').click()
    await page.getByRole('option').filter({ hasText: 'success' }).click()
    await expect(
      style.locator('.el-select__selected-item').filter({ hasText: '成功' })
    ).toBeVisible()
    await expect(dynamic.locator('.art-async-state[aria-busy="true"]')).toBeVisible()
    await expect(ready).toHaveText('false')
    await expect(submit).toBeDisabled()
    await validate(false, ['dynamicValue'])

    await page.getByRole('button', { name: '切换动态字段为原生', exact: true }).click()
    await expect(page.getByTestId('units-kind')).toHaveText('constructor')
    const fallback = dynamic.getByRole('textbox')
    await expect(fallback).toHaveValue('保留的动态字段值')
    await expect(ready).toHaveText('true')
    await expect(submit).toBeEnabled()
    expect(
      await dynamic.evaluate((current, original) => current === original, originalDynamic)
    ).toBe(true)
    const dynamicDraft = '未知原型键回退后保留的动态草稿'
    await fallback.fill(dynamicDraft)
    await validate(true)
    await record('cached-native-fallback')

    const cascaderRoute = held.cascader.shift()
    if (!cascaderRoute) throw new Error('旧级联单位尚无待返回请求')
    const failedResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === paths.cascader && response.status() === 503
    )
    await cascaderRoute.fulfill({
      status: 503,
      contentType: 'text/javascript',
      body: 'unavailable'
    })
    await failedResponse
    await expect(ready).toHaveText('true')
    await expect(fallback).toHaveValue(dynamicDraft)
    await expect(submit).toBeEnabled()
    await validate(true)
    await record('obsolete-cascader-failed')

    await page.getByRole('button', { name: '切回级联控件', exact: true }).click()
    await expect(dynamic.getByText('表单控件加载失败，请重试', { exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(ready).toHaveText('false')
    await expect(submit).toBeDisabled()
    await validate(false, ['dynamicValue'])
    expect(requests.filter((request) => request.unit === 'cascader')).toHaveLength(1)
    await page.screenshot({
      path: info.outputPath('dynamic-unit-cached-error.png'),
      fullPage: true,
      animations: 'disabled'
    })
    expect(
      await dynamic.evaluate((current, original) => current === original, originalDynamic)
    ).toBe(true)
    await record('cached-cascader-error-no-auto-retry')

    await page.getByRole('button', { name: '切换动态字段为原生', exact: true }).click()
    await expect(fallback).toHaveValue(dynamicDraft)
    await expect(native).toHaveValue(nativeDraft)
    await expect(ready).toHaveText('true')
    await expect(submit).toBeEnabled()
    await validate(true)
    await submit.click()
    await expect(page.getByTestId('units-submissions')).toHaveText('1')
    await expect(page.getByTestId('units-output')).toHaveText(
      JSON.stringify({ nativeName: nativeDraft, tagStyle: 'success', dynamicValue: dynamicDraft })
    )
    expect(await form.evaluate((current, original) => current === original, originalForm)).toBe(
      true
    )
    expect(await native.evaluate((current, original) => current === original, originalNative)).toBe(
      true
    )
    expect(
      await dynamic.evaluate((current, original) => current === original, originalDynamic)
    ).toBe(true)
    expect(requests.filter((request) => request.unit === 'tagStyleSelect')).toHaveLength(1)
    expect(requests.filter((request) => request.unit === 'cascader')).toHaveLength(1)
    expect(nativeRequests).toHaveLength(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
  } finally {
    await info.attach('dynamic-preset-unit-lifecycle', {
      contentType: 'application/json',
      body: JSON.stringify({ requests, nativeRequests, phases, errors, warnings }, null, 2)
    })
  }
})
