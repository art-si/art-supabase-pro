import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const scenario of [
  {
    trigger: '测试调拨收货',
    rpc: 'wms_receive_transfer_secure',
    payload: { p_transfer_id: 'transfer-test', p_target_bin_id: 'bin-test' },
    table: 'mdm_warehouse_bin',
    field: '目标库位',
    option: 'BIN-TEST-001 · 测试库位',
    rows: [
      {
        id: 'bin-test',
        warehouse_id: 'target-warehouse',
        bin_code: 'BIN-TEST-001',
        bin_name: '测试库位',
        status: 'available',
        supports_serial: true
      }
    ]
  },
  {
    trigger: '测试 SN 预留',
    rpc: 'wms_reserve_serials_secure',
    payload: { p_work_order_id: 'order-test', p_serial_ids: ['serial-test'] },
    table: 'wms_inventory_reservation',
    field: '预留给工单',
    option: 'ORDER-TEST-001',
    rows: [
      {
        work_order_id: 'order-test',
        workOrder: {
          work_order_no: 'ORDER-TEST-001',
          order_status: 'REL',
          project_id: null,
          construction_no: null
        }
      }
    ]
  },
  {
    trigger: '测试 SN 绑定',
    rpc: 'wms_bind_assembly_serials_secure',
    payload: { p_parent_serial_id: 'serial-test', p_child_serial_ids: ['child-test'] },
    table: 'wms_serial_number',
    field: '已领用的关键件 SN',
    option: 'SN-CHILD-TEST-001 · 测试关键件',
    rows: [
      {
        id: 'child-test',
        serial_no: 'SN-CHILD-TEST-001',
        material: { material_name: '测试关键件' }
      }
    ]
  }
]) {
  test(`${scenario.trigger}加载失败后原位重试`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    let failure = true
    let submitFailure = true
    const writes: unknown[] = []
    await page.route(`**/rpc/${scenario.rpc}`, (route) => {
      writes.push(route.request().postDataJSON())
      return submitFailure
        ? route.fulfill({ status: 400, json: { code: 'P0001', message: '测试操作提交失败' } })
        : route.fulfill({ json: null })
    })
    let attempts = 0
    const unavailableBin = {
      id: 'unavailable-bin',
      warehouse_id: 'target-warehouse',
      bin_code: 'UNAVAILABLE',
      bin_name: '不可用库位',
      status: 'disabled',
      supports_serial: false
    }
    if (scenario.trigger === '测试调拨收货') {
      let recommendations = 0
      await page.route('**/rpc/wms_recommend_bin_secure', (route) => {
        recommendations++
        return route.fulfill({ json: recommendations === 1 ? 'unavailable-bin' : 'non-serial-bin' })
      })
    }
    await page.route(`**/rest/v1/${scenario.table}?*`, (route) => {
      attempts++
      const rows =
        scenario.trigger === '测试调拨收货'
          ? [
              ...scenario.rows,
              unavailableBin,
              {
                ...unavailableBin,
                id: 'non-serial-bin',
                bin_code: 'NON-SERIAL',
                bin_name: '无序列号库位',
                status: 'available'
              }
            ]
          : scenario.rows
      return failure
        ? route.fulfill({ status: 503, json: { code: 'XX000', message: '测试加载失败' } })
        : route.fulfill({
            headers: {
              'content-range': `0-${rows.length - 1}/${rows.length}`,
              'access-control-expose-headers': 'content-range'
            },
            json: rows
          })
    })
    await page.goto(
      `/tests/e2e/fixtures/wms-operation-retry.html${scenario.trigger === '测试调拨收货' ? '?transferSerialManaged=true' : ''}`
    )
    await page.getByRole('button', { name: scenario.trigger, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled()
    failure = false
    const beforeRetry = attempts
    await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(dialog.getByRole('button', { name: '重新加载', exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
    await expect(dialog.getByText(scenario.field, { exact: true })).toBeVisible()
    if (scenario.trigger === '测试调拨收货') {
      const width = await dialog
        .locator('.el-select')
        .evaluate((element) => element.getBoundingClientRect().width)
      expect(width).toBeGreaterThanOrEqual(testInfo.project.name === 'mobile-390' ? 240 : 360)
      await dialog.getByRole('button', { name: '自动选位', exact: true }).click()
      await expect(
        page.getByText('推荐库位不可用或不支持当前物料，请手动选择可用库位', { exact: true })
      ).toBeVisible()
      await dialog.getByRole('button', { name: '确定', exact: true }).click()
      await expect(dialog.locator('.el-form-item__error')).toBeVisible()
      expect(writes).toHaveLength(0)
      await expect(page.locator('.el-message')).toHaveCount(0, { timeout: 15_000 })
      await dialog.getByRole('button', { name: '自动选位', exact: true }).click()
      await expect(
        page.getByText('推荐库位不可用或不支持当前物料，请手动选择可用库位', { exact: true })
      ).toBeVisible()
      await dialog.getByRole('button', { name: '确定', exact: true }).click()
      expect(writes).toHaveLength(0)
    }
    await dialog.getByRole('combobox').first().press('ArrowDown')
    await expect(page.getByRole('option', { name: scenario.option, exact: true })).toBeVisible()
    if (scenario.trigger === '测试调拨收货') {
      await expect(
        page.getByRole('option', { name: 'NON-SERIAL · 无序列号库位', exact: true })
      ).toHaveCount(0)
    }
    expect(attempts).toBeGreaterThan(beforeRetry)
    const dimensions = await dialog.evaluate((el) => ({
      overflow: el.scrollWidth - el.clientWidth,
      width: el.getBoundingClientRect().width
    }))
    expect(dimensions.overflow).toBeLessThanOrEqual(1)
    expect(dimensions.width).toBeGreaterThan(0)
    await page.screenshot({
      path: testInfo.outputPath('wms-retry-loaded.png'),
      animations: 'disabled'
    })
    await page.getByRole('option', { name: scenario.option, exact: true }).click()
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByText('测试操作提交失败', { exact: false }).first()).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(scenario.option, { exact: true })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath('operation-submit-rejected.png'),
      animations: 'disabled'
    })
    submitFailure = false
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(writes).toEqual([scenario.payload, scenario.payload])
    await page.getByRole('button', { name: scenario.trigger, exact: true }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(dialog.locator('.el-form-item__error')).toBeVisible()
    expect(writes).toHaveLength(2)
    await page.screenshot({
      path: testInfo.outputPath('operation-reopen-required.png'),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    if (scenario.trigger === '测试调拨收货') {
      let releaseOld!: () => void
      const held = new Promise<void>((resolve) => {
        releaseOld = resolve
      })
      let markStarted!: () => void
      const started = new Promise<void>((resolve) => {
        markStarted = resolve
      })
      let reads = 0
      await page.route('**/rest/v1/mdm_warehouse_bin?*', async (route) => {
        reads++
        if (reads === 1) {
          markStarted()
          await held
          await route.fulfill({ json: scenario.rows })
        } else {
          await route.fulfill({
            json: [
              {
                ...scenario.rows[0],
                id: 'fresh-bin',
                bin_code: 'BIN-FRESH',
                bin_name: '重新打开库位'
              }
            ]
          })
        }
      })
      await page.getByRole('button', { name: scenario.trigger, exact: true }).click()
      await started
      await dialog.getByRole('button', { name: /^(关闭此对话框|Close this dialog)$/ }).click()
      await expect(dialog).toBeHidden()
      await page.getByRole('button', { name: scenario.trigger, exact: true }).click()
      await expect(dialog.getByRole('combobox')).toBeVisible()
      const oldResponse = page.waitForResponse((response) =>
        response.url().includes('/mdm_warehouse_bin')
      )
      releaseOld()
      await oldResponse
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      await dialog.getByRole('combobox').press('ArrowDown')
      await expect(
        page.getByRole('option', { name: 'BIN-FRESH · 重新打开库位', exact: true })
      ).toBeVisible()
      await expect(page.getByRole('option', { name: scenario.option, exact: true })).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('transfer-reopen-fresh-bins.png'),
        animations: 'disabled'
      })
      await page.keyboard.press('Escape')
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      expect(writes).toHaveLength(2)
    }
    expect(errors).toEqual([])
  })
}
