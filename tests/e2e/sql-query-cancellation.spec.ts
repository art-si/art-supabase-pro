import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
test.beforeEach(async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
})

for (const outcome of ['cancelled', 'finished', 'retry'] as const) {
  test(`取消查询等待数据库终态并保留真实结果：${outcome}`, async ({ page }, info) => {
    test.setTimeout(90_000)
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let requestId = ''
    const executed: string[] = []
    const cancelled: string[] = []
    await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
      const body = route.request().postDataJSON() as { action?: string; requestId?: string }
      if (body.action === 'metadata')
        return route.fulfill({
          json: {
            schemas: ['public'],
            tables: [],
            columns: [],
            functions: [],
            foreignKeys: []
          }
        })
      if (body.action === 'cancel') {
        cancelled.push(body.requestId || '')
        return outcome === 'retry' && cancelled.length === 1
          ? route.fulfill({ status: 503, json: { message: '取消查询失败，请重试或等待查询结束' } })
          : route.fulfill({ json: { status: 'ok', state: 'cancel_requested' } })
      }
      requestId = body.requestId || ''
      executed.push(requestId)
      if (executed.length === 1) await pending
      return outcome === 'cancelled' && executed.length === 1
        ? route.fulfill({
            status: 409,
            json: {
              status: 'error',
              errorCode: 'SQL_QUERY_CANCELLED',
              message: '查询已取消',
              duration_ms: 500
            }
          })
        : route.fulfill({
            json: {
              status: 'ok',
              rows: [{ value: 42 }],
              columns: [{ name: 'value' }],
              command_tag: 'SELECT',
              row_count: 1
            }
          })
    })
    await page.goto(
      '/tests/e2e/fixtures/sql-console-metadata.html?actor=query-cancel&tenant=tenant-a'
    )
    await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
    await expect.poll(() => executed.length).toBe(1)
    expect(requestId).toMatch(/^[a-f\d-]{36}$/i)
    const cancel = page.getByRole('button', { name: '取消查询', exact: true })
    await expect(cancel).toBeVisible()
    await cancel.click()
    if (outcome === 'retry') {
      await expect(
        page.getByText('取消查询失败，请重试或等待查询结束', { exact: true })
      ).toBeVisible()
      await expect(cancel).toBeEnabled()
      await cancel.click()
    }
    await expect(cancel).toBeDisabled()
    await expect(page.getByText('正在取消查询…', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toHaveCount(0)
    expect(cancelled.every((id) => id === requestId)).toBe(true)
    release()
    if (outcome === 'cancelled') {
      await expect(page.getByText('查询已取消', { exact: true })).toBeVisible()
      await expect(page.getByText('AI 修复这条 SQL', { exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: '查询历史', exact: true }).click()
      const history = page.getByRole('dialog', { name: '查询历史', exact: true })
      await expect(history).toContainText('已取消')
      await history.getByRole('button', { name: '关闭', exact: true }).last().click()
    } else await expect(page.locator('.result-table')).toContainText('42')
    await expect(page.getByRole('button', { name: '执行 SQL', exact: true })).toBeEnabled()
    await page.screenshot({ path: info.outputPath(`query-${outcome}.png`) })
    await page.getByRole('button', { name: '执行 SQL', exact: true }).click()
    await expect.poll(() => executed.length).toBe(2)
    expect(executed[0]).not.toBe(executed[1])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
  })
}

test('执行计划可以取消并等待分析事务结束', async ({ page }, info) => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let requestId = ''
  await page.route('**/functions/v1/execute-sql-with-columns', async (route) => {
    const body = route.request().postDataJSON() as { action?: string; requestId?: string }
    if (body.action === 'metadata')
      return route.fulfill({
        json: {
          schemas: ['public'],
          tables: [],
          columns: [],
          functions: [],
          foreignKeys: []
        }
      })
    if (body.action === 'cancel') {
      expect(body.requestId).toBe(requestId)
      return route.fulfill({ json: { status: 'ok', state: 'cancel_requested' } })
    }
    expect(body.action).toBe('explain')
    requestId = body.requestId || ''
    await pending
    return route.fulfill({
      status: 409,
      json: { status: 'error', errorCode: 'SQL_QUERY_CANCELLED', message: '查询已取消' }
    })
  })
  await page.goto('/tests/e2e/fixtures/sql-console-metadata.html?actor=plan-cancel&tenant=tenant-a')
  await page.getByRole('button', { name: '查看执行计划', exact: true }).click()
  const drawer = page.getByRole('dialog', { name: '执行计划', exact: true })
  await expect.poll(() => requestId).not.toBe('')
  await drawer.getByRole('button', { name: '取消分析', exact: true }).click()
  await expect(drawer.getByRole('button', { name: '等待数据库结束…', exact: true })).toBeDisabled()
  release()
  await expect(drawer.getByText('分析已取消', { exact: true })).toBeVisible()
  await expect(drawer.getByRole('button', { name: '重新分析', exact: true })).toBeEnabled()
  await page.screenshot({ path: info.outputPath('plan-cancelled.png') })
})
