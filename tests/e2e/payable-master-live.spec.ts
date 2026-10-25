import { expect, test as base, type Locator, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { appendFileSync } from 'node:fs'
import {
  assertPayableAcceptanceSession,
  payableAcceptanceTenantId
} from './support/payable-live-session'
import { captureBusinessEvidence } from './support/capture-business-evidence'
import { prepareAppearance } from './support/appearance'

const enabled = process.env.E2E_PAYABLE_LIVE === 'true'
const test = base.extend<{ acceptance: SupabaseClient }>({
  acceptance: async ({ context }, use) => {
    await use(await assertPayableAcceptanceSession(context))
  }
})
test.use({
  storageState: enabled
    ? process.env.E2E_AUTH_STATE_FILE || '.artifacts/qa-payable-mdm.storage.json'
    : { cookies: [], origins: [] },
  trace: 'off',
  actionTimeout: 20_000
})
test.skip(!enabled, '仅显式运行独立验收租户真实资料测试')
test.setTimeout(240_000)

const masters = [
  {
    route: 'payment-term',
    title: '付款条件',
    table: 'mdm_payment_term',
    rpc: 'mdm_save_payment_term_secure',
    prefix: 'TERM',
    codeLabel: '编号'
  },
  {
    route: 'payment-purpose',
    title: '付款用途',
    table: 'mdm_payment_purpose',
    rpc: 'fms_save_payable_reference_secure',
    prefix: 'PURPOSE',
    codeLabel: '编码'
  },
  {
    route: 'settlement-method',
    title: '结算方式',
    table: 'mdm_settlement_method',
    rpc: 'fms_save_payable_reference_secure',
    prefix: 'METHOD',
    codeLabel: '编码'
  }
] as const

test('退款用途两类真实资料保存、编辑与业务类型展示', async ({ page, acceptance }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('dark')
  })
  const initialData = page.waitForResponse(
    (response) => response.url().endsWith('/rpc/fms_payable_reference_list_secure'),
    { timeout: 90_000 }
  )
  await page.goto('#/mdm/financial-master/payment-purpose', { waitUntil: 'domcontentloaded' })
  expect((await initialData).ok()).toBe(true)
  await expect(page.getByRole('heading', { name: '付款用途', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const guide = page.getByRole('button', { name: '知道了', exact: true })
  if (await guide.isVisible()) await guide.click()
  await expect(page.getByRole('textbox', { name: '查询条件', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  const run = Date.now().toString(36).toUpperCase()
  for (const [index, option] of [
    { value: 'purchase_refund', label: '退采购付款' },
    { value: 'advance_refund', label: '退预付款' }
  ].entries()) {
    const code = `QA_RF_PURPOSE_${run}_${index + 1}`
    const name = `验收${option.label}用途-${run}`
    await page.getByRole('button', { name: '新增', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '新增付款用途', exact: true })
    await editor.getByRole('textbox', { name: /编码$/ }).fill(code)
    await editor.getByRole('textbox', { name: /名称$/ }).fill(name)
    await editor.getByRole('combobox', { name: '付款业务类型', exact: true }).click()
    await expect(page.getByRole('option', { name: option.label, exact: true })).toBeVisible()
    await captureBusinessEvidence(page, {
      path: info.outputPath(`refund-purpose-options-${index + 1}.png`)
    })
    await page.getByRole('option', { name: option.label, exact: true }).click()
    await editor
      .getByRole('textbox', { name: '描述', exact: true })
      .fill('独立验收租户退款用途，不连接生产资金')
    const id = await save(page, editor, 'fms_save_payable_reference_secure')
    const { data, error } = await acceptance
      .from('mdm_payment_purpose')
      .select('id, tenant_id, business_type')
      .eq('id', id)
      .single()
    expect(error).toBeNull()
    expect(data?.tenant_id).toBe(payableAcceptanceTenantId)
    expect(data?.business_type).toBe(option.value)
    await query(page, code)
    const row = recordRow(page, code)
    await expect(row).toContainText(name)
    await expect(row).toContainText(option.label)
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    const edit = page.getByRole('dialog', { name: '编辑付款用途', exact: true })
    await expect(edit.getByText(option.label, { exact: true })).toBeVisible()
    await edit
      .getByRole('textbox', { name: '描述', exact: true })
      .fill('退款用途已核验并保留供后续流程参选')
    await captureBusinessEvidence(edit, {
      path: info.outputPath(`refund-purpose-edit-${index + 1}.png`)
    })
    await save(page, edit, 'fms_save_payable_reference_secure')
    await query(page, code)
    await expect(recordRow(page, code)).toBeVisible()
    await expect(recordRow(page, code)).toContainText(option.label)
    await captureBusinessEvidence(page, {
      path: info.outputPath(`refund-purpose-list-${index + 1}.png`)
    })
    appendFileSync(
      '.artifacts/payable-live-masters.jsonl',
      JSON.stringify({ id, code, name, table: 'mdm_payment_purpose', businessType: option.value }) +
        '\n'
    )
  }
  expect(errors).toEqual([])
})

async function query(page: Page, keyword: string): Promise<void> {
  await page.getByRole('textbox', { name: '查询条件', exact: true }).fill(keyword)
  const loaded = page.waitForResponse((response) =>
    ['mdm_payment_terms_list_secure', 'fms_payable_reference_list_secure'].some((rpc) =>
      response.url().endsWith(`/rpc/${rpc}`)
    )
  )
  await page.getByRole('button', { name: '查询', exact: true }).click()
  expect((await loaded).ok()).toBe(true)
  await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
  await expect(page.getByText('正在加载表格数据…', { exact: true })).not.toBeVisible()
}

function recordRow(page: Page, code: string): Locator {
  return page
    .locator('.art-table-query tbody tr')
    .filter({ has: page.getByText(code, { exact: true }) })
}

async function save(page: Page, editor: Locator, rpc: string): Promise<string> {
  const pending = page.waitForResponse((response) => response.url().endsWith(`/rpc/${rpc}`))
  await editor.getByRole('button', { name: /保存/ }).click()
  const response = await pending
  expect(response.ok()).toBe(true)
  const id: unknown = await response.json()
  if (typeof id !== 'string') throw new Error('真实财务资料保存未返回标识')
  await expect(editor).not.toBeVisible()
  return id
}

for (const master of masters) {
  test(`${master.title}两条真实资料增改查、停启用与单批删除`, async ({
    page,
    acceptance
  }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareAppearance(page, {
      theme: info.project.name.includes('dark') ? 'dark' : 'light',
      boxBorderMode: !info.project.name.includes('dark')
    })
    await page.goto(`#/mdm/financial-master/${master.route}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: master.title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    const guide = page.getByRole('button', { name: '知道了', exact: true })
    if (await guide.isVisible()) await guide.click()
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    const run = Date.now().toString(36).toUpperCase()
    const records: Array<{ id: string; code: string; name: string }> = []
    for (let index = 1; index <= 5; index += 1) {
      const code = `QA_${master.prefix}_${run}_${index}`
      const name = `验收${master.title}${index}-${run}`
      await page.getByRole('button', { name: '新增', exact: true }).click()
      const editor = page.getByRole('dialog', { name: `新增${master.title}`, exact: true })
      await editor.getByRole('textbox', { name: new RegExp(`${master.codeLabel}$`) }).fill(code)
      await editor.getByRole('textbox', { name: /名称$/ }).fill(name)
      if (master.prefix === 'TERM')
        await editor
          .getByRole('spinbutton', { name: '账期天数', exact: true })
          .fill(String(index * 10))
      await editor
        .getByRole('textbox', { name: '描述', exact: true })
        .fill('独立租户虚构资料，不连接生产资金')
      const id = await save(page, editor, master.rpc)
      records.push({ id, code, name })
      if (index > 2) continue
      await query(page, code)
      const row = recordRow(page, code)
      await expect(row).toContainText(name)
      await row.getByRole('button', { name: '编辑', exact: true }).click()
      const edit = page.getByRole('dialog', { name: `编辑${master.title}`, exact: true })
      await expect(edit.getByRole('textbox', { name: /名称$/ })).toHaveValue(name)
      await edit.getByRole('textbox', { name: '描述', exact: true }).fill(`已编辑并核验-${index}`)
      const enabledSwitch = edit.getByRole('switch', { name: '启用', exact: true })
      await enabledSwitch.locator('..').click()
      await expect(enabledSwitch).not.toBeChecked()
      await captureBusinessEvidence(edit, {
        path: info.outputPath(`${master.prefix}-edit-${index}.png`)
      })
      await save(page, edit, master.rpc)
      await expect(row).toContainText('停用')
      await row.getByRole('button', { name: '编辑', exact: true }).click()
      await enabledSwitch.locator('..').click()
      await expect(enabledSwitch).toBeChecked()
      await save(page, edit, master.rpc)
      await expect(row).toContainText(master.prefix === 'TERM' ? '可用' : '启用')
      appendFileSync(
        '.artifacts/payable-live-masters.jsonl',
        JSON.stringify({ ...records[index - 1], table: master.table }) + '\n'
      )
    }
    const single = records[2]
    await query(page, single.code)
    const more = recordRow(page, single.code).getByRole('button', { name: '更多操作', exact: true })
    await more.focus()
    await more.press('ArrowDown')
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '删除确认', exact: true })
    await expect(confirmation).toContainText(single.name)
    await confirmation.getByRole('button', { name: '删除', exact: true }).click()
    await expect(recordRow(page, single.code)).toHaveCount(0)
    await query(page, `QA_${master.prefix}_${run}`)
    for (const record of records.slice(3))
      await recordRow(page, record.code).locator('.el-checkbox').click()
    await page.getByRole('button', { name: '批量删除', exact: true }).click()
    await expect(confirmation).toContainText('2')
    await captureBusinessEvidence(confirmation, {
      path: info.outputPath(`${master.prefix}-bulk-delete.png`)
    })
    await confirmation.getByRole('button', { name: '删除', exact: true }).click()
    for (const record of records.slice(2)) await expect(recordRow(page, record.code)).toHaveCount(0)
    const current = await acceptance
      .from(master.table)
      .select('id,code,name,enabled')
      .eq('tenant_id', payableAcceptanceTenantId)
      .in(
        'id',
        records.map((record) => record.id)
      )
    expect(current.error).toBeNull()
    expect(current.data).toHaveLength(2)
    expect(current.data?.every((record) => record.enabled)).toBe(true)
    await captureBusinessEvidence(page, {
      path: info.outputPath(`${master.prefix}-retained-two.png`)
    })
    expect(errors).toEqual([])
  })
}

test('三类财务资料两条真实记录的窄屏主题与专注模式', async ({ page, acceptance }, info) => {
  await prepareAppearance(page, {
    theme: info.project.name.includes('dark') ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('dark')
  })
  for (const master of masters) {
    const current = await acceptance
      .from(master.table)
      .select('id,code,name,enabled')
      .eq('tenant_id', payableAcceptanceTenantId)
      .like('code', `QA_${master.prefix}_%`)
      .order('create_time', { ascending: false })
      .limit(2)
    expect(current.error).toBeNull()
    expect(current.data).toHaveLength(2)
    if (!current.data) throw new Error('缺少财务资料真实记录')
    await page.goto(`#/mdm/financial-master/${master.route}`, { waitUntil: 'domcontentloaded' })
    const heading = page.getByRole('heading', { name: master.title, exact: true })
    await expect(heading).toBeVisible({ timeout: 60_000 })
    const guide = page.getByRole('button', { name: '知道了', exact: true })
    if (await guide.isVisible()) await guide.click()
    const code: string = current.data[0].code
    await query(page, code.slice(0, code.lastIndexOf('_')))
    for (const record of current.data) {
      await expect(recordRow(page, record.code)).toContainText(record.name)
      await expect(recordRow(page, record.code)).toBeVisible()
    }
    await captureBusinessEvidence(page, { path: info.outputPath(`${master.prefix}-list.png`) })
    const focus = page.getByRole('switch', { name: '进入专注模式', exact: true })
    await focus.locator('..').click()
    await expect(heading).not.toBeVisible()
    await expect(page.locator('.art-table-query')).toHaveClass(/is-focus-mode/)
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    await expect(page.getByText('正在加载表格数据...', { exact: true })).not.toBeVisible()
    for (const record of current.data) await expect(recordRow(page, record.code)).toBeVisible()
    await captureBusinessEvidence(page, { path: info.outputPath(`${master.prefix}-focused.png`) })
    await page.getByRole('button', { name: '退出专注模式', exact: true }).click()
    await expect(heading).toBeVisible()
    await focus.locator('..').click()
    await page.keyboard.press('Escape')
    await expect(heading).toBeVisible()
  }
})

test('真实付款用途与结算方式引用阻止删除并显示业务单号', async ({ page, acceptance }, info) => {
  await prepareAppearance(page, { theme: 'light', boxBorderMode: true })
  let deletionRequests = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/rpc/mdm_delete_payable_masters_secure')) deletionRequests += 1
  })
  for (const [master, code] of [
    [masters[1], '201'],
    [masters[2], 'JSFS01']
  ] as const) {
    const source = await acceptance
      .from(master.table)
      .select('id')
      .eq('tenant_id', payableAcceptanceTenantId)
      .eq('code', code)
      .single()
    expect(source.error).toBeNull()
    if (!source.data) throw new Error('缺少已引用的验收财务资料')
    const references = await acceptance.rpc('get_mdm_payable_master_delete_dependencies_secure', {
      p_table: master.table,
      p_ids: [source.data.id]
    })
    expect(references.error).toBeNull()
    const records: unknown = references.data
    if (!Array.isArray(records) || records.length < 2) throw new Error('缺少两条真实付款引用')
    await page.goto(`#/mdm/financial-master/${master.route}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: master.title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    await query(page, code)
    const more = recordRow(page, code).getByRole('button', { name: '更多操作', exact: true })
    await more.focus()
    await more.press('ArrowDown')
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    const guard = page.getByRole('dialog', { name: `暂时无法删除${master.title}`, exact: true })
    await expect(guard).toBeVisible()
    await expect(page.getByRole('dialog', { name: '删除确认', exact: true })).toHaveCount(0)
    for (const record of records.slice(0, 2)) {
      if (
        !record ||
        typeof record !== 'object' ||
        !('record_no' in record) ||
        typeof record.record_no !== 'string'
      )
        throw new Error('引用未返回可识别业务单号')
      await expect(guard).toContainText(record.record_no)
    }
    await captureBusinessEvidence(guard, {
      path: info.outputPath(`${master.prefix}-referenced.png`)
    })
    await guard.getByRole('button', { name: '关闭此对话框', exact: true }).click()
    await expect(recordRow(page, code)).toBeVisible()
  }
  expect(deletionRequests).toBe(0)
})
