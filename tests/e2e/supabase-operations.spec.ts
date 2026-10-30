import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import type { OperationRun } from '../../src/types/supabase-operations'

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeEach(async ({ page }) => {
  // Shared development-server updates must not reload the page halfway through an interaction.
  // Explicit reloads below still exercise the real persisted-state recovery flow.
  await page.routeWebSocket(/^ws:\/\/(?:127\.0\.0\.1|localhost):\d+\//, (socket) => socket.close())
})

test('刷新恢复原任务，离线显示待确认；连接查看不重复创建，外部导出阻止新任务', async ({
  page
}, testInfo) => {
  test.setTimeout(180_000)
  await prepareIsolatedSession(page)
  let posts = 0
  let offline = false
  let detached = false
  const run: OperationRun = {
    id: '55555555-5555-4555-8555-555555555555',
    operationId: 'backup',
    title: '创建完整备份',
    actorId: 'test-actor',
    status: 'running',
    startedAt: new Date().toISOString(),
    lastOutputAt: new Date().toISOString(),
    stage: '导出数据库数据',
    parameters: {},
    logs: [
      {
        sequence: 1,
        time: new Date().toISOString(),
        level: 'info',
        message: 'Dumping data from remote database...'
      }
    ]
  }
  await page.route('http://127.0.0.1:4318/**', async (route) => {
    if (offline) return route.abort()
    if (route.request().method() === 'POST') posts++
    return route.fulfill({
      json: {
        projectRef: 'ckbftoopuyophiebamwy',
        runs: [run],
        busy: true,
        ...(detached
          ? {
              externalActivity: {
                state: 'running',
                stage: 'Docker 正在导出数据库数据',
                message: '本项目数据库仍在 Docker 中导出，请勿重复启动。'
              }
            }
          : {})
      },
      headers: { 'access-control-allow-origin': '*' }
    })
  })
  await page.goto('/tests/e2e/fixtures/supabase-operations.html')
  await page.getByRole('button', { name: '连接并查看任务', exact: true }).click()
  await expect(page.getByRole('button', { name: '执行创建完整备份', exact: true })).toBeDisabled()
  expect(posts).toBe(0)
  const indicator = page.getByTestId('operations-task-status')
  await expect(indicator).toContainText('正在执行')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(indicator.locator('.operations-running-dot')).toHaveCSS(
    'animation-name',
    /^operations-running-pulse(?:-[\da-f]+)?$/
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(indicator.locator('.operations-running-dot')).toHaveCSS('animation-name', 'none')
  const task = page.getByTestId('operations-task')
  await expect(task.locator(':scope > .el-scrollbar')).toHaveCount(1)
  const normalTask = await task.boundingBox()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await expect(page.getByTestId('operations-connection')).not.toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Supabase 运维操作' })).not.toBeVisible()
  await expect(page.locator('.business-workspace-header')).not.toBeVisible()
  const focusedTask = await task.boundingBox()
  expect(focusedTask!.height).toBeGreaterThan(normalTask!.height + 100)
  await page.screenshot({ path: testInfo.outputPath('operations-focus.png') })
  await page.getByRole('switch', { name: '退出专注模式' }).locator('..').click()
  await expect(page.getByTestId('operations-connection')).toBeVisible()
  await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('operations-connection')).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find((item) =>
          item.startsWith('supabase-operations:')
        )
        return key ? JSON.parse(localStorage.getItem(key) || 'null')?.reconnect : false
      })
    )
    .toBe(true)
  await page.reload()
  await expect(page.getByText('执行端已连接', { exact: true })).toBeVisible()
  await expect(page.getByText('导出数据库数据', { exact: true })).toBeVisible()
  expect(posts).toBe(0)
  offline = true
  await page.reload()
  await expect(page.getByText('状态待确认', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: '连接并查看任务', exact: true })).toBeEnabled()
  offline = false
  detached = true
  run.status = 'interrupted'
  await page.getByRole('button', { name: '连接执行端', exact: true }).click()
  await expect(
    page.getByText('本项目数据库仍在 Docker 中导出，请勿重复启动。').first()
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '执行创建完整备份', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: /继续未完成的备份/ }).click()
  await expect(
    page.getByText('填写原备份目录继续：完整 SQL 经校验后跳过', { exact: false })
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: '执行继续未完成的备份', exact: true })
  ).toBeDisabled()
  expect(posts).toBe(0)
})

test('查看中断或失败历史时提示当前任务并可一键返回，不重复创建任务', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  let posts = 0
  const startedAt = new Date().toISOString()
  const base = {
    actorId: 'test-actor',
    startedAt,
    lastOutputAt: startedAt,
    parameters: {},
    logs: []
  }
  const runs: OperationRun[] = [
    {
      ...base,
      id: '88888888-8888-4888-8888-888888888888',
      operationId: 'backup',
      title: '创建完整备份',
      status: 'running',
      stage: '导出数据库结构'
    },
    {
      ...base,
      id: '99999999-9999-4999-8999-999999999999',
      operationId: 'backup',
      title: '创建完整备份',
      status: 'interrupted',
      stage: '旧导出中断'
    },
    {
      ...base,
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      operationId: 'syncFunctions',
      title: '同步远端函数源码',
      status: 'failed',
      stage: '同步失败'
    }
  ]
  await page.route('http://127.0.0.1:4318/**', async (route) => {
    if (route.request().method() === 'POST') posts++
    await route.fulfill({
      json: { projectRef: 'ckbftoopuyophiebamwy', runs, busy: true },
      headers: { 'access-control-allow-origin': '*' }
    })
  })
  await page.goto('/tests/e2e/fixtures/supabase-operations.html')
  await page.getByRole('button', { name: '连接并查看任务', exact: true }).click()
  const task = page.getByTestId('operations-task')
  await expect(page.getByTestId('operations-task-status')).toContainText('正在执行')
  await task.locator('.el-select__wrapper').click()
  await page.getByRole('option', { name: /创建完整备份 · 已中断/ }).click()
  await expect(task).toContainText('当前正在执行：创建完整备份 · 导出数据库结构')
  await expect(page.getByTestId('operations-interrupted-recovery')).toHaveCount(0)
  await task.locator('.el-select__wrapper').click()
  await page.getByRole('option', { name: /同步远端函数源码 · 失败/ }).click()
  await expect(task.getByRole('button', { name: '查看正在运行的任务' })).toBeVisible()
  const historyBox = await task.locator('.el-select__wrapper').boundingBox()
  const refreshBox = await task.getByRole('button', { name: '刷新', exact: true }).boundingBox()
  const focusBox = await task
    .getByRole('switch', { name: '进入专注模式' })
    .locator('..')
    .boundingBox()
  expect(historyBox && refreshBox && focusBox).toBeTruthy()
  expect(historyBox!.x + historyBox!.width).toBeLessThanOrEqual(refreshBox!.x)
  expect(refreshBox!.x + refreshBox!.width).toBeLessThanOrEqual(focusBox!.x)
  expect(
    Math.abs(historyBox!.y + historyBox!.height / 2 - focusBox!.y - focusBox!.height / 2)
  ).toBeLessThanOrEqual(5)
  await page.screenshot({ path: testInfo.outputPath('operations-history-header-1440.png') })
  await task.getByRole('button', { name: '查看正在运行的任务' }).click()
  await expect(page.getByTestId('operations-task-status')).toContainText('正在执行')
  await expect(task.getByRole('button', { name: '查看正在运行的任务' })).toHaveCount(0)
  expect(posts).toBe(0)
})

test('中断任务的导出状态自动复核后，可准备重备份或续跑而不直接执行', async ({ page }) => {
  test.setTimeout(90_000)
  await prepareIsolatedSession(page)
  const backupPath = 'D:\\spa\\art-supabase-pro\\supabase\\backups\\20261029-130441'
  let inspectionUnknown = true
  let snapshotReads = 0
  let posts = 0
  const run: OperationRun = {
    id: '66666666-6666-4666-8666-666666666666',
    operationId: 'backup',
    title: '创建完整备份',
    actorId: 'test-actor',
    status: 'interrupted',
    startedAt: '2026-10-29T05:04:30.000Z',
    lastOutputAt: '2026-10-29T05:04:41.000Z',
    stage: '导出数据库数据',
    parameters: {},
    logs: [
      {
        sequence: 1,
        time: '2026-10-29T05:04:41.000Z',
        level: 'info',
        message: `备份目录：${backupPath}`
      }
    ]
  }
  await page.route('http://127.0.0.1:4318/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*'
        }
      })
      return
    }
    if (route.request().method() === 'POST') posts++
    else snapshotReads++
    await route.fulfill({
      json: {
        projectRef: 'ckbftoopuyophiebamwy',
        runs: [run],
        busy: false,
        ...(inspectionUnknown
          ? {
              externalActivity: {
                state: 'unknown',
                stage: '导出状态待核对',
                message: '暂时无法核对旧 Docker 导出状态。'
              }
            }
          : {})
      },
      headers: { 'access-control-allow-origin': '*' }
    })
  })
  await page.goto('/tests/e2e/fixtures/supabase-operations.html')
  await page.getByRole('button', { name: '连接并查看任务', exact: true }).click()
  const recovery = page.getByTestId('operations-interrupted-recovery')
  await expect(recovery).toContainText('先恢复 Docker 连接')
  await expect(recovery.getByRole('button', { name: '重新核对状态' })).toBeVisible()
  await expect(recovery.getByRole('button', { name: '填写密码重新备份' })).toHaveCount(0)
  inspectionUnknown = false
  await expect.poll(() => snapshotReads, { timeout: 15_000 }).toBeGreaterThan(1)
  await expect(recovery.getByRole('button', { name: '填写密码重新备份' })).toBeVisible()
  await expect(recovery.getByRole('button', { name: '填写目录尝试续跑' })).toBeVisible()
  await recovery.getByRole('button', { name: '填写目录尝试续跑' }).click()
  await expect(page.getByLabel('备份目录')).toHaveValue(backupPath)
  await expect(page.getByLabel('备份目录')).toBeFocused()
  await recovery.getByRole('button', { name: '填写密码重新备份' }).click()
  await expect(page.getByLabel('来源数据库密码')).toHaveValue('')
  await expect(page.getByLabel('来源数据库密码')).toBeFocused()
  expect(posts).toBe(0)
})

test('失败的数据库导出可带入原目录续跑，缺密码不提交，提交后清空密码并显示新任务', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  const backupPath = 'D:\\backups\\20261029-155141'
  const oldRun: OperationRun = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    operationId: 'backup',
    title: '创建完整备份',
    actorId: 'test-actor',
    status: 'failed',
    startedAt: '2026-10-29T07:51:35.000Z',
    lastOutputAt: '2026-10-29T08:35:51.000Z',
    stage: '导出数据库数据',
    parameters: {},
    artifacts: [{ label: '本机产物路径', kind: 'path', value: backupPath }],
    logs: [
      {
        sequence: 1,
        time: '2026-10-29T08:35:51.000Z',
        level: 'error',
        message: 'pg_dump: error: server closed the connection unexpectedly'
      }
    ]
  }
  const runs = [oldRun]
  const requests: unknown[] = []
  await page.route('http://127.0.0.1:4318/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
      })
      return
    }
    if (request.method() === 'POST') {
      requests.push(request.postDataJSON())
      const resumedRun: OperationRun = {
        ...oldRun,
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        operationId: 'resumeBackup',
        title: '继续未完成的备份',
        status: 'running',
        startedAt: new Date().toISOString(),
        lastOutputAt: new Date().toISOString(),
        stage: '校验已有导出',
        logs: [],
        artifacts: []
      }
      runs.unshift(resumedRun)
      await route.fulfill({ json: resumedRun, headers: { 'access-control-allow-origin': '*' } })
      return
    }
    await route.fulfill({
      json: { projectRef: 'ckbftoopuyophiebamwy', runs, busy: runs[0].status === 'running' },
      headers: { 'access-control-allow-origin': '*' }
    })
  })
  await page.goto('/tests/e2e/fixtures/supabase-operations.html')
  await page.getByRole('button', { name: '连接并查看任务', exact: true }).click()
  await expect(page.getByTestId('operations-task-status')).toContainText('执行失败')
  await page.getByRole('button', { name: /继续未完成的备份/ }).click()
  await expect(page.getByLabel('备份目录')).toHaveValue(backupPath)
  const password = page.getByLabel('来源数据库密码')
  await expect(password).toHaveValue('')
  const execute = page.getByRole('button', { name: '执行继续未完成的备份', exact: true })
  await execute.click()
  await expect(page.getByText('请填写来源数据库密码')).toBeVisible()
  expect(requests).toHaveLength(0)
  await page.screenshot({ path: testInfo.outputPath('resume-backup-password-required.png') })
  await password.fill('test-only-database-password')
  await execute.click()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]).toEqual({
    operationId: 'resumeBackup',
    parameters: { ResumeBackupPath: backupPath, DbPassword: 'test-only-database-password' }
  })
  await expect(password).toHaveValue('')
  await expect(page.getByTestId('operations-task-status')).toContainText('正在执行')
  await expect(page.getByTestId('operations-task')).toContainText('校验已有导出')
})

test('旧导出仅确认后停止，取消确认不调用接口且可恢复备份入口', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  let exporting = true
  let stopRequests = 0
  let runRequests = 0
  const run: OperationRun = {
    id: '77777777-7777-4777-8777-777777777777',
    operationId: 'backup',
    title: '创建完整备份',
    actorId: 'test-actor',
    status: 'interrupted',
    startedAt: '2026-10-29T05:04:30.000Z',
    lastOutputAt: '2026-10-29T05:04:41.000Z',
    stage: '导出数据库数据',
    parameters: {},
    logs: [
      {
        sequence: 1,
        time: '2026-10-29T05:04:41.000Z',
        level: 'info',
        message: 'Dumping data from remote database...'
      }
    ]
  }
  await page.route('http://127.0.0.1:4318/**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*'
        }
      })
      return
    }
    if (request.method() === 'POST' && request.url().endsWith('/detached-exports/cancel')) {
      stopRequests++
      exporting = false
      await route.fulfill({ json: { stopped: 1 }, headers: { 'access-control-allow-origin': '*' } })
      return
    }
    if (request.method() === 'POST') runRequests++
    await route.fulfill({
      json: {
        projectRef: 'ckbftoopuyophiebamwy',
        runs: [run],
        busy: exporting,
        ...(exporting
          ? {
              externalActivity: {
                state: 'running',
                stage: 'Docker 正在导出数据库数据',
                message: '本项目旧导出仍在运行。'
              }
            }
          : {})
      },
      headers: { 'access-control-allow-origin': '*' }
    })
  })
  await page.goto('/tests/e2e/fixtures/supabase-operations.html')
  await page.getByRole('button', { name: '连接并查看任务', exact: true }).click()
  const recovery = page.getByTestId('operations-interrupted-recovery')
  await expect(recovery).toContainText('旧数据库导出仍在运行')
  await expect(
    page.getByTestId('operations-terminal').locator('.monaco-editor .view-lines')
  ).toContainText('Dumping data from remote database', { timeout: 60_000 })
  await page.screenshot({ path: testInfo.outputPath('operations-interrupted-old-export.png') })
  await recovery.getByRole('button', { name: '停止旧导出' }).click()
  const confirmation = page.locator('.el-message-box')
  await expect(confirmation).toContainText('当前 SQL 文件不能按字节续传')
  await confirmation.getByRole('button', { name: '继续等待' }).click()
  await expect(confirmation).not.toBeVisible()
  expect(stopRequests).toBe(0)
  expect(runRequests).toBe(0)
  await recovery.getByRole('button', { name: '停止旧导出' }).click()
  await confirmation.getByRole('button', { name: '停止旧导出' }).click()
  await expect.poll(() => stopRequests).toBe(1)
  await expect(recovery.getByRole('button', { name: '填写密码重新备份' })).toBeVisible()
  await expect(recovery.getByRole('button', { name: '填写目录尝试续跑' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('operations-interrupted-recovered.png') })
  expect(runRequests).toBe(0)
})

test('运维使用说明可查看十二项功能并搜索，窄屏滚动与关闭正常', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  let posts = 0
  await page.route('http://127.0.0.1:4318/**', async (route) => {
    if (route.request().method() === 'POST') posts++
    await route.abort()
  })
  await page.setViewportSize({ width: 900, height: 680 })
  await page.goto('/tests/e2e/fixtures/supabase-operations.html')
  await page.getByRole('button', { name: '使用说明' }).click()
  const dialog = page.getByRole('dialog', { name: 'Supabase 运维台使用说明' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('常用顺序')
  await expect(dialog.locator('.el-scrollbar')).toHaveCount(1)
  await dialog.locator('.el-select__wrapper').click()
  await expect(page.getByRole('option')).toHaveCount(12)
  await dialog.getByRole('combobox', { name: '搜索和选择运维功能' }).fill('设置本地登录密码')
  await page.getByRole('option', { name: '设置本地登录密码' }).click()
  const guide = dialog.getByRole('region', { name: '设置本地登录密码使用说明' })
  await expect(guide).toContainText('本地恢复完成后')
  await expect(guide).toContainText('怎么操作')
  await expect(guide).toContainText('已恢复账号的邮箱')
  await expect(guide).toContainText('新的本地密码')
  await expect(guide).toContainText('完成后会得到')
  await expect(guide).toContainText('只更新这个本地 Auth 账号的登录密码')
  await expect(guide).toContainText('set-local-login.ps1')
  await dialog.locator('.el-select__wrapper').click()
  await dialog.getByRole('combobox', { name: '搜索和选择运维功能' }).fill('校验备份')
  await page.getByRole('option', { name: '校验备份完整性' }).click()
  await expect(dialog.getByRole('region', { name: '校验备份完整性使用说明' })).toBeVisible()
  const dialogBox = await dialog.boundingBox()
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(900)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('operations-guide-narrow.png') })
  await dialog.getByText('完成后会得到').click()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '本功能怎么用' }).click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('region', { name: '创建完整备份使用说明' })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭弹窗' }).click()
  await expect(dialog).not.toBeVisible()
  expect(posts).toBe(0)
})

test('运维任务提交、静默等待、取消、失败重试和断线状态', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await prepareIsolatedSession(page)
  let run: OperationRun | null = null
  let requests = 0
  let offline = false
  await page.route('http://127.0.0.1:4318/**', async (route) => {
    if (offline) {
      await route.abort()
      return
    }
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
      })
      return
    }
    if (route.request().url().endsWith('/cancel')) {
      if (run) {
        run.status = 'interrupted'
        run.endedAt = new Date().toISOString()
      }
      await route.fulfill({ json: { ok: true }, headers: { 'access-control-allow-origin': '*' } })
      return
    }
    if (route.request().method() === 'POST') {
      requests++
      run = {
        id: '11111111-1111-4111-8111-111111111111',
        operationId: 'backup',
        title: '创建完整备份',
        actorId: 'test-actor',
        status: 'running',
        startedAt: new Date(Date.now() - 90_000).toISOString(),
        lastOutputAt: new Date(Date.now() - 45_000).toISOString(),
        stage: '导出数据库',
        parameters: {},
        logs: [
          {
            sequence: 1,
            time: new Date().toISOString(),
            level: 'info',
            message: '正在导出数据库快照…'
          }
        ]
      }
      await route.fulfill({ json: run, headers: { 'access-control-allow-origin': '*' } })
      return
    }
    await route.fulfill({
      json: {
        projectRef: 'ckbftoopuyophiebamwy',
        runs: run ? [run] : [],
        busy: run?.status === 'running'
      },
      headers: { 'access-control-allow-origin': '*' }
    })
  })
  await page.goto('/tests/e2e/fixtures/supabase-operations.html')
  await expect(page.getByLabel('本次配对码')).toHaveCount(0)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.getByRole('button', { name: '复制启动命令 pnpm supabase:ops', exact: true }).click()
  await expect(
    page.getByRole('button', { name: '复制启动命令 pnpm supabase:ops', exact: true })
  ).toContainText('已复制')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('pnpm supabase:ops')
  // 剪贴板权限覆盖会默认拒绝其他权限；此用例单独模拟执行端的网络与权限状态。
  await page.evaluate(() => {
    Object.defineProperty(navigator.permissions, 'query', {
      configurable: true,
      value: async () => ({ state: 'granted' })
    })
  })
  await expect(page.getByRole('button', { name: '连接并查看任务', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '连接并查看任务', exact: true }).click()
  expect(requests).toBe(0)
  await page.getByRole('button', { name: '执行创建完整备份', exact: true }).click()
  await expect(page.getByText('请填写来源数据库密码', { exact: true })).toBeVisible()
  await page.getByLabel('来源数据库密码').fill('test-only-password')
  await page.getByRole('button', { name: '执行创建完整备份', exact: true }).click()
  await expect(page.getByText('执行端已连接', { exact: true })).toBeVisible()
  await expect(page.getByText('任务暂时没有新输出。', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: '执行创建完整备份', exact: true })).toBeDisabled()
  await expect(page.getByLabel('来源数据库密码')).toHaveValue('')
  await expect(page.getByText('请填写来源数据库密码', { exact: true })).toHaveCount(0)
  await expect(page.locator('.el-form-item.is-error')).toHaveCount(0)
  await expect(
    page.getByTestId('operations-terminal').locator('.monaco-editor .view-lines')
  ).toContainText('正在导出数据库快照', { timeout: 60_000 })
  expect(requests).toBe(1)
  await page.screenshot({ path: testInfo.outputPath('operations-running.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(
    true
  )
  await page.getByRole('button', { name: '取消任务', exact: true }).click()
  await expect(page.getByTestId('operations-task-status')).toContainText('已停止，任务未完成')
  offline = true
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByText('无法连接本机执行端（端口 4318）', { exact: false })).toBeVisible()
  const alert = await page.getByTestId('operations-connection').getByRole('alert').boundingBox()
  const connectButton = await page
    .getByRole('button', { name: '连接执行端', exact: true })
    .boundingBox()
  const connectionCard = await page.getByTestId('operations-connection').boundingBox()
  expect(
    alert && connectButton && alert.y - connectButton.y - connectButton.height
  ).toBeGreaterThanOrEqual(12)
  expect(
    alert && connectionCard && connectionCard.y + connectionCard.height - alert.y - alert.height
  ).toBeGreaterThanOrEqual(12)
  await page.evaluate(() => {
    Object.defineProperty(navigator.permissions, 'query', {
      configurable: true,
      value: async () => ({ state: 'denied' })
    })
  })
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(page.getByText('浏览器已阻止本机网络访问。', { exact: false })).toBeVisible()
  await page.evaluate(() => Reflect.deleteProperty(navigator.permissions, 'query'))
  offline = false
  await page.getByRole('button', { name: '连接执行端', exact: true }).click()
  await page
    .getByRole('button', { name: /恢复到新云项目/ })
    .first()
    .click()
  await expect(page.getByRole('button', { name: '执行恢复到新云项目' })).toBeEnabled()
  await page.getByRole('button', { name: '执行恢复到新云项目' }).click()
  await expect(page.getByText('请填写备份目录', { exact: true })).toBeVisible()
  await expect(page.getByLabel('备份目录')).toBeFocused()
  expect(requests).toBe(1)
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.screenshot({ path: testInfo.outputPath('operations-narrow.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('终端日志可搜索复制且只读，关闭跟随后追加日志不抢滚动位置', async ({ page }) => {
  test.setTimeout(120_000)
  await prepareIsolatedSession(page)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const first: OperationRun = {
    id: '33333333-3333-4333-8333-333333333333',
    operationId: 'backup',
    title: '创建完整备份',
    actorId: 'test-actor',
    status: 'succeeded',
    startedAt: '2026-10-29T05:04:11.000Z',
    endedAt: '2026-10-29T05:05:11.000Z',
    lastOutputAt: '2026-10-29T05:05:11.000Z',
    stage: '备份完成',
    parameters: {},
    logs: Array.from({ length: 120 }, (_, index) => ({
      sequence: index + 1,
      time: '2026-10-29T05:04:11.000Z',
      level: 'info' as const,
      message:
        index === 119
          ? '已写入 D:\\spa\\art-supabase-pro\\supabase\\backups\\database\\roles.sql'
          : `备份步骤 ${index + 1} 已完成`
    }))
  }
  const second: OperationRun = {
    id: '44444444-4444-4444-8444-444444444444',
    operationId: 'syncFunctions',
    title: '同步远端函数源码',
    actorId: 'test-actor',
    status: 'succeeded',
    startedAt: '2026-10-29T04:04:11.000Z',
    endedAt: '2026-10-29T04:05:11.000Z',
    lastOutputAt: '2026-10-29T04:05:11.000Z',
    stage: '同步完成',
    parameters: {},
    logs: [
      {
        sequence: 1,
        time: '2026-10-29T04:04:11.000Z',
        level: 'info',
        message: '另一个任务：函数源码已同步'
      }
    ]
  }
  await page.route('http://127.0.0.1:4318/**', (route) =>
    route.fulfill({
      json: { projectRef: 'ckbftoopuyophiebamwy', runs: [first, second], busy: false },
      headers: { 'access-control-allow-origin': '*' }
    })
  )
  await page.goto('/tests/e2e/fixtures/supabase-operations.html')
  await page.getByRole('button', { name: '连接执行端', exact: true }).click()
  const terminal = page.getByTestId('operations-terminal')
  const editor = terminal.locator('.monaco-editor')
  await expect(editor.locator('.view-lines')).toContainText('roles.sql', { timeout: 60_000 })

  const wrap = terminal.getByRole('button', { name: '自动换行' })
  await expect(wrap).toHaveAttribute('aria-pressed', 'false')
  await wrap.click()
  await expect(wrap).toHaveAttribute('aria-pressed', 'true')
  await terminal.getByRole('button', { name: '复制日志' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('备份步骤 1 已完成')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('roles.sql')

  await terminal.getByRole('button', { name: '搜索日志' }).click()
  const search = terminal.getByRole('textbox', { name: 'Find', exact: true })
  await expect(search).toBeVisible()
  await search.fill('roles.sql')
  await expect(terminal.locator('.find-widget .matchesCount')).toContainText('1')
  await page.keyboard.press('Escape')
  await editor.click({ position: { x: 140, y: 56 } })
  await page.keyboard.type('SHOULD_NOT_EDIT_LOG')
  await expect(editor.locator('.view-lines')).not.toContainText('SHOULD_NOT_EDIT_LOG')
  await page.keyboard.press('Escape')

  await editor.hover()
  await page.mouse.wheel(0, -5000)
  await editor.getByRole('textbox', { name: '运维终端日志' }).focus()
  await page.keyboard.press('Control+Home')
  await expect(editor.locator('.view-lines')).toContainText('备份步骤 1 已完成')
  const follow = terminal.getByRole('checkbox', { name: '跟随输出' })
  await expect(follow).not.toBeChecked()
  first.logs.push({
    sequence: 121,
    time: '2026-10-29T05:05:12.000Z',
    level: 'info',
    message: '新增尾部日志，仅恢复跟随后可见'
  })
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(editor.locator('.view-lines')).toContainText('备份步骤 1 已完成')
  await expect(editor.locator('.view-lines')).not.toContainText('新增尾部日志')
  await terminal.getByText('跟随输出', { exact: true }).click()
  await expect(follow).toBeChecked()
  await expect(editor.locator('.view-lines')).toContainText('新增尾部日志')

  await page
    .getByTestId('operations-task')
    .getByText(/^创建完整备份 · 已完成 ·/)
    .click()
  await page.getByRole('option', { name: /同步远端函数源码/ }).click()
  await expect(editor.locator('.view-lines')).toContainText('另一个任务：函数源码已同步')
  await expect(editor.locator('.view-lines')).not.toContainText('新增尾部日志')
  await expect(follow).toBeChecked()
})

for (const theme of ['light', 'dark'])
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`两个助手输入区与专注按钮 ${theme} ${box}`, async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await prepareIsolatedSession(page)
      await page.route('**/functions/v1/**', (route) =>
        route.fulfill({ json: { version: 'test', access: {}, features: {} } })
      )
      await page.goto(
        `/tests/e2e/fixtures/supabase-operations.html?mode=assistant&theme=${theme}&box=${box}`
      )
      const projectInput = page.getByPlaceholder('向项目助手提问…')
      await expect(projectInput).toBeVisible()
      await projectInput.focus()
      expect(await projectInput.evaluate((element) => getComputedStyle(element).boxShadow)).toBe(
        'none'
      )
      expect(
        Number.parseFloat(
          await projectInput.evaluate((element) => getComputedStyle(element).fontSize)
        )
      ).toBeGreaterThanOrEqual(13)
      await page.getByRole('button', { name: '打开业务助手', exact: true }).click()
      const input = page.getByPlaceholder('输入业务问题，Enter 发送，Shift + Enter 换行')
      await expect(input).toBeVisible()
      await input.focus()
      expect(await input.evaluate((element) => getComputedStyle(element).boxShadow)).toBe('none')
      const focus = page.getByRole('button', { name: '专注模式', exact: true })
      const history = page
        .getByRole('dialog')
        .getByRole('button', { name: '会话历史', exact: true })
      const a = await focus.boundingBox()
      const b = await history.boundingBox()
      expect(a && b && Math.abs(a.y + a.height / 2 - b.y - b.height / 2)).toBeLessThan(2)
      await focus.click()
      await expect(page.locator('.art-ai-assistant-drawer')).toHaveClass(/is-focus-mode/)
      await page.keyboard.press('Escape')
      await expect(page.locator('.art-ai-assistant-drawer')).not.toHaveClass(/is-focus-mode/)
      await expect(input).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath(`assistant-${theme}-${box}.png`),
        fullPage: true
      })
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^关闭 / })
        .click()
      await expect(input).not.toBeVisible()
      await page.getByRole('button', { name: '打开业务助手', exact: true }).click()
      await expect(input).toBeVisible()
    })
  }

for (const [theme, box] of [
  ['light', 'border-mode'],
  ['light', 'shadow-mode'],
  ['dark', 'border-mode'],
  ['dark', 'shadow-mode']
]) {
  test(`运维台失败任务与长日志布局 ${theme} ${box}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await prepareIsolatedSession(page)
    const run: OperationRun = {
      id: '22222222-2222-4222-8222-222222222222',
      operationId: 'backup',
      title: '创建完整备份',
      actorId: 'test-actor',
      status: 'failed',
      startedAt: '2026-10-29T04:26:05.000Z',
      endedAt: '2026-10-29T04:26:11.000Z',
      lastOutputAt: '2026-10-29T04:26:11.000Z',
      stage: '检查备份产物',
      error: '脚本执行失败。请查看执行日志并修复提示的问题；未完成的备份不可用于恢复。',
      parameters: {},
      logs: Array.from({ length: 150 }, (_, index) => ({
        sequence: index + 1,
        time: '2026-10-29T04:26:11.000Z',
        level: [145, 149].includes(index) ? ('error' as const) : ('info' as const),
        message:
          index === 149
            ? '第 150 行：备份文件校验失败；请检查本机磁盘空间和下载结果。'
            : index === 145
              ? 'Dumping schemas from remote database...'
              : index === 146
                ? 'pnpm supabase:ops --verbose'
                : index === 147
                  ? '已写入 D:\\spa\\art-supabase-pro\\supabase\\backups\\database\\roles.sql'
                  : index === 148
                    ? 'SELECT * FROM public.sys_user;'
                    : `第 ${index + 1} 行：正在校验数据库、函数及 Storage 导出文件；当前文件清单较长。`
      }))
    }
    let offline = false
    await page.route('http://127.0.0.1:4318/**', async (route) => {
      if (offline) {
        await route.abort()
        return
      }
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }
        })
        return
      }
      await route.fulfill({
        json: { projectRef: 'ckbftoopuyophiebamwy', runs: [run], busy: false },
        headers: { 'access-control-allow-origin': '*' }
      })
    })
    await page.setViewportSize({ width: 1700, height: 740 })
    await page.goto(`/tests/e2e/fixtures/supabase-operations.html?theme=${theme}&box=${box}`)
    await page.getByRole('button', { name: '连接执行端', exact: true }).click()
    await expect(page.getByText(run.error!, { exact: true })).toBeVisible()
    const connection = page.getByTestId('operations-connection')
    const task = page.getByTestId('operations-task')
    const terminal = page.getByTestId('operations-terminal')
    await expect(page.getByTestId('operations-task-status')).toContainText('执行失败')
    await expect(page.getByTestId('operations-task-status')).toHaveClass(/el-tag--danger/)
    const editor = terminal.locator('.monaco-editor')
    const history = page.getByRole('combobox', { name: '选择任务历史' })
    const taskHeading = task.getByText('执行任务', { exact: true })
    const logScrollbar = editor.locator('.scrollbar.vertical')
    const logSlider = logScrollbar.locator('.slider')
    await expect(history).toBeVisible()
    await expect(page.getByRole('button', { name: '执行创建完整备份', exact: true })).toBeVisible()
    const connectionBox = await connection.boundingBox()
    const taskBox = await task.boundingBox()
    const historyBox = await history.boundingBox()
    const taskHeadingBox = await taskHeading.boundingBox()
    const logBox = await terminal.boundingBox()
    expect(connectionBox?.height).toBeLessThanOrEqual(110)
    expect(taskBox && historyBox && historyBox.x).toBeGreaterThan(taskBox!.x)
    expect(
      taskHeadingBox &&
        historyBox &&
        Math.abs(
          taskHeadingBox.y + taskHeadingBox.height / 2 - historyBox.y - historyBox.height / 2
        )
    ).toBeLessThanOrEqual(3)
    expect(logBox?.height).toBeGreaterThanOrEqual(180)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(terminal).toHaveAttribute('role', 'region')
    await expect(terminal).toHaveAttribute('aria-label', '任务执行日志')
    await expect(editor).toBeVisible({ timeout: 60_000 })
    const scrollTrack = await logScrollbar.boundingBox()
    const scrollThumb = await logSlider.boundingBox()
    expect(scrollTrack && scrollThumb && scrollThumb.height).toBeLessThan(scrollTrack!.height)
    await terminal.scrollIntoViewIfNeeded()
    await editor.hover()
    await page.mouse.wheel(0, -5000)
    await editor.getByRole('textbox', { name: '运维终端日志' }).focus()
    await page.keyboard.press('Control+Home')
    await expect(editor.locator('.view-lines')).toContainText('第 1 行：正在校验数据库')
    await page.mouse.wheel(0, 5000)
    await page.keyboard.press('Control+End')
    await expect(editor.locator('.view-lines')).toContainText('第 150 行：备份文件校验失败')
    await expect(editor.locator('.view-lines')).toContainText('[INFO]  Dumping schemas')
    const syntaxColors = await editor
      .locator('.view-line span[class*="mtk"]')
      .evaluateAll((tokens) => {
        const targets = ['04:26:11', 'pnpm', 'D:\\spa', 'SELECT']
        return targets.map((target) => {
          const token = tokens.find((item) => item.textContent?.includes(target))
          return token ? getComputedStyle(token).color : ''
        })
      })
    expect(syntaxColors.every(Boolean)).toBe(true)
    expect(new Set(syntaxColors).size).toBeGreaterThanOrEqual(3)
    await page.screenshot({ path: testInfo.outputPath('failed-long-log.png') })

    if (theme === 'light' && box === 'border-mode') {
      offline = true
      await page.getByRole('button', { name: '刷新', exact: true }).click()
      const alert = await connection.getByRole('alert').boundingBox()
      const connectionAfterError = await connection.boundingBox()
      expect(alert?.height).toBeGreaterThanOrEqual(36)
      expect(
        alert &&
          connectionAfterError &&
          connectionAfterError.y + connectionAfterError.height - alert.y - alert.height
      ).toBeGreaterThanOrEqual(10)
      await page.screenshot({ path: testInfo.outputPath('top-connection-error.png') })
      offline = false
      await page.setViewportSize({ width: 1024, height: 768 })
      await page.getByRole('button', { name: '连接执行端', exact: true }).click()
      const executeButton = page.getByRole('button', { name: '执行创建完整备份' })
      await executeButton.scrollIntoViewIfNeeded()
      await expect(executeButton).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      await page.screenshot({ path: testInfo.outputPath('failed-narrow-form.png') })
      await history.scrollIntoViewIfNeeded()
      await expect(history).toBeInViewport()
      await terminal.scrollIntoViewIfNeeded()
      await editor.hover()
      await page.mouse.wheel(0, 5000)
      await expect(editor.locator('.view-lines')).toContainText('第 150 行：备份文件校验失败')
      await page.screenshot({ path: testInfo.outputPath('failed-narrow-log.png') })
    }
  })
}
