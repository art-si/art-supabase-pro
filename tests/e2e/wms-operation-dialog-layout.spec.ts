import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const trigger of [
  '测试办理领料',
  '测试调拨创建',
  '测试库存调整',
  '测试库存组装',
  '测试盘点创建',
  '测试施工号创建',
  '测试出库申请创建',
  '测试生产单据创建',
  '测试盘盈单创建',
  '测试调拨申请创建'
]) {
  test(`${trigger}表单窄屏可操作且取消不提交`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let writes = 0
    await page.route('**/rest/v1/**', (route) => {
      if (route.request().method() !== 'GET') writes++
      const path = new URL(route.request().url()).pathname
      return route.fulfill({ json: path.endsWith('/sys_menu') ? { id: 'menu-test' } : [] })
    })
    await page.goto('/tests/e2e/fixtures/wms-operation-retry.html')
    if (testInfo.project.name.includes('dark')) {
      await page.evaluate(() => document.documentElement.classList.add('dark'))
    }
    if (testInfo.project.name.includes('shadow')) {
      await page.evaluate(() =>
        document.documentElement.setAttribute('data-box-mode', 'shadow-mode')
      )
    }
    await page.getByRole('button', { name: trigger, exact: true }).click()
    const dialog = page.locator('.el-dialog:visible, .el-drawer:visible')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.art-entity-summary')).toBeVisible()
    if (trigger === '测试出库申请创建') {
      await expect(
        dialog.getByText('当前范围没有已启用库存的组织。', { exact: false })
      ).toBeVisible()
      const date = dialog.locator('.art-form .el-date-editor')
      await date.scrollIntoViewIfNeeded()
      const widthRatio = await date.evaluate(
        (element) =>
          element.getBoundingClientRect().width /
          element.closest('.el-form-item__content')!.getBoundingClientRect().width
      )
      expect(widthRatio).toBeGreaterThan(0.95)
      await page.screenshot({
        path: testInfo.outputPath('issue-request-date.png'),
        animations: 'disabled'
      })
    }
    const dateWidths = await dialog.locator('.art-form .el-date-editor').evaluateAll((elements) =>
      elements.map((element) => ({
        label: element.closest('.el-form-item')?.querySelector('.el-form-item__label')?.textContent,
        ratio:
          element.getBoundingClientRect().width /
          element.closest('.el-form-item__content')!.getBoundingClientRect().width
      }))
    )
    for (const date of dateWidths)
      expect(date.ratio, date.label ?? '日期控件').toBeGreaterThan(0.95)
    if (trigger === '测试盘盈单创建') {
      await dialog.getByRole('button', { name: '全屏', exact: true }).click()
      await expect(dialog.getByRole('button', { name: '退出全屏', exact: true })).toBeVisible()
      const lowerDescription = dialog.getByText('支持多选物料，编码、规格和默认单位自动带入。', {
        exact: true
      })
      await lowerDescription.scrollIntoViewIfNeeded()
      await expect(lowerDescription).toBeInViewport()
      const lowerBounds = await lowerDescription.boundingBox()
      const footerBounds = await dialog.locator('.el-drawer__footer').boundingBox()
      expect(lowerBounds).not.toBeNull()
      expect(footerBounds).not.toBeNull()
      expect(lowerBounds!.y + lowerBounds!.height).toBeLessThanOrEqual(footerBounds!.y)
      await page.screenshot({
        path: testInfo.outputPath('gain-fullscreen-bottom.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '退出全屏', exact: true }).click()
    }
    if (trigger === '测试施工号创建') {
      await expect(dialog.getByText('启用', { exact: true })).toBeVisible()
      await expect(dialog.getByText('关闭', { exact: true })).toBeVisible()
    }
    if (
      [
        '测试库存组装',
        '测试施工号创建',
        '测试出库申请创建',
        '测试盘盈单创建',
        '测试调拨申请创建'
      ].includes(trigger)
    ) {
      await dialog.getByRole('button', { name: /^(确认|确定|保存)$/ }).click()
      await expect(dialog.locator('.el-form-item__error').first()).toBeVisible()
      await expect(dialog).toBeVisible()
      expect(writes).toBe(0)
      await page.screenshot({
        path: testInfo.outputPath('wms-empty-required.png'),
        animations: 'disabled'
      })
    }
    const dimensions = await dialog.evaluate((el) => ({
      overflow: el.scrollWidth - el.clientWidth,
      width: el.getBoundingClientRect().width,
      viewport: document.documentElement.clientWidth
    }))
    expect(dimensions.overflow).toBeLessThanOrEqual(1)
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport)
    await dialog.getByRole('button', { name: '取消', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('wms-operation-form.png'),
      animations: 'disabled'
    })
    const lastField = dialog.locator('textarea').last()
    if (await lastField.count()) {
      await lastField.scrollIntoViewIfNeeded()
      await expect(lastField).toBeInViewport()
    }
    await page.screenshot({
      path: testInfo.outputPath('wms-operation-form-lower.png'),
      animations: 'disabled'
    })
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(writes).toBe(0)
    expect(errors).toEqual([])
  })
}
