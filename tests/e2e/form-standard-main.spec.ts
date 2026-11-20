import { writeFile } from 'node:fs/promises'
import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { expectStackedFormErrorFlow } from './support/form-error-layout'

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

async function mockRequests(page: Page, { ordinary = false } = {}): Promise<void> {
  await prepareIsolatedSession(page, ordinary ? { tenantId, platformSuper: false } : {})
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').pop()
    const method = route.request().method()
    if (table === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
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

async function expectSectionCardFormAlignment(
  card: Locator,
  header: Locator,
  control: Locator
): Promise<void> {
  const [surface, heading, divider, tabs, input] = await Promise.all([
    card.boundingBox(),
    header.locator('.art-section-title').boundingBox(),
    header.boundingBox(),
    card.locator('.art-form__tabs').boundingBox(),
    control.boundingBox()
  ])
  if (!surface || !heading || !divider || !tabs || !input)
    throw new Error('表单卡片缺少标题、页签或输入框')
  expect(Math.abs(divider.x - surface.x - 1)).toBeLessThanOrEqual(1)
  expect(Math.abs(divider.x + divider.width - (surface.x + surface.width - 1))).toBeLessThanOrEqual(
    1
  )
  expect(tabs.x - surface.x).toBeLessThanOrEqual(18)
  expect(tabs.x).toBeGreaterThan(surface.x)
  expect(Math.abs(heading.x - tabs.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(input.x - tabs.x)).toBeLessThanOrEqual(1)
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
    if (item.feature === 'param') await page.setViewportSize({ width: 1440, height: 900 })
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
    if (item.feature === 'param') {
      const card = dialog.locator('.system-param-dialog__form')
      const header = card.locator('.system-param-dialog__section-head')
      const parameterName = field(dialog, '参数名称').locator('.el-input')
      const preview = dialog.locator('.system-param-dialog__preview')
      await expect(preview.getByText('配置预览', { exact: true })).toBeVisible()
      await expectSectionCardFormAlignment(card, header, parameterName)
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(preview).toBeHidden()
      await expectSectionCardFormAlignment(card, header, parameterName)
      await dialog.screenshot({ path: info.outputPath('param-edit-390.png') })
    }
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
    await expect(root.getByText('2026-10-31 08:09:10', { exact: true })).toBeAttached()
    await expect(root.getByText('2026-11-01 09:10:11', { exact: true })).toBeAttached()
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
    if (feature === 'user-detail') {
      const writes: string[] = []
      page.on('request', (request) => {
        if (
          request.method() !== 'GET' &&
          /\/(?:rest|functions)\/v1\//.test(request.url()) &&
          !/\/rpc\/(?:current_is_super|material_unit_compatibility_options|get_table_column_runtime)$/.test(
            request.url()
          )
        )
          writes.push(request.url())
      })
      const statusItems = [
        { code: 'status', value: '1', label: '启用配置', status: '1', tag_type: 'warning' },
        { code: 'status', value: '0', label: '停用历史', status: '0', tag_type: 'danger' },
        {
          code: 'hrEmploymentStatus',
          value: 'active',
          label: '在职',
          status: '0',
          tag_type: 'success'
        }
      ].map(({ code, ...item }) => ({
        ...item,
        id: `${code}-${item.value}`,
        dict_type_table: { code, name: code }
      }))
      for (const variant of [
        { value: '1', label: '启用配置', tone: 'warning', width: 1440 },
        { value: '0', label: '停用历史', tone: 'danger', width: 1440 },
        { value: '', label: '--', width: 390 },
        { value: 'legacy-user-status', label: '待核对', width: 390 }
      ]) {
        await mockRequests(page, { ordinary: true })
        const appearance = {
          theme: variant.width === 390 ? ('dark' as const) : ('light' as const),
          boxBorderMode: variant.width !== 390
        }
        await prepareAppearance(page, appearance)
        await page.setViewportSize({ width: variant.width, height: 844 })
        const displayReads: string[] = []
        let dictionaryPreloaded = false
        await page.route('**/rest/v1/sys_dictionary?*', (route) => {
          const url = new URL(route.request().url())
          const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
          const value = url.searchParams.get('value')?.replace(/^eq\./, '')
          const rows = [
            ...dictionaryRows.filter((item) => item.dict_type_table.code !== 'status'),
            ...statusItems
          ].filter((item) => !code || item.dict_type_table.code === code)
          if (value !== undefined) {
            expect(url.searchParams.has('status')).toBe(false)
            displayReads.push(`${code}:${value}`)
          } else {
            expect(url.searchParams.get('status')).toBe('eq.1')
            if (!code) dictionaryPreloaded = true
          }
          return route.fulfill({
            json: rows.filter((item) =>
              value === undefined ? item.status === '1' : item.value === value
            )
          })
        })
        const query = new URLSearchParams({
          feature,
          role: 'ordinary',
          userStatus: variant.value,
          employmentStatus: 'active',
          theme: appearance.theme
        })
        await page.goto(`/tests/e2e/fixtures/form-standard-main.html?${query}`)
        await assertAppearance(page, appearance)
        await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
        const detail = page.getByRole('dialog', { name: '用户详情', exact: true })
        await expect(detail.getByRole('heading', { name: '验收用户', exact: true })).toBeVisible()
        expect(dictionaryPreloaded).toBe(true)
        const status = detail.locator('.user-detail__title-row .el-tag').first()
        await detail.getByRole('tab', { name: '员工档案关联', exact: true }).click()
        const employment = detail
          .getByText('在职状态', { exact: true })
          .locator('xpath=following-sibling::*[1]')
        await expect.soft(employment).toHaveText('在职')
        expect.soft((await status.innerText()).trim()).toBe(variant.label)
        if ('tone' in variant)
          expect.soft(await status.getAttribute('class')).toContain(`el-tag--${variant.tone}`)
        if (!['1', '0'].includes(variant.value))
          expect.soft(await status.innerText()).not.toContain('停用')
        expect.soft(await detail.innerText()).not.toContain('legacy-user-status')
        expect.soft(displayReads).toContain('hrEmploymentStatus:active')
        if (variant.value === '0') expect.soft(displayReads).toContain('status:0')
        await expect(page.getByLabel('保存次数')).toHaveText('0')
        await detail.screenshot({
          path: info.outputPath(`user-status-${variant.value || 'empty'}-${variant.width}.png`),
          animations: 'disabled'
        })
      }
      expect(writes).toEqual([])
    }
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

test('已有相对路径目录更换父级时保留路径与组件，新目录仍按父级使用默认组件', async ({ page }) => {
  const dialog = await open(page, 'menu', '&menuType=folder&menuMove=1')
  const path = input(dialog, '路由地址')
  const component = input(dialog, '组件路径')
  await expect(path).toHaveValue('folder')
  await expect(component).toHaveValue('/legacy/folder-view')
  await expect(component).toBeDisabled()

  await field(dialog, '父级菜单').getByRole('combobox').click()
  await page.getByRole('treeitem', { name: '目标目录', exact: true }).click()
  await expect(path).toHaveValue('folder')
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
    path: 'folder',
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

async function sampleDictionaryCascader(dialog: Locator, loaded: boolean) {
  return dialog.evaluate((root, loaded) => {
    const form = root.querySelector('.art-form')
    const parent = form?.querySelector('[data-art-form-item-key="parentId"]')
    const content = parent?.querySelector('.art-form-item__content')
    const nativeContent = parent?.querySelector('.el-form-item__content')
    const label = parent?.querySelector('.el-form-item__label')
    const control = parent?.querySelector(loaded ? '.art-cascader' : '.art-async-state')
    const nativeControl = control?.querySelector(
      loaded ? '.el-cascader' : '.art-form-control-skeleton, .el-skeleton'
    )
    const inputRoot = loaded ? nativeControl?.querySelector('.el-input') : nativeControl
    const wrapper = loaded ? inputRoot?.querySelector('.el-input__wrapper') : nativeControl
    const innerInput = loaded ? inputRoot?.querySelector('.el-input__inner') : undefined
    const sortLabel = form?.querySelector('[data-art-form-item-key="sort"] .el-form-item__label')
    const remarkLabel = form?.querySelector(
      '[data-art-form-item-key="remark"] .el-form-item__label'
    )
    const footer = root.querySelector('.art-dialog__footer-actions')
    const scroll = root.querySelector('.art-dialog__scrollbar > .el-scrollbar__wrap')
    if (
      !form ||
      !parent ||
      !content ||
      !nativeContent ||
      !label ||
      !control ||
      !nativeControl ||
      !inputRoot ||
      !wrapper ||
      !sortLabel ||
      !remarkLabel ||
      !footer ||
      !scroll
    )
      throw new Error('真实字典目录的上级目录布局尚未就绪')
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return {
        x: rect.x + scrollX,
        y: rect.y + scrollY,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom + scrollY
      }
    }
    const inViewport = (element: Element, container?: Element) => {
      const rect = element.getBoundingClientRect()
      const frame = container?.getBoundingClientRect()
      const style = getComputedStyle(element)
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.left >= Math.max(0, frame?.left ?? 0) - 1 &&
        rect.right <= Math.min(innerWidth, frame?.right ?? innerWidth) + 1 &&
        rect.top >= Math.max(0, frame?.top ?? 0) - 1 &&
        rect.bottom <= Math.min(innerHeight, frame?.bottom ?? innerHeight) + 1
      )
    }
    const nativeValue = (key: string) => {
      const input = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[data-art-form-item-key="${key}"] input, [data-art-form-item-key="${key}"] textarea`
      )
      if (!input) throw new Error(`${key} 原生控件未就绪`)
      return input.value
    }
    const baseline = (element: Element) => {
      const style = getComputedStyle(element)
      return {
        display: style.display,
        verticalAlign: style.verticalAlign,
        lineHeight: style.lineHeight,
        className: element.className
      }
    }
    return {
      content: bounds(content),
      nativeContent: bounds(nativeContent),
      control: bounds(control),
      nativeControl: bounds(nativeControl),
      inputRoot: bounds(inputRoot),
      wrapper: bounds(wrapper),
      innerInput: innerInput ? bounds(innerInput) : null,
      label: bounds(label),
      form: bounds(form),
      sortLabel: bounds(sortLabel),
      remarkLabel: bounds(remarkLabel),
      targetVisible: {
        control: inViewport(control, scroll),
        sortLabel: inViewport(sortLabel, scroll),
        remarkLabel: inViewport(remarkLabel, scroll)
      },
      footer: bounds(footer),
      footerVisible: inViewport(footer),
      footerButtons: [...footer.querySelectorAll('button')].map((button) => ({
        text: button.textContent?.trim(),
        bounds: bounds(button),
        visible: inViewport(button)
      })),
      scroll: {
        top: scroll.scrollTop,
        left: scroll.scrollLeft,
        height: scroll.scrollHeight,
        client: scroll.clientHeight,
        width: scroll.scrollWidth,
        clientWidth: scroll.clientWidth,
        bounds: bounds(scroll)
      },
      pageScroll: { x: scrollX, y: scrollY },
      overflow: {
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dialog: root.scrollWidth - root.clientWidth
      },
      baseline: {
        content: baseline(content),
        nativeContent: baseline(nativeContent),
        control: baseline(control),
        nativeControl: baseline(nativeControl),
        inputRoot: baseline(inputRoot),
        wrapper: baseline(wrapper)
      },
      nativeValues: {
        name: nativeValue('name'),
        code: nativeValue('code'),
        sort: nativeValue('sort'),
        remark: nativeValue('remark'),
        selectedSegments: [...form.querySelectorAll('.el-segmented__item.is-selected')].map(
          (item) => item.textContent?.trim()
        )
      },
      parentDisplay: loaded ? nativeValue('parentId') : null
    }
  }, loaded)
}

for (const profile of [
  { width: 1440, height: 1000, theme: 'light', boxBorderMode: true },
  { width: 390, height: 844, theme: 'dark', boxBorderMode: false }
] as const) {
  test(`真实字典目录Cascader加载几何 ${profile.width}/${profile.theme}/${profile.boxBorderMode ? 'border' : 'shadow'}`, async ({
    page
  }, info) => {
    const held: Route[] = []
    const requests: string[] = [],
      optionRequests: string[] = [],
      optionResponses: { url: string; status: number }[] = [],
      writes: { method: string; url: string }[] = [],
      errors: string[] = [],
      warnings: string[] = []
    await mockRequests(page)
    await prepareAppearance(page, profile)
    await page.setViewportSize({ width: profile.width, height: profile.height })
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (
        /maximum recursive updates|slot.+invoked outside|unhandled error during execution|failed setting prop/i.test(
          message.text()
        )
      )
        warnings.push(message.text())
    })
    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.pathname === '/rest/v1/sys_dict_type' && request.method() === 'GET')
        optionRequests.push(url.pathname + url.search)
      if (
        url.pathname.startsWith('/rest/v1/') &&
        !/\/rpc\/(?:current_is_super|material_unit_compatibility_options)$/.test(url.pathname) &&
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
      )
        writes.push({ method: request.method(), url: url.pathname + url.search })
    })
    page.on('response', (response) => {
      const url = new URL(response.url())
      if (url.pathname === '/rest/v1/sys_dict_type' && response.request().method() === 'GET')
        optionResponses.push({ url: url.pathname + url.search, status: response.status() })
    })
    const scriptPath = '/src/components/core/forms/art-cascader/index.vue'
    await page.route('**/src/components/core/forms/art-cascader/index.vue*', (route) => {
      const request = route.request(),
        url = new URL(request.url())
      if (
        request.resourceType() !== 'script' ||
        url.pathname !== scriptPath ||
        url.searchParams.has('vue')
      )
        return route.continue()
      requests.push(url.pathname + url.search)
      held.push(route)
    })
    try {
      // This fixture forces shadow mode for theme=dark; use persisted appearance without a theme URL.
      await page.goto('/tests/e2e/fixtures/form-standard-main.html?feature=dict-type&mode=edit', {
        waitUntil: 'domcontentloaded'
      })
      const dialog = page.getByRole('dialog', { name: '编辑字典目录', exact: true })
      await expect(dialog).toBeVisible({ timeout: 60_000 })
      await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false', {
        timeout: 60_000
      })
      await assertAppearance(page, profile)
      await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
      const form = dialog.locator('.art-form')
      const parent = form.locator('[data-art-form-item-key="parentId"]')
      const sort = form.locator('[data-art-form-item-key="sort"]')
      const remark = form.locator('[data-art-form-item-key="remark"]')
      await expect.poll(() => held.length, { timeout: 60_000 }).toBe(1)
      await expect(form.locator('.art-async-state[aria-busy="true"]')).toHaveCount(1, {
        timeout: 60_000
      })
      await expect(form.locator('.art-async-state')).toHaveCount(1)
      await expect(parent.locator('.art-async-state[aria-busy="true"]')).toBeVisible()
      await expect.poll(() => optionResponses.length).toBeGreaterThan(0)
      await expect(form.locator('[data-art-form-item-key="name"] input')).toHaveValue(
        '验收字典类型'
      )
      await expect(form.locator('[data-art-form-item-key="code"] input')).toHaveValue(
        'fixtureDictionary'
      )
      await expect(sort.locator('input')).toHaveValue('1')
      await expect(remark.locator('textarea')).toHaveValue('')
      await expect(form.locator('.el-segmented__item.is-selected')).toHaveText(['目录', '启用'])
      await expect(form.locator('.el-form-item__error')).toHaveCount(0)
      await page.addStyleTag({ path: 'tests/e2e/visual-stability.css' })
      const scroll = dialog.locator('.art-dialog__scrollbar > .el-scrollbar__wrap')
      await scroll.evaluate((node) => {
        node.scrollTop = 0
      })
      // Scroll once before sampling. Releasing the script must preserve this exact position.
      await parent.scrollIntoViewIfNeeded()
      const originalForm = await form.elementHandle(),
        originalParent = await parent.elementHandle(),
        originalSort = await sort.elementHandle(),
        originalRemark = await remark.elementHandle()
      if (!originalForm || !originalParent || !originalSort || !originalRemark)
        throw new Error('真实字典目录表单结构未挂载')
      const settle = async () => {
        const stable = await dialog.evaluate(async (root) => {
          await document.fonts.ready
          let previous = '',
            frames = 0
          for (let attempt = 0; attempt < 120 && frames < 6; attempt++) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            const current = JSON.stringify(
              [
                ...root.querySelectorAll(
                  '.art-form, [data-art-form-item-key="parentId"], [data-art-form-item-key="sort"], [data-art-form-item-key="remark"], .art-dialog__footer-actions'
                )
              ].map((node) => node.getBoundingClientRect().toJSON())
            )
            frames = current === previous ? frames + 1 : 0
            previous = current
          }
          return frames
        })
        expect(stable).toBe(6)
      }
      await settle()
      const loading = await sampleDictionaryCascader(dialog, false)
      await page.screenshot({
        path: info.outputPath('real-dictionary-cascader-loading.png'),
        fullPage: true,
        animations: 'disabled'
      })
      const pending = held.shift()
      if (!pending) throw new Error('上级目录脚本没有待放行请求')
      await pending.continue()
      await expect(parent.locator('.art-async-state')).toHaveCount(0, { timeout: 60_000 })
      await expect(parent.locator('.art-cascader')).toBeVisible()
      await expect(parent.locator('.el-input__inner')).toHaveValue('')
      await expect(form.locator('.el-form-item__error')).toHaveCount(0)
      await settle()
      const loaded = await sampleDictionaryCascader(dialog, true)
      await page.screenshot({
        path: info.outputPath('real-dictionary-cascader-loaded.png'),
        fullPage: true,
        animations: 'disabled'
      })
      const geometryPath = info.outputPath('real-dictionary-cascader-geometry.json')
      await writeFile(
        geometryPath,
        JSON.stringify(
          {
            profile,
            originalParentIdSeed: null,
            requests,
            optionRequests,
            optionResponses,
            writes,
            errors,
            warnings,
            loading,
            loaded
          },
          null,
          2
        ),
        'utf8'
      )
      await info.attach('real-dictionary-cascader-geometry', {
        path: geometryPath,
        contentType: 'application/json'
      })

      for (const key of [
        'content',
        'nativeContent',
        'control',
        'nativeControl',
        'inputRoot',
        'wrapper'
      ] as const) {
        expect
          .soft(Math.abs(loading[key].height - loaded[key].height), `${key} 高度`)
          .toBeLessThanOrEqual(2)
        expect
          .soft(Math.abs(loading[key].width - loaded[key].width), `${key} 宽度`)
          .toBeLessThanOrEqual(2)
        expect
          .soft(
            Math.abs(loading[key].x - loading.form.x - (loaded[key].x - loaded.form.x)),
            `${key} 相对表单横向位置`
          )
          .toBeLessThanOrEqual(2)
      }
      for (const [name, delta] of [
        [
          '标签到控件距离',
          loading.control.y - loading.label.bottom - (loaded.control.y - loaded.label.bottom)
        ],
        [
          '排序标签相对表单位置',
          loading.sortLabel.y - loading.form.y - (loaded.sortLabel.y - loaded.form.y)
        ],
        [
          '描述标签相对表单位置',
          loading.remarkLabel.y - loading.form.y - (loaded.remarkLabel.y - loaded.form.y)
        ],
        ['操作区位置', loading.footer.y - loaded.footer.y],
        ['操作区宽度', loading.footer.width - loaded.footer.width],
        ['操作区横向位置', loading.footer.x - loaded.footer.x],
        ['滚动内容自然高度', loading.scroll.height - loaded.scroll.height],
        ['滚动视口高度', loading.scroll.client - loaded.scroll.client],
        ['滚动视口宽度', loading.scroll.clientWidth - loaded.scroll.clientWidth]
      ] as const)
        expect.soft(Math.abs(delta), name).toBeLessThanOrEqual(2)
      for (const key of ['sortLabel', 'remarkLabel'] as const) {
        expect
          .soft(Math.abs(loading[key].width - loaded[key].width), `${key} 宽度`)
          .toBeLessThanOrEqual(2)
        expect
          .soft(
            Math.abs(loading[key].x - loading.form.x - (loaded[key].x - loaded.form.x)),
            `${key} 相对表单横向位置`
          )
          .toBeLessThanOrEqual(2)
      }
      expect.soft(loaded.scroll.top, '保留采样滚动位置').toBe(loading.scroll.top)
      expect(loaded.scroll.left).toBe(loading.scroll.left)
      expect(loaded.pageScroll).toEqual(loading.pageScroll)
      expect(loaded.nativeValues).toEqual(loading.nativeValues)
      expect(loaded.parentDisplay).toBe('')
      for (const state of [loading, loaded]) {
        expect.soft(state.targetVisible.control, '截图中的上级目录控件完整可见').toBe(true)
        expect.soft(state.targetVisible.sortLabel, '截图中的后续排序标签可见').toBe(true)
        expect.soft(state.footerVisible, '操作区可视').toBe(true)
        expect(state.footerButtons.map(({ text }) => text)).toEqual(['取消', '保存更改'])
        for (const button of state.footerButtons)
          expect.soft(button.visible, `${button.text} 可视`).toBe(true)
        expect.soft(state.overflow.page, '页面横向溢出').toBeLessThanOrEqual(1)
        expect.soft(state.overflow.dialog, '弹窗横向溢出').toBeLessThanOrEqual(1)
        expect
          .soft(state.scroll.width - state.scroll.clientWidth, '滚动区域横向溢出')
          .toBeLessThanOrEqual(1)
      }
      for (const [locator, original] of [
        [form, originalForm],
        [parent, originalParent],
        [sort, originalSort],
        [remark, originalRemark]
      ] as const)
        expect(await locator.evaluate((current, previous) => current === previous, original)).toBe(
          true
        )
      await expect(page.getByLabel('保存次数')).toHaveText('0')
      expect(writes).toEqual([])
      expect(requests).toHaveLength(1)
      expect(optionRequests.length).toBeGreaterThan(0)
      expect(optionResponses.length).toBe(optionRequests.length)
      expect(optionResponses.every(({ status }) => status >= 200 && status < 300)).toBe(true)
      expect(errors).toEqual([])
      expect(warnings).toEqual([])
    } finally {
      for (const pending of held.splice(0)) await pending.continue()
    }
  })
}

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
  await page.setViewportSize({ width: 1440, height: 900 })
  const dialog = await open(page, 'number')
  const formCard = dialog.locator('.number-rule-create__form')
  const formTabs = formCard.locator('.art-form__tabs')
  const preview = dialog.locator('.number-rule-create__preview')
  await expect(formCard.getByText('批量配置租户规则', { exact: true })).toBeVisible()
  await expect(formCard).toHaveCSS('border-top-width', '1px')
  await expect(formTabs).toHaveCSS('border-top-width', '0px')
  await expect(formTabs).toHaveCSS('padding-inline-start', '0px')
  await expect(formTabs).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(preview.getByText('配置预览', { exact: true })).toBeVisible()
  await expect(preview).toHaveCSS('border-top-width', '1px')
  const formBounds = (await formCard.boundingBox())!
  const previewBounds = (await preview.boundingBox())!
  expect(previewBounds.x).toBeGreaterThanOrEqual(formBounds.x + formBounds.width)

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
  const header = formCard.locator('.number-rule-create__header')
  const templateControl = field(dialog, '编号模板').locator('.el-input')
  await expectSectionCardFormAlignment(formCard, header, templateControl)
  await template.fill('FX{YYYYMM}-{SEQ:3}')
  await expect(preview.locator('code')).toHaveText(/^FX\d{6}-\d{3}$/)
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

  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('html').evaluate((element) => {
    element.classList.add('dark')
    element.dataset.uiScope = 'workspace'
    element.dataset.boxMode = 'shadow-mode'
  })
  await expect(preview).toBeHidden()
  await expect(formCard).not.toHaveCSS('box-shadow', 'none')
  await expect(formTabs).toHaveCSS('box-shadow', 'none')
  await expect(formTabs).toHaveCSS('padding-inline-start', '0px')
  await dialog.getByRole('tab', { name: '生成策略', exact: true }).click()
  await expect(template).toBeVisible()
  await expectSectionCardFormAlignment(formCard, header, templateControl)
  expect(await formCard.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await dialog.screenshot({ path: info.outputPath('number-rule-tabs-dark-390.png') })
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

for (const feature of ['menu', 'menu-detail', 'menu-sort'] as const) {
  test(`菜单异步读取归属 ${feature}：旧成功和失败不改新会话，当前重试可恢复`, async ({
    page
  }, info) => {
    const errors: string[] = []
    const writes: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await mockRequests(page)
    const readonlyRpc = new Set([
      'current_is_super',
      'get_organization_list_secure',
      'get_login_default_language',
      'current_user_role_names',
      'get_table_column_runtime',
      'material_unit_compatibility_options'
    ])
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const name = url.pathname.split('/').at(-1) ?? ''
      if (
        request.method() !== 'GET' &&
        !(url.pathname.includes('/rpc/') && readonlyRpc.has(name))
      ) {
        writes.push(`${request.method()} ${url.pathname}`)
        return route.fulfill({ status: 403, json: { message: '此用例只允许读取' } })
      }
      return route.fallback()
    })
    await page.goto(
      `/tests/e2e/fixtures/form-standard-main.html?feature=${feature}&mode=edit&menuReadContext=1`,
      { waitUntil: 'domcontentloaded' }
    )
    const overlay = page.locator(
      feature === 'menu-detail' ? '.el-drawer:visible' : '.el-dialog:visible'
    )
    const viewport = overlay.locator('.art-dialog__viewport,.art-drawer__viewport')
    const close = () =>
      overlay.getByRole('button', {
        name: feature === 'menu-detail' ? '关闭抽屉' : '关闭弹窗',
        exact: true
      })
    const started = page.getByTestId('menu-read-started')
    const completed = page.getByTestId('menu-read-open-completed')
    let requestCount = 1
    let completedCount = 0
    const expectCurrentB = async () => {
      await expect(viewport).toHaveAttribute('aria-busy', 'false')
      await expect(overlay.locator('.el-alert--error')).toHaveCount(0)
      if (feature === 'menu') {
        await expect(input(overlay, '菜单名称')).toHaveValue('读取菜单 B')
        const parent = field(overlay, '父级菜单')
        await expect(parent.locator('.el-select')).toContainText('读取父级 B')
        await parent.getByRole('combobox').click()
        const options = page.locator('.el-select-dropdown:visible')
        await expect(options).toContainText('读取父级 B')
        await expect(options).not.toContainText('读取父级 A')
        await parent.getByRole('combobox').press('Escape')
        await expect(overlay).toBeVisible()
        await expect(overlay.locator('.art-dialog__footer .el-button--primary')).toBeEnabled()
      } else if (feature === 'menu-detail') {
        await expect(overlay.locator('.menu-detail__hero h2')).toHaveText('读取菜单 B')
        await expect(
          overlay.getByRole('navigation', { name: '菜单层级路径' }).locator(':scope > span')
        ).toHaveText(['读取父级 B', '读取菜单 B'])
      } else {
        await expect(overlay.getByRole('tree')).toContainText('读取父级 B')
        await expect(overlay.getByRole('tree')).toContainText('读取菜单 B')
        await expect(overlay.getByRole('tree')).not.toContainText('读取父级 A')
      }
    }
    try {
      await expect(overlay).toBeVisible()
      await expect(started).toHaveText('1')
      for (const order of ['pending', 'ready'] as const) {
        for (const outcome of ['success', 'failure'] as const) {
          if (requestCount > 1) {
            await page.getByTestId('menu-read-open-A').dispatchEvent('click')
            requestCount++
            await expect(started).toHaveText(String(requestCount))
          }
          const requestA = requestCount
          await expect(viewport).toHaveAttribute('aria-busy', 'true')
          await close().click()
          await expect(overlay).toBeHidden()
          await page.getByTestId('menu-read-open-B').click()
          const requestB = ++requestCount
          await expect(started).toHaveText(String(requestB))
          await expect(viewport).toHaveAttribute('aria-busy', 'true')
          if (order === 'ready') {
            await page.getByTestId(`menu-read-release-${requestB}`).dispatchEvent('click')
            await expect(completed).toHaveText(String(++completedCount))
            await expectCurrentB()
          }
          await page
            .getByTestId(`menu-read-${outcome === 'success' ? 'release' : 'fail'}-${requestA}`)
            .dispatchEvent('click')
          await expect(completed).toHaveText(String(++completedCount))
          if (order === 'pending') {
            await expect
              .soft(viewport, `${feature}: 旧 ${outcome} 不能解除 B 的读取遮罩`)
              .toHaveAttribute('aria-busy', 'true')
            await expect.soft(overlay.locator('.el-alert--error')).toHaveCount(0)
            if (feature === 'menu')
              await expect
                .soft(overlay.locator('.art-dialog__footer .el-button--primary'))
                .toBeDisabled()
            await page.getByTestId(`menu-read-release-${requestB}`).dispatchEvent('click')
            await expect(completed).toHaveText(String(++completedCount))
          }
          await expectCurrentB()
          await close().click()
          await expect(overlay).toBeHidden()
        }
      }
      await page.getByTestId('menu-read-open-B').click()
      const failedCurrent = ++requestCount
      await expect(started).toHaveText(String(failedCurrent))
      await page.getByTestId(`menu-read-fail-${failedCurrent}`).dispatchEvent('click')
      await expect(completed).toHaveText(String(++completedCount))
      await expect(overlay.locator('.el-alert--error')).toBeVisible()
      await expect(viewport).toHaveAttribute('aria-busy', 'false')
      await overlay.getByRole('button', { name: '重新加载', exact: true }).click()
      const retry = ++requestCount
      await expect(started).toHaveText(String(retry))
      await expect(viewport).toHaveAttribute('aria-busy', 'true')
      await page.getByTestId(`menu-read-release-${retry}`).dispatchEvent('click')
      await expectCurrentB()
      await overlay.screenshot({
        path: info.outputPath(`${feature}-read-context.png`),
        animations: 'disabled'
      })
      await expect(page.getByLabel('保存次数')).toHaveText('0')
      expect(writes).toEqual([])
      expect(errors).toEqual([])
    } finally {
      const releaseAll = page.getByTestId('menu-read-release-all')
      if (!page.isClosed() && (await releaseAll.count()) > 0)
        await releaseAll.dispatchEvent('click')
    }
  })
}

for (const width of [390, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`系统参数真实长键名校验在${width}/${theme}避让后续分组`, async ({ page }, info) => {
      const appearance = { theme, boxBorderMode: theme === 'light' }
      await page.setViewportSize({ width, height: 900 })
      await mockRequests(page)
      await prepareAppearance(page, appearance)
      const writes: string[] = []
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => {
        const request = route.request()
        const path = new URL(request.url()).pathname
        if (
          !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) &&
          !/\/rpc\/(?:current_is_super|material_unit_compatibility_options)$/.test(path)
        ) {
          writes.push(`${request.method()} ${path}`)
          return route.fulfill({ status: 403, json: { message: '隔离测试阻止写入' } })
        }
        return route.fallback()
      })
      await page.goto(
        `/tests/e2e/fixtures/form-standard-main.html?feature=param&mode=add&theme=${theme}`,
        { waitUntil: 'domcontentloaded' }
      )
      await assertAppearance(page, appearance)
      const dialog = page.getByRole('dialog', { name: '新增参数', exact: true })
      const keyField = field(dialog, '参数键名')
      const key = input(dialog, '参数键名')
      await expect(key).toBeEditable({ timeout: 60_000 })
      await input(dialog, '参数名称').fill('长键名校验验收参数')
      await key.fill('Invalid key!')
      await key.press('Tab')
      await expect(keyField.getByRole('alert')).toHaveText(
        '键名需使用小写字母、数字、下划线和点号分层，例如 security.password.min_length'
      )
      await dialog.screenshot({ path: info.outputPath(`param-error-${width}-${theme}.png`) })
      const geometry = await expectStackedFormErrorFlow(keyField, field(dialog, '分组'))
      await info.attach('system-param-error-layout', {
        body: JSON.stringify(geometry, null, 2),
        contentType: 'application/json'
      })
      await key.fill('security.password.min_length')
      await key.press('Tab')
      await expect(keyField.getByRole('alert')).toHaveCount(0)
      await expect(key).toHaveValue('security.password.min_length')
      await expect(page.getByLabel('保存次数')).toHaveText('0')
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await expect(dialog).toBeHidden()
      expect(writes).toEqual([])
      expect(errors).toEqual([])
    })
  }
}

test('真实字典目录窄屏头部沿用抽屉全宽副标题布局并保留表单状态', async ({ page }, info) => {
  const appearance = { theme: 'dark', boxBorderMode: false } as const
  const writes: string[] = [],
    errors: string[] = [],
    warnings: string[] = [],
    optionRequests: string[] = [],
    optionResponses: { url: string; status: number }[] = []
  await mockRequests(page)
  await prepareAppearance(page, appearance)
  await page.setViewportSize({ width: 390, height: 844 })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (
      /maximum recursive updates|slot.+invoked outside|unhandled error during execution|failed setting prop/i.test(
        message.text()
      )
    )
      warnings.push(message.text())
  })
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname === '/rest/v1/sys_dict_type' && request.method() === 'GET')
      optionRequests.push(url.pathname + url.search)
  })
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.pathname === '/rest/v1/sys_dict_type' && response.request().method() === 'GET')
      optionResponses.push({ url: url.pathname + url.search, status: response.status() })
  })
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) &&
      !/\/rpc\/(?:current_is_super|material_unit_compatibility_options|get_table_column_runtime|get_organization_list_secure)$/.test(
        path
      )
    ) {
      writes.push(`${request.method()} ${path}`)
      return route.fulfill({ status: 403, json: { message: '隔离测试阻止写入' } })
    }
    return route.fallback()
  })
  // Read the actual directory dialog without theme URL overrides or constructor holds.
  await page.goto('/tests/e2e/fixtures/form-standard-main.html?feature=dict-type&mode=edit', {
    waitUntil: 'domcontentloaded'
  })
  const dialog = page.getByRole('dialog', { name: '编辑字典目录', exact: true })
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false', {
    timeout: 60_000
  })
  await expect(dialog.locator('.art-async-state, .art-overlay-loading')).toHaveCount(0, {
    timeout: 60_000
  })
  await expect.poll(() => optionResponses.length).toBeGreaterThan(0)
  await assertAppearance(page, appearance)
  await expect(page.locator('html')).toHaveAttribute('data-ui-scope', 'workspace')
  const form = dialog.locator('.art-form')
  await expect(form.locator('[data-art-form-item-key="parentId"] .el-cascader')).toBeVisible()
  await expect(form.locator('[data-art-form-item-key="name"] input')).toHaveValue('验收字典类型')
  await expect(form.locator('[data-art-form-item-key="code"] input')).toHaveValue(
    'fixtureDictionary'
  )
  await expect(form.locator('[data-art-form-item-key="sort"] input')).toHaveValue('1')
  await expect(form.locator('[data-art-form-item-key="remark"] textarea')).toHaveValue('')
  await expect(form.locator('.el-segmented__item.is-selected')).toHaveText(['目录', '启用'])
  await expect(form.locator('.el-form-item__error')).toHaveCount(0)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await page.addStyleTag({ path: 'tests/e2e/visual-stability.css' })
  const originalNodes = await dialog.evaluateHandle((root) => ({
    form: root.querySelector('.art-form'),
    title: root.querySelector('.art-dialog__header [role="heading"]'),
    subtitle: root.querySelector('.art-dialog__subtitle'),
    controls: [...root.querySelectorAll('.art-form input, .art-form textarea')]
  }))
  const sample = () =>
    dialog.evaluate((root, original) => {
      const required = (selector: string) => {
        const element = root.querySelector<HTMLElement>(selector)
        if (!element) throw new Error(`真实字典目录缺少 ${selector}`)
        return element
      }
      const bounds = (element: Element) => {
        const rect = element.getBoundingClientRect()
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        }
      }
      const title = required('.art-dialog__header [role="heading"]'),
        subtitle = required('.art-dialog__subtitle'),
        header = required('.art-dialog__header'),
        actions = required('.art-dialog__header-actions'),
        form = required('.art-form'),
        scroll = required('.art-dialog__scrollbar > .el-scrollbar__wrap')
      const text = (element: HTMLElement) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const style = getComputedStyle(element)
        return {
          text: element.textContent?.trim(),
          bounds: bounds(element),
          lines: [...range.getClientRects()]
            .filter((rect) => rect.width > 0)
            .map((rect) => ({
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom
            })),
          display: style.display,
          whiteSpace: style.whiteSpace,
          overflow: style.overflow,
          textOverflow: style.textOverflow,
          lineClamp: style.webkitLineClamp,
          lineHeight: style.lineHeight
        }
      }
      const button = (element: HTMLButtonElement) => {
        const rect = element.getBoundingClientRect(),
          hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return {
          name: element.getAttribute('aria-label') || element.textContent?.trim(),
          bounds: bounds(element),
          disabled: element.disabled,
          tabIndex: element.tabIndex,
          centerReachable: hit === element || (hit !== null && element.contains(hit))
        }
      }
      const headerBounds = bounds(header),
        headerStyle = getComputedStyle(header),
        contentLeft =
          headerBounds.left +
          parseFloat(headerStyle.paddingLeft) +
          parseFloat(headerStyle.borderLeftWidth),
        contentRight =
          headerBounds.right -
          parseFloat(headerStyle.paddingRight) -
          parseFloat(headerStyle.borderRightWidth)
      return {
        width: innerWidth,
        height: innerHeight,
        dialog: bounds(root),
        outerHeader: bounds(required('.el-dialog__header')),
        header: headerBounds,
        main: bounds(required('.art-dialog__header-main')),
        headerStyle: {
          display: headerStyle.display,
          gap: headerStyle.gap,
          flexWrap: headerStyle.flexWrap
        },
        usableHeader: { left: contentLeft, right: contentRight, width: contentRight - contentLeft },
        title: text(title),
        subtitle: text(subtitle),
        actions: bounds(actions),
        buttons: [...actions.querySelectorAll('button')].map(button),
        body: bounds(required('.el-dialog__body')),
        viewport: bounds(required('.art-dialog__viewport')),
        footer: bounds(required('.el-dialog__footer')),
        footerButtons: [...required('.art-dialog__footer-actions').querySelectorAll('button')].map(
          button
        ),
        scroll: {
          bounds: bounds(scroll),
          top: scroll.scrollTop,
          left: scroll.scrollLeft,
          overflowX: scroll.scrollWidth - scroll.clientWidth
        },
        overflowX: {
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          dialog: root.scrollWidth - root.clientWidth
        },
        sameDOM: {
          form: form === original.form,
          title: title === original.title,
          subtitle: subtitle === original.subtitle,
          controls: original.controls.every(
            (element, index) => element === form.querySelectorAll('input, textarea')[index]
          )
        },
        // Capture rendered values only; the test does not expose the private Vue model.
        renderedFields: [...form.querySelectorAll('[data-art-form-item-key]')].map((field) => ({
          key: field.getAttribute('data-art-form-item-key'),
          controls: [
            ...field.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
          ].map((control) => ({
            tag: control.tagName,
            type: control.type,
            value: control.value,
            disabled: control.disabled,
            checked: control instanceof HTMLInputElement ? control.checked : null
          })),
          selected: [...field.querySelectorAll('.el-segmented__item.is-selected')].map((item) =>
            item.textContent?.trim()
          )
        })),
        fieldErrors: form.querySelectorAll('.el-form-item__error').length,
        pendingOrErrorPanels: root.querySelectorAll(
          '.art-async-state, .art-overlay-loading, [role="alert"]'
        ).length
      }
    }, originalNodes)
  const original = await sample()
  const captures: {
    width: number
    stableFrames: number
    keyboard: { name: string | null; focused: boolean }[]
    geometry: Awaited<ReturnType<typeof sample>>
  }[] = []
  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    const stableFrames = await dialog.evaluate(async (root) => {
      await document.fonts.ready
      let previous = '',
        frames = 0
      for (let attempt = 0; attempt < 120 && frames < 6; attempt++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        const current = JSON.stringify(
          [
            ...root.querySelectorAll(
              '.art-dialog__header, .art-dialog__header [role="heading"], .art-dialog__subtitle, .art-dialog__header-actions, .art-dialog__viewport, .el-dialog__footer'
            )
          ].map((element) => element.getBoundingClientRect().toJSON())
        )
        frames = current === previous ? frames + 1 : 0
        previous = current
      }
      return frames
    })
    const buttons = dialog.locator('.art-dialog__header-actions button')
    await expect(buttons).toHaveCount(3)
    const keyboard: { name: string | null; focused: boolean }[] = []
    await buttons.first().focus()
    for (let index = 0; index < (await buttons.count()); index++) {
      if (index > 0) await page.keyboard.press('Tab')
      keyboard.push(
        await buttons.nth(index).evaluate((button) => ({
          name: button.getAttribute('aria-label'),
          focused: document.activeElement === button
        }))
      )
    }
    captures.push({ width, stableFrames, keyboard, geometry: await sample() })
    await page.screenshot({
      path: info.outputPath(`real-dictionary-header-${width}.png`),
      animations: 'disabled'
    })
  }
  const report = {
    appearance,
    seed: {
      nodeType: 'directory',
      name: '验收字典类型',
      code: 'fixtureDictionary',
      parentId: null,
      sort: 1,
      status: '1',
      remark: ''
    },
    original,
    captures,
    optionRequests,
    optionResponses,
    writes,
    errors,
    warnings,
    saveCount: await page.getByLabel('保存次数').textContent()
  }
  const reportPath = info.outputPath('real-dictionary-header-geometry.json')
  await writeFile(reportPath, JSON.stringify(report, null, 2))
  await info.attach('real-dictionary-header-geometry', {
    path: reportPath,
    contentType: 'application/json'
  })
  for (const { width, stableFrames, keyboard, geometry: g } of captures) {
    const label = `${width}/dark/shadow`
    expect.soft(stableFrames, `${label} 布局稳定`).toBe(6)
    expect.soft(g.title.text, `${label} 标题原文`).toBe('编辑字典目录')
    expect.soft(g.subtitle.text, `${label} 副标题原文`).toBe('调整节点归属、级联关系与展示设置')
    expect
      .soft(g.sameDOM, `${label} 未重建原表单或头部`)
      .toEqual({ form: true, title: true, subtitle: true, controls: true })
    expect.soft(g.renderedFields, `${label} 保留已呈现字段值`).toEqual(original.renderedFields)
    expect.soft(g.fieldErrors, `${label} 没有触发表单校验`).toBe(0)
    expect.soft(g.pendingOrErrorPanels, `${label} 正常就绪态`).toBe(0)
    expect
      .soft(
        keyboard.map((button) => button.name),
        `${label} 原头部操作`
      )
      .toEqual(['全屏', '进入专注填单', '关闭弹窗'])
    expect
      .soft(
        keyboard.every((button) => button.focused),
        `${label} 操作可顺序键盘聚焦`
      )
      .toBe(true)
    for (const text of [g.title, g.subtitle]) {
      expect.soft(text.lines.length, `${label} ${text.text} 有实际文字范围`).toBeGreaterThan(0)
      for (const line of text.lines) {
        expect
          .soft(line.left, `${label} 文字左侧完整`)
          .toBeGreaterThanOrEqual(Math.max(0, text.bounds.left, g.usableHeader.left) - 1)
        expect
          .soft(line.right, `${label} 文字右侧完整`)
          .toBeLessThanOrEqual(Math.min(width, text.bounds.right, g.usableHeader.right) + 1)
        expect
          .soft(line.top, `${label} 文字顶部完整`)
          .toBeGreaterThanOrEqual(Math.max(0, text.bounds.top, g.header.top) - 1)
        expect
          .soft(line.bottom, `${label} 文字底部完整`)
          .toBeLessThanOrEqual(Math.min(g.height, text.bounds.bottom, g.header.bottom) + 1)
        for (const button of g.buttons) {
          const b = button.bounds
          expect
            .soft(
              line.right <= b.left + 1 ||
                line.left >= b.right - 1 ||
                line.bottom <= b.top + 1 ||
                line.top >= b.bottom - 1,
              `${label} 文字与 ${button.name} 不重叠`
            )
            .toBe(true)
        }
      }
    }
    if (width <= 640) {
      expect
        .soft(
          Math.abs(g.subtitle.bounds.left - g.usableHeader.left),
          `${label} 副标题左侧使用头部全宽`
        )
        .toBeLessThanOrEqual(1)
      expect
        .soft(
          Math.abs(g.subtitle.bounds.width - g.usableHeader.width),
          `${label} 副标题使用头部全宽`
        )
        .toBeLessThanOrEqual(1)
      expect
        .soft(g.subtitle.bounds.top, `${label} 副标题位于标题和操作下方`)
        .toBeGreaterThanOrEqual(Math.max(g.title.bounds.bottom, g.actions.bottom) - 1)
    }
    for (const [index, button] of g.buttons.entries()) {
      const b = button.bounds
      expect
        .soft(
          b.width > 0 &&
            b.height > 0 &&
            !button.disabled &&
            button.tabIndex >= 0 &&
            button.centerReachable,
          `${label} ${button.name} 可见可达`
        )
        .toBe(true)
      expect
        .soft(b.left, `${label} ${button.name} 左侧可见`)
        .toBeGreaterThanOrEqual(Math.max(0, g.header.left) - 1)
      expect
        .soft(b.right, `${label} ${button.name} 右侧可见`)
        .toBeLessThanOrEqual(Math.min(width, g.header.right) + 1)
      expect
        .soft(b.top, `${label} ${button.name} 顶部可见`)
        .toBeGreaterThanOrEqual(Math.max(0, g.header.top) - 1)
      expect
        .soft(b.bottom, `${label} ${button.name} 底部可见`)
        .toBeLessThanOrEqual(Math.min(g.height, g.header.bottom) + 1)
      for (const other of g.buttons.slice(index + 1)) {
        const o = other.bounds
        expect
          .soft(
            b.right <= o.left + 1 ||
              b.left >= o.right - 1 ||
              b.bottom <= o.top + 1 ||
              b.top >= o.bottom - 1,
            `${label} ${button.name}/${other.name} 无重叠`
          )
          .toBe(true)
      }
    }
    expect
      .soft(g.body.top, `${label} 正文避让头部`)
      .toBeGreaterThanOrEqual(g.outerHeader.bottom - 1)
    expect
      .soft(g.viewport.top, `${label} 正文视口避让头部`)
      .toBeGreaterThanOrEqual(g.outerHeader.bottom - 1)
    expect
      .soft(g.footer.top, `${label} 页脚不覆盖正文视口`)
      .toBeGreaterThanOrEqual(g.viewport.bottom - 1)
    for (const button of g.footerButtons) {
      const b = button.bounds
      expect
        .soft(
          b.left >= 0 &&
            b.right <= width + 1 &&
            b.top >= g.footer.top - 1 &&
            b.bottom <= Math.min(g.footer.bottom, g.height) + 1 &&
            button.centerReachable,
          `${label} 页脚 ${button.name} 完整可达`
        )
        .toBe(true)
    }
    expect.soft(g.overflowX.page, `${label} 页面无横向溢出`).toBeLessThanOrEqual(1)
    expect.soft(g.overflowX.dialog, `${label} 弹窗无横向溢出`).toBeLessThanOrEqual(1)
    expect.soft(g.scroll.overflowX, `${label} 正文无横向溢出`).toBeLessThanOrEqual(1)
  }
  await originalNodes.dispose()
  expect(optionRequests.length).toBeGreaterThan(0)
  expect(optionResponses).toHaveLength(optionRequests.length)
  expect(optionResponses.every(({ status }) => status >= 200 && status < 300)).toBe(true)
  expect(report.saveCount).toBe('0')
  expect(writes).toEqual([])
  expect(errors).toEqual([])
  expect(warnings).toEqual([])
})
