import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { inspectionCategory, unit } from './fixtures/form-standard-smis-batch-two-data'
import { rescuePlan } from './fixtures/form-standard-smis-batch-three-data'
import { issuanceStandard, riskPosition } from './fixtures/form-standard-smis-batch-four-data'
import { question, questionCategory } from './fixtures/form-standard-smis-batch-six-data'
import {
  hazardGovernance,
  hiddenTaskDetail,
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
  recordId,
  tenantId
} from './fixtures/form-standard-smis-data'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(90_000)

interface Write {
  path: string
  payload: unknown
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
  await prepareIsolatedSession(page)
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
          : hazardGovernance
      })
    if (path.endsWith('/smis_get_hidden_hazard_inspection_task_secure'))
      return route.fulfill({ json: hiddenTaskDetail })
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
            : riskTaskDetail
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
      return route.fulfill({ json: planDetail })
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
    const dialog = await open(page, scenario.entry, writes)
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
  })
