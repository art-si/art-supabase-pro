import { test, expect, type Page } from '@playwright/test'
import { managementReports } from '../../modules/art-supabase-tms/src/views/components/management-reports/catalog'
import { mkdir } from 'node:fs/promises'

test.use({ storageState: { cookies: [], origins: [] } })
test.beforeEach(async ({ page }) => {
  // Setting dictMap does not mark its cache fresh; display cells still load this source.
  await page.route('**/rest/v1/sys_dictionary?**', async (route) => {
    if (
      new URL(route.request().url()).searchParams.get('dict_type_table.code') ===
      'eq.hrAttendanceStatus'
    ) {
      await route.fulfill({
        json: ['normal', 'late'].map((value, index) => ({
          id: `attendance-${value}`,
          type_id: 'attendance-status',
          code: value,
          value,
          label: index === 0 ? '正常' : '迟到',
          status: '1',
          sort: index,
          tag_type: index === 0 ? 'success' : 'warning',
          dict_type_table: { code: 'hrAttendanceStatus', name: '考勤状态' }
        }))
      })
      return
    }
    expect(new URL(route.request().url()).searchParams.get('dict_type_table.code')).toBe(
      'eq.tmsCustomerLevel'
    )
    await route.fulfill({
      json: [
        {
          id: 'report-customer-level',
          type_id: 'report-customer-level-type',
          code: 'key',
          label: '验收重点客户',
          value: 'key',
          status: '1',
          sort: 1,
          tag_type: 'primary',
          dict_type_table: { code: 'tmsCustomerLevel', name: '客户等级' }
        }
      ]
    })
  })
})
const fixture = '/tests/e2e/fixtures/tms-management-reports.html'

test('长口径说明有界滚动及排名分屏', async ({ page }, info) => {
  await page.route('**/rest/v1/rpc/tms_management_report', (route) => {
    const result = reportResult('customer-profit')
    return route.fulfill({
      json: {
        ...result,
        trend: Array.from({ length: 9 }, (_, index) => ({
          ...result.trend[0],
          label: `长名称客户验收对象${index + 1}`,
          revenue: 60000 - index * 5000
        }))
      }
    })
  })
  await page.goto(
    fixture +
      '?report=customer-profit&theme=' +
      (info.project.name.includes('dark') ? 'dark' : 'light')
  )
  await waitReady(page)
  const chart = page.locator('.management-report-chart')
  await expect(page.locator('.el-table__body tr')).toHaveCount(2)
  await expect(chart).toHaveCount(0)
  await page.getByRole('tab', { name: '图表分析', exact: true }).click()
  await expect(page.locator('.el-table')).toHaveCount(0)
  expect((await chart.boundingBox())!.height).toBeGreaterThan(250)
  await expect(chart.getByText(/当前 1–4 \/ 9 项/)).toBeVisible()
  await chart.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(chart.getByText(/当前 5–8 \/ 9 项/)).toBeVisible()
  await chart.getByRole('button', { name: '下一页', exact: true }).click()
  await expect(chart.getByText(/当前 9–9 \/ 9 项/)).toBeVisible()
  await expect(chart.getByRole('button', { name: '下一页', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '统计口径', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '统计口径', exact: true })
  await expect(dialog).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.y).toBeGreaterThanOrEqual(0)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeVisible()
  await page.screenshot({ path: '.artifacts/tms-reports/report-note-bounded.png' })
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.screenshot({ path: '.artifacts/tms-reports/report-ranking-paged.png' })
  await page.getByRole('textbox', { name: '关键词', exact: true }).fill('保留筛选条件')
  await page.getByRole('tab', { name: '表格明细', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '关键词', exact: true })).toHaveValue(
    '保留筛选条件'
  )
  await expect(page.locator('.el-table__body tr')).toHaveCount(2)
  await expect(chart).toHaveCount(0)
})
test('经营风险显示分级依据及未评级', async ({ page }, info) => {
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('business-risk')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, index) => ({
          ...row,
          risk_type: index === 0 ? '车辆事故' : '司机违章',
          risk_level: index === 0 ? '高' : null,
          risk_basis: index === 0 ? '默认金额分级' : '依据不足'
        }))
      }
    })
  })
  const theme = info.project.name.includes('dark') ? 'dark' : 'light'
  await page.goto(fixture + '?report=business-risk&theme=' + theme)
  await waitReady(page)
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect(page.getByRole('cell', { name: '默认金额分级', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '依据不足', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '未评级', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '高', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await mkdir('.artifacts/tms-reports', { recursive: true })
  await page.screenshot({ path: `.artifacts/tms-reports/risk-basis-${info.project.name}.png` })
})

test('调度计划登记与任务冲突', async ({ page }, info) => {
  let plan = {
    vehicleId: 'vehicle-1',
    waybillId: 'waybill-1' as string | null,
    waybillNo: 'YD-验收1' as string | null,
    expectedReturnAt: null as string | null,
    maintenanceAt: null as string | null,
    maintenanceNote: '',
    updatedAt: null as string | null
  }
  let conflict = true
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('vehicle-dispatch')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, i) => ({ ...row, vehicle_id: 'vehicle-' + (i + 1) }))
      }
    })
  })
  await page.route('**/rest/v1/rpc/tms_get_vehicle_dispatch_plan_secure', (route) =>
    route.fulfill({ json: plan })
  )
  await page.route('**/rest/v1/rpc/tms_save_vehicle_dispatch_plan_secure', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.p_vehicle_id).toBe('vehicle-1')
    expect(body.p_waybill_id).toBe(plan.waybillId)
    if (conflict) {
      conflict = false
      plan = { ...plan, waybillId: 'waybill-2', waybillNo: 'YD-验收2' }
      await route.fulfill({
        status: 409,
        json: { code: '40001', message: '车辆当前任务已变化，请重新加载后再保存' }
      })
    } else {
      expect(body.p_expected_return_at).toMatch(/^2026-10-26T/)
      plan = {
        ...plan,
        expectedReturnAt: body.p_expected_return_at,
        maintenanceAt: body.p_maintenance_at,
        maintenanceNote: body.p_maintenance_note,
        updatedAt: '2026-10-25T12:00:00+08:00'
      }
      await route.fulfill({ json: plan })
    }
  })
  const theme = info.project.name.includes('dark') ? 'dark' : 'light'
  await page.goto(fixture + '?report=vehicle-dispatch&theme=' + theme)
  await waitReady(page)
  await page.getByRole('button', { name: '维护调度计划', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: '车辆调度计划', exact: true })
  await expect(dialog.getByText('当前运单：YD-验收1', { exact: true })).toBeVisible()
  async function fillPlan() {
    await dialog.getByRole('combobox', { name: '预计回场', exact: true }).fill('2026-10-26 18:00')
    await dialog.getByRole('combobox', { name: '预计回场', exact: true }).press('Tab')
    await dialog
      .getByRole('combobox', { name: '预约维修时间', exact: true })
      .fill('2026-10-27 09:00')
    await dialog.getByRole('combobox', { name: '预约维修时间', exact: true }).press('Tab')
    await dialog
      .getByRole('textbox', { name: '维修计划事项', exact: true })
      .fill('预约检查制动系统，维修后登记实际费用。')
  }
  await fillPlan()
  await dialog.getByRole('button', { name: '保存计划', exact: true }).click()
  await expect(
    dialog.getByText('数据已被其他操作更新，请刷新后重试', { exact: true })
  ).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '维修计划事项', exact: true })).toHaveValue(
    '预约检查制动系统，维修后登记实际费用。'
  )
  await dialog.getByRole('button', { name: '放弃本次填写并重新加载', exact: true }).click()
  await expect(dialog.getByText('当前运单：YD-验收2', { exact: true })).toBeVisible()
  await fillPlan()
  await mkdir('.artifacts/tms-reports', { recursive: true })
  await page.screenshot({
    path: '.artifacts/tms-reports/dispatch-plan-' + info.project.name + '.png'
  })
  await dialog.getByRole('button', { name: '保存计划', exact: true }).click()
  await expect(dialog).toBeHidden()
})

test('回单跟进加载重试与保存冲突', async ({ page }, info) => {
  let followup: {
    orderId: string
    missingReason: string
    followupNote: string
    updatedAt: string
  } | null = null
  let failLoad = true
  let conflictOnce = true
  await page.route('**/rest/v1/rpc/tms_management_report', (route) =>
    route.fulfill({ json: reportResult('receipt-tracking') })
  )
  await page.route('**/rest/v1/rpc/tms_get_receipt_followup_secure', async (route) => {
    if (failLoad) {
      failLoad = false
      await route.fulfill({ status: 503, json: { message: 'temporary unavailable' } })
    } else await route.fulfill({ json: followup })
  })
  await page.route('**/rest/v1/rpc/tms_save_receipt_followup_secure', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.p_expected_updated_at).toBe(followup?.updatedAt ?? null)
    if (conflictOnce) {
      conflictOnce = false
      followup = {
        orderId: body.p_order_id,
        missingReason: '客户签章待补齐',
        followupNote: '运营主管复核',
        updatedAt: '2026-10-25T10:00:00+08:00'
      }
      await route.fulfill({
        status: 409,
        json: { code: '40001', message: '回单跟进已被修改，请重新加载后再保存' }
      })
      return
    }
    followup = {
      orderId: body.p_order_id,
      missingReason: body.p_missing_reason,
      followupNote: body.p_followup_note,
      updatedAt: '2026-10-25T10:01:00+08:00'
    }
    await route.fulfill({ json: followup })
  })
  const theme = info.project.name.includes('dark') ? 'dark' : 'light'
  await page.goto(fixture + '?report=receipt-tracking&theme=' + theme)
  await waitReady(page)
  await page.getByRole('button', { name: '登记回单跟进', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: '回单跟进', exact: true })
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await dialog.getByPlaceholder('请输入缺失原因', { exact: true }).fill('司机尚未交回纸质原件')
  await dialog.getByPlaceholder('请输入跟进措施', { exact: true }).fill('明日联系司机核对并回收')
  await dialog.getByRole('button', { name: '保存跟进', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.getByPlaceholder('请输入缺失原因', { exact: true })).toHaveValue(
    '司机尚未交回纸质原件'
  )
  await dialog.getByRole('button', { name: '放弃本次填写并重新加载', exact: true }).click()
  await expect(dialog.getByPlaceholder('请输入缺失原因', { exact: true })).toHaveValue(
    '客户签章待补齐'
  )
  await mkdir('.artifacts/tms-reports', { recursive: true })
  await page.screenshot({
    path: '.artifacts/tms-reports/receipt-followup-' + info.project.name + '.png'
  })
  await dialog.getByRole('button', { name: '保存跟进', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '登记回单跟进', exact: true }).first().click()
  await expect(dialog.getByPlaceholder('请输入跟进措施', { exact: true })).toHaveValue(
    '运营主管复核'
  )
})

test('客户经营复盘加载重试和保存', async ({ page }, info) => {
  let review: Record<string, string> | null = null
  let failLoad = true
  let conflictOnce = true
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    await route.fulfill({ json: reportResult('customer-profit') })
  })
  await page.route('**/rest/v1/rpc/tms_get_customer_operating_review_secure', async (route) => {
    if (failLoad) {
      failLoad = false
      await route.fulfill({ status: 503, json: { message: 'temporary unavailable' } })
    } else await route.fulfill({ json: review })
  })
  await page.route('**/rest/v1/rpc/tms_save_customer_operating_review_secure', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.p_customer_id).toBe('entity-1')
    expect(body.p_expected_updated_at).toBe(review?.updatedAt ?? null)
    if (conflictOnce) {
      conflictOnce = false
      review = {
        id: 'review-1',
        customerId: body.p_customer_id,
        periodStart: body.p_start,
        periodEnd: body.p_end,
        strategy: '其他操作员更新的策略',
        improvement: '其他操作员更新的措施',
        updatedAt: '2026-10-25T09:59:00+08:00'
      }
      await route.fulfill({
        status: 409,
        json: {
          code: '40001',
          message: '经营复盘已被其他人修改，请重新加载后再保存'
        }
      })
      return
    }
    review = {
      id: 'review-1',
      customerId: body.p_customer_id,
      periodStart: body.p_start,
      periodEnd: body.p_end,
      strategy: body.p_strategy,
      improvement: body.p_improvement,
      updatedAt: review ? '2026-10-25T10:01:00+08:00' : '2026-10-25T10:00:00+08:00'
    }
    await route.fulfill({ json: review })
  })
  const theme = info.project.name.includes('dark') ? 'dark' : 'light'
  await page.goto(fixture + '?report=customer-profit&theme=' + theme)
  await waitReady(page)
  await page.getByRole('button', { name: '经营复盘', exact: true }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await dialog.locator('textarea').nth(0).fill('保持重点合作，复核低毛利线路报价。')
  await dialog.locator('textarea').nth(1).fill('每周核对应收，月底复核执行结果。')
  await dialog.getByRole('button', { name: '保存复盘', exact: true }).click()
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.locator('textarea').nth(0)).toHaveValue('保持重点合作，复核低毛利线路报价。')
  await dialog.getByRole('button', { name: '放弃本次填写并重新加载', exact: true }).click()
  await expect(dialog.locator('textarea').nth(0)).toHaveValue('其他操作员更新的策略')
  await dialog.locator('textarea').nth(0).fill('保持重点合作，复核低毛利线路报价。')
  await dialog.locator('textarea').nth(1).fill('每周核对应收，月底复核执行结果。')
  await dialog.getByRole('button', { name: '保存复盘', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '经营复盘', exact: true }).first().click()
  await expect(dialog.locator('textarea').nth(1)).toHaveValue('每周核对应收，月底复核执行结果。')
  await dialog.locator('textarea').nth(1).fill('每周核对应收，由运营主管于月底复盘。')
  await mkdir('.artifacts/tms-reports', { recursive: true })
  await page.screenshot({ path: `.artifacts/tms-reports/customer-review-${info.project.name}.png` })
  await dialog.getByRole('button', { name: '保存复盘', exact: true }).click()
  await expect(dialog).toBeHidden()
})

test('客户账期范围及未约定状态', async ({ page }, info) => {
  let terms = ['45—60天（多种账期）', '部分未约定']
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('customer-profit')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, index) => ({
          ...row,
          payment_term_range: terms[index]
        }))
      }
    })
  })
  const theme = info.project.name.includes('dark') ? 'dark' : 'light'
  await page.goto(fixture + '?report=customer-profit&theme=' + theme)
  await waitReady(page)
  const headers = await page.locator('.el-table__header th').allTextContents()
  const index = headers.findIndex((text) => text.trim() === '期间应收约定账期')
  expect(index).toBeGreaterThanOrEqual(0)
  const rows = page.locator('.el-table__body tr')
  const cell = rows.first().getByRole('cell').nth(index)
  await cell.evaluate((element) => {
    element.closest('.el-scrollbar__wrap')!.scrollLeft = (element as HTMLElement).offsetLeft - 250
  })
  await expect(cell).toHaveText(terms[0])
  await expect(rows.nth(1).getByRole('cell').nth(index)).toHaveText(terms[1])
  await expect(cell).toBeInViewport()
  await mkdir('.artifacts/tms-reports', { recursive: true })
  await page.screenshot({ path: `.artifacts/tms-reports/customer-terms-${info.project.name}.png` })
  terms = ['45天', '无期间应收']
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(cell).toHaveText(terms[0])
  await expect(rows.nth(1).getByRole('cell').nth(index)).toHaveText(terms[1])
})

test('应收账期区分约定天数与未约定', async ({ page }, info) => {
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('receivables')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, index) => ({
          ...row,
          payment_term_days: index === 0 ? 45 : null
        }))
      }
    })
  })
  const theme = info.project.name.includes('dark') ? 'dark' : 'light'
  await page.goto(fixture + '?report=receivables&theme=' + theme)
  await waitReady(page)
  const headers = await page.locator('.el-table__header th').allTextContents()
  const index = headers.findIndex((text) => text.trim() === '约定账期（天）')
  expect(index).toBeGreaterThanOrEqual(0)
  const rows = page.locator('.el-table__body tr')
  const cell = rows.first().getByRole('cell').nth(index)
  await cell.evaluate((element) => {
    element.closest('.el-scrollbar__wrap')!.scrollLeft = (element as HTMLElement).offsetLeft - 250
  })
  await expect(cell).toHaveText('45')
  await expect(rows.nth(1).getByRole('cell').nth(index)).toHaveText('未约定')
  await expect(cell).toBeInViewport()
  await page.screenshot({ path: info.outputPath('receivable-payment-terms.png') })
})

test('应收催收登记与历史重试', async ({ page }, info) => {
  const records: Array<Record<string, unknown>> = []
  let failHistory = true
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('receivables')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, index) => ({
          ...row,
          statement_id: `collection-document-${index}`
        }))
      }
    })
  })
  await page.route('**/rest/v1/rpc/tms_add_receivable_collection_secure', async (route) => {
    const body = route.request().postDataJSON()
    expect(body.p_document_id).toBe('collection-document-0')
    records.push({
      id: 'collection-1',
      contactedAt: body.p_payload.contacted_at,
      method: body.p_payload.method,
      note: body.p_payload.note,
      nextFollowUp: body.p_payload.next_follow_up,
      actorName: '验收操作员'
    })
    await route.fulfill({ json: 'collection-1' })
  })
  await page.route('**/rest/v1/rpc/tms_list_receivable_collections_secure', async (route) => {
    if (failHistory) {
      failHistory = false
      await route.fulfill({ status: 503, json: { message: 'temporary unavailable' } })
    } else await route.fulfill({ json: records })
  })
  const theme = info.project.name.includes('dark') ? 'dark' : 'light'
  await page.goto(fixture + '?report=receivables&theme=' + theme)
  await waitReady(page)
  await page.getByRole('button', { name: '登记催收' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('填写实际渠道，如电话或现场沟通').fill('电话')
  await dialog.locator('textarea').fill('已核对余额，客户确认下周安排付款。')
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(records).toHaveLength(1)
  await page.getByRole('button', { name: '催收历史' }).first().click()
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByText('已核对余额，客户确认下周安排付款。', { exact: true })).toBeVisible()
  await expect(page.getByText('登记人：验收操作员')).toBeVisible()
  await mkdir('.artifacts/tms-reports', { recursive: true })
  await page.screenshot({
    path: `.artifacts/tms-reports/collection-history-${info.project.name}.png`
  })
})

test('应收默认风险分级与未评级状态在两页一致', async ({ page }, info) => {
  let grades: Array<string | null> = ['低', '中']
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const slug = route.request().postDataJSON().p_report
    const result = reportResult(slug)
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, index) => ({ ...row, risk_level: grades[index] }))
      }
    })
  })
  for (const slug of ['receivables', 'business-risk']) {
    grades = ['低', '中']
    const theme = info.project.name.includes('dark') ? 'dark' : 'light'
    await page.goto(fixture + '?report=' + slug + '&theme=' + theme)
    await waitReady(page)
    const headers = await page.locator('.el-table__header th').allTextContents()
    const index = headers.findIndex((text) => text.trim() === '风险等级')
    expect(index).toBeGreaterThanOrEqual(0)
    const rows = page.locator('.el-table__body tr')
    const cell = rows.first().getByRole('cell').nth(index)
    await cell.evaluate((element) => {
      element.closest('.el-scrollbar__wrap')!.scrollLeft = (element as HTMLElement).offsetLeft - 250
    })
    await expect(cell).toHaveText('低')
    await expect(rows.nth(1).getByRole('cell').nth(index)).toHaveText('中')
    grades = ['高', null]
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(cell).toHaveText('高')
    await expect(rows.nth(1).getByRole('cell').nth(index)).toHaveText('未评级')
    await expect(cell).toBeInViewport()
    await page.screenshot({ path: info.outputPath(slug + '-risk-grade.png') })
  }
})
test('司机考勤不可读取时不误报未登记', async ({ page }, info) => {
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('driver-operations')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, index) => ({
          ...row,
          attendance: index === 0 ? 'normal' : null
        }))
      }
    })
  })
  const theme = info.project.name.includes('dark') ? 'dark' : 'light'
  await page.goto(fixture + '?report=driver-operations&theme=' + theme)
  await waitReady(page)
  const headers = await page.locator('.el-table__header th').allTextContents()
  const index = headers.findIndex((text) => text.trim() === '出勤状态')
  expect(index).toBeGreaterThanOrEqual(0)
  const rows = page.locator('.el-table__body tr')
  const cell = rows.nth(1).getByRole('cell').nth(index)
  await cell.evaluate((element) => {
    element.closest('.el-scrollbar__wrap')!.scrollLeft = (element as HTMLElement).offsetLeft - 250
  })
  await expect(rows.first().getByRole('cell').nth(index)).toHaveText('正常')
  await expect(cell).toHaveText('待核实')
  await expect(cell).toBeInViewport()
  await page.screenshot({ path: info.outputPath('driver-attendance-access.png') })
})
test('人工异常：处理结果保留未知金额并确认结案', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  let status = 'pending'
  const id = '11111111-1111-4111-8111-111111111112'
  const calls: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('order-exceptions')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, index) =>
          index
            ? row
            : {
                ...row,
                exception_id: id,
                exception_source: 'manual',
                status_code: status,
                status: {
                  pending: '未处理',
                  in_progress: '处理中',
                  resolved: '已解决',
                  closed: '已结案'
                }[status]
              }
        )
      }
    })
  })
  await page.route('**/rest/v1/rpc/tms_transition_order_exception_secure', async (route) => {
    const body = route.request().postDataJSON()
    calls.push(body)
    expect(body.p_expected_status).toBe(status)
    status = { start: 'in_progress', resolve: 'resolved', close: 'closed' }[body.p_action] ?? status
    await route.fulfill({ json: id })
  })
  const historyTheme = testInfo.project.name.includes('dark') ? 'dark' : 'light'
  await page.goto(`${fixture}?report=order-exceptions&theme=${historyTheme}`)
  await expect(page.getByRole('textbox', { name: '关键词', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await waitReady(page)
  for (const action of ['开始处理', '登记结果', '确认结案']) {
    await page.getByRole('button', { name: action, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('textbox', { name: '处理说明' }).fill('验收：核实处理依据与结果')
    if (action === '登记结果') {
      await dialog.getByRole('spinbutton', { name: '货损金额' }).fill('100')
      await page.screenshot({ path: testInfo.outputPath('exception-resolution.png') })
    }
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect(dialog).toBeHidden()
  }
  expect(calls).toHaveLength(3)
  expect(calls[1]).toMatchObject({ p_id: id, p_damage_amount: 100, p_claim_amount: null })
  await expect(page.getByRole('button', { name: '开始处理', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '确认结案', exact: true })).toHaveCount(0)
  let historyAttempts = 0
  await page.route('**/rest/v1/rpc/tms_get_order_exception_history_secure', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ p_id: id })
    if (++historyAttempts === 1) {
      await route.fulfill({ status: 500, json: { message: 'temporary failure' } })
      return
    }
    await route.fulfill({
      json: ['create', 'start', 'resolve', 'close'].map((action, index) => ({
        action,
        status: ['pending', 'in_progress', 'resolved', 'closed'][index],
        at: `2026-10-24T1${index}:00:00Z`,
        actor_name: '验收跟进人',
        note: index === 0 ? null : `验收历史步骤 ${index}`,
        damage_amount: action === 'resolve' ? 100 : null,
        claim_amount: null
      }))
    })
  })
  await page.getByRole('button', { name: '处理历史', exact: true }).click()
  const history = page.getByRole('dialog')
  await expect(history.getByRole('button', { name: '重新加载' })).toBeVisible()
  await history.getByRole('button', { name: '重新加载' }).click()
  await expect(history.getByText('验收历史步骤 3')).toBeVisible()
  await expect(history.getByText('操作人：验收跟进人')).toHaveCount(4)
  await expect(history.getByText(/货损：100 元 · 理赔：待核算/)).toBeVisible()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('exception-history.png') })
  await page.keyboard.press('Escape')
  await expect(history).toBeHidden()
  let created: Record<string, unknown> | undefined
  await page.route('**/rest/v1/rpc/tms_get_order_detail_secure', async (route) => {
    await route.fulfill({
      json: { id: 'test-order', tenant_id: '11111111-1111-4111-8111-111111111111' }
    })
  })
  await page.route('**/rest/v1/sys_user?**', async (route) => {
    expect(new URL(route.request().url()).searchParams.get('tenant_id')).toBe(
      'eq.11111111-1111-4111-8111-111111111111'
    )
    await route.fulfill({
      json: [
        {
          id: '11111111-1111-4111-8111-111111111114',
          user_name: '验收跟进人',
          user_email: 'qa@example.test'
        }
      ],
      headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  await page.route('**/rest/v1/rpc/tms_create_order_exception_secure', async (route) => {
    created = route.request().postDataJSON()
    await route.fulfill({ json: '11111111-1111-4111-8111-111111111113' })
  })
  await page
    .locator('.el-table__body')
    .getByRole('button', { name: '登记异常', exact: true })
    .click()
  const createDialog = page.getByRole('dialog')
  await createDialog.getByRole('combobox', { name: '责任 / 跟进人' }).click()
  await page.getByRole('option', { name: '验收跟进人' }).click()
  await createDialog.getByRole('textbox', { name: '异常描述' }).fill('验收：核实到货延误，登记跟进')
  await createDialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(createDialog).toBeHidden()
  expect(created).toMatchObject({
    p_payload: {
      exception_type: 'delay',
      stage: 'transit',
      estimated_loss: null,
      responsible_user_id: '11111111-1111-4111-8111-111111111114'
    }
  })
  await page.route('**/rest/v1/rpc/tms_list_orders_secure', async (route) => {
    expect(route.request().postDataJSON().p_scope).toBe('order_list')
    await route.fulfill({
      json: {
        records: [
          {
            id: '11111111-1111-4111-8111-111111111115',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            order_no: 'YD-主动登记验收',
            shipping_contact_name: '验收发货人',
            receiving_contact_name: '验收收货人'
          }
        ],
        total: 1
      }
    })
  })
  await page.getByRole('button', { name: '登记异常', exact: true }).first().click()
  const picker = page.getByRole('dialog', { name: '选择异常订单' })
  await expect(picker.getByText('YD-主动登记验收', { exact: true })).toBeVisible()
  await picker.getByText('YD-主动登记验收', { exact: true }).click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  const registration = page.getByRole('dialog', { name: '登记运输异常' })
  await expect(registration).toBeVisible()
  await registration.getByRole('textbox', { name: '异常描述' }).fill('验收：主动选单登记异常')
  await page.screenshot({ path: testInfo.outputPath('exception-create-owner.png') })
  await registration.getByRole('button', { name: '确定', exact: true }).click()
  await expect(registration).toBeHidden()
  expect(created).toMatchObject({
    p_order_id: '11111111-1111-4111-8111-111111111115',
    p_payload: { responsible_user_id: null }
  })
})
test('成本去重金额与待核对分类状态', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('vehicle-profit')
    await route.fulfill({
      json: {
        ...result,
        summary: {
          count: 2,
          revenue: 20000,
          cost: 18800,
          profit: 1200,
          reconciled_cost: null,
          reconciled_profit: null,
          reconciliation_pending: 1
        },
        trend: result.trend.map((point, i) => ({
          ...point,
          revenue: i === 0 ? 12000 : 8000,
          cost: i === 0 ? 9100 : 9700,
          profit: i === 0 ? 2900 : -1700,
          reconciled_cost: i === 0 ? 23130 : null
        })),
        records: result.records.map((row, i) => ({
          ...row,
          revenue: i === 0 ? 12000 : 8000,
          cost: i === 0 ? 9100 : 9700,
          profit: i === 0 ? 2900 : -1700,
          reconciled_cost: i === 0 ? 23130 : null,
          reconciled_profit: i === 0 ? -11130 : null,
          allocated_insurance: i === 0 ? 330 : 660,
          allocated_payroll: i === 0 ? 9200 : 10300,
          allocated_depreciation: i === 0 ? 4500 : 9000,
          reconciliation_status: i === 0 ? '已按分类去重' : '待核对费用分类'
        }))
      }
    })
  })
  await page.goto(`${fixture}?report=vehicle-profit&start=2026-09-01&end=2026-09-30`)
  await waitReady(page)
  await expect(page.getByText('1 项缺核算依据', { exact: true })).toBeVisible()
  await expect(page.getByText('核算毛利', { exact: true })).toBeVisible()
  await expect(page.getByText('已归集毛利', { exact: true })).toHaveCount(0)
  const headers = await page.getByRole('columnheader').allTextContents()
  const index = headers.findIndex((value) => value.includes('去重后核算成本'))
  const cell = page.locator('.el-table__body tr').first().getByRole('cell').nth(index)
  await cell.evaluate((element) => {
    const scroll = element
      .closest('.el-table')
      ?.querySelector('.el-table__body-wrapper .el-scrollbar__wrap')
    if (scroll) scroll.scrollLeft = (element as HTMLElement).offsetLeft - 250
  })
  await expect(cell).toHaveText('23,130')
  await expect(cell).toBeInViewport()
  await expect(page.getByRole('cell', { name: '-11,130', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '待核对费用分类', exact: true })).toBeInViewport()
  await expect(page.locator('.el-table__body tr').nth(1).getByRole('cell').nth(index)).toHaveText(
    '待核算'
  )
  await page.screenshot({ path: testInfo.outputPath('cost-reconciliation.png') })
})
test('单车已入账折旧与月份展示', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('vehicle-profit')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, i) => ({
          ...row,
          depreciation_posted: i === 0 ? 4500 : null,
          depreciation_months: i === 0 ? '2026-09' : null
        }))
      }
    })
  })
  await page.goto(`${fixture}?report=vehicle-profit&start=2026-09-01&end=2026-09-30`)
  await waitReady(page)
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  const rows = page.locator('.el-table__body tr')
  await expect(rows.first().getByRole('cell').nth(-2)).toHaveText('4,500')
  await expect(rows.first().getByRole('cell').last()).toHaveText('2026-09')
  await expect(rows.nth(1).getByRole('cell').nth(-2)).toHaveText('待核算')
  await page.screenshot({ path: testInfo.outputPath('vehicle-depreciation.png') })
})
test('应收周转天数：财务口径数值与缺失状态', async ({ page }) => {
  test.setTimeout(120_000)
  let missing = false
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('operations-kpi', '')
    const records = kpiSamples.map((row) =>
      row.code === 'turnover' && !missing
        ? { ...row, actual: 5.18, completion: 868.73, warning: '达标' }
        : row
    )
    await route.fulfill({
      json: {
        ...result,
        records,
        summary: {
          count: 6,
          available: missing ? 5 : 6,
          achieved: missing ? 1 : 2,
          pending: missing ? 1 : 0
        }
      }
    })
  })
  await page.goto(`${fixture}?report=operations-kpi`)
  await waitReady(page, 6)
  const row = page.getByRole('row').filter({ hasText: '应收周转天数' })
  await expect(row).toContainText('5.18天')
  await expect(row).toContainText('达标')
  missing = true
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(row).toContainText('待核算')
  await expect(row).not.toContainText('5.18天')
})
const samples = [1, 2].map((i) => ({
  _key: `report-fixture-${i}`,
  group_key: `entity-${i}`,
  order_id: `order-${i}`,
  label: `测A验收00${i}`,
  count: 4,
  undispatched: 0,
  revenue: i === 1 ? 48000 : 32000,
  cost: i === 1 ? 36000 : 38000,
  reconciled_cost: i === 1 ? 41000 : 43000,
  reconciled_profit: i === 1 ? 7000 : -11000,
  fuel_cost: i === 1 ? 1000 : 1200,
  toll_cost: i === 1 ? 300 : 600,
  profit: i === 1 ? 12000 : -6000,
  margin: i === 1 ? 25 : -18.75,
  completed: 3,
  receipt: i === 1 ? 2 : 1,
  late: 1,
  order_no: `DD-验收0${i}`,
  customer: `报表验收客户${i}`,
  customer_level: i === 1 ? 'key' : null,
  receivable_currency: 'CNY',
  receivable_balance: i === 1 ? 450 : 900,
  route: `上海 → ${i === 1 ? '北京' : '广州'}`,
  plate: `测A验收00${i}`,
  driver: `报表验收司机${i}`,
  status: i === 1 ? '运输中' : '部分签收',
  planned: '2026-10-23 08:00',
  arrived: null,
  receipt_status: i === 1 ? '已上传' : '待回收',
  statement: `DZ-验收0${i}`,
  period: '2026-10-22',
  amount: i === 1 ? 12000 : 8000,
  currency: 'CNY',
  total_amount: i === 1 ? 20000 : 15000,
  invoiced_amount: i === 1 ? 20000 : 15000,
  received_amount: i === 1 ? 8000 : 6000,
  other_applied_amount: i === 1 ? 0 : 1000,
  overdue_amount: i === 1 ? 12000 : 8000,
  due_date: '2026-10-22',
  payment_term: '月结 30 天',
  document_type: '财务应收',
  waybill_no: `YD-验收0${i}`,
  days: 1,
  description: '已超过计划到达时间，尚未完成签收',
  risk_type: i === 1 ? '车辆事故' : '司机违章',
  risk_amount: i === 1 ? 1500 : 200,
  occurred: '2026-10-23 08:00',
  vehicle_no: '验收车辆' + i,
  vehicle_type: '厢式货车',
  capacity_tons: 20,
  capacity_volume: 40,
  orders: 'DD-验收0' + i,
  inspection_due: '2027-03-01',
  insurance_due: '2027-04-01',
  origin: '上海',
  destination: i === 1 ? '北京' : '广州',
  created: '2026-10-23 01:00',
  weight_tons: 10,
  volume: 20,
  exception_flag: '有异常',
  exception_type: '延误',
  stage: '到货',
  receipt_type: '电子回单',
  receipt_due: '2026-10-20 08:00',
  collected: i === 1 ? '2026-10-15 08:00' : '2026-10-22 08:00',
  receipt_timeliness: i === 1 ? '及时回收' : '逾期回收',
  archived: i === 1 ? '已上传附件' : '未归档',
  pickups: 3,
  accident: 0,
  driver_no: '验收司机' + i,
  attendance: i === 1 ? 'normal' : 'late',
  on_time_count: 3,
  on_time_rate: 75,
  exception_count: 1,
  exception_rate: 25,
  rating: '待配置评分规则',
  settlement_advice: '待业务审核'
}))
const kpiSamples = [
  {
    code: 'loading',
    label: '整车装载率',
    target: '≥85%',
    actual: 50,
    unit: '%',
    completion: 58.82,
    warning: '未达标',
    note: '按运单重量 / 额定载重'
  },
  {
    code: 'empty',
    label: '空驶率',
    target: '≤10%',
    actual: 15,
    unit: '%',
    completion: 66.67,
    warning: '预警',
    note: '回场空驶里程合计 / 总里程合计；缺记录待核算'
  },
  {
    code: 'punctual',
    label: '到货准点率',
    target: '≥98%',
    actual: 100,
    unit: '%',
    completion: 102.04,
    warning: '达标',
    note: '已到货且计划完整订单'
  },
  {
    code: 'damage',
    label: '货损率',
    target: '≤0.1%',
    actual: 0.375,
    unit: '%',
    completion: 26.67,
    warning: '未达标',
    note: '已审核货损赔付 / 同批订单营收'
  },
  {
    code: 'receipt',
    label: '回单及时率',
    target: '≥95%',
    actual: 50,
    unit: '%',
    completion: 52.63,
    warning: '未达标',
    note: '签收后 7 天内回收'
  },
  {
    code: 'turnover',
    label: '应收周转天数',
    target: '≤45天',
    actual: null,
    unit: '天',
    completion: null,
    warning: '待核算',
    note: '缺少期初期末余额'
  }
].map((row, i) => ({ ...row, _key: 'kpi-' + i }))
function reportRows(slug: string) {
  const kind = (
    {
      'monthly-overview': 'month',
      'customer-profit': 'customer',
      'driver-productivity': 'driver',
      'driver-operations': 'driverops',
      'order-profit': 'order',
      'route-profit': 'route',
      'carrier-performance': 'carrier',
      'operations-kpi': 'kpi'
    } as Record<string, string>
  )[slug]
  return samples.map((row, i) => ({
    ...row,
    ...(slug === 'receipt-tracking'
      ? { receipt_status: '已回收', receipt: 1, completed: 1, late: 0 }
      : {}),
    ...(slug === 'business-risk'
      ? {
          order_id: null,
          order_no: null,
          customer: null,
          status: i === 0 ? '未处理' : '已处理',
          description: i === 0 ? '验收事故：公司承担金额待复核' : '验收违章：已登记罚款并处理'
        }
      : {}),
    label:
      kind === 'month'
        ? `2026-${i === 0 ? '09' : '10'}`
        : kind === 'customer'
          ? row.customer
          : kind === 'driver' || kind === 'driverops'
            ? row.driver
            : kind === 'order'
              ? row.order_no
              : kind === 'route'
                ? row.route
                : kind === 'carrier'
                  ? `报表验收运力${i + 1}`
                  : kind === 'kpi'
                    ? `2026-10-${22 + i}`
                    : row.plate
  }))
}
function reportResult(slug: string, keyword = '') {
  if (slug === 'operations-kpi')
    return {
      records: kpiSamples,
      total: 6,
      summary: { count: 6, available: 5, achieved: 1, pending: 1 },
      trend: []
    }
  const all = reportRows(slug)
  const rows = keyword ? all.filter((row) => JSON.stringify(row).includes(keyword)) : all
  return {
    records: rows,
    total: rows.length,
    summary: {
      count: rows.length,
      unregistered: slug === 'order-exceptions' ? rows.length : 0,
      open_work_orders: 0,
      closed_work_orders: 0,
      orders: rows.length * 4,
      completed: slug === 'receipt-tracking' ? rows.length : rows.length * 3,
      receipt: rows.length,
      late: slug === 'receipt-tracking' ? 0 : rows.length,
      oldest_days: 1,
      currency: 'CNY',
      currency_count: 1,
      overdue_amount: rows.reduce((sum, row) => sum + row.overdue_amount, 0),
      in_transit: 1,
      dispatch_ready: 1,
      repair: 0,
      amount: rows.reduce((sum, row) => sum + row.amount, 0),
      revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      cost: rows.reduce((sum, row) => sum + row.cost, 0),
      reconciled_cost: rows.reduce((sum, row) => sum + row.reconciled_cost, 0),
      reconciled_profit: rows.reduce((sum, row) => sum + row.reconciled_profit, 0),
      reconciliation_pending: 0,
      profit: rows.reduce((sum, row) => sum + row.profit, 0)
    },
    trend: rows.map((row) => ({
      label: row.label,
      revenue: row.revenue,
      cost: row.cost,
      reconciled_cost: row.reconciled_cost,
      count: row.count,
      completed: row.completed
    }))
  }
}
async function waitReady(page: Page, count = 2) {
  await expect(page.getByRole('textbox', { name: '关键词', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  await expect(page.locator('.el-table__body tr')).toHaveCount(count)
}

test('预算对比：读取失败可重试且资金余额不累计', async ({ page }) => {
  let failPlans = true
  await page.route('**/rest/v1/rpc/tms_get_monthly_plans_secure', async (route) => {
    if (failPlans) {
      await route.fulfill({ status: 500, json: { message: 'test failure' } })
      return
    }
    await route.fulfill({
      json: {
        metrics: ['receivable', 'overdue'].map((code, index) => ({
          code,
          label: index ? '逾期应收金额' : '应收账款余额',
          category: '资金指标',
          unit: '元',
          lower_is_better: true,
          minimum: 0,
          maximum: null,
          sort: index + 1
        })),
        records: []
      }
    })
  })
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const body = route.request().postDataJSON()
    const data = reportResult(
      body.p_report === 'monthly-operations' ? 'operations-kpi' : 'monthly-overview'
    )
    await route.fulfill({
      json: {
        ...data,
        summary: {
          ...data.summary,
          receivable: 1350,
          overdue: 450,
          receivable_basis: '截至统计日余额，不按月份累加'
        }
      }
    })
  })
  await page.goto(`${fixture}?report=monthly-overview&start=2026-10-01&end=2026-10-23`)
  await waitReady(page)
  await page.getByRole('button', { name: '预算执行对比', exact: true }).click()
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeVisible()
  failPlans = false
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  const balance = page.getByRole('row').filter({ hasText: '应收账款余额' })
  await expect(balance).toBeVisible()
  await expect(balance.getByText('1,350', { exact: true })).toHaveCount(2)
  const overdue = page.getByRole('row').filter({ hasText: '逾期应收金额' })
  await expect(overdue.getByText('450', { exact: true })).toHaveCount(2)
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toHaveCount(0)
  const dialog = page.locator('.el-dialog').filter({ hasText: '预算执行对比' })
  const bounds = await dialog.boundingBox()
  const viewport = page.viewportSize()
  expect(bounds).not.toBeNull()
  expect(viewport).not.toBeNull()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width)
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeInViewport()
})

test('月度总览：年累计独立查询且失败不保留旧金额', async ({ page }) => {
  const requests: { p_start: string; p_end: string; p_limit: number; p_keyword: string | null }[] =
    []
  let failYear = false
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const body = route.request().postDataJSON()
    requests.push(body)
    const yearRequest = body.p_limit === 1
    if (yearRequest && failYear) {
      await route.fulfill({ status: 500, json: { message: 'test failure' } })
      return
    }
    const data = reportResult('monthly-overview')
    await route.fulfill({
      json: yearRequest
        ? {
            ...data,
            summary: {
              ...data.summary,
              revenue: 123456,
              cost: null,
              profit: null,
              reconciled_cost: null,
              reconciled_profit: null
            }
          }
        : data
    })
  })
  await page.goto(fixture + '?report=monthly-overview&start=2025-12-01&end=2026-02-28&keyword=验收')
  await waitReady(page)
  await expect(page.getByText('本年累计 123,456 元', { exact: true })).toBeVisible()
  await expect(page.getByText('本年累计 待核算', { exact: true })).toHaveCount(2)
  const year = requests.find((request) => request.p_limit === 1)!
  const period = requests.find((request) => request.p_limit !== 1)!
  expect(year.p_start).toBe(`${period.p_end.slice(0, 4)}-01-01`)
  expect(year.p_end).toBe(period.p_end)
  expect(year.p_keyword).toBe(period.p_keyword)
  expect(year.p_start).toBe('2026-01-01')
  expect(period.p_start).toBe('2025-12-01')
  expect(year.p_keyword).toBe('验收')
  await page.screenshot({ path: '.artifacts/tms-reports/pages/monthly-ytd.png' })
  failYear = true
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
  await expect(page.getByText('本年累计 123,456 元', { exact: true })).toHaveCount(0)
})
for (const report of managementReports) {
  test(report.title + '：两条数据、筛选和视觉验收', async ({ page }, info) => {
    // Each case covers two themes and four focus-mode transitions; allow Vite's
    // initial module compilation without relaxing subsequent interaction checks.
    test.setTimeout(120_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
      const body = route.request().postDataJSON()
      expect(body.p_report).toBe(report.slug)
      const result = reportResult(body.p_report, body.p_keyword ?? '')
      if (report.slug === 'vehicle-dispatch') {
        result.records = result.records.map((row, index) => ({
          ...row,
          location: index === 0 ? '上海市浦东新区物流园区一号装卸站' : null,
          location_reported_at: index === 0 ? '2026-10-25 09:30' : null
        }))
      }
      await route.fulfill({ json: result })
    })
    await mkdir('.artifacts/tms-reports/pages', { recursive: true })
    for (const theme of ['light', 'dark']) {
      const mobile = info.project.name === 'mobile-390'
      await page.setViewportSize({
        width: mobile ? 390 : theme === 'light' ? 1440 : 1024,
        height: mobile ? 844 : 900
      })
      const screenshotName = `${report.slug}-${theme}${mobile ? '-mobile' : ''}`
      await page.goto(
        `${fixture}?report=${report.slug}&theme=${theme}&box=${theme === 'light' ? 'border-mode' : 'shadow-mode'}`
      )
      await expect(page.getByRole('heading', { name: report.title, exact: true })).toBeVisible({
        timeout: 60_000
      })
      await waitReady(page, report.slug === 'operations-kpi' ? 6 : 2)
      const dateFilter = page.getByRole('combobox', { name: '统计日期', exact: true })
      if (report.slug === 'vehicle-dispatch') {
        await expect(dateFilter).toHaveCount(0)
        await expect(page.getByText('最近上报位置', { exact: true })).toBeVisible()
        await expect(page.getByText('2026-10-25 09:30', { exact: true })).toBeVisible()
      } else {
        await expect(dateFilter).toBeVisible()
      }
      if (report.slug === 'receipt-tracking') {
        await expect(page.getByText('及时回收', { exact: true })).toHaveCount(1)
        await expect(page.getByText('逾期回收', { exact: true })).toHaveCount(1)
      }
      if (report.slug === 'driver-operations') {
        await expect(page.getByText('正常', { exact: true })).toBeVisible()
        await expect(page.getByText('迟到', { exact: true })).toBeVisible()
      }
      if (report.slug === 'customer-profit') {
        await expect(page.getByText('验收重点客户', { exact: true })).toBeVisible()
        await expect(page.getByText('未维护', { exact: true })).toBeVisible()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
      await page.screenshot({
        path: `.artifacts/tms-reports/pages/${screenshotName}.png`,
        fullPage: true
      })
      const chartTab = page.getByRole('tab', { name: '图表分析', exact: true })
      if (await chartTab.count()) {
        await chartTab.click()
        await expect(page.locator('.el-table')).toHaveCount(0)
        await expect(page.getByRole('textbox', { name: '关键词', exact: true })).toBeVisible()
        const chartBounds = await page.locator('.management-report-chart').boundingBox()
        expect(chartBounds?.height).toBeGreaterThan(250)
        await page.screenshot({
          path: `.artifacts/tms-reports/pages/${screenshotName}-chart.png`
        })
        await page.getByRole('tab', { name: '表格明细', exact: true }).click()
        await waitReady(page, report.slug === 'operations-kpi' ? 6 : 2)
      }
      const focus = page.getByRole('switch', { name: '专注模式' })
      await page.locator('.el-switch').filter({ has: focus }).click()
      await expect(page.getByRole('heading', { name: report.title, exact: true })).not.toBeVisible()
      await expect(page.locator('.management-report-chart')).not.toBeVisible()
      await expect(page.getByRole('textbox', { name: '关键词', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '查询', exact: true })).toBeVisible()
      await expect(page.getByRole('combobox', { name: '每页显示条数' })).toBeVisible()
      const focusedBody = await page.locator('.el-table__body-wrapper').boundingBox()
      // On phones the query and wrapped actions share 844px with the table.
      // Preserve room for two readable rows and keep pagination reachable.
      expect(focusedBody?.height).toBeGreaterThan(mobile ? 120 : 400)
      if (mobile) {
        await expect(page.getByRole('combobox', { name: '每页显示条数' })).toBeInViewport()
        await expect(page.getByRole('button', { name: '退出专注模式' })).toBeInViewport()
      }
      await page.screenshot({
        path: `.artifacts/tms-reports/pages/${screenshotName}-focus.png`
      })
      await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
      await expect(page.getByRole('heading', { name: report.title, exact: true })).toBeVisible()
      await page.locator('.el-switch').filter({ has: focus }).click()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('heading', { name: report.title, exact: true })).toBeVisible()
      await expect(page.getByRole('textbox', { name: '关键词', exact: true })).toBeVisible()
    }
    if (report.slug === 'operations-kpi') {
      await expect(
        page.getByRole('row').filter({ hasText: '空驶率' }).locator('.el-tag--warning')
      ).toHaveText('预警')
      await expect(page.getByText('≥85%', { exact: true })).toBeVisible()
      await expect(page.getByRole('row').filter({ hasText: '货损率' })).toContainText('0.375%')
      await expect(page.getByRole('row').filter({ hasText: '货损率' })).toContainText('未达标')
      await expect(page.getByText('待核算', { exact: true }).first()).toBeVisible()
      expect(errors).toEqual([])
      return
    }
    await page.getByRole('textbox', { name: '关键词', exact: true }).fill('验收001')
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.locator('.el-table__body tr')).toHaveCount(1)
    await page.getByRole('button', { name: '重置', exact: true }).click()
    await waitReady(page)
    expect(errors).toEqual([])
  })
}
test('经营风险货损金额、审核状态及未知金额', async ({ page }) => {
  test.setTimeout(120_000)
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const response = reportResult('business-risk')
    await route.fulfill({
      json: {
        ...response,
        records: response.records.map((row, i) => ({
          ...row,
          risk_type: '货损理赔',
          exception_id: `货损理赔:damage-cost-${i + 1}`,
          order_id: `damage-order-${i + 1}`,
          order_no: `DAMAGE-ORDER-${i + 1}`,
          risk_amount: i === 0 ? 100 : null,
          currency: 'CNY',
          status: '费用已审核',
          occurred: '2026-09-20',
          description: '已审核货损赔付费用；审核不代表已支付或理赔结案'
        }))
      }
    })
  })
  await page.setViewportSize({ width: 1920, height: 900 })
  await page.goto(`${fixture}?report=business-risk`)
  await waitReady(page)
  const rows = page.locator('.el-table__body tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('100')
  await expect(rows.nth(1)).toContainText('待核算')
  await expect(page.getByText('费用已审核', { exact: true })).toHaveCount(2)
  await expect(rows.getByText('业务记录', { exact: true })).toHaveCount(2)
  await expect(rows.getByText('系统提示', { exact: true })).toHaveCount(0)
  await expect(page.getByText('已结案', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'DAMAGE-ORDER-1', exact: true })).toBeVisible()
  await page.screenshot({ path: '.artifacts/tms-reports/pages/damage-risk.png', fullPage: true })
  await page.getByRole('link', { name: 'DAMAGE-ORDER-1', exact: true }).click()
  await expect(page.getByRole('heading', { name: '验收订单详情', exact: true })).toBeVisible()
})

test('经营风险逾期金额与币种列示', async ({ page }) => {
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const response = reportResult('business-risk')
    await route.fulfill({
      json: {
        ...response,
        records: response.records.map((row, i) => ({
          ...row,
          risk_type: '应收逾期',
          exception_id: `应收逾期:receivable-${i + 1}`,
          plate: null,
          driver: null,
          customer: `运输应收验收客户${i + 1}`,
          risk_amount: i === 0 ? 450 : 900,
          currency: i === 0 ? 'CNY' : 'USD',
          status: '逾期未结',
          occurred: '2026-10-22',
          description: `应收单 TEST-AR-${i + 1}；到期日 2026-10-22；逾期 1 天`
        }))
      }
    })
  })
  await page.setViewportSize({ width: 1920, height: 900 })
  await page.goto(`${fixture}?report=business-risk`)
  await waitReady(page)
  await expect(page.getByText('CNY', { exact: true })).toBeVisible()
  await expect(page.getByText('USD', { exact: true })).toBeVisible()
  await expect(page.getByText('逾期未结', { exact: true })).toHaveCount(2)
  await expect(page.locator('.el-table__body').getByText('业务记录', { exact: true })).toHaveCount(
    2
  )
  await expect(page.getByText('450', { exact: true })).toBeVisible()
  await expect(page.getByText('900', { exact: true })).toBeVisible()
  await page.screenshot({
    path: '.artifacts/tms-reports/pages/receivable-risk.png',
    fullPage: true
  })
})
test('月度 → 客户 → 订单 → 车辆穿透及筛选保留', async ({ page }) => {
  const requests: Array<{
    p_report: string
    p_keyword: string | null
    p_start: string
    p_end: string
  }> = []
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const body = route.request().postDataJSON()
    requests.push(body)
    await route.fulfill({ json: reportResult(body.p_report, body.p_keyword ?? '') })
  })
  await page.goto(fixture)
  await waitReady(page)
  await page.getByRole('textbox', { name: '关键词', exact: true }).fill('尚未查询的关键词')
  await page.getByRole('link', { name: '2026-10', exact: true }).click()
  await expect(page.getByRole('heading', { name: '客户毛利分析', exact: true })).toBeVisible()
  await waitReady(page)
  expect(requests.at(-1)?.p_start).toBe('2026-10-01')
  expect(requests.at(-1)?.p_keyword).toBeNull()
  await page.getByPlaceholder('开始日期', { exact: true }).fill('2026-10-10')
  await page.getByPlaceholder('开始日期', { exact: true }).press('Tab')
  await expect(page.getByPlaceholder('开始日期', { exact: true })).toHaveValue('2026-10-10')
  await page.getByPlaceholder('开始日期', { exact: true }).press('Escape')
  await page.getByRole('link', { name: '报表验收客户1', exact: true }).click()
  await expect(page.getByRole('heading', { name: '订单毛利分析', exact: true })).toBeVisible()
  await expect(page.locator('.el-table__body tr')).toHaveCount(1)
  expect(requests.at(-1)?.p_keyword).toBe('报表验收客户1')
  expect(requests.at(-1)?.p_start).toBe('2026-10-01')
  await page.getByRole('link', { name: '测A验收001', exact: true }).click()
  await expect(page.getByRole('heading', { name: '单车盈亏分析', exact: true })).toBeVisible()
  await expect(page.locator('.el-table__body tr')).toHaveCount(1)
  expect(requests.at(-1)?.p_keyword).toBe('测A验收001')
})
test('缓存报表切换仅请求当前页面并保留下钻条件', async ({ page }) => {
  const requests: string[] = []
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const body = route.request().postDataJSON()
    requests.push(body.p_report)
    await route.fulfill({ json: reportResult(body.p_report, body.p_keyword ?? '') })
  })
  await page.goto(`${fixture}?keepAlive&report=vehicle-profit&start=2026-09-01&end=2026-09-30`)
  await waitReady(page)
  requests.length = 0
  await page.getByRole('link', { name: '测A验收001', exact: true }).click()
  await expect(page.getByRole('heading', { name: '订单毛利分析', exact: true })).toBeVisible()
  await waitReady(page, 1)
  expect(requests.length).toBeGreaterThan(0)
  expect(requests.every((report) => report === 'order-profit')).toBe(true)
  requests.length = 0
  await page.getByRole('link', { name: '报表验收司机1', exact: true }).click()
  await expect(page.getByRole('heading', { name: '司机投产出分析', exact: true })).toBeVisible()
  await waitReady(page, 1)
  expect(requests.length).toBeGreaterThan(0)
  expect(requests.every((report) => report === 'driver-productivity')).toBe(true)
  await expect(page.getByPlaceholder('开始日期', { exact: true })).toHaveValue('2026-09-01')
  await expect(page.getByRole('textbox', { name: '关键词', exact: true })).toHaveValue(
    '报表验收司机1'
  )
})

test('空态、延迟加载、失败重试、专注模式', async ({ page }) => {
  let state = 'loaded'
  let unblock: (() => void) | undefined
  let loadingGate = Promise.resolve()
  let waitingRequests = 0
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    if (state === 'loading') {
      waitingRequests++
      await loadingGate
    }
    if (state === 'error') return route.fulfill({ status: 500, json: { message: 'test failure' } })
    const data = reportResult('monthly-overview')
    if (state === 'empty') Object.assign(data, { records: [], total: 0, trend: [] })
    await route.fulfill({ json: data })
  })
  await page.goto(fixture)
  await waitReady(page)
  const focus = page.getByRole('switch', { name: '专注模式' })
  await page.locator('.el-switch').filter({ has: focus }).click()
  await expect(
    page.getByRole('heading', { name: '月度经营总览看板', exact: true })
  ).not.toBeVisible()
  await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
  await expect(page.getByRole('heading', { name: '月度经营总览看板', exact: true })).toBeVisible()
  await page.locator('.el-switch').filter({ has: focus }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('heading', { name: '月度经营总览看板', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '全屏查看', exact: true })).toHaveCount(0)
  state = 'loading'
  loadingGate = new Promise<void>((resolve) => {
    unblock = resolve
  })
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeDisabled()
  await expect.poll(() => waitingRequests).toBe(2)
  await expect(page.locator('.business-workspace-header__metric-copy .el-skeleton')).toHaveCount(4)
  await expect(page.locator('.business-workspace-header__metric-copy strong')).toHaveCount(0)
  await page.screenshot({ path: '.artifacts/tms-reports/metrics-loading.png' })
  expect(unblock).toBeDefined()
  state = 'loaded'
  unblock?.()
  await waitReady(page)
  state = 'empty'
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('暂无符合条件的报表数据', { exact: true })).toBeVisible()
  state = 'error'
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '图表分析', exact: true }).click()
  await expect(
    page.getByText('报表读取失败，请检查权限后重试', { exact: true }).first()
  ).toBeVisible()
  state = 'loaded'
  await page.getByRole('button', { name: '重新加载', exact: true }).first().click()
  await expect(page.locator('.management-report-chart [role="img"]')).toBeVisible()
  await page.getByRole('tab', { name: '表格明细', exact: true }).click()
  await waitReady(page)
})

// Verify dense content, not only two-row empty space, against the user's layout complaint.
test('图表保留可读营收，未知成本留空且不冒充零', async ({ page }) => {
  let allUnknown = false
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('monthly-overview')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row) => ({ ...row, cost: null, profit: null, margin: null })),
        summary: {
          ...result.summary,
          revenue: allUnknown ? null : 80000,
          cost: null,
          profit: null,
          reconciled_cost: null,
          reconciled_profit: null
        },
        trend: result.trend.map((point) => ({
          ...point,
          revenue: allUnknown ? null : point.revenue,
          cost: null,
          reconciled_cost: null
        }))
      }
    })
  })
  await page.goto(fixture + '?report=monthly-overview')
  await waitReady(page)
  await expect(page.getByRole('tab', { name: '图表分析', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '图表分析', exact: true }).click()
  await expect(
    page.getByRole('img', { name: /2026-09：营收 48,000 元，核算成本 待核算/ })
  ).toBeVisible()
  await expect(
    page.getByText('部分数值尚未核算或无权查看，图中保留空缺，不按零值计算。')
  ).toBeVisible()
  await page.screenshot({ path: '.artifacts/tms-reports/pages/partial-financial-chart.png' })
  allUnknown = true
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.getByText('暂无可展示的统计', { exact: true })).toBeVisible()
  await expect(page.locator('.management-report-chart [role="img"]')).toHaveCount(0)
})

test('单车费用明细横向查看保留车牌', async ({ page }) => {
  await page.route('**/rest/v1/rpc/tms_management_report', (route) =>
    route.fulfill({ json: reportResult('vehicle-profit') })
  )
  await page.goto(fixture + '?report=vehicle-profit')
  await waitReady(page)
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect(
    page.getByRole('columnheader', { name: '已归集油费（元）', exact: true })
  ).toBeVisible()
  await expect(page.getByRole('cell', { name: '1,200', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '测A验收002', exact: true })).toBeVisible()
  await page.screenshot({ path: '.artifacts/tms-reports/pages/vehicle-cost-breakdown.png' })
})

test('外包运力已关联投诉与未知权限展示', async ({ page }) => {
  test.setTimeout(120_000)
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('carrier-performance')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, i) => ({
          ...row,
          damage: i === 0 ? 100 : null,
          complaints: i === 0 ? 2 : null
        }))
      }
    })
  })
  await page.goto(fixture + '?report=carrier-performance')
  await waitReady(page)
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect(
    page.getByRole('columnheader', { name: '已关联投诉次数', exact: true })
  ).toBeVisible()
  const cells = page.locator('.el-table__body tr').first().getByRole('cell')
  await expect(cells.nth(10)).toHaveText('100')
  await expect(page.locator('.el-table__body tr').nth(1).getByRole('cell').nth(10)).toHaveText(
    '待核算'
  )
  await expect(cells.nth(12)).toHaveText('2')
  await expect(page.locator('.el-table__body tr').nth(1).getByRole('cell').nth(12)).toHaveText(
    '待核算'
  )
  await page.screenshot({ path: '.artifacts/tms-reports/pages/carrier-complaints.png' })
})

test('外包运力评分等级及缺数据状态', async ({ page }) => {
  let missing = false
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('carrier-performance')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, i) => ({
          ...row,
          receipt_rate: i === 0 ? 100 : 0,
          on_time_rate: i === 0 ? 100 : 0,
          exception_rate: i === 0 ? 0 : 100,
          complaints: missing ? null : 0,
          score: missing ? null : i === 0 ? 100 : 10,
          rating: missing ? '待核算' : i === 0 ? 'A' : 'D',
          settlement_advice: missing
            ? '补齐数据后考核'
            : i === 0
              ? '优先合作，按约结算'
              : '建议整改后评估新增业务'
        }))
      }
    })
  })
  await page.goto(fixture + '?report=carrier-performance')
  await waitReady(page)
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  const rows = page.locator('.el-table__body tr')
  await expect(rows.first().getByRole('cell').nth(13)).toHaveText('100')
  await expect(rows.first().getByRole('cell').nth(14)).toHaveText('A')
  await expect(rows.nth(1).getByRole('cell').nth(13)).toHaveText('10')
  await expect(rows.nth(1).getByRole('cell').nth(14)).toHaveText('D')
  await page.screenshot({ path: '.artifacts/tms-reports/pages/carrier-score.png' })
  missing = true
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(rows.first().getByRole('cell').nth(13)).toHaveText('待核算')
  await expect(rows.first().getByRole('cell').nth(14)).toHaveText('待核算')
})

test('司机薪酬已审核月份与缺失金额展示', async ({ page }) => {
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('driver-productivity')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, i) => ({
          ...row,
          payroll_months: i === 0 ? '2026-09' : null,
          payroll_currency: i === 0 ? 'CNY' : null,
          payroll_gross: i === 0 ? 8000 : null,
          attendance_days: i === 0 ? 1 : null,
          attendance_pending_days: i === 0 ? 0 : null,
          attendance_recorded_days: i === 0 ? 1 : null,
          payroll_commission: i === 0 ? 1000 : null,
          payroll_traffic_deductions: i === 0 ? 100 : null,
          payroll_accident_deductions: i === 0 ? 0 : null,
          payroll_deductions: i === 0 ? 200 : null,
          payroll_employer: i === 0 ? 1200 : null,
          payroll_net: i === 0 ? 7800 : null
        }))
      }
    })
  })
  await page.goto(fixture + '?report=driver-productivity')
  await waitReady(page)
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  const rows = page.locator('.el-table__body tr')
  const headers = await page.locator('.el-table__header th').allTextContents()
  for (const [label, value] of [
    ['应发工资', '8,000'],
    ['已核算出勤（天）', '1'],
    ['待处理考勤（天）', '0'],
    ['考勤记录日期数', '1'],
    ['提成（含在应发内）', '1,000'],
    ['违章扣款', '100'],
    ['事故扣款', '0'],
    ['实发工资', '7,800']
  ]) {
    const index = headers.findIndex((text) => text.trim() === label)
    expect(index).toBeGreaterThanOrEqual(0)
    const cell = rows.first().getByRole('cell').nth(index)
    await cell.evaluate((element) => {
      element.closest('.el-scrollbar__wrap')!.scrollLeft = (element as HTMLElement).offsetLeft - 250
    })
    await expect(cell).toHaveText(value)
    await expect(cell).toBeInViewport()
    await expect(rows.nth(1).getByRole('cell').nth(index)).toHaveText('待核算')
  }
  await expect(page.getByRole('link', { name: '报表验收司机1', exact: true })).toBeVisible()
  await page.screenshot({ path: '.artifacts/tms-reports/pages/driver-payroll.png' })
})

test('核算结果使用去重毛利而非原归集毛利', async ({ page }) => {
  await page.route('**/rest/v1/rpc/tms_management_report', (route) => {
    const result = reportResult('vehicle-profit')
    return route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, i) => ({
          ...row,
          profit: 1200,
          reconciled_profit: i === 0 ? -11130 : null
        }))
      }
    })
  })
  await page.goto(fixture + '?report=vehicle-profit')
  await waitReady(page)
  const headers = await page.locator('.el-table__header th').allTextContents()
  const index = headers.findIndex((text) => text.trim() === '核算结果')
  expect(index).toBeGreaterThanOrEqual(0)
  const rows = page.locator('.el-table__body tr')
  await expect(rows.first().getByRole('cell').nth(index)).toHaveText('亏损')
  await expect(rows.nth(1).getByRole('cell').nth(index)).toHaveText('待核算')
})

test('单车维修与罚款分类金额及未知值', async ({ page }) => {
  await page.route('**/rest/v1/rpc/tms_management_report', (route) => {
    const result = reportResult('vehicle-profit')
    return route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, i) => ({
          ...row,
          vehicle_maintenance_cost: i === 0 ? 600 : null,
          traffic_fine_cost: i === 0 ? 200 : null
        }))
      }
    })
  })
  await page.goto(fixture + '?report=vehicle-profit')
  await waitReady(page)
  const headers = await page.locator('.el-table__header th').allTextContents()
  for (const [label, value] of [
    ['已归集维修保养（元）', '600'],
    ['已归集违章罚款（元）', '200']
  ]) {
    const index = headers.findIndex((text) => text.trim() === label)
    expect(index).toBeGreaterThanOrEqual(0)
    const cell = page.locator('.el-table__body tr').first().getByRole('cell').nth(index)
    await cell.evaluate((element) => {
      element.closest('.el-scrollbar__wrap')!.scrollLeft = (element as HTMLElement).offsetLeft - 250
    })
    await expect(cell).toHaveText(value)
    await expect(cell).toBeInViewport()
    await expect(page.locator('.el-table__body tr').nth(1).getByRole('cell').nth(index)).toHaveText(
      '待核算'
    )
  }
  await page.screenshot({ path: '.artifacts/tms-reports/pages/vehicle-cost-breakdown.png' })
})

test('单车总重空里程与未知值', async ({ page }) => {
  test.setTimeout(120_000)
  await page.route('**/rest/v1/rpc/tms_management_report', (route) => {
    const result = reportResult('vehicle-profit')
    return route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, i) => ({
          ...row,
          total_mileage: i === 0 ? 100 : 200,
          loaded_mileage: i === 0 ? 95 : null,
          empty_mileage: i === 0 ? 5 : null,
          empty_rate: i === 0 ? 5 : null
        }))
      }
    })
  })
  await page.goto(fixture + '?report=vehicle-profit')
  await waitReady(page)
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  const headers = await page.locator('.el-table__header th').allTextContents()
  for (const [label, value] of [
    ['总里程（公里）', '100'],
    ['重驶里程（公里）', '95'],
    ['空驶里程（公里）', '5'],
    ['空驶率（%）', '5']
  ]) {
    const index = headers.findIndex((text) => text.trim() === label)
    expect(index).toBeGreaterThanOrEqual(0)
    await expect(
      page.locator('.el-table__body tr').first().getByRole('cell').nth(index)
    ).toHaveText(value)
    if (label !== '总里程（公里）')
      await expect(
        page.locator('.el-table__body tr').nth(1).getByRole('cell').nth(index)
      ).toHaveText('待核算')
  }
  await page.screenshot({ path: '.artifacts/tms-reports/pages/vehicle-mileage.png' })
})

test('单车耗油量与百公里油耗展示', async ({ page }, info) => {
  let missing = false
  await page.route('**/rest/v1/rpc/tms_management_report', (route) => {
    const result = reportResult('vehicle-profit')
    return route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, i) => ({
          ...row,
          consumed_fuel_liters: missing ? null : i === 0 ? 30 : 50,
          fuel_per_100km: missing ? null : i === 0 ? 30 : 25
        }))
      }
    })
  })
  const theme = info.project.name.includes('dark') ? 'dark' : 'light'
  await page.goto(`${fixture}?report=vehicle-profit&theme=${theme}`)
  await waitReady(page)
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  const headers = await page.locator('.el-table__header th').allTextContents()
  const fuel = headers.findIndex((text) => text.trim() === '耗油量（升）')
  const rate = headers.findIndex((text) => text.trim() === '百公里油耗（L/100km）')
  expect(fuel).toBeGreaterThanOrEqual(0)
  expect(rate).toBeGreaterThanOrEqual(0)
  for (const [i, liters, consumption] of [
    [0, '30', '30'],
    [1, '50', '25']
  ] as const) {
    const cells = page.locator('.el-table__body tr').nth(i).getByRole('cell')
    await expect(cells.nth(fuel)).toHaveText(liters)
    await expect(cells.nth(rate)).toHaveText(consumption)
  }
  await page.screenshot({ path: info.outputPath('vehicle-fuel.png'), fullPage: true })
  missing = true
  await page.getByRole('button', { name: '查询', exact: true }).click()
  await expect(page.locator('.el-table__body tr').first().getByRole('cell').nth(rate)).toHaveText(
    '待核算'
  )
  await expect(page.locator('.el-table__body tr').first().getByRole('cell').nth(fuel)).toHaveText(
    '待核算'
  )
})

test('车辆薪酬分摊、保险摊销与调整后金额横向展示', async ({ page }) => {
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('vehicle-profit')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, i) => ({
          ...row,
          allocated_payroll: i === 0 ? 9200 : 10300,
          allocation_basis: i === 0 ? '里程' : '订单数',
          cost_with_payroll: row.cost + (i === 0 ? 9200 : 10300),
          profit_after_payroll: row.profit - (i === 0 ? 9200 : 10300),
          insurance_period_cost: i === 0 ? 330 : 660
        }))
      }
    })
  })
  await page.goto(fixture + '?report=vehicle-profit')
  await waitReady(page)
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect(page.getByRole('cell', { name: '9,200', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '45,200', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '订单数', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: '期间保险摊销（元）' })).toBeVisible()
  await expect(page.getByRole('cell', { name: '330', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '660', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: '测A验收001', exact: true })).toBeVisible()
  await page.screenshot({ path: '.artifacts/tms-reports/pages/vehicle-payroll-allocation.png' })
})

test('六个经营维度展示保险与折旧分摊金额及依据', async ({ page }) => {
  test.setTimeout(120_000)
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const body = route.request().postDataJSON()
    const result = reportResult(body.p_report)
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, index) => ({
          ...row,
          allocated_insurance: index === 0 ? 330 : null,
          insurance_allocation_basis: index === 0 ? '里程' : '订单数',
          allocated_depreciation: index === 0 ? 4500 : null,
          depreciation_allocation_basis: index === 0 ? '里程' : '订单数'
        }))
      }
    })
  })
  for (const slug of [
    'monthly-overview',
    'vehicle-profit',
    'driver-productivity',
    'order-profit',
    'route-profit',
    'customer-profit'
  ]) {
    await page.goto(`${fixture}?report=${slug}&start=2026-09-01&end=2026-09-30`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 })
    await waitReady(page)
    const header = page.getByRole('columnheader', { name: '分摊保险（元）', exact: true })
    await expect(header).toBeVisible()
    const headers = await page.getByRole('columnheader').allTextContents()
    const index = headers.findIndex((value) => value.includes('分摊保险（元）'))
    await page
      .locator('.el-table__body tr')
      .first()
      .getByRole('cell')
      .nth(index)
      .evaluate((cell) => {
        const scroll = cell
          .closest('.el-table')
          ?.querySelector('.el-table__body-wrapper .el-scrollbar__wrap')
        if (scroll) scroll.scrollLeft = (cell as HTMLElement).offsetLeft - 250
      })
    await expect(
      page.locator('.el-table__body tr').first().getByRole('cell').nth(index)
    ).toHaveText('330')
    await expect(page.locator('.el-table__body tr').nth(1).getByRole('cell').nth(index)).toHaveText(
      '待核算'
    )
    await expect(
      page.getByRole('columnheader', { name: '保险分摊依据', exact: true })
    ).toBeVisible()
    const depreciationIndex = headers.findIndex((value) => value.includes('分摊折旧（元）'))
    const depreciationCell = page
      .locator('.el-table__body tr')
      .first()
      .getByRole('cell')
      .nth(depreciationIndex)
    await expect(depreciationCell).toHaveText('4,500')
    await depreciationCell.scrollIntoViewIfNeeded()
    await expect(depreciationCell).toBeInViewport()
    await expect(
      page.locator('.el-table__body tr').nth(1).getByRole('cell').nth(depreciationIndex)
    ).toHaveText('待核算')
    await page.screenshot({ path: `.artifacts/tms-reports/pages/${slug}-insurance-allocation.png` })
  }
})

test('客户毛利货损及已关联投诉横向查看', async ({ page }) => {
  test.setTimeout(120_000)
  const failedRequests: string[] = []
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${new URL(response.url()).pathname}`)
    }
  })
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('customer-profit')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, i) => ({
          ...row,
          damage: i === 0 ? 100 : null,
          complaints: i === 0 ? 1 : null
        }))
      }
    })
  })
  await page.goto(fixture + '?report=customer-profit')
  await waitReady(page)
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect(
    page.getByRole('columnheader', { name: '已关联投诉次数', exact: true })
  ).toBeVisible()
  const headers = await page.locator('.el-table__header th').allTextContents()
  const damageIndex = headers.findIndex((text) => text.trim() === '已审核货损赔付（元）')
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element, index) => {
    const cell = element.querySelector('tr')?.children.item(index)
    if (cell instanceof HTMLElement) element.scrollLeft = cell.offsetLeft - 220
  }, damageIndex)
  for (const [label, expected] of [
    ['已审核货损赔付（元）', '100'],
    ['已关联投诉次数', '1']
  ]) {
    const index = headers.findIndex((text) => text.trim() === label)
    expect(index).toBeGreaterThanOrEqual(0)
    await expect(
      page.locator('.el-table__body tr').first().getByRole('cell').nth(index)
    ).toHaveText(expected)
    await expect(page.locator('.el-table__body tr').nth(1).getByRole('cell').nth(index)).toHaveText(
      '待核算'
    )
  }
  await expect(page.getByRole('link', { name: '报表验收客户1', exact: true })).toBeVisible()
  await page.screenshot({ path: '.artifacts/tms-reports/pages/customer-complaints.png' })
  expect(failedRequests).toEqual([])
  await expect(page.locator('.el-message--error')).toHaveCount(0)
})

test('客户应收余额与多币种提示', async ({ page }) => {
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('customer-profit')
    await route.fulfill({
      json: {
        ...result,
        records: result.records.map((row, i) => ({
          ...row,
          receivable_currency: i === 0 ? 'CNY' : '多币种，分币种查看',
          receivable_balance: i === 0 ? 450 : null,
          overdue_amount: i === 0 ? 450 : null
        }))
      }
    })
  })
  await page.goto(fixture + '?report=customer-profit')
  await waitReady(page)
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect(
    page.getByRole('columnheader', { name: '期间应收未核销余额', exact: true })
  ).toBeVisible()
  await expect(page.getByText('多币种，分币种查看', { exact: true })).toBeVisible()
  const headers = await page.locator('.el-table__header th').allTextContents()
  const balanceIndex = headers.findIndex((text) => text.trim() === '期间应收未核销余额')
  expect(balanceIndex).toBeGreaterThanOrEqual(0)
  const balance = page.locator('.el-table__body tr').first().getByRole('cell').nth(balanceIndex)
  await balance.evaluate((element) => {
    element.closest('.el-scrollbar__wrap')!.scrollLeft = (element as HTMLElement).offsetLeft - 250
  })
  await expect(balance).toBeInViewport()
  await expect(balance).toHaveText('450')
  await expect(
    page.locator('.el-table__body tr').nth(1).getByRole('cell').nth(balanceIndex)
  ).toHaveText('待核算')
  await page.screenshot({ path: '.artifacts/tms-reports/pages/customer-receivables.png' })
})

test('线路单位收支与未知成本横向查看', async ({ page }) => {
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('route-profit')
    const records = result.records.map((row, i) => ({
      ...row,
      unit_revenue: i === 0 ? 1200 : null,
      unit_cost: i === 0 ? 900 : null
    }))
    await route.fulfill({ json: { ...result, records } })
  })
  await page.goto(fixture + '?report=route-profit')
  await waitReady(page)
  await page.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
    element.scrollLeft = element.scrollWidth
  })
  await expect(
    page.getByRole('columnheader', { name: '单位收入（元/吨）', exact: true })
  ).toBeVisible()
  await expect(page.getByRole('cell', { name: '1,200', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '900', exact: true })).toBeVisible()
  const headers = await page.locator('.el-table__header th').allTextContents()
  for (const label of ['单位收入（元/吨）', '已归集单位成本（元/吨）']) {
    const index = headers.findIndex((text) => text.trim() === label)
    expect(index).toBeGreaterThanOrEqual(0)
    const cell = page.locator('.el-table__body tr').nth(1).getByRole('cell').nth(index)
    await cell.evaluate((element) => {
      element.closest('.el-scrollbar__wrap')!.scrollLeft = (element as HTMLElement).offsetLeft - 250
    })
    await expect(cell).toHaveText('待核算')
    await expect(cell).toBeInViewport()
  }
  await expect(page.getByRole('link', { name: '上海 → 北京', exact: true })).toBeVisible()
  await page.screenshot({ path: '.artifacts/tms-reports/pages/route-unit-economics.png' })
})

test('紧凑查询、图表与长表格空间分配', async ({ page }) => {
  await page.route('**/rest/v1/rpc/tms_management_report', async (route) => {
    const result = reportResult('vehicle-profit')
    const records = Array.from({ length: 20 }, (_, i) => ({
      ...samples[i % 2],
      _key: 'dense-' + i,
      label: '测A验收' + String(i + 1).padStart(3, '0')
    }))
    await route.fulfill({ json: { ...result, records, total: 20 } })
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(fixture + '?report=vehicle-profit')
  await waitReady(page, 20)
  const date = await page.locator('.art-search-bar .el-date-editor').boundingBox()
  const keyword = await page.getByRole('textbox', { name: '关键词', exact: true }).boundingBox()
  const query = await page.getByRole('button', { name: '查询', exact: true }).boundingBox()
  expect(date).not.toBeNull()
  expect(keyword).not.toBeNull()
  expect(query).not.toBeNull()
  expect(Math.abs(date!.y - query!.y)).toBeLessThan(8)
  expect(Math.abs(keyword!.y - query!.y)).toBeLessThan(8)
  expect(date!.width).toBeLessThanOrEqual(380)
  expect(keyword!.width).toBeLessThanOrEqual(300)
  await expect(page.locator('.management-report-chart')).toHaveCount(0)
  const body = await page.locator('.el-table__body-wrapper').boundingBox()
  expect(body!.height).toBeGreaterThan(250)
  expect(body!.y + body!.height).toBeLessThan(850)
  await expect(page.getByRole('button', { name: '全屏查看', exact: true })).toHaveCount(0)
  await page.screenshot({
    path: '.artifacts/tms-reports/pages/dense-layout-1440.png',
    fullPage: true
  })
  await page.setViewportSize({ width: 640, height: 900 })
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({
    path: '.artifacts/tms-reports/pages/dense-layout-640.png',
    fullPage: true
  })
})
