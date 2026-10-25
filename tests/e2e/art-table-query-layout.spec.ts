import { expect, test } from '@playwright/test'

test('AI 运行明细在非全高页面中显示表格，而不是空白区域', async ({ page }) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('#/dashboard/ai-operations?section=runs', { waitUntil: 'domcontentloaded' })

  const table = page.locator('.ai-operations__table .el-table')
  await expect(table).toBeVisible({ timeout: 60_000 })
  await expect(table.getByRole('columnheader', { name: '功能场景' })).toBeVisible()
  await expect
    .poll(async () => table.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(200)
  expect(pageErrors).toEqual([])
})

test('查询表格示例的内管与受控表格均不塌缩', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('#/widgets/table-query', { waitUntil: 'domcontentloaded' })

  const tables = page.locator('.table-query-widget .art-table-query .el-table')
  await expect(tables).toHaveCount(2, { timeout: 60_000 })
  for (const table of await tables.all()) {
    await expect(table).toBeVisible()
    expect(
      await table.evaluate((element) => element.getBoundingClientRect().height)
    ).toBeGreaterThan(250)
  }
})

test('全高用户列表在共享表格布局调整后仍保持可见', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('#/system/user', { waitUntil: 'domcontentloaded' })

  const table = page.locator('.art-table-query .el-table').first()
  await expect(table).toBeVisible({ timeout: 60_000 })
  expect(await table.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(
    80
  )
})
