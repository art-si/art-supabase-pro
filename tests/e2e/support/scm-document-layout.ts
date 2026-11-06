import { expect, type Locator } from '@playwright/test'

/** Check the rendered grid, not just the configured span. Extra fields must share the header form. */
export async function expectCompactDocumentForm(
  dialog: Locator,
  numberLabel: string,
  businessLabel: string
): Promise<void> {
  const labels = [numberLabel, '单据类型', '项目名称', businessLabel]
  const fields = labels.map((label) =>
    dialog.locator('.el-form-item').filter({ hasText: label }).first()
  )
  for (const field of fields) await expect(field).toBeVisible()
  const boxes = await Promise.all(fields.slice(0, 3).map((field) => field.boundingBox()))
  expect(boxes.every(Boolean)).toBe(true)
  expect(
    Math.max(...boxes.map((box) => box!.y)) - Math.min(...boxes.map((box) => box!.y))
  ).toBeLessThan(2)
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x)
  expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x)
  const sameForm = await fields[0].evaluate((field, label) => {
    const form = field.closest('form')
    return [...(form?.querySelectorAll('.el-form-item__label') ?? [])].some(
      (item) => item.textContent?.trim() === label
    )
  }, businessLabel)
  expect(sameForm).toBe(true)
  await expect(dialog.getByText('业务信息', { exact: true })).toHaveCount(0)
  await expect(dialog.getByText('单据', { exact: true })).toHaveCount(0)
}

export async function expectUnifiedDocumentDetail(
  drawer: Locator,
  businessValue: string
): Promise<void> {
  const information = drawer.getByRole('tabpanel', { name: '单据信息', exact: true })
  await expect(information.getByText(businessValue, { exact: true })).toBeVisible()
  await expect(information.getByText('单据基本信息', { exact: true })).toBeVisible()
  await expect(information.getByText('业务信息', { exact: true })).toHaveCount(0)
  await expect(
    information
      .locator('.art-descriptions')
      .first()
      .locator('tr')
      .first()
      .locator('.el-descriptions__label')
  ).toHaveCount(3)
}
