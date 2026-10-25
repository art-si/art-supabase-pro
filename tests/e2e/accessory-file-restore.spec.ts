import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
const fileId = '33333333-3333-4333-8333-333333333333'

for (const scenario of ['success', 'sign-failure', 'page-failure']) {
  const failSigning = scenario === 'sign-failure'
  test(`文件恢复 ${scenario}`, async ({ page }) => {
    let active = 0
    let peak = 0
    let signedCount = 0
    const sketchOffsets: number[] = []
    await page.route('**/storage/v1/**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.includes('/object/list/')) {
        const body = route.request().postDataJSON()
        const isSource = body.prefix.endsWith('/source')
        if (!isSource) sketchOffsets.push(body.offset)
        if (scenario === 'page-failure' && !isSource && body.offset === 100) {
          await route.fulfill({ status: 500, json: { message: 'test listing failure' } })
          return
        }
        const names = isSource
          ? [`${fileId}-source.pdf`]
          : Array.from({ length: 8 }, (_, index) => `${fileId}-sketch-${index + 1}.png`).filter(
              (name) => !name.endsWith('sketch-3.png')
            )
        const files = isSource
          ? names
          : [...Array.from({ length: 100 }, (_, index) => `old-${index}.png`), ...names]
        await route.fulfill({
          json: files
            .slice(body.offset, body.offset + body.limit)
            .map((name) => ({ name, id: fileId }))
        })
        return
      }
      active += 1
      signedCount += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 100))
      await route.fulfill(
        failSigning
          ? { status: 500, json: { message: 'test signing failure' } }
          : {
              json: {
                signedURL: `/object/sign/${url.pathname.split('/object/sign/')[1]}?token=test`
              }
            }
      )
      active -= 1
    })
    await page.goto('/tests/e2e/fixtures/accessory-file-restore.html')
    const output = page.locator('#restore-result')
    if (scenario === 'page-failure') {
      await expect(output).toHaveText('识别原件或草图读取失败，请稍后重试')
      expect(signedCount).toBe(0)
    } else if (failSigning) {
      await expect(output).toHaveText('文件访问地址获取失败，请刷新后重试')
      expect(signedCount).toBe(3)
    } else {
      await expect(output).toContainText('sketchUrls')
      const result = JSON.parse(await output.innerText())
      expect(result.sourceUrl).toContain('source.pdf')
      expect(result.sketchPaths).toHaveLength(8)
      expect(result.sketchPaths[2]).toBeNull()
      expect(result.sketchUrls[2]).toBe('')
      result.sketchUrls.forEach((url: string, index: number) => {
        if (index !== 2) expect(url).toContain(`sketch-${index + 1}.png`)
      })
      expect(signedCount).toBe(8)
    }
    expect(peak).toBe(scenario === 'page-failure' ? 0 : 3)
    expect(sketchOffsets).toEqual([0, 100])
  })
}

test('原件路径租户与识别记录租户不一致时不读取文件', async ({ page }) => {
  let requests = 0
  await page.route('**/storage/v1/**', async (route) => {
    requests += 1
    await route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/accessory-file-restore.html?invalid-tenant')
  await expect(page.locator('#restore-result')).toHaveText(
    '该识别记录的原件索引无效，请重新上传清单'
  )
  expect(requests).toBe(0)
})
