import assert from 'node:assert/strict'
import { expect, test, type Page } from '@playwright/test'
import {
  assertPayableAcceptanceSession,
  acceptanceRecord,
  acceptanceRows,
  acceptanceIdentifier as identifier,
  acceptanceRpc as rpc
} from './support/payable-live-session'
import {
  prepareRedBlueScenarios,
  redBlueJournal,
  redBluePayable
} from './support/payable-red-blue-fixtures'
import { payableVoucherLines } from './support/payable-live-posting'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareAppearance } from './support/appearance'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-real.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 25_000
})
test.skip(!enabled, '仅显式运行独立验收租户的红蓝工作台检查')
test.setTimeout(180_000)

test('拒绝另一端口的验收会话，不复用原登录身份', async ({ browser, context }) => {
  assert.ok(process.env.E2E_BASE_URL)
  const expectedOrigin = new URL(process.env.E2E_BASE_URL).origin
  const state = await context.storageState()
  const original = state.origins.find((entry) => entry.origin === expectedOrigin)
  assert.ok(original)
  const wrongOrigin = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [{ ...original, origin: 'http://127.0.0.1:1' }]
    }
  })
  try {
    await assert.rejects(
      () => assertPayableAcceptanceSession(wrongOrigin),
      /缺少已验证的独立验收会话/
    )
  } finally {
    await wrongOrigin.close()
  }
})

test('红蓝工作台真实候选、自动预览与无遮罩刷新', async ({ page, context }, info) => {
  await assertPayableAcceptanceSession(context)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const initial = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure')
  )
  await page.goto('#/fms/accounts-payable/writeoff', { waitUntil: 'domcontentloaded' })
  expect((await initial).ok()).toBe(true)
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  const switched = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure') &&
      response.request().postDataJSON()?.p_query?.relation === 'payable_red_blue'
  )
  await page.getByRole('radio', { name: '应付红蓝对冲', exact: true }).locator('..').click()
  const response = await switched
  expect(response.ok()).toBe(true)
  const workspace = acceptanceRecord(await response.json())
  const credits = acceptanceRows(workspace.secondary)
  expect(credits.some((entry) => entry.id === 'f4f5cbd8-0588-4cef-8ade-197eefd10b75')).toBe(true)
  const secondary = page.getByRole('region', { name: '红字财务应付单', exact: true })
  await expect(secondary.locator('tbody tr')).toHaveCount(credits.length)
  await expect(
    page.getByRole('switch', { name: '允许跨往来单位核销', exact: true })
  ).not.toBeChecked()
  await secondary.scrollIntoViewIfNeeded()
  await captureBusinessEvidence(page, {
    path: info.outputPath('red-blue-candidates.png'),
    fullPage: true
  })

  let releaseResponse = () => {}
  const gate = new Promise<void>((resolve) => {
    releaseResponse = resolve
  })
  await page.route(
    '**/rest/v1/rpc/fms_payable_writeoff_workspace_secure',
    async (route) => {
      const result = await route.fetch()
      await gate
      await route.fulfill({ response: result })
    },
    { times: 1 }
  )
  const refreshed = page.waitForResponse((entry) =>
    entry.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure')
  )
  const refresh = page.getByRole('button', { name: '刷新', exact: true })
  try {
    await refresh.click()
    await expect(refresh).toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('.el-loading-mask:visible, .el-skeleton:visible')).toHaveCount(0)
    await expect(secondary.locator('tbody tr')).toHaveCount(credits.length)
    await captureBusinessEvidence(page, {
      path: info.outputPath('red-blue-icon-refresh.png'),
      fullPage: true
    })
  } finally {
    releaseResponse()
  }
  expect((await refreshed).ok()).toBe(true)
  await expect(refresh).not.toHaveAttribute('aria-busy', 'true')

  const automatic = acceptanceRows(workspace.schemes).find(
    (scheme) => scheme.enabled && scheme.automatic
  )
  assert.ok(automatic && typeof automatic.name === 'string')
  await page.getByLabel('核销方案', { exact: true }).click()
  await page.getByRole('option', { name: automatic.name, exact: true }).click()
  const preview = page.waitForResponse((entry) =>
    entry.url().endsWith('/rpc/fms_auto_payable_writeoff_secure')
  )
  await page.getByRole('button', { name: '按方案自动核销', exact: true }).click()
  expect((await preview).ok()).toBe(true)
  const dialog = page.getByRole('dialog', { name: '按方案自动核销', exact: true })
  await expect(dialog.getByRole('radio', { name: '本位币等值分配', exact: true })).toBeChecked()
  const repriced = page.waitForResponse(
    (entry) =>
      entry.url().endsWith('/rpc/fms_auto_payable_writeoff_secure') &&
      entry.request().postDataJSON()?.p_query?.cross_currency_mode === 'full_pair'
  )
  await dialog.getByRole('radio', { name: '匹配余量全部对冲', exact: true }).locator('..').click()
  expect((await repriced).ok()).toBe(true)
  await expect(dialog.getByRole('alert').getByText(/差额计入汇兑损益/)).toBeVisible()
  await captureBusinessEvidence(dialog, { path: info.outputPath('red-blue-auto-preview.png') })
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

async function openRedBlue(page: Page, keyword: string) {
  if (!page.url().includes('#/fms/accounts-payable/writeoff')) {
    const initial =
      page.url() === 'about:blank'
        ? page.waitForResponse(
            (response) => response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure'),
            { timeout: 60_000 }
          )
        : undefined
    await page.goto('#/fms/accounts-payable/writeoff', { waitUntil: 'domcontentloaded' })
    if (initial) expect((await initial).ok()).toBe(true)
  }
  await expect(page.getByRole('heading', { name: '应付核销工作台', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  const relation = page.getByRole('radio', { name: '应付红蓝对冲', exact: true })
  if (!(await relation.isChecked())) {
    const switched = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure') &&
        response.request().postDataJSON()?.p_query?.relation === 'payable_red_blue'
    )
    await relation.locator('..').click()
    expect((await switched).ok()).toBe(true)
  }
  await page.getByRole('tab', { name: '待核销单据', exact: true }).click()
  await page.getByPlaceholder('往来单位或单据编号').fill(keyword)
  const queried = page.waitForResponse(
    (response) =>
      response.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure') &&
      response.request().postDataJSON()?.p_query?.keyword === keyword
  )
  await page.getByRole('button', { name: '查询', exact: true }).click()
  const response = await queried
  expect(response.ok()).toBe(true)
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  return acceptanceRecord(await response.json())
}

test('两笔真实红蓝核销单、本位币与汇兑损益多主题验收', async ({ page, context }, info) => {
  await assertPayableAcceptanceSession(context)
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const [key, keyword, primaryAmount, creditAmount, primaryBase, creditBase] of [
    ['CNY', 'QA-CREDIT-UI-1', 56.5, 56.5, 56.5, 56.5],
    ['FX', 'QA-RB-FX', 100, 90, 700, 720]
  ] as const) {
    const workspace = await openRedBlue(page, keyword)
    const active = acceptanceRows(workspace.history).filter((entry) => entry.status === 'active')
    expect(active).toHaveLength(1)
    const matching = active[0]
    expect(Number(matching.amount)).toBe(primaryAmount)
    expect(Number(matching.credit_amount)).toBe(creditAmount)
    expect(Number(matching.payable_base_amount)).toBe(primaryBase)
    expect(Number(matching.credit_base_amount)).toBe(creditBase)
    expect(Number(matching.exchange_difference)).toBe(primaryBase - creditBase)
    expect(matching.needs_voucher).toBe(true)
    await page.getByRole('tab', { name: /^核销记录/ }).click()
    const history = page.getByRole('tabpanel', { name: /^核销记录/ })
    const row = history.locator('tbody tr').filter({ hasText: String(matching.record_no) })
    await expect(row).toContainText('已核销')
    const table = history.locator('.el-table')
    await table.scrollIntoViewIfNeeded()
    const bodyScroll = table.locator('.el-table__body-wrapper .el-scrollbar__wrap')
    await bodyScroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    const scrollLeft = await bodyScroll.evaluate((element) => element.scrollLeft)
    await expect
      .poll(() =>
        table.locator('.el-table__header-wrapper').evaluate((element) => element.scrollLeft)
      )
      .toBe(scrollLeft)
    if (key === 'FX')
      await expect(row.getByRole('cell').filter({ hasText: '损失' })).toBeInViewport()
    await captureBusinessEvidence(page, {
      path: info.outputPath(`red-blue-final-history-${key}.png`),
      fullPage: true
    })
    await row.getByRole('button', { name: String(matching.document_no), exact: true }).click()
    const detail = page.getByRole('dialog', { name: '应付核销单', exact: true })
    await expect(detail.getByText('主方原币金额', { exact: true })).toBeVisible()
    await expect(detail.getByText('主方本位币金额', { exact: true })).toBeVisible()
    await expect(detail.getByText('辅方本位币金额', { exact: true })).toBeVisible()
    await expect(detail.getByText('现金折扣金额(元)', { exact: true })).toHaveCount(0)
    await expect(detail.getByText('主方币种', { exact: true })).toBeVisible()
    await expect(detail.getByText('辅方币种', { exact: true })).toBeVisible()
    if (key === 'FX') {
      await expect(detail.getByText('USD', { exact: true })).toBeVisible()
      await expect(detail.getByText('EUR', { exact: true })).toBeVisible()
      await expect(detail).toContainText('700.00')
      await expect(detail).toContainText('720.00')
      await expect(detail).toContainText('损失')
    } else await expect(detail.getByText('CNY', { exact: true })).toHaveCount(2)
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`red-blue-final-document-${key}.png`)
    })
    await detail.locator('.el-table tbody tr').last().scrollIntoViewIfNeeded()
    await captureBusinessEvidence(detail, {
      path: info.outputPath(`red-blue-final-document-lower-${key}.png`)
    })
    await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await page.getByRole('tab', { name: /^核销单/ }).click()
    const documents = page.getByRole('tabpanel', { name: /^核销单/ })
    await expect(documents.locator('tbody tr')).toHaveCount(1)
    await documents.getByRole('button', { name: String(matching.voucher_no), exact: true }).click()
    const voucher = page.getByRole('dialog', { name: '会计凭证详情', exact: true })
    await expect(voucher).toContainText(String(matching.voucher_no))
    await expect(voucher.getByText(key === 'FX' ? '220299' : '2202', { exact: true })).toBeVisible()
    await expect(voucher.getByText(key === 'FX' ? '224199' : '2241', { exact: true })).toBeVisible()
    if (key === 'FX') {
      await expect(voucher).toContainText('验收汇兑损益')
      await expect(voucher).toContainText('USD')
      await expect(voucher).toContainText('EUR')
    }
    await captureBusinessEvidence(voucher, {
      path: info.outputPath(`red-blue-final-voucher-${key}.png`)
    })
    await voucher
      .getByText(key === 'FX' ? '6603' : '2241', { exact: true })
      .scrollIntoViewIfNeeded()
    await captureBusinessEvidence(voucher, {
      path: info.outputPath(`red-blue-final-voucher-lower-${key}.png`)
    })
    await voucher.getByRole('button', { name: /关闭此/ }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(errors).toEqual([])
})

test('两笔真实红蓝手工与异币自动、原币制证及反核销完整流程', async ({ page, context }, info) => {
  test.skip(process.env.E2E_PAYABLE_RED_BLUE_WORKFLOW !== 'true', '独立验收全流程须额外显式启用')
  test.setTimeout(600_000)
  const client = await assertPayableAcceptanceSession(context)
  const scenarios = await prepareRedBlueScenarios(client)
  await openRedBlue(page, 'QA-RB-FX')
  const configured: Array<Record<string, unknown>> = []
  let automaticId: string | undefined
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    for (const automatic of [false, true]) {
      const code = automatic ? 'QA_RB_MATRIX_AUTO' : 'QA_RB_MATRIX_MANUAL'
      const name = automatic ? '独立红蓝分关系自动验收' : '独立红蓝分关系手工验收'
      const metadata = acceptanceRecord(
        await rpc(client, 'fms_payable_scheme_configuration_secure', {})
      )
      expect(metadata.configuration_version).toBe(2)
      const previous = acceptanceRows(metadata.schemes).find((scheme) => scheme.code === code)
      const loaded = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_payable_scheme_configuration_secure')
      )
      await page.getByRole('button', { name: '核销方案', exact: true }).click()
      expect((await loaded).ok()).toBe(true)
      const settings = page.getByRole('dialog', { name: '应付核销方案', exact: true })
      if (previous)
        await settings
          .locator('tbody tr')
          .filter({ hasText: code })
          .getByRole('button', { name: '编辑方案', exact: true })
          .click()
      else await settings.getByRole('button', { name: '新增方案', exact: true }).click()
      const editor = page.getByRole('dialog', {
        name: previous ? '编辑核销方案' : '新增核销方案',
        exact: true
      })
      await expect(
        editor.getByRole('switch', { name: '按核销关系分别配置', exact: true })
      ).toBeChecked()
      await editor.getByRole('textbox', { name: /编码$/ }).fill(code)
      await editor.getByRole('textbox', { name: /^\*?\s*名称$/ }).fill(name)
      const enabledSwitch = editor.getByRole('switch', { name: '启用', exact: true })
      if (!(await enabledSwitch.isChecked())) await enabledSwitch.locator('..').click()
      await expect(enabledSwitch).toBeChecked()
      const automaticSwitch = editor.getByRole('switch', { name: '自动核销', exact: true })
      if ((await automaticSwitch.isChecked()) !== automatic)
        await automaticSwitch.locator('..').click()
      await expect(automaticSwitch).toBeChecked({ checked: automatic })
      const redRow = editor.locator('tbody tr').filter({ hasText: '应付红蓝对冲' })
      await redRow
        .getByRole('textbox', { name: '应付红蓝对冲关系说明', exact: true })
        .fill(
          automatic
            ? '仅红蓝关系，按原记账汇率处理汇兑差额'
            : '同往来同币种红蓝关系，不串用付款匹配条件'
        )
      await redRow.getByRole('button', { name: '配置匹配规则', exact: true }).click()
      const rules = page.getByRole('dialog', { name: '核销匹配规则 · 应付红蓝对冲', exact: true })
      const rows = rules.locator('.el-table__body-wrapper tbody tr')
      if (automatic && (await rows.count()) === 2) {
        await rows.nth(1).getByRole('button', { name: '移除匹配规则', exact: true }).click()
        await page
          .getByRole('dialog', { name: '删除确认', exact: true })
          .getByRole('button', { name: '删除', exact: true })
          .click()
      }
      await expect(rows).toHaveCount(automatic ? 1 : 2)
      await captureBusinessEvidence(rules, { path: info.outputPath(`matrix-${code}-rules.png`) })
      await rules.getByRole('button', { name: '应用条件', exact: true }).click()
      if (!automatic) {
        const payment = editor.locator('tbody tr').filter({ hasText: '应付付款核销' })
        if ((await payment.count()) === 0) {
          const relationPicker = editor.getByRole('combobox', { name: '新增核销关系', exact: true })
          const width = await relationPicker.evaluate(
            (element) => element.closest('.el-select')?.getBoundingClientRect().width
          )
          expect(width).toBeGreaterThanOrEqual(200)
          await relationPicker.press('Enter')
          await page.getByRole('option', { name: '应付付款核销', exact: true }).click()
          await editor.getByRole('button', { name: '新增关系', exact: true }).click()
        }
        await payment
          .getByRole('textbox', { name: '应付付款核销关系说明', exact: true })
          .fill('付款按关联财务应付标识匹配，与红蓝规则独立')
        await payment.getByRole('button', { name: '配置匹配规则', exact: true }).click()
        const paymentRules = page.getByRole('dialog', {
          name: '核销匹配规则 · 应付付款核销',
          exact: true
        })
        for (const field of ['主方单据字段', '辅方单据字段']) {
          await paymentRules
            .getByRole('combobox', { name: field, exact: true })
            .first()
            .press('Enter')
          await page.getByRole('option', { name: '关联财务应付标识', exact: true }).click()
        }
        await paymentRules.getByRole('button', { name: '应用条件', exact: true }).click()
      }
      await captureBusinessEvidence(editor, { path: info.outputPath(`matrix-${code}-editor.png`) })
      const saved = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_save_payable_reference_secure')
      )
      await editor.getByRole('button', { name: '保存配置', exact: true }).click()
      const response = await saved
      expect(response.ok()).toBe(true)
      expect(response.request().postDataJSON().p_record.configuration_version).toBe(2)
      await expect(editor).not.toBeVisible()
      const current = acceptanceRecord(
        await rpc(client, 'fms_payable_scheme_configuration_secure', {})
      )
      const scheme = acceptanceRows(current.schemes).find((entry) => entry.code === code)
      assert.ok(scheme)
      const configs = acceptanceRows(scheme.relation_rules)
      expect(configs).toHaveLength(automatic ? 1 : 2)
      expect(configs.find((entry) => entry.relation === 'payable_red_blue')?.rules).toHaveLength(
        automatic ? 1 : 2
      )
      expect(Number(scheme.version)).toBeGreaterThan(Number(previous?.version || 0))
      configured.push(scheme)
      await settings
        .locator('tbody tr')
        .filter({ hasText: code })
        .getByRole('button', { name: '编辑方案', exact: true })
        .click()
      const reopened = page.getByRole('dialog', { name: '编辑核销方案', exact: true })
      await expect(reopened.locator('.el-table__body-wrapper tbody tr')).toHaveCount(
        automatic ? 1 : 2
      )
      await reopened.getByRole('button', { name: '关闭此对话框', exact: true }).click()
      await settings.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    }
    const [manual, automatic] = configured
    assert.ok(
      manual && automatic && typeof manual.name === 'string' && typeof automatic.name === 'string'
    )
    automaticId = identifier(automatic)
    for (const scenario of scenarios) {
      const active = await client
        .from('fms_payable_writeoff_record')
        .select('id,voucher_id')
        .eq('payable_id', identifier(scenario.blue))
        .eq('credit_payable_id', identifier(scenario.credit))
        .eq('relation', 'payable_red_blue')
        .eq('status', 'active')
      expect(active.error).toBeNull()
      for (const previous of acceptanceRows(active.data)) {
        if (typeof previous.voucher_id === 'string') {
          const voucher = acceptanceRecord(
            await rpc(client, 'fms_get_voucher_secure', { p_voucher_id: previous.voucher_id })
          )
          expect(['draft', 'voided']).toContain(voucher.status)
          if (voucher.status === 'draft')
            await rpc(client, 'transition_fms_voucher_secure', {
              p_voucher_id: previous.voucher_id,
              p_action: 'void',
              p_reason: '恢复独立红蓝验收，保留原凭证审计',
              p_action_date: null
            })
        }
        await rpc(client, 'fms_reverse_payable_writeoff_secure', {
          p_id: identifier(previous),
          p_reason: '恢复独立红蓝验收双方余额，保留核销审计'
        })
      }
      for (const phase of ['partial', 'final']) {
        const isForeign = scenario.key === 'FX'
        const amount = !isForeign && phase === 'partial' ? 40 : scenario.blueAmount
        const creditAmount =
          isForeign && phase === 'partial' ? 87.5 : phase === 'partial' ? 40 : scenario.creditAmount
        const blueBase = isForeign ? 700 : amount
        const creditBase = isForeign && phase === 'final' ? 720 : blueBase
        await openRedBlue(page, scenario.keyword)
        const primary = page
          .getByRole('region', { name: '蓝字财务应付单', exact: true })
          .locator('tbody tr')
          .filter({ hasText: String(scenario.blue.document_no) })
        const secondary = page
          .getByRole('region', { name: '红字财务应付单', exact: true })
          .locator('tbody tr')
          .filter({ hasText: String(scenario.credit.document_no) })
        await expect(primary).toBeVisible()
        await expect(secondary).toBeVisible()
        let writeoffId: string
        if (!isForeign) {
          await page.getByRole('combobox', { name: '核销方案', exact: true }).click()
          await page.getByRole('option', { name: manual.name, exact: true }).click()
          await primary.getByRole('spinbutton').fill(String(amount))
          await secondary.getByRole('spinbutton').fill(String(creditAmount))
          await primary.locator('.el-checkbox').first().click()
          await secondary.locator('.el-checkbox').first().click()
          await page.getByRole('button', { name: '核销', exact: true }).click()
          const dialog = page.getByRole('dialog', { name: '核销确认', exact: true })
          await captureBusinessEvidence(dialog, {
            path: info.outputPath(`red-blue-manual-${phase}.png`)
          })
          const written = page.waitForResponse((response) =>
            response.url().endsWith('/rpc/fms_payable_writeoff_secure')
          )
          await dialog.getByRole('button', { name: '执行核销', exact: true }).click()
          const response = await written
          expect(response.ok()).toBe(true)
          const ids = await response.json()
          assert.ok(Array.isArray(ids) && typeof ids[0] === 'string')
          writeoffId = ids[0]
        } else {
          await page.getByRole('combobox', { name: '核销方案', exact: true }).click()
          await page.getByRole('option', { name: automatic.name, exact: true }).click()
          const planned = page.waitForResponse((response) =>
            response.url().endsWith('/rpc/fms_auto_payable_writeoff_secure')
          )
          await page.getByRole('button', { name: '按方案自动核销', exact: true }).click()
          let response = await planned
          expect(response.ok()).toBe(true)
          const dialog = page.getByRole('dialog', { name: '按方案自动核销', exact: true })
          if (phase === 'final') {
            const repriced = page.waitForResponse(
              (entry) =>
                entry.url().endsWith('/rpc/fms_auto_payable_writeoff_secure') &&
                entry.request().postDataJSON()?.p_query?.cross_currency_mode === 'full_pair'
            )
            await dialog
              .getByRole('radio', { name: '匹配余量全部对冲', exact: true })
              .locator('..')
              .click()
            response = await repriced
            expect(response.ok()).toBe(true)
            await expect(dialog.getByRole('alert').getByText(/差额计入汇兑损益/)).toBeVisible()
          }
          const plan = acceptanceRecord(await response.json())
          const entries = acceptanceRows(plan.items)
          expect(entries).toHaveLength(1)
          expect(Number(entries[0].amount)).toBe(amount)
          expect(Number(entries[0].credit_amount)).toBe(creditAmount)
          expect(Number(entries[0].payable_base_amount)).toBe(blueBase)
          expect(Number(entries[0].credit_base_amount)).toBe(creditBase)
          await captureBusinessEvidence(dialog, {
            path: info.outputPath(`red-blue-auto-${phase}.png`)
          })
          const written = page.waitForResponse(
            (entry) =>
              entry.url().endsWith('/rpc/fms_auto_payable_writeoff_secure') &&
              entry.request().postDataJSON()?.p_execute === true
          )
          await dialog.getByRole('button', { name: '确认自动核销', exact: true }).click()
          const resultResponse = await written
          expect(resultResponse.ok()).toBe(true)
          const result = acceptanceRecord(await resultResponse.json())
          assert.ok(
            Array.isArray(result.record_ids) &&
              result.record_ids.length === 1 &&
              typeof result.record_ids[0] === 'string'
          )
          writeoffId = result.record_ids[0]
        }
        redBlueJournal({ kind: 'writeoff', key: scenario.key, phase, id: writeoffId })
        const saved = await client
          .from('fms_payable_writeoff_record')
          .select(
            'id,record_no,document_no,amount,credit_amount,payable_base_amount,credit_base_amount,needs_voucher,status'
          )
          .eq('id', writeoffId)
          .single()
        expect(saved.error).toBeNull()
        const matching = acceptanceRecord(saved.data)
        expect(matching.needs_voucher).toBe(true)
        expect(Number(matching.amount)).toBe(amount)
        expect(Number(matching.credit_amount)).toBe(creditAmount)
        expect(Number(matching.payable_base_amount)).toBe(blueBase)
        expect(Number(matching.credit_base_amount)).toBe(creditBase)
        const blueAfter = await redBluePayable(client, identifier(scenario.blue))
        const creditAfter = await redBluePayable(client, identifier(scenario.credit))
        expect(Number(blueAfter.unpaid_amount)).toBeCloseTo(scenario.blueAmount - amount, 2)
        expect(Number(creditAfter.unpaid_amount)).toBeCloseTo(
          -(scenario.creditAmount - creditAmount),
          2
        )
        await page.getByRole('tab', { name: /^核销记录/ }).click()
        const historyRow = page
          .getByRole('tabpanel', { name: /^核销记录/ })
          .locator('tbody tr')
          .filter({ hasText: String(matching.record_no) })
        await expect(historyRow).toContainText('已核销')
        await historyRow
          .getByRole('button', { name: String(matching.document_no), exact: true })
          .click()
        const detail = page.getByRole('dialog', { name: '应付核销单', exact: true })
        await expect(detail).toContainText(String(scenario.blue.document_no))
        await expect(detail).toContainText(String(scenario.credit.document_no))
        await captureBusinessEvidence(detail, {
          path: info.outputPath(`red-blue-document-${scenario.key}-${phase}.png`)
        })
        await detail.getByRole('button', { name: '关闭此对话框', exact: true }).click()
        const previewed = page.waitForResponse(
          (entry) =>
            entry.url().endsWith('/rpc/fms_payable_settlement_voucher_secure') &&
            entry.request().postDataJSON()?.p_preview === true
        )
        await historyRow.getByRole('button', { name: '预览凭证', exact: true }).click()
        expect((await previewed).ok()).toBe(true)
        const preview = page.getByRole('dialog', { name: '凭证预览', exact: true })
        await expect(preview).toContainText(scenario.blueSubject)
        await expect(preview).toContainText(scenario.creditSubject)
        await captureBusinessEvidence(preview, {
          path: info.outputPath(`red-blue-posting-${scenario.key}-${phase}.png`)
        })
        await preview.getByRole('button', { name: '关闭此对话框', exact: true }).click()
        const generated = page.waitForResponse(
          (entry) =>
            entry.url().endsWith('/rpc/fms_payable_settlement_voucher_secure') &&
            entry.request().postDataJSON()?.p_preview === false
        )
        const refreshed = page.waitForResponse((entry) =>
          entry.url().endsWith('/rpc/fms_payable_writeoff_workspace_secure')
        )
        await historyRow.getByRole('button', { name: '生成凭证', exact: true }).click()
        const generatedResponse = await generated
        expect(generatedResponse.ok()).toBe(true)
        const result = acceptanceRecord(await generatedResponse.json())
        expect(result.status).toBe('generated')
        assert.ok(Array.isArray(result.voucher_ids) && typeof result.voucher_ids[0] === 'string')
        const voucherId = result.voucher_ids[0]
        const workspace = acceptanceRecord(await (await refreshed).json())
        const refreshedRecord = acceptanceRows(workspace.history).find(
          (entry) => entry.id === writeoffId
        )
        assert.ok(refreshedRecord && typeof refreshedRecord.voucher_no === 'string')
        redBlueJournal({ kind: 'voucher', key: scenario.key, phase, id: voucherId, writeoffId })
        const lines = await payableVoucherLines(client, voucherId)
        expect(lines).toHaveLength(creditBase === blueBase ? 2 : 3)
        const debit = lines.find((entry) => entry.subject_code_snapshot === scenario.blueSubject)
        const credit = lines.find((entry) => entry.subject_code_snapshot === scenario.creditSubject)
        assert.ok(debit && credit)
        expect(Number(debit.debit_amount)).toBe(blueBase)
        expect(Number(credit.credit_amount)).toBe(creditBase)
        if (isForeign) {
          expect(debit.currency_code_snapshot).toBe('USD')
          expect(credit.currency_code_snapshot).toBe('EUR')
          expect(Number(debit.original_amount)).toBe(amount)
          expect(Number(credit.original_amount)).toBe(creditAmount)
          expect(Number(debit.exchange_rate)).toBe(7)
          expect(Number(credit.exchange_rate)).toBe(8)
          if (phase === 'final')
            expect(
              Number(lines.find((entry) => entry.subject_code_snapshot === '6603')?.debit_amount)
            ).toBe(20)
        }
        if (phase !== 'partial') continue
        await historyRow.getByRole('button', { name: '反核销', exact: true }).click()
        const blockedReason = page.getByRole('dialog', { name: '反核销原因', exact: true })
        await blockedReason.getByRole('textbox').fill('验证有效凭证禁止反核销')
        const blocked = page.waitForResponse((entry) =>
          entry.url().endsWith('/rpc/fms_reverse_payable_writeoff_secure')
        )
        await blockedReason.getByRole('button', { name: '确定', exact: true }).click()
        const rejection = await blocked
        expect(rejection.ok()).toBe(false)
        expect(await rejection.json()).toEqual(expect.objectContaining({ code: '23514' }))
        await historyRow
          .getByRole('button', { name: refreshedRecord.voucher_no, exact: true })
          .click()
        const voucherDetail = page.getByRole('dialog', { name: '会计凭证详情', exact: true })
        await expect(voucherDetail).toContainText(scenario.blueSubject)
        await expect(voucherDetail).toContainText(scenario.creditSubject)
        await captureBusinessEvidence(voucherDetail, {
          path: info.outputPath(`red-blue-native-voucher-${scenario.key}.png`)
        })
        await voucherDetail.getByRole('button', { name: /关闭此/ }).click()
        const voucherList = page.waitForResponse((entry) =>
          entry.url().endsWith('/rpc/fms_list_vouchers_secure')
        )
        await page.getByRole('button', { name: '查询', exact: true }).click()
        expect((await voucherList).ok()).toBe(true)
        const voucherRow = page.locator('tbody tr').filter({ hasText: refreshedRecord.voucher_no })
        await voucherRow.getByRole('button', { name: '更多操作', exact: true }).click()
        await page.getByRole('menuitem', { name: '作废凭证', exact: true }).click()
        const voidDialog = page.getByRole('dialog', { name: '作废会计凭证', exact: true })
        await voidDialog.getByRole('textbox').fill('独立红蓝验收先作废凭证后恢复双方余额')
        const voided = page.waitForResponse((entry) =>
          entry.url().endsWith('/rpc/transition_fms_voucher_secure')
        )
        await voidDialog.getByRole('button', { name: '确认作废', exact: true }).click()
        expect((await voided).ok()).toBe(true)
        await expect(voidDialog).not.toBeVisible()
        await openRedBlue(page, scenario.keyword)
        await page.getByRole('tab', { name: /^核销记录/ }).click()
        await historyRow.getByRole('button', { name: '反核销', exact: true }).click()
        const reason = page.getByRole('dialog', { name: '反核销原因', exact: true })
        await reason.getByRole('textbox').fill('验证原币及本位币余额恢复，保留作废凭证审计')
        const reversed = page.waitForResponse((entry) =>
          entry.url().endsWith('/rpc/fms_reverse_payable_writeoff_secure')
        )
        await reason.getByRole('button', { name: '确定', exact: true }).click()
        expect((await reversed).ok()).toBe(true)
        await expect(historyRow).toContainText('已反核销')
        expect(
          Number((await redBluePayable(client, identifier(scenario.blue))).unpaid_amount)
        ).toBe(scenario.blueAmount)
        expect(
          Number((await redBluePayable(client, identifier(scenario.credit))).unpaid_amount)
        ).toBe(-scenario.creditAmount)
      }
    }
    expect(errors).toEqual([])
  } finally {
    const metadata = acceptanceRecord(
      await rpc(client, 'fms_payable_scheme_configuration_secure', {})
    )
    const latest = acceptanceRows(metadata.schemes).find((scheme) =>
      automaticId ? scheme.id === automaticId : scheme.code === 'QA_RB_MATRIX_AUTO'
    )
    if (latest?.enabled)
      await rpc(client, 'fms_save_payable_reference_secure', {
        p_kind: 'scheme',
        p_record: { ...latest, configuration_version: 2, enabled: false }
      })
  }
})
