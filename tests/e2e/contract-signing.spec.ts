import { expect, test, type Locator, type Page } from '@playwright/test'
import type { ContractSigningInput } from '../../src/components/business/contract-signing-dialog/types'

const fixture = '/tests/e2e/fixtures/contract-signing.html'
const tenantId = '11111111-1111-4111-8111-111111111111'

test.setTimeout(90_000)

async function drawSignature(page: Page, canvas: Locator) {
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('签名画布不可见')
  const imageRatio = await canvas.evaluate(
    (element: HTMLCanvasElement) => element.width / element.height
  )
  expect(box.width / box.height).toBeCloseTo(imageRatio, 1)
  await page.mouse.move(box.x + 30, box.y + 35)
  await page.mouse.down()
  await page.mouse.move(box.x + 70, box.y + 100, { steps: 8 })
  await page.mouse.move(box.x + 130, box.y + 40, { steps: 8 })
  await page.mouse.move(box.x + 180, box.y + 95, { steps: 8 })
  await page.mouse.up()
}

test('手写签名和授权校验、租户持久化、失败重试后完成签署', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const uploadedTenants: string[] = []
  await page.goto(`${fixture}?retry=true`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '打开签署', exact: true })).toBeVisible()
  await page.route('**/rest/v1/sys_attachment*', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: null })
    const input = route.request().postDataJSON() as Record<string, unknown>
    uploadedTenants.push(String(input.tenant_id))
    return route.fulfill({ json: { id: `test-resource-${uploadedTenants.length}`, ...input } })
  })
  await page.route('**/storage/v1/object/attachments/**', (route) =>
    route.fulfill({ json: { Key: 'test-signature' } })
  )
  await page.route('**/storage/v1/object/public/attachments/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
        'base64'
      )
    })
  )
  await page.getByRole('button', { name: '打开签署', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('canvas')).toHaveCount(2)
  await expect(dialog.getByRole('button', { name: '确认签署', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: '确认签署', exact: true }).click()
  await expect(dialog.getByText('请提供甲方手写签名或印章', { exact: true })).toBeVisible()
  await expect(page.getByTestId('attempts')).toHaveText('0')
  const canvases = dialog.locator('canvas')
  await drawSignature(page, canvases.nth(0))
  await drawSignature(page, canvases.nth(1))
  await dialog.locator('label.el-checkbox').click()
  await expect(dialog.getByRole('checkbox')).toBeChecked()
  await dialog.getByRole('button', { name: '确认签署', exact: true }).click()
  await expect(page.getByTestId('attempts')).toHaveText('1')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByAltText('手写签名预览')).toHaveCount(2)
  await expect(page.locator('.el-message')).toContainText('审批状态已变化')
  await dialog.getByRole('button', { name: '确认签署', exact: true }).click()
  await expect(page.getByTestId('attempts')).toHaveText('2')
  await expect(dialog).toBeHidden()
  const payload = JSON.parse(
    await page.getByTestId('submitted').innerText()
  ) as ContractSigningInput
  expect(payload.partyASignatureUrl).toContain(`/attachments/${tenantId}/`)
  expect(payload.partyBSignatureUrl).toContain(`/attachments/${tenantId}/`)
  expect(payload.partyASealUrl).toBe('')
  expect(payload.partyBSealUrl).toBe('')
  expect(uploadedTenants).toEqual([tenantId, tenantId])
  await page.route('**/storage/v1/object/public/attachments/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
        'base64'
      )
    })
  )
  await page.getByRole('button', { name: '打开签署', exact: true }).click()
  await expect(page.getByRole('dialog').locator('canvas')).toHaveCount(2)
  await expect(page.getByRole('checkbox')).not.toBeChecked()
  expect(errors).toEqual([])
})

test('签名与印章同时使用并在窄屏保留操作区', async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 900 })
  await page.goto(`${fixture}?theme=dark&box=shadow-mode`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: '打开签署', exact: true })).toBeVisible()
  await page.route('**/rest/v1/sys_attachment*', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: null })
    return route.fulfill({ json: { id: 'test-stamp', ...route.request().postDataJSON() } })
  })
  await page.route('**/storage/v1/object/attachments/**', (route) =>
    route.fulfill({ json: { Key: 'test-evidence' } })
  )
  await page.route('**/storage/v1/object/public/attachments/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
        'base64'
      )
    })
  )
  await page.getByRole('button', { name: '打开签署', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await drawSignature(page, dialog.locator('canvas').nth(0))
  await drawSignature(page, dialog.locator('canvas').nth(1))
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
    'base64'
  )
  const stampInputs = dialog
    .locator('.el-form-item')
    .filter({ hasText: '电子印章' })
    .locator('input[type=file]')
  await stampInputs
    .nth(0)
    .setInputFiles({ name: '授权测试印章.png', mimeType: 'image/png', buffer: png })
  await expect(
    dialog.locator('.el-form-item').filter({ hasText: '电子印章' }).first().locator('.preview-list')
  ).toHaveCount(1)
  await dialog.locator('label.el-checkbox').click()
  await expect(dialog.getByRole('checkbox')).toBeChecked()
  const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await dialog.screenshot({ path: '.artifacts/contract-signing-dark-narrow.png' })
  await dialog.getByRole('button', { name: '确认签署', exact: true }).click()
  await expect(dialog).toBeHidden()
  const payload = JSON.parse(
    await page.getByTestId('submitted').innerText()
  ) as ContractSigningInput
  expect(payload.partyASealUrl).toContain('/attachments/')
  expect(payload.partyASignatureUrl).toContain('/attachments/')
})

test('两类文书预览呈现完整纸张信息并清理正文脚本', async ({ page }) => {
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  for (const [button, title] of [
    ['预览电子合同', '电子运输合同 · 验收样本'],
    ['预览运输协议', '货物运输协议 · 验收样本']
  ]) {
    await page.getByRole('button', { name: button, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: title })).toBeVisible()
    await expect(dialog.getByText('托运方：', { exact: true })).toBeVisible()
    await expect(dialog.getByText('车牌号码：', { exact: true })).toBeVisible()
    await expect(dialog.getByText('证照附件', { exact: true })).toBeVisible()
    await expect(dialog.getByText('签署日期：待签署', { exact: true })).toHaveCount(2)
    expect(await page.evaluate(() => 'contractUnsafe' in window)).toBe(false)
    expect(
      await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)
    ).toBeLessThanOrEqual(1)
    await dialog.screenshot({
      path: `.artifacts/${button === '预览电子合同' ? 'electronic' : 'transport'}-contract-paper.png`
    })
    await dialog.getByText('签署日期：待签署', { exact: true }).last().scrollIntoViewIfNeeded()
    await dialog.screenshot({
      path: `.artifacts/${button === '预览电子合同' ? 'electronic' : 'transport'}-contract-paper-signatures.png`
    })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
})

test('签署后的两类文书显示双方签名和印章，深色窄屏保留白纸与完整内容', async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 900 })
  await page.goto(fixture + '?signed=true&theme=dark', { waitUntil: 'domcontentloaded' })
  await page.route('**/contract-signature.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="72" viewBox="0 0 160 72"><path d="M12 48 Q36 4 40 42 T88 26 T140 42 M28 54L134 18" fill="none" stroke="#222" stroke-width="3"/></svg>'
    })
  )
  await page.route('**/contract-seal.svg', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="132" height="132" viewBox="0 0 132 132"><circle cx="66" cy="66" r="58" fill="none" stroke="#c62828" stroke-width="3"/><text x="66" y="72" text-anchor="middle" font-size="20" fill="#c62828">验收测试章</text></svg>'
    })
  )
  for (const button of ['预览电子合同', '预览运输协议']) {
    await page.getByRole('button', { name: button, exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('签署日期：2026-11-04', { exact: true })).toHaveCount(2)
    for (const image of ['甲方手写签名', '乙方手写签名', '甲方印章', '乙方印章']) {
      await expect
        .poll(() =>
          dialog.getByAltText(image).evaluate((element: HTMLImageElement) => element.naturalWidth)
        )
        .toBeGreaterThan(0)
    }
    await dialog.getByRole('region', { name: '合同附件', exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog.getByText('运输补充条款.pdf', { exact: true })).toBeVisible()
    expect(
      await dialog
        .locator('.upload-container')
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor)
    ).toBe('rgb(255, 255, 255)')
    await dialog.screenshot({
      path:
        '.artifacts/' +
        (button === '预览电子合同' ? 'electronic' : 'transport') +
        '-paper-attachments-dark-narrow.png'
    })
    await dialog.getByText('签署日期：2026-11-04', { exact: true }).last().scrollIntoViewIfNeeded()
    expect(
      await dialog
        .locator('.contract-document')
        .evaluate((el) => getComputedStyle(el).backgroundColor)
    ).toBe('rgb(255, 255, 255)')
    expect(await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1)
    await dialog.screenshot({
      path:
        '.artifacts/' +
        (button === '预览电子合同' ? 'electronic' : 'transport') +
        '-signed-paper-dark-narrow.png'
    })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
})
