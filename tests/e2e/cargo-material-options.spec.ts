import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

test('关闭重开后旧物料响应不覆盖新候选', async ({ page }) => {
  let requests = 0
  let releaseOld: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  await page.route('**/rest/v1/mdm_material?**', async (route) => {
    const request = ++requests
    if (request === 1) await held
    await route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: request === 1 ? 'old-material' : 'new-material',
          material_code: request === 1 ? 'OLD' : 'NEW',
          material_name: request === 1 ? '旧候选' : '新候选',
          basic_unit: '件'
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/cargo-material-options.html')
  await page.getByRole('button', { name: '打开货物', exact: true }).click()
  await expect.poll(() => requests).toBe(1)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '打开货物', exact: true }).click()
  await expect.poll(() => requests).toBe(2)
  releaseOld?.()
  await page.getByRole('combobox', { name: /物料编码/ }).click()
  await expect(page.getByRole('option', { name: 'NEW · 新候选' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'OLD · 旧候选' })).toHaveCount(0)
  await page.getByRole('option', { name: 'NEW · 新候选' }).click()
  await expect(page.getByPlaceholder('选择物料后自动带入')).toHaveValue('新候选')
})

test('货物物料失败可重试且保留备注', async ({ page }) => {
  let fail = true
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/mdm_material?**', (route) =>
    fail
      ? route.fulfill({
          status: 503,
          json: { code: 'SERVICE_UNAVAILABLE', message: 'unavailable' }
        })
      : route.fulfill({
          headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
          json: [
            {
              id: 'material-a',
              material_code: 'MAT-A',
              material_name: '测试物料',
              basic_unit: '件'
            }
          ]
        })
  )
  await page.goto('/tests/e2e/fixtures/cargo-material-options.html')
  await page.getByRole('button', { name: '打开货物', exact: true }).click()
  await expect(page.getByText('选项加载失败', { exact: true })).toBeVisible()
  await page.getByPlaceholder('补充运输注意事项').fill('保留备注')
  fail = false
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByText('选项加载失败', { exact: true })).toBeHidden()
  await page.getByRole('combobox', { name: /物料编码/ }).click()
  await page.getByRole('option', { name: 'MAT-A · 测试物料' }).click()
  await expect(page.getByPlaceholder('选择物料后自动带入')).toHaveValue('测试物料')
  await expect(page.getByPlaceholder('补充运输注意事项')).toHaveValue('保留备注')
  expect(errors).toEqual([])
  await page.screenshot({
    path: `.artifacts/cargo-material-options-${test.info().project.name}.png`,
    fullPage: true
  })
})
