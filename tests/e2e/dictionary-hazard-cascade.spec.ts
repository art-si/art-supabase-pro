import { expect, test, type Page } from '@playwright/test'

interface CascadeDictionaryCase {
  code: string
  typeName: string
  parentFieldLabel: string
  parentOption: string
  parentDescription: string
}

const cascadeDictionaryCases: CascadeDictionaryCase[] = [
  {
    code: 'smisSecondaryHazardCategory',
    typeName: '二级隐患类别',
    parentFieldLabel: '所属一级隐患类别',
    parentOption: '基础管理',
    parentDescription:
      '必选。选择后，“二级隐患类别”只会在对应的“一级隐患类别”下显示；若列表为空，请先在“一级隐患类别”中新增可用字典项。'
  },
  {
    code: 'smisHazardContent',
    typeName: '隐患内容',
    parentFieldLabel: '所属二级隐患类别',
    parentOption: '事故隐患排查治理',
    parentDescription:
      '必选。选择后，“隐患内容”只会在对应的“二级隐患类别”下显示；若列表为空，请先在“二级隐患类别”中新增可用字典项。'
  }
]

async function openDictionaryType(page: Page, dictionary: CascadeDictionaryCase): Promise<void> {
  const treePanel = page.locator('.dict-tree-panel')
  await treePanel.getByPlaceholder('搜索目录名称或字典编码').fill(dictionary.code)

  const code = treePanel.locator('.dict-type-tree__code', { hasText: dictionary.code }).first()
  await expect(code).toBeVisible()
  await code.locator('xpath=ancestor::*[contains(@class,"dict-type-tree__node")]').click()

  const tablePanel = page.locator('.dict-table-panel')
  await expect(tablePanel).toContainText(dictionary.typeName)
  await tablePanel.getByRole('button', { name: '新增' }).first().click()
}

async function expectDialogScrollsInternally(page: Page): Promise<void> {
  const metrics = await page.locator('.art-dialog:visible').evaluate((dialog) => {
    const overlay = dialog.closest<HTMLElement>('.el-overlay-dialog')
    const scrollbar = dialog.querySelector<HTMLElement>(
      '.art-dialog__scrollbar .el-scrollbar__wrap'
    )
    const dialogRect = dialog.getBoundingClientRect()

    return {
      dialogTop: dialogRect.top,
      dialogBottom: dialogRect.bottom,
      viewportHeight: window.innerHeight,
      overlayClientHeight: overlay?.clientHeight ?? 0,
      overlayScrollHeight: overlay?.scrollHeight ?? 0,
      scrollbarClientHeight: scrollbar?.clientHeight ?? 0,
      scrollbarScrollHeight: scrollbar?.scrollHeight ?? 0
    }
  })

  expect(metrics.dialogTop).toBeGreaterThanOrEqual(0)
  expect(metrics.dialogBottom).toBeLessThanOrEqual(metrics.viewportHeight)
  expect(metrics.overlayScrollHeight).toBeLessThanOrEqual(metrics.overlayClientHeight + 1)
  expect(metrics.scrollbarScrollHeight).toBeGreaterThan(metrics.scrollbarClientHeight)
}

test('隐患三级字典可在数据字典中建立明确的父子关系', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('#/data-center/dict', { waitUntil: 'domcontentloaded' })
  await expect(page).not.toHaveURL(/#\/auth\/login/)
  await expect(page.locator('.dict-page')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })

  const treePanel = page.locator('.dict-tree-panel')
  const expandToggle = treePanel.locator('.dict-type-tree__expand-toggle')
  await expect(treePanel.locator('.dict-type-tree__node').first()).toBeVisible()
  if ((await expandToggle.getAttribute('aria-label')) === '全部收起字典目录') {
    await expandToggle.click()
  }
  await expect(expandToggle).toHaveAccessibleName('全部展开字典目录')
  await expandToggle.click()
  await expect(expandToggle).toHaveAccessibleName('全部收起字典目录')
  await expandToggle.click()
  await expect(expandToggle).toHaveAccessibleName('全部展开字典目录')
  await expandToggle.click()
  await expect(expandToggle).toHaveAccessibleName('全部收起字典目录')

  await treePanel.getByPlaceholder('搜索目录名称或字典编码').fill('vmsFleetHealthRisk')
  await expect(treePanel).toContainText('车辆管理')
  await expect(treePanel).toContainText('车队健康风险')

  for (const dictionary of cascadeDictionaryCases) {
    await openDictionaryType(page, dictionary)

    const dialog = page.getByRole('dialog', { name: '新增字典' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.art-dialog__scrollbar')).toBeVisible()
    await expectDialogScrollsInternally(page)
    await expect(dialog.getByText(dictionary.parentFieldLabel, { exact: true })).toBeVisible()

    const parentField = dialog
      .locator('.el-form-item')
      .filter({ hasText: dictionary.parentFieldLabel })
    await expect(parentField).toContainText(dictionary.parentDescription)
    await expect(parentField.getByLabel('查看帮助信息')).toHaveCount(0)
    await parentField.locator('.el-select').click()
    await expect(page.locator('.el-select-dropdown:visible')).toContainText(dictionary.parentOption)

    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: '取消' }).click()
    await expect(dialog).toBeHidden()
  }
})

test('字典节点弹窗使用通用级联配置和分区布局', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('#/data-center/dict', { waitUntil: 'domcontentloaded' })
  await expect(page).not.toHaveURL(/#\/auth\/login/)
  await expect(page.locator('.dict-page')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })

  await page.getByLabel('新增根节点').click()
  const dialog = page.getByRole('dialog', { name: '新增字典节点' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('先定义节点用途，再配置目录归属与级联关系')
  await expect(dialog.getByText('节点定义', { exact: true })).toBeVisible()
  await expect(dialog.getByText('层级关系', { exact: true })).toBeVisible()
  await expect(dialog.getByText('展示设置', { exact: true })).toBeVisible()
  await expect(dialog.getByText('补充说明', { exact: true })).toBeVisible()

  await dialog.locator('.el-radio').filter({ hasText: '字典类型' }).click()
  const cascadeField = dialog.locator('.el-form-item').filter({ hasText: '级联上级类型' })
  await expect(cascadeField).toBeVisible()
  await expect(cascadeField).toContainText(
    '可选。配置后，本类型的每个字典项都必须归属到所选上级类型的一个字典项；适用于一级、二级等分类级联。'
  )
  await expect(cascadeField.getByLabel('查看帮助信息')).toHaveCount(0)

  await cascadeField.locator('.el-select').click()
  await expect(page.locator('.el-select-dropdown:visible')).toContainText('一级隐患类别')
  await page.keyboard.press('Escape')
  await dialog.getByRole('button', { name: '取消' }).click()
  await expect(dialog).toBeHidden()
})
