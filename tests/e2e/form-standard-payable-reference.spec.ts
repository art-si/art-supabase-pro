import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

async function open(page: Page, query = '') {
  await prepareIsolatedSession(page)
  await page.goto(`/tests/e2e/fixtures/form-standard-main.html?feature=payable&mode=edit${query}`, {
    waitUntil: 'domcontentloaded'
  })
  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  return dialog
}

test('核销方案跨页签必填定位、表格红框修正、保存失败重试', async ({ page }, info) => {
  let rejectSave = true
  const writes: Record<string, unknown>[] = []
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/rpc/fms_save_payable_reference_secure', async (route) => {
    writes.push(route.request().postDataJSON())
    return rejectSave
      ? route.fulfill({ status: 409, json: { code: '40001', message: '配置已更新，请刷新后重试' } })
      : route.fulfill({ json: '22222222-2222-4222-8222-222222222222' })
  })
  await page.goto(
    '/tests/e2e/fixtures/form-standard-main.html?feature=payable&mode=edit&invalidRule',
    { waitUntil: 'domcontentloaded' }
  )
  const dialog = page.getByRole('dialog').last()
  await expect(dialog).toBeVisible({ timeout: 60_000 })
  const name = dialog.getByRole('textbox', { name: /^\*?\s*名称$/ })
  await name.clear()
  await dialog.getByRole('tab', { name: '匹配规则', exact: true }).click()
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(dialog.getByRole('tab', { name: '方案信息', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(name).toBeFocused()
  await name.fill('验收核销方案')
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(dialog.getByRole('tab', { name: '匹配规则', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(dialog.locator('.is-validation-error')).toHaveCount(1)
  await expect(dialog.getByRole('columnheader', { name: /主方单据字段/ })).toContainText('*')
  await expect(page.locator('.el-message--warning')).toContainText('主方单据字段')
  const selector = dialog.getByRole('combobox', { name: '主方单据字段', exact: true })
  await selector.press('ArrowDown')
  await page.getByRole('option', { name: '往来单位', exact: true }).click()
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => writes.length).toBe(1)
  await expect(page.locator('.el-message--error')).toBeVisible()
  await expect(dialog).toBeVisible()
  expect(writes[0]).toMatchObject({
    p_kind: 'scheme',
    p_record: {
      name: '验收核销方案',
      configuration_version: 2,
      rules: [{ primary_field: 'supplier_id', secondary_field: 'supplier_id', operator: 'eq' }]
    }
  })
  rejectSave = false
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect.poll(() => writes.length).toBe(2)
  await expect(dialog).not.toBeVisible()
  await page.getByRole('button', { name: '重新打开验收入口' }).click()
  await expect(dialog.getByRole('tab', { name: '方案信息', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await page.screenshot({ path: info.outputPath('scheme-information.png') })
})

test('分关系核销方案保留全部分类、窄暗布局与默认页签', async ({ page }, info) => {
  const dialog = await open(page, '&matrix&theme=dark')
  const writes: unknown[] = []
  await page.route('**/rest/v1/rpc/fms_save_payable_reference_secure', (route) => {
    writes.push(route.request().postDataJSON())
    return route.fulfill({ json: '22222222-2222-4222-8222-222222222222' })
  })
  await expect(dialog.getByRole('tab')).toHaveCount(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('html')).toHaveClass(/dark/)
  for (const tab of ['方案信息', '匹配规则']) {
    await dialog.getByRole('tab', { name: tab, exact: true }).click()
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: info.outputPath(`scheme-${tab}-dark.png`) })
  }
  await expect(
    dialog.getByRole('switch', { name: '按核销关系分别配置', exact: true })
  ).toBeChecked()
  await expect(dialog.getByText('应付付款核销', { exact: true })).toBeVisible()
  await dialog
    .getByRole('switch', { name: '按核销关系分别配置', exact: true })
    .locator('..')
    .click()
  const modeConfirm = page.getByRole('dialog', { name: '切换匹配模式', exact: true })
  const applyMode = modeConfirm.getByRole('button', { name: '切换为共用条件', exact: true })
  const cancelMode = modeConfirm.getByRole('button', { name: '取消', exact: true })
  await expect(modeConfirm).toBeVisible()
  await expect(applyMode).toHaveClass(/el-button--primary/)
  await expect(applyMode).not.toHaveClass(/el-button--danger/)
  await captureBusinessEvidence(modeConfirm, {
    path: info.outputPath('scheme-mode-confirm-dark-390.png')
  })
  for (const control of [
    modeConfirm.getByText('切换匹配模式', { exact: true }),
    applyMode,
    cancelMode
  ]) {
    await expect(control).toBeVisible()
    const geometry = await control.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const label = element.matches('button') ? (element.querySelector('span') ?? element) : element
      const range = document.createRange()
      range.selectNodeContents(label)
      const textRects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0)
      const firstLineTop = textRects[0]?.top
      return {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        oneLine:
          firstLineTop !== undefined &&
          textRects.every((rect) => Math.abs(rect.top - firstLineTop) <= 1),
        textFits: textRects.every(
          (rect) => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
        )
      }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.top).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(390)
    expect(geometry.bottom).toBeLessThanOrEqual(844)
    expect(geometry.oneLine).toBe(true)
    expect(geometry.textFits).toBe(true)
  }
  await cancelMode.click()
  await expect(modeConfirm).toBeHidden()
  await expect(
    dialog.getByRole('switch', { name: '按核销关系分别配置', exact: true })
  ).toBeChecked()
  await expect(dialog.getByText('应付付款核销', { exact: true })).toBeVisible()
  expect(writes).toHaveLength(0)
  await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({
    p_kind: 'scheme',
    p_record: {
      id: '22222222-2222-4222-8222-222222222222',
      code: 'QA-SCHEME',
      name: '验收核销方案',
      configuration_version: 2,
      rules: [{ primary_field: 'supplier_id', secondary_field: 'supplier_id', operator: 'eq' }],
      relation_rules: [
        {
          relation: 'payable_payment',
          rules: [{ primary_field: 'source_id', secondary_field: 'source_id', operator: 'eq' }]
        }
      ]
    }
  })
})

for (const matrix of [false, true]) {
  test(`核销配置保存期间${matrix ? '分关系规则失败保留并键盘重试' : '共用规则成功前保护当前草稿'}`, async ({
    page
  }, info) => {
    const gate = Promise.withResolvers<void>()
    const writes: Array<{ p_kind: string; p_record: Record<string, unknown> }> = []
    const softExpect = expect.configure({ soft: true })
    await page.setViewportSize({ width: matrix ? 390 : 1440, height: matrix ? 844 : 900 })
    const dialog = await open(page, matrix ? '&matrix&theme=dark' : '&theme=light')
    if (matrix) await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    else await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
    await installActionFeedbackHistory(page, { includeWarnings: true })
    await page.route('**/rest/v1/rpc/fms_save_payable_reference_secure', async (route) => {
      writes.push(route.request().postDataJSON())
      if (writes.length === 1) {
        await gate.promise
        if (matrix)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '核销方案未保存，请重试' }
          })
      }
      return route.fulfill({ json: '22222222-2222-4222-8222-222222222222' })
    })
    const code = dialog.getByRole('textbox', { name: /^\*?\s*编码$/ })
    const name = dialog.getByRole('textbox', { name: /^\*?\s*名称$/ })
    const automatic = dialog.getByRole('switch', { name: '自动核销', exact: true })
    const enabled = dialog.getByRole('switch', { name: '启用', exact: true })
    const save = dialog.getByRole('button', { name: '保存配置', exact: true })
    const mode = dialog.getByRole('switch', { name: '按核销关系分别配置', exact: true })
    const ruleControls = matrix
      ? [
          mode,
          dialog.getByRole('combobox', { name: '新增核销关系', exact: true }),
          dialog.getByRole('button', { name: '新增关系', exact: true }),
          dialog.getByRole('textbox', { name: '应付付款核销关系说明', exact: true }),
          dialog.getByRole('button', { name: '配置匹配规则', exact: true }),
          dialog.getByRole('button', { name: '移除核销关系', exact: true })
        ]
      : [
          mode,
          dialog.getByRole('combobox', { name: '主方单据字段', exact: true }),
          dialog.getByRole('combobox', { name: '匹配关系', exact: true }),
          dialog.getByRole('combobox', { name: '辅方单据字段', exact: true }),
          dialog.getByRole('switch', { name: '为空时匹配', exact: true }),
          dialog.getByRole('button', { name: '新增规则', exact: true }),
          dialog.getByRole('button', { name: '移除匹配规则', exact: true })
        ]
    const successCount = page.getByRole('status', { name: '保存次数', exact: true })
    await code.fill(matrix ? 'QA-MATRIX-PENDING' : 'QA-COMMON-PENDING')
    await name.fill(matrix ? '分关系待保存草稿' : '共用规则待保存草稿')
    await automatic.locator('..').click()
    await expect(automatic).toBeChecked()
    await dialog.getByRole('tab', { name: '匹配规则', exact: true }).click()
    if (matrix)
      await dialog
        .getByRole('textbox', { name: '应付付款核销关系说明', exact: true })
        .fill('待保存的应付付款关系')
    else await dialog.getByRole('switch', { name: '为空时匹配', exact: true }).locator('..').click()
    let completion: ReturnType<typeof page.waitForResponse>
    try {
      await save.click()
      await expect.poll(() => writes.length).toBe(1)
      await expect(save).toBeDisabled()
      await softExpect
        .poll(() => Promise.all(ruleControls.map((control) => control.isDisabled())))
        .toEqual(ruleControls.map(() => true))
      await page.screenshot({
        path: info.outputPath(
          matrix ? 'scheme-matrix-pending-dark-390.png' : 'scheme-common-pending-1440.png'
        )
      })
      await dialog.getByRole('tab', { name: '方案信息', exact: true }).click()
      await softExpect
        .poll(() =>
          Promise.all([code, name, automatic, enabled].map((control) => control.isDisabled()))
        )
        .toEqual([true, true, true, true])
      await expect(name).toHaveValue(matrix ? '分关系待保存草稿' : '共用规则待保存草稿')
      await expect(automatic).toBeChecked()
      await expect(enabled).toBeChecked()
      await expect(successCount).toHaveText('0')
      expect(writes).toHaveLength(1)
    } finally {
      completion = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_save_payable_reference_secure')
      )
      gate.resolve()
    }
    await (await completion).finished()
    if (matrix) {
      await expect(page.locator('.el-message--error')).toContainText('核销方案未保存，请重试')
      await expect(dialog).toBeVisible()
      await expect(save).toBeEnabled()
      for (const control of [code, name, automatic, enabled]) await expect(control).toBeEnabled()
      await expect(name).toHaveValue('分关系待保存草稿')
      await expect(code).toHaveValue('QA-MATRIX-PENDING')
      await expect(successCount).toHaveText('0')
      expect(await readActionFeedbackHistory(page)).toEqual([
        { kind: 'error', text: '核销方案未保存，请重试' }
      ])
      await dialog.getByRole('tab', { name: '匹配规则', exact: true }).click()
      for (const control of ruleControls) await expect(control).toBeEnabled()
      await expect(
        dialog.getByRole('textbox', { name: '应付付款核销关系说明', exact: true })
      ).toHaveValue('待保存的应付付款关系')
      await save.focus()
      await expect(save).toBeFocused()
      await page.keyboard.press('Enter')
      await expect.poll(() => writes.length).toBe(2)
      expect(writes[1]).toEqual(writes[0])
    }
    await expect(dialog).toBeHidden()
    await expect(successCount).toHaveText('1')
    expect(await readActionFeedbackHistory(page)).toEqual([
      ...(matrix ? [{ kind: 'error', text: '核销方案未保存，请重试' }] : []),
      { kind: 'success', text: '配置已保存' }
    ])
    expect(writes).toHaveLength(matrix ? 2 : 1)
    expect(writes[0]).toMatchObject({
      p_kind: 'scheme',
      p_record: {
        id: '22222222-2222-4222-8222-222222222222',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        configuration_version: 2,
        version: 1,
        code: matrix ? 'QA-MATRIX-PENDING' : 'QA-COMMON-PENDING',
        name: matrix ? '分关系待保存草稿' : '共用规则待保存草稿',
        enabled: true,
        automatic: true,
        ...(matrix
          ? {
              relation_rules: [
                {
                  relation: 'payable_payment',
                  description: '待保存的应付付款关系',
                  rules: [
                    { primary_field: 'source_id', secondary_field: 'source_id', operator: 'eq' }
                  ]
                }
              ]
            }
          : {
              rules: [
                {
                  primary_field: 'supplier_id',
                  secondary_field: 'supplier_id',
                  operator: 'eq',
                  empty_matches: true
                }
              ]
            })
      }
    })
  })
}

for (const outcome of ['success', 'failure'] as const) {
  test(`核销配置保存旧请求${outcome === 'success' ? '成功' : '失败'}不影响重开的编辑会话`, async ({
    page
  }, info) => {
    const gate = Promise.withResolvers<void>()
    const currentGate = Promise.withResolvers<void>()
    const writes: Array<{ p_kind: string; p_record: Record<string, unknown> }> = []
    const narrow = outcome === 'failure'
    if (narrow) await page.setViewportSize({ width: 390, height: 844 })
    const dialog = await open(page, narrow ? '&theme=dark' : '')
    if (narrow) await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    await installActionFeedbackHistory(page, { includeWarnings: true })
    await page.route('**/rest/v1/rpc/fms_save_payable_reference_secure', async (route) => {
      const request = writes.push(route.request().postDataJSON())
      await (request === 1 ? gate.promise : currentGate.promise)
      return outcome === 'success'
        ? route.fulfill({ json: '22222222-2222-4222-8222-222222222222' })
        : route.fulfill({
            status: 400,
            json: {
              code: 'P0001',
              message: request === 1 ? '旧会话配置保存失败' : '当前会话配置保存失败'
            }
          })
    })
    const code = dialog.getByRole('textbox', { name: /^\*?\s*编码$/ })
    const name = dialog.getByRole('textbox', { name: /^\*?\s*名称$/ })
    const save = dialog.getByRole('button', { name: '保存配置', exact: true })
    const successCount = page.getByRole('status', { name: '保存次数', exact: true })
    await code.fill('QA-SCHEME-A')
    await name.fill('待保存配置 A')
    let completion: ReturnType<typeof page.waitForResponse>
    try {
      await save.click()
      await expect.poll(() => writes.length).toBe(1)
      await expect(save).toBeDisabled()
      await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
      await expect(dialog).toBeHidden()
      await page.getByRole('button', { name: '重新打开验收入口', exact: true }).click()
      await expect(dialog).toBeVisible()
      await expect(name).toHaveValue('验收核销方案')
      await code.fill('QA-SCHEME-B')
      await name.fill('新会话配置 B')
      await expect(save).toBeEnabled()
      await expect(successCount).toHaveText('0')
      if (narrow) {
        await save.click()
        await expect.poll(() => writes.length).toBe(2)
        await expect(save).toBeDisabled()
        await dialog.getByRole('tab', { name: '方案信息', exact: true }).click()
      }
    } finally {
      completion = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_save_payable_reference_secure')
      )
      gate.resolve()
    }
    await (await completion).finished()
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await page.screenshot({ path: info.outputPath(`reference-old-save-${outcome}.png`) })
    await expect(dialog).toBeVisible()
    await expect(code).toHaveValue('QA-SCHEME-B')
    await expect(name).toHaveValue('新会话配置 B')
    if (narrow) {
      await expect(save).toBeDisabled()
      await expect
        .configure({ soft: true })
        .poll(() => Promise.all([code, name].map((control) => control.isDisabled())))
        .toEqual([true, true])
    } else await expect(save).toBeEnabled()
    await expect(successCount).toHaveText('0')
    expect(await readActionFeedbackHistory(page)).toEqual([])
    await expect(page.locator('.el-message--success, .el-message--error')).toHaveCount(0)
    expect(writes).toHaveLength(narrow ? 2 : 1)
    expect(writes[0]).toMatchObject({
      p_kind: 'scheme',
      p_record: {
        id: '22222222-2222-4222-8222-222222222222',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        code: 'QA-SCHEME-A',
        name: '待保存配置 A',
        configuration_version: 2,
        version: 1
      }
    })
    if (narrow) {
      expect(writes[1]).toEqual({
        ...writes[0],
        p_record: { ...writes[0].p_record, code: 'QA-SCHEME-B', name: '新会话配置 B' }
      })
      const currentCompletion = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/fms_save_payable_reference_secure')
      )
      currentGate.resolve()
      await (await currentCompletion).finished()
      await expect(page.locator('.el-message--error')).toContainText('当前会话配置保存失败')
      await expect(save).toBeEnabled()
      await expect(code).toBeEnabled()
      await expect(name).toBeEnabled()
      await expect(code).toHaveValue('QA-SCHEME-B')
      await expect(name).toHaveValue('新会话配置 B')
      await expect(successCount).toHaveText('0')
      expect(await readActionFeedbackHistory(page)).toEqual([
        { kind: 'error', text: '当前会话配置保存失败' }
      ])
    }
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await expect(dialog).toBeHidden()
    expect(writes).toHaveLength(narrow ? 2 : 1)
  })
}

for (const kind of ['purpose', 'method']) {
  test(`${kind} 少字段保持单页并实际保存`, async ({ page }, info) => {
    let payload: unknown
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/rpc/fms_save_payable_reference_secure', (route) => {
      payload = route.request().postDataJSON()
      return route.fulfill({ json: '22222222-2222-4222-8222-222222222222' })
    })
    await page.goto(
      `/tests/e2e/fixtures/form-standard-main.html?feature=payable&mode=add&kind=${kind}`,
      { waitUntil: 'domcontentloaded' }
    )
    const dialog = page.getByRole('dialog').last()
    await expect(dialog).toBeVisible({ timeout: 60_000 })
    await expect(dialog.getByRole('tab')).toHaveCount(0)
    await dialog.getByRole('textbox', { name: /^\*?\s*编码$/ }).fill(`QA-${kind}`)
    await dialog.getByRole('textbox', { name: /^\*?\s*名称$/ }).fill(`验收${kind}`)
    await page.screenshot({ path: info.outputPath(`${kind}-compact.png`) })
    await dialog.getByRole('button', { name: '保存配置', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(payload).toMatchObject({
      p_kind: kind,
      p_record: { code: `QA-${kind}`, name: `验收${kind}`, enabled: true }
    })
  })
}
