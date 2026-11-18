import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance, assertAppearance } from './support/appearance'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

async function openPaymentTerm(page: Page, narrow: boolean) {
  const record = {
    id: '33333333-3333-4333-8333-333333333333',
    tenant_id: '11111111-1111-4111-8111-111111111111',
    code: 'QA-NET30',
    name: '测试月结30天',
    days: 30,
    enabled: true,
    preset: false,
    remark: '原付款条件说明'
  }
  const appearance = {
    theme: narrow ? ('dark' as const) : ('light' as const),
    boxBorderMode: !narrow
  }
  await page.setViewportSize({ width: narrow ? 390 : 1440, height: narrow ? 844 : 900 })
  await prepareIsolatedSession(page, { tenantId: record.tenant_id, platformSuper: false })
  await prepareAppearance(page, appearance)
  await page.route('**/rest/v1/rpc/mdm_payment_terms_list_secure', (route) =>
    route.fulfill({ json: { data: [record], total: 1 } })
  )
  await page.goto(
    `/tests/e2e/fixtures/purchase-payable.html?kind=payment-term&theme=${appearance.theme}&box=${narrow ? 'shadow-mode' : 'border-mode'}&permissionControls=1&permissions=MdmPaymentTerm:View,MdmPaymentTerm:Edit`,
    { waitUntil: 'domcontentloaded', timeout: 90_000 }
  )
  await assertAppearance(page, appearance)
  const row = page.getByRole('row').filter({ hasText: record.code })
  await expect(row).toBeVisible({ timeout: 60_000 })
  await row.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑付款条件', exact: true })
  await expect(dialog).toBeVisible()
  const fields = {
    code: dialog.getByRole('textbox', { name: /^\*?\s*编号$/ }),
    name: dialog.getByRole('textbox', { name: /^\*?\s*名称$/ }),
    days: dialog.getByRole('spinbutton', { name: '账期天数', exact: true }),
    enabled: dialog.getByRole('switch', { name: '启用', exact: true }),
    remark: dialog.getByRole('textbox', { name: '描述', exact: true })
  }
  return {
    record,
    row,
    dialog,
    fields,
    save: dialog.getByRole('button', { name: '保存付款条件', exact: true })
  }
}

for (const narrow of [false, true]) {
  test(`付款条件保存期间${narrow ? '暗色窄屏失败保留并键盘重试' : '浅色桌面等待列表刷新保护五项草稿'}`, async ({
    page
  }, info) => {
    const { record, dialog, fields, save } = await openPaymentTerm(page, narrow)
    const gate = Promise.withResolvers<void>()
    const refreshGate = Promise.withResolvers<void>()
    const writes: Array<{ p_term: typeof record }> = []
    const softExpect = expect.configure({ soft: true })
    const controls = Object.values(fields)
    let refreshes = 0
    await installActionFeedbackHistory(page, { includeWarnings: true })
    await page.route('**/rest/v1/rpc/mdm_save_payment_term_secure', async (route) => {
      const body: { p_term: typeof record } = route.request().postDataJSON()
      const request = writes.push(body)
      if (request === 1) {
        await gate.promise
        if (narrow)
          return route.fulfill({
            status: 400,
            json: { code: 'P0001', message: '付款条件未保存，请重试' }
          })
      }
      Object.assign(record, body.p_term)
      return route.fulfill({ json: null })
    })
    if (!narrow)
      await page.route('**/rest/v1/rpc/mdm_payment_terms_list_secure', async (route) => {
        refreshes++
        await refreshGate.promise
        return route.fulfill({ json: { data: [record], total: 1 } })
      })
    const draft = {
      ...record,
      code: 'QA-NET45-PENDING',
      name: '待保存月结45天',
      days: 45,
      enabled: false,
      remark: '本次付款条件草稿说明'
    }
    await fields.code.fill(draft.code)
    if (!narrow) {
      await fields.name.clear()
      await save.click()
      await expect(fields.name).toBeFocused()
      for (const control of controls) await expect(control).toBeEnabled()
      expect(writes).toHaveLength(0)
    }
    await fields.name.fill(draft.name)
    await fields.days.fill(String(draft.days))
    await fields.days.press('Tab')
    await fields.enabled.locator('..').click()
    await expect(fields.enabled).not.toBeChecked()
    await fields.remark.fill(draft.remark)
    let completion: ReturnType<typeof page.waitForResponse>
    try {
      await save.click()
      await expect.poll(() => writes.length).toBe(1)
      await expect(save).toBeDisabled()
      await softExpect
        .poll(() => Promise.all(controls.map((control) => control.isDisabled())))
        .toEqual([true, true, true, true, true])
      expect(writes).toEqual([{ p_term: draft }])
      await captureBusinessEvidence(dialog, {
        path: info.outputPath(`payment-term-pending-${narrow ? 'dark-390' : 'light-1440'}.png`)
      })
    } finally {
      completion = page.waitForResponse((response) =>
        response.url().endsWith('/rpc/mdm_save_payment_term_secure')
      )
      gate.resolve()
    }
    await (await completion).finished()
    if (narrow) {
      await expect(page.locator('.el-message--error')).toContainText('付款条件未保存，请重试')
      await expect(dialog).toBeVisible()
      await expect(save).toBeEnabled()
      for (const control of controls) await expect(control).toBeEnabled()
      await expect(fields.code).toHaveValue(draft.code)
      await expect(fields.name).toHaveValue(draft.name)
      await expect(fields.days).toHaveValue(String(draft.days))
      await expect(fields.enabled).not.toBeChecked()
      await expect(fields.remark).toHaveValue(draft.remark)
      expect(await readActionFeedbackHistory(page)).toEqual([
        { kind: 'error', text: '付款条件未保存，请重试' }
      ])
      await save.focus()
      await expect(save).toBeFocused()
      await page.keyboard.press('Enter')
      await expect.poll(() => writes.length).toBe(2)
      expect(writes[1]).toEqual(writes[0])
    } else {
      try {
        await expect.poll(() => refreshes).toBe(1)
        await expect(dialog).toBeVisible()
        await expect(save).toBeDisabled()
        await softExpect
          .poll(() => Promise.all(controls.map((control) => control.isDisabled())))
          .toEqual([true, true, true, true, true])
        expect(writes).toEqual([{ p_term: draft }])
        expect(await readActionFeedbackHistory(page)).toEqual([
          { kind: 'success', text: '付款条件已保存' }
        ])
        await page.keyboard.press('Alt+Shift+4')
      } finally {
        refreshGate.resolve()
      }
    }
    if (narrow) await expect(dialog).toBeHidden()
    else {
      await expect(dialog).toBeVisible()
      await expect(save).toBeEnabled()
      for (const control of controls) await expect(control).toBeEnabled()
      await expect(fields.code).toHaveValue(draft.code)
      await expect(fields.name).toHaveValue(draft.name)
      await expect(fields.days).toHaveValue(String(draft.days))
      await expect(fields.enabled).not.toBeChecked()
      await expect(fields.remark).toHaveValue(draft.remark)
      await save.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('.el-message--warning')).toContainText(
        '操作范围或权限已变化，请重新打开付款条件'
      )
      expect(writes).toHaveLength(1)
      await page.keyboard.press('Alt+Shift+5')
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
      await expect(dialog).toBeHidden()
    }
    await expect(page.getByRole('row').filter({ hasText: draft.code })).toContainText(draft.name)
    expect(writes).toHaveLength(narrow ? 2 : 1)
    expect(writes[0]).toEqual({ p_term: draft })
    expect(await readActionFeedbackHistory(page)).toEqual([
      ...(narrow ? [{ kind: 'error', text: '付款条件未保存，请重试' }] : []),
      { kind: 'success', text: '付款条件已保存' },
      ...(!narrow ? [{ kind: 'warning', text: '操作范围或权限已变化，请重新打开付款条件' }] : [])
    ])
  })
}

test('付款条件保存期间同一记录旧失败不能解锁新会话', async ({ page }, info) => {
  const { record, row, dialog, fields, save } = await openPaymentTerm(page, true)
  const oldGate = Promise.withResolvers<void>()
  const currentGate = Promise.withResolvers<void>()
  const writes: Array<{ p_term: typeof record }> = []
  const softExpect = expect.configure({ soft: true })
  await installActionFeedbackHistory(page, { includeWarnings: true })
  await page.route('**/rest/v1/rpc/mdm_save_payment_term_secure', async (route) => {
    const request = writes.push(route.request().postDataJSON())
    await (request === 1 ? oldGate.promise : currentGate.promise)
    return route.fulfill({
      status: 400,
      json: {
        code: 'P0001',
        message: request === 1 ? '旧会话付款条件保存失败' : '当前付款条件保存失败'
      }
    })
  })
  const draftA = { ...record, code: 'QA-TERM-A', name: '付款条件草稿 A', remark: '旧会话说明 A' }
  const draftB = { ...record, code: 'QA-TERM-B', name: '付款条件草稿 B', remark: '当前会话说明 B' }
  await fields.code.fill(draftA.code)
  await fields.name.fill(draftA.name)
  await fields.remark.fill(draftA.remark)
  let oldCompletion: ReturnType<typeof page.waitForResponse>
  try {
    await save.click()
    await expect.poll(() => writes.length).toBe(1)
    await expect(save).toBeDisabled()
    await dialog.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await expect(dialog).toBeHidden()
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    await expect(dialog).toBeVisible()
    for (const control of Object.values(fields)) await expect(control).toBeEnabled()
    await expect(fields.name).toHaveValue(record.name)
    await fields.code.fill(draftB.code)
    await fields.name.fill(draftB.name)
    await fields.remark.fill(draftB.remark)
    await save.click()
    await expect.poll(() => writes.length).toBe(2)
    await expect(save).toBeDisabled()
  } finally {
    oldCompletion = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/mdm_save_payment_term_secure')
    )
    oldGate.resolve()
  }
  await (await oldCompletion).finished()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  let currentCompletion: ReturnType<typeof page.waitForResponse>
  try {
    await expect(dialog).toBeVisible()
    await expect(save).toBeDisabled()
    await softExpect
      .poll(() => Promise.all(Object.values(fields).map((control) => control.isDisabled())))
      .toEqual([true, true, true, true, true])
    await expect(fields.code).toHaveValue(draftB.code)
    await expect(fields.name).toHaveValue(draftB.name)
    await expect(fields.remark).toHaveValue(draftB.remark)
    expect(await readActionFeedbackHistory(page)).toEqual([])
    expect(writes).toEqual([{ p_term: draftA }, { p_term: draftB }])
    await captureBusinessEvidence(dialog, {
      path: info.outputPath('payment-term-current-session-pending-dark-390.png')
    })
  } finally {
    currentCompletion = page.waitForResponse((response) =>
      response.url().endsWith('/rpc/mdm_save_payment_term_secure')
    )
    currentGate.resolve()
  }
  await (await currentCompletion).finished()
  await expect(page.locator('.el-message--error')).toContainText('当前付款条件保存失败')
  await expect(dialog).toBeVisible()
  await expect(save).toBeEnabled()
  for (const control of Object.values(fields)) await expect(control).toBeEnabled()
  await expect(fields.code).toHaveValue(draftB.code)
  await expect(fields.name).toHaveValue(draftB.name)
  await expect(fields.remark).toHaveValue(draftB.remark)
  expect(await readActionFeedbackHistory(page)).toEqual([
    { kind: 'error', text: '当前付款条件保存失败' }
  ])
  expect(writes).toEqual([{ p_term: draftA }, { p_term: draftB }])
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
})
