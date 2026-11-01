import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

const features = [
  {
    page: 'accident-record',
    table: 'vehicle_accident_record',
    list: 'vms_list_vehicle_accidents_secure',
    remove: 'vms_delete_vehicle_accident_secure'
  },
  {
    page: 'routine-inspection',
    table: 'vehicle_routine_inspection_record',
    list: 'vms_list_vehicle_routine_inspections_secure',
    remove: 'vms_delete_vehicle_routine_inspections_secure'
  },
  {
    page: 'vehicle-inspection',
    table: 'vehicle_inspection',
    list: 'vms_list_vehicle_inspections_secure',
    remove: 'vms_delete_vehicle_inspections_secure'
  },
  {
    page: 'vehicle-insurance',
    table: 'vehicle_insurance',
    list: 'vms_list_vehicle_insurance_secure',
    remove: 'vms_delete_vehicle_insurance_secure'
  },
  { page: 'driver-blacklist', table: 'tms_driver_blacklist' },
  { page: 'electronic-contract', table: 'tms_electronic_contract' },
  { page: 'service-case', table: 'tms_service_case' },
  { page: 'transport-agreement', table: 'tms_transport_agreement' }
]

for (const feature of features) {
  const scenarios = [
    { entry: 'bulk', state: 'clear' },
    { entry: 'bulk', state: 'referenced' },
    { entry: 'bulk', state: 'failed' },
    ...(feature.remove ? [{ entry: 'single', state: 'clear' }] : []),
    ...(feature.page === 'accident-record'
      ? [
          { entry: 'single', state: 'concurrent' },
          { entry: 'bulk', state: 'zero' }
        ]
      : [])
  ]
  for (const scenario of scenarios) {
    test(`${feature.page} ${scenario.entry} ${scenario.state}`, async ({ page }, info) => {
      await prepareIsolatedSession(page)
      const ids = ['00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002']
      const events: string[] = []
      let removed = false
      const records = ids.map((id, i) => ({
        id,
        tenant_id: '11111111-1111-4111-a111-111111111111',
        plate_no: `测试车辆${i + 1}`,
        accident_time: '2026-10-30 09:00:00',
        routine_inspection_no: `LJ-TEST-${i + 1}`,
        inspection_time: '2026-10-30 09:00:00',
        driver_name: `测试司机${i + 1}`,
        contract_no: `HT-TEST-${i + 1}`,
        contract_name: `测试合同${i + 1}`,
        service_no: `FW-TEST-${i + 1}`,
        complaint_types: [],
        agreement_no: `XY-TEST-${i + 1}`,
        attachments: [],
        status: 'draft',
        create_time: '2026-10-30 09:00:00'
      }))
      await page.route('**/rest/v1/**', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.pathname.endsWith('/get_record_delete_dependency_details')) {
          events.push('inspect')
          const body = request.postDataJSON()
          expect(body.p_table).toBe(feature.table)
          expect(body.p_ids).toEqual(scenario.entry === 'single' ? ids.slice(0, 1) : ids)
          if (scenario.state === 'failed')
            return route.fulfill({ status: 503, json: { code: 'XX000', message: 'unavailable' } })
          return route.fulfill({
            json:
              scenario.state === 'referenced' || (scenario.state === 'concurrent' && removed)
                ? [
                    {
                      resource_id: ids[0],
                      source_table: 'vehicle_accident_record',
                      record_id: ids[1],
                      target_id: ids[1],
                      record_no: 'SG-REFERENCE-002',
                      record_status: 'completed',
                      created_at: '2026-10-30'
                    }
                  ]
                : []
          })
        }
        if (
          (feature.remove && url.pathname.endsWith('/' + feature.remove)) ||
          (url.pathname.endsWith('/' + feature.table) && request.method() === 'DELETE')
        ) {
          events.push('delete')
          removed = true
          if (scenario.state === 'concurrent')
            return route.fulfill({
              status: 409,
              json: { code: '23503', message: 'foreign key constraint' }
            })
          const count = scenario.state === 'zero' ? 0 : scenario.entry === 'single' ? 1 : 2
          return route.fulfill({
            json: feature.remove ? count : null,
            headers: {
              'content-range': `*/${count}`,
              'access-control-expose-headers': 'content-range'
            }
          })
        }
        if (
          (feature.list && url.pathname.endsWith('/' + feature.list)) ||
          (url.pathname.endsWith('/' + feature.table) && request.method() === 'GET')
        ) {
          return route.fulfill({
            json: feature.list ? { records, total: 2 } : records,
            headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' }
          })
        }
        return route.fulfill({ json: [] })
      })
      await page.goto(`/tests/e2e/fixtures/scrollbar-workspace.html?page=${feature.page}`)
      const rows = page.locator('.el-table__body-wrapper tr')
      await expect(rows).toHaveCount(2)
      if (scenario.entry === 'single') {
        await rows.first().getByRole('button', { name: '更多操作', exact: true }).click()
        await page.getByRole('menuitem', { name: '删除', exact: true }).click()
      } else {
        await page.locator('.el-table__header-wrapper .el-checkbox').click()
        await page.getByRole('button', { name: '批量删除', exact: true }).click()
      }
      if (['clear', 'concurrent', 'zero'].includes(scenario.state)) {
        const confirmation = page.locator('.el-message-box')
        await expect(confirmation).toBeVisible()
        expect(events).toEqual(['inspect'])
        await confirmation.getByRole('button', { name: /删除|确定/ }).click()
        await expect
          .poll(() => events)
          .toEqual(
            scenario.state === 'clear' ? ['inspect', 'delete'] : ['inspect', 'delete', 'inspect']
          )
        if (scenario.state === 'concurrent')
          await expect(page.getByText('SG-REFERENCE-002', { exact: true })).toBeVisible()
        if (scenario.state === 'zero')
          await expect(page.locator('.el-message--error')).toBeVisible()
      } else {
        await expect(
          page.getByText(scenario.state === 'referenced' ? 'SG-REFERENCE-002' : '删除检查未完成', {
            exact: true
          })
        ).toBeVisible()
        await expect(page.locator('.el-message-box')).not.toBeVisible()
        expect(events).toEqual(['inspect'])
      }
      if (scenario.state === 'referenced')
        await page.screenshot({ path: info.outputPath('delete-references.png') })
    })
  }
}

for (const state of ['clear', 'referenced', 'failed']) {
  test(`appointment persisted row ${state}`, async ({ page }) => {
    await prepareIsolatedSession(page)
    const id = '00000000-0000-4000-a000-000000000001'
    const events: string[] = []
    await page.route('**/rest/v1/**', async (route) => {
      const url = route.request().url()
      if (url.includes('tms_list_waybill_appointments_secure'))
        return route.fulfill({
          json: [
            {
              id,
              kind: 'pickup',
              anchor_waybill_id: '00000000-0000-4000-a000-000000000003',
              selected_waybill_ids: ['00000000-0000-4000-a000-000000000003'],
              driver_name: '测试司机',
              plate_no: '测试车牌',
              scheduled_at: '2026-10-30T01:00:00Z',
              status: 'confirming'
            }
          ]
        })
      if (url.includes('get_record_delete_dependency_details')) {
        events.push('inspect')
        expect(route.request().postDataJSON().p_table).toBe('tms_waybill_appointment')
        if (state === 'failed')
          return route.fulfill({ status: 503, json: { code: 'XX000', message: 'unavailable' } })
        return route.fulfill({
          json:
            state === 'referenced'
              ? [
                  {
                    resource_id: id,
                    source_table: 'vehicle_accident_record',
                    record_id: id,
                    target_id: id,
                    record_no: 'SG-REFERENCE-002',
                    record_status: 'completed',
                    created_at: '2026-10-30'
                  }
                ]
              : []
        })
      }
      if (url.includes('tms_delete_waybill_appointment_secure')) {
        events.push('delete')
        return route.fulfill({ json: null })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto('/tests/e2e/fixtures/scrollbar-workspace.html?page=appointment-delete')
    await page.getByRole('button', { name: '打开预约', exact: true }).click()
    await page.locator('.el-drawer').getByRole('button', { name: '删除', exact: true }).click()
    if (state === 'clear') {
      const confirmation = page.locator('.el-message-box')
      await expect(confirmation).toContainText('测试车牌')
      expect(events).toEqual(['inspect'])
      await confirmation.getByRole('button', { name: '删除', exact: true }).click()
      await expect.poll(() => events).toEqual(['inspect', 'delete'])
    } else {
      await expect(
        page.getByText(state === 'referenced' ? 'SG-REFERENCE-002' : '删除检查未完成', {
          exact: true
        })
      ).toBeVisible()
      expect(events).toEqual(['inspect'])
    }
  })
}
