import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180000)

test('点检项目替换后旧下移操作不能改动新项目', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/pmis-plan-stale-row.html', { waitUntil: 'commit' })
  await expect(page.getByRole('button', { name: '下移', exact: true }).first()).toBeVisible({
    timeout: 120000
  })
  await page.getByRole('button', { name: '替换项目并保留旧下移按钮' }).click()
  await expect(page.getByTestId('stale-button-captured')).toHaveText('true')
  await page.getByRole('button', { name: '触发旧下移按钮' }).click()
  await expect(page.getByTestId('stale-action-invoked')).toHaveText('1')
  const rows = JSON.parse((await page.getByTestId('plan-items').textContent()) ?? '[]')
  expect(rows.map((row: { itemName: string; sort: number }) => [row.itemName, row.sort])).toEqual([
    ['新项目一', 10],
    ['新项目二', 20]
  ])
  await page.screenshot({
    path: info.outputPath('pmis-plan-stale-row.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})

test('点检项目正常上移、下移和删除', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/pmis-plan-stale-row.html', { waitUntil: 'commit' })
  await expect(page.getByRole('button', { name: '下移', exact: true }).first()).toBeVisible({
    timeout: 120000
  })
  await page.getByRole('button', { name: '下移', exact: true }).first().click()
  await expect(page.getByTestId('plan-items')).toContainText('"itemName":"旧项目二"')
  let rows = JSON.parse((await page.getByTestId('plan-items').textContent()) ?? '[]')
  expect(rows.map((row: { itemName: string; sort: number }) => [row.itemName, row.sort])).toEqual([
    ['旧项目二', 10],
    ['旧项目一', 20]
  ])
  await page.getByRole('button', { name: '上移', exact: true }).last().click()
  rows = JSON.parse((await page.getByTestId('plan-items').textContent()) ?? '[]')
  expect(rows.map((row: { itemName: string; sort: number }) => [row.itemName, row.sort])).toEqual([
    ['旧项目一', 10],
    ['旧项目二', 20]
  ])
  await page.getByRole('button', { name: '删除项目', exact: true }).last().click()
  rows = JSON.parse((await page.getByTestId('plan-items').textContent()) ?? '[]')
  expect(rows.map((row: { itemName: string }) => row.itemName)).toEqual(['旧项目一'])
})
