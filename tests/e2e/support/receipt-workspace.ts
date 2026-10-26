import { expect, type Locator, type Page } from '@playwright/test'

export async function chooseReceiptReference(
  page: Page,
  drawer: Locator,
  field: string,
  title: string,
  text: string
): Promise<void> {
  await drawer
    .locator('.el-form-item')
    .filter({ has: page.getByText(field, { exact: true }) })
    .getByRole('textbox')
    .click()
  const picker = page.getByRole('dialog', { name: title, exact: true })
  await picker.getByRole('row').filter({ hasText: text }).click()
  await picker.getByRole('button', { name: '确定', exact: true }).click()
  await expect(picker).toBeHidden()
}

export async function selectReceiptRow(row: Locator): Promise<void> {
  if (!(await row.getByRole('checkbox').first().isChecked()))
    await row.locator('.el-checkbox').first().click()
}
