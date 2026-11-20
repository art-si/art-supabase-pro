import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

async function isolateRegistry(page: Page, tenantId = 'tenant-test') {
  await prepareIsolatedSession(page, { tenantId, platformSuper: false })
  const errors: string[] = []
  const registryRequests: string[] = []
  const unexpectedWrites: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/src/components/core/forms/art-form/components.ts*', (route) => {
    registryRequests.push(route.request().url())
    return route.fulfill({ status: 503, contentType: 'text/javascript', body: 'unavailable' })
  })
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const readRpc = [
      'current_is_super',
      'get_organization_list_secure',
      'material_unit_compatibility_options',
      'get_table_column_runtime'
    ].some((name) => path.endsWith(`/rpc/${name}`))
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method()) || readRpc) return route.fallback()
    unexpectedWrites.push(path)
    return route.fulfill({ status: 403, json: { message: '隔离测试阻止写入' } })
  })
  return { errors, registryRequests, unexpectedWrites }
}

for (const mode of ['bin', 'warehouse'] as const) {
  test(`真实WMS调拨接收 ${mode} 不依赖未使用控件，保留校验与失败重试`, async ({ page }, info) => {
    const evidence = await isolateRegistry(page)
    const appearance = {
      theme: mode === 'bin' ? 'dark' : 'light',
      boxBorderMode: mode !== 'bin'
    } as const
    await page.setViewportSize({ width: mode === 'bin' ? 390 : 1440, height: 900 })
    await prepareAppearance(page, appearance)
    await page.route('**/rest/v1/mdm_warehouse_bin?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'receive-bin',
            warehouse_id: 'target-warehouse',
            bin_code: 'ARRIVAL-01',
            bin_name: '调拨接收库位',
            status: 'available',
            supports_serial: true
          }
        ]
      })
    )
    const calls: Record<string, unknown>[] = []
    await page.route('**/rest/v1/rpc/wms_receive_transfer_secure', (route) => {
      calls.push(route.request().postDataJSON())
      return route.fulfill(
        calls.length === 1
          ? { status: 503, json: { code: 'P0001', message: '调拨接收暂时失败，请重试' } }
          : { json: null }
      )
    })
    await page.goto(
      `/tests/e2e/fixtures/wms-operation-retry.html?registryBoundary=${mode}&theme=${appearance.theme}&box=${appearance.boxBorderMode ? 'border-mode' : 'shadow-mode'}`,
      { waitUntil: 'domcontentloaded' }
    )
    await assertAppearance(page, appearance)
    await expect(page.getByTestId('registry-actor')).toHaveText(
      JSON.stringify({
        tenantId: 'tenant-test',
        platformSuper: false,
        permissions: ['WmsTransfer:View', 'WmsTransfer:Receive']
      })
    )
    await page.getByRole('button', { name: '测试调拨收货', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '确认调拨入库', exact: true })
    const confirm = dialog.getByRole('button', { name: '确定', exact: true })
    const picker = dialog.getByRole('combobox', { name: '目标库位', exact: true })
    await expect(picker).toBeVisible({ timeout: 60_000 })
    await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
    if (mode === 'bin') {
      await confirm.click()
      await expect.soft(dialog.getByText('请选择目标库位', { exact: true })).toBeVisible()
      expect(calls).toHaveLength(0)
      await picker.click()
      await page.getByRole('option', { name: 'ARRIVAL-01 · 调拨接收库位', exact: true }).click()
    } else await expect(picker).toBeDisabled()
    await confirm.click()
    await expect.poll(() => calls.length).toBe(1)
    await expect(page.getByText('调拨接收暂时失败，请重试', { exact: true })).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(confirm).toBeEnabled()
    if (mode === 'bin')
      await expect(dialog.getByText('ARRIVAL-01 · 调拨接收库位', { exact: true })).toBeVisible()
    await dialog.screenshot({ path: info.outputPath(`real-transfer-${mode}-retry.png`) })
    await confirm.click()
    await expect(dialog).toBeHidden()
    expect(calls).toEqual([
      { p_transfer_id: 'transfer-test', p_target_bin_id: mode === 'bin' ? 'receive-bin' : null },
      { p_transfer_id: 'transfer-test', p_target_bin_id: mode === 'bin' ? 'receive-bin' : null }
    ])
    expect(evidence.registryRequests).toEqual([])
    expect(evidence.unexpectedWrites).toEqual([])
    expect(evidence.errors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
  })
}

test('真实MDM休息时段复合表单无需预置控件加载即可校验并保存', async ({ page }, info) => {
  const evidence = await isolateRegistry(page, 'test-tenant')
  await page.setViewportSize({ width: 390, height: 844 })
  await prepareAppearance(page, { theme: 'light', boxBorderMode: false })
  await page.goto(
    '/tests/e2e/fixtures/engineering-dictionary-options.html?mode=break-times&shadowAudit=1',
    { waitUntil: 'domcontentloaded' }
  )
  await expect(page.getByTestId('break-actor')).toHaveText(
    JSON.stringify({
      tenantId: 'test-tenant',
      platformSuper: false,
      permissions: ['MdmFactoryCalendar:View', 'MdmFactoryCalendar:AddPattern']
    })
  )
  await page.getByRole('button', { name: '打开表单', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '休息时段设置', exact: true })
  await expect(dialog.getByRole('combobox', { name: '休息 1 开始时间', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect(dialog.getByText('合计休息 60 分钟', { exact: true })).toBeVisible()
  await dialog.screenshot({ path: info.outputPath('real-break-times.png') })
  await dialog.getByRole('button', { name: '保存休息时段', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('saved-break-times')).toHaveText(
    '[{"startTime":"12:00","endTime":"13:00"}]'
  )
  expect(evidence.registryRequests).toEqual([])
  expect(evidence.unexpectedWrites).toEqual([])
  expect(evidence.errors).toEqual([])
})
