import { expect, test } from '@playwright/test'
import { expectOverlayTabPanel } from './support/overlay-tab-card'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(120_000)

test('MDM 客户页使用同一联系人与财务子表', async ({ page }, info) => {
  const errors: string[] = []
  const requestedChildren: string[] = []
  const writes: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') process.stderr.write(`浏览器错误：${message.text()}\n`)
  })
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint && /save|upsert/i.test(endpoint)) writes.push(endpoint)
    if (endpoint === 'tms_list_customer_contacts_secure') {
      requestedChildren.push('contact')
      return route.fulfill({
        json: [
          {
            id: '11111111-1111-4111-8111-111111111301',
            customerId: '11111111-1111-4111-8111-111111111201',
            name: '验收联系人甲',
            mobile: '13800000000',
            isDefault: true,
            role: '商务'
          }
        ]
      })
    }
    if (endpoint === 'tms_list_customer_finances_secure') {
      requestedChildren.push('finance')
      return route.fulfill({
        json: [
          {
            id: '11111111-1111-4111-8111-111111111401',
            customerId: '11111111-1111-4111-8111-111111111201',
            invoiceTitle: '验收客户甲开票主体',
            taxNo: '91310000TEST000001',
            bankName: '验收银行',
            bankAccount: '6222000000000001',
            bankBranch: '上海支行',
            isDefaultInvoice: true,
            fieldAccess: { taxNo: 'edit', bankAccount: 'edit' }
          }
        ]
      })
    }
    return route.fulfill({ json: [] })
  })

  await page.goto('/tests/e2e/fixtures/mdm-customer-children.html', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000
  })
  await page.getByRole('button', { name: '编辑验收客户' }).click()
  const dialog = page.getByRole('dialog', { name: '编辑客户', exact: true })
  const master = await expectOverlayTabPanel(dialog, '客户主档')
  const customerName = master.getByRole('textbox', { name: /客户名称$/ })
  await expect(customerName).toBeEditable()
  await customerName.clear()
  expect(requestedChildren).toEqual([])
  await page.getByRole('tab', { name: '联系人' }).click()
  await expect(page.getByText('验收联系人甲').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '新增联系人' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('mdm-customer-contacts.png'), fullPage: true })

  await page.getByRole('tab', { name: '财务信息' }).click()
  await expect(page.getByText('验收客户甲开票主体').first()).toBeVisible()
  await expect(page.getByRole('button', { name: '新增财务账户' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({
    path: info.outputPath('mdm-customer-finance-narrow.png'),
    fullPage: true
  })

  await dialog.getByRole('button', { name: '保存更改', exact: true }).press('Enter')
  await expectOverlayTabPanel(dialog, '客户主档')
  await expect(master.getByText('请输入客户名称', { exact: true })).toBeVisible()
  await expect(customerName).toBeFocused()
  await page.screenshot({ path: info.outputPath('mdm-customer-invalid-name-390.png') })
  const spacing = await customerName.evaluate((input) => {
    const card = input.closest('.art-overlay-tab-card:has(.operational-master-dialog__form-panel)')
    const tabs = input.closest('.art-form__tabs')
    const panel = input.closest('.operational-master-dialog__form-panel')
    const control = input.closest('.el-input__wrapper')
    if (!card || !tabs || !panel || !control) throw new Error('客户主档缺少内容卡片或名称字段')
    const cardStyle = getComputedStyle(card)
    const tabsStyle = getComputedStyle(tabs)
    const panelStyle = getComputedStyle(panel)
    return {
      tabBorder: tabsStyle.borderInlineStartWidth,
      tabPadding: tabsStyle.paddingInlineStart,
      panelBorder: panelStyle.borderInlineStartWidth,
      inputInset: control.getBoundingClientRect().left - card.getBoundingClientRect().left,
      cardInset:
        parseFloat(cardStyle.paddingInlineStart) + parseFloat(cardStyle.borderInlineStartWidth),
      overflow: card.scrollWidth - card.clientWidth
    }
  })
  expect(spacing).toMatchObject({ tabBorder: '0px', tabPadding: '0px', panelBorder: '0px' })
  expect(Math.abs(spacing.inputInset - spacing.cardInset)).toBeLessThanOrEqual(2)
  expect(spacing.overflow).toBeLessThanOrEqual(1)

  await dialog.getByRole('tab', { name: '财务信息', exact: true }).click()
  await expect(page.getByText('验收客户甲开票主体').first()).toBeVisible()
  expect(requestedChildren).toEqual(['contact', 'finance'])
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})
