import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(90_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'

async function openFixture(page: Page, kind: 'file' | 'image', theme = 'light') {
  await prepareIsolatedSession(page)
  await page.goto(`/tests/e2e/fixtures/upload-target-race.html?kind=${kind}&theme=${theme}`)
  await expect(page.getByTestId('target')).toHaveText(tenantA)
}

async function startUpload(page: Page, kind: 'file' | 'image', name: string, id: number) {
  const input = page.locator('input[type="file"]')
  await expect(input).toBeEnabled()
  await input.setInputFiles({
    name,
    mimeType: kind === 'image' ? 'image/png' : 'application/pdf',
    buffer: Buffer.from('tenant-race-fixture')
  })
  await expect(page.getByTestId(`request-${id}`)).toContainText(name)
}

async function expectCleanModel(page: Page) {
  await expect(page.getByTestId('model')).toHaveText('[]')
  await expect(page.getByTestId('model-writes')).toHaveText('0')
  await expect(page.getByTestId('resource-changes')).toHaveText('0')
}

for (const kind of ['file', 'image'] as const) {
  test(`${kind}：旧租户延迟成功与失败都不能写入新表单`, async ({ page }, info) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await openFixture(page, kind)

    await startUpload(page, kind, `a-old.${kind === 'image' ? 'png' : 'pdf'}`, 1)
    await page.getByTestId('tenant-b').click()
    await expect(page.getByTestId('target')).toHaveText(tenantB)
    // A canceled request may remain unresolved; B must still accept a new upload.
    await startUpload(page, kind, `b-old.${kind === 'image' ? 'png' : 'pdf'}`, 2)
    await page.getByTestId('resolve-1').click()
    await expectCleanModel(page)

    await page.getByTestId('tenant-a').click()
    await page.getByTestId('tenant-b').click()
    await page.getByTestId('reject-2').click()
    await expectCleanModel(page)
    await expect(page.locator('.el-message--error')).toHaveCount(0)

    await startUpload(page, kind, `b-current.${kind === 'image' ? 'png' : 'pdf'}`, 3)
    await page.getByTestId('resolve-3').click()
    await expect(page.getByTestId('model')).toContainText(`/${kind}/3/b-current.`)
    await expect(page.getByTestId('model-writes')).toHaveText('1')
    await expect(page.getByTestId('resource-changes')).toHaveText('1')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    expect(pageErrors).toEqual([])
    await page.screenshot({ path: info.outputPath(`${kind}-current-tenant.png`), fullPage: true })
  })

  test(`${kind}：A→B→A 后旧 A 请求仍失效，异租户响应被拒绝`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.setViewportSize({ width: 390, height: 844 })
    await openFixture(page, kind, 'dark')

    await startUpload(page, kind, `a-stale.${kind === 'image' ? 'png' : 'pdf'}`, 1)
    await page.getByTestId('tenant-b').click()
    await page.getByTestId('tenant-a').click()
    await page.getByTestId('resolve-1').click()
    await expectCleanModel(page)

    await startUpload(page, kind, `a-foreign.${kind === 'image' ? 'png' : 'pdf'}`, 2)
    await page.getByTestId('foreign-2').click()
    await expect(page.locator('.el-message--error')).toContainText('租户不一致')
    await expectCleanModel(page)

    await startUpload(page, kind, `a-current.${kind === 'image' ? 'png' : 'pdf'}`, 3)
    await page.getByTestId('resolve-3').click()
    await expect(page.getByTestId('model')).toContainText(`/${kind}/3/a-current.`)
    await expect(page.getByTestId('model-writes')).toHaveText('1')
    await expect(page.getByTestId('resource-changes')).toHaveText('1')
    expect(pageErrors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true
    )
  })
}
