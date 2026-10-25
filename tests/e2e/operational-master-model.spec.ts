import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test('主数据新增与复制保留业务值并重置自动编码', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  await page.goto('/tests/e2e/fixtures/operational-master-model.html')
  await page.getByRole('button', { name: '新增测试项目' }).click()
  let dialog = page.getByRole('dialog', { name: '新增项目', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '项目编码' })).toHaveValue('')
  await expect(dialog.getByRole('textbox', { name: /项目名称/ })).toHaveValue('')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: '复制测试项目' }).click()
  dialog = page.getByRole('dialog', { name: '复制项目', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: '项目编码' })).toHaveValue('')
  await expect(dialog.getByRole('textbox', { name: /项目名称/ })).toHaveValue('原项目')
  await expect(dialog.getByRole('textbox', { name: '备注' })).toHaveValue('原项目备注')
  await expect(dialog.getByRole('button', { name: '创建项目', exact: true })).toBeEnabled()
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(size.content).toBeLessThanOrEqual(size.width + 1)
  await page.screenshot({ path: testInfo.outputPath('master-copy.png') })
})
