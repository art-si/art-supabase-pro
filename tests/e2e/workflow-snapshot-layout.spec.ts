import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('审批资料与公共卡片按内容撑开，固定高度卡片保持内部滚动', async ({ page }, testInfo) => {
  await page.route('**/rest/v1/**', (route) =>
    route.fulfill({
      json: {
        instanceId: 'instance-a',
        businessId: 'contract-a',
        businessType: 'scm_sales_contract',
        title: '测试合同',
        fields: ['项目', '客户', '合同编号', '合同金额', '说明'].map((label) => ({
          label,
          value: label === '合同金额' ? '65948.4' : '测试长内容'.repeat(25)
        })),
        metrics: [],
        warnings: [],
        attachments: []
      }
    })
  )
  await page.goto(
    `/tests/e2e/fixtures/workflow-snapshot-layout.html?theme=${testInfo.project.name.includes('dark') ? 'dark' : 'light'}&box=${testInfo.project.name.includes('shadow') ? 'shadow-mode' : 'border-mode'}`
  )
  const checkContainment = async (selector: string) => {
    const results = await page.locator(selector).evaluateAll((cards) =>
      cards.map((card) => {
        const bounds = card.getBoundingClientRect()
        const body = card.querySelector('.art-section-card__body')!.getBoundingClientRect()
        return {
          contained: body.bottom <= bounds.bottom + 1,
          overflow: card.scrollWidth > card.clientWidth + 1
        }
      })
    )
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((result) => result.contained && !result.overflow)).toBe(true)
  }
  await expect(page.getByTestId('generic-content')).toBeVisible()
  await checkContainment(
    '[data-testid="cards"] > .art-section-card:not(:has([data-testid="bounded-content"]))'
  )
  const wrap = page.locator(
    '.art-section-card:has([data-testid="bounded-content"]) .el-scrollbar__wrap'
  )
  expect(await wrap.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await wrap.evaluate((el) => {
    el.scrollTop = el.scrollHeight
  })
  expect(await wrap.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  for (const state of ['loading', 'empty', 'error']) {
    await page.getByRole('button', { name: state, exact: true }).click()
    await checkContainment(
      '[data-testid="cards"] > .art-section-card:not(:has([data-testid="bounded-content"]))'
    )
  }
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByTestId('generic-content')).toBeVisible()
  for (const action of ['通过', '驳回', '详情']) {
    await page.getByRole('button', { name: `打开${action}`, exact: true }).click()
    const overlay = page.getByRole('dialog')
    await expect(overlay.locator('.workflow-business-snapshot')).toBeVisible()
    await checkContainment('[role="dialog"] .workflow-business-snapshot')
    const descriptions = overlay.locator('.workflow-business-snapshot .art-descriptions')
    await expect(descriptions).toBeVisible()
    const widths = await descriptions
      .locator('tr')
      .first()
      .locator('.el-descriptions__content')
      .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width))
    if (widths.length === 2) expect(Math.abs(widths[0] - widths[1])).toBeLessThan(2)
    expect(await overlay.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`snapshot-${action}.png`), fullPage: true })
    const scroll = overlay
      .locator(
        action === '详情'
          ? '.art-drawer__viewport > .el-scrollbar > .el-scrollbar__wrap'
          : '.art-dialog__viewport > .el-scrollbar .el-scrollbar__wrap'
      )
      .first()
    if (await scroll.count())
      await scroll.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
    if (action !== '详情') await expect(overlay.getByRole('textbox')).toBeInViewport()
    else await expect(overlay.getByText('后续实例资料', { exact: true })).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`snapshot-${action}-lower.png`),
      fullPage: true
    })
    await page.keyboard.press('Escape')
    await expect(overlay).toBeHidden()
  }
})
