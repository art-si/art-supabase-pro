import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

test('关闭重开后旧子件请求不覆盖当前候选', async ({ page }) => {
  let reads = 0
  let releaseOld: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/wms_serial_number?*', async (route) => {
    const read = ++reads
    if (read === 1) await held
    await route.fulfill({
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: read === 1 ? 'old-child' : 'new-child',
          serial_no: read === 1 ? 'OLD-SN' : 'NEW-SN',
          material: { material_name: '测试关键件' }
        }
      ]
    })
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
  await page.getByRole('button', { name: '测试 SN 绑定', exact: true }).click()
  await expect.poll(() => reads).toBe(1)
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^(关闭此对话框|Close this dialog)$/ }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '测试 SN 绑定', exact: true }).click()
  await expect.poll(() => reads).toBe(2)
  const oldResponse = page.waitForResponse((response) =>
    response.url().includes('/wms_serial_number')
  )
  releaseOld?.()
  await oldResponse
  await dialog.getByRole('combobox').press('ArrowDown')
  await expect(page.getByRole('option', { name: 'NEW-SN · 测试关键件', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'OLD-SN · 测试关键件', exact: true })).toHaveCount(
    0
  )
  await page.getByRole('option', { name: 'NEW-SN · 测试关键件', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.screenshot({
    path: test.info().outputPath('fresh-serial-candidates.png'),
    animations: 'disabled'
  })
})

test('绑定请求固定原选择且请求期间改变选择保留弹窗', async ({ page }) => {
  let releaseWrite: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    releaseWrite = resolve
  })
  const writes: unknown[] = []
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rest/v1/wms_serial_number?*', (route) =>
    route.fulfill({
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' },
      json: ['A', 'B'].map((suffix) => ({
        id: `child-${suffix}`,
        serial_no: `SN-${suffix}`,
        material: { material_name: '关键件' }
      }))
    })
  )
  await page.route('**/rpc/wms_bind_assembly_serials_secure', async (route) => {
    writes.push(route.request().postDataJSON())
    await held
    await route.fulfill({ json: null })
  })
  await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
  await page.getByRole('button', { name: '测试 SN 绑定', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox').press('ArrowDown')
  await page.getByRole('option', { name: 'SN-A · 关键件', exact: true }).click()
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  await dialog.getByRole('combobox').press('ArrowDown')
  await page.getByRole('option', { name: 'SN-B · 关键件', exact: true }).click()
  await page.keyboard.press('Escape')
  const response = page.waitForResponse((item) =>
    item.url().includes('/rpc/wms_bind_assembly_serials_secure')
  )
  releaseWrite?.()
  await response
  await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
  await expect(dialog).toBeVisible()
  expect(writes).toEqual([{ p_parent_serial_id: 'serial-test', p_child_serial_ids: ['child-A'] }])
})
