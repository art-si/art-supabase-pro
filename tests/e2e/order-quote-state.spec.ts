import { expect, test } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)
test('关闭重开报价后旧读取不能覆盖当前备注', async ({ page }, info) => {
  let reads = 0
  let releaseRead: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    releaseRead = resolve
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rpc/tms_get_order_quote_secure', async (route) => {
    const index = ++reads
    if (index === 1) await held
    await route.fulfill({
      json: {
        order: { id: 'quote-order', order_no: 'ORDER-TEST' },
        quote: {
          transport_fee: 1234.5,
          remark: index === 1 ? '旧读取备注' : '当前读取备注',
          supplementary_items: [],
          attachment_urls: []
        }
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/order-quote-state.html')
  await page.getByRole('button', { name: '打开报价', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect.poll(() => reads).toBe(1)
  await dialog.getByRole('button', { name: 'Close this dialog' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '打开报价', exact: true }).click()
  const remark = dialog.getByRole('textbox', { name: /备注/ })
  await expect(remark).toHaveValue('当前读取备注')
  const oldResponse = page.waitForResponse((response) =>
    response.url().includes('/rpc/tms_get_order_quote_secure')
  )
  releaseRead?.()
  await (await oldResponse).finished()
  await expect(remark).toHaveValue('当前读取备注')
  await expect(dialog.getByRole('button', { name: '保存报价', exact: true })).toBeEnabled()
  await expect(dialog.getByText('¥1,234.50', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('quote-money.png'), animations: 'disabled' })
})

test('报价保存失败只提示一次，重试请求冻结原内容', async ({ page }) => {
  let fail = true
  let releaseWrite: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    releaseWrite = resolve
  })
  const writes: Array<{ p_payload: { remark: string } }> = []
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rpc/tms_get_order_quote_secure', (route) =>
    route.fulfill({ json: { order: { id: 'quote-order', order_no: 'ORDER-TEST' }, quote: null } })
  )
  await page.route('**/rpc/tms_save_order_quote_secure', async (route) => {
    writes.push(route.request().postDataJSON())
    if (fail)
      return route.fulfill({ status: 400, json: { code: 'P0001', message: '测试报价保存失败' } })
    await held
    return route.fulfill({ json: {} })
  })
  await page.goto('/tests/e2e/fixtures/order-quote-state.html')
  await page.getByRole('button', { name: '打开报价', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const remark = dialog.getByRole('textbox', { name: /备注/ })
  await remark.fill('首次报价备注')
  await dialog.getByRole('button', { name: '保存报价', exact: true }).click()
  await expect(
    page.locator('.el-message__content').getByText('测试报价保存失败', { exact: true })
  ).toHaveCount(1)
  await expect(remark).toHaveValue('首次报价备注')
  await expect(page.locator('.el-message')).toHaveCount(0, { timeout: 15_000 })
  fail = false
  await dialog.getByRole('button', { name: '保存报价', exact: true }).click()
  await expect.poll(() => writes.length).toBe(2)
  await remark.fill('请求发出后的新备注')
  releaseWrite?.()
  await expect(
    page.getByText('本次报价已保存，后续修改尚未保存，请检查后再次保存', { exact: true })
  ).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(remark).toHaveValue('请求发出后的新备注')
  expect(writes.map((item) => item.p_payload.remark)).toEqual(['首次报价备注', '首次报价备注'])
})
test('报价错误原位重试并恢复操作区域', async ({ page }) => {
  let failure = true
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.route('**/rpc/tms_get_order_quote_secure', (route) =>
    failure
      ? route.fulfill({ status: 503, json: { code: 'XX000', message: 'temporary failure' } })
      : route.fulfill({
          json: {
            order: {
              id: 'quote-order',
              order_no: 'ORDER-TEST',
              origin_station: '测试始发站',
              destination_station: '测试到货站'
            },
            quote: null
          }
        })
  )
  await page.goto('/tests/e2e/fixtures/order-quote-state.html')
  await page.getByRole('button', { name: '打开报价', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('报价信息加载失败', { exact: true })).toBeVisible()
  await expect(page.locator('.el-message')).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('quote-error.png'), animations: 'disabled' })
  failure = false
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(dialog.getByText('报价信息加载失败', { exact: true })).toBeHidden()
  await expect(dialog.getByText('ORDER-TEST', { exact: true })).toBeVisible()
  await expect(dialog.getByText('补充费用', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
  expect(await dialog.evaluate((element) => element.scrollWidth > element.clientWidth + 1)).toBe(
    false
  )
})
