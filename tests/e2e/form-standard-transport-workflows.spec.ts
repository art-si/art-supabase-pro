import { expect, test } from '@playwright/test'
import {
  openTransportEntry as open,
  transportInput as input,
  type TransportWrite
} from './support/form-standard-transport'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 25_000 })
test.setTimeout(90_000)

test('电子合同 跨页签必填定位后实际创建', async ({ page }, info) => {
  const writes: TransportWrite[] = []
  const dialog = await open(page, 'electronic-contract', writes)
  const tabs = dialog.getByRole('tab')
  await expect(tabs).toHaveCount(2)
  await tabs.last().click()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(input(dialog, 'contractName')).toBeVisible()
  await input(dialog, 'contractName').fill('验收电子合同')
  const dates = dialog.locator('[data-art-form-item-key="dateRange"] input')
  await dates.nth(0).fill('2026-10-31')
  const endDate = dialog.getByRole('combobox', { name: '终止日期', exact: true })
  await endDate.fill('2027-10-31')
  await endDate.press('Tab')
  await dialog.locator('[contenteditable="true"]').fill('双方按合同约定完成运输和交付。')
  await tabs.last().click()
  await input(dialog, 'partyACompany').fill('验收甲方公司')
  await input(dialog, 'partyASubject').fill('甲方主体')
  await dialog.locator('[data-art-form-item-key="partyBCarrierId"] .el-select').click()
  await page.getByRole('option', { name: '验收承运商', exact: true }).click()
  await input(dialog, 'partyBSubject').fill('乙方主体')
  await tabs.first().click()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].path).toBe('tms_electronic_contract')
  expect(writes[0].payload).toMatchObject({
    contract_name: '验收电子合同',
    starts_on: '2026-10-31',
    ends_on: '2027-10-31',
    party_b_subject: '乙方主体'
  })
  await page.screenshot({ path: info.outputPath('created.png') })
})

test('司机 六个可写页签校验后保存且定位首错', async ({ page }) => {
  const writes: TransportWrite[] = []
  const dialog = await open(page, 'driver', writes)
  await expect(dialog.getByRole('tab')).toHaveCount(8)
  await input(dialog, 'driverName').fill('')
  await dialog.getByRole('tab', { name: '财务信息', exact: true }).click()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(input(dialog, 'driverName')).toBeFocused()
  expect(writes).toEqual([])
  await input(dialog, 'driverName').fill('验收司机')
  await dialog.getByRole('tab', { name: '财务信息', exact: true }).click()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].path).toBe('tms_update_driver_secure')
  expect(JSON.stringify(writes[0].payload)).toContain('验收司机')
})

test('司机提成 适用范围与费率跨页签保存', async ({ page }, info) => {
  const writes: TransportWrite[] = []
  const driver = await open(page, 'driver', writes)
  await driver.getByRole('tab', { name: '提成配置', exact: true }).click()
  await driver.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑提成方案', exact: true })
  await expect(dialog.locator('.art-form .art-async-state[aria-busy="true"]')).toHaveCount(0)
  await input(dialog, 'ruleName').fill('')
  await dialog.getByRole('tab').last().click()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(input(dialog, 'ruleName')).toBeFocused()
  await input(dialog, 'ruleName').fill('验收提成方案')
  await dialog.getByRole('tab').last().click()
  await dialog.getByRole('button', { name: '确定', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(writes).toHaveLength(1)
  expect(writes[0].path).toBe('tms_save_driver_commission_rule_secure')
  expect(JSON.stringify(writes[0].payload)).toContain('验收提成方案')
  await driver.screenshot({ path: info.outputPath('commission-saved.png') })
})

test('配件领用 保持单页且表格message加红框校验后保存', async ({ page }, info) => {
  const writes: TransportWrite[] = []
  const dialog = await open(page, 'part-issue', writes)
  await expect(dialog.getByRole('tab')).toHaveCount(0)
  await dialog.getByRole('textbox', { name: '领用车辆', exact: false }).click()
  const picker = page.getByRole('dialog', { name: '选择领用车辆', exact: true })
  await picker.getByRole('row').filter({ hasText: '测A12345' }).click()
  await picker.getByRole('button', { name: /确认|确定/, exact: true }).click()
  await dialog.getByRole('button', { name: '确认领用', exact: true }).click()
  await expect(dialog.locator('.art-table__cell-content.is-validation-error')).toHaveCount(1)
  await expect(page.locator('.el-message')).toContainText('物料描述')
  expect(writes).toEqual([])
  await dialog.getByRole('combobox', { name: '物料描述', exact: true }).click()
  await page.getByRole('option', { name: '验收库存配件 · STOCK-TEST', exact: true }).click()
  await dialog.getByRole('button', { name: '确认领用', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].path).toBe('vms_create_part_issue_secure')
  expect(writes[0].payload).toMatchObject({ p_payload: { lines: [{ issued_qty: 1 }] } })
  await page.screenshot({ path: info.outputPath('issue-created.png') })
})

test('返程配货 隐藏路线页签校验定位后保存', async ({ page }) => {
  const writes: TransportWrite[] = []
  const dialog = await open(page, 'return-trip', writes)
  await dialog.getByRole('tab', { name: '收入与费用', exact: true }).click()
  await dialog.getByRole('button', { name: '保存返程配货', exact: true }).click()
  await expect(dialog.getByRole('tab', { name: '路线与任务', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await dialog.locator('[data-art-form-item-key="returnCustomerId"] .el-select').click()
  await page.getByRole('option', { name: '验收客户', exact: true }).click()
  await dialog.getByRole('tab', { name: '收入与费用', exact: true }).click()
  await dialog.getByRole('button', { name: '保存返程配货', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].path).toBe('tms_create_return_leg_secure')
  expect(writes[0].payload).toMatchObject({
    p_payload: { origin_station: '杭州门店', destination_station: '上海仓' }
  })
})

test('返程收益 三分类只读详情与重开首项', async ({ page }, info) => {
  const dialog = await open(page, 'return-summary', [])
  const tabs = dialog.getByRole('tab')
  await expect(tabs).toHaveCount(3)
  for (let index = 0; index < 3; index++) {
    await tabs.nth(index).click()
    await dialog.screenshot({ path: info.outputPath(`summary-${index}.png`) })
  }
  await expect(dialog.locator('input,textarea,[contenteditable="true"]')).toHaveCount(0)
})

test('运输合同 明细表跨页签定位红框并保存实际行', async ({ page }, info) => {
  const writes: TransportWrite[] = []
  const dialog = await open(page, 'contract', writes)
  await dialog.getByRole('tab', { name: '运输明细', exact: true }).click()
  await dialog.getByRole('button', { name: '新增明细', exact: true }).click()
  const table = dialog.locator('.contract-transport-details')
  await table.getByPlaceholder('选择或输入货物', { exact: true }).fill('验收合同货物')
  await table.locator('.el-select').click()
  await page.getByRole('option', { name: '件', exact: true }).click()
  await dialog.getByRole('tab', { name: '基础信息', exact: true }).click()
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(dialog.getByRole('tab', { name: '运输明细', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(table.locator('.is-validation-error')).toHaveCount(1)
  await expect(table.getByPlaceholder('请输入编码', { exact: true })).toBeFocused()
  await expect(page.locator('.el-message')).toContainText('缺少货物编码')
  await expect(table.getByRole('columnheader', { name: /货物编码/ })).toContainText('必填')
  await expect(table.getByRole('button', { name: '货物描述填写说明', exact: true })).toBeVisible()
  expect(writes).toEqual([])
  await table.getByPlaceholder('请输入编码', { exact: true }).fill('CARGO-TEST')
  await dialog.screenshot({ path: info.outputPath('transport-lines.png') })
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByTestId('save-result')).toHaveText('已保存')
  expect(writes).toHaveLength(1)
  expect(writes[0].payload).toMatchObject({
    p_payload: {
      transport_details: [
        {
          cargo_description: '验收合同货物',
          cargo_code: 'CARGO-TEST',
          contract_quantity: 1,
          unit: '件'
        }
      ]
    }
  })
})

for (const visual of [
  { width: 1440, height: 900, theme: 'light' },
  { width: 390, height: 844, theme: 'dark' }
]) {
  test(`driver-commission ${visual.theme}${visual.width} 子表单全部页签视觉`, async ({
    page
  }, info) => {
    await page.setViewportSize(visual)
    const driver = await open(page, 'driver', [], `&theme=${visual.theme}`)
    await driver.getByRole('tab', { name: '提成配置', exact: true }).click()
    await driver.getByRole('button', { name: '编辑', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '编辑提成方案', exact: true })
    for (let index = 0; index < 2; index++) {
      await dialog.getByRole('tab').nth(index).click()
      expect(
        await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1)
      ).toBe(false)
      await dialog.screenshot({
        path: info.outputPath(`commission-pane-${index + 1}.png`),
        animations: 'disabled',
        timeout: 60_000
      })
    }
  })
}

for (const entry of [
  'electronic-contract',
  'driver',
  'part-issue',
  'return-trip',
  'return-summary'
]) {
  for (const visual of [
    { width: 1440, height: 900, theme: 'light' },
    { width: 390, height: 844, theme: 'dark' }
  ]) {
    test(`${entry} ${visual.theme}${visual.width} 工作流全部页签视觉`, async ({ page }, info) => {
      await page.setViewportSize(visual)
      const dialog = await open(page, entry, [], `&theme=${visual.theme}`)
      const tabs = dialog.getByRole('tab')
      const count = await tabs.count()
      for (let index = 0; index < Math.max(1, count); index++) {
        if (count) await tabs.nth(index).click()
        await expect(dialog.locator('.art-form .art-async-state[aria-busy="true"]')).toHaveCount(0)
        expect(
          await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1)
        ).toBe(false)
        await dialog.screenshot({
          path: info.outputPath(`pane-${index + 1}.png`),
          animations: 'disabled',
          timeout: 60_000
        })
      }
    })
  }
}
