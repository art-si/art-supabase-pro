import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
test.skip(process.env.E2E_CAD_PRODUCTION !== 'true', '需显式启用生产 CAD 检查并提供 E2E_BASE_URL')

for (const workerFailure of [false, true]) {
  test(`生产预览加载 OCCT 样本${workerFailure ? '并从 Worker 失败回退' : ''}`, async ({
    page
  }, testInfo) => {
    const errors: string[] = []
    const wasmResponses: number[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', (response) => {
      if (response.url().endsWith('/occt-import-js.wasm')) wasmResponses.push(response.status())
    })
    if (workerFailure) await page.route('**/occt-worker.js', (route) => route.abort('failed'))
    // Installed OCCT package's own cube fixture keeps the smoke test free of business data.
    const sample = await readFile(
      'node_modules/.pnpm/occt-import-js@0.0.23/node_modules/occt-import-js/test/testfiles/simple-basic-cube/cube.stp'
    )
    await page.route('**/cad-test-cube.stp', (route) =>
      route.fulfill({ body: sample, contentType: 'application/octet-stream' })
    )
    await page.addInitScript(() => {
      localStorage.setItem(
        'art-file-preview:cad-test',
        JSON.stringify({
          file: {
            url: new URL('cad-test-cube.stp', location.href).href,
            name: '测试立方体.stp',
            fileType: 'stp'
          },
          expiresAt: Date.now() + 120_000
        })
      )
    })
    await page.goto('#/file-preview?key=cad-test')
    await expect(page.locator('.art-file-viewer-page__title strong')).toHaveText('测试立方体.stp')
    await expect.poll(() => wasmResponses, { timeout: 90_000 }).toContain(200)
    const model = page.locator('[data-model-status]')
    await expect(model).toHaveAttribute('data-model-status', 'ready')
    await expect(model).toHaveAttribute(
      'data-model-import',
      workerFailure ? 'main-thread-fallback' : 'worker'
    )
    await expect
      .poll(async () => Number(await model.getAttribute('data-model-mesh-count')))
      .toBeGreaterThan(0)
    await expect(page.locator('.art-file-viewer-page__body canvas').first()).toBeVisible()
    await expect(page.locator('.art-file-viewer-page__body')).not.toContainText('无法打开文件预览')
    await page.screenshot({ path: testInfo.outputPath('cad-cube.png'), animations: 'disabled' })
    expect(errors).toEqual([])
  })
}
