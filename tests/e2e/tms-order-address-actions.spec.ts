import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

async function mockAddressDictionaries(page: Page) {
  await page.route('**/rest/v1/sys_dictionary?*', (route) => {
    const code = new URL(route.request().url()).searchParams
      .get('dict_type_table.code')
      ?.replace(/^eq\./, '')
    const options: Record<string, Array<[string, string]>> = {
      tmsAddressType: [
        ['shipping', '发货地址'],
        ['receiving', '收货地址']
      ],
      tmsOrderDeliveryMethod: [['door', '送货上门']]
    }
    return route.fulfill({
      json: (options[code || ''] || []).map(([value, label], index) => ({
        id: `${code}-${index}`,
        code: value,
        value,
        label,
        sort: index,
        status: '1',
        dict_type_table: { code, name: code }
      }))
    })
  })
}

test('开单收发地址图标提供识别和原有地址选择，并把识别结果带回对应端', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await mockAddressDictionaries(page)
  await page.goto('/tests/e2e/fixtures/order-numeric.html')
  await page.getByRole('radiogroup').getByText('完整表单', { exact: true }).click()

  for (const endpoint of [
    {
      icon: '发货地址操作',
      selector: '选择发货地址',
      key: 'shipping',
      name: '张三',
      phone: '13800138000'
    },
    {
      icon: '收货地址操作',
      selector: '选择收货地址',
      key: 'receiving',
      name: '李四',
      phone: '13900139000'
    }
  ] as const) {
    await page.getByRole('button', { name: endpoint.icon }).click()
    await expect(page.getByRole('menuitem', { name: '地址识别' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: '选择地址' })).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`${endpoint.key}-address-menu.png`),
      animations: 'disabled'
    })
    await page.getByRole('menuitem', { name: '地址识别' }).click()
    const recognition = page.getByRole('dialog', { name: '地址识别' })
    await expect(recognition).toBeVisible()
    await expect(recognition.getByRole('button', { name: '图片识别' })).toBeVisible()
    await recognition
      .getByRole('textbox', { name: '待识别的地址信息' })
      .fill(`${endpoint.name}，${endpoint.phone}，上海市浦东新区验收路12号，验收物流有限公司`)
    await recognition.getByRole('button', { name: '识别信息' }).click()
    await expect(recognition.locator('[data-art-form-item-key="contactName"] input')).toHaveValue(
      endpoint.name
    )
    await expect(recognition.locator('[data-art-form-item-key="contactPhone"] input')).toHaveValue(
      endpoint.phone
    )
    await expect(recognition.getByText(/已识别 \d+ 项/)).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`${endpoint.key}-recognized-address.png`),
      animations: 'disabled'
    })
    await recognition.getByRole('button', { name: '使用此地址' }).click()
    await expect(recognition).toBeHidden()
    await expect(
      page.locator(`[data-art-form-item-key="${endpoint.key}ContactName"] input`)
    ).toHaveValue(endpoint.name)
    await expect(
      page.locator(`[data-art-form-item-key="${endpoint.key}ContactPhone"] input`)
    ).toHaveValue(endpoint.phone)

    await page.getByRole('button', { name: endpoint.icon }).click()
    await page.getByRole('menuitem', { name: '选择地址' }).click()
    await expect(page.getByRole('dialog', { name: endpoint.selector })).toBeVisible()
    await page.screenshot({
      path: info.outputPath(`${endpoint.key}-existing-address-selector.png`),
      animations: 'disabled'
    })
    await page
      .getByRole('dialog', { name: endpoint.selector })
      .getByRole('button', { name: '取消' })
      .click()
  }
  expect(errors).toEqual([])
})

test('地址识别通过本地图片 OCR 回填联系人', async ({ page }, info) => {
  test.setTimeout(240_000)
  await prepareIsolatedSession(page)
  const tenantId = '11111111-1111-4111-8111-111111111111'
  await page.addInitScript((selectedTenantId) => {
    sessionStorage.setItem('art-platform-tenant-scope-active', '1')
    sessionStorage.setItem('art-platform-tenant-scope-id', selectedTenantId)
  }, tenantId)
  const errors: string[] = []
  let attachmentLookupCount = 0
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await mockAddressDictionaries(page)
  await page.route('**/rest/v1/sys_user?*', (route) =>
    route.fulfill({
      json: {
        id: 'permission-test-user',
        user_name: '测试用户',
        status: '1',
        tenant_id: tenantId,
        tenant: { id: tenantId, tenant_code: 'test', tenant_name: '测试租户' }
      }
    })
  )
  await page.route('**/rest/v1/sys_tenant?*', (route) =>
    route.fulfill({ json: [{ id: tenantId, tenant_code: 'test', tenant_name: '测试租户' }] })
  )
  await page.route('**/rest/v1/sys_attachment?*', (route) => {
    attachmentLookupCount += 1
    return route.fulfill({
      json: {
        id: '11111111-1111-4111-8111-111111111701',
        tenant_id: tenantId,
        tenantId,
        origin_name: 'address-ocr.png',
        originName: 'address-ocr.png',
        url: 'https://example.invalid/address-ocr.png'
      }
    })
  })
  await page.goto('/tests/e2e/fixtures/order-numeric.html')
  await page.getByRole('radiogroup').getByText('完整表单', { exact: true }).click()
  await page.getByRole('button', { name: '发货地址操作' }).click()
  await page.getByRole('menuitem', { name: '地址识别' }).click()
  const recognition = page.getByRole('dialog', { name: '地址识别' })
  await expect(recognition.getByRole('button', { name: '图片识别' })).toBeEnabled()
  await expect(recognition.locator('.art-upload-file')).not.toHaveClass(/is-disabled/)
  const pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1600
    canvas.height = 380
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas unavailable')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#111'
    context.font = '64px sans-serif'
    context.fillText('张三 13800138000', 45, 135)
    context.fillText('上海市浦东新区验收路12号', 45, 270)
    return canvas.toDataURL('image/png').split(',')[1]
  })
  await recognition.locator('input[type="file"]').setInputFiles({
    name: 'address-ocr.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBase64, 'base64')
  })
  await page.screenshot({ path: info.outputPath('address-image-upload-start.png') })
  await expect.poll(() => attachmentLookupCount).toBeGreaterThan(0)
  await expect(recognition.locator('[data-art-form-item-key="contactPhone"] input')).toHaveValue(
    '13800138000',
    { timeout: 120_000 }
  )
  await expect(recognition.getByText(/已识别 \d+ 项/)).toBeVisible()
  await page.screenshot({ path: info.outputPath('address-image-ocr.png'), animations: 'disabled' })
  await recognition
    .getByRole('textbox', { name: '待识别的地址信息' })
    .fill('张三，13800138000，上海市浦东新区验收路12号')
  await recognition.getByRole('button', { name: '识别信息' }).click()
  await expect(recognition.locator('[data-art-form-item-key="contactName"] input')).toHaveValue(
    '张三'
  )
  await recognition.getByRole('button', { name: '使用此地址' }).click()
  await expect(page.locator('[data-art-form-item-key="shippingContactPhone"] input')).toHaveValue(
    '13800138000'
  )
  await page.screenshot({
    path: info.outputPath('address-image-applied.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})

test('地址语音识别结果可填入收货端', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.addInitScript(() => {
    class MockSpeechRecognition {
      onstart?: () => void
      onresult?: (event: {
        resultIndex: number
        results: Array<Array<{ transcript: string }>>
      }) => void
      onend?: () => void
      start() {
        this.onstart?.()
        this.onresult?.({
          resultIndex: 0,
          results: [[{ transcript: '李四，13900139000，上海市浦东新区验收路12号' }]]
        })
      }
      stop() {
        this.onend?.()
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: MockSpeechRecognition })
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: MockSpeechRecognition })
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await mockAddressDictionaries(page)
  await page.goto('/tests/e2e/fixtures/order-numeric.html')
  await page.getByRole('radiogroup').getByText('完整表单', { exact: true }).click()
  await page.getByRole('button', { name: '收货地址操作' }).click()
  await page.getByRole('menuitem', { name: '地址识别' }).click()
  const recognition = page.getByRole('dialog', { name: '地址识别' })
  await recognition.getByRole('button', { name: '语音输入' }).click()
  await recognition.getByRole('button', { name: '结束录音并识别' }).click()
  await expect(recognition.locator('[data-art-form-item-key="contactPhone"] input')).toHaveValue(
    '13900139000'
  )
  await recognition.getByRole('button', { name: '使用此地址' }).click()
  await expect(page.locator('[data-art-form-item-key="receivingContactName"] input')).toHaveValue(
    '李四'
  )
  await page.screenshot({
    path: info.outputPath('address-speech-mock.png'),
    animations: 'disabled'
  })
})
