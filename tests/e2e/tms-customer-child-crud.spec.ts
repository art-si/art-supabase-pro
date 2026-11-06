import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.describe.configure({ timeout: 120_000 })

test('客户联系人与财务子表可新增、复制和删除无引用记录', async ({ page }) => {
  const customerId = '11111111-1111-4111-8111-111111111112'
  const customer = {
    id: customerId,
    tenantId: '11111111-1111-4111-8111-111111111111',
    customerCode: 'KH-CHILD-CRUD',
    customerName: '客户子表操作验收',
    enabled: true,
    tags: [],
    fieldAccess: {
      contactPhone: 'edit',
      addressDetail: 'edit',
      taxNo: 'edit',
      bankAccount: 'edit'
    },
    isRecordOwner: true
  }
  const contacts = [
    {
      id: '11111111-1111-4111-8111-111111111121',
      customerId,
      name: '默认联系人',
      isDefault: true
    }
  ]
  const finances = [
    {
      id: '11111111-1111-4111-8111-111111111131',
      customerId,
      invoiceTitle: '默认开票主体',
      isDefaultInvoice: true
    }
  ]
  const calls: string[] = []
  let serial = 200

  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1) ?? ''
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>
    calls.push(name)
    let json: unknown = []
    if (name === 'tms_list_customers_secure')
      json = { records: [customer], total: 1, fieldAccess: customer.fieldAccess }
    else if (name === 'get_table_column_runtime') json = { enabled: false, profiles: [] }
    else if (name === 'tms_list_customer_contacts_secure') json = contacts
    else if (name === 'tms_list_customer_finances_secure') json = finances
    else if (name === 'tms_create_customer_contact_secure') {
      const payload = body.p_payload as Record<string, unknown>
      const id = `11111111-1111-4111-8111-${String(serial++).padStart(12, '0')}`
      contacts.push({
        id,
        customerId,
        name: String(payload.name),
        isDefault: Boolean(payload.is_default)
      })
      json = id
    } else if (name === 'tms_create_customer_finance_secure') {
      const payload = body.p_payload as Record<string, unknown>
      const id = `11111111-1111-4111-8111-${String(serial++).padStart(12, '0')}`
      finances.push({
        id,
        customerId,
        invoiceTitle: String(payload.invoice_title),
        isDefaultInvoice: Boolean(payload.is_default_invoice)
      })
      json = id
    } else if (name === 'tms_copy_customer_contact_secure') {
      const source = contacts.find((row) => row.id === body.p_id)
      if (!source) throw new Error('复制的联系人不存在')
      const copy = {
        ...source,
        id: `11111111-1111-4111-8111-${String(serial++).padStart(12, '0')}`,
        name: source.name,
        isDefault: false
      }
      contacts.push(copy)
      json = copy
    } else if (name === 'tms_copy_customer_finance_secure') {
      const source = finances.find((row) => row.id === body.p_id)
      if (!source) throw new Error('复制的财务账户不存在')
      const copy = {
        ...source,
        id: `11111111-1111-4111-8111-${String(serial++).padStart(12, '0')}`,
        invoiceTitle: source.invoiceTitle,
        isDefaultInvoice: false
      }
      finances.push(copy)
      json = copy
    } else if (name === 'tms_delete_customer_contacts_secure') {
      const ids = body.p_ids as string[]
      for (const id of ids)
        contacts.splice(
          contacts.findIndex((row) => row.id === id),
          1
        )
      json = ids.length
    } else if (name === 'tms_delete_customer_finances_secure') {
      const ids = body.p_ids as string[]
      for (const id of ids)
        finances.splice(
          finances.findIndex((row) => row.id === id),
          1
        )
      json = ids.length
    }
    await route.fulfill({ json })
  })

  await page.goto('/tests/e2e/fixtures/tms-customer-workspace.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByText(customer.customerName, { exact: true }).first().click()
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('tab', { name: '客户识别' }) })

  for (const item of [
    { tab: '联系人', add: '新增联系人', field: '姓名', value: '新联系人' },
    {
      tab: '财务信息',
      add: '新增财务账户',
      field: '开票名称',
      value: '新增开票主体'
    }
  ]) {
    await dialog.getByRole('tab', { name: item.tab, exact: true }).click()
    await dialog.getByRole('button', { name: item.add, exact: true }).click()
    const editor = page.getByRole('dialog').last()
    await editor.getByRole('textbox', { name: item.field }).fill(item.value)
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    await expect(dialog.getByText(item.value, { exact: true })).toBeVisible()

    await dialog
      .getByRole('row')
      .filter({ hasText: item.value })
      .getByRole('button', { name: '复制' })
      .click()
    await expect(dialog.getByText(item.value, { exact: true })).toHaveCount(2)

    const copyRow = dialog.getByRole('row').filter({ hasText: item.value }).last()
    await expect(copyRow.getByRole('switch')).not.toBeChecked()
    await copyRow.getByRole('button', { name: '更多操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '删除', exact: true }).click()
    await expect(page.getByText('删除确认', { exact: true }).last()).toBeVisible()
    await page.getByRole('button', { name: '删除', exact: true }).last().click()
    await expect(dialog.getByText(item.value, { exact: true })).toHaveCount(1)
  }

  expect(calls).toContain('get_mdm_customer_contact_delete_dependencies_secure')
  expect(calls).toContain('get_mdm_customer_finance_delete_dependencies_secure')
  expect(calls).toContain('tms_delete_customer_contacts_secure')
  expect(calls).toContain('tms_delete_customer_finances_secure')
})
