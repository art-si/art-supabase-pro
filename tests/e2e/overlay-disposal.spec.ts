import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(120_000)
for (const kind of ['dialog', 'drawer']) {
  for (const phase of ['open', 'confirm', 'close']) {
    test(`${kind} 卸载取消 ${phase} 的旧反馈且新实例可以正常使用`, async ({ page }) => {
      await prepareIsolatedSession(page)
      const pageErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await page.goto(`/tests/e2e/fixtures/overlay-disposal.html?kind=${kind}&phase=${phase}`)
      await page.getByRole('button', { name: '打开待处理草稿', exact: true }).click()
      const panel = page.getByRole('dialog', { name: '公共弹层卸载验收', exact: true })
      await expect(panel).toBeVisible()
      await expect(panel.getByRole('textbox', { name: '草稿备注' })).toHaveValue('保留草稿内容')
      if (phase !== 'open')
        await page
          .getByRole('button', { name: phase === 'confirm' ? '请求确认' : '请求关闭', exact: true })
          .click()
      await expect(page.getByLabel('回调次数')).toHaveText('1')
      await page.getByRole('button', { name: '切换挂载', exact: true }).click()
      await expect(panel).toHaveCount(0)
      await page.getByRole('button', { name: '结束旧请求', exact: true }).click()
      if (phase === 'open') await expect(page.getByLabel('打开完成次数')).toHaveText('1')
      await page.getByRole('button', { name: '调用旧实例', exact: true }).click()
      await expect(page.getByLabel('旧实例数据')).toHaveText('待处理草稿')
      await expect(page.getByLabel('回调次数')).toHaveText('1')
      await expect(page.getByLabel('错误次数')).toHaveText('0')
      await expect(page.getByLabel('重置次数')).toHaveText('0')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.getByRole('button', { name: '切换挂载', exact: true }).click()
      await page.getByRole('button', { name: '打开新草稿', exact: true }).click()
      await expect(page.getByRole('dialog', { name: '新草稿', exact: true })).toBeVisible()
      await expect(page.getByText('新草稿', { exact: true })).toHaveCount(2)
      await page.screenshot({ path: test.info().outputPath('remounted-overlay.png') })
      await page.getByRole('button', { name: '请求确认', exact: true }).click()
      await expect(page.getByRole('dialog', { name: '新草稿', exact: true })).toBeVisible()
      await expect(page.getByLabel('错误次数')).toHaveText('0')
      expect(pageErrors).toEqual([])
    })
  }
}

interface SessionState {
  visible: boolean
  loading: boolean
  confirming: boolean
  id: string
  dataId: string
  title: string
  fullscreen: boolean
  focus: boolean
  scroll: number
}

for (const kind of ['dialog', 'drawer']) {
  test(`${kind} 同实例重开使旧回调命令失效且当前API仍可用`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(`/tests/e2e/fixtures/overlay-disposal.html?kind=${kind}&scenario=session`)
    try {
      await page.getByRole('button', { name: '打开A会话', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'A会话', exact: true })).toBeVisible()
      await expect(page.getByTestId('stale-api-live')).toContainText('"id":"A草稿"')
      await page.getByRole('button', { name: '公开重开B会话', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'B公开更新标题', exact: true })).toBeVisible()
      await expect(page.getByTestId('session-baseline')).not.toHaveText('null')
      const baseline: SessionState = JSON.parse(
        (await page.getByTestId('session-baseline').textContent()) || 'null'
      )
      expect(baseline).toMatchObject({
        visible: true,
        loading: true,
        confirming: true,
        id: 'B公开更新草稿',
        dataId: 'B公开更新草稿',
        title: 'B公开更新标题',
        focus: false
      })
      expect(baseline.scroll).toBe(72)
      const panel = page.locator(kind === 'dialog' ? '.art-dialog' : '.art-drawer')
      const viewport = panel.locator(`.art-${kind}__viewport`)
      const content = panel.locator(`.art-${kind}__content`)
      await expect(viewport).toHaveAttribute('aria-busy', 'true')
      await expect(content).toHaveJSProperty('inert', true)
      await expect(panel.locator('.art-overlay-loading')).toHaveCount(1)
      const firstLive: SessionState = JSON.parse(
        (await page.getByTestId('stale-api-live').textContent()) || 'null'
      )
      expect(firstLive).toEqual(baseline)

      await page.getByRole('button', { name: '结束A会话回调', exact: true }).click()
      await expect(page.getByTestId('session-completion')).toContainText('"stale":true')
      const staleAttempts: Array<{ command: string; state: SessionState }> = JSON.parse(
        (await page.getByTestId('stale-session-attempts').textContent()) || '[]'
      )
      expect(staleAttempts.map(({ command }) => command)).toEqual([
        'setLoading',
        'setConfirmLoading',
        'setOptions',
        'setData',
        'updateData',
        'setFullscreen',
        'toggleFullscreen',
        'setFocusMode',
        'toggleFocusMode',
        'scrollTo',
        'handleReset',
        'handleClose',
        'handleConfirm',
        'handleOpen'
      ])
      for (const attempt of staleAttempts)
        expect.soft(attempt.state, attempt.command).toEqual(baseline)
      await expect(page.getByTestId('stale-session-results')).toHaveText(
        '{"close":false,"confirm":false}'
      )
      await expect(page.getByTestId('session-completion')).toContainText(
        '"staleOpenCalls":0,"confirmations":0,"resets":0,"errors":0'
      )
      await expect(viewport).toHaveAttribute('aria-busy', 'true')
      await expect(content).toHaveJSProperty('inert', true)
      await expect(panel.locator('.art-overlay-loading')).toHaveCount(1)
      await expect(panel.locator('.art-overlay-loading')).toContainText('B会话正在处理')
      await expect(panel.locator('.el-scrollbar__wrap')).toHaveJSProperty('scrollTop', 72)
      await expect(panel).toBeVisible()
      await page.screenshot({ path: info.outputPath('same-instance-session-loading.png') })

      await page.getByRole('button', { name: '公开解锁B并调用过期确认', exact: true }).click()
      await expect(page.getByTestId('stale-session-results')).toHaveText(
        '{"close":false,"confirm":false,"unlockedConfirm":false}'
      )
      await expect(page.getByTestId('session-completion')).toContainText('"confirmations":0')
      await expect(viewport).toHaveAttribute('aria-busy', 'false')
      await expect(content).toHaveJSProperty('inert', false)
      await expect(panel.locator('.art-overlay-loading')).toHaveCount(0)
      await expect(panel.getByRole('button', { name: '确定', exact: true })).toBeEnabled()

      await page.getByRole('button', { name: '使用B回调操作', exact: true }).click()
      await expect(page.getByTestId('session-completion')).toContainText('"current":true')
      const currentAttempts: Array<{ command: string; state: SessionState }> = JSON.parse(
        (await page.getByTestId('current-session-attempts').textContent()) || '[]'
      )
      expect(currentAttempts).toMatchObject([
        { command: 'setLoadingTrue', state: { loading: true } },
        { command: 'setLoadingFalse', state: { loading: false } },
        { command: 'setConfirmLoadingTrue', state: { confirming: true } },
        { command: 'setConfirmLoadingFalse', state: { confirming: false } },
        { command: 'setOptions', state: { title: 'B回调更新标题', loading: false } },
        { command: 'setData', state: { id: 'B回调替换草稿', dataId: 'B回调替换草稿' } },
        { command: 'updateData', state: { id: 'B回调合并草稿', dataId: 'B回调合并草稿' } },
        { command: 'setFullscreen', state: { fullscreen: true } },
        { command: 'toggleFullscreen', state: { fullscreen: false } },
        { command: 'setFocusMode', state: { focus: true, fullscreen: true } },
        { command: 'toggleFocusMode', state: { focus: false, fullscreen: false } },
        { command: 'scrollTo', state: { scroll: 96 } },
        { command: 'handleConfirm', state: { visible: true, loading: false, confirming: false } }
      ])
      await expect(page.getByTestId('session-completion')).toContainText('"confirmations":1')
      await expect(page.getByTestId('current-session-results')).toHaveText(
        '{"callbackConfirm":false}'
      )
      const firstApiAfterUpdates: SessionState = JSON.parse(
        (await page.getByTestId('stale-api-live').textContent()) || 'null'
      )
      const secondApiAfterUpdates: SessionState = JSON.parse(
        (await page.getByTestId('current-api-live').textContent()) || 'null'
      )
      expect(firstApiAfterUpdates).toEqual(secondApiAfterUpdates)
      expect(firstApiAfterUpdates).toMatchObject({
        visible: true,
        id: 'B回调合并草稿',
        dataId: 'B回调合并草稿',
        title: 'B回调更新标题',
        loading: false,
        confirming: false,
        fullscreen: false,
        focus: false,
        scroll: 96
      })

      await page.getByRole('button', { name: '公开确认B', exact: true }).click()
      await expect(page.getByTestId('current-session-results')).toContainText(
        '"publicConfirm":false'
      )
      await expect(page.getByTestId('session-completion')).toContainText('"confirmations":2')
      await expect(panel).toBeVisible()
      await page.getByRole('button', { name: '公开重置B', exact: true }).click()
      await expect(page.getByTestId('session-completion')).toContainText('"resets":1')
      await expect(page.getByTestId('stale-api-live')).toContainText('"id":"B初始草稿"')
      await expect(page.getByTestId('current-api-live')).toContainText('"dataId":"B初始草稿"')
      await page.getByRole('button', { name: '公开关闭B', exact: true }).click()
      await expect(page.getByTestId('current-session-results')).toContainText('"close":true')
      await expect(panel).toBeHidden()
      expect(pageErrors).toEqual([])
    } finally {
      await page.getByRole('button', { name: '结束A会话回调', exact: true }).click()
    }
  })
}
