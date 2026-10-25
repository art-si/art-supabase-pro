import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('隐藏图表清空后释放可见性监听，重新加载可恢复，销毁后不再初始化', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeObserver = window.IntersectionObserver
    const targets = new Map<IntersectionObserver, Set<Element>>()
    const report = () => {
      document.documentElement.dataset.intersectionTargets = String(
        Array.from(targets.values()).reduce((count, elements) => count + elements.size, 0)
      )
    }
    window.IntersectionObserver = class extends NativeObserver {
      observe(element: Element) {
        super.observe(element)
        const elements = targets.get(this) ?? new Set<Element>()
        elements.add(element)
        targets.set(this, elements)
        report()
      }
      unobserve(element: Element) {
        super.unobserve(element)
        targets.get(this)?.delete(element)
        report()
      }
      disconnect() {
        super.disconnect()
        targets.delete(this)
        report()
      }
    }
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/chart-motion.html?kind=hidden')
  await expect(page.locator('html')).toHaveAttribute('data-intersection-targets', '1')
  await page.getByRole('button', { name: '清空统计' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-intersection-targets', '0')
  await page.getByRole('button', { name: '更新统计', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-intersection-targets', '1')
  await page.getByRole('button', { name: '销毁图表', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-intersection-targets', '0')
  await page.getByRole('button', { name: '显示图表' }).click()
  await page.getByRole('button', { name: '更新统计', exact: true }).click()
  await expect(page.locator('canvas')).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-intersection-targets', '0')
  expect(errors).toEqual([])
})

test('主动销毁图表同时释放窗口尺寸监听，销毁前尺寸正常更新', async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<EventListenerOrEventListenerObject>()
    const add = window.addEventListener.bind(window)
    const remove = window.removeEventListener.bind(window)
    window.addEventListener = (type, listener, options) => {
      if (type === 'resize') listeners.add(listener)
      document.documentElement.dataset.resizeListeners = String(listeners.size)
      add(type, listener, options)
    }
    window.removeEventListener = (type, listener, options) => {
      if (type === 'resize') listeners.delete(listener)
      document.documentElement.dataset.resizeListeners = String(listeners.size)
      remove(type, listener, options)
    }
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/chart-motion.html?kind=dispose')
  await expect(page.locator('[_echarts_instance_]')).toHaveCount(1)
  await expect(page.locator('html')).toHaveAttribute('data-resize-listeners', '1')
  await page.setViewportSize({ width: 620, height: 840 })
  await expect
    .poll(() =>
      page
        .locator('canvas')
        .first()
        .evaluate((canvas) => canvas.getBoundingClientRect().width)
    )
    .toBe(588)
  await page.getByRole('button', { name: '销毁图表', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-resize-listeners', '0')
  await expect(page.locator('canvas')).toHaveCount(0)
  await page.setViewportSize({ width: 800, height: 840 })
  await page.getByRole('button', { name: '更新统计', exact: true }).click()
  await expect(page.locator('canvas')).toHaveCount(0)
  expect(errors).toEqual([])
})
test('隐藏图表可见后应用原始配置与动画偏好', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/tests/e2e/fixtures/chart-motion.html?kind=hidden')
  await expect(page.locator('[_echarts_instance_]')).toHaveCount(0)
  await page.getByRole('button', { name: '显示图表' }).click()
  const read = async () => JSON.parse((await page.getByTestId('chart-state').textContent()) || '{}')
  await expect.poll(async () => (await read()).series?.[0]?.data).toEqual([23])
  await expect.poll(async () => (await read()).animation).toBe(false)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(async () => (await read()).animation).toBe(true)
})
test('延迟初始化清空后不恢复旧图表', async ({ page }) => {
  await page.clock.install()
  await page.goto('/tests/e2e/fixtures/chart-motion.html?kind=delayed')
  await page.getByRole('button', { name: '清空统计' }).click()
  await expect(page.getByText('暂无数据', { exact: true })).toBeVisible()
  await page.clock.fastForward(6000)
  await expect(page.locator('[_echarts_instance_]')).toHaveCount(0)
  await page.getByRole('button', { name: '更新统计' }).click()
  await page.clock.fastForward(6000)
  await expect(page.locator('[_echarts_instance_]')).toHaveCount(1)
  await expect(page.getByText('暂无数据', { exact: true })).toHaveCount(0)
})

for (const updateWhileHidden of [false, true]) {
  test(`延迟初始化期间隐藏后保留${updateWhileHidden ? '最新' : '原始'}数据`, async ({
    page
  }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.clock.install()
    await page.goto('/tests/e2e/fixtures/chart-motion.html?kind=delayed-update')
    await page.getByRole('button', { name: '隐藏图表', exact: true }).click()
    if (updateWhileHidden) await page.getByRole('button', { name: '更新统计', exact: true }).click()
    await page.clock.fastForward(6000)
    await expect(page.locator('[_echarts_instance_]')).toHaveCount(0)
    await page.getByRole('button', { name: '显示图表', exact: true }).click()
    const read = async () =>
      JSON.parse((await page.getByTestId('chart-state').textContent()) || '{}')
    await expect
      .poll(async () => (await read()).series?.[0]?.data)
      .toEqual([updateWhileHidden ? 23 : 7])
    await expect(page.locator('canvas')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: info.outputPath('latest-visible-chart.png'),
      animations: 'disabled'
    })
    expect(errors).toEqual([])
  })
}

for (const kind of ['line', 'bar'] as const) {
  for (const initialMotion of ['reduce', 'no-preference'] as const) {
    test(`${kind} 图表真实值与动画中断 ${initialMotion}`, async ({ page }, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.clock.install()
      await page.emulateMedia({ reducedMotion: initialMotion })
      await page.goto(`/tests/e2e/fixtures/chart-motion.html?kind=${kind}`)
      const output = page.getByTestId('chart-state')
      const read = async () => JSON.parse((await output.textContent()) || '{}')
      if (initialMotion === 'no-preference') {
        await expect.poll(async () => (await read()).animation).toBe(true)
        await page.getByRole('button', { name: '更新统计' }).click()
        await page.emulateMedia({ reducedMotion: 'reduce' })
      }
      await expect.poll(async () => (await read()).animation).toBe(false)
      await expect
        .poll(async () =>
          (await read()).series.map((item: { animation: boolean }) => item.animation)
        )
        .toEqual([false, false])
      await expect
        .poll(async () => (await read()).series.map((item: { data: number[] }) => item.data))
        .toEqual(initialMotion === 'reduce' ? [[7], [8]] : [[23], [24]])
      await page.getByRole('button', { name: '更新统计' }).click()
      await expect
        .poll(async () => (await read()).series.map((item: { data: number[] }) => item.data))
        .toEqual([[23], [24]])
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await expect.poll(async () => (await read()).animation).toBe(true)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect.poll(async () => (await read()).animation).toBe(false)
      await expect
        .poll(async () => (await read()).series.map((item: { data: number[] }) => item.data))
        .toEqual([[23], [24]])
      await page.clock.fastForward(6000)
      await expect
        .poll(async () => (await read()).series.map((item: { data: number[] }) => item.data))
        .toEqual([[23], [24]])
      await page.screenshot({
        path: testInfo.outputPath('reduced-motion.png'),
        animations: 'disabled'
      })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      expect(errors).toEqual([])
      await page.getByRole('button', { name: '清空统计' }).click()
      await expect(page.getByText('暂无数据', { exact: true })).toBeVisible()
      await expect.poll(async () => (await read()).series || []).toEqual([])
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.clock.fastForward(6000)
      await expect.poll(async () => (await read()).series || []).toEqual([])
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.clock.fastForward(6000)
      await expect.poll(async () => (await read()).series || []).toEqual([])
    })
  }
}
