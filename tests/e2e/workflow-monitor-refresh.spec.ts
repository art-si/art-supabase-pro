import { expect, test, type Route } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('监控公共字典延迟加载与专注模式入口', async ({ page }, info) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let generation = 1
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/sys_dictionary')) {
      await gate
      const code = url.searchParams.get('dict_type_table.code')
      await route.fulfill({
        json: [
          { label: '', name: `公共名称选项${generation}`, value: 'normal', status: '1' },
          { label: '停用历史选项', value: 'legacy', status: '0' },
          ...(code === 'eq.workflowSlaStatus'
            ? [{ label: '即将到期', value: 'due_soon', status: '1' }]
            : [])
        ]
      })
    } else if (url.pathname.endsWith('/get_workflow_callback_outbox')) {
      await route.fulfill({
        json: {
          items: [],
          summary: { pending: 0, processing: 0, retryWait: 0, succeeded: 0, deadLetter: 0 }
        }
      })
    } else if (url.pathname.endsWith('/get_workflow_monitor_summary')) {
      await route.fulfill({
        json: {
          runningCount: 0,
          overdueCount: 0,
          approved30dCount: 0,
          rejected30dCount: 0,
          cancelled30dCount: 0,
          averageDurationHours: 0
        }
      })
    } else await route.fulfill({ json: { records: [], total: 0 } })
  })
  await page.goto('/tests/e2e/fixtures/workflow-monitor-refresh.html?mode=dictionary')
  const header = page.locator('.business-workspace-header')
  await expect(header.getByRole('heading', { name: '审批运营监控' })).toBeVisible({
    timeout: 120_000
  })
  release()
  await page.getByRole('button', { name: '展开', exact: true }).click()
  for (const version of [1, 2]) {
    for (const label of ['业务类型', '流程状态', '时效状态']) {
      const select = page
        .locator('.el-form-item')
        .filter({ has: page.getByText(label, { exact: true }) })
        .locator('.el-select')
      await select.scrollIntoViewIfNeeded()
      await select.click()
      const dropdown = page.locator('.el-select-dropdown:visible')
      await expect(dropdown.getByRole('option')).toHaveCount(1)
      await expect(dropdown.getByRole('option')).toHaveText(`公共名称选项${version}`)
      await dropdown.getByRole('option').click()
      await expect(select).toContainText(`公共名称选项${version}`)
    }
    if (version === 1) {
      generation = 2
      await page.getByRole('button', { name: '测试清空字典缓存' }).click()
    }
  }
  const health = page.locator('.workflow-monitor__callback-health')
  const control = page.getByRole('switch', { name: '进入专注模式', exact: true })
  await control.locator('..').click()
  await expect(header).toBeHidden()
  await expect(health).toBeHidden()
  await expect(page.getByRole('combobox', { name: '时效状态', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(header).toBeVisible()
  await expect(health).toBeVisible()
  await control.locator('..').click()
  await page.keyboard.press('Escape')
  await expect(header).toBeVisible()
  await page.screenshot({ path: info.outputPath('monitor-public-controls.png'), fullPage: true })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  expect(errors).toEqual([])
})

test('审批监控旧回调结果不会覆盖刷新结果', async ({ page }) => {
  let initialCallback: Route | undefined
  let callbackRequests = 0
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url()
    if (url.endsWith('/rpc/get_workflow_callback_outbox')) {
      callbackRequests += 1
      if (callbackRequests === 1) {
        initialCallback = route
        return
      }
      await route.fulfill({
        json: {
          items: [],
          summary: { pending: 0, processing: 0, retryWait: 0, succeeded: 22, deadLetter: 0 }
        }
      })
    } else if (url.endsWith('/rpc/get_workflow_monitor_summary')) {
      await route.fulfill({
        json: {
          runningCount: 2,
          overdueCount: 0,
          approved30dCount: 1,
          rejected30dCount: 0,
          cancelled30dCount: 0,
          averageDurationHours: 1
        }
      })
    } else
      await route.fulfill({
        json: url.includes('/sys_dictionary') ? [] : { records: [], total: 0 }
      })
  })
  await page.goto('/tests/e2e/fixtures/workflow-monitor-refresh.html')
  await expect.poll(() => callbackRequests).toBe(1)
  await expect(
    page
      .locator('.workflow-monitor__callback-health')
      .getByText('正在检查回调健康度', { exact: true })
  ).toHaveCount(1)
  const refresh = page.getByRole('button', { name: '刷新审批监控数据' })
  await expect(refresh).toBeEnabled()
  await refresh.click()
  await expect.poll(() => callbackRequests).toBe(2)
  const health = page.locator('.workflow-monitor__callback-health')
  await expect(health).toContainText('22')
  await initialCallback?.fulfill({
    json: {
      items: [],
      summary: { pending: 99, processing: 0, retryWait: 99, succeeded: 1, deadLetter: 99 }
    }
  })
  const lateResponse = await initialCallback?.request().response()
  await lateResponse?.finished()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(health).toHaveAttribute('aria-busy', 'false')
  await expect(health).toContainText('22')
  await expect(health).not.toContainText('99')
  await expect(page.getByText('业务回调运行正常', { exact: true })).toBeVisible()
  await page.screenshot({
    path: `.artifacts/workflow-monitor-refresh-${page.viewportSize()?.width}.png`,
    fullPage: true
  })
})

test('回调健康度失败不显示正常状态且可重试', async ({ page }) => {
  let callbackRequests = 0
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url()
    if (url.endsWith('/rpc/get_workflow_callback_outbox')) {
      callbackRequests += 1
      if (callbackRequests === 1 || callbackRequests === 3) {
        await route.fulfill({ status: 500, json: { message: 'internal failure', code: 'XX000' } })
      } else
        await route.fulfill({
          json: {
            items: [],
            summary: { pending: 0, processing: 0, retryWait: 0, succeeded: 7, deadLetter: 0 }
          }
        })
    } else if (url.endsWith('/rpc/get_workflow_monitor_summary')) {
      await route.fulfill({
        json: {
          runningCount: 0,
          overdueCount: 0,
          approved30dCount: 0,
          rejected30dCount: 0,
          cancelled30dCount: 0,
          averageDurationHours: 0
        }
      })
    } else
      await route.fulfill({
        json: url.includes('/sys_dictionary') ? [] : { records: [], total: 0 }
      })
  })
  await page.goto('/tests/e2e/fixtures/workflow-monitor-refresh.html')
  const health = page.locator('.workflow-monitor__callback-health')
  await expect(health).toContainText('回调健康度暂不可用')
  await expect(health).toHaveClass(/is-attention/)
  await expect(health).not.toContainText('业务回调运行正常')
  await expect(health).not.toContainText('internal failure')
  await page.screenshot({
    path: `.artifacts/workflow-monitor-health-error-${page.viewportSize()?.width}.png`,
    fullPage: true
  })
  await health.getByRole('button', { name: '重试健康度检查' }).click()
  await expect(health).toContainText('业务回调运行正常')
  await expect(health).toContainText('已成功 7')
  await expect(health).not.toHaveClass(/is-attention/)
  await expect(health.getByRole('button', { name: '重试健康度检查' })).toHaveCount(0)
  expect(callbackRequests).toBe(2)
  await health.getByRole('button', { name: '查看回调队列' }).click()
  const drawer = page.getByRole('dialog', { name: '业务回调队列', exact: true })
  await expect(drawer).toBeVisible()
  await expect(drawer).toContainText('队列状态暂不可用')
  await expect(drawer).not.toContainText('队列运行正常')
  await expect(drawer).not.toContainText('internal failure')
  await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(drawer).toContainText('队列运行正常')
  await expect(drawer).not.toContainText('队列状态暂不可用')
  expect(callbackRequests).toBe(4)
})

test('回调队列重新打开后旧查询不会覆盖最新指标', async ({ page }) => {
  let initialDrawerRequest: Route | undefined
  let callbackRequests = 0
  await page.route('**/rest/v1/**', async (route) => {
    const url = route.request().url()
    if (url.endsWith('/rpc/get_workflow_callback_outbox')) {
      const isDrawerQuery = route.request().postDataJSON()?.p_limit === 100
      if (isDrawerQuery) callbackRequests += 1
      if (isDrawerQuery && callbackRequests === 1) {
        initialDrawerRequest = route
        return
      }
      await route.fulfill({
        json: {
          items: [],
          summary: {
            pending: 0,
            processing: 0,
            retryWait: isDrawerQuery && callbackRequests === 2 ? 13 : 0,
            succeeded: 0,
            deadLetter: 0
          }
        }
      })
    } else if (url.endsWith('/rpc/get_workflow_monitor_summary')) {
      await route.fulfill({
        json: {
          runningCount: 0,
          overdueCount: 0,
          approved30dCount: 0,
          rejected30dCount: 0,
          cancelled30dCount: 0,
          averageDurationHours: 0
        }
      })
    } else
      await route.fulfill({
        json: url.includes('/sys_dictionary') ? [] : { records: [], total: 0 }
      })
  })
  await page.goto('/tests/e2e/fixtures/workflow-monitor-refresh.html')
  await page.getByRole('button', { name: '查看回调队列' }).click()
  const drawer = page.getByRole('dialog', { name: '业务回调队列', exact: true })
  await expect(drawer).toBeVisible()
  await expect.poll(() => callbackRequests).toBe(1)
  await expect(drawer.locator('[inert]')).toHaveCount(1)
  await drawer.getByRole('button', { name: /关闭此对话框|Close this dialog/, exact: true }).click()
  await expect(drawer).toBeHidden()
  await page.getByRole('button', { name: '查看回调队列' }).click()
  await expect(drawer).toBeVisible()
  await expect.poll(() => callbackRequests).toBe(2)
  await expect(drawer).toContainText('13 条待处理')
  if (!initialDrawerRequest) throw new Error('未捕获初始队列查询')
  await initialDrawerRequest.fulfill({
    json: {
      items: [],
      summary: { pending: 0, processing: 0, retryWait: 0, succeeded: 0, deadLetter: 0 }
    }
  })
  await (await initialDrawerRequest.request().response())?.finished()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await expect(drawer).toContainText('13 条待处理')
  await expect(drawer).not.toContainText('队列运行正常')
})
