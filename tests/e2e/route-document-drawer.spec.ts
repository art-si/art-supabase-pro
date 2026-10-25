import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test('详情打开失败保留关联目标，成功重试后才清理参数', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/route-document-drawer.html')
  const state = page.getByTestId('state')
  await expect
    .poll(async () => JSON.parse((await state.textContent()) ?? '{}'))
    .toEqual({
      error: true,
      loading: false,
      documentId: 'original',
      opened: '',
      reads: 1
    })
  await page.getByRole('button', { name: '恢复并重试' }).click()
  await expect
    .poll(async () => JSON.parse((await state.textContent()) ?? '{}'))
    .toEqual({
      error: false,
      loading: false,
      documentId: null,
      opened: 'original',
      reads: 2
    })
})
