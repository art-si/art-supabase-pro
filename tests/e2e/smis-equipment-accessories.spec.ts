import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const missingInitially of [false, true]) {
  test(`编辑设备按关联 ID 恢复附件${missingInitially ? '，缺失时阻止保存并支持重试' : '，不扫描设备列表'}`, async ({
    page
  }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const requests: string[] = []
    let missing = missingInitially
    await page.route('**/rest/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      requests.push(path)
      if (path.endsWith('/rpc/smis_get_equipment_archive_secure')) {
        const id = route.request().postDataJSON().p_equipment_id as string
        const isGauge = id.startsWith('44444444')
        await route.fulfill({
          json: missing
            ? null
            : {
                id,
                categoryId: isGauge ? 'gauge-category' : 'valve-category',
                profileType: isGauge ? 'pressure_gauge' : 'safety_valve',
                equipmentCode: isGauge ? 'GAUGE-001' : 'VALVE-001',
                equipmentName: isGauge ? '测试压力表' : '测试安全阀',
                location: { locationName: '测试机房' }
              }
        })
        return
      }
      await route.fulfill({ json: path.endsWith('/sys_document_number_rule') ? null : [] })
    })
    await page.goto('/tests/e2e/fixtures/smis-equipment-accessories.html')
    const dialog = page.getByRole('dialog', { name: '编辑设备台账' })
    await expect(dialog).toBeVisible()
    if (missingInitially) {
      await expect(dialog.getByText('设备资料加载失败')).toBeVisible()
      await expect(
        dialog.getByText('关联设备已不存在或当前账号无权查看，请核对设备关联后重试')
      ).toBeVisible()
      await dialog.getByRole('button', { name: '保存设备台账' }).click()
      expect(
        requests.filter((path) => path.endsWith('/rpc/smis_save_equipment_archive_secure'))
      ).toHaveLength(0)
      missing = false
      await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
    }
    await expect(dialog.getByText('测试压力表', { exact: true })).toHaveCount(1)
    await expect(dialog.getByText('测试安全阀', { exact: true })).toHaveCount(1)
    expect(
      requests.filter((path) => path.endsWith('/rpc/smis_list_equipment_ledger_secure'))
    ).toHaveLength(0)
    if (!missingInitially) {
      expect(
        requests.filter((path) => path.endsWith('/rpc/smis_get_equipment_archive_secure'))
      ).toHaveLength(2)
      await dialog.getByText('测试安全阀', { exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({
        path: '.artifacts/smis-equipment-accessories.png',
        animations: 'disabled'
      })
      await page.setViewportSize({ width: 390, height: 844 })
      await dialog.getByText('测试安全阀', { exact: true }).scrollIntoViewIfNeeded()
      const widths = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth
      }))
      expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
      await page.screenshot({
        path: '.artifacts/smis-equipment-accessories-mobile.png',
        animations: 'disabled'
      })
    }
    expect(pageErrors).toEqual([])
  })
}
