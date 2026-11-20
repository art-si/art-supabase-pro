import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { mockApplicationMenus } from './support/menu-rpc'
import type { SmisHiddenHazardGovernanceDetail } from '@smis/api'
import { inspectionCategory, unit } from './fixtures/form-standard-smis-batch-two-data'
import { rescuePlan } from './fixtures/form-standard-smis-batch-three-data'
import { issuanceStandard, riskPosition, site } from './fixtures/form-standard-smis-batch-four-data'
import { equipment, question, questionCategory } from './fixtures/form-standard-smis-batch-six-data'
import {
  hazardGovernance,
  hiddenTaskDetail,
  longHazardSource,
  longRiskMeasure,
  rectification,
  riskTaskDetail
} from './fixtures/form-standard-smis-readonly-data'
import {
  dictionaries,
  employeeId,
  frequencyId,
  itemId,
  operationTypeId,
  organizationId,
  organization,
  permit,
  planDetail,
  readonlyAttachmentNames,
  readonlyAttachmentUrls,
  recordId,
  secondSafetyRiskPoint,
  tenantId
} from './fixtures/form-standard-smis-data'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(90_000)

for (const { entry, phase } of [
  { entry: 'shift-calendar', phase: 'initial' },
  { entry: 'inspection-rectification', phase: 'initial' },
  { entry: 'violation-record', phase: 'initial' },
  { entry: 'equipment', phase: 'detail' },
  { entry: 'equipment', phase: 'selectedRows' }
] as const) {
  test(`异步读取只回填当前弹窗：${entry}${entry === 'equipment' ? `-${phase}` : ''}`, async ({
    page
  }, info) => {
    await prepareIsolatedSession(page)
    const ids = {
      a: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      b: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
    }
    const gaugeIds = {
      a: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      b: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4'
    }
    const valveIds = {
      a: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
      b: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6'
    }
    const writes: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    for (const oldFails of [false, true]) {
      for (const currentReady of [false, true]) {
        const oldGate = Promise.withResolvers<void>()
        const currentGate = Promise.withResolvers<void>()
        let owner: 'a' | 'b' = 'a'
        let currentFailure = false
        const pending = { a: 0, b: 0 }
        await page.route('**/rest/v1/**', async (route) => {
          const request = route.request()
          const name = new URL(request.url()).pathname.split('/').at(-1) ?? ''
          if (request.method() !== 'GET' && /^smis_(?!(?:get|list)_)/.test(name)) writes.push(name)
          if (name === 'get_table_column_runtime')
            return route.fulfill({ json: { enabled: false, profiles: [] } })
          const targets = {
            'shift-calendar': ['smis_get_employee_shift_calendar_secure'],
            'inspection-rectification': ['smis_list_rectification_notices_secure'],
            'violation-record': [
              'smis_list_sites_secure',
              'smis_list_anti_violation_standards_secure'
            ],
            equipment: ['smis_get_equipment_archive_secure']
          }
          if (!targets[entry].includes(name))
            return route.fulfill({ json: name === 'sys_document_number_rule' ? null : [] })
          const payload = request.postDataJSON()
          const requestedId = payload?.p_equipment_id as string | undefined
          const key =
            entry === 'equipment'
              ? Object.values({ id: ids.a, gauge: gaugeIds.a, valve: valveIds.a }).includes(
                  requestedId || ''
                )
                ? 'a'
                : 'b'
              : owner
          const accessory = entry === 'equipment' && requestedId !== ids[key]
          const held = entry !== 'equipment' || (phase === 'selectedRows' ? accessory : !accessory)
          if (held) {
            pending[key]++
            await (key === 'a' ? oldGate.promise : currentGate.promise)
          }
          if (key === 'b' && currentFailure && (entry !== 'equipment' || accessory))
            return route.fulfill({
              status: 503,
              json: { code: 'XX000', message: '验收当前读取失败' }
            })
          if (key === 'a' && oldFails && held)
            return route.fulfill({
              status: 503,
              json: { code: 'XX000', message: '验收旧读取失败' }
            })
          if (entry === 'shift-calendar')
            return route.fulfill({
              json: {
                employeeId: ids[key],
                employeeName: key === 'a' ? '旧人员甲' : '当前人员乙',
                month: String(payload?.p_month || '2026-11-01').slice(0, 7),
                assignments: [
                  {
                    id: ids[key],
                    workDate: `${String(payload?.p_month || '2026-11-01').slice(0, 7)}-18`,
                    assignmentStatus: 'scheduled',
                    shiftCode: key.toUpperCase(),
                    shiftName: key === 'a' ? '旧班次甲' : '当前班次乙',
                    shiftType: 'day',
                    startTime: '08:00',
                    endTime: '16:00',
                    crossDay: false
                  }
                ]
              }
            })
          if (entry === 'inspection-rectification')
            return route.fulfill({
              json: {
                records: [
                  {
                    ...rectification,
                    id: ids[key],
                    hazardNo: key === 'a' ? 'HG-OLD-A' : 'HG-CURRENT-B',
                    status: 'rectifying'
                  }
                ],
                total: 1
              }
            })
          if (entry === 'violation-record')
            return route.fulfill({
              json:
                name === 'smis_list_sites_secure'
                  ? [{ ...site, id: ids[key], siteName: key === 'a' ? '旧场所甲' : '当前场所乙' }]
                  : {
                      records: [
                        {
                          id: ids[key],
                          categoryId: itemId,
                          categoryName: '验收分类',
                          standardCode: key.toUpperCase(),
                          standardName: key === 'a' ? '旧违章标准甲' : '当前违章标准乙',
                          deductionPoints: 2,
                          status: 'enabled'
                        }
                      ],
                      total: 1
                    }
            })
          const isGauge = requestedId === gaugeIds[key]
          return route.fulfill({
            json: {
              ...equipment,
              id: requestedId,
              equipmentCode: `EQ-${key.toUpperCase()}`,
              equipmentName: accessory
                ? key === 'a'
                  ? isGauge
                    ? '旧压力表甲'
                    : '旧安全阀甲'
                  : isGauge
                    ? '当前压力表乙'
                    : '当前安全阀乙'
                : key === 'a'
                  ? '旧设备甲'
                  : '当前设备乙',
              profileType: accessory ? (isGauge ? 'pressure_gauge' : 'safety_valve') : 'general',
              pressureGaugeIds: accessory ? [] : [gaugeIds[key]],
              safetyValveIds: accessory ? [] : [valveIds[key]]
            }
          })
        })
        await page.goto(`/tests/e2e/fixtures/form-standard-smis.html?entry=${entry}&read-session=1`)
        await page.evaluate(() => {
          window.smisReadSessionRecord = 'a'
        })
        const open = page.getByRole('button', { name: '打开真实 SMIS 入口', exact: true })
        await open.click()
        const expectedPending =
          entry === 'violation-record' || (entry === 'equipment' && phase === 'selectedRows')
            ? 2
            : 1
        await expect.poll(() => pending.a).toBeGreaterThanOrEqual(expectedPending)
        owner = 'b'
        await page.evaluate(() => {
          window.smisReadSessionRecord = 'b'
        })
        // 模拟父组件重开上下文；不代表加载遮罩下可以点击外部页面。
        await open.evaluate((button: HTMLButtonElement) => button.click())
        await expect.poll(() => pending.b).toBeGreaterThanOrEqual(expectedPending)
        const dialogClass =
          entry === 'equipment'
            ? 'equipment-ledger-dialog'
            : entry === 'shift-calendar'
              ? 'shift-calendar'
              : `${entry}-dialog`
        const dialog = page.getByRole('dialog').filter({ has: page.locator(`.${dialogClass}`) })
        const mask = dialog.locator('.art-overlay-loading')
        if (currentReady) {
          currentGate.resolve()
          await expect(page.getByTestId('read-open-completions')).toHaveText('1')
          await expect(mask).toBeHidden()
        }
        oldGate.resolve()
        await expect(page.getByTestId('read-open-completions')).toHaveText(currentReady ? '2' : '1')
        expect
          .soft(await mask.isVisible(), `${phase}: 旧读取不得改变当前加载状态`)
          .toBe(!currentReady)
        expect
          .soft(await dialog.locator('.el-alert--error').count(), `${phase}: 旧读取不覆盖当前错误`)
          .toBe(0)
        if (entry === 'equipment') {
          expect.soft(await dialog.getByText('旧压力表甲', { exact: true }).count()).toBe(0)
          expect.soft(await dialog.getByText('旧安全阀甲', { exact: true }).count()).toBe(0)
          if (phase === 'selectedRows' || currentReady)
            await expect
              .soft(dialog.locator('[data-art-form-item-key="equipmentName"] input'))
              .toHaveValue('当前设备乙')
        }
        if (!currentReady) {
          currentGate.resolve()
          await expect(page.getByTestId('read-open-completions')).toHaveText('2')
        }
        await expect(mask).toBeHidden()
        if (entry === 'shift-calendar') {
          await expect
            .soft(dialog.locator('.shift-calendar__toolbar strong'))
            .toHaveText('当前人员乙')
          await expect.soft(dialog.getByText('当前班次乙', { exact: true })).toHaveCount(1)
        } else if (entry === 'inspection-rectification') {
          await expect
            .soft(dialog.locator('.inspection-rectification-dialog__summary'))
            .toContainText('HG-CURRENT-B')
        } else if (entry === 'violation-record') {
          await expect
            .soft(dialog.locator('[data-art-form-item-key="situationDescription"] textarea'))
            .toHaveValue('当前记录乙现场情况')
          await dialog.locator('[data-art-form-item-key="siteId"] input').click()
          const picker = page.getByRole('dialog', { name: '选择违章地点', exact: true })
          await expect(picker).toBeVisible()
          await expect.soft(picker.getByText('当前场所乙', { exact: true })).toHaveCount(1)
          await expect.soft(picker.getByText('旧场所甲', { exact: true })).toHaveCount(0)
          await picker.getByRole('button', { name: '取消', exact: true }).click()
        } else {
          await expect
            .soft(dialog.locator('[data-art-form-item-key="equipmentName"] input'))
            .toHaveValue('当前设备乙')
          await dialog.getByRole('tab', { name: '档案资料', exact: true }).click()
          await expect.soft(dialog.getByText('当前压力表乙', { exact: true })).toHaveCount(1)
          await expect.soft(dialog.getByText('当前安全阀乙', { exact: true })).toHaveCount(1)
        }
        if (oldFails && currentReady && (entry !== 'equipment' || phase === 'selectedRows')) {
          await dialog.getByRole('button', { name: /^关闭(弹窗|抽屉)$/ }).click()
          await expect(dialog).toBeHidden()
          currentFailure = true
          await open.click()
          await expect(page.getByTestId('read-open-completions')).toHaveText('3')
          await expect(mask).toBeHidden()
          currentFailure = false
          if (entry === 'equipment') {
            await expect(dialog.getByText('设备资料加载失败', { exact: true })).toBeVisible()
            await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
            await expect(dialog.getByText('设备资料加载失败', { exact: true })).toHaveCount(0)
            await expect(
              dialog.locator('[data-art-form-item-key="equipmentName"] input')
            ).toHaveValue('当前设备乙')
            await dialog.getByRole('tab', { name: '档案资料', exact: true }).click()
            await expect(dialog.getByText('当前压力表乙', { exact: true })).toHaveCount(1)
            await expect(dialog.getByText('当前安全阀乙', { exact: true })).toHaveCount(1)
          } else if (entry === 'shift-calendar') {
            await expect(dialog.locator('.shift-calendar__assignment')).toHaveCount(0)
            await dialog.getByRole('combobox', { name: '选择倒班月份', exact: true }).click()
            await page
              .locator('.el-month-table:visible')
              .getByText('十二月', { exact: true })
              .click()
            await expect(dialog.getByText('当前班次乙', { exact: true })).toHaveCount(1)
            await expect(mask).toBeHidden()
          } else {
            // 真实页面 loader 将 provider 失败映射为空候选；使用原有关闭、重开恢复读取。
            if (entry === 'inspection-rectification')
              await expect(dialog.locator('.inspection-rectification-dialog__summary')).toHaveCount(
                0
              )
            await dialog.getByRole('button', { name: /^关闭(弹窗|抽屉)$/ }).click()
            await expect(dialog).toBeHidden()
            await open.click()
            await expect(page.getByTestId('read-open-completions')).toHaveText('4')
            await expect(mask).toBeHidden()
            if (entry === 'inspection-rectification') {
              await expect(
                dialog.locator('.inspection-rectification-dialog__summary')
              ).toContainText('HG-CURRENT-B')
            } else {
              await expect(
                dialog.locator('[data-art-form-item-key="situationDescription"] textarea')
              ).toHaveValue('当前记录乙现场情况')
              await dialog.locator('[data-art-form-item-key="siteId"] input').click()
              const picker = page.getByRole('dialog', { name: '选择违章地点', exact: true })
              await expect(picker).toBeVisible()
              await expect(picker.getByText('当前场所乙', { exact: true })).toHaveCount(1)
              await picker.getByRole('button', { name: '取消', exact: true }).click()
            }
          }
        }
        await page.screenshot({
          path: info.outputPath(
            `${entry}-${phase}-${oldFails ? 'old-error' : 'old-success'}-${currentReady ? 'ready' : 'pending'}.png`
          ),
          animations: 'disabled'
        })
        await dialog.getByRole('button', { name: /^关闭(弹窗|抽屉)$/ }).click()
        await expect(dialog).toBeHidden()
      }
    }
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}

interface Write {
  path: string
  payload: unknown
}

const longInspectionIdentity = {
  inspectionTypeName: '装配生产线与设备安全日常综合检查',
  inspectionOrganizationName: '华东装备制造园区生产运营与安全监督管理中心',
  inspectedOrganizationName: '智能装备装配事业部设备维护与工艺保障联合班组',
  executorEmployeeName: '张明远（设备与生产运营联合排查负责人）',
  executorEmployeeNo: 'EMP-SMIS-INSPECTION-2026-0000123456789'
}
const longRiskIdentity = {
  responsibleEmployeeName: '王晓宁（生产设备与工艺风险管控责任人）',
  responsibleEmployeeNo: 'EMP-SMIS-RISK-OWNER-2026-0000123456789',
  assigneeEmployeeName: '李文青（园区安全与设备巡查执行负责人）',
  assigneeEmployeeNo: 'EMP-SMIS-RISK-ASSIGNEE-2026-0000123456789',
  actualExecutorEmployeeName: '陈子安（跨部门联合风险巡查实际执行人）'
}
const longGovernanceContext = {
  sourceRecordNo: longHazardSource.sourceRecordNo,
  reporterEmployeeName: '张明远（生产装配与设备安全联合排查上报负责人）',
  reporterEmployeeNo: 'EMP-SMIS-GOVERNANCE-REPORTER-2026-0000123456789',
  approverEmployeeName: '王晓宁（园区安全与生产运营隐患核准负责人）',
  approverEmployeeNo: 'EMP-SMIS-GOVERNANCE-APPROVER-2026-0000123456789',
  rectificationResponsibleEmployeeName: '李文青（生产设备防护与联锁整改责任人）',
  rectificationResponsibleEmployeeNo: 'EMP-SMIS-GOVERNANCE-RECTIFIER-2026-0000123456789',
  acceptorEmployeeName: '陈子安（设备维护与安全管理联合验收负责人）',
  acceptorEmployeeNo: 'EMP-SMIS-GOVERNANCE-ACCEPTOR-2026-0000123456789'
} satisfies Partial<SmisHiddenHazardGovernanceDetail>
const longInspectionItem = {
  standardName: '机械设备传动系统防护装置与联锁停机安全检查标准（生产装配区联合巡查适用）',
  standardCode: 'STD-SMIS-ASSEMBLY-GUARD-INTERLOCK-2026-0000123456789-END',
  itemCode: 'CHECK-SMIS-ASSEMBLY-GUARD-INTERLOCK-2026-0000123456789-END',
  inspectionContent:
    '检查传动轴、联轴器和输送装置的防护罩固定可靠，逐项确认检修门联锁及紧急停机功能有效；发现松动、缺失或联锁失效时立即停止设备，并记录位置、隔离措施和复核结果，确认全部符合要求后方可恢复运行。检查指令结束。',
  remark:
    '现场发现输送装置检修门联锁接线松动，已由值班人员停止设备、挂牌隔离并通知维修班组；复核时应对照原始检查项逐点验证，保存整改前后记录，未经确认不得解除隔离。执行说明结束。',
  hazardNo: 'HAZARD-SMIS-ASSEMBLY-GUARD-INTERLOCK-2026-0000123456789-END'
}

for (const entry of [
  'hazard-factor-category',
  'operation-type',
  'inspection-category',
  'special-operation-catalog'
]) {
  test(`配置摘要完整显示租户范围：${entry}`, async ({ page }, info) => {
    const tenantName = '华东智能装备制造园区生产运营与安全监督管理有限公司'
    const writes: Write[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const dialog = await open(page, entry, writes, `&tenantName=${encodeURIComponent(tenantName)}`)
    const title = dialog.locator('.art-entity-summary__content strong').first()
    await expect(title).toContainText(tenantName)
    for (const appearance of [
      { width: 1440, theme: 'light', boxBorderMode: true },
      { width: 390, theme: 'dark', boxBorderMode: false },
      { width: 320, theme: 'light', boxBorderMode: true }
    ] as const) {
      await page.setViewportSize({ width: appearance.width, height: 900 })
      await page.emulateMedia({ colorScheme: appearance.theme })
      await page.evaluate(async (appearance) => {
        const { useTheme }: typeof import('../../src/hooks/core/useTheme') = await import(
          new URL('/src/hooks/core/useTheme.ts', location.origin).href
        )
        const { SystemThemeEnum }: typeof import('../../src/enums/app-enum') = await import(
          new URL('/src/enums/app-enum.ts', location.origin).href
        )
        const { useSettingStore }: typeof import('../../src/store/modules/setting') = await import(
          new URL('/src/store/modules/setting.ts', location.origin).href
        )
        useTheme().switchThemeStyles(
          appearance.theme === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
        )
        useSettingStore().boxBorderMode = appearance.boxBorderMode
        document.documentElement.dataset.boxMode = appearance.boxBorderMode
          ? 'border-mode'
          : 'shadow-mode'
        await document.fonts.ready
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
      }, appearance)
      await assertAppearance(page, appearance)
      await title.scrollIntoViewIfNeeded()
      const geometry = await title.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const summary = element.closest('.art-entity-summary')!.getBoundingClientRect()
        const dialog = element.closest('.art-dialog')!.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(element)
        const rects = [...range.getClientRects()].filter((rect) => rect.width && rect.height)
        const inside = (rect: DOMRect, container: DOMRect) =>
          rect.left >= container.left - 1 &&
          rect.right <= container.right + 1 &&
          rect.top >= container.top - 1 &&
          rect.bottom <= container.bottom + 1
        return {
          text: range.toString(),
          textInside: rects.length > 0 && rects.every((rect) => inside(rect, bounds)),
          titleInside: inside(bounds, summary),
          summaryInside: inside(summary, dialog),
          horizontalOverflow: document.documentElement.scrollWidth - innerWidth
        }
      })
      await info.attach(`summary-${appearance.width}-geometry`, {
        body: JSON.stringify(geometry, null, 2),
        contentType: 'application/json'
      })
      await page.screenshot({
        path: info.outputPath(`summary-${appearance.width}-${appearance.theme}.png`),
        animations: 'disabled'
      })
      expect.soft(geometry.textInside, `${appearance.width}px租户名称应完整显示`).toBe(true)
      expect.soft(geometry.titleInside).toBe(true)
      expect.soft(geometry.summaryInside).toBe(true)
      expect.soft(geometry.horizontalOverflow).toBeLessThanOrEqual(1)
    }
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}

async function chooseColor(page: Page, key: string, value: string) {
  await page.locator(`[data-art-form-item-key="${key}"] .el-color-picker__trigger`).click()
  const picker = page.getByRole('dialog').filter({
    has: page.getByRole('button', { name: '清空', exact: true })
  })
  await picker.getByRole('textbox').fill(value)
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(picker).toBeHidden()
}

test('危害因素颜色元数据更新视觉标识并保留租户提交', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'hazard-factor-category', writes)
  await chooseColor(page, 'textColor', '#67C23A')
  await expect(dialog.locator('[data-art-form-item-key="textColor"]')).toContainText(/#67c23a/i)
  await dialog.screenshot({ path: info.outputPath('hazard-factor-color.png') })
  await dialog.getByRole('button', { name: '保存危害因素类别', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes[0].payload).toMatchObject({
    p_tenant_id: tenantId,
    p_payload: { category_code: 'HF-TEST' }
  })
  expect(
    (writes[0].payload as { p_payload: { text_color: string } }).p_payload.text_color.toUpperCase()
  ).toBe('#67C23A')
})

test('风险图形原生颜色字段更新填充与边框', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/form-standard-smis.html?entry=risk-map-properties')
  await chooseColor(page, 'fillColor', '#67C23A')
  await chooseColor(page, 'borderColor', '#409EFF')
  await expect(page.locator('[data-art-form-item-key="fillColor"]')).toContainText(/#67c23a/i)
  await expect(page.locator('[data-art-form-item-key="borderColor"]')).toContainText(/#409eff/i)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  ).toBeLessThanOrEqual(1)
  await page.locator('[data-art-form-item-key="fillColor"]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('risk-map-colors-mobile.png') })
})

test('动态评价维度元数据保留必选校验与计算结果', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'risk-evaluation', writes)
  await dialog.getByRole('button', { name: '提交定量评价', exact: true }).click()
  await expect(dialog.locator('.el-form-item.is-error')).toHaveCount(3)
  for (const code of ['L', 'E', 'C']) {
    await dialog.locator(`[data-art-form-item-key="${code}"] .el-select`).click()
    await page
      .getByRole('option')
      .filter({ hasText: `验收${code}判定` })
      .click()
  }
  await expect(dialog.locator('.el-form-item.is-error')).toHaveCount(0)
  await expect(dialog.locator('.el-form-item__error:visible')).toHaveCount(0)
  await expect(dialog.getByText('验收低风险', { exact: true })).toBeVisible()
  await dialog.screenshot({ path: info.outputPath('risk-evaluation.png') })
  await dialog.getByRole('button', { name: '提交定量评价', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes[0].payload).toMatchObject({
    p_method_code: 'LEC',
    p_l_value: 2,
    p_e_value: 2,
    p_c_value: 2,
    p_s_value: null
  })
})

test('岗位指导书链接元数据更新文件且保留选中岗位', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'work-instruction', writes)
  await expect(field(dialog, '适用组织岗位')).toContainText('验收岗位')
  await dialog.getByRole('button', { name: '查看或修改链接', exact: true }).click()
  await field(dialog, '文件链接').getByRole('textbox').fill('https://example.invalid/updated.pdf')
  await dialog.screenshot({ path: info.outputPath('work-instruction-link.png') })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes[0].payload).toMatchObject({
    p_payload: {
      file_url: 'https://example.invalid/updated.pdf',
      scopes: [{ organization_id: organizationId, position_id: itemId }]
    }
  })
})

test('文档登记原生上传字段保留既有版本提示与保存负载', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'document-register', writes)
  await expect(dialog.getByRole('button', { name: '选择文档附件', exact: true })).toBeVisible()
  await expect(
    dialog.getByText('当前附件：验收附件.pdf。不重新上传则保留现有版本。', { exact: true })
  ).toBeVisible()
  await field(dialog, '文件名称').getByRole('textbox').fill('验收文档更新')
  await dialog.screenshot({ path: info.outputPath('document-upload.png') })
  await dialog.getByRole('button', { name: '保存更改', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes[0].payload).toMatchObject({
    p_kind: 'required_knowledge',
    p_payload: { file_name: '验收文档更新', attachment_url: null }
  })
})

test('危险源统计查询使用配置化组织字段', async ({ page }, info) => {
  const requests: Write[] = []
  const dialog = await open(page, 'hazard-statistics', requests)
  const organizationField = dialog.locator('[data-art-form-item-key="organizationId"]')
  await expect(organizationField).toContainText('系统组织部门')
  await expect(organizationField.getByRole('combobox')).toBeVisible()
  await dialog.getByRole('button', { name: '查询', exact: true }).click()
  await expect.poll(() => requests.length).toBe(2)
  expect(requests[1].payload).toMatchObject({ p_organization_id: null })
  await dialog.screenshot({ path: info.outputPath('hazard-statistics-query.png') })
})

test('隐患排查动态字段保留异常说明校验与项目标识', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'hidden-task-execution', writes)
  await expect(dialog.getByText('ITEM-SMIS · 验收通道保持畅通', { exact: true })).toBeVisible()
  await dialog
    .locator('[data-art-form-item-key="items.0.result"]')
    .getByText('异常', { exact: true })
    .click()
  await dialog.getByRole('button', { name: '提交并完成', exact: true }).click()
  await expect(page.locator('.el-message')).toContainText('异常项目必须填写问题说明')
  expect(writes).toEqual([])
  await dialog
    .locator('[data-art-form-item-key="items.0.remark"] textarea')
    .fill('验收通道堆物，已现场通知清理')
  await dialog.screenshot({ path: info.outputPath('hidden-task-execution.png') })
  await dialog.getByRole('button', { name: '提交并完成', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes[0].payload).toMatchObject({
    p_id: recordId,
    p_complete: true,
    p_items: [
      {
        id: itemId,
        result: 'abnormal',
        remark: '验收通道堆物，已现场通知清理',
        attachment_urls: []
      }
    ]
  })
})

async function open(page: Page, entry: string, writes: Write[], query = '') {
  await prepareIsolatedSession(page, { tenantId, platformSuper: !query.includes('&ordinary=1') })
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    if (path.endsWith('/smis_hazard_source_statistics_secure')) {
      writes.push({ path, payload: request.postDataJSON() })
      return route.fulfill({ json: { rows: [], total: 0 } })
    }
    if (path.endsWith('/smis_risk_assessment_model'))
      return route.fulfill({
        json: [
          {
            id: itemId,
            tenantId,
            methodCode: 'LEC',
            modelName: '验收LEC模型',
            status: 'enabled',
            dimensions: ['L', 'E', 'C'].map((code, index) => ({
              id: code,
              dimensionCode: code,
              dimensionName: '验收' + code + '维度',
              sort: index,
              criteria: [
                { id: code + '-2', score: 2, criterionText: '验收' + code + '判定', sort: 1 }
              ]
            })),
            levels: [
              {
                id: 'level-test',
                levelCode: 'low',
                levelName: '验收低风险',
                minScore: 0,
                maxScore: 100,
                color: '#2563eb',
                sort: 1
              }
            ]
          }
        ]
      })
    if (path.endsWith('/smis_list_question_bank_secure'))
      return route.fulfill({
        json: {
          records: entry === 'question' ? [] : [question],
          total: entry === 'question' ? 0 : 1,
          categories: [questionCategory]
        }
      })
    if (
      path.endsWith('/smis_list_courses_secure') ||
      path.endsWith('/smis_list_exam_papers_secure')
    )
      return route.fulfill({ json: { records: [], total: 0 } })
    if (
      path.endsWith('/smis_manage_course_secure') ||
      path.endsWith('/smis_manage_exam_paper_secure') ||
      path.endsWith('/smis_manage_question_secure')
    ) {
      writes.push({ path, payload: request.postDataJSON() })
      return route.fulfill({ json: { id: recordId, totalScore: 100 } })
    }
    if (path.endsWith('/mdm_organization'))
      return route.fulfill({
        json: [{ ...organization, organization_type: 'department', status: '1', sort: 10 }]
      })
    if (path.endsWith('/smis_get_hidden_hazard_governance_secure'))
      return route.fulfill({
        json: query.includes('pending')
          ? {
              ...hazardGovernance,
              status: 'pending_approval',
              approvedAt: null,
              acceptedAt: null,
              approvalResult: null,
              acceptanceResult: null,
              events: [
                {
                  id: itemId,
                  eventType: 'registered',
                  eventTitle: '验收隐患登记事件',
                  evidenceUrls: [],
                  eventAt: hazardGovernance.reportedAt
                }
              ]
            }
          : {
              ...hazardGovernance,
              ...(entry === 'hazard-governance-detail' && query.includes('&longValues=1')
                ? longGovernanceContext
                : {})
            }
      })
    if (path.endsWith('/smis_get_hidden_hazard_inspection_task_secure'))
      return route.fulfill({
        json: {
          ...hiddenTaskDetail,
          ...(query.includes('&longValues=1')
            ? {
                ...longInspectionIdentity,
                sourcePlanNo: 'HP-SMIS-SOURCE-PLAN-2026-0000123456789',
                items: hiddenTaskDetail.items.map((item) => ({
                  ...item,
                  standardName: longInspectionItem.standardName,
                  itemCode: longInspectionItem.itemCode,
                  inspectionContent: longInspectionItem.inspectionContent,
                  remark: longInspectionItem.remark,
                  hiddenHazardNo: longInspectionItem.hazardNo,
                  result: 'abnormal'
                }))
              }
            : {})
        }
      })
    if (path.endsWith('/smis_get_risk_inspection_task_secure'))
      return route.fulfill({
        json:
          entry === 'risk-task-execution'
            ? {
                ...riskTaskDetail,
                status: 'in_progress',
                items: riskTaskDetail.items.map((item) => ({
                  ...item,
                  result: 'pending',
                  remark: null
                }))
              }
            : {
                ...riskTaskDetail,
                ...(query.includes('&longValues=1')
                  ? {
                      ...longRiskIdentity,
                      items: riskTaskDetail.items.map((item) => ({
                        ...item,
                        hazardSource: longInspectionItem.standardName,
                        hazardNo: longInspectionItem.hazardNo,
                        inspectionContent: longInspectionItem.inspectionContent,
                        remark: longInspectionItem.remark,
                        result: 'abnormal'
                      }))
                    }
                  : {})
              }
      })
    if (path.endsWith('/smis_list_risk_hazard_workspace_secure'))
      return route.fulfill({ json: { activities: [], hazards: [] } })
    if (
      path.endsWith('/smis_cancel_risk_inspection_task_secure') ||
      path.endsWith('/smis_transition_special_operation_permit_secure')
    ) {
      writes.push({ path, payload: request.postDataJSON() })
      return route.fulfill({ json: null })
    }
    if (path.endsWith('/smis_risk_inspection_task') && request.method() === 'GET')
      return route.fulfill({ json: { tenant_id: tenantId } })
    if (path.endsWith('/smis_position_risk_control') && request.method() === 'PATCH') {
      writes.push({ path, payload: request.postDataJSON() })
      return route.fulfill({ status: 204, body: '' })
    }
    if (path.endsWith('/smis_list_active_risk_positions_secure'))
      return route.fulfill({ json: { records: [riskPosition], total: 1 } })
    if (path.endsWith('/smis_list_ppe_scope_options_secure'))
      return route.fulfill({
        json:
          request.postDataJSON().p_kind === 'organization'
            ? issuanceStandard.organizations
            : issuanceStandard.positions
      })
    if (path.endsWith('/smis_list_active_emergency_rescue_plan_options_secure'))
      return route.fulfill({ json: [rescuePlan] })
    if (path.endsWith('/material_unit_compatibility_options'))
      return route.fulfill({
        json: [
          {
            id: unit.id,
            label: unit.unitName,
            value: unit.unitCode,
            dict_type_table: { code: 'smisMaterialUnit', name: '计量单位' }
          }
        ]
      })
    if (path.endsWith('/smis_list_inspection_categories_secure'))
      return route.fulfill({ json: { records: [inspectionCategory], total: 1 } })
    if (path.endsWith('/smis_list_suppliers_secure'))
      return route.fulfill({
        json: {
          records: [
            {
              id: organizationId,
              supplierCode: 'AGENCY-SMIS',
              supplierName: '验收检验机构',
              supplierCategory: 'inspection_agency'
            }
          ],
          total: 1
        }
      })
    if (path.endsWith('/sys_dictionary')) {
      const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '') || ''
      return route.fulfill({
        json: (dictionaries[code] ?? []).map((item, index) => ({
          ...item,
          id: `${code}-${item.value}`,
          sort: index,
          status: '1',
          dict_type_table: { code, name: code }
        }))
      })
    }
    if (path.endsWith('/smis_get_special_operation_permit_secure'))
      return route.fulfill({ json: permit })
    if (path.endsWith('/smis_get_hidden_hazard_inspection_plan_secure'))
      return route.fulfill({
        json: {
          ...planDetail,
          ...(query.includes('&longValues=1')
            ? {
                ...longInspectionIdentity,
                items: planDetail.items.map((item) => ({
                  ...item,
                  standardName: longInspectionItem.standardName,
                  standardCode: longInspectionItem.standardCode,
                  itemCode: longInspectionItem.itemCode,
                  inspectionContent: longInspectionItem.inspectionContent
                }))
              }
            : {}),
          ...(query.includes('&attachments=long') ? { attachmentUrls: readonlyAttachmentUrls } : {})
        }
      })
    if (path.endsWith('/smis_list_special_operation_catalog_secure'))
      return route.fulfill({ json: { records: [], total: 0 } })
    if (/\/smis_(?:save|submit_hazard_source_report)_/.test(path)) {
      writes.push({ path, payload: request.postDataJSON() })
      return route.fulfill({ json: recordId })
    }
    return route.fallback()
  })
  await page.goto(`/tests/e2e/fixtures/form-standard-smis.html?entry=${entry}${query}`)
  const pageActions: Record<string, string> = {
    course: '新增课程',
    exam: '创建试卷',
    question: '新增题目'
  }
  await page
    .getByRole('button', { name: pageActions[entry] || '打开真实 SMIS 入口', exact: true })
    .click()
  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible()
  if (
    ![
      'hazard-factor-category',
      'inspection-category',
      'special-operation-catalog',
      'hidden-task-execution',
      'risk-task-execution',
      'risk-task-cancel',
      'permit-void',
      'permit-approval',
      'safety-risk',
      'risk-evaluation',
      'hazard-statistics',
      'document-register',
      'work-instruction'
    ].includes(entry)
  )
    await expect(dialog.getByRole('tablist').first()).toBeVisible()
  await expect(dialog.locator('.el-loading-mask:visible')).toHaveCount(0)
  return dialog
}

function field(dialog: Locator, label: string) {
  return dialog
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"el-form-item")][1]')
}

async function submit(dialog: Locator, entry: string) {
  const names: Record<string, string> = {
    permit: '提交审批',
    'risk-point': '保存风险点',
    'risk-control-plan': '保存管控设置',
    supplier: '保存更改',
    'inspection-plan': '保存更改',
    'inspection-declaration': '保存检验申报',
    'hazard-source': '保存并提交',
    material: '保存物料信息',
    'waste-catalog': '保存名录',
    'public-report': '登记举报隐患',
    'rescue-plan': '保存并提交',
    'drill-plan': '保存并提交',
    'drill-record': '保存并提交',
    'historical-case': '保存更改',
    depreciation: '保存折旧方法',
    'position-control': '保存',
    site: '保存',
    measure: '保存防控措施',
    'operation-type': '保存更改',
    'issuance-standard': '保存标准',
    'training-plan': '保存草稿',
    'training-record': '保存草稿',
    equipment: '保存设备台账',
    announcement: '保存为草稿',
    'accident-report': '保存更改'
  }
  await dialog.getByRole('button', { name: names[entry], exact: true }).click()
}

const cases = [
  {
    entry: 'training-plan',
    label: '培训主题',
    tab: '计划与组织',
    other: '内容与考核',
    value: '验收修正设备安全培训'
  },
  {
    entry: 'announcement',
    label: '公告标题',
    tab: '公告信息',
    other: '范围与附件',
    value: '验收修正安全公告'
  },
  {
    entry: 'equipment',
    label: '设备名称',
    tab: '基本信息',
    other: '档案资料',
    value: '验收修正装配设备'
  },
  {
    entry: 'accident-report',
    label: '事故名称',
    tab: '事故信息',
    other: '防范措施',
    value: '验收修正机械伤害快报'
  },
  {
    entry: 'position-control',
    label: '危害因素',
    tab: '危害与管控',
    other: '隐患分类',
    value: '验收修正机械传动危害'
  },
  {
    entry: 'site',
    label: '场所名称',
    tab: '层级与归属',
    other: '位置与图片',
    value: '验收修正装配场所'
  },
  {
    entry: 'measure',
    label: '防控措施',
    tab: '防控措施',
    other: '岗位与周期',
    value: '验收修正防护罩措施'
  },
  {
    entry: 'operation-type',
    label: '作业类型',
    tab: '类型信息',
    other: '作业专有字段',
    value: '验收修正盲板类型'
  },
  {
    entry: 'issuance-standard',
    label: '发放标准名称',
    tab: '标准基础',
    other: '明细标准',
    value: '验收修正防护标准'
  },
  {
    entry: 'supplier',
    label: '单位编码',
    tab: '单位信息',
    other: '联系与位置',
    value: 'sup_smis_valid'
  },
  {
    entry: 'risk-point',
    label: '风险点名称',
    tab: '风险点与设备',
    other: '方案与证据',
    value: '验收修正风险点'
  },
  {
    entry: 'inspection-plan',
    label: '计划名称',
    tab: '计划信息',
    other: '排查明细',
    value: '验收修正隐患计划'
  },
  {
    entry: 'permit',
    label: '作业内容',
    tab: '基础与专项信息',
    other: '安全与说明',
    value: '验收修正设备隔离作业'
  },
  {
    entry: 'hazard-source',
    label: '危险源名称',
    tab: '危险源与责任',
    other: '评价与资料',
    value: '验收修正气瓶存放区'
  },
  {
    entry: 'material',
    label: '物料名称',
    tab: '物料识别',
    other: '扩展与资料',
    value: '验收修正防护用品'
  },
  {
    entry: 'waste-catalog',
    label: '危废名称',
    tab: '危废识别',
    other: '特性与管理',
    value: '验收修正废矿物油'
  },
  {
    entry: 'rescue-plan',
    label: '预案名称',
    tab: '预案与范围',
    other: '评审与资料',
    value: '验收修正综合应急预案'
  },
  {
    entry: 'drill-plan',
    label: '计划名称',
    tab: '预案与责任',
    other: '参训与资料',
    value: '验收修正消防应急演练'
  },
  {
    entry: 'historical-case',
    label: '事故名称',
    tab: '案例信息',
    other: '案例内容',
    value: '验收修正机械伤害案例'
  },
  {
    entry: 'depreciation',
    label: '折旧名称',
    tab: '基本信息',
    other: '年折旧率',
    value: '验收修正两年折旧'
  }
]

for (const scenario of cases)
  test(`${scenario.entry} 从非当前页定位必填控件，修正后保存真实负载`, async ({ page }, info) => {
    const writes: Write[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const appearance: Parameters<typeof prepareAppearance>[1] | undefined =
      scenario.entry === 'position-control'
        ? {
            theme: (page.viewportSize()?.width ?? 1440) < 768 ? 'dark' : 'light',
            boxBorderMode: false
          }
        : undefined
    if (appearance) await prepareAppearance(page, appearance)
    const dialog = await open(
      page,
      scenario.entry,
      writes,
      appearance ? `&theme=${appearance.theme}` : ''
    )
    if (appearance) {
      await assertAppearance(page, appearance)
      await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
      const form = dialog.locator('.art-form:has(> .el-form > .art-form__tabs--overlay)').first()
      const card = form.locator(':scope > .el-form > .art-form__tabs--overlay')
      const context = form.locator('[data-art-form-item-key="context"]')
      await expect(form).not.toHaveClass(/art-form--overlay-tabs-only/)
      await expect(card).toHaveCount(1)
      await expect(context.getByText('验收安全岗', { exact: true })).toBeVisible()
      await expect(card.locator('[data-art-form-item-key="hazardFactor"] textarea')).toHaveValue(
        '验收机械传动部位'
      )
      await expect(card.locator('.el-skeleton:visible')).toHaveCount(0)
      const geometry = await card.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const context = element
          .closest('.art-form')!
          .querySelector('[data-art-form-item-key="context"]')!
        const contextRect = context.getBoundingClientRect()
        const ancestors = []
        for (let node = element.parentElement; node; node = node.parentElement) {
          const style = getComputedStyle(node)
          const bounds = node.getBoundingClientRect()
          const sx = node.offsetWidth ? bounds.width / node.offsetWidth : 1
          const sy = node.offsetHeight ? bounds.height / node.offsetHeight : 1
          const bothClip = style.overflowX === 'clip' && style.overflowY === 'clip'
          const margin = bothClip
            ? Number(style.getPropertyValue('overflow-clip-margin').match(/([\d.]+)px/)?.[1] ?? 0)
            : 0
          const paintContain = /(^|\s)(paint|strict|content)(\s|$)/.test(style.contain)
          const clipX =
            paintContain || ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowX)
          const clipY =
            paintContain || ['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)
          const left = bounds.left + node.clientLeft * sx
          const top = bounds.top + node.clientTop * sy
          ancestors.push({
            tag: node.tagName,
            className: node.className,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            appliedClipMargin: margin,
            clipX,
            clipY,
            leftRoom: rect.left - left + margin * sx,
            rightRoom: left + node.clientWidth * sx + margin * sx - rect.right,
            topRoom: rect.top - top + margin * sy
          })
        }
        return {
          card: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
          contextBottom: contextRect.bottom,
          contextInsideCard: element.contains(context),
          shadow: getComputedStyle(element).boxShadow,
          ancestors,
          viewportWidth: innerWidth,
          horizontalOverflow: document.documentElement.scrollWidth - innerWidth
        }
      })
      await info.attach('position-control-common-fields-shadow', {
        body: JSON.stringify(geometry, null, 2),
        contentType: 'application/json'
      })
      await dialog.screenshot({
        path: info.outputPath('position-control-common-fields-shadow.png'),
        animations: 'disabled'
      })
      expect(geometry.contextInsideCard).toBe(false)
      expect(geometry.contextBottom).toBeLessThanOrEqual(geometry.card.top + 1)
      expect(geometry.shadow).not.toBe('none')
      expect(geometry.card.left).toBeGreaterThanOrEqual(6)
      expect(geometry.card.right).toBeLessThanOrEqual(geometry.viewportWidth - 6)
      expect(geometry.horizontalOverflow).toBeLessThanOrEqual(1)
      for (const ancestor of geometry.ancestors) {
        if (ancestor.clipX) {
          expect(
            ancestor.leftRoom,
            `${ancestor.className}: left shadow space`
          ).toBeGreaterThanOrEqual(5.5)
          expect(
            ancestor.rightRoom,
            `${ancestor.className}: right shadow space`
          ).toBeGreaterThanOrEqual(5.5)
        }
        if (ancestor.clipY)
          expect(
            ancestor.topRoom,
            `${ancestor.className}: top shadow space`
          ).toBeGreaterThanOrEqual(5.5)
      }
    }
    const input = field(dialog, scenario.label).getByRole('textbox')
    await input.fill('')
    await dialog.getByRole('tab', { name: scenario.other, exact: true }).click()
    await submit(dialog, scenario.entry)
    await expect(dialog.getByRole('tab', { name: scenario.tab, exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(input).toBeFocused()
    await expect(field(dialog, scenario.label)).toHaveClass(/is-error/)
    await expect(field(dialog, scenario.label).locator('.el-form-item__error')).toBeVisible()
    expect(writes).toHaveLength(0)
    await page.screenshot({ path: info.outputPath(`${scenario.entry}-cross-tab-validation.png`) })
    await input.fill(scenario.value)
    await dialog.getByRole('tab', { name: scenario.other, exact: true }).click()
    await submit(dialog, scenario.entry)
    await expect(page.getByTestId('save-result')).toHaveText('已保存')
    expect(writes).toHaveLength(1)
    if (scenario.entry === 'training-plan')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_publish: false,
        p_payload: {
          subject: scenario.value,
          participant_ids: [employeeId],
          organizer_organization_id: organizationId,
          content: '验收安全规程培训内容'
        }
      })
    if (scenario.entry === 'announcement')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_payload: {
          title: scenario.value,
          content_text: '验收安全公告正文',
          audience_type: 'all',
          category_id: itemId
        }
      })
    if (scenario.entry === 'equipment')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_payload: {
          equipment_name: scenario.value,
          using_organization_id: organizationId,
          managing_organization_id: organizationId,
          category_id: itemId,
          equipment_kind: 'general'
        }
      })
    if (scenario.entry === 'accident-report')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_payload: {
          accident_name: scenario.value,
          reporter_employee_id: employeeId,
          accident_categories: ['mechanical_injury'],
          on_site_count: 2,
          measures: [{ planned_measure: '验收增加固定防护罩', responsible_employee_id: employeeId }]
        }
      })
    if (scenario.entry === 'position-control')
      expect(writes[0]).toMatchObject({
        path: '/rest/v1/smis_position_risk_control',
        payload: {
          organization_id: organizationId,
          position_id: itemId,
          hazard_factor: scenario.value,
          secondary_hazard_category: 'safety_rules'
        }
      })
    if (scenario.entry === 'site')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_payload: {
          site_name: scenario.value,
          organization_id: organizationId,
          address_detail: '验收路 8 号',
          image_urls: []
        }
      })
    if (scenario.entry === 'measure')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_risk_item_id: itemId,
        p_payload: { control_measure: scenario.value, control_measure_category: 'engineering' },
        p_positions: [{ position_id: itemId, frequency_count: 1, frequency_unit: 'day' }]
      })
    if (scenario.entry === 'operation-type')
      expect(writes[0].payload).toMatchObject({
        p_id: operationTypeId,
        p_tenant_id: tenantId,
        p_payload: {
          type_name: scenario.value,
          type_code: 'BLIND_PLATE',
          field_definitions: [{ field_code: 'isolation_plan', required: true }]
        }
      })
    if (scenario.entry === 'issuance-standard')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_payload: {
          standard_name: scenario.value,
          position_ids: [itemId],
          organization_ids: [organizationId],
          details: [{ material_id: itemId, quota_quantity: 2, issuance_frequency: 1 }]
        }
      })
    if (scenario.entry === 'supplier')
      expect(writes[0]).toMatchObject({
        path: '/rest/v1/rpc/smis_save_supplier_secure',
        payload: {
          p_id: recordId,
          p_payload: {
            supplier_code: 'SUP_SMIS_VALID',
            supplier_name: '验收安全服务供应商',
            address_detail: '上海市验收路 1 号',
            contact_phone: '13800000000'
          }
        }
      })
    if (scenario.entry === 'risk-point')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_payload: {
          point_name: scenario.value,
          site_id: itemId,
          equipment_id: operationTypeId,
          control_plan_name: '验收风险管控方案'
        },
        p_organization_ids: [organizationId]
      })
    if (scenario.entry === 'inspection-plan')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_payload: {
          plan_name: scenario.value,
          executor_employee_id: employeeId,
          cycle_type: 'week',
          task_deadline_value: 2
        },
        p_inspection_item_ids: [itemId]
      })
    if (scenario.entry === 'permit')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_submit: true,
        p_tenant_id: tenantId,
        p_payload: {
          work_content: scenario.value,
          responsible_employee: { employee_id: employeeId },
          workers: [{ employee_id: employeeId }],
          custom_values: {
            isolation_plan: '验收隔离方案 A',
            blind_plate_items: [{ equipment_pipeline_name: '验收一号管线', specification: 'DN100' }]
          }
        }
      })
    if (scenario.entry === 'hazard-source')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_submit: true,
        p_payload: {
          hazard_name: scenario.value,
          site_id: itemId,
          control_organization_id: organizationId,
          responsible_employee_id: employeeId,
          filing_no: 'FILING-SMIS'
        }
      })
    if (scenario.entry === 'material')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_payload: {
          material_name: scenario.value,
          category_id: itemId,
          base_unit_id: itemId,
          material_type_id: operationTypeId,
          brand: '验收品牌'
        }
      })
    if (scenario.entry === 'waste-catalog')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_payload: {
          waste_name: scenario.value,
          category_id: itemId,
          unit: 'KG',
          safety_measure: 'sealed',
          hazard_characteristic: 'flammable'
        }
      })
    if (scenario.entry === 'rescue-plan')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_submit: true,
        p_payload: {
          plan_name: scenario.value,
          plan_version: 'A',
          applicable_organization_id: organizationId,
          review_experts: '验收评审专家',
          applicable_position_ids: [itemId]
        }
      })
    if (scenario.entry === 'drill-plan')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_submit: true,
        p_payload: {
          drill_name: scenario.value,
          source_plan_id: recordId,
          responsible_employee_id: employeeId,
          trainee_ids: [employeeId],
          drill_subject: '验收消防疏散科目'
        }
      })
    if (scenario.entry === 'historical-case')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_payload: {
          accident_name: scenario.value,
          accident_categories: ['mechanical_injury'],
          content: '验收事故经过、原因分析、处置过程和防范建议。',
          applicable_company_id: organizationId
        }
      })
    if (scenario.entry === 'depreciation')
      expect(writes[0].payload).toMatchObject({
        p_id: recordId,
        p_payload: {
          depreciation_name: scenario.value,
          depreciation_years: 2,
          annual_rates: [
            { depreciation_year: 1, depreciation_rate: 50 },
            { depreciation_year: 2, depreciation_rate: 50 }
          ]
        }
      })
    await page.screenshot({ path: info.outputPath(`${scenario.entry}-saved.png`) })
    await page.getByRole('button', { name: '打开真实 SMIS 入口', exact: true }).click()
    await expect(dialog.getByRole('tablist').first().getByRole('tab').first()).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(writes).toHaveLength(1)
    expect(errors).toEqual([])
  })

for (const scenario of [
  {
    entry: 'measure',
    tab: '岗位与周期',
    other: '防控措施',
    value: '1',
    prop: 'frequency_count',
    message: '第 1 行“排查频次”不能为空'
  },
  {
    entry: 'issuance-standard',
    tab: '明细标准',
    other: '标准基础',
    value: '2',
    prop: 'quota_quantity',
    message: '第 1 行定额数量必须大于 0'
  }
])
  test(`${scenario.entry} 明细表格跨页红框校验，纠正后提交实际明细负载`, async ({ page }, info) => {
    const writes: Write[] = []
    const dialog = await open(page, scenario.entry, writes)
    await dialog.getByRole('tab', { name: scenario.tab, exact: true }).click()
    const input = dialog.locator('.el-table__body-wrapper input').first()
    await input.fill('')
    await input.press('Tab')
    await dialog.getByRole('tab', { name: scenario.other, exact: true }).click()
    await submit(dialog, scenario.entry)
    await expect(dialog.getByRole('tab', { name: scenario.tab, exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(input).toBeFocused()
    await expect(dialog.locator('.is-validation-error')).toHaveCount(1)
    expect(await dialog.locator('.art-table__required-marker').count()).toBeGreaterThanOrEqual(2)
    await expect(page.locator('.el-message')).toContainText(scenario.message)
    await expect(dialog.locator('.el-table .el-form-item__error')).toHaveCount(0)
    expect(writes).toHaveLength(0)
    await page.screenshot({ path: info.outputPath(`${scenario.entry}-table-validation.png`) })
    await input.fill(scenario.value)
    await input.press('Tab')
    await dialog.getByRole('tab', { name: scenario.other, exact: true }).click()
    await submit(dialog, scenario.entry)
    await expect(page.getByTestId('save-result')).toHaveText('已保存')
    expect(writes).toHaveLength(1)
    if (scenario.entry === 'measure')
      expect(writes[0].payload).toMatchObject({
        p_positions: [{ position_id: itemId, frequency_count: 1, frequency_unit: 'day' }]
      })
    else
      expect(writes[0].payload).toMatchObject({
        p_payload: {
          position_ids: [itemId],
          details: [{ material_id: itemId, quota_quantity: 2, issuance_frequency: 1 }]
        }
      })
  })

test('operation-type 专有字段集合规则跨页定位并保留定义提交', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'operation-type', writes)
  await dialog.getByRole('tab', { name: '作业专有字段', exact: true }).click()
  const input = dialog.getByPlaceholder('例如：动火级别')
  await input.fill('')
  await dialog.getByRole('tab', { name: '类型信息', exact: true }).click()
  await submit(dialog, 'operation-type')
  await expect(dialog.getByRole('tab', { name: '作业专有字段', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(input).toBeFocused()
  await expect(dialog.locator('.el-form-item__error')).toHaveText('第 1 个专有字段缺少字段名称')
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('operation-type-definition-validation.png') })
  await input.fill('验收隔离方案')
  await dialog.getByRole('tab', { name: '类型信息', exact: true }).click()
  await submit(dialog, 'operation-type')
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_id: operationTypeId,
    p_tenant_id: tenantId,
    p_payload: {
      field_definitions: [
        { field_code: 'isolation_plan', field_label: '验收隔离方案', required: true }
      ]
    }
  })
})

test('course 实际主列表打开新增课程，跨页必填定位后真实保存课程配置', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'course', writes)
  await dialog.getByRole('tab', { name: '说明与学员', exact: true }).click()
  await dialog.getByRole('button', { name: '保存课程', exact: true }).click()
  const input = field(dialog, '课程名称').getByRole('textbox')
  await expect(dialog.getByRole('tab', { name: '课程与考核', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(input).toBeFocused()
  await expect(field(dialog, '课程名称').locator('.el-form-item__error')).toHaveText(
    '请输入课程名称'
  )
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('course-cross-tab-validation.png') })
  await input.fill('验收安全培训课程')
  await dialog.getByRole('tab', { name: '说明与学员', exact: true }).click()
  await field(dialog, '课程简介').getByRole('textbox').fill('验收课程分组说明')
  await dialog.getByRole('button', { name: '保存课程', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({
    path: '/rest/v1/rpc/smis_manage_course_secure',
    payload: {
      p_action: 'save',
      p_payload: {
        course_name: '验收安全培训课程',
        course_category: 'safety_production',
        course_type: 'video',
        introduction: '验收课程分组说明',
        employee_ids: []
      }
    }
  })
})

test('exam 实际主列表创建试卷，跨页校验后勾选题目并保存组卷分值', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'exam', writes)
  const save = dialog.getByRole('button', { name: '保存试卷', exact: true })
  await dialog.getByRole('tab', { name: '组卷与人员', exact: true }).click()
  await save.click()
  const input = field(dialog, '试卷标题').getByRole('textbox')
  await expect(dialog.getByRole('tab', { name: '试卷与规则', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(input).toBeFocused()
  await expect(field(dialog, '试卷标题').locator('.el-form-item__error')).toHaveText(
    '请输入试卷标题'
  )
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('exam-cross-tab-validation.png') })
  await input.fill('验收安全培训考试')
  await dialog.getByRole('tab', { name: '组卷与人员', exact: true }).click()
  await dialog
    .locator('label.el-checkbox')
    .filter({ hasText: '验收操作前应确认防护装置可靠' })
    .click()
  await expect(dialog.getByRole('checkbox', { name: /验收操作前应确认防护装置可靠/ })).toBeChecked()
  await page.setViewportSize({ width: 320, height: 720 })
  const progress = dialog.getByRole('list', { name: '试卷配置进度', exact: true })
  await expect(progress.getByRole('listitem')).toHaveCount(3)
  const progressLines = await progress.getByRole('listitem').evaluateAll((items) =>
    items.map((item) => {
      const range = document.createRange()
      range.selectNodeContents(item)
      return new Set(Array.from(range.getClientRects(), (rect) => rect.y)).size
    })
  )
  expect(progressLines).toEqual([1, 1, 1])
  const footer = dialog.locator('.el-dialog__footer')
  const summary = footer.locator('.exam-page__footer-summary')
  const scoreSummary = summary.getByText('1 题 · 100 分', { exact: true })
  const passingSummary = summary.getByText(/^及格线 .+ 分$/)
  for (const statistic of [scoreSummary, passingSummary]) {
    await expect(statistic).toBeInViewport()
    const lines = await statistic.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return new Set(Array.from(range.getClientRects(), (rect) => rect.y)).size
    })
    expect(lines, `试卷底部 ${await statistic.innerText()} 应完整显示在一行`).toBe(1)
  }
  const actions = [footer.getByRole('button', { name: '取消', exact: true }), save]
  const footerBounds = (await footer.boundingBox())!
  for (const action of actions) {
    await expect(action).toBeInViewport()
    const bounds = (await action.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(footerBounds.x)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(footerBounds.x + footerBounds.width)
  }
  await dialog.screenshot({ path: info.outputPath('exam-paper-footer-320.png') })
  await save.click()
  await expect(dialog).not.toBeVisible()
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({
    path: '/rest/v1/rpc/smis_manage_exam_paper_secure',
    payload: {
      p_action: 'save',
      p_payload: {
        paper_title: '验收安全培训考试',
        assembly_mode: 'fixed',
        questions: [{ question_id: recordId, score: 100 }],
        employee_ids: []
      }
    }
  })
})

test('question 实际题库新增判断题，跨页定位题干并保存正确答案', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'question', writes)
  await field(dialog, '所属分类').getByRole('combobox').click()
  await page
    .locator('.el-select__popper:visible')
    .getByText('验收安全题库', { exact: true })
    .click()
  await dialog.locator('label.el-radio-button').filter({ hasText: '判断题' }).click()
  await expect(dialog.getByRole('radio', { name: '判断题', exact: true })).toBeChecked()
  await dialog.getByRole('button', { name: '保存题目', exact: true }).click()
  const input = field(dialog, '题目内容').getByRole('textbox')
  await expect(dialog.getByRole('tab', { name: '题目与答案', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(input).toBeFocused()
  await expect(field(dialog, '题目内容').locator('.el-form-item__error')).toHaveText(
    '请输入题目内容'
  )
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('question-cross-tab-validation.png') })
  await input.fill('验收操作前应确认防护装置可靠')
  await dialog.locator('label.el-radio').first().click()
  await expect(dialog.getByRole('radio', { name: '正确', exact: true }).first()).toBeChecked()
  await dialog.getByRole('tab', { name: '题目设置', exact: true }).click()
  await dialog.getByRole('button', { name: '保存题目', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({
    path: '/rest/v1/rpc/smis_manage_question_secure',
    payload: {
      p_action: 'save',
      p_payload: {
        category_id: itemId,
        question_type: 'judgement',
        stem: '验收操作前应确认防护装置可靠',
        correct_answers: ['A'],
        options: [
          { key: 'A', content: '正确' },
          { key: 'B', content: '错误' }
        ]
      }
    }
  })
})

test('exam 试题分值跨页定位红框，修正后实际保存组卷', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'exam', writes)
  await field(dialog, '试卷标题').getByRole('textbox').fill('验收试题分值校验')
  await dialog.getByRole('tab', { name: '组卷与人员', exact: true }).click()
  await dialog
    .locator('label.el-checkbox')
    .filter({ hasText: '验收操作前应确认防护装置可靠' })
    .click()
  const score = dialog.locator('.el-table__body-wrapper input').first()
  await score.fill('')
  await score.press('Tab')
  await dialog.getByRole('tab', { name: '试卷与规则', exact: true }).click()
  await dialog.getByRole('button', { name: '保存试卷', exact: true }).click()
  await expect(dialog.getByRole('tab', { name: '组卷与人员', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(score).toBeFocused()
  await expect(dialog.locator('.is-validation-error')).toHaveCount(1)
  await expect(dialog.locator('.art-table__required-marker')).toHaveCount(1)
  await expect(page.locator('.el-message')).toContainText('第 1 道试题分值必须大于 0')
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('exam-score-table-validation.png') })
  await score.fill('100')
  await score.press('Tab')
  await dialog.getByRole('button', { name: '保存试卷', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_action: 'save',
    p_payload: { questions: [{ question_id: recordId, score: 100 }] }
  })
})

test('training-record 归档前签到表格跨页红框，确认签到后实际归档', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'training-record', writes)
  await field(dialog, '关联培训计划').getByRole('combobox').click()
  await page.getByRole('option', { name: 'TP-SMIS · 验收设备安全培训', exact: true }).click()
  await dialog.getByRole('tab', { name: '归档材料', exact: true }).click()
  await dialog.getByRole('button', { name: '确认归档', exact: true }).click()
  await expect(dialog.getByRole('tab', { name: '签到与考核', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  const attendance = dialog.locator('.el-table__body-wrapper .el-select').first()
  await expect(attendance.getByRole('combobox')).toBeFocused()
  await expect(dialog.locator('.is-validation-error')).toHaveCount(1)
  await expect(page.locator('.el-message')).toContainText('第 1 行参训人员尚未完成签到状态')
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('training-attendance-table-validation.png') })
  await attendance.click()
  await page.getByRole('option', { name: '已签到', exact: true }).click()
  await dialog.getByRole('tab', { name: '归档材料', exact: true }).click()
  await dialog.getByRole('button', { name: '确认归档', exact: true }).click()
  await page.getByRole('button', { name: '确认归档', exact: true }).last().click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_id: null,
    p_submit: true,
    p_payload: {
      training_plan_id: recordId,
      participants: [
        { employee_id: employeeId, attendance_status: 'present', sign_method: 'manual' }
      ]
    }
  })
})

test('training-record 真实新增跨页定位关联计划，自动带入并保存培训和人员负载', async ({
  page
}, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'training-record', writes)
  await dialog.getByRole('tab', { name: '归档材料', exact: true }).click()
  await submit(dialog, 'training-record')
  const plan = field(dialog, '关联培训计划').getByRole('combobox')
  await expect(dialog.getByRole('tab', { name: '计划与执行', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(plan).toBeFocused()
  await expect(field(dialog, '关联培训计划').locator('.el-form-item__error')).toHaveText(
    '请选择关联培训计划'
  )
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('training-record-plan-validation.png') })
  await plan.click()
  await page.getByRole('option', { name: 'TP-SMIS · 验收设备安全培训', exact: true }).click()
  await expect(field(dialog, '培训地点').getByRole('textbox')).toHaveValue('验收培训室')
  await dialog.getByRole('tab', { name: '归档材料', exact: true }).click()
  await submit(dialog, 'training-record')
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_id: null,
    p_submit: false,
    p_payload: {
      training_plan_id: recordId,
      training_content: '验收安全规程培训内容',
      location: '验收培训室',
      participants: [
        { employee_id: employeeId, attendance_status: 'pending', assessment_result: 'not_assessed' }
      ]
    }
  })
})

test('accident-report 防范措施表格跨页红框校验，纠正后保存人员和措施集合', async ({
  page
}, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'accident-report', writes)
  await dialog.getByRole('tab', { name: '防范措施', exact: true }).click()
  const input = dialog.getByPlaceholder('请输入可执行、可核验的防范措施')
  await input.fill('')
  await dialog.getByRole('tab', { name: '事故信息', exact: true }).click()
  await submit(dialog, 'accident-report')
  await expect(dialog.getByRole('tab', { name: '防范措施', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(input).toBeFocused()
  await expect(dialog.locator('.is-validation-error')).toHaveCount(1)
  await expect(page.locator('.el-message')).toContainText('第 1 行计划防范措施不能为空')
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('accident-measures-table-validation.png') })
  await input.fill('验收修正固定防护措施')
  await dialog.getByRole('tab', { name: '事故信息', exact: true }).click()
  await submit(dialog, 'accident-report')
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_id: recordId,
    p_payload: {
      reporter_employee_id: employeeId,
      people: [],
      measures: [
        {
          id: itemId,
          planned_measure: '验收修正固定防护措施',
          responsible_employee_id: employeeId,
          sort: 0
        }
      ]
    }
  })
})

test('inspection-declaration 清空检验机构跨页定位，重新选择后保存完整检验负载', async ({
  page
}, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'inspection-declaration', writes)
  await dialog.getByRole('tab', { name: '检验结果与资料', exact: true }).click()
  const institution = field(dialog, '检验机构')
  await institution.getByRole('button', { name: '清空', exact: true }).click()
  await dialog.getByRole('tab', { name: '申报与报告', exact: true }).click()
  await submit(dialog, 'inspection-declaration')
  await expect(dialog.getByRole('tab', { name: '检验结果与资料', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(institution.getByRole('textbox')).toBeFocused()
  await expect(institution.locator('.el-form-item__error')).toHaveText('请选择检验机构')
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('inspection-declaration-validation.png') })
  await institution.getByRole('textbox').click()
  const selector = page.getByRole('dialog').last()
  await selector.getByText('验收检验机构', { exact: true }).click()
  await selector.locator('.art-dialog__footer-actions button').last().click()
  await dialog.getByRole('tab', { name: '申报与报告', exact: true }).click()
  await submit(dialog, 'inspection-declaration')
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_id: recordId,
    p_payload: {
      equipment_id: operationTypeId,
      inspection_category_id: itemId,
      inspection_institution_id: organizationId,
      conclusion: 'operable',
      next_due_date: '2027-10-31',
      image_attachment_ids: []
    }
  })
})

test('public-report 真实新增选择组织和场所，跨页纠正必填后提交举报负载', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'public-report', writes)
  await field(dialog, '联系电话').getByRole('textbox').fill('13800000000')
  await dialog.getByRole('tab', { name: '隐患与证据', exact: true }).click()
  await field(dialog, '隐患所属部门').getByRole('textbox').click()
  const selector = page.getByRole('dialog').last()
  await selector.getByText('验收安全部', { exact: true }).click()
  await selector.locator('.art-dialog__footer-actions button').last().click()
  await field(dialog, '场所').getByRole('combobox').click()
  await page.getByRole('treeitem').filter({ hasText: '验收装配区' }).click()
  await field(dialog, '隐患级别').getByRole('combobox').click()
  await page.getByRole('option', { name: '一般隐患', exact: true }).click()
  await field(dialog, '隐患位置').getByRole('textbox').fill('验收装配区北侧通道')
  await field(dialog, '隐患描述').getByRole('textbox').fill('验收通道存在临时堆放物')
  await submit(dialog, 'public-report')
  await expect(dialog.getByRole('tab', { name: '举报人信息', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  const name = field(dialog, '姓名').getByRole('textbox')
  await expect(name).toBeFocused()
  await expect(field(dialog, '姓名').locator('.el-form-item__error')).toHaveText('请输入举报人姓名')
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('public-report-validation.png') })
  await name.fill('验收公众举报人')
  await dialog.getByRole('tab', { name: '隐患与证据', exact: true }).click()
  await submit(dialog, 'public-report')
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_source_type: 'public_report',
    p_payload: {
      public_reporter_name: '验收公众举报人',
      public_reporter_phone: '13800000000',
      hazard_organization_id: organizationId,
      site_id: itemId,
      hazard_level: 'general',
      location: '验收装配区北侧通道',
      description: '验收通道存在临时堆放物'
    }
  })
})

test('drill-record 新增时非当前页缺计划定位，选计划自动带入后提交真实演练记录', async ({
  page
}, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'drill-record', writes)
  await dialog.getByRole('tab', { name: '人员与资料', exact: true }).click()
  await submit(dialog, 'drill-record')
  await expect(dialog.getByRole('tab', { name: '计划与执行', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  const plan = field(dialog, '计划编号').getByRole('combobox')
  await expect(plan).toBeFocused()
  await expect(field(dialog, '计划编号').locator('.el-form-item__error')).toHaveText(
    '请选择演练计划'
  )
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('drill-record-validation.png') })
  await plan.click()
  await page.getByRole('option', { name: 'EDP-SMIS-0001 · 验收消防应急演练', exact: true }).click()
  await expect(field(dialog, '演练地点').getByRole('textbox')).toHaveValue('验收装配区')
  await dialog.getByRole('tab', { name: '过程与评价', exact: true }).click()
  await field(dialog, '演练过程').getByRole('textbox').fill('验收逐项记录响应过程')
  await submit(dialog, 'drill-record')
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_id: null,
    p_submit: true,
    p_payload: {
      drill_plan_id: recordId,
      drill_location: '验收装配区',
      drill_subject: '验收消防疏散科目',
      drill_process: '验收逐项记录响应过程'
    }
  })
})

test('depreciation 年折旧率缺失定位表格红框，纠正后提交逐年折旧负载', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'depreciation', writes)
  await dialog.getByRole('tab', { name: '年折旧率', exact: true }).click()
  const rate = dialog.locator('.el-table__body-wrapper input').first()
  await rate.fill('')
  await rate.press('Tab')
  await dialog.getByRole('tab', { name: '基本信息', exact: true }).click()
  await submit(dialog, 'depreciation')
  await expect(dialog.getByRole('tab', { name: '年折旧率', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(rate).toBeFocused()
  await expect(dialog.locator('.is-validation-error')).toHaveCount(1)
  await expect(dialog.locator('.art-table__required-marker')).toHaveCount(1)
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('depreciation-table-validation.png') })
  await rate.fill('50')
  await rate.press('Tab')
  await dialog.getByRole('tab', { name: '基本信息', exact: true }).click()
  await submit(dialog, 'depreciation')
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes[0].payload).toMatchObject({
    p_payload: {
      annual_rates: [
        { depreciation_year: 1, depreciation_rate: 50 },
        { depreciation_year: 2, depreciation_rate: 50 }
      ]
    }
  })
})

test('risk-control-plan 嵌套责任频率跨页定位，修正后保留层级责任负载', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'risk-control-plan', writes, '&missing=frequency')
  const frequency = field(dialog, '管控频率').getByRole('combobox')
  await submit(dialog, 'risk-control-plan')
  await expect(dialog.getByRole('tab', { name: '层级与责任', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(field(dialog, '管控频率')).toHaveClass(/is-error/)
  await expect(field(dialog, '管控频率').locator('.el-form-item__error')).toHaveText(
    '请选择管控频率'
  )
  await expect(frequency).toBeFocused()
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('risk-control-cross-tab-validation.png') })
  await frequency.click()
  await page.getByRole('option', { name: '每周一次', exact: true }).click()
  await dialog.getByRole('tab', { name: '管控对象', exact: true }).click()
  await submit(dialog, 'risk-control-plan')
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_id: recordId,
    p_risk_point_id: recordId,
    p_status: 'active',
    p_assignments: [
      {
        control_level: 'company',
        responsible_employee_id: employeeId,
        duplicate_configuration_id: frequencyId,
        sort: 1
      }
    ]
  })
  await page.screenshot({ path: info.outputPath('risk-control-saved.png') })
})

test('permit 盲板表格校验只显示消息和红框，定位盲板页并可纠正提交', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'permit', writes)
  await dialog.getByRole('tab', { name: '盲板配置', exact: true }).click()
  const equipment = dialog.locator('.el-table__body-wrapper input').first()
  await equipment.fill('')
  await dialog.getByRole('tab', { name: '安全与说明', exact: true }).click()
  await dialog.getByRole('tab', { name: '盲板配置', exact: true }).click()
  await expect(equipment).toHaveValue('')
  await dialog.getByRole('tab', { name: '安全与说明', exact: true }).click()
  await submit(dialog, 'permit')
  await expect(dialog.getByRole('tab', { name: '盲板配置', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(equipment).toBeFocused()
  await expect(
    equipment.locator('xpath=ancestor::*[contains(@class,"art-table__cell-content")][1]')
  ).toHaveClass(/is-validation-error/)
  await expect(
    page.locator('.el-message__content').filter({ hasText: '第 1 项盲板的设备 / 管线名称不能为空' })
  ).toBeVisible()
  await expect(dialog.locator('.art-table__required-marker')).toHaveCount(2)
  await expect(dialog.locator('.is-validation-error .el-form-item__error')).toHaveCount(0)
  expect(writes).toHaveLength(0)
  await page.screenshot({ path: info.outputPath('permit-table-validation.png') })
  await equipment.fill('验收修正一号管线')
  await dialog.getByRole('tab', { name: '安全与说明', exact: true }).click()
  await submit(dialog, 'permit')
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes[0].payload).toMatchObject({
    p_submit: true,
    p_payload: {
      custom_values: { blind_plate_items: [{ equipment_pipeline_name: '验收修正一号管线' }] }
    }
  })
})

test('permit 窄屏暗色表单切换保持内容，返回后提交完整作业票', async ({ page }, info) => {
  const writes: Write[] = []
  await page.setViewportSize({ width: 390, height: 844 })
  const dialog = await open(page, 'permit', writes, '&theme=dark')
  await expect(page.locator('html')).toHaveClass(/dark/)
  const content = field(dialog, '作业内容').getByRole('textbox')
  await content.fill('验收窄屏修正作业')
  await page.screenshot({
    path: info.outputPath('permit-entry-narrow-dark-basic.png'),
    fullPage: true
  })
  await dialog.getByRole('tab', { name: '安全与说明', exact: true }).click()
  expect(
    await dialog
      .locator('.permit-form')
      .evaluate((element) => element.scrollWidth - element.clientWidth)
  ).toBeLessThanOrEqual(1)
  await page.screenshot({
    path: info.outputPath('permit-entry-narrow-dark-safety.png'),
    fullPage: true
  })
  await dialog.getByRole('tab', { name: '基础与专项信息', exact: true }).click()
  await expect(content).toHaveValue('验收窄屏修正作业')
  await submit(dialog, 'permit')
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_submit: true,
    p_tenant_id: tenantId,
    p_payload: { work_content: '验收窄屏修正作业', workers: [{ employee_id: employeeId }] }
  })
})

test('permit 提交进行中禁用草稿操作且保留提交加载反馈', async ({ page }, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'permit', writes)
  const response = Promise.withResolvers<void>()
  await page.route('**/rest/v1/rpc/smis_save_special_operation_permit_secure', async (route) => {
    writes.push({
      path: new URL(route.request().url()).pathname,
      payload: route.request().postDataJSON()
    })
    await response.promise
    return route.fulfill({ json: recordId })
  })
  const draft = dialog.getByRole('button', { name: '保存草稿', exact: true })
  const submitButton = dialog.getByRole('button', { name: '提交审批', exact: true })
  await expect(draft).toBeEnabled()
  await submitButton.click()
  try {
    await expect.poll(() => writes.length).toBe(1)
    await expect(submitButton).toHaveClass(/\bis-loading\b/)
    await draft.evaluate((button: HTMLButtonElement) => button.click())
    await expect(submitButton).toHaveClass(/\bis-loading\b/)
    await expect(draft).toBeDisabled()
    await expect(draft).not.toHaveClass(/\bis-loading\b/)
    await dialog.screenshot({ path: info.outputPath('permit-submit-pending.png') })
  } finally {
    response.resolve()
  }
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({ p_submit: true, p_tenant_id: tenantId })
})

test('risk-task-execution 配置字段保持动态结果校验、异常说明与任务租户负载', async ({
  page
}, info) => {
  const writes: Write[] = []
  const dialog = await open(page, 'risk-task-execution', writes)
  await expect(dialog.getByText('验收防护罩可靠', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '提交并完成', exact: true }).click()
  await expect(field(dialog, '巡查结果').locator('.el-form-item__error')).toHaveText(
    '请选择巡查结果'
  )
  expect(writes).toHaveLength(0)
  await dialog.getByText('异常', { exact: true }).click()
  await dialog.getByRole('button', { name: '提交并完成', exact: true }).click()
  const remark = field(dialog, '检查说明').getByRole('textbox')
  await expect(remark).toBeFocused()
  await expect(field(dialog, '检查说明').locator('.el-form-item__error')).toHaveText(
    '异常项目必须填写问题说明'
  )
  await remark.fill('验收异常防护罩需要立即修复')
  await field(dialog, '执行总结').getByRole('textbox').fill('验收巡查总体情况')
  await page.screenshot({ path: info.outputPath('risk-task-configured-fields.png') })
  await dialog.getByRole('button', { name: '提交并完成', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes[0].payload).toMatchObject({
    p_id: recordId,
    p_actual_executor_employee_id: employeeId,
    p_execution_summary: '验收巡查总体情况',
    p_items: [{ id: itemId, result: 'abnormal', remark: '验收异常防护罩需要立即修复' }],
    p_complete: true
  })
})

test('risk-task-cancel 配置化原因必填定位后按原任务提交取消', async ({ page }) => {
  const writes: Write[] = []
  const dialog = await open(page, 'risk-task-cancel', writes)
  await dialog.getByRole('button', { name: '确认取消任务', exact: true }).click()
  const reason = field(dialog, '取消原因').getByRole('textbox')
  await expect(field(dialog, '取消原因').locator('.el-form-item__error')).toHaveText(
    '请输入业务原因'
  )
  await reason.fill('  验收设备停机取消本次巡查  ')
  await dialog.getByRole('button', { name: '确认取消任务', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes[0].payload).toEqual({ p_id: recordId, p_reason: '验收设备停机取消本次巡查' })
})

for (const mode of ['void', 'approval'] as const)
  test('permit-' + mode + ' 配置化流程保持条件校验与作业票租户', async ({ page }) => {
    const writes: Write[] = []
    const dialog = await open(page, 'permit-' + mode, writes)
    if (mode === 'void') {
      await dialog.getByRole('button', { name: '确认作废', exact: true }).click()
      await expect(field(dialog, '作废原因').locator('.el-form-item__error')).toHaveText(
        '请填写作废原因'
      )
      await field(dialog, '作废原因').getByRole('textbox').fill('验收现场条件改变停止作业')
    } else {
      await dialog.getByText('拒绝申请', { exact: true }).click()
      await field(dialog, '处理说明').getByRole('textbox').fill('验收条件未满足')
    }
    await dialog
      .getByRole('button', { name: mode === 'void' ? '确认作废' : '确认审批', exact: true })
      .click()
    await expect(page.getByTestId('save-result')).toHaveText('已保存')
    expect(writes[0].payload).toMatchObject({
      p_id: permit.id,
      p_action: mode === 'void' ? 'void' : 'start',
      p_result: mode === 'void' ? null : 'rejected',
      p_tenant_id: tenantId
    })
  })

test('safety-risk 配置化风险字段选择保留场所信息与关联风险点', async ({ page }) => {
  const writes: Write[] = []
  const dialog = await open(page, 'safety-risk', writes)
  await field(dialog, '危险源 / 危害因素').getByRole('textbox').fill('验收设备传动夹伤风险')
  await field(dialog, '关联风险点').getByRole('combobox').click()
  await page.getByRole('option', { name: /验收装配区风险点.*验收装配区/ }).click()
  await dialog.getByRole('button', { name: '保存安全风险', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes[0].payload).toMatchObject({
    p_risk_point_id: recordId,
    p_payload: { hazard_factor: '验收设备传动夹伤风险' }
  })
})

test('safety-risk 切换风险点后只显示和提交当前风险点的作业活动', async ({ page }) => {
  const writes: Write[] = []
  const dialog = await open(page, 'safety-risk', writes)
  const workspace = '**/rest/v1/rpc/smis_list_risk_hazard_workspace_secure'
  const previous = { id: itemId, activityName: '装配变速箱', workStep: '装配' }
  const current = { id: frequencyId, activityName: '清点仓储设备', workStep: '盘点' }
  const previousRequested = Promise.withResolvers<void>()
  const releasePrevious = Promise.withResolvers<void>()
  await page.route(workspace, async (route) => {
    const { p_risk_point_id: riskPointId } = route.request().postDataJSON()
    if (riskPointId === recordId) {
      previousRequested.resolve()
      await releasePrevious.promise
    }
    const activity = riskPointId === recordId ? previous : current
    await route.fulfill({
      json: { activities: [{ ...activity, sort: 0, hazardCount: 0 }], hazards: [] }
    })
  })

  try {
    await dialog
      .locator('[data-art-form-item-key="hazardFactor"]')
      .getByRole('textbox')
      .fill('验收仓储盘点风险')
    const riskPointSelect = dialog
      .locator('[data-art-form-item-key="riskPointId"]')
      .getByRole('combobox')
    await riskPointSelect.click()
    await page.getByRole('option', { name: /验收装配区风险点/ }).click()
    await previousRequested.promise
    await riskPointSelect.click()
    await page.getByRole('option', { name: /验收仓储区风险点/ }).click()

    await dialog.locator('[data-art-form-item-key="activityIds"] .el-select').click()
    const currentOption = page.getByRole('option', { name: '清点仓储设备 · 盘点', exact: true })
    await expect(currentOption).toBeVisible()
    const previousResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/smis_list_risk_hazard_workspace_secure') &&
        response.request().postDataJSON().p_risk_point_id === recordId
    )
    releasePrevious.resolve()
    await (await previousResponse).finished()
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )

    await expect(currentOption).toBeVisible()
    await expect(page.getByRole('option', { name: '装配变速箱 · 装配', exact: true })).toHaveCount(
      0
    )
    await currentOption.click()
    await dialog.getByRole('heading', { name: '新增安全风险', exact: true }).click()
    await dialog.getByRole('button', { name: '保存安全风险', exact: true }).click()
    await expect(page.getByTestId('save-result')).toHaveText('已保存')
    expect(writes[0].payload).toMatchObject({
      p_risk_point_id: secondSafetyRiskPoint.id,
      p_activity_ids: [current.id]
    })
  } finally {
    releasePrevious.resolve()
  }
})

test('hazard-governance-detail 待核准阶段保留两页，不显示未发生的整改与验收页', async ({
  page
}) => {
  const writes: Write[] = []
  const dialog = await open(page, 'hazard-governance-detail', writes, '&stage=pending')
  await expect(dialog.getByRole('tab')).toHaveCount(2)
  await expect(dialog.getByRole('tab', { name: '核准与整改', exact: true })).toHaveCount(0)
  await expect(dialog.getByRole('tab', { name: '验收信息', exact: true })).toHaveCount(0)
  await dialog.getByRole('tab', { name: '流转记录', exact: true }).click()
  await expect(dialog.getByText('验收隐患登记事件', { exact: true })).toBeVisible()
  expect(writes).toHaveLength(0)
})

test('hazard-governance-detail 完整呈现来源编号与各阶段责任人姓名工号', async ({ page }, info) => {
  const writes: Write[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const appearance of [
    { width: 1440, theme: 'light', boxBorderMode: true },
    { width: 390, theme: 'dark', boxBorderMode: false }
  ] as const) {
    await page.setViewportSize({ width: appearance.width, height: 900 })
    await prepareAppearance(page, appearance)
    const dialog = await open(
      page,
      'hazard-governance-detail',
      writes,
      `&theme=${appearance.theme}&ordinary=1&longValues=1`
    )
    await assertAppearance(page, appearance)
    await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
    const card = dialog.locator('.art-overlay-tab-card')
    if (appearance.boxBorderMode) await expect(card).toHaveCSS('box-shadow', 'none')
    else await expect(card).not.toHaveCSS('box-shadow', 'none')
    await expect(dialog.getByRole('tab')).toHaveText([
      '隐患与证据',
      '核准与整改',
      '验收信息',
      '流转记录'
    ])
    for (const section of [
      {
        tab: '隐患与证据',
        values: [
          longGovernanceContext.sourceRecordNo,
          `${longGovernanceContext.reporterEmployeeName} · ${longGovernanceContext.reporterEmployeeNo}`
        ],
        dictionaryLabels: ['一般隐患', '快速上报'],
        dateCount: 1
      },
      {
        tab: '核准与整改',
        values: [
          `${longGovernanceContext.approverEmployeeName} · ${longGovernanceContext.approverEmployeeNo}`,
          `${longGovernanceContext.rectificationResponsibleEmployeeName} · ${longGovernanceContext.rectificationResponsibleEmployeeNo}`
        ],
        dictionaryLabels: ['整改'],
        dateCount: 3
      },
      {
        tab: '验收信息',
        values: [
          `${longGovernanceContext.acceptorEmployeeName} · ${longGovernanceContext.acceptorEmployeeNo}`
        ],
        dictionaryLabels: ['通过'],
        dateCount: 1
      }
    ]) {
      await dialog.getByRole('tab', { name: section.tab, exact: true }).click()
      const panel = dialog.getByRole('tabpanel', { name: section.tab, exact: true })
      await expect(panel).toBeVisible()
      for (const label of section.dictionaryLabels)
        await expect(panel.getByText(label, { exact: true })).toBeAttached()
      await expect(panel.getByText('2026-10-31 08:00', { exact: true })).toHaveCount(
        section.dateCount
      )
      for (const value of section.values) {
        const field = panel.getByText(value, { exact: true })
        await field.scrollIntoViewIfNeeded()
        await expect(field).toBeVisible()
        const geometry = await field.evaluate((element) => {
          const cell = element.closest('dd, .el-descriptions__content') ?? element
          const bounds = cell.getBoundingClientRect()
          const scrollport = element.closest('.el-scrollbar__wrap')?.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(element)
          const lines = Array.from(range.getClientRects())
          return {
            hasText: lines.length > 0,
            fitsCell: lines.every(
              (line) =>
                line.left >= bounds.left - 1 &&
                line.right <= bounds.right + 1 &&
                line.top >= bounds.top - 1 &&
                line.bottom <= bounds.bottom + 1
            ),
            fitsScrollport:
              !scrollport ||
              lines.every(
                (line) =>
                  line.left >= scrollport.left - 1 &&
                  line.right <= scrollport.right + 1 &&
                  line.top >= scrollport.top - 1 &&
                  line.bottom <= scrollport.bottom + 1
              ),
            fitsViewport: lines.every(
              (line) =>
                line.left >= -1 &&
                line.right <= innerWidth + 1 &&
                line.top >= -1 &&
                line.bottom <= innerHeight + 1
            )
          }
        })
        expect(geometry, value).toEqual({
          hasText: true,
          fitsCell: true,
          fitsScrollport: true,
          fitsViewport: true
        })
      }
      await panel.locator('.hazard-governance-detail__grid').screenshot({
        path: info.outputPath(
          `governance-${section.tab}-${appearance.width}-${appearance.theme}.png`
        )
      })
    }
    await dialog.getByRole('tab', { name: '流转记录', exact: true }).click()
    await expect(dialog.getByText('验收闭环事件', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      appearance.width + 1
    )
    await dialog.getByRole('button', { name: '关闭抽屉', exact: true }).click()
    expect(writes).toHaveLength(0)
  }
  expect(errors).toEqual([])
})

for (const entry of ['inspection-plan-detail', 'hidden-task-detail', 'risk-task-detail']) {
  test(`${entry} 完整呈现长姓名工号与组织字段`, async ({ page }, info) => {
    const writes: Write[] = []
    const values =
      entry === 'risk-task-detail'
        ? [
            `${longRiskIdentity.responsibleEmployeeName} · ${longRiskIdentity.responsibleEmployeeNo}`,
            `${longRiskIdentity.assigneeEmployeeName} · ${longRiskIdentity.assigneeEmployeeNo}`,
            longRiskIdentity.actualExecutorEmployeeName
          ]
        : [
            longInspectionIdentity.inspectionTypeName,
            longInspectionIdentity.inspectionOrganizationName,
            longInspectionIdentity.inspectedOrganizationName,
            `${longInspectionIdentity.executorEmployeeName} · ${longInspectionIdentity.executorEmployeeNo}`
          ]
    if (entry === 'hidden-task-detail') values.push('HP-SMIS-SOURCE-PLAN-2026-0000123456789')
    for (const appearance of [
      { width: 1440, theme: 'light', boxBorderMode: true },
      { width: 1440, theme: 'dark', boxBorderMode: false },
      { width: 390, theme: 'light', boxBorderMode: true },
      { width: 320, theme: 'dark', boxBorderMode: false }
    ] as const) {
      await page.setViewportSize({ width: appearance.width, height: 900 })
      await prepareAppearance(page, appearance)
      const dialog = await open(
        page,
        entry,
        writes,
        `&theme=${appearance.theme}&ordinary=1&longValues=1`
      )
      await assertAppearance(page, appearance)
      const panel = dialog.getByRole('tabpanel').first()
      for (const value of values) {
        const field = panel.getByText(value, { exact: true })
        await field.scrollIntoViewIfNeeded()
        await expect(field).toBeInViewport({ ratio: 0.95 })
        const geometry = await field.evaluate((el) => {
          const cell = el.closest('.el-descriptions__content, dd') || el
          const bounds = cell.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(el)
          return Array.from(range.getClientRects()).every(
            (rect) =>
              rect.left >= bounds.left - 1 &&
              rect.right <= bounds.right + 1 &&
              rect.top >= bounds.top - 1 &&
              rect.bottom <= bounds.bottom + 1
          )
        })
        expect(geometry, value).toBe(true)
      }
      if (entry === 'inspection-plan-detail') {
        await expect(panel.getByText('2 天', { exact: true })).toBeAttached()
        await expect(panel.getByText('每 1 周', { exact: true })).toBeAttached()
        await expect(panel.getByText('2026-11-01 08:00', { exact: true })).toBeAttached()
        await expect(panel.getByText('验收管理员', { exact: true })).toBeAttached()
      } else {
        await expect(panel.getByText('2026-10-31 08:00', { exact: true })).toHaveCount(2)
        await expect(panel.getByText('—', { exact: true })).toHaveCount(
          entry === 'risk-task-detail' ? 2 : 1
        )
      }
      if (entry === 'risk-task-detail') {
        await expect(panel.getByText('设备设施', { exact: true })).toBeAttached()
        await expect(panel.getByText('班组级', { exact: true })).toBeAttached()
        await expect(panel.locator('.task-detail-drawer__risk')).toHaveText('低风险')
        await expect(panel.locator('.task-detail-drawer__risk')).toHaveCSS(
          '--risk-color',
          '#059669'
        )
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        appearance.width + 1
      )
      await dialog.screenshot({
        path: info.outputPath(`long-context-${appearance.width}-${appearance.theme}.png`)
      })
      await dialog.getByRole('button', { name: '关闭抽屉', exact: true }).click()
      expect(writes).toHaveLength(0)
    }
  })
}

for (const entry of ['inspection-plan-detail', 'hidden-task-detail', 'risk-task-detail']) {
  test(`${entry} 长检查项完整呈现指令、编号与执行说明`, async ({ page }, info) => {
    const writes: Write[] = []
    const contentTab =
      entry === 'inspection-plan-detail'
        ? '排查明细'
        : entry === 'hidden-task-detail'
          ? '排查结果'
          : '执行情况'
    const listSelector =
      entry === 'inspection-plan-detail'
        ? '.hidden-hazard-plan-detail__items'
        : entry === 'hidden-task-detail'
          ? '.hidden-hazard-task-detail__items'
          : '.task-detail-drawer__inspection-list'
    const values =
      entry === 'inspection-plan-detail'
        ? [
            longInspectionItem.standardName,
            longInspectionItem.standardCode,
            longInspectionItem.inspectionContent,
            longInspectionItem.itemCode
          ]
        : entry === 'hidden-task-detail'
          ? [
              longInspectionItem.standardName,
              longInspectionItem.itemCode,
              longInspectionItem.inspectionContent,
              longInspectionItem.remark,
              longInspectionItem.hazardNo
            ]
          : [
              longInspectionItem.standardName,
              longInspectionItem.hazardNo,
              longInspectionItem.inspectionContent,
              longInspectionItem.remark
            ]
    for (const appearance of [
      { width: 1440, theme: 'light', boxBorderMode: true },
      { width: 390, theme: 'dark', boxBorderMode: false }
    ] as const) {
      await page.setViewportSize({ width: appearance.width, height: 900 })
      await prepareAppearance(page, appearance)
      const dialog = await open(
        page,
        entry,
        writes,
        `&theme=${appearance.theme}&ordinary=1&longValues=1`
      )
      await assertAppearance(page, appearance)
      await dialog.getByRole('tab', { name: contentTab, exact: true }).click()
      const list = dialog.locator(listSelector)
      const item = list.locator('li')
      await expect(item).toHaveCount(1)
      await expect(item.locator(':scope > span')).toHaveText('1')
      if (entry !== 'inspection-plan-detail') {
        await expect(item).toHaveAttribute('data-result', 'abnormal')
        await expect(item.getByText('异常', { exact: true })).toBeVisible()
      }
      await dialog.screenshot({
        path: info.outputPath(`long-instructions-${appearance.width}-${appearance.theme}.png`)
      })
      for (const [index, value] of values.entries()) {
        const field = item.getByText(value, { exact: true })
        await field.scrollIntoViewIfNeeded()
        const geometry = await field.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          const row = element.closest('li')!.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(element)
          const rects = Array.from(range.getClientRects())
          return {
            bounds: bounds.toJSON(),
            row: row.toJSON(),
            viewport: { width: innerWidth, height: innerHeight },
            textRects: rects.map((rect) => rect.toJSON()),
            textFitsElement:
              rects.length > 0 &&
              rects.every(
                (rect) =>
                  rect.left >= bounds.left - 1 &&
                  rect.right <= bounds.right + 1 &&
                  rect.top >= bounds.top - 1 &&
                  rect.bottom <= bounds.bottom + 1
              ),
            textFitsItem: rects.every(
              (rect) =>
                rect.left >= row.left - 1 &&
                rect.right <= row.right + 1 &&
                rect.top >= row.top - 1 &&
                rect.bottom <= row.bottom + 1
            ),
            textFitsViewport: rects.every(
              (rect) =>
                rect.left >= -1 &&
                rect.right <= innerWidth + 1 &&
                rect.top >= -1 &&
                rect.bottom <= innerHeight + 1
            )
          }
        })
        await info.attach(`instruction-${appearance.width}-${appearance.theme}-${index}`, {
          body: JSON.stringify({ value, ...geometry }, null, 2),
          contentType: 'application/json'
        })
        expect(geometry.textFitsElement, value).toBe(true)
        expect(geometry.textFitsItem, value).toBe(true)
        expect(geometry.textFitsViewport, value).toBe(true)
        await expect(field).toBeInViewport({ ratio: 0.95 })
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        appearance.width + 1
      )
      if (entry !== 'inspection-plan-detail') {
        await dialog
          .getByRole('tab', {
            name: entry === 'hidden-task-detail' ? '流转记录' : '执行记录',
            exact: true
          })
          .click()
        await expect(
          dialog.getByText(
            entry === 'hidden-task-detail' ? '验收隐患任务完成事件' : '验收风险任务完成事件',
            { exact: true }
          )
        ).toBeVisible()
      }
      await dialog.getByRole('button', { name: '关闭抽屉', exact: true }).click()
      expect(writes).toHaveLength(0)
    }
  })
}

for (const entry of ['risk-information-detail', 'hazard-ledger-detail'] as const) {
  test(`${entry} 长业务字段完整呈现且保留只读详情`, async ({ page }, info) => {
    const writes: Write[] = []
    const riskInformation = entry === 'risk-information-detail'
    const values = Object.values(riskInformation ? longRiskMeasure : longHazardSource)
    for (const appearance of [
      { width: 1440, theme: 'light', boxBorderMode: true },
      { width: 390, theme: 'dark', boxBorderMode: false }
    ] as const) {
      await page.setViewportSize({ width: appearance.width, height: 900 })
      await prepareAppearance(page, appearance)
      const dialog = await open(
        page,
        entry,
        writes,
        `&theme=${appearance.theme}&ordinary=1&longValues=1`
      )
      await assertAppearance(page, appearance)
      const initialPanel = dialog.getByRole('tabpanel', {
        name: riskInformation ? '风险辨识' : '隐患信息',
        exact: true
      })
      if (riskInformation) {
        await expect(initialPanel.getByText('机械伤害', { exact: true })).toBeVisible()
        await expect(initialPanel.getByText('验收机械伤害后果', { exact: true })).toBeVisible()
        await dialog.getByRole('tab', { name: '风险评价', exact: true }).click()
        const assessment = dialog.getByRole('tabpanel', { name: '风险评价', exact: true })
        await expect(assessment.getByText('LEC', { exact: true })).toBeVisible()
        await expect(assessment.getByText('L=1 · E=2 · C=3', { exact: true })).toBeVisible()
        await expect(assessment.getByText('6', { exact: true })).toBeVisible()
        await expect(assessment.getByText('低风险', { exact: true })).toBeVisible()
        await dialog.getByRole('tab', { name: '防控与执行', exact: true }).click()
      } else {
        await expect(initialPanel.getByText('快速上报', { exact: true })).toBeVisible()
        await expect(initialPanel.getByText('一般隐患', { exact: true })).toBeVisible()
        await expect(initialPanel.getByText('2026-10-31 08:00', { exact: true })).toBeVisible()
      }
      const panel = riskInformation
        ? dialog.getByRole('tabpanel', { name: '防控与执行', exact: true })
        : initialPanel
      if (riskInformation) {
        const measure = panel.locator('.risk-information-detail__measures > article')
        await expect(measure).toHaveCount(1)
        await expect(measure.getByText('工程措施', { exact: true })).toBeVisible()
        await expect(measure.getByText('班组级 · 每天1次', { exact: true })).toBeVisible()
        await expect(measure.getByText('验收固定防护罩管控', { exact: true })).toBeVisible()
      }
      await dialog.screenshot({
        path: info.outputPath(`long-detail-${appearance.width}-${appearance.theme}.png`)
      })
      for (const [index, value] of values.entries()) {
        const field = panel.getByText(value, { exact: true })
        await field.scrollIntoViewIfNeeded()
        const geometry = await field.evaluate((element) => {
          const cell = element.closest('dd, .el-descriptions__content')
          const scrollport = element.closest('.el-scrollbar__wrap')
          if (!cell || !scrollport) throw new Error('详情字段缺少可核对的值单元格或抽屉滚动区')
          const bounds = element.getBoundingClientRect()
          const cellBounds = cell.getBoundingClientRect()
          const scrollBounds = scrollport.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(element)
          const rects = Array.from(range.getClientRects())
          return {
            bounds: bounds.toJSON(),
            cell: cellBounds.toJSON(),
            scrollport: scrollBounds.toJSON(),
            viewport: { width: innerWidth, height: innerHeight },
            textRects: rects.map((rect) => rect.toJSON()),
            textFitsCell:
              rects.length > 0 &&
              rects.every(
                (rect) =>
                  rect.left >= cellBounds.left - 1 &&
                  rect.right <= cellBounds.right + 1 &&
                  rect.top >= cellBounds.top - 1 &&
                  rect.bottom <= cellBounds.bottom + 1
              ),
            textFitsScrollport: rects.every(
              (rect) =>
                rect.left >= scrollBounds.left - 1 &&
                rect.right <= scrollBounds.right + 1 &&
                rect.top >= scrollBounds.top - 1 &&
                rect.bottom <= scrollBounds.bottom + 1
            ),
            textFitsViewport: rects.every(
              (rect) =>
                rect.left >= -1 &&
                rect.right <= innerWidth + 1 &&
                rect.top >= -1 &&
                rect.bottom <= innerHeight + 1
            )
          }
        })
        await info.attach(`detail-value-${appearance.width}-${appearance.theme}-${index}`, {
          body: JSON.stringify({ value, ...geometry }, null, 2),
          contentType: 'application/json'
        })
        expect(geometry.textFitsCell, value).toBe(true)
        expect(geometry.textFitsScrollport, value).toBe(true)
        expect(geometry.textFitsViewport, value).toBe(true)
        await expect(field).toBeInViewport({ ratio: 0.95 })
      }
      await dialog.screenshot({
        path: info.outputPath(`long-detail-bottom-${appearance.width}-${appearance.theme}.png`)
      })
      if (appearance.width === 1440) {
        const table = panel.locator(
          riskInformation
            ? '.risk-information-detail__measures > article .el-descriptions__table'
            : '.el-descriptions__table'
        )
        for (const breakpoint of [
          { width: 900, rows: riskInformation ? 6 : 8 },
          { width: 901, rows: riskInformation ? 2 : 4 }
        ]) {
          await page.setViewportSize({ width: breakpoint.width, height: 900 })
          const rows = table.locator(':scope > tbody > tr')
          await expect(rows).toHaveCount(breakpoint.rows)
          const geometry = await table.evaluate((element) => ({
            table: element.getBoundingClientRect().toJSON(),
            rows: Array.from(element.querySelectorAll(':scope > tbody > tr')).map((row) =>
              row.getBoundingClientRect().toJSON()
            ),
            viewport: { width: innerWidth, height: innerHeight },
            documentWidth: document.documentElement.scrollWidth
          }))
          await info.attach(`detail-columns-${breakpoint.width}`, {
            body: JSON.stringify(geometry, null, 2),
            contentType: 'application/json'
          })
          expect(geometry.table.width).toBeGreaterThan(0)
          expect(geometry.table.left).toBeGreaterThanOrEqual(-1)
          expect(geometry.table.right).toBeLessThanOrEqual(breakpoint.width + 1)
          expect(geometry.documentWidth).toBeLessThanOrEqual(breakpoint.width + 1)
        }
        await page.setViewportSize({ width: appearance.width, height: 900 })
      }
      if (!riskInformation) {
        await dialog.getByRole('tab', { name: '整改闭环', exact: true }).click()
        const closure = dialog.getByRole('tabpanel', { name: '整改闭环', exact: true })
        await expect(closure.getByText('2026-10-31 08:00', { exact: true })).toHaveCount(4)
        await expect(closure.getByText('—', { exact: true })).toHaveCount(1)
        await expect(closure.getByText('验收核准人', { exact: true })).toBeVisible()
        await expect(closure.getByText('验收整改人', { exact: true })).toBeVisible()
        await expect(closure.getByText('验收复核人', { exact: true })).toBeVisible()
        await dialog.getByRole('tab', { name: '流转记录', exact: true }).click()
        const events = dialog.getByRole('tabpanel', { name: '流转记录', exact: true })
        await expect(events.getByText('验收台账闭环事件', { exact: true })).toBeVisible()
        await expect(events.getByText('验收整改记录归档', { exact: true })).toBeVisible()
        await expect(events.getByText('2026-10-31 08:00', { exact: true })).toBeVisible()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        appearance.width + 1
      )
      const close = dialog.getByRole('button', { name: '关闭抽屉', exact: true })
      await close.focus()
      await close.press('Enter')
      await expect(dialog).toBeHidden()
      expect(writes).toHaveLength(0)
    }
    const defaults = await open(page, entry, writes, '&theme=dark&ordinary=1')
    if (riskInformation)
      await defaults.getByRole('tab', { name: '防控与执行', exact: true }).click()
    const defaultFields = riskInformation
      ? defaults.locator('.risk-information-detail__measures > article')
      : defaults.getByRole('tabpanel', { name: '隐患信息', exact: true })
    await expect(defaultFields.getByText('—', { exact: true })).toHaveCount(riskInformation ? 2 : 3)
    if (riskInformation)
      await expect(defaultFields.getByText('验收安全岗', { exact: true })).toBeVisible()
    await defaults.getByRole('button', { name: '关闭抽屉', exact: true }).click()
    await expect(defaults).toBeHidden()
    expect(writes).toHaveLength(0)
  })
}

for (const entry of [
  'permit-detail',
  'inspection-plan-detail',
  'hazard-source-detail',
  'material-detail',
  'rescue-plan-detail',
  'drill-plan-detail',
  'drill-record-detail',
  'hazard-ledger-detail',
  'risk-information-detail',
  'hazard-governance-detail',
  'rectification-detail',
  'hidden-task-detail',
  'risk-task-detail',
  'violation-detail',
  'training-record-detail'
])
  test(`${entry} 真实只读详情切换保持挂载，窄屏暗色无横向溢出`, async ({ page }, info) => {
    const writes: Write[] = []
    await page.setViewportSize({ width: 390, height: 844 })
    const dialog = await open(page, entry, writes, '&theme=dark')
    await expect(page.locator('html')).toHaveClass(/dark/)
    const navigation = dialog.getByRole('tablist').first().getByRole('tab')
    expect(await navigation.count()).toBeGreaterThanOrEqual(2)
    const paneCount = await dialog.locator('.el-tab-pane').count()
    const newDetailContent: Record<string, string> = {
      'hazard-ledger-detail': '.hazard-ledger-detail',
      'risk-information-detail': '.risk-information-detail',
      'hazard-governance-detail': '.hazard-governance-detail',
      'rectification-detail': '.inspection-rectification-detail',
      'hidden-task-detail': '.hidden-hazard-task-detail',
      'risk-task-detail': '.task-detail-drawer',
      'violation-detail': '.three-violation-detail',
      'training-record-detail': '.training-record-dialog__detail'
    }
    const contentSelector =
      newDetailContent[entry] ||
      (entry === 'permit-detail'
        ? '.permit-detail'
        : entry === 'inspection-plan-detail'
          ? '.hidden-hazard-plan-detail'
          : entry === 'hazard-source-detail'
            ? '.hazard-detail'
            : entry === 'material-detail'
              ? '.material-detail-drawer'
              : '.emergency-record-detail')
    const content = dialog.locator(contentSelector)
    if (entry === 'rectification-detail') {
      const status = dialog.locator('.inspection-rectification-detail__status .el-tag__content')
      await expect(status).toHaveText('已完成')
      expect(
        await status.evaluate((element) => element.scrollWidth - element.clientWidth)
      ).toBeLessThanOrEqual(1)
    }
    const dialogBounds = await dialog.boundingBox()
    const contentBounds = await content.boundingBox()
    expect(contentBounds!.x + contentBounds!.width).toBeLessThanOrEqual(
      dialogBounds!.x + dialogBounds!.width - 12
    )
    expect(
      await content.evaluate((element) => element.scrollWidth - element.clientWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({
      path: info.outputPath(`${entry}-narrow-dark-basic.png`),
      fullPage: true
    })
    await navigation.last().click()
    await expect(navigation.last()).toHaveAttribute('aria-selected', 'true')
    await expect(dialog.locator('.el-tab-pane')).toHaveCount(paneCount)
    if (entry === 'permit-detail')
      await expect(dialog.getByText('创建验收作业票', { exact: true })).toBeVisible()
    else if (entry === 'inspection-plan-detail')
      await expect(dialog.getByText('防护罩完整且安装可靠', { exact: true })).toBeVisible()
    else if (entry === 'hazard-source-detail')
      await expect(dialog.getByText('验收评价机构', { exact: true })).toBeVisible()
    else if (entry === 'material-detail')
      await expect(dialog.getByText('验收物料归档说明', { exact: true })).toBeVisible()
    else if (entry === 'rescue-plan-detail')
      await expect(dialog.getByText('暂无预案附件', { exact: true })).toBeVisible()
    else if (entry === 'drill-plan-detail')
      await expect(dialog.getByText('暂无计划附件', { exact: true })).toBeVisible()
    else {
      const lastText: Record<string, string> = {
        'drill-record-detail': '暂无记录附件',
        'hazard-ledger-detail': '验收台账闭环事件',
        'risk-information-detail': '验收固定防护罩管控',
        'hazard-governance-detail': '验收闭环事件',
        'rectification-detail': '验收整改落实完毕',
        'hidden-task-detail': '验收隐患任务完成事件',
        'risk-task-detail': '验收风险任务完成事件',
        'violation-detail': '验收教育考核通过',
        'training-record-detail': '暂无签到附件'
      }
      await expect(dialog.getByText(lastText[entry], { exact: true })).toBeVisible()
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    if (entry === 'permit-detail')
      expect(
        await dialog
          .locator('.permit-detail')
          .evaluate((element) => element.scrollWidth - element.clientWidth)
      ).toBeLessThanOrEqual(1)
    await page.screenshot({ path: info.outputPath(`${entry}-narrow-dark.png`), fullPage: true })
    await navigation.first().click()
    await expect(navigation.first()).toHaveAttribute('aria-selected', 'true')
    await dialog.getByRole('button', { name: /^关闭(弹窗|抽屉)$/ }).click()
    await expect(dialog).not.toBeVisible()
    await page.getByRole('button', { name: '打开真实 SMIS 入口', exact: true }).click()
    await expect(navigation.first()).toHaveAttribute('aria-selected', 'true')
    expect(writes).toHaveLength(0)
    if (entry === 'inspection-plan-detail' || entry === 'training-record-detail') {
      await page.context().route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      await page.context().route('**/auth/v1/**', (route) => route.fulfill({ json: {} }))
      await page.context().route('**/readonly-attachments/**', (route) =>
        route.fulfill({
          contentType: 'text/plain; charset=utf-8',
          body: '只读附件验收内容'
        })
      )
      for (const appearance of [
        { width: 1440, theme: 'light', boxBorderMode: true },
        { width: 390, theme: 'dark', boxBorderMode: false }
      ] as const) {
        await page.setViewportSize({ width: appearance.width, height: 844 })
        await prepareAppearance(page, appearance)
        const populated = await open(
          page,
          entry,
          writes,
          `&theme=${appearance.theme}&attachments=long&ordinary=1`
        )
        await assertAppearance(page, appearance)
        if (entry === 'training-record-detail')
          await populated.getByRole('tab', { name: '归档材料', exact: true }).click()
        await expect(
          populated.getByText('当前用户尚未配置编号规则。', { exact: true })
        ).toHaveCount(0)
        const links = populated.getByRole('link')
        for (const [index, name] of readonlyAttachmentNames.entries()) {
          const link = links.filter({ hasText: name })
          await link.scrollIntoViewIfNeeded()
          await expect(link).toBeInViewport({ ratio: 0.95 })
          await expect(link).toHaveAttribute(
            'title',
            entry === 'inspection-plan-detail' ? `预览 ${name}` : name
          )
          await link.focus()
          await expect(link).toBeFocused()
          const popupPromise = page.waitForEvent('popup')
          await link.press('Enter')
          const popup = await popupPromise
          if (entry === 'inspection-plan-detail') {
            await popup.waitForURL(/file-preview\?key=/)
            const previewUrl = new URL(popup.url())
            const key = new URLSearchParams(previewUrl.hash.split('?')[1] || previewUrl.search).get(
              'key'
            )
            expect(key).toBeTruthy()
            const file = await page.evaluate(
              (key) => JSON.parse(localStorage.getItem(`art-file-preview:${key}`) || '{}').file,
              key
            )
            expect(file).toMatchObject({
              name,
              url: new URL(readonlyAttachmentUrls[index], page.url()).href
            })
            // 夹具位于独立 HTML；进入真实宿主的静态预览页继续验证文件内容。
            await prepareIsolatedSession(popup, { tenantId, platformSuper: false })
            await popup.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
              route.fulfill({
                json: [{ code: 'smis', name: '安全管理', baseUrl: '/smis/' }]
              })
            )
            const menuPath =
              '/smis/dual-control-system/hidden-hazard-governance/hidden-hazard-inspection-plan'
            await mockApplicationMenus(popup, {
              smis: [
                {
                  id: 'preview-inspection-plan',
                  parentId: null,
                  name: 'SmisHiddenHazardInspectionPlan',
                  path: menuPath,
                  component: `${menuPath}/index`,
                  type: 'menu',
                  sort: 1,
                  meta: { title: '隐患排查计划', is_enable: true, is_hide: false, roles: [] }
                }
              ]
            })
            await popup.goto(`/${previewUrl.hash}`)
            await expect(
              popup.locator('.art-file-viewer-page__header').getByRole('heading')
            ).toHaveAccessibleName(name)
            await expect(popup.locator('.art-file-viewer-page__body')).toContainText(
              '只读附件验收内容'
            )
          } else {
            await popup.waitForLoadState('domcontentloaded')
            expect(popup.url()).toBe(new URL(readonlyAttachmentUrls[index], page.url()).href)
            await expect(popup.locator('body')).toContainText('只读附件验收内容')
            await expect(link).toHaveAttribute('target', '_blank')
            await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
          }
          await popup.close()
        }
        await expect(populated.locator('input[type="file"]')).toHaveCount(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          appearance.width + 1
        )
        await populated.screenshot({
          path: info.outputPath(`${entry}-attachments-${appearance.width}-${appearance.theme}.png`)
        })
        await populated.getByRole('button', { name: /^关闭(弹窗|抽屉)$/ }).click()
        expect(writes).toHaveLength(0)
      }
    }
  })
