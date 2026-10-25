import { expect, test } from '@playwright/test'
import type { Route } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15000 })
test.setTimeout(90000)

test('付款条件两单删除响应撤权后不刷新旧列表或显示成功', async ({ page }, info) => {
  let held: Route | undefined
  let reads = 0
  const deletes: unknown[] = []
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'mdm_payment_terms_list_secure') {
      reads++
      return route.fulfill({
        json: {
          data: [1, 2].map((index) => ({
            id: `term-${index}`,
            code: `QA-DELETE-TERM-${index}`,
            name: `待删账期${index}`,
            days: 30,
            enabled: true,
            preset: false
          })),
          total: 2
        }
      })
    }
    if (name === 'mdm_delete_payable_masters_secure') {
      deletes.push(route.request().postDataJSON())
      held = route
      return
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=payment_term&theme=${theme}&permissionControls=1&permissions=MdmPaymentTerm:View,MdmPaymentTerm:Delete`
  )
  await expect(page.getByText('QA-DELETE-TERM-2', { exact: true })).toBeVisible()
  await page.locator('.el-table__header-wrapper label.el-checkbox').first().click()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  await page.locator('.el-message-box').getByRole('button', { name: '删除', exact: true }).click()
  await expect.poll(() => deletes.length).toBe(1)
  const before = reads
  await page.keyboard.press('Alt+Shift+9')
  if (!held) throw new Error('未捕获付款条件删除请求')
  const responseReceived = page.waitForResponse((response) =>
    response.url().endsWith('/mdm_delete_payable_masters_secure')
  )
  await held.fulfill({ json: 2 })
  await (await responseReceived).finished()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
  await page.keyboard.press('Alt+Shift+5')
  await expect(page.getByRole('button', { name: '批量删除', exact: true })).toBeEnabled()
  await expect(page.locator('.el-message--success')).toHaveCount(0)
  expect(reads).toBe(before)
  expect(deletes).toEqual([{ p_table: 'mdm_payment_term', p_ids: ['term-1', 'term-2'] }])
})

test('两条付款条件编辑撤权阻断及恢复保存', async ({ page }, info) => {
  const records = [1, 2].map((index) => ({
    id: `term-${index}`,
    code: `QA-AP-TERM-${index}`,
    name: `付款账期${index}`,
    days: 30,
    enabled: true,
    preset: false
  }))
  const writes: unknown[] = []
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === 'mdm_payment_terms_list_secure')
      return route.fulfill({ json: { data: records, total: 2 } })
    if (name === 'mdm_save_payment_term_secure') {
      const body = route.request().postDataJSON()
      writes.push(body)
      const record = records.find((row) => row.id === body.p_term.id)
      if (record) record.name = body.p_term.name
      return route.fulfill({ json: null })
    }
    return route.fulfill({ json: [] })
  })
  const theme = info.project.use.colorScheme === 'dark' ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/receivable-workspace.html?kind=payment_term&theme=${theme}&permissionControls=1&permissions=MdmPaymentTerm:View,MdmPaymentTerm:Edit`
  )
  if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
  for (const index of [1, 2]) {
    await expect(page.locator('.el-message')).toHaveCount(0)
    const row = page.getByRole('row').filter({ hasText: `QA-AP-TERM-${index}` })
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('textbox', { name: '名称' }).fill(`付款账期${index}已复核`)
    await page.keyboard.press('Alt+Shift+4')
    await dialog.getByRole('button', { name: '保存付款条件', exact: true }).click()
    await expect(
      page.getByText('操作范围或权限已变化，请重新打开付款条件', { exact: true })
    ).toBeVisible()
    expect(writes).toHaveLength(index - 1)
    await expect(dialog.getByRole('textbox', { name: '名称' })).toHaveValue(
      `付款账期${index}已复核`
    )
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await page.keyboard.press('Alt+Shift+5')
    await row.getByRole('button', { name: '编辑', exact: true }).click()
    await dialog.getByRole('textbox', { name: '名称' }).fill(`付款账期${index}已复核`)
    await dialog.screenshot({ path: info.outputPath(`payment-term-${index}.png`) })
    await dialog.getByRole('button', { name: '保存付款条件', exact: true }).click()
    await expect(dialog).toBeHidden()
    await expect(row).toContainText(`付款账期${index}已复核`)
    expect(writes).toHaveLength(index)
  }
})
