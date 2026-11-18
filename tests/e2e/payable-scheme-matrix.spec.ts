import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { assertAppearance } from './support/appearance'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(150_000)

for (const [theme, box] of [
  ['light', 'border-mode'],
  ['dark', 'shadow-mode']
]) {
  test(`分关系方案 ${theme} 独立条件、并发恢复与图标刷新`, async ({ page }, info) => {
    const configs = [
      {
        relation: 'payable_payment',
        description: '按来源应付匹配付款',
        rules: [
          {
            primary_field: 'source_id',
            secondary_field: 'source_id',
            operator: 'eq',
            empty_matches: false
          }
        ]
      },
      {
        relation: 'payable_red_blue',
        description: '同往来、同币种红蓝对冲',
        rules: [
          {
            primary_field: 'supplier_id',
            secondary_field: 'supplier_id',
            operator: 'eq',
            empty_matches: false
          },
          {
            primary_field: 'currency_code',
            secondary_field: 'currency_code',
            operator: 'eq',
            empty_matches: false
          }
        ]
      }
    ]
    const schemes = [1, 2].map((index) => ({
      id: `scheme-${index}`,
      code: `QA-MATRIX-${index}`,
      name: `示例分关系方案${index}`,
      enabled: true,
      automatic: index === 2,
      version: index,
      relation_rules: structuredClone(configs)
    }))
    let failMetadata = true
    let failSave = true
    let legacyCalls = 0
    let release = () => {}
    const refreshState: { gate?: Promise<void> } = {}
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (name === 'fms_payable_scheme_configuration_secure') {
        if (refreshState.gate) await refreshState.gate
        return failMetadata
          ? route.fulfill({
              status: 403,
              json: { code: '42501', message: '方案读取失败，请核对权限后重试' }
            })
          : route.fulfill({
              json: {
                configuration_version: 2,
                relations: [
                  { label: '应付付款核销', value: 'payable_payment' },
                  { label: '应付红蓝对冲', value: 'payable_red_blue' }
                ],
                schemes
              }
            })
      }
      if (name === 'fms_payable_reference_list_secure') {
        legacyCalls++
        return route.fulfill({ json: schemes })
      }
      if (name === 'fms_payable_writeoff_workspace_secure')
        return route.fulfill({ json: { primary: [], secondary: [], history: [], schemes } })
      if (name === 'fms_save_payable_reference_secure') {
        const record = route.request().postDataJSON().p_record
        expect(record.configuration_version).toBe(2)
        expect(record.version).toBe(failSave ? 1 : 2)
        expect(record.relation_rules).toHaveLength(2)
        expect(record.relation_rules[1].rules).toHaveLength(2)
        return failSave
          ? route.fulfill({
              status: 409,
              json: { code: '40001', message: '方案已由其他人修改，请刷新后重新编辑' }
            })
          : route.fulfill({ json: record.id })
      }
      return route.fulfill({ json: [] })
    })
    await page.goto(
      `/tests/e2e/fixtures/purchase-payable.html?kind=writeoff&theme=${theme}&box=${box}`,
      { waitUntil: 'domcontentloaded', timeout: 120_000 }
    )
    await page.getByRole('button', { name: '核销方案', exact: true }).click()
    const settings = page.getByRole('dialog', { name: '应付核销方案', exact: true })
    await expect(settings).toContainText('当前账号没有此操作权限')
    expect(legacyCalls).toBe(0)
    await expect(settings.getByRole('button', { name: '新增方案', exact: true })).toBeDisabled()
    failMetadata = false
    await settings.getByRole('button', { name: '刷新方案', exact: true }).click()
    await expect(settings.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
    await settings.getByRole('button', { name: '编辑方案', exact: true }).first().click()
    const editor = page.getByRole('dialog', { name: '编辑核销方案', exact: true })
    const name = editor.getByRole('textbox', { name: /^\*?\s*名称$/ })
    await name.clear()
    await editor.getByRole('tab', { name: '匹配规则', exact: true }).click()
    await editor.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(editor.getByRole('tab', { name: '方案信息', exact: true })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(name).toBeFocused()
    await name.fill('示例分关系方案1')
    await editor.getByRole('tab', { name: '匹配规则', exact: true }).click()
    const red = editor
      .locator('.el-table__body-wrapper tbody tr')
      .filter({ hasText: '应付红蓝对冲' })
    await red.getByRole('button', { name: '移除核销关系', exact: true }).click()
    await page
      .getByRole('dialog', { name: '删除确认', exact: true })
      .getByRole('button', { name: '取消', exact: true })
      .click()
    await expect(red).toBeVisible()
    await editor
      .getByRole('switch', { name: '按核销关系分别配置', exact: true })
      .locator('..')
      .click()
    await page
      .getByRole('dialog', { name: '切换匹配模式', exact: true })
      .getByRole('button', { name: '取消', exact: true })
      .click()
    await expect(
      editor.getByRole('switch', { name: '按核销关系分别配置', exact: true })
    ).toBeChecked()
    await red.getByRole('button', { name: '配置匹配规则', exact: true }).click()
    const rules = page.getByRole('dialog', { name: '核销匹配规则 · 应付红蓝对冲', exact: true })
    await expect(rules.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
    await rules.getByRole('button', { name: '移除匹配规则', exact: true }).last().click()
    await page
      .getByRole('dialog', { name: '删除确认', exact: true })
      .getByRole('button', { name: '删除', exact: true })
      .click()
    await expect(rules.locator('.el-table__body-wrapper tbody tr')).toHaveCount(1)
    await rules.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await red.getByRole('button', { name: '配置匹配规则', exact: true }).click()
    await expect(rules.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
    await captureBusinessEvidence(rules, {
      path: info.outputPath(`matrix-${theme}-conditions.png`)
    })
    await rules.getByRole('button', { name: '应用条件', exact: true }).click()
    await editor.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(editor).toBeVisible()
    await editor.getByRole('tab', { name: '方案信息', exact: true }).click()
    await expect(editor.getByRole('textbox', { name: /^\*?\s*名称$/ })).toHaveValue(
      '示例分关系方案1'
    )
    await expect(
      page.getByText('数据已被其他操作更新，请刷新后重试', { exact: true })
    ).toBeVisible()
    await captureBusinessEvidence(editor, { path: info.outputPath(`matrix-${theme}-conflict.png`) })
    await editor.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    schemes[0].version = 2
    failSave = false
    await settings.getByRole('button', { name: '刷新方案', exact: true }).click()
    await settings.getByRole('button', { name: '编辑方案', exact: true }).first().click()
    await editor.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(editor).not.toBeVisible()
    refreshState.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const refresh = settings.getByRole('button', { name: '刷新方案', exact: true })
    try {
      await refresh.click()
      await expect(refresh).toHaveAttribute('aria-busy', 'true')
      await expect(settings.locator('.el-loading-mask:visible, .el-skeleton:visible')).toHaveCount(
        0
      )
      await expect(settings.locator('.el-table__body-wrapper tbody tr')).toHaveCount(2)
      await captureBusinessEvidence(settings, {
        path: info.outputPath(`matrix-${theme}-refresh.png`)
      })
    } finally {
      release()
    }
    await expect(refresh).not.toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('html')).toHaveJSProperty(
      'scrollWidth',
      await page.evaluate(() => document.documentElement.clientWidth)
    )
    expect(errors).toEqual([])
  })
}

const configurationEndpoint = 'fms_payable_scheme_configuration_secure'
const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const schemePermissions = ['FinancePayableWriteoff:View', 'FinancePayableWriteoff:Scheme']
const workspaceSchemeName = '工作台查询仍可使用的方案'

function schemeRecord(id: string, name: string, tenantId = tenantA) {
  return {
    id,
    tenant_id: tenantId,
    code: `QA-${id}`,
    name,
    enabled: true,
    automatic: false,
    version: 1,
    relation_rules: [
      {
        relation: 'payable_payment',
        description: '按来源应付匹配付款',
        rules: [
          {
            primary_field: 'source_id',
            secondary_field: 'source_id',
            operator: 'eq',
            empty_matches: false
          }
        ]
      }
    ]
  }
}

function configuration(schemes = [schemeRecord('METADATA', '元数据核销方案')]) {
  return {
    configuration_version: 2,
    relations: [
      { label: '应付付款核销', value: 'payable_payment' },
      { label: '应付红蓝对冲', value: 'payable_red_blue' }
    ],
    schemes
  }
}

async function releaseMetadata(page: Page, gate: PromiseWithResolvers<void>) {
  const response = page.waitForResponse((item) =>
    item.url().endsWith(`/rpc/${configurationEndpoint}`)
  )
  gate.resolve()
  await response
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
}

async function prepareSchemeScenario(
  page: Page,
  options: {
    metadata: (route: Route, index: number) => Promise<void>
    theme?: 'light' | 'dark'
    width?: number
    permissions?: string[]
    legacySchemes?: object[]
    scopeControls?: boolean
    revokePermissions?: string[]
  }
) {
  const theme = options.theme ?? 'light'
  const width = options.width ?? 1440
  const box = theme === 'dark' ? 'shadow-mode' : 'border-mode'
  const counts = {
    metadata: 0,
    legacy: 0,
    workspace: 0,
    metadataScopes: [] as Array<string | null>,
    workspaceScopes: [] as Array<string | null>,
    writes: [] as string[],
    errors: [] as string[]
  }
  page.on('pageerror', (error) => counts.errors.push(error.message))
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').at(-1) || ''
    const scope = request.headers()['x-art-tenant-scope'] || null
    if (name === configurationEndpoint) {
      counts.metadataScopes.push(scope)
      expect(request.postDataJSON()).toEqual({ p_client_version: 2 })
      return options.metadata(route, ++counts.metadata)
    }
    if (name === 'fms_payable_reference_list_secure') {
      counts.legacy++
      expect(request.postDataJSON()).toEqual({ p_kind: 'scheme' })
      return route.fulfill({ json: options.legacySchemes ?? [] })
    }
    if (name === 'fms_payable_writeoff_workspace_secure') {
      counts.workspace++
      counts.workspaceScopes.push(scope)
      return route.fulfill({
        json: {
          primary: [],
          secondary: [],
          history: [],
          schemes: [schemeRecord('WORKSPACE', workspaceSchemeName)]
        }
      })
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      counts.writes.push(name)
      return route.fulfill({ status: 403, json: { code: '42501', message: '只读验收禁止写入' } })
    }
    return route.fulfill({ json: [] })
  })
  const query = new URLSearchParams({ kind: 'writeoff', theme, box })
  if (options.permissions) query.set('permissions', options.permissions.join(','))
  if (options.scopeControls) {
    query.set('scopeControls', '1')
    query.set('scope', 'all')
  }
  if (options.revokePermissions) {
    query.set('permissionControls', '1')
    query.set('revokePermissions', options.revokePermissions.join(','))
  }
  await page.goto(`/tests/e2e/fixtures/purchase-payable.html?${query}`, {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible()
  await expect.poll(() => counts.workspace).toBe(1)
  await assertAppearance(page, { theme, boxBorderMode: theme === 'light' })
  await installActionFeedbackHistory(page, { includeWarnings: true })
  return counts
}

function manager(page: Page) {
  return page.getByRole('dialog', { name: '应付核销方案', exact: true })
}

function managerRows(dialog: Locator) {
  return dialog.locator('.el-table__body-wrapper tbody tr')
}

async function openManager(page: Page) {
  await page.getByRole('button', { name: '核销方案', exact: true }).click()
  await expect(manager(page)).toBeVisible()
  return manager(page)
}

async function expectNoSchemeOverflow(page: Page, target: Locator) {
  const geometry = await target.evaluate((element) => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    client: element.clientWidth,
    scroll: element.scrollWidth
  }))
  expect(geometry.document).toBeLessThanOrEqual(geometry.viewport + 1)
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1)
}

for (const theme of ['light', 'dark'] as const) {
  test(`方案元数据 ${theme}390 普通授权用户等待、403与显式重试`, async ({ page }, info) => {
    const first = Promise.withResolvers<void>()
    const retry = Promise.withResolvers<void>()
    const cachedRefresh = Promise.withResolvers<void>()
    const recovery = Promise.withResolvers<void>()
    const refreshError = '方案资料暂未刷新，请稍后重试'
    const counts = await prepareSchemeScenario(page, {
      theme,
      width: 390,
      permissions: schemePermissions,
      metadata: async (route, index) => {
        await [first, retry, cachedRefresh, recovery][index - 1].promise
        if (index === 1)
          return route.fulfill({
            status: 403,
            json: { code: '42501', message: 'permission denied' }
          })
        if (index === 3)
          return route.fulfill({ status: 503, json: { code: 'P0001', message: refreshError } })
        return route.fulfill({ json: configuration() })
      }
    })
    try {
      const settings = await openManager(page)
      const add = settings.getByRole('button', { name: '新增方案', exact: true })
      const refresh = settings.getByRole('button', { name: '刷新方案', exact: true })
      await expect.poll(() => counts.metadata).toBe(1)
      await expect(add).toBeDisabled()
      await expect(refresh).toHaveAttribute('aria-busy', 'true')
      await expect(add).toBeInViewport({ ratio: 1 })
      await expectNoSchemeOverflow(page, settings)
      await captureBusinessEvidence(settings, {
        path: info.outputPath(`metadata-${theme}-390-pending.png`)
      })
      await releaseMetadata(page, first)
      await expect(settings.getByText('当前账号没有此操作权限', { exact: true })).toBeInViewport()
      const reload = settings.getByRole('button', { name: '重新加载', exact: true })
      await expect(reload).toBeInViewport({ ratio: 1 })
      await expect(add).toBeDisabled()
      expect(counts.legacy).toBe(0)
      await captureBusinessEvidence(settings, {
        path: info.outputPath(`metadata-${theme}-390-error.png`)
      })
      await reload.press('Enter')
      await expect.poll(() => counts.metadata).toBe(2)
      await expect(refresh).toHaveAttribute('aria-busy', 'true')
      await expect(add).toBeDisabled()
      await releaseMetadata(page, retry)
      await expect(managerRows(settings)).toHaveCount(1)
      await expect(managerRows(settings)).toContainText('元数据核销方案')
      await expect(settings.getByText(workspaceSchemeName, { exact: true })).toHaveCount(0)
      await expect(add).toBeEnabled()
      await expect(refresh).not.toHaveAttribute('aria-busy', 'true')
      await expectNoSchemeOverflow(page, settings)
      await captureBusinessEvidence(settings, {
        path: info.outputPath(`metadata-${theme}-390-ready.png`)
      })
      expect(counts.metadata).toBe(2)
      const cachedRows = managerRows(settings)
      const cachedCells = cachedRows.locator('td')
      const cachedText = await cachedCells.allTextContents()
      const edit = settings.getByRole('button', { name: '编辑方案', exact: true })
      await expect(edit).toBeEnabled()
      await refresh.press('Enter')
      await expect.poll(() => counts.metadata).toBe(3)
      await expect(refresh).toHaveAttribute('aria-busy', 'true')
      await expect(cachedRows).toHaveCount(1)
      await expect(cachedCells).toHaveText(cachedText)
      await expect(settings.locator('.el-loading-mask:visible, .el-skeleton:visible')).toHaveCount(
        0
      )
      await expect(add).toBeDisabled()
      await expect(edit).toBeDisabled()
      await expectNoSchemeOverflow(page, settings)
      await captureBusinessEvidence(settings, {
        path: info.outputPath(`metadata-${theme}-390-cached-pending.png`)
      })
      await releaseMetadata(page, cachedRefresh)
      const cachedError = settings.getByText(refreshError, { exact: true })
      await expect(cachedError).toBeInViewport({ ratio: 1 })
      await expect(cachedRows).toHaveCount(1)
      await expect(cachedCells).toHaveText(cachedText)
      await expect(settings.locator('.el-loading-mask:visible, .el-skeleton:visible')).toHaveCount(
        0
      )
      await expect(add).toBeDisabled()
      await expect(edit).toBeDisabled()
      await expect(refresh).toBeEnabled()
      await expect(refresh).toBeInViewport({ ratio: 1 })
      await expectNoSchemeOverflow(page, settings)
      await captureBusinessEvidence(settings, {
        path: info.outputPath(`metadata-${theme}-390-cached-error.png`)
      })
      await refresh.press('Enter')
      await expect.poll(() => counts.metadata).toBe(4)
      await expect(refresh).toHaveAttribute('aria-busy', 'true')
      await expect(cachedRows).toHaveCount(1)
      await expect(cachedCells).toHaveText(cachedText)
      await expect(add).toBeDisabled()
      await expect(edit).toBeDisabled()
      await releaseMetadata(page, recovery)
      await expect(cachedError).toBeHidden()
      await expect(cachedRows).toHaveCount(1)
      await expect(cachedCells).toHaveText(cachedText)
      await expect(add).toBeEnabled()
      await expect(edit).toBeEnabled()
      await expect(refresh).not.toHaveAttribute('aria-busy', 'true')
      await expectNoSchemeOverflow(page, settings)
      await captureBusinessEvidence(settings, {
        path: info.outputPath(`metadata-${theme}-390-cached-recovered.png`)
      })
      await add.click()
      const editor = page.getByRole('dialog', { name: '新增核销方案', exact: true })
      await editor.getByRole('tab', { name: '匹配规则', exact: true }).click()
      await expect(
        editor.getByRole('switch', { name: '按核销关系分别配置', exact: true })
      ).toBeChecked()
      await expect(editor.getByText('应付付款核销', { exact: true })).toBeVisible()
      await expectNoSchemeOverflow(page, editor)
      await editor.getByRole('button', { name: '关闭弹窗', exact: true }).click()
      await settings.getByRole('button', { name: '关闭弹窗', exact: true }).click()
      const queryScheme = page.getByRole('combobox', { name: '核销方案', exact: true })
      await queryScheme.click()
      await expect(
        page.getByRole('option', { name: workspaceSchemeName, exact: true })
      ).toBeVisible()
      await page.keyboard.press('Escape')
      expect(counts.metadata).toBe(4)
      expect(counts.legacy).toBe(0)
      expect(counts.writes).toEqual([])
      expect(counts.errors).toEqual([])
    } finally {
      first.resolve()
      retry.resolve()
      cachedRefresh.resolve()
      recovery.resolve()
    }
  })
}

test('方案元数据 PGRST202仅回退共用规则，保留实际旧服务编辑边界', async ({ page }, info) => {
  const legacy = {
    id: 'legacy',
    code: 'QA-LEGACY',
    name: '旧服务共用匹配方案',
    enabled: true,
    rules: [
      {
        primary_field: 'supplier_id',
        secondary_field: 'supplier_id',
        operator: 'eq',
        empty_matches: false
      },
      {
        primary_field: 'currency_code',
        secondary_field: 'currency_code',
        operator: 'eq',
        empty_matches: false
      }
    ]
  }
  const counts = await prepareSchemeScenario(page, {
    permissions: schemePermissions,
    legacySchemes: [legacy],
    metadata: (route) =>
      route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Function not found' } })
  })
  const settings = await openManager(page)
  await expect(managerRows(settings)).toContainText(legacy.name)
  expect(counts.metadata).toBe(1)
  expect(counts.legacy).toBe(1)
  await settings.getByRole('button', { name: '编辑方案', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑核销方案', exact: true })
  await expect(editor.getByRole('textbox', { name: /^\*?\s*名称$/ })).toHaveValue(legacy.name)
  await editor.getByRole('tab', { name: '匹配规则', exact: true }).click()
  const separate = editor.getByRole('switch', { name: '按核销关系分别配置', exact: true })
  await expect(separate).not.toBeChecked()
  await expect(separate).toBeDisabled()
  await expect(
    editor.getByText('当前服务仅支持共用规则，分关系配置需升级服务后使用。', { exact: true })
  ).toBeVisible()
  await expect(editor.getByText('共用匹配规则', { exact: true })).toBeVisible()
  await expect(editor.getByRole('combobox', { name: '主方单据字段', exact: true })).toHaveCount(2)
  await expectNoSchemeOverflow(page, editor)
  await captureBusinessEvidence(editor, {
    path: info.outputPath('metadata-pgrst202-common-rules.png')
  })
  await editor.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  expect(counts.writes).toEqual([])
  expect(counts.errors).toEqual([])
})

test('方案元数据 普通只读用户保留工作台查询方案且不读取管理配置', async ({ page }, info) => {
  const counts = await prepareSchemeScenario(page, {
    permissions: ['FinancePayableWriteoff:View'],
    metadata: (route) =>
      route.fulfill({ status: 403, json: { code: '42501', message: '禁止越权读取方案' } })
  })
  await expect(page.getByRole('button', { name: '核销方案', exact: true })).toHaveCount(0)
  await page.getByRole('combobox', { name: '核销方案', exact: true }).click()
  await expect(page.getByRole('option', { name: workspaceSchemeName, exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await captureBusinessEvidence(page, { path: info.outputPath('metadata-view-only-workspace.png') })
  expect(counts.workspace).toBe(1)
  expect(counts.metadata).toBe(0)
  expect(counts.legacy).toBe(0)
  expect(counts.writes).toEqual([])
  expect(counts.errors).toEqual([])
})

for (const oldResult of ['success', 'error'] as const) {
  test(`方案元数据 关闭重开后旧${oldResult}不改变当前会话或提前解除等待`, async ({
    page
  }, info) => {
    const old = Promise.withResolvers<void>()
    const current = Promise.withResolvers<void>()
    const counts = await prepareSchemeScenario(page, {
      permissions: schemePermissions,
      metadata: async (route, index) => {
        await (index === 1 ? old.promise : current.promise)
        if (index === 1 && oldResult === 'error')
          return route.fulfill({ status: 403, json: { code: '42501', message: '旧会话读取拒绝' } })
        return route.fulfill({
          json: configuration([
            schemeRecord(
              index === 1 ? 'OLD' : 'CURRENT',
              index === 1 ? '旧会话方案' : '当前会话方案'
            )
          ])
        })
      }
    })
    try {
      let settings = await openManager(page)
      await expect.poll(() => counts.metadata).toBe(1)
      await settings.getByRole('button', { name: '关闭弹窗', exact: true }).click()
      await expect(settings).toBeHidden()
      settings = await openManager(page)
      await expect.poll(() => counts.metadata).toBe(2)
      const add = settings.getByRole('button', { name: '新增方案', exact: true })
      const refresh = settings.getByRole('button', { name: '刷新方案', exact: true })
      if (oldResult === 'success') {
        await releaseMetadata(page, old)
        await expect(refresh).toHaveAttribute('aria-busy', 'true')
        await expect(add).toBeDisabled()
        await expect(settings.getByText('旧会话方案', { exact: true })).toHaveCount(0)
        await captureBusinessEvidence(settings, {
          path: info.outputPath('metadata-old-success-current-pending.png')
        })
      }
      await releaseMetadata(page, current)
      await expect(managerRows(settings)).toContainText('当前会话方案')
      await expect(add).toBeEnabled()
      if (oldResult === 'error') await releaseMetadata(page, old)
      await expect(managerRows(settings)).toHaveCount(1)
      await expect(managerRows(settings)).toContainText('当前会话方案')
      await expect(settings.getByText('当前账号没有此操作权限', { exact: true })).toHaveCount(0)
      await expect(refresh).not.toHaveAttribute('aria-busy', 'true')
      await expect(add).toBeEnabled()
      await expect(settings.getByRole('button', { name: '编辑方案', exact: true })).toBeEnabled()
      expect(await readActionFeedbackHistory(page)).toEqual([])
      expect(counts.metadata).toBe(2)
      expect(counts.legacy).toBe(0)
      expect(counts.writes).toEqual([])
      expect(counts.errors).toEqual([])
    } finally {
      old.resolve()
      current.resolve()
    }
  })
}

test('方案元数据 全部租户切换甲乙时关闭管理与编辑并隔离迟到结果', async ({ page }, info) => {
  const tenantARead = Promise.withResolvers<void>()
  const tenantBRead = Promise.withResolvers<void>()
  const counts = await prepareSchemeScenario(page, {
    theme: 'dark',
    scopeControls: true,
    metadata: async (route, index) => {
      if (index === 2) await tenantARead.promise
      if (index === 3) await tenantBRead.promise
      return route.fulfill({
        json: configuration([
          schemeRecord(
            ['ALL', 'TENANT-A', 'TENANT-B'][index - 1],
            ['全部范围方案', '租户甲方案', '租户乙方案'][index - 1],
            index === 3 ? tenantB : tenantA
          )
        ])
      })
    }
  })
  try {
    const settings = await openManager(page)
    await expect(managerRows(settings)).toContainText('全部范围方案')
    await settings.getByRole('button', { name: '编辑方案', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '编辑核销方案', exact: true })
    await expect(editor).toBeVisible()
    await page.keyboard.press('Alt+Shift+1')
    await expect(editor).toBeHidden()
    await expect(settings).toBeHidden()
    await expect.poll(() => counts.workspaceScopes.at(-1)).toBe(tenantA)
    await openManager(page)
    await expect.poll(() => counts.metadata).toBe(2)
    await page.keyboard.press('Alt+Shift+2')
    await expect(settings).toBeHidden()
    await expect.poll(() => counts.workspaceScopes.at(-1)).toBe(tenantB)
    await openManager(page)
    await expect.poll(() => counts.metadata).toBe(3)
    await releaseMetadata(page, tenantARead)
    await expect(settings.getByRole('button', { name: '刷新方案', exact: true })).toHaveAttribute(
      'aria-busy',
      'true'
    )
    await expect(settings.getByRole('button', { name: '新增方案', exact: true })).toBeDisabled()
    await expect(settings.getByText('租户甲方案', { exact: true })).toHaveCount(0)
    await releaseMetadata(page, tenantBRead)
    await expect(managerRows(settings)).toHaveCount(1)
    await expect(managerRows(settings)).toContainText('租户乙方案')
    await settings.getByRole('button', { name: '编辑方案', exact: true }).click()
    await expect(editor.getByRole('textbox', { name: /^\*?\s*名称$/ })).toHaveValue('租户乙方案')
    await captureBusinessEvidence(editor, { path: info.outputPath('metadata-tenant-b-editor.png') })
    expect(counts.metadataScopes).toEqual([null, tenantA, tenantB])
    expect(counts.workspaceScopes).toEqual([null, tenantA, tenantB])
    expect(await readActionFeedbackHistory(page)).toEqual([])
    expect(counts.legacy).toBe(0)
    expect(counts.writes).toEqual([])
    expect(counts.errors).toEqual([])
  } finally {
    tenantARead.resolve()
    tenantBRead.resolve()
  }
})

test('方案元数据 普通账号撤销Scheme权限关闭管理编辑并拒绝旧结果重新开放', async ({
  page
}, info) => {
  const pending = Promise.withResolvers<void>()
  const counts = await prepareSchemeScenario(page, {
    permissions: schemePermissions,
    revokePermissions: ['FinancePayableWriteoff:Scheme'],
    metadata: async (route, index) => {
      if (index === 2) await pending.promise
      return route.fulfill({ json: configuration() })
    }
  })
  try {
    const settings = await openManager(page)
    await expect(managerRows(settings)).toHaveCount(1)
    await settings.getByRole('button', { name: '编辑方案', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '编辑核销方案', exact: true })
    await expect(editor).toBeVisible()
    await page.keyboard.press('Alt+Shift+4')
    await expect(settings).toBeHidden()
    await expect(editor).toBeHidden()
    await expect(page.getByRole('button', { name: '核销方案', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible()
    await page.keyboard.press('Alt+Shift+5')
    await openManager(page)
    await expect.poll(() => counts.metadata).toBe(2)
    await page.keyboard.press('Alt+Shift+4')
    await expect(settings).toBeHidden()
    await releaseMetadata(page, pending)
    await expect(settings).toBeHidden()
    await expect(editor).toBeHidden()
    await expect(page.getByRole('button', { name: '核销方案', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '保存配置', exact: true })).toHaveCount(0)
    await captureBusinessEvidence(page, {
      path: info.outputPath('metadata-scheme-permission-revoked.png')
    })
    expect(await readActionFeedbackHistory(page)).toEqual([])
    expect(counts.metadata).toBe(2)
    expect(counts.legacy).toBe(0)
    expect(counts.writes).toEqual([])
    expect(counts.errors).toEqual([])
  } finally {
    pending.resolve()
  }
})
