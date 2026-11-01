import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)
const tenantId = '11111111-1111-4111-8111-111111111111',
  accountSetId = '44444444-4444-4444-8444-444444444444'
const range = Array.from({ length: 35 }, (_, index) => index + 1)
const number = (index: number) => String(index).padStart(2, '0')
async function cardScroll(card: Locator) {
  await expect(card).toHaveClass(/is-scrollable/)
  await expect(card.locator(':scope > .art-section-card__scrollbar')).toHaveCount(1)
  await expect(card.locator('.el-scrollbar')).toHaveCount(1)
  const wrap = card.locator(':scope > .art-section-card__scrollbar > .el-scrollbar__wrap')
  await expect
    .poll(() => wrap.evaluate((node) => node.scrollHeight > node.clientHeight + 20))
    .toBe(true)
  await card.locator(':scope > .art-section-card__scrollbar').hover()
  await expect(
    card.locator(':scope > .art-section-card__scrollbar > .el-scrollbar__bar.is-vertical')
  ).toBeVisible()
  const toolbar = card.locator(':scope > .art-section-card__toolbar')
  const toolbarTop = (await toolbar.count()) ? (await toolbar.boundingBox())!.y : null
  await wrap.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await expect.poll(() => wrap.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
  if (toolbarTop !== null) expect((await toolbar.boundingBox())!.y).toBeCloseTo(toolbarTop, 0)
  const geometry = await card.evaluate((element) => {
    const bar = element.querySelector(
        ':scope > .art-section-card__scrollbar > .el-scrollbar__bar.is-vertical'
      )!,
      body = element.querySelector(':scope > .art-section-card__scrollbar .art-section-card__body')!
    return {
      trackInset: element.getBoundingClientRect().right - bar.getBoundingClientRect().right,
      padding: parseFloat(getComputedStyle(body).paddingRight)
    }
  })
  expect(geometry.trackInset).toBeLessThanOrEqual(6)
  expect(geometry.padding).toBeGreaterThanOrEqual(16)
  return wrap
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
}
for (const profile of [
  { theme: 'light', width: 1440, height: 1000 },
  { theme: 'dark', width: 390, height: 844 }
]) {
  test.describe(`${profile.theme}${profile.width}`, () => {
    let errors: string[]
    test.beforeEach(async ({ page }) => {
      errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      await prepareIsolatedSession(page)
      await page.setViewportSize(profile)
      await page.route('**/rest/v1/**', async (route) => {
        const url = new URL(route.request().url()),
          name = url.pathname.split('/').at(-1)
        if (name === 'sys_dictionary')
          return route.fulfill({
            json: [
              ...range.map((index) => ({
                id: `dict-${index}`,
                code: `owner-${index}`,
                value: `owner-${index}`,
                label: `车辆归属${number(index)}`,
                status: '1',
                sort: index,
                dict_type_table: { code: 'vehicleOwnership' }
              })),
              {
                id: 'dict-type',
                code: 'type-1',
                value: 'type-1',
                label: '验收车型',
                status: '1',
                sort: 1,
                dict_type_table: { code: 'vehicleType' }
              },
              {
                id: 'dict-active',
                value: 'active',
                code: 'active',
                label: '在职',
                status: '1',
                sort: 1,
                dict_type_table: { code: 'hrEmploymentStatus' }
              },
              {
                id: 'dict-manual',
                value: 'manual',
                code: 'manual',
                label: '手工维护',
                status: '1',
                sort: 1,
                dict_type_table: { code: 'fmsAuxiliarySourceType' }
              }
            ].filter(
              (item) =>
                url.searchParams.get('dict_type_table.code') === 'eq.' + item.dict_type_table.code
            )
          })
        if (name === 'mdm_organization')
          return route.fulfill({
            json: range.map((index) => ({
              id: `org-${index}`,
              tenant_id: tenantId,
              parent_id: null,
              organization_name: `验收组织${number(index)}`,
              organization_code: `ORG-${number(index)}`,
              organization_type: 'department',
              status: '1',
              sort: index
            }))
          })
        if (name === 'hr_get_organization_position_directory_secure')
          return route.fulfill({
            json: {
              positions: range.map((index) => ({
                id: `position-${index}`,
                position_code: `POS-${number(index)}`,
                position_name: `验收岗位${number(index)}`,
                organization_id: 'org-1',
                employee_count: 35
              })),
              employees: [1, 35].flatMap((position) =>
                range.map((index) => ({
                  id: `employee-${position}-${index}`,
                  employee_name: `验收员工${number(index)}`,
                  employee_no: `E-${number(index)}`,
                  position_id: `position-${position}`,
                  employment_status: 'active',
                  job_title: '验收职务'
                }))
              ),
              employee_total: 70,
              truncated: false
            }
          })
        if (name === 'vms_list_vehicle_archive_navigation_secure')
          return route.fulfill({
            json: range.map((index) => ({
              id: `vehicle-${index}`,
              vehicleOwnership: `owner-${index}`,
              vehicleType: 'type-1'
            }))
          })
        if (name === 'vms_list_vehicle_archives_secure')
          return route.fulfill({ json: { records: [], total: 0, fieldAccess: {} } })
        if (name === 'fms_list_account_set_options_secure')
          return route.fulfill({
            json: {
              records: [
                {
                  id: accountSetId,
                  accountSetName: '验收账套',
                  accountSetCode: 'BOOK-001',
                  baseCurrency: 'CNY',
                  status: 'active'
                }
              ],
              total: 1
            }
          })
        if (name === 'fms_currency')
          return route.fulfill({
            json: range.map((index) => ({
              id: `currency-${index}`,
              tenant_id: tenantId,
              account_set_id: accountSetId,
              currency_code: `C${number(index)}`,
              currency_name: `验收币种${number(index)}`,
              symbol: '¤',
              decimal_places: 2,
              is_base: index === 1,
              is_enabled: true,
              sort: index
            }))
          })
        if (name === 'fms_exchange_rate') return route.fulfill({ json: [] })
        if (name === 'fms_auxiliary_type')
          return route.fulfill({
            json: range.map((index) => ({
              id: `type-${index}`,
              tenant_id: tenantId,
              account_set_id: accountSetId,
              type_code: `T${number(index)}`,
              type_name: `验收维度${number(index)}`,
              source_type: 'manual',
              is_system: false,
              is_enabled: true,
              sort: index
            }))
          })
        if (name === 'fms_auxiliary_item')
          return route.fulfill({
            json: [
              {
                id: 'item-1',
                item_code: 'ITEM-001',
                item_name: '验收核算项目',
                is_enabled: true,
                sort: 1
              }
            ]
          })
        if (name === 'fms_payable_writeoff_workspace_secure') {
          const rows = (side: string) =>
            range.map((index) => ({
              id: `${side}-${index}`,
              tenantId,
              supplierId: `party-${index}`,
              supplierName: `验收往来${number(index)}`,
              documentId: `${side}-${index}`,
              documentNo: `${side}-${number(index)}`,
              sourceType: side === 'primary' ? 'financial' : 'payment',
              status: side === 'primary' ? 'approved' : 'confirmed',
              currencyCode: 'CNY',
              exchangeRate: 1,
              amount: 100,
              availableAmount: 100,
              businessDate: '2026-11-01'
            }))
          return route.fulfill({
            json: {
              primary: rows('primary'),
              secondary: rows('secondary'),
              history: [],
              schemes: [],
              relations: [{ value: 'payable_payment', label: '应付核销付款' }],
              organizations: []
            }
          })
        }
        if (name === 'mes_work_order')
          return route.fulfill({
            json: range.map((index) => ({
              id: `order-${index}`,
              tenant_id: tenantId,
              work_order_no: `MO-${number(index)}`,
              material_id: 'material',
              material_code_snapshot: 'MAT-001',
              material_name_snapshot: '验收板材',
              specification_snapshot: '1000×50',
              project_name_snapshot: '验收工程',
              planned_start_date: '2026-11-01',
              planned_end_date: '2026-11-30',
              order_quantity: 10,
              extension_values: {},
              packing_rule_id: 'rule-1',
              status: 'confirmed',
              packing_published_at: null,
              details: [{ pieces: 10, packed_pieces: 0 }],
              update_time: '2026-11-01T08:00:00Z'
            }))
          })
        if (name === 'mes_pack_rule')
          return route.fulfill({
            json: [
              {
                id: 'rule-1',
                tenant_id: tenantId,
                rule_code: 'RULE',
                rule_name: '验收排包规则',
                enabled: true,
                max_pieces: 20,
                max_stack_height: 1000
              }
            ]
          })
        if (name === 'mdm_material')
          return route.fulfill({
            json: [{ id: 'material', description: '验收板材', attribute_values: {} }]
          })
        if (name === 'mes_operation_task')
          return route.fulfill({
            headers: {
              'content-range': '0-34/35',
              'access-control-expose-headers': 'content-range'
            },
            json: range.map((index) => ({
              id: `task-${index}`,
              tenant_id: tenantId,
              work_order_id: `order-${index}`,
              task_no: `TASK-${number(index)}`,
              sequence_no: 1,
              sequence_type: 'main',
              operation_code: 'OP1',
              operation_name: '验收工序',
              planned_quantity: 10,
              completed_quantity: 0,
              reported_good_quantity: 0,
              reported_bad_quantity: 0,
              required_start_date: '2026-11-01',
              required_completion_date: '2026-11-30',
              department_id: 'shop-1',
              work_center_id: 'center-1',
              scheduling_status: 'scheduled',
              operation_status: 'released',
              started_at: null,
              allocations: [],
              workOrder: {
                id: `order-${index}`,
                work_order_no: `MO-${number(index)}`,
                material_name_snapshot: '验收板材',
                material_code_snapshot: 'MAT-001',
                work_order_type_name_snapshot: '验收生产',
                project_name_snapshot: '验收工程'
              },
              workCenter: { code: 'WC01', name: '验收工作中心', department_id: 'shop-1' }
            }))
          })
        if (name === 'mes_execution_task_rules')
          return route.fulfill({
            json: range.map((index) => ({
              task_id: `task-${index}`,
              first_task_id: `task-${index}`,
              control_code: 'SY01',
              report_mode: 'optional'
            }))
          })
        if (name === 'mes_execution_attendance')
          return route.fulfill({
            json: range.map((index) => ({
              id: `attendance-${index}`,
              task_id: 'task-1',
              personnel_id: `person-${index}`,
              clock_in_at: '2026-11-01T08:00:00Z',
              clock_out_at: null,
              person: { name: `验收操作员${number(index)}`, employee_no: `WORKER${number(index)}` }
            }))
          })
        if (name === 'mdm_production_department')
          return route.fulfill({
            json: [
              {
                id: 'shop-1',
                tenant_id: tenantId,
                parent_id: null,
                code: 'SHOP1',
                name: '验收车间',
                department_code: 'SHOP1',
                department_name: '验收车间',
                enabled: true,
                sort: 1
              }
            ]
          })
        if (name === 'mdm_work_center')
          return route.fulfill({
            json: [
              {
                id: 'center-1',
                tenant_id: tenantId,
                department_id: 'shop-1',
                code: 'WC01',
                name: '验收工作中心',
                sort: 1
              }
            ]
          })
        if (name === 'mdm_equipment')
          return route.fulfill({
            headers: {
              'content-range': '0-34/35',
              'access-control-expose-headers': 'content-range'
            },
            json: range.map((index) => ({
              id: `equipment-${index}`,
              tenant_id: tenantId,
              equipment_code: `EQ${number(index)}`,
              equipment_name: `验收设备${number(index)}`,
              production_department_id: 'shop-1',
              status: 'enabled',
              department: { department_name: '验收车间' }
            }))
          })
        if (name === 'pmis_task')
          return route.fulfill({
            headers: {
              'content-range': '0-34/35',
              'access-control-expose-headers': 'content-range'
            },
            json: range.map((index) => ({
              id: `pmis-${index}`,
              tenant_id: tenantId,
              task_no: `INSPECT${number(index)}`,
              planned_date: '2026-11-01',
              status: 'completed',
              completed_at: '2026-11-01T08:00:00Z',
              plan: {
                id: 'plan-1',
                plan_name: '验收点检方案',
                plan_kind: 'inspection',
                items: [],
                require_photo: false
              },
              equipment: {
                id: `equipment-${index}`,
                equipment_code: `EQ${number(index)}`,
                equipment_name: `验收设备${number(index)}`,
                production_department_id: 'shop-1',
                department: { department_name: '验收车间' }
              },
              results: []
            }))
          })
        if (name === 'wf_delegation')
          return route.fulfill({
            headers: {
              'content-range': '0-34/35',
              'access-control-expose-headers': 'content-range'
            },
            json: range.map((index) => ({
              id: `delegation-${index}`,
              tenant_id: tenantId,
              delegator_user_id: '22222222-2222-4222-8222-222222222222',
              delegate_user_id: `actor-${index}`,
              starts_at: '2026-11-01T08:00:00Z',
              ends_at: '2026-12-01T18:00:00Z',
              reason: `验收委托原因${number(index)}`,
              delegate: { user_name: `验收受托人${number(index)}` }
            }))
          })
        if (name === 'get_workflow_operational_analytics')
          return route.fulfill({
            json: {
              generatedAt: '2026-11-01T08:00:00Z',
              summary: {},
              daily: [{ date: '2026-11-01', startedCount: 5 }],
              businessTypes: []
            }
          })
        if (name === 'get_workflow_bottleneck_analytics')
          return route.fulfill({
            json: {
              summary: {},
              minimumSampleSize: 5,
              nodes: range.map((index) => ({
                definitionId: 'definition-1',
                nodeKey: `node-${index}`,
                nodeName: `验收瓶颈节点${number(index)}`,
                definitionName: '验收流程',
                riskLevel: 'warning',
                slaMeasuredCount: 10,
                pendingCount: 2,
                overduePendingCount: 1,
                slaComplianceRate: 90,
                p90HandleHours: 8
              })),
              approvers: range.map((index) => ({
                assigneeUserId: `actor-${index}`,
                assigneeName: `验收审批人${number(index)}`,
                riskLevel: 'warning',
                delegatedCount: 1,
                transferredCount: 0,
                pendingCount: 2,
                handledCount: 10,
                slaComplianceRate: 90
              }))
            }
          })
        return route.fulfill({ json: [] })
      })
    })
    test.afterEach(() => {
      expect(errors).toEqual([])
    })
    test('HR三个卡片滚动到底并保持搜索与联动', async ({ page }, info) => {
      await page.goto(
        `/tests/e2e/fixtures/section-scroll-business.html?mode=directory&theme=${profile.theme}`
      )
      const organization = page.locator('.organization-position-page__organization-card'),
        positions = page.locator('.organization-position-page__position-card'),
        employees = page.locator('.organization-position-page__employee-card')
      await expect(organization.getByText('验收组织01', { exact: true })).toBeVisible()
      await cardScroll(organization)
      await organization.getByText('验收组织35', { exact: true }).click()
      await organization.getByRole('textbox', { name: '搜索组织', exact: true }).fill('组织35')
      await expect(organization.locator('.el-tree-node:visible')).toHaveCount(1)
      await cardScroll(positions)
      await positions.getByRole('button', { name: /验收岗位35/ }).click()
      await positions.getByRole('textbox', { name: '搜索岗位', exact: true }).fill('岗位35')
      await expect(positions.getByRole('button', { name: /验收岗位35/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
      await cardScroll(employees)
      await expect(employees.getByText('验收员工35', { exact: true })).toBeVisible()
      await employees.getByRole('textbox', { name: '搜索员工姓名或工号', exact: true }).fill('E-35')
      await expect(employees.locator('li')).toHaveCount(1)
      await noOverflow(page)
      await page.screenshot({ path: info.outputPath('hr-directory.png'), animations: 'disabled' })
    })
    test('车辆分类搜索与全部入口固定且末分组可选', async ({ page }, info) => {
      await page.goto(
        `/tests/e2e/fixtures/section-scroll-business.html?mode=vehicles&theme=${profile.theme}`
      )
      const card = page.locator('.vehicle-archive-manage__navigation')
      await expect(card).toBeVisible()
      if (profile.width < 1160)
        await card.getByRole('button', { name: '展开或收起车辆分类', exact: true }).click()
      await expect(card.getByText('车辆归属01', { exact: true })).toBeVisible()
      await cardScroll(card)
      await page.screenshot({
        path: info.outputPath('vehicle-navigation-bottom.png'),
        animations: 'disabled'
      })
      await card.getByText('车辆归属35', { exact: true }).click()
      await expect(card).toContainText('当前：车辆归属35')
      if (profile.width < 1160) {
        await expect(card.getByRole('textbox', { name: '搜索车辆分类', exact: true })).toBeHidden()
        await card.getByRole('button', { name: '展开或收起车辆分类', exact: true }).click()
      }
      await card.getByRole('textbox', { name: '搜索车辆分类', exact: true }).fill('归属35')
      await expect(card.locator('.el-tree-node:visible').first()).toContainText('车辆归属35')
      await card.getByRole('button', { name: /全部车辆/ }).click()
      await expect(card).toContainText('按车辆归属和车型筛选')
      await noOverflow(page)
      await page.screenshot({
        path: info.outputPath('vehicle-navigation.png'),
        animations: 'disabled'
      })
      if (profile.width < 1160) {
        await expect(card.getByRole('textbox', { name: '搜索车辆分类', exact: true })).toBeHidden()
      }
    })
    test('应付往来树唯一滚动且搜索筛选业务明细', async ({ page }, info) => {
      await page.goto(
        `/tests/e2e/fixtures/section-scroll-business.html?mode=writeoff&theme=${profile.theme}`
      )
      const card = page.locator('.payable-writeoff-page__workspace > .art-section-card').first()
      await expect(card.getByText('验收往来01', { exact: true })).toBeVisible()
      await cardScroll(card)
      await card.getByText('验收往来35', { exact: true }).click()
      await expect(page.locator('.payable-writeoff-page__document-section').first()).toContainText(
        'primary-35'
      )
      await card.getByRole('textbox', { name: '搜索往来单位', exact: true }).fill('往来35')
      await expect(card.locator('.el-tree-node:visible')).toHaveCount(2)
      await noOverflow(page)
      await page.screenshot({
        path: info.outputPath('payable-parties.png'),
        animations: 'disabled'
      })
    })
    for (const mode of ['currency', 'auxiliary'] as const)
      test(`财务${mode}长列表末项可达并保持选中`, async ({ page }, info) => {
        await page.goto(
          `/tests/e2e/fixtures/section-scroll-business.html?mode=${mode}&theme=${profile.theme}`
        )
        const card =
            mode === 'currency'
              ? page.locator('.accounting-currency-page__workspace > .art-section-card').first()
              : page.locator('.accounting-auxiliary-page__types'),
          label = mode === 'currency' ? '选择验收币种35' : '选择核算维度验收维度35'
        await expect(card.locator('button').first()).toBeVisible()
        await cardScroll(card)
        const last = card.getByRole('button', { name: label, exact: true })
        await last.click()
        await expect(last).toHaveAttribute('aria-pressed', 'true')
        if (mode === 'auxiliary')
          await expect(page.getByText('验收核算项目', { exact: true })).toBeVisible()
        else await expect(page.getByText('C35 对本位币的直接汇率', { exact: true })).toBeVisible()
        await noOverflow(page)
        await page.screenshot({
          path: info.outputPath(`finance-${mode}.png`),
          animations: 'disabled'
        })
      })
    test('补扫生产范围卡片固定车间搜索并选择末中心', async ({ page }, info) => {
      await page.goto(
        `/tests/e2e/fixtures/section-scroll-business.html?mode=navigator&theme=${profile.theme}`
      )
      const card = page.locator('.production-work-center-navigator')
      await expect(card.getByText('WC01 · 验收中心01', { exact: true })).toBeVisible()
      await cardScroll(card)
      const last = card.getByRole('button', { name: /WC35 · 验收中心35/ })
      await last.click()
      await expect(last).toHaveAttribute('aria-current', 'true')
      await card.getByRole('textbox', { name: '搜索工作中心', exact: true }).fill('WC35')
      await expect(last).toBeVisible()
      await noOverflow(page)
      await page.screenshot({
        path: info.outputPath('production-navigator.png'),
        animations: 'disabled'
      })
    })
    test('补扫排包工单固定筛选规则并选择末单', async ({ page }, info) => {
      await page.goto(
        `/tests/e2e/fixtures/section-scroll-business.html?mode=packing&theme=${profile.theme}`
      )
      const card = page.locator('.packing-page__orders')
      await expect(card.getByRole('button', { name: /MO-01/ })).toBeVisible()
      await cardScroll(card)
      await card.getByRole('button', { name: /MO-35/ }).click()
      await expect(card.getByRole('button', { name: /MO-35/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
      await expect(
        card.locator(':scope > .art-section-card__footer').getByRole('combobox')
      ).toBeVisible()
      await card.getByRole('textbox', { name: '组合查询工单', exact: true }).fill('MO-35')
      await expect(card.locator('.packing-page__order')).toHaveCount(1)
      await noOverflow(page)
      await page.screenshot({ path: info.outputPath('packing-orders.png'), animations: 'disabled' })
    })
    test('补扫生产任务分页与出勤摘要固定且末记录可达', async ({ page }, info) => {
      await page.goto(
        `/tests/e2e/fixtures/section-scroll-business.html?mode=execution&theme=${profile.theme}`
      )
      const tasks = page.locator('.production-workspace__task-card'),
        attendance = page.locator('.production-workspace__attendance')
      await expect(tasks.getByRole('button', { name: /MO-01/ })).toBeVisible()
      await cardScroll(tasks)
      await tasks.getByRole('button', { name: /MO-35/ }).click()
      await expect(tasks.locator(':scope > .art-section-card__footer .el-pagination')).toBeVisible()
      await expect(attendance.locator('.production-workspace__attendance-summary')).toContainText(
        '35'
      )
      await cardScroll(attendance)
      await expect(attendance.getByText('验收操作员35', { exact: true })).toBeVisible()
      await noOverflow(page)
      await page.screenshot({
        path: info.outputPath('production-attendance.png'),
        animations: 'disabled'
      })
    })
    test('补扫委托历史公开入口刷新与末记录', async ({ page }, info) => {
      await page.goto(
        `/tests/e2e/fixtures/section-scroll-business.html?mode=delegation&theme=${profile.theme}`
      )
      await page.getByRole('button', { name: '打开审批委托', exact: true }).click()
      const card = page.locator('.workflow-delegation__history')
      await expect(card.getByText('验收委托原因01', { exact: true })).toBeVisible()
      await cardScroll(card)
      await expect(card.getByText('验收委托原因35', { exact: true })).toBeVisible()
      await card.getByRole('button', { name: '刷新委托记录', exact: true }).click()
      await expect(card.locator('.workflow-delegation__list article')).toHaveCount(35)
      await noOverflow(page)
      await page.screenshot({
        path: info.outputPath('delegation-history.png'),
        animations: 'disabled'
      })
    })
    test('补扫审批治理双列表保留标题并导出', async ({ page }, info) => {
      await page.goto(
        `/tests/e2e/fixtures/section-scroll-business.html?mode=analytics&theme=${profile.theme}`
      )
      await page.getByRole('tab', { name: '瓶颈治理', exact: true }).click()
      const cards = page.locator('.workflow-analytics__governance-card')
      await cardScroll(cards.nth(0))
      await expect(cards.nth(0).getByText('验收瓶颈节点35', { exact: true })).toBeVisible()
      await cardScroll(cards.nth(1))
      await expect(cards.nth(1).getByText('验收审批人35', { exact: true })).toBeVisible()
      const download = page.waitForEvent('download')
      await page.getByRole('button', { name: '导出瓶颈明细', exact: true }).click()
      expect((await download).suggestedFilename()).toMatch(/csv$/)
      await noOverflow(page)
      await page.screenshot({
        path: info.outputPath('workflow-governance.png'),
        animations: 'disabled'
      })
    })
    test('补扫点检看板固定筛选且末设备详情可打开', async ({ page }, info) => {
      await page.goto(
        `/tests/e2e/fixtures/section-scroll-business.html?mode=dashboard&theme=${profile.theme}`
      )
      const card = page.locator('.pmis-dashboard__surface')
      await expect(card.getByText('验收设备01', { exact: true })).toBeVisible()
      await cardScroll(card)
      const last = card.locator('.pmis-dashboard__grid article').last()
      await expect(last.getByText('验收设备35', { exact: true })).toBeVisible()
      await last.getByRole('button', { name: '查看点检明细', exact: true }).click()
      await expect(page.locator('.el-drawer:visible')).toContainText('验收设备35')
      await page.getByRole('button', { name: '关闭抽屉', exact: true }).click()
      await card.getByRole('combobox', { name: '筛选设备', exact: true }).click()
      await page.getByRole('option', { name: '验收设备35 · EQ35', exact: true }).click()
      await expect(card.locator('.pmis-dashboard__grid article')).toHaveCount(1)
      await noOverflow(page)
      await page.screenshot({ path: info.outputPath('pmis-dashboard.png'), animations: 'disabled' })
    })
    test('补扫示例事件日志唯一滚动并清空', async ({ page }, info) => {
      await page.goto(
        `/tests/e2e/fixtures/section-scroll-business.html?mode=logs&theme=${profile.theme}`
      )
      const trigger = page.getByRole('button', { name: 'getData', exact: true }),
        card = page.locator('.table-query-widget__log')
      await expect(trigger).toBeVisible()
      for (let index = 0; index < 20; index++) await trigger.click()
      await expect
        .poll(() => card.locator('.table-query-widget__log-item').count())
        .toBeGreaterThanOrEqual(20)
      await cardScroll(card)
      await noOverflow(page)
      await page.screenshot({ path: info.outputPath('widget-events.png'), animations: 'disabled' })
      await card.getByRole('button', { name: '清空', exact: true }).click()
      await expect(card.getByText('暂无事件', { exact: true })).toBeVisible()
    })
  })
}
