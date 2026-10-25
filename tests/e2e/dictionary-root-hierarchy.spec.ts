import { expect, test } from '@playwright/test'

test('dictionary root contains directories and MDM dictionaries follow the business hierarchy', async ({
  page
}, testInfo) => {
  test.setTimeout(120_000)
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto('#/data-center/dict', { waitUntil: 'domcontentloaded' })

  const panel = page.locator('.dict-tree-panel')
  const tree = panel.locator('.dict-type-tree__virtual-tree')
  const retry = panel.getByRole('button', { name: '重新加载', exact: true })
  await expect(tree.or(retry)).toBeVisible({ timeout: 60_000 })
  if (await retry.isVisible()) await retry.click()
  await expect(tree).toBeVisible({ timeout: 60_000 })
  await expect(panel).toContainText(/\d+ 个目录 · \d+ 个类型/)
  await expect(panel.locator('.dict-type-tree__code')).toHaveCount(0)

  const expandDirectory = async (name: string): Promise<void> => {
    const label = panel.getByText(name, { exact: true })
    await expect(label).toBeVisible()
    const node = label.locator(
      'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " el-tree-node ")][1]'
    )
    await node.locator('.el-tree-node__expand-icon').click()
  }

  await expandDirectory('MDM主数据')
  await expandDirectory('生产主数据')
  await expandDirectory('工作中心')
  await expect(panel.getByText('人员安排', { exact: true })).toBeVisible()
  await expect(panel.locator('.dict-type-tree__code')).not.toHaveCount(0)
  await panel.screenshot({ path: testInfo.outputPath('dictionary-mdm-hierarchy.png') })

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(panel.getByText('人员安排', { exact: true })).toBeVisible()
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  )
  expect(hasHorizontalOverflow).toBe(false)
  await panel.screenshot({ path: testInfo.outputPath('dictionary-mdm-hierarchy-1280.png') })

  await panel.getByRole('button', { name: '新增根节点', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增字典节点' })
  await expect(dialog).toBeVisible()
  await dialog.locator('.el-radio').filter({ hasText: '字典类型' }).click()
  await dialog.getByRole('button', { name: '创建节点', exact: true }).click()
  await expect(dialog.getByText('请选择字典类型所属目录', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  expect(pageErrors).toEqual([])
})
