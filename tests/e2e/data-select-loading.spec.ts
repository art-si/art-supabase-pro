import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const theme of ['light', 'dark']) {
  for (const box of ['border-mode', 'shadow-mode']) {
    test(`共享表格空状态主题 ${theme} ${box}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto('/tests/e2e/fixtures/data-select-loading.html?empty-layout')
      await page.evaluate(
        ({ theme, box }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.documentElement.dataset.boxMode = box
        },
        { theme, box }
      )
      await page.getByRole('button', { name: '切换加载' }).click()
      const copy = page.locator('.art-empty-state__copy')
      await expect(copy).toBeVisible()
      await expect
        .poll(() =>
          copy.evaluate((element) => {
            const body = element.closest('.el-table__body-wrapper')
            return (
              !!body &&
              element.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 1
            )
          })
        )
        .toBe(true)
      await page.screenshot({
        path: testInfo.outputPath('empty-theme.png'),
        animations: 'disabled'
      })
    })
  }
}

test('空表格汇总行与加载切换保留完整提示', async ({ page }, testInfo) => {
  await page.goto('/tests/e2e/fixtures/data-select-loading.html?empty-layout')
  const copy = page.locator('.art-empty-state__copy')
  await expect(copy).toBeHidden()
  await page.getByRole('button', { name: '切换加载' }).click()
  await expect(copy).toBeVisible()
  await page.getByRole('button', { name: '切换数据' }).click()
  await expect(page.getByText('汇总测试明细', { exact: true })).toBeVisible()
  await expect(page.locator('.el-table__footer-wrapper')).toBeVisible()
  await expect(page.locator('.el-table')).toHaveCSS('height', '400px')
  await page.getByRole('button', { name: '切换数据' }).click()
  await expect(copy).toBeVisible()
  for (const width of [1440, 390, 900]) {
    await page.setViewportSize({ width, height: 900 })
    await expect
      .poll(() =>
        copy.evaluate((element) => {
          const body = element.closest('.el-table__body-wrapper')
          if (!body) return false
          const contentBounds = element.getBoundingClientRect()
          const bodyBounds = body.getBoundingClientRect()
          return (
            contentBounds.top >= bodyBounds.top - 1 && contentBounds.bottom <= bodyBounds.bottom + 1
          )
        })
      )
      .toBe(true)
    await page.screenshot({
      path: testInfo.outputPath(`empty-summary-${width}.png`),
      animations: 'disabled'
    })
  }
  await page.getByRole('button', { name: '切换加载' }).click()
  await expect(copy).toBeHidden()
  await page.getByRole('button', { name: '切换加载' }).click()
  await expect(copy).toBeVisible()
})

test('共享表格分页随窗口宽度更新且保留当前页', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tests/e2e/fixtures/data-select-loading.html?table')
  const dialog = page.locator('main')
  const pagination = dialog.locator('.el-pagination')
  await expect(pagination.locator(':scope > :first-child')).toHaveClass(/el-pagination__total/)
  await pagination.locator('.btn-next').click()
  await expect(dialog.getByText('选择项 11', { exact: true })).toBeVisible()
  for (const width of [390, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(
      pagination.locator(width < 1024 ? ':scope > :last-child' : ':scope > :first-child')
    ).toHaveClass(/el-pagination__total/)
    await expect(pagination.locator('.el-pagination__sizes')).toHaveCount(width === 900 ? 0 : 1)
    await expect(pagination.locator('.el-pager > li.number')).toHaveCount(width > 1200 ? 7 : 5)
    await expect(dialog.getByText('选择项 11', { exact: true })).toBeVisible()
    await page.screenshot({
      path: testInfo.outputPath(`pagination-resize-${width}.png`),
      animations: 'disabled'
    })
  }
  await pagination.locator('.btn-prev').click()
  await expect(dialog.getByText('选择项 1', { exact: true })).toBeVisible()
})

test('共享表格显式分页配置优先且缩放后不被默认值覆盖', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/data-select-loading.html?table=custom')
  const pagination = page.locator('.el-pagination')
  for (const width of [1440, 390, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(pagination.locator('.el-pager > li.number')).toHaveCount(5)
    await expect(pagination.locator('.el-pagination__total')).toHaveCount(0)
    await expect(pagination.locator('.el-pagination__sizes')).toHaveCount(0)
    await expect(pagination.locator('.el-pagination__jump')).toHaveCount(0)
  }
  await pagination.locator('.btn-next').click()
  await expect(page.getByText('选择项 11', { exact: true })).toBeVisible()
})

for (const mode of ['remote', 'local', 'explicit']) {
  test(`单选分页契约 ${mode}`, async ({ page }) => {
    await page.goto(`/tests/e2e/fixtures/data-select-loading.html?single=${mode}`)
    await page.getByRole('button', { name: '打开选择器' }).click()
    const dialog = page.getByRole('dialog', { name: '单选分页测试', exact: true })
    await expect(dialog.getByText('选择项 1', { exact: true })).toBeVisible()
    if (mode === 'remote') {
      await expect(dialog.locator('.el-pagination')).toBeVisible()
      await dialog.locator('.el-pagination .btn-next').click()
      await expect(dialog.getByText('选择项 11', { exact: true })).toBeVisible()
      await expect(dialog.getByText('选择项 1', { exact: true })).toHaveCount(0)
    } else {
      await expect(dialog.locator('.el-pagination')).toHaveCount(0)
      await expect(dialog.getByText('选择项 21', { exact: true })).toHaveCount(
        mode === 'local' ? 1 : 0
      )
    }
  })
}

for (const empty of [false, true]) {
  test(`调用方加载状态控制选择器${empty ? '空结果' : '选择确认'}`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`/tests/e2e/fixtures/data-select-loading.html${empty ? '?empty' : ''}`)
    await page.getByRole('button', { name: '打开选择器' }).click()
    const dialog = page.getByRole('dialog', { name: '选择测试明细' })
    const content = dialog.locator('.art-data-select-dialog__content')
    await expect(content).toHaveAttribute('aria-busy', 'true')
    await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeDisabled()
    await expect(dialog.getByText('暂无可选明细', { exact: true })).toBeHidden()
    await expect(dialog.getByRole('button', { name: '维护测试明细' })).toBeHidden()
    await page.screenshot({
      path: `.artifacts/data-select-loading-${testInfo.project.name}.png`,
      animations: 'disabled'
    })
    await page
      .getByRole('button', { name: '完成数据加载' })
      .evaluate((button: HTMLButtonElement) => button.click())
    await expect(content).toHaveAttribute('aria-busy', 'false')
    await expect(dialog.getByRole('button', { name: '确定', exact: true })).toBeEnabled()
    if (empty) {
      await expect(dialog.getByText('暂无可选明细', { exact: true })).toBeVisible()
      await expect(dialog.getByText('当前业务没有可选择的明细。', { exact: true })).toBeVisible()
      const emptyAction = dialog.getByRole('button', { name: '维护测试明细' })
      const actionBounds = await emptyAction.boundingBox()
      const contentBounds = await content.boundingBox()
      expect(actionBounds).not.toBeNull()
      expect(contentBounds).not.toBeNull()
      if (actionBounds && contentBounds) {
        expect(actionBounds.y).toBeGreaterThanOrEqual(contentBounds.y)
        // Empty-content measurements settle in the next animation frame after loading ends.
        await expect
          .poll(async () => {
            const action = await emptyAction.boundingBox()
            const region = await content.boundingBox()
            return Boolean(
              action &&
              region &&
              action.y >= region.y &&
              action.y + action.height <= region.y + region.height
            )
          })
          .toBe(true)
      }
      await dialog.getByRole('button', { name: '维护测试明细' }).click()
      await expect(page.getByTestId('selector-result')).toHaveText('maintenance-requested')
      const selectedPanel = dialog.locator('.art-data-select-dialog__selected')
      const selectedDescription = selectedPanel.getByText('从可选列表选择需要关联的记录。')
      await selectedDescription.scrollIntoViewIfNeeded()
      await expect
        .poll(async () => {
          const description = await selectedDescription.boundingBox()
          const region = await selectedPanel
            .locator('.art-data-select-dialog__selected-scrollbar')
            .boundingBox()
          return Boolean(
            description &&
            region &&
            description.y >= region.y &&
            description.y + description.height <= region.y + region.height
          )
        })
        .toBe(true)
      await page.screenshot({
        path: `.artifacts/data-select-empty-${testInfo.project.name}.png`,
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '取消', exact: true }).click()
    } else {
      await expect(dialog.getByText('测试可选明细', { exact: true })).toBeVisible()
      await dialog.locator('.el-table__body-wrapper .el-checkbox').first().click()
      await dialog.getByRole('button', { name: '确定', exact: true }).click()
      await expect(page.getByTestId('selector-result')).toHaveText('["fixture-line"]')
    }
    await expect(dialog).toBeHidden()
    expect(errors).toEqual([])
  })
}

test('共享表格固定列随容器宽度切换且不触发尺寸循环', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.text().startsWith('resize-observer-error')) errors.push(message.text())
  })
  await page.addInitScript(() => {
    window.addEventListener(
      'error',
      (event) => {
        if (event.message.includes('ResizeObserver'))
          console.warn('resize-observer-error', event.message)
      },
      true
    )
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tests/e2e/fixtures/data-select-loading.html?table=fixed')
  await page.locator('.el-pagination .btn-next').click()
  for (const width of [1440, 390, 900, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const fixedCells = page.locator(
      '.el-table__body-wrapper td.el-table-fixed-column--left, .el-table__body-wrapper td.el-table-fixed-column--right'
    )
    await expect(fixedCells).toHaveCount(width < 640 ? 0 : 20)
    await expect(page.getByText('选择项 11', { exact: true })).toBeVisible()
    await expect(page.locator('.el-pagination .el-pager .is-active')).toHaveText('2')
  }
  await page.screenshot({
    path: testInfo.outputPath('fixed-columns-restored.png'),
    animations: 'disabled'
  })
  expect(errors).toEqual([])
})
