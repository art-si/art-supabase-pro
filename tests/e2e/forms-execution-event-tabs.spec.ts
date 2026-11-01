import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)
const tenantId = '11111111-1111-4111-8111-111111111111'
const task = {
  id: 'task-1',
  tenantId,
  taskNo: 'TASK-ONE',
  workOrderId: 'order-1',
  workCenterId: 'center-1',
  plannedQuantity: 10,
  completedQuantity: 0,
  operationCode: 'OP1',
  operationName: '验收工序',
  sequenceNo: 1,
  sequenceType: 'main',
  allocations: [],
  workCenter: { code: 'WC01', name: '验收工作中心', departmentId: 'shop-1' },
  workOrder: {
    workOrderNo: 'MO-ONE',
    materialCodeSnapshot: 'MAT-001',
    materialNameSnapshot: '验收板材'
  }
}
async function prepare(page: Page, mode: string, theme = 'light') {
  const submissions: Record<string, unknown>[] = [],
    errors: string[] = [],
    reads: URL[] = []
  const state = { failSave: false }
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.setViewportSize(
    theme === 'dark' ? { width: 390, height: 844 } : { width: 1440, height: 1000 }
  )
  await page.route('**/rest/v1/**', (route) => {
    const url = new URL(route.request().url()),
      name = url.pathname.split('/').at(-1)
    if (name === 'mes_save_execution_event') {
      submissions.push(route.request().postDataJSON())
      return state.failSave
        ? route.fulfill({ status: 503, json: { message: '现场记录暂时无法保存，请重试' } })
        : route.fulfill({ json: { id: 'event-1' } })
    }
    reads.push(url)
    if (name === 'sys_dictionary')
      return route.fulfill({
        json:
          url.searchParams.get('dict_type_table.code') === 'eq.mesMoldRepairType'
            ? [
                {
                  id: 'repair-type-1',
                  label: '常规保养',
                  value: 'repair-1',
                  status: '1',
                  sort: 1,
                  dict_type_table: { code: 'mesMoldRepairType', name: '模具维修类型' }
                }
              ]
            : []
      })
    if (name === 'mdm_production_department')
      return route.fulfill({
        json: [{ id: 'shop-1', tenantId, code: 'SHOP1', name: '验收车间', enabled: true, sort: 1 }]
      })
    if (name === 'mdm_work_center')
      return route.fulfill({
        json: [
          {
            id: 'center-1',
            tenantId,
            departmentId: 'shop-1',
            code: 'WC01',
            name: '验收工作中心',
            sort: 1
          }
        ]
      })
    if (name === 'mdm_production_personnel')
      return route.fulfill({
        json: [{ id: 'person-1', tenantId, name: '验收人员', employeeNo: 'EMP001', enabled: true }]
      })
    if (name === 'mes_operation_task')
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [task]
      })
    if (name === 'mes_execution_event')
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 'event-1',
            tenantId,
            taskId: task.id,
            workCenterId: 'center-1',
            task,
            workCenter: task.workCenter,
            kind:
              mode === 'inspection'
                ? 'inspection_first'
                : mode === 'equipment'
                  ? 'equipment_check'
                  : mode,
            status: 'open',
            title: '验收现场记录',
            quantity: 0,
            handlerPersonId: 'person-1',
            handler: { name: '验收人员' },
            actorName: '验收发起人',
            occurredAt: '2026-11-01T08:00:00Z',
            respondedAt: null,
            completedAt: null,
            details:
              mode === 'mold'
                ? {
                    moldCode: 'MOLD-A',
                    moldName: '验收模具',
                    location: '模具库A01',
                    clamping: '快速装夹',
                    repairType: '',
                    repairDate: '2026-11-01',
                    repairPersonId: 'person-1',
                    requiredCompletionDate: '2026-11-05',
                    plannedCompletionDate: '2026-11-04',
                    inspectionBatchNo: 'QC-ONE',
                    problemDescription: '验收问题描述'
                  }
                : mode === 'inspection'
                  ? {
                      sampleCount: 1,
                      passCount: 1,
                      failCount: 0,
                      badCount: 0,
                      judgment: 'pass',
                      plannedQuantity: 10,
                      batchNo: 'QC-ONE'
                    }
                  : { category: '设备', shiftName: '白班' },
            media: ['https://example.invalid/evidence.pdf'],
            remark: '验收备注'
          }
        ]
      })
    return route.fulfill({ json: [] })
  })
  await page.goto(
    `/tests/e2e/fixtures/section-scroll-business.html?mode=event&eventMode=${mode}&theme=${theme}`
  )
  await expect(page.getByRole('button', { name: '新增记录', exact: true })).toBeVisible()
  if (mode === 'equipment') await page.getByRole('tab', { name: '现场记录', exact: true }).click()
  await expect(page.getByRole('button', { name: '查看', exact: true })).toBeVisible()
  return { submissions, errors, state, reads }
}
const openCreate = async (page: Page) => {
  await page.getByRole('button', { name: '新增记录', exact: true }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(
    dialog.getByRole('textbox', {
      name: /模具操作|检验项目|安灯类型|异常原因|杂项类型|杂项说明|点检项目/
    })
  ).toBeVisible()
  return dialog
}
for (const theme of ['light', 'dark']) {
  test(`execution events mold create stays compact, repair tabs validate all fields and retry exact payload - ${theme}`, async ({
    page
  }, info) => {
    const { submissions, errors, state, reads } = await prepare(page, 'mold', theme)
    let dialog = await openCreate(page)
    await expect(dialog.getByRole('tab')).toHaveCount(0)
    await dialog.getByRole('textbox', { name: /^\*?\s*模具操作$/ }).fill('验收上模')
    await dialog.getByRole('textbox', { name: /^\*?\s*模具编号$/ }).fill('MOLD-NEW')
    await page.screenshot({
      path: info.outputPath(`mold-create-compact-${theme}.png`),
      timeout: 60000
    })
    await dialog.locator('.el-dialog__footer button').last().click()
    await expect(dialog).toHaveCount(0)
    expect(submissions[0]).toMatchObject({
      p_event_id: null,
      p_kind: 'mold',
      p_action: 'create',
      p_task_id: task.id,
      p_work_center_id: 'center-1',
      p_payload: { title: '验收上模', details: { moldCode: 'MOLD-NEW', repairType: '' }, media: [] }
    })
    await page.getByRole('button', { name: '维修', exact: true }).click()
    dialog = page.locator('.el-dialog:visible')
    const identity = dialog.getByRole('tab', { name: '模具与归属', exact: true }),
      business = dialog.getByRole('tab', { name: '维修与记录', exact: true })
    await expect(identity).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.getByRole('tab')).toHaveCount(2)
    const save = dialog.locator('.el-dialog__footer button').last()
    await save.click()
    await expect(business).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.getByText('请选择维修类型', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('combobox', { name: /^\*?\s*维修类型$/ })).toBeFocused()
    expect(submissions).toHaveLength(1)
    await dialog.getByRole('combobox', { name: /^\*?\s*维修类型$/ }).click()
    await page.getByRole('option', { name: '常规保养', exact: true }).click()
    await dialog.getByRole('textbox', { name: '问题描述', exact: true }).fill('已检查定位销并修复')
    await identity.click()
    const moldCode = dialog.getByRole('textbox', { name: /^\*?\s*模具编号$/ })
    await moldCode.fill('')
    await business.click()
    await save.click()
    await expect(identity).toHaveAttribute('aria-selected', 'true')
    await expect(moldCode).toBeFocused()
    await expect(dialog.getByText('请填写模具编号', { exact: true })).toBeVisible()
    await moldCode.fill('MOLD-A-REPAIR')
    await moldCode.press('Tab')
    await expect(dialog.getByText('请填写模具编号', { exact: true })).toBeHidden()
    await page.screenshot({
      path: info.outputPath(`mold-repair-identity-${theme}.png`),
      timeout: 60000
    })
    await business.click()
    await expect(dialog.getByRole('textbox', { name: '问题描述', exact: true })).toHaveValue(
      '已检查定位销并修复'
    )
    await page.screenshot({
      path: info.outputPath(`mold-repair-business-${theme}.png`),
      timeout: 60000
    })
    await dialog.getByRole('button', { name: '上传现场附件', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: info.outputPath(`mold-repair-evidence-${theme}.png`),
      timeout: 60000
    })
    state.failSave = true
    await save.click()
    await expect.poll(() => submissions.length).toBe(2)
    await expect(dialog).toBeVisible()
    await expect(business).toHaveAttribute('aria-selected', 'true')
    state.failSave = false
    await save.click()
    await expect(dialog).toHaveCount(0)
    expect(submissions).toHaveLength(3)
    expect(submissions[1]).toEqual(submissions[2])
    expect(submissions[2]).toMatchObject({
      p_event_id: 'event-1',
      p_action: 'update',
      p_kind: 'mold',
      p_task_id: task.id,
      p_work_center_id: 'center-1',
      p_payload: {
        title: '验收现场记录',
        handlerPersonId: 'person-1',
        details: {
          moldCode: 'MOLD-A-REPAIR',
          moldName: '验收模具',
          repairType: 'repair-1',
          repairDate: '2026-11-01',
          problemDescription: '已检查定位销并修复',
          plannedCompletionDate: '2026-11-04',
          inspectionBatchNo: 'QC-ONE'
        },
        media: ['https://example.invalid/evidence.pdf'],
        remark: '验收备注'
      }
    })
    await page.getByRole('button', { name: '查看', exact: true }).click()
    const drawer = page.locator('.el-drawer:visible')
    await expect(drawer.getByRole('tab')).toHaveCount(2)
    await drawer.getByRole('tab', { name: '业务与附件', exact: true }).click()
    await expect(drawer.getByRole('link', { name: '附件 1', exact: true })).toHaveAttribute(
      'href',
      'https://example.invalid/evidence.pdf'
    )
    await page.screenshot({ path: info.outputPath(`mold-readonly-${theme}.png`), timeout: 60000 })
    await page.getByRole('button', { name: '关闭抽屉', exact: true }).click()
    await page.getByRole('button', { name: '查看', exact: true }).click()
    await expect(drawer.getByRole('tab', { name: '记录概况', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(
      reads
        .filter((url) => url.pathname.endsWith('/mes_execution_event'))
        .every((url) => url.searchParams.get('tenant_id') === `eq.${tenantId}`)
    ).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
  })
  test(`execution events inspection tabs focus hidden inspector and save create/edit - ${theme}`, async ({
    page
  }, info) => {
    const { submissions, errors } = await prepare(page, 'inspection', theme)
    let dialog = await openCreate(page)
    const results = dialog.getByRole('tab', { name: '检验结果', exact: true }),
      identity = dialog.getByRole('tab', { name: '归属与说明', exact: true })
    await expect(dialog.getByRole('tab')).toHaveCount(2)
    await dialog.getByRole('textbox', { name: /^\*?\s*检验项目$/ }).fill('首检验收')
    await dialog.locator('.el-dialog__footer button').last().click()
    await expect(results).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.getByText('请选择检验人员', { exact: true })).toBeVisible()
    const inspector = dialog.getByRole('combobox', { name: /^\*?\s*检验人员$/ })
    await expect(inspector).toBeFocused()
    await inspector.click()
    await page.getByRole('option', { name: /验收人员/ }).click()
    await dialog.getByRole('spinbutton', { name: /^\*?\s*抽检次数$/ }).fill('2')
    await dialog.getByRole('spinbutton', { name: /^\*?\s*合格次数$/ }).fill('2')
    await identity.click()
    await dialog.getByRole('textbox', { name: '备注', exact: true }).fill('检验归属与记录保持同页')
    await page.screenshot({
      path: info.outputPath(`inspection-identity-${theme}.png`),
      timeout: 60000
    })
    await results.click()
    await page.screenshot({
      path: info.outputPath(`inspection-results-${theme}.png`),
      timeout: 60000
    })
    await identity.click()
    await dialog.locator('.el-dialog__footer button').last().click()
    await expect(dialog).toHaveCount(0)
    expect(submissions[0]).toMatchObject({
      p_kind: 'inspection_first',
      p_action: 'create',
      p_payload: {
        title: '首检验收',
        handlerPersonId: 'person-1',
        quantity: 0,
        details: {
          sampleCount: 2,
          passCount: 2,
          failCount: 0,
          badCount: 0,
          judgment: 'pass',
          plannedQuantity: 10
        },
        remark: '检验归属与记录保持同页'
      }
    })
    await page.getByRole('button', { name: '编辑', exact: true }).click()
    dialog = page.locator('.el-dialog:visible')
    await expect(identity).toHaveAttribute('aria-selected', 'true')
    await results.click()
    await dialog.getByRole('spinbutton', { name: /^\*?\s*不良数量$/ }).fill('1')
    await identity.click()
    await dialog.locator('.el-dialog__footer button').last().click()
    await expect(dialog).toHaveCount(0)
    expect(submissions[1]).toMatchObject({
      p_event_id: 'event-1',
      p_action: 'update',
      p_payload: {
        quantity: 1,
        details: { sampleCount: 1, passCount: 1, failCount: 0, badCount: 1 }
      }
    })
    await page.getByRole('button', { name: '查看', exact: true }).click()
    await expect(page.locator('.el-drawer:visible').getByRole('tab')).toHaveCount(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    expect(errors).toEqual([])
  })
}
for (const [mode, label] of [
  ['andon', '安灯类型'],
  ['exception', '异常原因'],
  ['misc_piece', '杂项类型'],
  ['misc_report', '杂项说明'],
  ['equipment', '点检项目']
]) {
  test(`execution events ${mode} remains compact and actually saves`, async ({ page }, info) => {
    const { submissions, errors } = await prepare(page, mode)
    const dialog = await openCreate(page)
    await expect(dialog.getByRole('tab')).toHaveCount(0)
    await dialog
      .getByRole('textbox', { name: new RegExp(`^\\*?\\s*${label}$`) })
      .fill('紧凑现场记录')
    if (mode === 'misc_piece') {
      await dialog.getByRole('textbox', { name: /^\*?\s*计件单位$/ }).fill('次')
      await dialog.getByRole('spinbutton', { name: /^\*?\s*单价（元）$/ }).fill('12.5')
    }
    if (mode === 'misc_report')
      await dialog.getByRole('spinbutton', { name: /^\*?\s*杂项工时（h）$/ }).fill('2')
    if (mode === 'equipment')
      await dialog.getByRole('textbox', { name: /^\*?\s*设备编号$/ }).fill('EQ-ONE')
    await page.screenshot({ path: info.outputPath(`${mode}-compact.png`), timeout: 60000 })
    await dialog.locator('.el-dialog__footer button').last().click()
    await expect(dialog).toHaveCount(0)
    expect(submissions).toHaveLength(1)
    expect(submissions[0]).toMatchObject({
      p_action: 'create',
      p_kind: mode === 'equipment' ? 'equipment_check' : mode,
      p_task_id: task.id,
      p_work_center_id: 'center-1',
      p_payload: {
        title: '紧凑现场记录',
        quantity: mode === 'misc_report' ? 2 : mode === 'misc_piece' ? 1 : 0
      }
    })
    if (mode === 'andon') {
      await page.getByRole('button', { name: '查看', exact: true }).click()
      await expect(page.locator('.el-drawer:visible').getByRole('tab')).toHaveCount(0)
    }
    expect(errors).toEqual([])
  })
}
