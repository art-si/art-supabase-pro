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

test('切换关联目标后旧读取不能覆盖新单据', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/route-document-drawer.html?success=1&pause=1')
  const state = page.getByTestId('state')
  const current = async () => JSON.parse((await state.textContent()) ?? '{}')
  await expect.poll(current).toMatchObject({ reads: 1, loading: true })
  await page.getByRole('button', { name: '切换到第二单据', exact: true }).click()
  await expect.poll(current).toMatchObject({ reads: 2, loading: true })
  await page.getByRole('button', { name: '继续读取', exact: true }).click()
  await expect
    .poll(current)
    .toEqual({ error: false, loading: false, documentId: null, opened: 'second', reads: 2 })
})

test('离开页面取消迟到的关联打开', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/route-document-drawer.html?success=1&pause=1')
  const state = page.getByTestId('state')
  const current = async () => JSON.parse((await state.textContent()) ?? '{}')
  await expect.poll(current).toMatchObject({ reads: 1, loading: true })
  await page.getByRole('button', { name: '离开关联页面', exact: true }).click()
  await page.getByRole('button', { name: '继续读取', exact: true }).click()
  await expect
    .poll(current)
    .toEqual({ error: false, loading: false, documentId: null, opened: '', reads: 1 })
})

test('撤回查看权限后不打开旧数据，恢复权限重新读取', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/route-document-drawer.html?success=1&pause=1')
  const state = page.getByTestId('state')
  const current = async () => JSON.parse((await state.textContent()) ?? '{}')
  await expect.poll(current).toMatchObject({ reads: 1, loading: true })
  await page.getByRole('button', { name: '撤回查看权限', exact: true }).click()
  await page.getByRole('button', { name: '继续读取', exact: true }).click()
  await expect.poll(current).toMatchObject({ loading: false, opened: '', reads: 1 })
  await page.getByRole('button', { name: '恢复查看权限', exact: true }).click()
  await expect
    .poll(current)
    .toEqual({ error: false, loading: false, documentId: null, opened: 'original', reads: 2 })
})
