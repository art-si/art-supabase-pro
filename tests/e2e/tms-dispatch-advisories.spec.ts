import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance, assertAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)

for (const scenario of ['single', 'split', 'merge', 'notice-error'] as const) {
  const kind = scenario === 'notice-error' ? 'single' : scenario
  test(`${scenario} 普通用户带司机风险继续配载，提醒不阻断`, async ({ page }, testInfo) => {
    const writes: Array<Record<string, unknown>> = []
    let strictChecks = 0
    await prepareIsolatedSession(page)
    const appearance = {
      theme: testInfo.project.name.includes('dark') ? ('dark' as const) : ('light' as const),
      boxBorderMode: !testInfo.project.name.includes('shadow')
    }
    await prepareAppearance(page, appearance)
    const driver = {
      id: 'driver-1',
      driver_name: '风险司机甲',
      phone: '13800000001',
      vehicle_id: 'vehicle-1',
      vehicle: {
        id: 'vehicle-1',
        plate_no: '测A10001',
        vehicle_ownership: 'self_operated',
        carrier_id: null
      },
      plate_no: '测A10001',
      driver_status: 'off_duty'
    }
    const vehicle = {
      id: 'vehicle-1',
      plate_no: '测A10001',
      primary_driver_id: 'driver-1',
      primary_driver: driver,
      vehicle_ownership: 'self_operated'
    }
    const warnings = [
      { subject_label: '风险司机甲', message: '有 2 张未完成运输任务，请核对计划时间' },
      { subject_label: '风险司机甲', message: '司机当前非在岗' }
    ]
    await page.route('**/rest/v1/**', (route) => {
      const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
      if (endpoint === 'tms_check_dispatch_advisories_secure')
        return scenario === 'notice-error'
          ? route.fulfill({ status: 503, json: { message: 'risk lookup unavailable' } })
          : route.fulfill({ json: warnings })
      if (endpoint === 'tms_list_dispatch_candidates_secure') {
        const request = route.request().postDataJSON()
        return route.fulfill({
          json: {
            records:
              request.p_kind === 'self_driver' || request.p_kind === 'driver'
                ? [driver]
                : [vehicle],
            total: 1
          }
        })
      }
      if (endpoint === 'vms_list_dispatch_vehicle_options_secure')
        return route.fulfill({ json: { records: [vehicle], total: 1 } })
      if (endpoint === 'vms_check_dispatch_certificate_risk_secure') {
        strictChecks++
        return route.fulfill({ status: 403, json: { message: '旧强制检查不应调用' } })
      }
      if (endpoint === 'tms_create_dispatch_plan_secure') {
        writes.push(route.request().postDataJSON().p_plan)
        return route.fulfill({
          json: {
            waybill_ids: ['waybill-1'],
            waybill_nos: ['YWD-001'],
            warnings: [
              ...warnings,
              {
                execution_index: 1,
                subject_label: '测A10001',
                message: '本批次货物重量超过车辆核载吨位，请核对实际装载'
              }
            ]
          }
        })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/tms-carrier-dispatch-account.html', {
      waitUntil: 'commit'
    })
    const opener = page.getByRole('button', {
      name: kind === 'split' ? '打开拆单' : kind === 'merge' ? '打开合单' : '打开调度',
      exact: true
    })
    await expect(opener).toBeVisible({ timeout: 120_000 })
    await assertAppearance(page, appearance)
    await opener.click()
    const dialog = page.getByRole('dialog').filter({
      has: page.getByRole('button', {
        name:
          kind === 'split' ? '生成调度执行单' : kind === 'merge' ? '确认合单并配载' : '确认配载',
        exact: true
      })
    })
    await expect(dialog).toBeVisible()
    if (kind === 'split') {
      const amounts = dialog.locator('.el-input-number input')
      await amounts.nth(0).fill('0.25')
      await amounts.nth(0).press('Tab')
      await amounts.nth(1).fill('0.25')
      await amounts.nth(1).press('Tab')
      for (let index = 0; index < 2; index++) {
        await dialog
          .getByRole('textbox', { name: /执行车辆/ })
          .nth(index)
          .click()
        const picker = page.getByRole('dialog', { name: '选择执行车辆', exact: true })
        await expect(picker).toBeVisible()
        await picker.getByText('测A10001', { exact: true }).click()
        await picker.getByRole('button', { name: '确定', exact: true }).click()
      }
      const remainder = dialog.locator('.el-alert').filter({ hasText: '仍有货量未调度' })
      const tableBox = await dialog.locator('table').boundingBox()
      const alertBox = await remainder.boundingBox()
      expect(alertBox!.y - (tableBox!.y + tableBox!.height)).toBeGreaterThanOrEqual(12)
      await remainder.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('split-allocation-spacing.png'),
        fullPage: true
      })
    } else {
      await dialog.getByRole('textbox', { name: /自营司机/ }).click()
      const picker = page.getByRole('dialog', { name: '选择自营司机', exact: true })
      await expect(picker).toBeVisible()
      await picker.getByText('风险司机甲', { exact: true }).click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      await expect(
        dialog.getByRole('textbox', { name: /自营车辆|执行车辆|配载车辆|车辆/ }).last()
      ).toHaveValue('测A10001')
    }
    const departures = dialog.getByRole('combobox', { name: /计划发车/ })
    const arrivals = dialog.getByRole('combobox', { name: /计划到达/ })
    for (let index = 0; index < (await departures.count()); index++) {
      await departures.nth(index).fill('2026-11-07 10:00:00')
      await departures.nth(index).press('Tab')
      await arrivals.nth(index).fill('2026-11-08 10:00:00')
      await arrivals.nth(index).press('Tab')
    }
    await expect(
      scenario === 'notice-error'
        ? dialog.getByText('风险信息暂未获取，可重选车辆或司机重试；不影响提交，请人工核对。')
        : dialog.getByText('风险司机甲：有 2 张未完成运输任务，请核对计划时间').first()
    ).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`${kind}-advisory.png`), fullPage: true })
    await dialog
      .getByRole('button', {
        name:
          kind === 'split' ? '生成调度执行单' : kind === 'merge' ? '确认合单并配载' : '确认配载',
        exact: true
      })
      .click()
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0].kind).toBe(kind)
    expect(strictChecks).toBe(0)
    await expect(page.getByRole('heading', { name: '配载已提交 · 风险提醒' })).toBeVisible()
    await expect(
      page.locator('.el-notification').getByText(/风险司机甲：有 2 张未完成运输任务/)
    ).toBeVisible()
    await expect(dialog).not.toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`${kind}-submitted.png`), fullPage: true })
  })
}
