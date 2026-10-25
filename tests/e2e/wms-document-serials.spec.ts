import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

const scenarios = [
  ...[
    'initial_outbound',
    'initial_return',
    'outbound',
    'return',
    'other_outbound',
    'other_return'
  ].map((variant) => ({ kind: 'sales', variant, trigger: '打开销售单据' })),
  ...[
    'initial_inbound',
    'initial_return',
    'purchase_inbound',
    'purchase_return',
    'other_inbound',
    'other_return',
    'entrusted_processing_inbound',
    'entrusted_processing_return'
  ].map((variant) => ({ kind: 'purchase', variant, trigger: '打开采购单据' }))
]
for (const { kind, variant, trigger } of scenarios) {
  test(`${kind === 'sales' ? '销售' : '采购'}-${variant}序列号弹窗显示统一空态并可导入文本`, async ({
    page,
    request
  }, testInfo) => {
    test.setTimeout(180_000)
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({ contentType: 'application/json', body: '[]' })
    )
    const fixturePath = '/tests/e2e/fixtures/wms-document-serials.html'
    await expect
      .poll(async () => (await request.get(fixturePath)).text(), { timeout: 90_000 })
      .toContain('<title>仓储单据序列号验收</title>')
    await page.goto(`${fixturePath}?${kind}Kind=${variant}`, {
      waitUntil: 'domcontentloaded'
    })
    await expect(page).toHaveTitle('仓储单据序列号验收')
    if (testInfo.project.name.includes('dark')) {
      await page.evaluate(() => document.documentElement.classList.add('dark'))
    }
    if (testInfo.project.name.includes('shadow')) {
      await page.evaluate(() =>
        document.documentElement.setAttribute('data-box-mode', 'shadow-mode')
      )
    }

    await page
      .getByRole('button', {
        name: kind === 'sales' ? '查看销售单据' : '查看采购单据',
        exact: true
      })
      .click()
    const drawer = page.locator('.el-drawer')
    await drawer.getByRole('button', { name: '序列号 0', exact: true }).click()
    const serialDialog = page.getByRole('dialog', { name: '查看序列号' })
    await expect(serialDialog.locator('.art-empty-state')).toBeVisible()
    await expect(serialDialog.getByText('暂无序列号')).toBeVisible()
    await expect(serialDialog.getByText('录入或导入序列号后可在这里查看。')).toBeVisible()

    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }))
    expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
    await page.screenshot({
      path: testInfo.outputPath(`wms-${kind}-serials-empty.png`),
      animations: 'disabled'
    })

    await serialDialog.getByRole('button', { name: /关闭|Close/i }).click()
    await drawer.getByRole('button', { name: /关闭|Close/i }).click()
    await page.getByRole('button', { name: trigger, exact: true }).click()
    await drawer.getByRole('button', { name: '序列号 0', exact: true }).click()
    const lineDialog = page.getByRole('dialog', { name: '录入序列号', exact: true })
    await expect(lineDialog.locator('textarea')).not.toHaveAttribute('maxlength')
    const fileInput = lineDialog.locator('input[type="file"][accept=".txt,.csv"]')
    await fileInput.setInputFiles({
      name: 'empty.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(' , \r\n ')
    })
    await expect(page.getByText('文件中没有可用的序列号，请检查文件内容后重试')).toBeVisible()
    await expect(lineDialog.locator('textarea')).toHaveValue('')
    await fileInput.setInputFiles({
      name: 'serials.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('SERIAL-001\nSERIAL-002')
    })
    await expect(lineDialog.locator('textarea')).toHaveValue('SERIAL-001\nSERIAL-002')
    await page.screenshot({
      path: testInfo.outputPath(`wms-${kind}-serials-filled.png`),
      animations: 'disabled'
    })
    await lineDialog.getByRole('button', { name: '保存序列号', exact: true }).click()
    await expect(lineDialog).not.toBeVisible()
    const savedSerials = drawer.getByRole('button', { name: '序列号 2', exact: true })
    await expect(savedSerials).toBeVisible()
    await savedSerials.click()
    await expect(lineDialog.locator('textarea')).toHaveValue('SERIAL-001\nSERIAL-002')
    await lineDialog.locator('input[type="file"][accept=".txt,.csv"]').setInputFiles({
      name: 'replacement.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('SERIAL-003')
    })
    await expect(lineDialog.locator('textarea')).toHaveValue('SERIAL-003')
    await lineDialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(savedSerials).toBeVisible()
    await savedSerials.click()
    await expect(lineDialog.locator('textarea')).toHaveValue('SERIAL-001\nSERIAL-002')
    await lineDialog.getByRole('button', { name: '取消', exact: true }).click()
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
  })
}
