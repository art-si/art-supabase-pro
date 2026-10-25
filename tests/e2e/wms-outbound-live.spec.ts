import { expect, test } from '@playwright/test'
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { keysToCamelDeep } from '../../src/utils/supabase/key-transform'

let client: SupabaseClient
let session: Session
let userInfo: Record<string, unknown>
test.setTimeout(180_000)
test.beforeAll(async () => {
  const env = loadEnv('development', process.cwd(), '')
  expect(new URL(env.VITE_SUPABASE_URL).hostname).toBe('ckbftoopuyophiebamwy.supabase.co')
  client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_KEY, {
    auth: { persistSession: false }
  })
  const state = JSON.parse(readFileSync('playwright/.auth/user.json', 'utf8')) as {
    origins: { localStorage: { name: string; value: string }[] }[]
  }
  const saved = state.origins
    .flatMap((origin) => origin.localStorage)
    .find((item) => item.name === 'sb-ckbftoopuyophiebamwy-auth-token')
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD
  if (!email || !password)
    expect(saved, '已有真实测试会话或配置 E2E_EMAIL/E2E_PASSWORD').toBeTruthy()
  const { data, error } =
    email && password
      ? await client.auth.signInWithPassword({ email, password })
      : await client.auth.setSession(JSON.parse(saved!.value))
  expect(error, '真实测试账号登录').toBeNull()
  session = data.session!
  const profile = await client
    .from('sys_user')
    .select('*, tenant:sys_tenant!sys_user_tenant_id_fkey(tenant_code, tenant_name)')
    .eq('auth_user_id', session.user.id)
    .single()
  expect(profile.error, '当前登录账号资料').toBeNull()
  const {
    id: userId,
    userEmail: emailAddress,
    ...info
  } = keysToCamelDeep(profile.data) as Record<string, unknown>
  const [superResult, roleNamesResult] = await Promise.all([
    client.rpc('current_is_super'),
    client.rpc('current_user_role_names')
  ])
  expect(superResult.error).toBeNull()
  expect(roleNamesResult.error).toBeNull()
  userInfo = {
    userId,
    email: emailAddress,
    ...info,
    platformSuper: superResult.data === true,
    roleNames: roleNamesResult.data
  }
})
test.beforeEach(async ({ page }) => {
  const savedState = JSON.parse(readFileSync('playwright/.auth/user.json', 'utf8')) as {
    origins: Array<{ localStorage: Array<{ name: string; value: string }> }>
  }
  const persistedLocalStorage = savedState.origins.flatMap((origin) => origin.localStorage)
  await page.addInitScript(
    ({ session, persistedLocalStorage, userInfo }) => {
      for (const entry of persistedLocalStorage) localStorage.setItem(entry.name, entry.value)
      localStorage.setItem('sb-ckbftoopuyophiebamwy-auth-token', JSON.stringify(session))
      const key = Object.keys(localStorage).find((key) => /^sys-v.*-user$/.test(key))
      if (key) {
        const user = JSON.parse(localStorage.getItem(key) || '{}')
        localStorage.setItem(
          key,
          JSON.stringify({
            ...user,
            info: userInfo,
            accessToken: session.access_token,
            refreshToken: session.refresh_token
          })
        )
      }
    },
    { session, persistedLocalStorage, userInfo }
  )
})

for (const reference of [
  { path: '/mdm/governance/document-type', title: '单据类型' },
  { path: '/system/user', title: '用户管理' }
]) {
  test(`标星参考页面 ${reference.title} 视觉基线`, async ({ page }, info) => {
    await page.goto(`#${reference.path}`)
    await expect(page.getByRole('heading', { name: reference.title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(page.locator('.art-table-query')).toBeVisible()
    await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })
    await expect(page.locator('.art-table-query .el-table__body tr').first()).toBeVisible({
      timeout: 60_000
    })
    const tip = page.getByRole('button', { name: '知道了', exact: true })
    if (await tip.isVisible()) await tip.click()
    await page.screenshot({ path: info.outputPath('approved-reference.png') })
  })
}

for (const payable of [
  { kind: 'estimated', path: 'estimated-payable', title: '暂估应付单' },
  { kind: 'financial', path: 'purchase-payable', title: '财务应付单' }
]) {
  test(`真实${payable.title}来源明细读取`, async ({ page }, info) => {
    const result = await client.rpc('fms_purchase_payable_list_secure', {
      p_kind: payable.kind,
      p_limit: 20,
      p_offset: 0,
      p_keyword: '',
      p_id: null
    })
    expect(result.error).toBeNull()
    const records = result.data.data as Array<{
      document_no: string
      source_document_no: string
      lines: Array<{ material_description: string | null }>
    }>
    expect(records.length).toBeGreaterThan(0)
    await page.goto(`#/fms/settlement/${payable.path}`)
    await expect(page.getByRole('heading', { name: payable.title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    if (info.project.name.includes('dark')) {
      if (!(await page.locator('html').evaluate((element) => element.classList.contains('dark'))))
        await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
      await expect(page.locator('html')).toHaveClass(/dark/)
    }
    const qaRecords = records.filter((record) =>
      ['CGRK202610-002', 'CGRK202610-003'].includes(record.source_document_no)
    )
    expect(qaRecords).toHaveLength(2)
    for (const [index, record] of qaRecords.entries()) {
      const row = page.locator('.art-table-query .el-table__body tr').filter({
        hasText: record.document_no
      })
      await expect(row).toBeVisible({ timeout: 60_000 })
      await row.getByRole('button', { name: '查看', exact: true }).click()
      const drawer = page.locator('.el-drawer:visible')
      await expect(drawer).toContainText(record.source_document_no)
      await expect(drawer.locator('.el-table__body tr')).toHaveCount(record.lines.length)
      if (info.project.name.includes('mobile') && index === 0) {
        const descriptionCell = drawer.locator('.el-table__body tr td').nth(2)
        await descriptionCell.scrollIntoViewIfNeeded()
        await page.mouse.move(0, 0)
        await descriptionCell.hover()
        const tooltip = page.locator('.el-popper[role="tooltip"]:not(.el-popover):visible')
        await expect(tooltip).toBeVisible()
        await expect
          .poll(async () => {
            const box = await tooltip.boundingBox()
            return !!box && box.x >= 0 && box.x + box.width <= page.viewportSize()!.width
          })
          .toBe(true)
        await tooltip.screenshot({
          path: info.outputPath('payable-mobile-description-tooltip.png')
        })
        await page.mouse.move(0, 0)
      }
      await page.screenshot({ path: info.outputPath(`payable-live-detail-${index + 1}.png`) })
      await drawer.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
        element.scrollLeft = element.scrollWidth
      })
      await page.mouse.move(0, 0)
      await page.screenshot({ path: info.outputPath(`payable-live-values-${index + 1}.png`) })
      await page.keyboard.press('Escape')
      await expect(drawer).not.toBeVisible()
    }
  })
}

test('两张真实采购来源生成每类两张应付并验收详情', async ({ page }, info) => {
  test.skip(process.env.E2E_CREATE_PAYABLE_FIXTURES !== 'true', '显式开启真实验收数据创建')
  test.setTimeout(300_000)
  const template = await client
    .from('wms_purchase_document')
    .select('*')
    .eq('kind', 'purchase_inbound')
    .eq('status', 'approved')
    .limit(1)
    .single()
  expect(template.error).toBeNull()
  const sourceLines = await client
    .from('wms_purchase_document_line')
    .select('*')
    .eq('document_id', template.data.id)
  expect(sourceLines.error).toBeNull()
  const materials = await client
    .from('mdm_material')
    .select('id,serial_management_enabled')
    .in(
      'id',
      sourceLines.data!.map((line) => line.material_id)
    )
  expect(materials.error).toBeNull()
  const line = sourceLines.data!.find((row) =>
    materials.data!.some(
      (material) => material.id === row.material_id && !material.serial_management_enabled
    )
  )
  expect(line).toBeTruthy()
  const stamp = Date.now()
  const generated: Array<{ kind: string; document_no: string; source_document_no: string }> = []
  for (const number of [1, 2]) {
    const payload = {
      ...template.data,
      id: undefined,
      business_date: new Date().toISOString().slice(0, 10),
      remark: `QA 应付页面完整验收 ${stamp}-${number}；数量 1；保留验收草稿来源`,
      lines: [
        {
          ...line,
          quantity: 1,
          project_id: null,
          construction_no: null,
          source_order_target_line_id: null,
          source_batch_id: null,
          source_document: null,
          source_line_no: null,
          serial_nos: [],
          batch_no: `QA-PAYABLE-${stamp}-${number}`
        }
      ]
    }
    const saved = await client.rpc('wms_save_purchase_document_secure', { p_payload: payload })
    expect(saved.error).toBeNull()
    for (const action of ['submit', 'approve']) {
      const result = await client.rpc('wms_change_purchase_document_status_secure', {
        p_document_id: saved.data,
        p_action: action
      })
      expect(result.error).toBeNull()
    }
    for (const kind of ['estimated', 'financial']) {
      const pushed = await client.rpc('wms_push_purchase_payables_secure', {
        p_kind: kind,
        p_selections: [{ document_id: saved.data, line_ids: null }]
      })
      expect(pushed.error).toBeNull()
      expect(pushed.data).toHaveLength(1)
      generated.push({ kind, ...pushed.data[0] })
    }
  }
  for (const payable of [
    { kind: 'estimated', path: 'estimated-payable', title: '暂估应付单' },
    { kind: 'financial', path: 'purchase-payable', title: '财务应付单' }
  ]) {
    await page.goto(`#/fms/settlement/${payable.path}`)
    await expect(page.getByRole('heading', { name: payable.title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    const records = generated.filter((record) => record.kind === payable.kind)
    expect(records).toHaveLength(2)
    for (const [index, record] of records.entries()) {
      const row = page
        .locator('.art-table-query .el-table__body tr')
        .filter({ hasText: record.document_no })
      await expect(row).toBeVisible({ timeout: 60_000 })
      await row.getByRole('button', { name: '查看', exact: true }).click()
      const drawer = page.locator('.el-drawer:visible')
      await expect(drawer).toContainText(record.source_document_no)
      await expect(drawer.locator('.el-table__body tr')).toHaveCount(1)
      await page.screenshot({ path: info.outputPath(`payable-${payable.kind}-${index + 1}.png`) })
      await page.keyboard.press('Escape')
    }
  }
})

test('两组真实销售出退库下推普通及专用红字发票', async ({ page }, info) => {
  test.skip(process.env.E2E_CREATE_SALES_CYCLE !== 'true', '显式开启两组真实销售闭环验收')
  test.setTimeout(420_000)
  page.setDefaultTimeout(30_000)
  const resume = process.env.E2E_RESUME_SALES_CYCLE === 'true'
  expect(
    !existsSync('.artifacts/wms-sales-cycle-created.json') || resume,
    '已有验收来源时必须显式续验，禁止重复造数'
  ).toBe(true)
  const batch = await client
    .from('wms_inventory_batch')
    .select('*')
    .eq('id', 'afe16e97-8462-4d7f-805d-6fe8430b4c18')
    .single()
  expect(batch.error).toBeNull()
  expect(Number(batch.data!.quantity)).toBeGreaterThanOrEqual(2)
  const templates = await client
    .from('wms_sales_document')
    .select('*')
    .eq('tenant_id', batch.data!.tenant_id)
    .eq('status', 'approved')
    .in('kind', ['outbound', 'return'])
  expect(templates.error).toBeNull()
  const outbound = templates.data!.find((row) => row.kind === 'outbound')!
  const returned = templates.data!.find((row) => row.kind === 'return')!
  expect(outbound).toBeTruthy()
  expect(returned).toBeTruthy()
  const templateLine = await client
    .from('wms_sales_document_line')
    .select('*')
    .eq('document_id', outbound.id)
    .order('line_no')
    .limit(1)
    .single()
  expect(templateLine.error).toBeNull()
  const choices = await client.rpc('wms_sales_choices_secure', {
    p_kind: 'stock',
    p_tenant_id: batch.data!.tenant_id,
    p_organization_id: batch.data!.organization_id,
    p_warehouse_id: batch.data!.warehouse_id,
    p_keyword: null,
    p_limit: 200,
    p_offset: 0,
    p_exclude_document_id: null
  })
  expect(choices.error).toBeNull()
  const stock = (choices.data.data as Array<{ id: string; line: Record<string, unknown> }>).find(
    (choice) => choice.id === batch.data!.id
  )
  expect(stock).toBeTruthy()
  const stamp = Date.now()
  const groups: Array<{ id: string; document_no: string; kind: 'outbound' | 'return' }> = resume
    ? JSON.parse(readFileSync('.artifacts/wms-sales-cycle-created.json', 'utf8'))
    : []
  if (!resume)
    writeFileSync(
      '.artifacts/wms-sales-cycle-before.json',
      JSON.stringify({ stamp, batch: batch.data, templates: templates.data }, null, 2)
    )
  const line = {
    ...templateLine.data,
    ...stock!.line,
    id: undefined,
    document_id: undefined,
    line_no: 10,
    quantity: 1,
    base_quantity: 1,
    base_unit_id: stock!.line.inventory_unit_id,
    source_document_id: null,
    source_line_id: null,
    source_document: null,
    source_line_no: null,
    unit_price: 10,
    tax_rate: 13,
    price_basis: 'untaxed',
    discount_method: 'none',
    unit_discount_rate: 0,
    gift: false,
    serial_nos: [],
    return_type: null
  }
  for (const sample of resume ? [] : [1, 2]) {
    const saved = await client.rpc('wms_save_sales_document_secure', {
      p_payload: {
        ...outbound,
        id: undefined,
        organization_id: batch.data!.organization_id,
        warehouse_id: batch.data!.warehouse_id,
        business_date: new Date().toISOString().slice(0, 10),
        remark: `QA 销售开票闭环 ${stamp}-${sample}；数量 1；保留验收来源`,
        lines: [line]
      }
    })
    expect(saved.error).toBeNull()
    const source = await client
      .from('wms_sales_document')
      .select('id,document_no,kind')
      .eq('id', saved.data)
      .single()
    expect(source.error).toBeNull()
    groups.push(source.data!)
    writeFileSync('.artifacts/wms-sales-cycle-created.json', JSON.stringify(groups, null, 2))
    for (const action of ['submit', 'approve']) {
      const status = await client.rpc('wms_change_sales_document_status_secure', {
        p_document_id: saved.data,
        p_action: action
      })
      expect(status.error).toBeNull()
    }
    const sourceLine = await client
      .from('wms_sales_document_line')
      .select('id')
      .eq('document_id', saved.data)
      .single()
    expect(sourceLine.error).toBeNull()
    const returnSaved = await client.rpc('wms_save_sales_document_secure', {
      p_payload: {
        ...returned,
        id: undefined,
        organization_id: batch.data!.organization_id,
        warehouse_id: batch.data!.warehouse_id,
        customer_id: outbound.customer_id,
        business_date: new Date().toISOString().slice(0, 10),
        remark: `QA 红字开票闭环 ${stamp}-${sample}；对应完整退回；保留验收来源`,
        lines: [
          {
            ...line,
            stock_batch_id: null,
            return_type: 'return',
            source_document_id: saved.data,
            source_line_id: sourceLine.data!.id
          }
        ]
      }
    })
    expect(returnSaved.error).toBeNull()
    const returnSource = await client
      .from('wms_sales_document')
      .select('id,document_no,kind')
      .eq('id', returnSaved.data)
      .single()
    expect(returnSource.error).toBeNull()
    groups.push(returnSource.data!)
    writeFileSync('.artifacts/wms-sales-cycle-created.json', JSON.stringify(groups, null, 2))
    for (const action of ['submit', 'approve']) {
      const status = await client.rpc('wms_change_sales_document_status_secure', {
        p_document_id: returnSaved.data,
        p_action: action
      })
      expect(status.error).toBeNull()
    }
  }
  const after = await client
    .from('wms_inventory_batch')
    .select('quantity')
    .eq('id', batch.data!.id)
    .single()
  expect(after.error).toBeNull()
  expect(Number(after.data!.quantity)).toBe(Number(batch.data!.quantity))
  expect(groups).toHaveLength(4)
  for (const target of [
    { kind: 'outbound', path: 'sales-outbound', label: '普通发票', invoiceType: 'ordinary' },
    { kind: 'return', path: 'sales-return', label: '专用发票', invoiceType: 'special' }
  ]) {
    await page.goto(`#/wms/outbound-business/${target.path}`)
    await expect(page.locator('.art-table-query')).toBeVisible({ timeout: 60_000 })
    if (info.project.name.includes('dark')) {
      if (!(await page.locator('html').evaluate((element) => element.classList.contains('dark'))))
        await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
      await expect(page.locator('html')).toHaveClass(/dark/)
    }
    await page.locator('.el-radio-button').filter({ hasText: '按单据' }).click()
    const sources = groups.filter((row) => row.kind === target.kind)
    expect(sources).toHaveLength(2)
    const existing = await client
      .from('wms_sales_invoice')
      .select('id')
      .in(
        'source_document_id',
        sources.map((source) => source.id)
      )
    expect(existing.error).toBeNull()
    let ids: string[]
    if (existing.data!.length) {
      expect(resume, '已有发票只允许续验读取').toBe(true)
      expect(existing.data).toHaveLength(2)
      ids = existing.data!.map((invoice) => invoice.id)
      await page.goto('#/wms/outbound-business/sales-invoice')
    } else {
      for (const source of sources) {
        const row = page.locator('.art-table-query .el-table__body tr').filter({
          hasText: source.document_no
        })
        await expect(row).toBeVisible({ timeout: 60_000 })
        await row.locator('.el-checkbox').first().click()
      }
      await page.getByRole('button', { name: '下推', exact: true }).click()
      const pushed = page.waitForResponse(
        (response) =>
          response.url().includes('/rpc/wms_push_sales_invoice_secure') &&
          response.request().method() === 'POST',
        { timeout: 60_000 }
      )
      await page.getByRole('menuitem', { name: target.label, exact: true }).click()
      const response = await pushed
      expect(response.ok()).toBe(true)
      ids = (await response.json()) as string[]
      await expect(page).toHaveURL(/sales-invoice/, { timeout: 60_000 })
      const automaticDrawer = page.locator('.el-drawer:visible')
      await expect(automaticDrawer.locator('.el-table__body tr')).toHaveCount(1, {
        timeout: 60_000
      })
      await page.keyboard.press('Escape')
      await expect(automaticDrawer).not.toBeVisible()
    }
    expect(ids).toHaveLength(2)
    await expect(page).toHaveURL(/sales-invoice/, { timeout: 60_000 })
    const invoices = await client
      .from('wms_sales_invoice')
      .select('id,document_no,invoice_type,red_letter,source_document_id,issue_date,remark')
      .in('id', ids)
    expect(invoices.error).toBeNull()
    expect(invoices.data).toHaveLength(2)
    for (const [index, invoice] of invoices.data!.entries()) {
      expect(invoice.invoice_type).toBe(target.invoiceType)
      expect(invoice.red_letter).toBe(target.kind === 'return')
      const row = page.locator('.art-table-query .el-table__body tr').filter({
        hasText: invoice.document_no
      })
      await expect(row).toBeVisible({ timeout: 60_000 })
      await row.getByRole('button', { name: '查看', exact: true }).click()
      const drawer = page.locator('.el-drawer:visible')
      await expect(drawer.locator('.el-table__body tr')).toHaveCount(1, { timeout: 60_000 })
      await expect(drawer).toContainText(
        sources.find((source) => source.id === invoice.source_document_id)!.document_no
      )
      await page.screenshot({ path: info.outputPath(`generated-${target.kind}-${index + 1}.png`) })
      await drawer.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
        element.scrollLeft = element.scrollWidth
      })
      await page.screenshot({
        path: info.outputPath(`generated-values-${target.kind}-${index + 1}.png`)
      })
      await page.keyboard.press('Escape')
      await expect(drawer).not.toBeVisible()
      await row.getByRole('button', { name: '编辑', exact: true }).click()
      await expect(drawer.getByRole('textbox', { name: '备注', exact: true })).toHaveValue(
        invoice.remark || ''
      )
      const saved = page.waitForResponse(
        (response) =>
          response.url().includes('/rpc/wms_edit_sales_invoice_secure') &&
          response.request().method() === 'POST',
        { timeout: 60_000 }
      )
      await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
      expect((await saved).ok()).toBe(true)
      await expect(drawer).not.toBeVisible()
      const reread = await client
        .from('wms_sales_invoice')
        .select('issue_date,remark')
        .eq('id', invoice.id)
        .single()
      expect(reread.error).toBeNull()
      expect(reread.data).toEqual({ issue_date: invoice.issue_date, remark: invoice.remark })
    }
  }
})

test('真实两条库存类型核算配置修改保存与恢复', async ({ page }, info) => {
  test.skip(process.env.E2E_EDIT_STOCK_ACCOUNTING !== 'true', '显式开启可恢复的字典配置验收')
  test.skip(userInfo.platformSuper !== true, '全局字典配置仅平台超级管理员可维护')
  const type = await client
    .from('sys_dict_type')
    .select('id')
    .eq('code', 'wmsInitialStockType')
    .single()
  expect(type.error).toBeNull()
  const dictionary = await client
    .from('sys_dictionary')
    .select('id,label,participates_inventory_accounting')
    .eq('type_id', type.data!.id)
    .in('value', ['normal', 'gift'])
  expect(dictionary.error).toBeNull()
  expect(dictionary.data).toHaveLength(2)
  await page.goto(`#/data-center/dict?dictTypeId=${type.data!.id}`)
  for (const record of dictionary.data!) {
    let dirty = false
    try {
      const row = page
        .locator('.art-table-query .el-table__body tr')
        .filter({ hasText: record.label })
      await expect(row).toBeVisible({ timeout: 60_000 })
      for (const changed of [true, false]) {
        await row.getByRole('button', { name: /编辑/ }).click()
        const dialog = page.getByRole('dialog', { name: '编辑字典', exact: true })
        await expect(dialog.getByRole('combobox', { name: '上级字典项', exact: true })).toBeEnabled(
          {
            timeout: 60_000
          }
        )
        const control = dialog.getByRole('switch', { name: /参与存货核算/ })
        await expect(control).toHaveAttribute(
          'aria-checked',
          String(
            changed
              ? record.participates_inventory_accounting
              : !record.participates_inventory_accounting
          )
        )
        dirty = true
        await control.locator('..').click()
        await dialog.getByRole('button', { name: '保存更改', exact: true }).click()
        await expect(dialog).not.toBeVisible()
        const read = await client
          .from('sys_dictionary')
          .select('participates_inventory_accounting')
          .eq('id', record.id)
          .single()
        expect(read.error).toBeNull()
        expect(read.data!.participates_inventory_accounting).toBe(
          changed
            ? !record.participates_inventory_accounting
            : record.participates_inventory_accounting
        )
        if (!changed) dirty = false
      }
      await page.screenshot({
        path: info.outputPath(`stock-accounting-${record.label}-restored.png`)
      })
    } finally {
      if (dirty) {
        const restored = await client
          .from('sys_dictionary')
          .update({ participates_inventory_accounting: record.participates_inventory_accounting })
          .eq('id', record.id)
        expect(restored.error, '恢复原核算开关').toBeNull()
      }
    }
  }
})

test('真实两张 QA 采购入库批量打印', async ({ page }, info) => {
  await page.goto('#/wms/inbound-business/purchase-inbound')
  const numbers = ['CGRK202610-002', 'CGRK202610-003']
  for (const number of numbers) {
    const row = page.locator('.art-table-query .el-table__body tr').filter({ hasText: number })
    await expect(row).toBeVisible({ timeout: 60_000 })
    await row.locator('.el-checkbox').first().click()
  }
  await page.evaluate(() => {
    window.print = () => {}
  })
  await page.getByRole('button', { name: '批量打印', exact: true }).click()
  const sheets = page.locator('.wms-purchase-print-sheet')
  await expect(sheets).toHaveCount(2)
  for (const number of numbers) {
    const sheet = sheets.filter({ hasText: number })
    await expect(sheet).toHaveCount(1)
    await expect(sheet.locator('tbody tr')).toHaveCount(2)
  }
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(() => document.body.classList.add('is-wms-purchase-printing'))
  await page.pdf({
    path: info.outputPath('purchase-batch-print.pdf'),
    format: 'A4',
    printBackground: true
  })
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => document.body.classList.remove('is-wms-purchase-printing'))
})

test('真实其他出库及退回两张单据批量打印', async ({ page }, info) => {
  const documents = await client
    .from('wms_sales_document')
    .select('id,document_no,kind')
    .in('kind', ['other_outbound', 'other_return'])
    .limit(2)
  expect(documents.error).toBeNull()
  expect(documents.data).toHaveLength(2)
  await page.goto('#/wms/outbound-business/other-outbound')
  for (const record of documents.data!) {
    const row = page
      .locator('.art-table-query .el-table__body tr')
      .filter({ hasText: record.document_no })
    await expect(row).toBeVisible({ timeout: 60_000 })
    await row.locator('.el-checkbox').first().click()
  }
  await page.evaluate(() => {
    window.print = () => {}
  })
  await page.getByRole('button', { name: '批量打印', exact: true }).click()
  const sheets = page.locator('.wms-sales-print-sheet')
  await expect(sheets).toHaveCount(2)
  for (const record of documents.data!) {
    const sheet = sheets.filter({ hasText: record.document_no })
    await expect(sheet).toHaveCount(1)
    expect(await sheet.locator('tbody tr').count()).toBeGreaterThan(1)
    if (record.kind === 'other_return')
      await expect(sheet.locator('.negative').first()).toContainText('¥')
  }
  await page.emulateMedia({ media: 'print' })
  await page.evaluate(() => document.body.classList.add('is-wms-sales-printing'))
  for (const [index, sheet] of (await sheets.all()).entries()) {
    await sheet.screenshot({ path: info.outputPath(`other-batch-print-${index + 1}.png`) })
  }
  await page.pdf({
    path: info.outputPath('other-batch-print.pdf'),
    format: 'A4',
    printBackground: true
  })
  await page.emulateMedia({ media: 'screen' })
  await page.evaluate(() => document.body.classList.remove('is-wms-sales-printing'))
})

test('真实销售发票两条记录详情与保存闭环', async ({ page }, info) => {
  const { data: invoices, error } = await client
    .from('wms_sales_invoice')
    .select('id,document_no,issue_date,remark,red_letter')
    .order('created_at', { ascending: false })
    .limit(2)
  expect(error).toBeNull()
  expect(invoices).toHaveLength(2)
  await page.goto('#/wms/outbound-business/sales-invoice')
  if (info.project.name.includes('dark')) {
    await expect(page.getByRole('heading', { name: '销售发票草稿', exact: true })).toBeVisible({
      timeout: 60_000
    })
    if (!(await page.locator('html').evaluate((element) => element.classList.contains('dark')))) {
      await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
    }
    await expect(page.locator('html')).toHaveClass(/dark/)
  }
  for (const invoice of invoices!) {
    const row = page.locator('.art-table-query .el-table__body tr').filter({
      hasText: invoice.document_no
    })
    await expect(row).toBeVisible({ timeout: 60_000 })
    await row.getByRole('button', { name: /查看/ }).click()
    const drawer = page.locator('.el-drawer:visible')
    await expect(drawer.getByText('来源明细', { exact: true })).toBeVisible()
    await expect(
      drawer.getByText(invoice.red_letter ? '专用发票' : '普通发票', { exact: true })
    ).toBeVisible()
    expect(await drawer.locator('.el-table__body tr').count()).toBeGreaterThan(0)
    if (invoice.red_letter) {
      await expect(drawer.locator('.sales-invoice-negative').first()).toBeVisible()
    }
    await page.screenshot({
      path: info.outputPath(`invoice-${invoice.red_letter ? 'red' : 'ordinary'}-detail.png`),
      animations: 'disabled'
    })
    await drawer.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await page.mouse.move(0, 0)
    await page.screenshot({
      path: info.outputPath(`invoice-${invoice.red_letter ? 'red' : 'ordinary'}-values.png`),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')
    await row.getByRole('button', { name: /编辑/ }).click()
    await expect(drawer.getByRole('textbox', { name: '备注', exact: true })).toHaveValue(
      invoice.remark || ''
    )
    await page.screenshot({
      path: info.outputPath(`invoice-${invoice.red_letter ? 'red' : 'ordinary'}-edit.png`),
      animations: 'disabled'
    })
    const saved = page.waitForResponse(
      (response) =>
        response.url().includes('/rpc/wms_edit_sales_invoice_secure') &&
        response.request().method() === 'POST',
      { timeout: 30_000 }
    )
    await drawer.getByRole('button', { name: '保存草稿', exact: true }).click()
    expect((await saved).ok()).toBe(true)
    await expect(drawer).not.toBeVisible()
    const result = await client
      .from('wms_sales_invoice')
      .select('issue_date,remark')
      .eq('id', invoice.id)
      .single()
    expect(result.error).toBeNull()
    expect(result.data).toEqual({ issue_date: invoice.issue_date, remark: invoice.remark })
  }
})

test('两张独立转固资产真实生命周期', async ({ page }, info) => {
  test.skip(process.env.E2E_CREATE_ASSET_CYCLE !== 'true', '显式开启两张真实资产验收')
  test.setTimeout(360_000)
  page.setDefaultTimeout(30_000)
  const manifest = '.artifacts/wms-asset-cycle-created.json'
  const resume = process.env.E2E_RESUME_ASSET_CYCLE === 'true'
  expect(!existsSync(manifest) || resume, '已有验收来源必须显式续验，禁止重复造数').toBe(true)
  let sourceId: string
  if (resume) {
    sourceId = (JSON.parse(readFileSync(manifest, 'utf8')) as { sourceId: string }).sourceId
  } else {
    const batch = await client
      .from('wms_inventory_batch')
      .select('*')
      .eq('id', 'afe16e97-8462-4d7f-805d-6fe8430b4c18')
      .single()
    expect(batch.error).toBeNull()
    const header = await client
      .from('wms_sales_document')
      .select('*')
      .eq('tenant_id', batch.data!.tenant_id)
      .eq('kind', 'other_outbound')
      .eq('status', 'approved')
      .limit(1)
      .single()
    expect(header.error).toBeNull()
    const choices = await client.rpc('wms_sales_choices_secure', {
      p_kind: 'other_stock',
      p_tenant_id: batch.data!.tenant_id,
      p_organization_id: batch.data!.organization_id,
      p_warehouse_id: batch.data!.warehouse_id,
      p_keyword: null,
      p_limit: 200,
      p_offset: 0,
      p_exclude_document_id: null
    })
    expect(choices.error).toBeNull()
    const stock = (choices.data.data as Array<{ id: string; line: Record<string, unknown> }>).find(
      (row) => row.id === batch.data!.id
    )
    expect(stock).toBeTruthy()
    writeFileSync(
      '.artifacts/wms-asset-cycle-before.json',
      JSON.stringify({ batch: batch.data, header: header.data }, null, 2)
    )
    const line = {
      ...stock!.line,
      quantity: 1,
      base_quantity: 1,
      base_unit_id: stock!.line.inventory_unit_id,
      unit_price: 10,
      tax_rate: 13,
      price_basis: 'untaxed',
      discount_method: 'none',
      unit_discount_rate: 0,
      gift: false,
      source_document_id: null,
      source_line_id: null,
      serial_nos: []
    }
    const saved = await client.rpc('wms_save_sales_document_secure', {
      p_payload: {
        ...header.data,
        id: undefined,
        organization_id: batch.data!.organization_id,
        warehouse_id: batch.data!.warehouse_id,
        business_date: new Date().toISOString().slice(0, 10),
        remark: `QA 两条独立采购转固验收 ${Date.now()}；每行数量 1，未税 10；保留来源`,
        lines: [
          { ...line, line_no: 10 },
          { ...line, line_no: 20 }
        ]
      }
    })
    expect(saved.error).toBeNull()
    sourceId = saved.data as string
    writeFileSync(manifest, JSON.stringify({ sourceId }, null, 2))
  }
  const source = await client
    .from('wms_sales_document')
    .select('document_no,status')
    .eq('id', sourceId)
    .single()
  expect(source.error).toBeNull()
  for (const action of source.data!.status === 'draft'
    ? ['submit', 'approve']
    : source.data!.status === 'submitted'
      ? ['approve']
      : []) {
    const result = await client.rpc('wms_change_sales_document_status_secure', {
      p_document_id: sourceId,
      p_action: action
    })
    expect(result.error).toBeNull()
  }
  let links = await client
    .from('wms_other_asset_source')
    .select('asset_id')
    .eq('source_document_id', sourceId)
  expect(links.error).toBeNull()
  if (!links.data!.length) {
    await page.goto('#/wms/outbound-business/other-outbound')
    const row = page
      .locator('.art-table-query .el-table__body tr')
      .filter({ hasText: source.data!.document_no })
    await expect(row).toBeVisible({ timeout: 60_000 })
    await row.locator('.el-checkbox').first().click()
    await page.getByRole('button', { name: '下推', exact: true }).click()
    await page.getByRole('menuitem', { name: '采购转固', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '采购转固', exact: true })
    await expect(dialog.getByRole('combobox', { name: /账套/ })).toBeEnabled()
    await dialog.getByRole('combobox', { name: /资产类别/ }).click()
    await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').first().click()
    const pushed = page.waitForResponse(
      (response) =>
        response.url().endsWith('/rpc/wms_push_other_asset_secure') &&
        response.request().method() === 'POST'
    )
    await dialog.getByRole('button', { name: '生成资产草稿', exact: true }).click()
    expect((await pushed).ok()).toBe(true)
    await expect(dialog).not.toBeVisible()
    links = await client
      .from('wms_other_asset_source')
      .select('asset_id')
      .eq('source_document_id', sourceId)
    expect(links.error).toBeNull()
  }
  expect(links.data).toHaveLength(2)
  const assets: Array<{
    id: string
    assetNo: string
    status: string
    originalValue: number
    sourceId: string
  }> = []
  for (const link of links.data!) {
    const record = await client.rpc('fms_get_fixed_asset_secure', { p_asset_id: link.asset_id })
    expect(record.error).toBeNull()
    assets.push(keysToCamelDeep(record.data) as (typeof assets)[number])
  }
  expect(assets).toHaveLength(2)
  writeFileSync(manifest, JSON.stringify({ sourceId, assets }, null, 2))
  await page.goto('#/fms/specialized-accounting/fixed-asset')
  await expect(page.getByRole('heading', { name: '固定资产', exact: true })).toBeVisible({
    timeout: 60_000
  })
  if (info.project.name.includes('dark')) {
    if (!(await page.locator('html').evaluate((element) => element.classList.contains('dark'))))
      await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  }
  for (const [index, asset] of assets.entries()) {
    expect(Number(asset.originalValue)).toBe(10)
    expect(asset.sourceId).toBe(sourceId)
    const row = page
      .locator('.art-table-query .el-table__body tr')
      .filter({ hasText: asset.assetNo })
    await expect(row).toBeVisible({ timeout: 60_000 })
    for (const step of [
      { action: 'activate', label: '确认转固', from: 'draft', to: 'active' },
      { action: 'suspend', label: '暂停折旧', from: 'active', to: 'suspended' },
      { action: 'resume', label: '恢复使用', from: 'suspended', to: 'active' }
    ]) {
      const current = await client.rpc('fms_get_fixed_asset_secure', { p_asset_id: asset.id })
      expect(current.error).toBeNull()
      if (step.action === 'activate' && current.data!.status !== 'draft') continue
      if (step.action === 'suspend' && current.data!.status === 'suspended') continue
      expect(current.data!.status).toBe(step.from)
      await row.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: step.label, exact: true }).click()
      const confirmation = page.locator('.el-message-box:visible')
      const response = page.waitForResponse(
        (result) =>
          result.url().endsWith('/rpc/act_fms_fixed_asset_secure') &&
          result.request().method() === 'POST'
      )
      await confirmation.getByRole('button', { name: step.label, exact: true }).click()
      expect((await response).ok()).toBe(true)
      await expect
        .poll(async () => {
          const record = await client.rpc('fms_get_fixed_asset_secure', { p_asset_id: asset.id })
          expect(record.error).toBeNull()
          return record.data!.status
        })
        .toBe(step.to)
      await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0)
      await expect(row).toBeVisible({ timeout: 60_000 })
      await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
      await page.screenshot({ path: info.outputPath(`asset-${index + 1}-${step.action}.png`) })
    }
  }
})

test('真实采购转固账套和类别参选', async ({ page }, info) => {
  page.setDefaultTimeout(30_000)
  const { data: document, error } = await client
    .from('wms_sales_document')
    .select('document_no')
    .eq('kind', 'other_outbound')
    .eq('status', 'approved')
    .limit(1)
    .single()
  expect(error).toBeNull()
  await page.goto('#/wms/outbound-business/other-outbound')
  const row = page.locator('.art-table-query .el-table__body tr').filter({
    hasText: document!.document_no
  })
  await expect(row).toBeVisible({ timeout: 60_000 })
  if (info.project.name.includes('dark')) {
    if (!(await page.locator('html').evaluate((element) => element.classList.contains('dark'))))
      await page.getByRole('button', { name: '切换深色模式', exact: true }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  }
  await row.locator('.el-checkbox').first().click()
  await page.getByRole('button', { name: '下推', exact: true }).click()
  await page.getByRole('menuitem', { name: '采购转固', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '采购转固', exact: true })
  await expect(dialog).toBeVisible()
  const account = dialog.getByRole('combobox', { name: /账套/ })
  await expect(account).toBeEnabled({ timeout: 30_000 })
  await dialog.getByRole('combobox', { name: /资产类别/ }).click()
  const option = page.locator('.el-select-dropdown:visible .el-select-dropdown__item').first()
  await expect(option).toBeVisible()
  await option.click()
  await expect(dialog.getByRole('button', { name: '生成资产草稿', exact: true })).toBeEnabled()
  for (const field of ['账套', '资产类别', '取得日期']) {
    const box = await dialog.getByLabel(new RegExp(field)).boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  }
  await page.screenshot({ path: info.outputPath('asset-capitalization-live.png') })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).not.toBeVisible()
})

test('真实 Data API 单据关联及全部选单来源', async () => {
  const source = readFileSync('modules/art-supabase-wms/src/api/initial-sales.ts', 'utf8')
  const select = source.match(/const documentSelect = `([\s\S]*?)`/)?.[1]
  expect(select).toBeTruthy()
  const { data: documents, error } = await client
    .from('wms_sales_document')
    .select(select!)
    .limit(12)
  expect(error, '销售单据完整关系查询').toBeNull()
  expect(documents?.length).toBeGreaterThan(0)
  const { data: warehouses, error: warehouseError } = await client
    .from('mdm_warehouse')
    .select('id,tenant_id,organization_id')
    .eq('status', 'enabled')
    .limit(1)
  expect(warehouseError).toBeNull()
  expect(warehouses?.length).toBe(1)
  const warehouse = warehouses![0]
  for (const kind of [
    'stock',
    'other_stock',
    'request_stock',
    'sales_order',
    'shipping_notice',
    'outbound',
    'return_request',
    'issue_request',
    'other_outbound'
  ]) {
    const result = await client.rpc('wms_sales_choices_secure', {
      p_kind: kind,
      p_tenant_id: warehouse.tenant_id,
      p_organization_id: warehouse.organization_id,
      p_warehouse_id: warehouse.id,
      p_keyword: null,
      p_limit: 10,
      p_offset: 0,
      p_exclude_document_id: null
    })
    expect(result.error, `真实选单 ${kind}`).toBeNull()
    expect(result.data).toHaveProperty('data')
    expect(result.data).toHaveProperty('total')
  }
})

for (const item of [
  { path: 'sales-outbound', title: '销售出库单', source: '销售订单' },
  { path: 'sales-return', title: '销售退货单', source: '销售出库单' },
  { path: 'other-outbound', title: '其他出库单', source: '出库申请单' },
  { path: 'outbound-request', title: '出库申请单', source: '' },
  { path: 'sales-invoice', title: '销售发票草稿', source: '' }
]) {
  test(`真实页面 ${item.title} 读取及新增参选`, async ({ page }, info) => {
    test.setTimeout(120_000)
    const failures: string[] = []
    page.on('response', (response) => {
      if (response.url().includes('/rest/v1/') && response.status() >= 400)
        failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
    })
    await page.goto(`#/wms/outbound-business/${item.path}`)
    const table = page.locator('.art-table-query')
    await expect(table).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })
    const view = table.getByRole('button', { name: /查看/ }).first()
    if (['sales-outbound', 'sales-return', 'other-outbound'].includes(item.path)) {
      await expect(view).toBeVisible({ timeout: 90_000 })
    }
    if (await view.isVisible()) {
      await view.click()
      await expect(page.locator('.el-drawer:visible')).toBeVisible()
      await expect(page.locator('.el-drawer:visible .el-table')).toBeVisible({ timeout: 30_000 })
      await expect(page.getByText('正在加载单据资料…', { exact: true })).not.toBeVisible({
        timeout: 60_000
      })
      await expect(page.locator('.el-drawer:visible .el-table__body tr').first()).toBeVisible({
        timeout: 60_000
      })
      await expect(page.getByText('销售单据加载失败，请重试', { exact: true })).toHaveCount(0)
      await page.screenshot({ path: info.outputPath(`${item.path}-live-detail.png`) })
      await page.keyboard.press('Escape')
      await expect(page.locator('.el-drawer:visible')).toHaveCount(0)
    }
    if (item.path !== 'sales-invoice') {
      await page.getByRole('button', { name: `新增${item.title}`, exact: true }).click()
      const drawer = page.locator('.el-drawer:visible')
      await expect(drawer).toBeVisible()
      if (item.path === 'sales-outbound') {
        await drawer.getByRole('combobox', { name: /仓库号/ }).click()
        await page.locator('.el-select-dropdown:visible .el-select-dropdown__item').first().click()
      }
      if (item.source) {
        await drawer.getByRole('button', { name: '选单', exact: true }).click()
        await page.getByText(item.source, { exact: true }).last().click()
        const picker = page.getByRole('dialog', { name: '选择来源明细', exact: true })
        await expect(picker).toBeVisible()
        await expect(picker.getByRole('button', { name: '确定', exact: true })).toBeEnabled({
          timeout: 30_000
        })
        await page.screenshot({ path: info.outputPath(`${item.path}-live-sources.png`) })
        await picker.getByRole('button', { name: '取消', exact: true }).click()
      }
      if (item.path === 'sales-return') {
        await drawer.getByRole('button', { name: '添加物料', exact: true }).click()
        const materials = page.getByRole('dialog', { name: '选择销售物料', exact: true })
        await expect(materials.locator('.el-table__body tr').first()).toBeVisible()
        await materials.locator('.el-table__header .el-checkbox').first().click()
        await materials.getByRole('button', { name: '确定', exact: true }).click()
        const lines = drawer.locator('.wms-editable-line-table')
        const count = await lines.locator('.el-table__body tr').count()
        expect(count).toBeGreaterThan(1)
        const operation = lines.getByRole('columnheader', { name: '操作', exact: true })
        await expect
          .poll(async () => (await operation.boundingBox())?.width || 0)
          .toBeLessThanOrEqual(150)
        const width = (await operation.boundingBox())!.width
        for (let remaining = count; remaining > 1; remaining--) {
          await lines.getByRole('button', { name: '更多操作', exact: true }).first().click()
          await page.getByRole('menuitem', { name: '删除明细', exact: true }).click()
          await expect(lines.locator('.el-table__body tr')).toHaveCount(remaining - 1)
          await expect
            .poll(async () => (await operation.boundingBox())?.width || 0)
            .toBeLessThanOrEqual(width + 1)
        }
        await page.screenshot({ path: info.outputPath('sales-return-live-deleted-lines.png') })
      }
      await drawer.getByRole('button', { name: '取消', exact: true }).click()
    }
    if (['sales-outbound', 'sales-return', 'other-outbound'].includes(item.path)) {
      await table.locator('.el-table__body .el-checkbox').first().click()
      await page.evaluate(() => {
        window.print = () => {}
      })
      await page.getByRole('button', { name: '批量打印', exact: true }).click()
      await expect(page.locator('.wms-sales-print-sheet')).toHaveCount(1, { timeout: 60_000 })
    }
    expect(failures, '真实页面 Data API 错误').toEqual([])
  })
}

for (const sample of [1, 2]) {
  test(`真实出库申请第${sample}张库存参选、暂存和删除闭环`, async ({ page }, info) => {
    test.setTimeout(180_000)
    let createdId: string | undefined
    try {
      const { data: profile } = await client
        .from('sys_user')
        .select('tenant_id')
        .eq('auth_user_id', session.user.id)
        .single()
      const { data: warehouses, error: warehouseError } = await client
        .from('mdm_warehouse')
        .select('id,tenant_id,organization_id,warehouse_code')
        .eq('tenant_id', profile.tenant_id)
        .eq('status', 'enabled')
        .contains('business_scopes', ['picking'])
      expect(warehouseError).toBeNull()
      let stocked: { warehouseCode: string; organizationId: string } | undefined
      for (const warehouse of warehouses || []) {
        const { data, error } = await client.rpc('wms_sales_choices_secure', {
          p_kind: 'request_stock',
          p_tenant_id: warehouse.tenant_id,
          p_organization_id: warehouse.organization_id,
          p_warehouse_id: warehouse.id,
          p_limit: 1
        })
        expect(error).toBeNull()
        if (data.total > 0) {
          stocked = {
            warehouseCode: warehouse.warehouse_code,
            organizationId: warehouse.organization_id
          }
          break
        }
      }
      expect(stocked, '测试租户有可参选库存的领料仓库').toBeTruthy()
      const { data: organization } = await client
        .from('mdm_organization')
        .select('organization_name')
        .eq('id', stocked!.organizationId)
        .single()
      await page.goto('#/wms/outbound-business/outbound-request')
      await page.getByRole('button', { name: '新增出库申请单', exact: true }).click()
      const drawer = page.locator('.el-drawer:visible')
      await drawer.getByRole('combobox', { name: /库存组织/ }).click()
      await page
        .locator('.el-select-dropdown:visible .el-select-dropdown__item')
        .filter({ hasText: organization.organization_name })
        .first()
        .click()
      await drawer.getByRole('combobox', { name: /仓库号/ }).click()
      await page
        .locator('.el-select-dropdown:visible .el-select-dropdown__item')
        .filter({ hasText: stocked!.warehouseCode })
        .click()
      await drawer.getByRole('button', { name: '添加物料', exact: true }).click()
      const picker = page.getByRole('dialog', { name: '选择出库库存', exact: true })
      await expect(picker.locator('.el-table__body tr').first()).toBeVisible()
      await picker.locator('.el-table__body .el-checkbox').first().click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      await expect(drawer.locator('.wms-editable-line-table .el-table__body tr')).toHaveCount(1)
      await expect(drawer.getByText('consumables_outbound', { exact: true })).toHaveCount(0)
      await expect(drawer.getByText('耗材出库', { exact: true })).toBeVisible()
      await page.screenshot({ path: info.outputPath(`request-${sample}-form.png`) })
      const lineTable = drawer.locator('.wms-editable-line-table')
      await lineTable.locator('.el-table__body tr').first().scrollIntoViewIfNeeded()
      await expect(lineTable.locator('.el-table__body tr').first()).toBeInViewport()
      await page.screenshot({ path: info.outputPath(`request-${sample}-lines.png`) })
      await lineTable.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
        element.scrollLeft = element.scrollWidth
      })
      await page.screenshot({ path: info.outputPath(`request-${sample}-lines-end.png`) })
      const response = page.waitForResponse(
        (response) =>
          response.url().includes('/rpc/wms_create_issue_request_secure') &&
          response.request().method() === 'POST'
      )
      await drawer.getByRole('button', { name: '保存', exact: true }).click()
      const saved = await response
      expect(saved.status()).toBe(200)
      createdId = await saved.json()
      expect(createdId).toMatch(/^[0-9a-f-]{36}$/)
      await expect(drawer).not.toBeVisible()
      const { data, error } = await client
        .from('wms_issue_request')
        .select('id,document_no,status,work_order_id')
        .eq('id', createdId)
        .single()
      expect(error).toBeNull()
      expect(data.status).toBe('draft')
      expect(data.work_order_id).toBeNull()
      expect(data.document_no).toMatch(/^CKSQ\d{6}-\d+$/)
      const row = page
        .locator('.art-table-query .el-table__body tr')
        .filter({ hasText: data.document_no })
      await expect(row).toBeVisible()
      await page.screenshot({ path: info.outputPath(`request-${sample}-saved.png`) })
      await row.getByRole('button', { name: '更多操作', exact: true }).click()
      await page.getByRole('menuitem', { name: '删除', exact: true }).click()
      await page
        .getByRole('dialog', { name: '删除确认', exact: true })
        .getByRole('button', { name: '删除', exact: true })
        .click()
      await expect(row).toHaveCount(0)
      createdId = undefined
    } finally {
      if (createdId) {
        const result = await client.rpc('wms_delete_issue_request_secure', {
          p_request_id: createdId
        })
        expect(result.error, '删除测试草稿').toBeNull()
      }
    }
  })
}
