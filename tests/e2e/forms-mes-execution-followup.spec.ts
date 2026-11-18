import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)
const tenantId = '11111111-1111-4111-8111-111111111111'
const longReporter = '验收报工人 · EMP-MES-DETAIL-LONG-IDENTITY-20261118-ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const longNarrative =
  '验收长记录：生产现场已按完整流程复核。TRACE-MES-20261118-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789'
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
  requiredStartDate: '2026-11-01',
  requiredCompletionDate: '2026-11-30',
  equipmentLocked: true,
  equipmentId: null,
  executionRules: { firstTaskId: 'task-1', controlCode: 'SY01', reportMode: 'optional' },
  workCenter: { code: 'WC01', name: '验收工作中心', departmentId: 'shop-1' },
  workOrder: {
    workOrderNo: 'MO-ONE',
    materialCodeSnapshot: 'MAT-001',
    materialNameSnapshot: '验收板材',
    specificationSnapshot: '1000×50',
    drawingNoSnapshot: 'DRAW-001',
    projectNameSnapshot: '验收工程',
    orderQuantity: 10
  },
  allocations: []
}
const report = {
  id: 'report-1',
  tenantId,
  taskId: 'task-1',
  task,
  workCenter: task.workCenter,
  workCenterId: 'center-1',
  goodQuantity: 0,
  processBadQuantity: 0,
  materialBadQuantity: 0,
  compensationHours: 0,
  compensationReason: '',
  rewardPenaltyHours: 0,
  rewardPenaltyReason: '',
  shiftName: '白班',
  operatorPersonIds: [],
  equipmentId: null,
  status: 'pending',
  reporterName: '验收报工人',
  reviewerName: '验收审批人',
  startedAt: '2026-11-01T08:00:00Z',
  reportedAt: '2026-11-01T10:00:00Z',
  reviewedAt: null,
  remark: '验收备注',
  defects: [],
  media: []
}
for (const profile of [
  { theme: 'light', width: 1440, height: 1000 },
  { theme: 'dark', width: 390, height: 844 }
]) {
  test.describe(`${profile.theme}${profile.width}`, () => {
    let errors: string[], submissions: { name: string; payload: Record<string, unknown> }[]
    test.beforeEach(async ({ page }) => {
      errors = []
      submissions = []
      page.on('pageerror', (error) => errors.push(error.message))
      await prepareIsolatedSession(page)
      await page.setViewportSize(profile)
      await page.route('**/rest/v1/**', (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1) || ''
        if (name === 'mes_submit_production_report' || name === 'mes_review_production_report') {
          submissions.push({ name, payload: route.request().postDataJSON() })
          return route.fulfill({ json: { id: 'report-1' } })
        }
        if (name === 'mes_production_report')
          return route.fulfill({
            headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
            json: [
              {
                ...report,
                goodQuantity: 5,
                compensationHours: 2,
                compensationReason: '验收补偿',
                reporterName: longReporter,
                remark: longNarrative,
                status: 'rejected',
                rejectReason: longNarrative,
                media: ['https://example.invalid/evidence.pdf'],
                defects: [
                  {
                    id: 'defect-1',
                    category: 'process',
                    quantity: 1,
                    reason: { code: 'DEFECT', name: '验收不良原因' }
                  }
                ]
              }
            ]
          })
        if (name === 'mes_execution_event')
          return route.fulfill({
            headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
            json: [
              {
                id: 'event-1',
                tenantId,
                task,
                workCenter: task.workCenter,
                kind: 'mold',
                status: 'closed',
                title: '验收模具',
                occurredAt: '2026-11-01T08:00:00Z',
                completedAt: '2026-11-01T09:00:00Z',
                details: {
                  moldCode: 'MOLD-001',
                  moldName: '验收模具',
                  location: '上模区',
                  unloadLocation: '下模区',
                  clamping: '验收装夹',
                  repairType: '验收维修',
                  repairDate: '2026-11-01',
                  problemDescription: longNarrative,
                  resolution: longNarrative
                },
                media: ['https://example.invalid/evidence.pdf'],
                remark: longNarrative
              }
            ]
          })
        if (name === 'mdm_production_calendar')
          return route.fulfill({
            json: [
              { pattern: { shifts: [{ name: '白班', startTime: '08:00', endTime: '18:00' }] } }
            ]
          })
        return route.fulfill({ json: [] })
      })
    })
    test.afterEach(() => {
      expect(errors).toEqual([])
    })
    for (const mode of ['mold', 'reports'])
      test(`MES补漏 ${mode} 详情真实列表入口三分组`, async ({ page }, info) => {
        await page.goto(
          `/tests/e2e/fixtures/section-scroll-business.html?mode=${mode}&theme=${profile.theme}`
        )
        await page
          .getByRole('button', { name: /MO-ONE/ })
          .first()
          .click()
        const drawer = page.locator('.el-drawer:visible'),
          tabs = drawer.getByRole('tab')
        await expect(tabs).toHaveCount(3)
        const geometry: Array<Record<string, unknown>> = []
        for (const tab of await tabs.all()) {
          await tab.click()
          const panel = drawer.getByRole('tabpanel').filter({ visible: true })
          await expect(panel).not.toBeEmpty()
          await expect(panel.locator('.art-descriptions')).toHaveCount(1)
          const value = (label: string) =>
            panel
              .getByText(label, { exact: true })
              .locator('xpath=following-sibling::*[1]')
              .locator('.art-descriptions__value')
          const tabName = await tab.innerText()
          if (mode === 'reports') {
            if (tabName === '生产任务') {
              await expect(value('工单数量')).toHaveText('10')
              await expect(value('产品')).toHaveText('MAT-001 · 验收板材')
              await expect(value('开始加工')).toContainText('2026-11-01')
            } else if (tabName === '产量与工时') {
              await expect(value('良品数量')).toHaveText('5')
              await expect(value('加工不良')).toHaveText('0')
              await expect(value('来料不良')).toHaveText('0')
              await expect(value('机器用时')).toHaveText('2.00 h')
              await expect(value('人工用时')).toHaveText('0.00 h')
              await expect(value('良品率')).toHaveText('100%')
              await expect(value('计划达成率')).toHaveText('50%')
            } else {
              await expect(value('补偿工时 / 原因')).toHaveText('2 h · 验收补偿')
              await expect(value('奖惩工时 / 原因')).toHaveText('0 h · —')
              await expect(value('操作人员')).toHaveText('—')
              await expect(value('审批时间')).toHaveText('—')
              await expect(value('报工人')).toHaveText(longReporter)
              await expect(value('驳回原因')).toHaveText(longNarrative)
              for (const label of ['补偿工时 / 原因', '奖惩工时 / 原因']) {
                const caption = await panel
                  .getByText(label, { exact: true })
                  .evaluate((element) => {
                    const range = document.createRange()
                    range.selectNodeContents(element)
                    return {
                      labelWidth: element.getBoundingClientRect().width,
                      lineCount: new Set(Array.from(range.getClientRects(), (rect) => rect.top))
                        .size
                    }
                  })
                expect(caption.labelWidth).toBeCloseTo(120, 0)
                expect(caption.lineCount, label).toBe(1)
                geometry.push({ tab: tabName, label, ...caption })
              }
            }
          } else if (tabName === '关联任务') {
            await expect(value('工单 / 完工数')).toHaveText('10 / 0')
            await expect(value('工序')).toHaveText('OP1 验收工序')
          } else if (tabName === '上模与下模') {
            await expect(value('调模时长')).toHaveText('1.00 h')
            await expect(value('标准调模工时')).toHaveText('—')
            await expect(value('上模人员')).toHaveText('—')
            await expect(value('下模人员')).toHaveText('—')
            await expect(value('库位')).toHaveText('上模区')
          } else {
            await expect(value('问题描述')).toHaveText(longNarrative)
            await expect(value('处理记录')).toHaveText(longNarrative)
            await expect(value('关联质检批号')).toHaveText('—')
            await expect(value('维修人员')).toHaveText('—')
          }
          if (tabName === '审批与附件' || tabName === '维护与附件') {
            const longValues =
              mode === 'reports' ? ['报工人', '驳回原因', '备注'] : ['问题描述', '处理记录', '备注']
            for (const label of longValues) {
              const content = value(label)
              if (label === '备注') await expect(content).toHaveText(longNarrative)
              await content.scrollIntoViewIfNeeded()
              await expect(content).toBeInViewport()
              const rects = await content.evaluate((element) => {
                const cell = element.closest('.el-descriptions__content')!
                const labelCell = cell.previousElementSibling!
                const range = document.createRange()
                range.selectNodeContents(element)
                const boundary = cell.getBoundingClientRect()
                const scrollport = element.closest('.el-scrollbar__wrap')!.getBoundingClientRect()
                return {
                  cellLeft: boundary.left,
                  cellRight: boundary.right,
                  labelWidth: labelCell.getBoundingClientRect().width,
                  valueWidth: boundary.width,
                  viewportWidth: innerWidth,
                  visibleTop: Math.max(scrollport.top, 0),
                  visibleBottom: Math.min(scrollport.bottom, innerHeight),
                  lines: Array.from(range.getClientRects(), (rect) => ({
                    left: rect.left,
                    right: rect.right,
                    top: rect.top,
                    bottom: rect.bottom
                  }))
                }
              })
              expect(rects.lines.length).toBeGreaterThan(0)
              expect(rects.labelWidth).toBeCloseTo(120, 0)
              expect(rects.valueWidth).toBeGreaterThan(rects.labelWidth)
              for (const line of rects.lines) {
                expect(line.left).toBeGreaterThanOrEqual(Math.max(rects.cellLeft, 0) - 1)
                expect(line.right).toBeLessThanOrEqual(
                  Math.min(rects.cellRight, rects.viewportWidth) + 1
                )
                expect(line.top).toBeGreaterThanOrEqual(rects.visibleTop - 1)
                expect(line.bottom).toBeLessThanOrEqual(rects.visibleBottom + 1)
              }
              geometry.push({ tab: tabName, label, ...rects })
            }
          }
          await page.screenshot({
            path: info.outputPath(`pane-${await tab.getAttribute('id')}.png`),
            animations: 'disabled'
          })
        }
        await info.attach('detail-value-geometry', {
          body: JSON.stringify(geometry, null, 2),
          contentType: 'application/json'
        })
        const attachment = drawer.getByRole('link', { name: /附件 1/ })
        await attachment.scrollIntoViewIfNeeded()
        await expect(attachment).toBeInViewport()
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
        ).toBe(true)
        await page.getByRole('button', { name: '关闭抽屉', exact: true }).click()
        await page
          .getByRole('button', { name: /MO-ONE/ })
          .first()
          .click()
        await expect(drawer.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')
      })
    for (const mode of ['create', 'edit', 'resubmit'])
      test(`MES补漏 ${mode} 报工跨页签必填定位及实际保存`, async ({ page }, info) => {
        await page.addInitScript(
          (args) => {
            window.mesReportOpenArgs = args
          },
          mode === 'create'
            ? [task, []]
            : [task, [], { ...report, status: mode === 'resubmit' ? 'rejected' : 'pending' }]
        )
        await page.goto(
          `/tests/e2e/fixtures/section-scroll-business.html?mode=reportform&theme=${profile.theme}`
        )
        await page.getByRole('button', { name: '打开工序报工', exact: true }).click()
        const dialog = page.locator('.el-dialog:visible'),
          quantity = dialog.getByRole('spinbutton', { name: /良品数量/ }),
          confirm = dialog.locator('.el-dialog__footer button').last()
        await expect(dialog.getByRole('tab')).toHaveCount(2)
        await expect(quantity).toBeVisible()
        if (mode === 'create')
          await expect(dialog.getByText('白班 08:00—18:00', { exact: true })).toBeVisible()
        await dialog.getByRole('tab', { name: '工时与附件', exact: true }).click()
        await confirm.click()
        await expect(quantity).toBeVisible()
        await expect(quantity).toBeFocused()
        expect(submissions).toHaveLength(0)
        await quantity.fill('1')
        await quantity.press('Tab')
        await dialog.getByRole('tab', { name: '工时与附件', exact: true }).click()
        await dialog.getByRole('spinbutton', { name: /补偿工时/ }).fill('2')
        await dialog.getByRole('spinbutton', { name: /补偿工时/ }).press('Tab')
        const reason = dialog.getByRole('textbox', { name: /补偿原因/ })
        await reason.evaluate((node) => node.setAttribute('data-report-reason', 'retained'))
        await dialog.getByRole('tab', { name: '产量与班次', exact: true }).click()
        await confirm.click()
        await expect(reason).toBeVisible()
        await expect(reason).toBeFocused()
        await reason.fill('验收补偿原因')
        await dialog.getByRole('tab', { name: '产量与班次', exact: true }).click()
        await expect(page.locator('[data-report-reason]')).toHaveCount(1)
        await page.screenshot({ path: info.outputPath('report-tabs.png'), animations: 'disabled' })
        await confirm.click()
        await expect.poll(() => submissions.length).toBe(1)
        expect(submissions[0].name).toBe(
          mode === 'create' ? 'mes_submit_production_report' : 'mes_review_production_report'
        )
        expect(submissions[0].payload.p_payload).toMatchObject({
          goodQuantity: 1,
          shiftName: '白班',
          compensationHours: 2,
          compensationReason: '验收补偿原因',
          defects: []
        })
        if (mode === 'create')
          expect(submissions[0].payload).toMatchObject({
            p_task_id: task.id,
            p_work_center_id: task.workCenterId
          })
        else
          expect(submissions[0].payload).toMatchObject({
            p_report_id: report.id,
            p_action: mode === 'edit' ? 'edit' : 'resubmit'
          })
        await expect(page.getByTestId('report-saved')).toHaveText('1')
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
        ).toBe(true)
      })
  })
}
