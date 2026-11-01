import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const item of [
  { feature: 'master', search: '搜索分组', all: '全部分组' },
  { feature: 'warehouse', search: '搜索仓库分组', all: '全部仓库' },
  { feature: 'material', search: '搜索分类', all: '全部分类' },
  { feature: 'bom', search: '搜索 BOM 分组', all: '全部分组' },
  { feature: 'smis-document', search: '搜索文档分类名称', all: '全部分类' },
  { feature: 'smis-violation', search: '搜索违章分类名称或编码', all: '全部分类' },
  { feature: 'smis-material', search: '搜索物料类别名称或编码', all: '全部物料' },
  { feature: 'smis-department', search: '搜索部门名称或编码', all: '全部部门' },
  { feature: 'smis-question', search: '搜索题库分类', all: '全部题目' },
  { feature: 'smis-waste', search: '搜索危废分类', all: '全部名录' },
  { feature: 'smis-storage', search: '搜索存放位置名称或编码', all: '全部位置' },
  { feature: 'smis-equipment', search: '搜索设备分类名称或编码', all: '全部分类' },
  { feature: 'smis-position', search: '搜索组织或岗位', all: '全部岗位' },
  { feature: 'smis-responsibility', search: '搜索组织名称或编码', all: '全部组织' },
  { feature: 'smis-qualification', search: '搜索资质类别名称或编码', all: '全部资质类别' },
  { feature: 'smis-risk-org', search: '搜索组织名称或编码', all: '' },
  { feature: 'smis-leave-org', search: '搜索组织名称或编码', all: '全部员工' },
  { feature: 'smis-operation', search: '搜索作业类型', all: '全部作业类型' },
  { feature: 'smis-tool-org', search: '搜索组织名称或编码', all: '全部员工' },
  { feature: 'smis-ppe-org', search: '搜索组织名称或编码', all: '全部员工' },
  { feature: 'smis-dimension', search: '搜索台账结构树', all: '全部设备' },
  { feature: 'smis-scene', search: '搜索四色图场景', all: '' }
]) {
  test(`${item.feature} 导航由卡片拥有边缘滚动且筛选、状态、窄屏保持`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto(`/tests/e2e/fixtures/section-card-navigation.html?feature=${item.feature}`)
    const card = page.locator('.art-section-card')
    await expect(card).toBeVisible()
    await expect(card.locator('.el-scrollbar')).toHaveCount(1)
    const scrollbar = card.locator('.art-section-card__scrollbar')
    const wrap = scrollbar.locator(':scope > .el-scrollbar__wrap')
    const toolbar = card.locator('.art-section-card__toolbar')
    const search = card.getByRole('textbox', { name: item.search, exact: true })
    await expect(search).toBeVisible()
    const toolbarBefore = (await toolbar.boundingBox())!
    const footer = card.locator('.art-section-card__footer')
    const footerBefore = (await footer.count()) ? await footer.boundingBox() : null
    const cardBox = (await card.boundingBox())!
    const scrollBox = (await scrollbar.boundingBox())!
    expect(Math.abs(cardBox.x + cardBox.width - scrollBox.x - scrollBox.width)).toBeLessThanOrEqual(
      2
    )
    expect(await wrap.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(0)
    await wrap.evaluate((node) => (node.scrollTop = node.scrollHeight))
    const isOperation = item.feature === 'smis-operation'
    const nodes = isOperation
      ? card.locator('.operation-type-navigator__list > button')
      : card.getByRole('treeitem')
    const lastNode = nodes.filter({ hasText: '测试分组 39' }).last()
    const lastContent = isOperation ? lastNode : lastNode.locator(':scope > .el-tree-node__content')
    await expect(lastNode).toBeVisible()
    await lastContent.click()
    await expect(page.getByLabel('选中分组')).toHaveText('group-39')
    const rowBox = (await lastContent.boundingBox())!
    expect(cardBox.x + cardBox.width - rowBox.x - rowBox.width).toBeGreaterThanOrEqual(15)
    expect((await toolbar.boundingBox())!.y).toBeCloseTo(toolbarBefore.y, 1)
    if (footerBefore) {
      expect((await footer.boundingBox())!.y).toBeCloseTo(footerBefore.y, 1)
      expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(footerBefore.y + 1)
      await expect(footer.getByText('当前范围', { exact: true })).toBeVisible()
    }
    await page.screenshot({ path: info.outputPath(`${item.feature}-desktop-light.png`) })
    await search.fill('测试分组 39')
    await expect(nodes.filter({ visible: true })).toHaveCount(1)
    await search.fill('不存在的节点')
    await expect(
      card.getByText(item.feature === 'smis-scene' ? '暂无匹配场景' : '未找到匹配项', {
        exact: true
      })
    ).toBeVisible()
    await search.fill('')
    if (item.all) {
      await card.getByRole('button', { name: new RegExp(item.all) }).click()
      await expect(page.getByLabel('选中分组')).toHaveText(
        item.feature.startsWith('smis-') && !isOperation ? 'all' : ''
      )
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '深色主题', exact: true }).click()
    await page.evaluate(() => {
      document.documentElement.dataset.boxMode = 'shadow-mode'
    })
    if (item.feature === 'master') {
      await expect(search).toBeHidden()
      expect((await card.boundingBox())!.height).toBeLessThan(140)
      await card.getByRole('button', { name: '展开分组', exact: true }).click()
    }
    await search.fill('测试分组 39')
    await expect(lastNode).toBeVisible()
    expect(await card.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(
      1
    )
    await page.screenshot({ path: info.outputPath(`${item.feature}-mobile-dark.png`) })
    if (item.feature === 'master') {
      await card.getByRole('button', { name: '收起分组', exact: true }).click()
      await card.getByRole('button', { name: '展开分组', exact: true }).click()
      await expect(search).toHaveValue('测试分组 39')
    }
    await search.fill('')
    await page.getByRole('button', { name: 'error', exact: true }).click()
    await expect(card.getByText('导航加载失败，请重试', { exact: true })).toBeVisible()
    await card.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(page.getByLabel('最近操作')).toHaveText('刷新导航')
    await expect(
      isOperation ? card.locator('.operation-type-navigator__list') : card.getByRole('tree')
    ).toBeVisible()
    await page.getByRole('button', { name: 'loading', exact: true }).click()
    await expect(card).toHaveAttribute('aria-busy', 'true')
    await page.getByRole('button', { name: 'empty', exact: true }).click()
    await expect(card.locator('.art-empty-state')).toBeVisible()
    await page.goto(
      `/tests/e2e/fixtures/section-card-navigation.html?feature=${item.feature}&readonly`
    )
    await expect(card).toBeVisible()
    if (item.feature === 'master')
      await card.getByRole('button', { name: '展开分组', exact: true }).click()
    await page.getByRole('button', { name: '深色主题', exact: true }).click()
    await expect(card.getByRole('button', { name: /^新增/ })).toHaveCount(0)
    await expect(
      isOperation ? card.locator('.operation-type-navigator__list') : card.getByRole('tree')
    ).toBeVisible()
    await page.screenshot({ path: info.outputPath(`${item.feature}-readonly-mobile-dark.png`) })
    expect(errors).toEqual([])
  })
}
