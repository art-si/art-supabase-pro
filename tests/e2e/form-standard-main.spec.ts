import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)
const tenantId = '11111111-1111-4111-8111-111111111111'
const dictionary: Record<string, [string, string][]> = {
  status: [
    ['启用', '1'],
    ['停用', '0']
  ],
  sysUserIdentityType: [
    ['员工', 'employee'],
    ['外部协作', 'external'],
    ['服务账号', 'service']
  ],
  organizationType: [['部门', 'department']],
  sex: [['未知', 'unknown']],
  userType: [['普通用户', '1']],
  systemParamGroup: [['通用设置', 'general']],
  systemParamType: [
    ['单行文本', 'single_text'],
    ['多行文本', 'multi_text'],
    ['数字', 'number'],
    ['布尔值', 'boolean'],
    ['JSON', 'json']
  ],
  commonBoolean: [
    ['是', 'true'],
    ['否', 'false']
  ],
  documentNumberResetCycle: [
    ['按月', 'month'],
    ['不重置', 'never']
  ],
  notificationRecipientsMode: [
    ['责任人优先', 'owner_then_roles'],
    ['指定角色', 'roles_only']
  ],
  notificationRepeatMode: [
    ['一次', 'once'],
    ['重复', 'repeat']
  ],
  notificationChannel: [['站内消息', 'in_app']],
  i18nScope: [['本地', '1']],
  aiFeature: [['AI 对话', 'chat']],
  aiRunStatus: [['已完成', 'succeeded']],
  workflowInstanceStatus: [['审批中', 'running']],
  workflowTaskStatus: [['待审批', 'pending']],
  workflowActionType: [['提交', 'submit']]
}
const dictionaryRows = Object.entries(dictionary).flatMap(([code, options]) =>
  options.map(([label, value], sort) => ({
    id: `${code}-${value}`,
    type_id: code,
    code: value,
    label,
    value,
    sort,
    status: '1',
    dict_type_table: { code, name: code }
  }))
)

async function mockRequests(page: Page): Promise<void> {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').pop()
    const method = route.request().method()
    if (table === 'configure_document_number_rule_for_tenants')
      return route.fulfill({ json: { created: 1, updated: 0 } })
    if (table === 'tms_save_geofence_config')
      return route.fulfill({ json: route.request().postDataJSON().p_config })
    if (table === 'sys_param') return route.fulfill({ json: null })
    if (table === 'ai_run')
      return route.fulfill({
        json: {
          id: '22222222-2222-4222-8222-222222222222',
          feature: 'chat',
          status: 'succeeded',
          model: '验收模型',
          started_at: '2026-10-31T00:00:00Z',
          finished_at: '2026-10-31T00:00:01Z',
          latency_ms: 1000,
          input_tokens: 10,
          output_tokens: 20,
          metadata: { execution_mode: 'readonly' },
          conversation_id: 'conversation-1',
          conversation: { title: '验收对话', context: { page: '验收工作台' } }
        }
      })
    if (table === 'ai_tool_call')
      return route.fulfill({
        json: [
          {
            id: 'tool-1',
            tool_name: '验收只读查询',
            arguments: { keyword: '验收关键字' },
            result_summary: { total: 3 },
            latency_ms: 10,
            status: 'succeeded'
          }
        ]
      })
    if (table === 'ai_message')
      return route.fulfill({
        json: [
          {
            id: 'message-1',
            role: 'assistant',
            content: '验收对话内容',
            create_time: '2026-10-31T00:00:00Z'
          }
        ]
      })
    if (table === 'wf_instance')
      return route.fulfill({
        json: {
          id: '22222222-2222-4222-8222-222222222222',
          business_title: '验收业务单据',
          business_type: 'scm_sales_contract',
          business_id: 'contract-1',
          status: 'running',
          started_at: '2026-10-31T00:00:00Z',
          definition: { name: '验收审批流程' },
          initiator_name_snapshot: '验收发起人',
          current_node_key: 'review',
          current_node_name: '业务复核',
          version: {
            version_no: 2,
            config: {
              nodes: [
                {
                  key: 'review',
                  name: '业务复核',
                  order: 1,
                  approval_mode: 'any',
                  approval_threshold_percent: 100,
                  reject_veto_enabled: true,
                  allow_self_approval: false,
                  due_hours: 24,
                  reminder_before_minutes: 60,
                  escalation_enabled: false,
                  escalate_after_hours: 0,
                  assignee: { type: 'users', user_ids: ['reviewer-1'] },
                  condition: { operator: 'always' }
                }
              ]
            }
          },
          tasks: [
            {
              id: 'task-1',
              node_key: 'review',
              node_name: '业务复核',
              node_order: 1,
              approval_mode: 'any',
              approval_threshold_percent: 100,
              reject_veto_enabled: true,
              assignee_name_snapshot: '验收审核员',
              assignment_source: 'direct',
              status: 'pending',
              create_time: '2026-10-31T00:00:00Z',
              due_at: '2026-11-01T00:00:00Z'
            }
          ],
          actions: [
            {
              id: 'action-1',
              action: 'submit',
              actor_name_snapshot: '验收发起人',
              comment: '请复核验收业务资料',
              create_time: '2026-10-31T00:00:00Z'
            }
          ]
        }
      })
    if (table === 'get_workflow_business_snapshot')
      return route.fulfill({
        json: {
          instance_id: '22222222-2222-4222-8222-222222222222',
          business_id: 'contract-1',
          business_type: 'scm_sales_contract',
          title: '验收业务资料',
          fields: [{ label: '合同编号', value: 'QA-CONTRACT-1' }],
          metrics: [],
          warnings: [],
          attachments: []
        }
      })
    if (method !== 'GET' && !url.pathname.includes('/rpc/'))
      return route.fulfill({ json: [], headers: { 'content-range': '0-0/1' } })
    if (table === 'sys_dictionary') {
      if (url.searchParams.get('select') === 'id') return route.fulfill({ json: [] })
      const type = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
      return route.fulfill({
        json: type
          ? dictionaryRows.filter((row) => row.dict_type_table.code === type)
          : dictionaryRows
      })
    }
    if (table === 'sys_tenant')
      return route.fulfill({
        json: [
          { id: tenantId, tenant_code: 'fixture_tenant', tenant_name: '验收租户', status: '1' }
        ]
      })
    if (table === 'sys_role')
      return route.fulfill({
        json:
          url.searchParams.get('select') === 'id'
            ? []
            : [
                {
                  id: 'fixture-role',
                  tenant_id: tenantId,
                  role_code: 'fixture_role',
                  role_name: '验收角色',
                  enabled: true
                }
              ]
      })
    if (table === 'sys_menu')
      return route.fulfill({
        json: [
          {
            id: 'fixture-menu',
            name: 'Fixture',
            path: '/system/fixture',
            component: '/system/fixture',
            type: 'menu',
            meta: { title: '验收菜单', is_enable: true }
          }
        ]
      })
    if (table === 'sys_document_number_scene')
      return route.fulfill({
        json: [
          {
            rule_key: 'fixture_number',
            rule_name: '验收编号',
            field_label: '单据编号',
            menu_id: 'fixture-menu',
            target_table: 'fixture_document',
            target_column: 'document_no',
            category: 'business_document',
            default_template: 'FX{YYYYMM}-{SEQ:3}',
            default_reset_cycle: 'month',
            enabled: true
          }
        ]
      })
    if (table === 'sys_dict_type' && url.searchParams.get('select') !== 'id')
      return route.fulfill({
        json: [
          {
            id: 'fixture-directory',
            name: '验收目录',
            code: 'fixtureDirectory',
            node_type: 'directory',
            status: '1',
            sort: 0
          }
        ]
      })
    return route.fulfill({ json: [] })
  })
  await page.route('**/functions/v1/**', (route) =>
    route.fulfill({
      json: route.request().url().includes('ai-provider-catalog')
        ? {
            source: 'remote',
            protocols: [],
            cached: false,
            fetchedAt: '2026-10-31T00:00:00Z',
            models: [
              {
                id: 'fixture-model',
                label: '验收模型 · OpenAI',
                kind: 'text',
                capability: '文本生成',
                strengths: [],
                recommendedFor: [],
                performanceProfile: 'balanced',
                performanceHint: '综合性能',
                benchmarkable: false,
                description: '验收模型'
              }
            ]
          }
        : { success: true }
    })
  )
}

function field(root: Locator, label: string): Locator {
  return root
    .locator('.el-form-item')
    .filter({ has: root.page().locator('.el-form-item__label').filter({ hasText: label }) })
    .first()
}
function input(root: Locator, label: string): Locator {
  return field(root, label).locator('input:not([type="hidden"]),textarea').first()
}
async function open(page: Page, feature: string, extra = ''): Promise<Locator> {
  await mockRequests(page)
  await page.goto(
    `/tests/e2e/fixtures/form-standard-main.html?feature=${feature}&mode=edit${extra}`,
    { waitUntil: 'domcontentloaded' }
  )
  const dialog =
    feature === 'geofence' ? page.locator('.geofence-config-page') : page.getByRole('dialog').last()
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  if (
    !['tenant', 'role', 'dict-type', 'geofence'].includes(feature) &&
    !(feature === 'menu' && /menuType=(folder|button)/.test(extra))
  )
    await expect(dialog.getByRole('tab').first()).toBeVisible({ timeout: 60_000 })
  return dialog
}

const cases = [
  { feature: 'organization', label: '组织名称', value: '验收组织', tab: '组织层级' },
  { feature: 'menu', label: '菜单名称', value: '验收菜单', tab: '基础定义' },
  { feature: 'notification', label: '规则名称', value: '验收提醒', tab: '触发条件' },
  { feature: 'param', label: '参数名称', value: '验收参数', tab: '基础信息' },
  { feature: 'dict', label: '字典标签', value: '验收选项', tab: '字典定义' },
  { feature: 'user', label: '手机号', value: '13800138000', invalid: 'bad', tab: '联系与账号属性' },
  { feature: 'ai', label: '单次超时', value: '30000', tab: '生成与配额' }
]
for (const item of cases) {
  test(`真实编辑入口 ${item.feature}：非当前页校验、聚焦、纠正保存`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const dialog = await open(page, item.feature)
    await dialog.getByRole('tab', { name: item.tab, exact: true }).click()
    const control = input(dialog, item.label)
    await expect(control).toBeVisible({ timeout: 60_000 })
    await control.fill(item.invalid || '')
    const other = dialog.getByRole('tab').filter({ hasNotText: item.tab }).last()
    await other.click()
    const save = dialog.locator('.art-dialog__footer .el-button--primary')
    await expect(save).toBeEnabled({ timeout: 60_000 })
    await save.click()
    await expect(dialog.getByRole('tab', { name: item.tab, exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(field(dialog, item.label)).toHaveClass(/is-error/)
    await expect(control).toBeFocused()
    await expect(page.getByLabel('保存次数')).toHaveText('0')
    await control.fill(item.value)
    await other.click()
    await save.click()
    await expect(page.getByLabel('保存次数')).toHaveText('1', { timeout: 30_000 })
    await expect(dialog).not.toBeVisible()
    await page.getByRole('button', { name: '重新打开验收入口' }).click()
    await expect(dialog.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
    await page.screenshot({
      path: info.outputPath(`${item.feature}-edit.png`),
      animations: 'disabled'
    })
    expect(errors).toEqual([])
  })
}

for (const item of [
  { feature: 'tenant', label: '租户名称', value: '验收租户' },
  { feature: 'role', label: '角色名称', value: '验收角色' },
  { feature: 'dict-type', label: '目录名称', value: '验收字典类型' }
]) {
  test(`短表单 ${item.feature} 保持紧凑单页并可校验保存`, async ({ page }, info) => {
    const dialog = await open(page, item.feature)
    await expect(dialog.getByRole('tab')).toHaveCount(0)
    const control = input(dialog, item.label)
    await control.fill('')
    const save = dialog.locator('.art-dialog__footer .el-button--primary')
    await save.click()
    await expect(field(dialog, item.label)).toHaveClass(/is-error/)
    await control.fill(item.value)
    await save.click()
    await expect(page.getByLabel('保存次数')).toHaveText('1')
    await expect(dialog).not.toBeVisible()
    await page.getByRole('button', { name: '重新打开验收入口' }).click()
    await expect(control).toBeVisible()
    if (item.feature === 'tenant' || item.feature === 'role') {
      const wrap = dialog.locator('.art-dialog__scrollbar > .el-scrollbar__wrap')
      expect(
        await wrap.evaluate((node) => node.scrollHeight - node.clientHeight),
        '少字段表单在桌面应完整显示'
      ).toBeLessThanOrEqual(2)
    }
    await page.screenshot({
      path: info.outputPath(`${item.feature}-compact.png`),
      animations: 'disabled'
    })
  })
}

for (const feature of ['user-detail', 'menu-detail']) {
  test(`真实详情 ${feature}：分类切换、窄屏、重新打开回首栏`, async ({ page }, info) => {
    const root = await open(page, feature)
    const paneCount = await root.getByRole('tab').count()
    for (const tab of await root.getByRole('tab').all()) {
      await tab.click()
      await expect(tab).toHaveAttribute('aria-selected', 'true')
      await expect(root.locator('.el-tab-pane:visible .art-descriptions')).toBeVisible()
      await expect(root.locator('.el-tab-pane')).toHaveCount(paneCount)
    }
    await page.screenshot({
      path: info.outputPath(`${feature}-desktop.png`),
      animations: 'disabled'
    })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await root.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await page.screenshot({
      path: info.outputPath(`${feature}-mobile.png`),
      animations: 'disabled'
    })
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
      document.documentElement.dataset.boxMode = 'shadow-mode'
    })
    for (const [index, tab] of (await root.getByRole('tab').all()).entries()) {
      await tab.click()
      const label = root.locator('.el-tab-pane:visible .el-descriptions__label').first()
      expect((await label.boundingBox())!.width, '窄屏标签列应给内容保留空间').toBeLessThanOrEqual(
        114
      )
      if (feature === 'menu-detail') {
        const metrics = root.locator('.menu-detail__metrics article')
        const first = (await metrics.nth(0).boundingBox())!
        const second = (await metrics.nth(1).boundingBox())!
        const third = (await metrics.nth(2).boundingBox())!
        expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(1)
        expect(third.y).toBeGreaterThan(first.y)
        const tabBox = (await tab.boundingBox())!
        expect(tabBox.y + tabBox.height, '分类入口应在窄屏首屏内').toBeLessThan(724)
      }
      await page.screenshot({
        path: info.outputPath(`${feature}-${index}-mobile-dark.png`),
        animations: 'disabled'
      })
    }
    await expect(page.getByLabel('保存次数')).toHaveText('0')
    await root.getByRole('button', { name: '关闭抽屉', exact: true }).click()
    await expect(root).not.toBeVisible()
    await page.getByRole('button', { name: '重新打开验收入口' }).click()
    await expect(root.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')
  })
}

for (const [type, label] of [
  ['folder', '目录名称'],
  ['button', '权限名称']
] as const) {
  test(`菜单${type}短模式不拆页签、校验修正后可保存`, async ({ page }, info) => {
    const dialog = await open(page, 'menu', `&menuType=${type}`)
    await expect(dialog.getByRole('tab')).toHaveCount(0)
    const control = input(dialog, label)
    await control.clear()
    const save = dialog.locator('.art-dialog__footer .el-button--primary')
    await save.click()
    await expect(control).toBeFocused()
    await expect(field(dialog, label)).toHaveClass(/is-error/)
    await control.fill('验收节点')
    const request = page.waitForRequest(
      (request) => request.url().includes('/sys_menu') && request.method() === 'PATCH'
    )
    await save.click()
    expect((await request).postDataJSON()).toMatchObject({ type, meta: { title: '验收节点' } })
    await expect(page.getByLabel('保存次数')).toHaveText('1')
    await page.getByRole('button', { name: '重新打开验收入口' }).click()
    await page.screenshot({ path: info.outputPath(`menu-${type}-compact.png`) })
  })
}

test('已有目录更换父级时保留组件路径，新目录仍按父级使用默认组件', async ({ page }) => {
  const dialog = await open(page, 'menu', '&menuType=folder&menuMove=1')
  const component = input(dialog, '组件路径')
  await expect(component).toHaveValue('/legacy/folder-view')
  await expect(component).toBeDisabled()

  await field(dialog, '父级菜单').getByRole('combobox').click()
  await page.getByRole('treeitem', { name: '目标目录', exact: true }).click()
  await expect(component).toHaveValue('/legacy/folder-view')

  const saved: Array<Record<string, unknown>> = []
  await page.route('**/rest/v1/sys_menu?**', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>
      if ('component' in body) saved.push(body)
    }
    await route.fulfill({
      status: 204,
      headers: { 'content-range': '*/1', 'access-control-expose-headers': 'content-range' }
    })
  })
  await dialog.locator('.art-dialog__footer .el-button--primary').click()
  await expect(page.getByLabel('保存次数')).toHaveText('1')
  expect(saved).toHaveLength(1)
  expect(saved[0]).toMatchObject({
    parent_id: 'target-folder',
    path: '/legacy/folder',
    component: '/legacy/folder-view'
  })
  await page.unroute('**/rest/v1/sys_menu?**')

  await page.goto(
    '/tests/e2e/fixtures/form-standard-main.html?feature=menu&mode=add&menuType=folder&menuMove=1'
  )
  const newDialog = page.getByRole('dialog').last()
  await expect(newDialog).toBeVisible()
  await expect(input(newDialog, '组件路径')).toHaveValue('/index/index')
  await field(newDialog, '父级菜单').getByRole('combobox').click()
  await page.getByRole('treeitem', { name: '目标目录', exact: true }).click()
  await expect(input(newDialog, '组件路径')).toHaveValue('')
})

test('字典类型短模式同屏保留归属、级联与展示，校验后可保存', async ({ page }, info) => {
  const optionWarnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('Failed setting prop')) {
      optionWarnings.push(message.text())
    }
  })
  const dialog = await open(page, 'dict-type', '&nodeType=dictionary')
  await expect(dialog.getByRole('tab')).toHaveCount(0)
  const control = input(dialog, '类型名称')
  await control.clear()
  const save = dialog.locator('.art-dialog__footer .el-button--primary')
  await save.click()
  await expect(control).toBeFocused()
  await control.fill('验收业务字典')
  const request = page.waitForRequest(
    (request) => request.url().includes('/sys_dict_type') && request.method() === 'PATCH'
  )
  await save.click()
  expect((await request).postDataJSON()).toMatchObject({
    node_type: 'dictionary',
    parent_id: 'fixture-directory'
  })
  await expect(page.getByLabel('保存次数')).toHaveText('1')
  await page.getByRole('button', { name: '重新打开验收入口' }).click()
  const wrap = dialog.locator('.art-dialog__scrollbar > .el-scrollbar__wrap')
  expect(
    await wrap.evaluate((node) => node.scrollHeight - node.clientHeight),
    '字典节点少字段表单在桌面应完整显示'
  ).toBeLessThanOrEqual(2)
  await page.screenshot({ path: info.outputPath('dict-type-compact.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    document.documentElement.classList.add('dark')
    document.documentElement.dataset.boxMode = 'shadow-mode'
  })
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: info.outputPath('dict-type-mobile-dark.png') })
  await input(dialog, '描述').scrollIntoViewIfNeeded()
  await expect(input(dialog, '描述')).toBeVisible()
  await page.screenshot({ path: info.outputPath('dict-type-mobile-dark-bottom.png') })
  expect(optionWarnings).toEqual([])
})

test('编号规则跨页校验模板、聚焦修正并按目标租户提交', async ({ page }, info) => {
  const dialog = await open(page, 'number')
  await field(dialog, '所属菜单').getByRole('combobox').click()
  await page.getByRole('treeitem', { name: '验收菜单', exact: true }).click()
  await field(dialog, '编号功能').getByRole('combobox').click()
  await page.getByRole('option', { name: '验收编号 · 单据编号', exact: true }).click()
  await dialog.getByRole('tab', { name: '生成策略', exact: true }).click()
  const template = input(dialog, '编号模板')
  await template.clear()
  await dialog.getByRole('tab', { name: '业务归属', exact: true }).click()
  await dialog.getByRole('button', { name: '批量配置', exact: true }).click()
  await expect(dialog.getByRole('tab', { name: '生成策略', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(template).toBeFocused()
  await expect(field(dialog, '编号模板')).toHaveClass(/is-error/)
  await template.fill('FX{YYYYMM}-{SEQ:3}')
  const request = page.waitForRequest((request) =>
    request.url().includes('/configure_document_number_rule_for_tenants')
  )
  await dialog.getByRole('tab', { name: '业务归属', exact: true }).click()
  await dialog.getByRole('button', { name: '批量配置', exact: true }).click()
  expect((await request).postDataJSON()).toMatchObject({
    p_rule_key: 'fixture_number',
    p_tenant_ids: [tenantId],
    p_template: 'FX{YYYYMM}-{SEQ:3}'
  })
  await expect(page.getByLabel('保存次数')).toHaveText('1')
  await page.getByRole('button', { name: '重新打开验收入口' }).click()
  await page.screenshot({ path: info.outputPath('number-rule-tabs.png') })
})

test('围栏少字段配置保持单页，修改后按原权限发布', async ({ page }, info) => {
  const root = await open(page, 'geofence')
  await expect(root.getByRole('tab')).toHaveCount(0)
  const radius = input(root, '装货默认半径')
  await expect(radius).toBeEnabled()
  await radius.fill('1500')
  await radius.press('Tab')
  const request = page.waitForRequest((request) =>
    request.url().includes('/tms_save_geofence_config')
  )
  await root.getByRole('button', { name: '保存并发布策略', exact: true }).click()
  expect((await request).postDataJSON()).toMatchObject({ p_config: { loadingRadiusM: 1500 } })
  await expect(root.getByRole('button', { name: '保存并发布策略', exact: true })).toBeDisabled()
  await page.screenshot({ path: info.outputPath('geofence-single-page.png') })
})

for (const [feature, panes] of [
  ['ai-run-detail', ['运行概览', '调用与对话', '智能诊断']],
  ['workflow-detail', ['业务与概览', '审批进度', '流转记录']]
] as const) {
  test(`${feature} 长详情横向分类、切换保留挂载、窄暗和重开复位`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const root = await open(page, feature)
    await expect(root.getByRole('tab')).toHaveCount(panes.length)
    for (const pane of panes) {
      await root.getByRole('tab', { name: pane, exact: true }).click()
      await expect(root.locator('.el-tab-pane:visible')).toHaveCount(1)
      await expect(root.locator('.el-tab-pane')).toHaveCount(panes.length)
      await page.screenshot({
        path: info.outputPath(`${feature}-${panes.indexOf(pane)}-light.png`)
      })
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => {
      document.documentElement.classList.add('dark')
      document.documentElement.dataset.boxMode = 'shadow-mode'
    })
    for (const pane of panes) {
      await root.getByRole('tab', { name: pane, exact: true }).click()
      expect(await root.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
      await page.screenshot({ path: info.outputPath(`${feature}-${panes.indexOf(pane)}-dark.png`) })
    }
    await root.getByRole('button', { name: '关闭抽屉', exact: true }).click()
    await expect(root).not.toBeVisible()
    await page.getByRole('button', { name: '重新打开验收入口' }).click()
    await expect(root.getByRole('tab', { name: panes[0], exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(errors).toEqual([])
  })
}
