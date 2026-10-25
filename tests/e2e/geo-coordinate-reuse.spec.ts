import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(120_000)
for (const mode of [
  'valid',
  'zero',
  'blank',
  'invalid',
  'range',
  'latitude',
  'missing',
  'masked'
]) {
  test(`围栏与地址选择器坐标校验一致 ${mode}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    let writes = 0
    await page.route('**/rest/v1/**', (route) => {
      if (route.request().url().includes('tms_update_customer_address_secure')) {
        writes++
        return route.fulfill({ json: null })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(`/tests/e2e/fixtures/geo-coordinate-reuse.html?mode=${mode}&status=located`)
    const valid = mode === 'valid' || mode === 'zero'
    const summary = page.locator('.art-address-picker')
    if (valid) await expect(summary.getByText(/经度 .* · 纬度/)).toBeVisible()
    else await expect(summary.getByText(/经度 .* · 纬度/)).toHaveCount(0)
    await expect(summary.getByText(valid ? '已选点' : '待确认', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '打开围栏', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置地址围栏', exact: true })
    await expect(dialog).toBeVisible()
    const toggle = dialog.getByRole('switch')
    if (valid) {
      await expect(toggle).toBeEnabled()
      await dialog.locator('.el-switch__core').click()
      await dialog.getByRole('button', { name: '保存围栏', exact: true }).click()
      await expect(page.getByLabel('保存成功次数')).toHaveText('1')
      expect(writes).toBe(1)
    } else {
      await expect(toggle).toBeDisabled()
      await expect(dialog.getByText('该地址缺少有效地图坐标', { exact: true })).toBeVisible()
      await expect(dialog.getByText('该地址缺少有效地图坐标', { exact: true })).toBeInViewport()
      expect(writes).toBe(0)
      await page.screenshot({ path: info.outputPath('invalid-coordinate.png') })
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('已有无效坐标的围栏阻止继续启用并允许停用', async ({ page }) => {
  await prepareIsolatedSession(page)
  const payloads: Array<{ geofence_enabled: boolean }> = []
  await page.route('**/rest/v1/**', (route) => {
    if (route.request().url().includes('tms_update_customer_address_secure')) {
      payloads.push(route.request().postDataJSON().p_payload)
      return route.fulfill({ json: null })
    }
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/geo-coordinate-reuse.html?mode=range&enabled=1')
  await page.getByRole('button', { name: '打开围栏', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '设置地址围栏', exact: true })
  await expect(dialog.getByText('坐标待修正', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '保存围栏', exact: true }).click()
  await expect(
    page.getByText('请先完成地址地图定位，或停用围栏后保存', { exact: true })
  ).toBeVisible()
  expect(payloads).toEqual([])
  await dialog.locator('.el-switch__core').click()
  await dialog.getByRole('button', { name: '保存围栏', exact: true }).click()
  await expect(page.getByLabel('保存成功次数')).toHaveText('1')
  expect(payloads).toHaveLength(1)
  expect(payloads[0].geofence_enabled).toBe(false)
})

for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    for (const denied of [false, true]) {
      test(`围栏纠错提示优先显示 ${theme} ${box} ${denied ? '查看' : '维护'}`, async ({
        page
      }, info) => {
        await prepareIsolatedSession(page)
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        let writes = 0
        await page.route('**/rest/v1/**', (route) => {
          if (route.request().url().includes('tms_update_customer_address_secure')) writes++
          return route.fulfill({ json: [] })
        })
        await page.goto(
          `/tests/e2e/fixtures/geo-coordinate-reuse.html?mode=range&status=located&enabled=1&theme=${theme}&box=${box}${denied ? '&denied=1' : ''}`
        )
        await expect(
          page.locator('.art-address-picker').getByText('待确认', { exact: true })
        ).toBeVisible()
        await page.getByRole('button', { name: '打开围栏', exact: true }).click()
        const dialog = page.getByRole('dialog', {
          name: denied ? '查看地址围栏' : '设置地址围栏',
          exact: true
        })
        const warning = dialog.getByText('该地址缺少有效地图坐标', { exact: true })
        await expect(warning).toBeInViewport({ ratio: 1 })
        const alertBox = await dialog.locator('.el-alert--warning').boundingBox()
        const formBox = await dialog.locator('.art-form').boundingBox()
        expect(alertBox).not.toBeNull()
        expect(formBox).not.toBeNull()
        expect(alertBox!.y + alertBox!.height).toBeLessThanOrEqual(formBox!.y)
        if (denied) {
          await expect(dialog.getByText(/当前角色可查看地址围栏范围/)).toBeInViewport({ ratio: 1 })
          await expect(dialog.getByRole('switch')).toBeDisabled()
          await expect(dialog.getByRole('button', { name: '保存围栏', exact: true })).toHaveCount(0)
        } else await expect(dialog.getByRole('switch')).toBeEnabled()
        await page.screenshot({ path: info.outputPath('guidance-first.png') })
        await dialog.getByRole('region', { name: '围栏半径预览' }).scrollIntoViewIfNeeded()
        await expect(dialog.getByText('坐标待修正', { exact: true })).toBeVisible()
        await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeInViewport()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        )
        expect(writes).toBe(0)
        expect(errors).toEqual([])
      })
    }
  }
}
