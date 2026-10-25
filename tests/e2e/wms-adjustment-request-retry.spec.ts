import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const variant of [
  { kind: 'gain', trigger: '测试盘盈单创建', title: '新增盘盈单' },
  { kind: 'loss', trigger: '测试盘盈单创建', title: '新增盘亏单' },
  { kind: 'transfer', trigger: '测试调拨申请创建', title: '新增调拨申请单' }
]) {
  test(`${variant.title}资料失败时禁止保存且可原位恢复`, async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    let failed = true
    let writes = 0
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().method() !== 'GET') writes += 1
      await route.fulfill(
        failed && new URL(route.request().url()).pathname.endsWith('/sys_menu')
          ? { status: 503, json: { message: 'fixture read failure' } }
          : {
              json: new URL(route.request().url()).pathname.endsWith('/sys_menu')
                ? { id: 'menu-test' }
                : []
            }
      )
    })
    await page.goto(`/tests/e2e/fixtures/wms-operation-retry.html?adjustmentKind=${variant.kind}`)
    await page.getByRole('button', { name: variant.trigger, exact: true }).click()
    const drawer = page.getByRole('dialog', { name: variant.title, exact: true })
    await expect(drawer.getByText('单据资料加载失败', { exact: true })).toBeVisible()
    const save = drawer.getByRole('button', { name: /保存(?:副本)?|确定/, exact: true })
    await expect(save).toBeDisabled()
    await expect(drawer.locator('.art-form')).toHaveCount(0)
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`${variant.kind}-failed.png`)
    })
    failed = false
    await drawer.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(drawer.getByText('单据资料加载失败', { exact: true })).toHaveCount(0)
    await expect(drawer.locator('.art-entity-summary')).toBeVisible()
    await expect(save).toBeEnabled()
    await expect(drawer.locator('.el-form-item__error')).toHaveCount(0)
    expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`${variant.kind}-recovered.png`)
    })
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    expect(writes).toBe(0)
    expect(errors).toEqual([])
  })
}
