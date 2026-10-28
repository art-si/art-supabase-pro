import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('synthetic front/back text images pass through local worker and side-specific review proposal', async ({
  page
}) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:')) externalRequests.push(request.url())
  })
  await page.goto('/tests/e2e/fixtures/tms-driver-local-ocr.html')
  await page.getByRole('button', { name: '运行正反面识别' }).click()
  const output = page.locator('#result')
  await expect(output).not.toHaveText('正在本地识别', { timeout: 120_000 })
  const results = JSON.parse((await output.textContent()) ?? '') as Array<{
    side: string
    imageBytes: number
    text: string
    confidence: number
    proposal: { document: Record<string, string | string[] | null> }
  }>
  expect(results).toHaveLength(2)
  expect(results.map((result) => result.side)).toEqual(['idCardFrontUrl', 'idCardBackUrl'])
  expect(results.every((result) => result.imageBytes > 0 && result.text.length > 0)).toBe(true)
  expect(results[0].proposal.document.driverName).toBe('测试司机甲')
  expect(results[0].proposal.document.gender).toBe('男')
  expect(results[0].proposal.document.birthDate).toBe('1990-01-01')
  expect(results[0].proposal.document.idCardNo).toBe('990000199001010019')
  expect(results[0].proposal.document.idCardIssuer).toBeUndefined()
  expect(results[1].proposal.document.idCardValidFrom).toBe('2020-01-01')
  expect(results[1].proposal.document.idCardValidTo).toBe('2030-01-01')
  expect(results[1].proposal.document.idCardNo).toBeUndefined()
  expect(externalRequests).toEqual([])
  console.info(JSON.stringify(results))
})
