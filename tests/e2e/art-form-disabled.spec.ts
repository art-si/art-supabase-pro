import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.setTimeout(120_000)
test('整个表单禁用优先于字段配置，解除后保留字段只读', async ({ page }) => {
  await prepareIsolatedSession(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/art-form-disabled.html')
  const input = page.getByRole('textbox', { name: '普通输入', exact: true })
  const toggle = page.getByRole('switch', { name: '普通开关', exact: true })
  const number = page.getByRole('spinbutton', { name: '普通数字', exact: true })
  const nativeNumber = page.getByRole('spinbutton', { name: '原生数字', exact: true })
  const select = page.getByRole('combobox', { name: '普通选择', exact: true })
  const fixed = page.getByRole('textbox', { name: '字段只读', exact: true })
  const checkbox = page.getByRole('checkbox', { name: '复选项', exact: true })
  const radio = page.getByRole('radio', { name: '单选项', exact: true })
  const fixedCheckbox = page.getByRole('checkbox', { name: '锁定复选项', exact: true })
  const submit = page.getByRole('button', { name: '提交验收', exact: true })
  const reset = page.getByRole('button', { name: '重置验收', exact: true })
  for (const control of [
    input,
    toggle,
    number,
    nativeNumber,
    select,
    fixed,
    checkbox,
    radio,
    fixedCheckbox,
    submit,
    reset
  ])
    await expect(control).toBeDisabled()
  await page.getByRole('button', { name: '切换表单禁用', exact: true }).click()
  for (const control of [
    input,
    toggle,
    number,
    nativeNumber,
    select,
    checkbox,
    radio,
    submit,
    reset
  ])
    await expect(control).toBeEnabled()
  await expect(fixed).toBeDisabled()
  await expect(fixedCheckbox).toBeDisabled()
  await input.fill('编辑名称')
  await submit.click()
  await expect(page.getByLabel('提交次数')).toHaveText('1')
  await page.getByRole('button', { name: '切换表单禁用', exact: true }).click()
  await expect(input).toBeDisabled()
  await expect(input).toHaveValue('编辑名称')
  await expect(submit).toBeDisabled()
  await expect(reset).toBeDisabled()
  expect(errors).toEqual([])
})
