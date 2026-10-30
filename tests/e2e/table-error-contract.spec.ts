import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })

const fixture = (mode: string): string =>
  `/tests/e2e/fixtures/table-error-contract.html?mode=${mode}`

for (const width of [1440, 570]) {
  test(`原始错误呈现失败与重试恢复 ${width}px`, async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.goto(fixture('raw'))

    await expect(page.getByText('数据加载失败')).toBeVisible()
    await expect(page.getByText('must-not-show')).toHaveCount(0)
    await expect(page.locator('body')).toHaveAttribute('data-details-identity', 'true')
    await expect(page.locator('body')).toHaveAttribute('data-success-calls', '0')
    await expect(page.locator('body')).toHaveAttribute('data-error-calls', '1')
    await expect(page.locator('.el-message')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('select * from private_table')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({
      path: test.info().outputPath(`table-error-${width}.png`),
      fullPage: true
    })

    await page.getByRole('button', { name: '重新加载' }).click()
    await expect(page.getByText('恢复后的记录')).toBeVisible()
    await expect(page.locator('body')).toHaveAttribute('data-success-calls', '1')
    await expect(page.locator('body')).toHaveAttribute('data-list-attempts', '2')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(pageErrors).toEqual([])
    await page.screenshot({
      path: test.info().outputPath(`table-recovered-${width}.png`),
      fullPage: true
    })
  })
}

for (const { theme, boxMode } of [
  { theme: 'light', boxMode: 'border-mode' },
  { theme: 'dark', boxMode: 'shadow-mode' }
]) {
  test(`受限高度错误区可滚动至重试按钮并用键盘恢复 ${theme} ${boxMode}`, async ({
    page
  }, testInfo) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.setViewportSize({ width: 570, height: 360 })
    await page.goto(fixture('bounded-error'))
    await page.evaluate(
      ({ theme, boxMode }) => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        document.documentElement.dataset.boxMode = boxMode
      },
      { theme, boxMode }
    )
    const errorRegion = page.locator('.art-table-query__error-state')
    await expect(errorRegion.getByRole('status')).toContainText('数据加载失败')
    const wrap = errorRegion.locator('.el-scrollbar__wrap')
    await expect
      .poll(() => wrap.evaluate((element) => element.scrollHeight - element.clientHeight))
      .toBeGreaterThan(20)
    const retry = errorRegion.getByRole('button', { name: '重新加载' })
    await wrap.focus()
    await page.keyboard.press('Tab')
    await expect(retry).toBeFocused()
    await expect.poll(() => wrap.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await page.screenshot({ path: testInfo.outputPath('bounded-error-before-retry.png') })
    await page.keyboard.press('Enter')
    await expect(page.getByText('恢复后的记录')).toBeVisible()
    await expect(errorRegion).toHaveCount(0)
    expect(pageErrors).toEqual([])
  })
}

for (const mode of ['mask', 'adapted', 'nested']) {
  test(`${mode} 错误不能进入成功状态`, async ({ page }) => {
    await page.goto(fixture(mode))
    await expect(page.getByText('数据加载失败')).toBeVisible()
    await expect(page.getByText('must-not-show')).toHaveCount(0)
    await expect(page.locator('body')).toHaveAttribute('data-details-identity', 'true')
    await expect(page.locator('body')).toHaveAttribute('data-success-calls', '0')
    await expect(page.locator('body')).toHaveAttribute(
      'data-adapter-calls',
      mode === 'mask' ? '0' : mode === 'adapted' ? '1' : '0'
    )
  })
}

test('记录内的合法 error 字段仍显示', async ({ page }) => {
  await page.goto(fixture('row'))
  await expect(page.getByText('合法业务记录')).toBeVisible()
  await expect(page.getByText('业务字段')).toBeVisible()
  await expect(page.locator('body')).toHaveAttribute('data-success-calls', '1')
})

test('失败不缓存，成功结果可以命中缓存', async ({ page }) => {
  await page.goto(fixture('cache'))
  const button = page.getByRole('button', { name: '读取缓存探针' })
  await button.click()
  await expect(page.getByTestId('cache-state')).toHaveText('读取失败')
  await expect(page.getByTestId('cache-rows')).toBeEmpty()
  await expect(page.locator('body')).toHaveAttribute('data-cache-requests', '1')

  await button.click()
  await expect(page.getByTestId('cache-rows')).toHaveText('恢复后的记录')
  await expect(page.locator('body')).toHaveAttribute('data-cache-requests', '2')

  await button.click()
  await expect(page.locator('body')).toHaveAttribute('data-cache-hits', '1')
  await expect(page.locator('body')).toHaveAttribute('data-cache-requests', '2')
})

for (const mode of ['export-raw', 'export-adapted']) {
  test(`${mode} 导出失败不下载且可重试`, async ({ page }) => {
    const downloads: string[] = []
    page.on('download', (download) => downloads.push(download.suggestedFilename()))
    await page.goto(fixture(mode))
    await expect(page.getByText('恢复后的记录')).toBeVisible()
    const button = page.getByRole('button', { name: '导出', exact: true })
    await button.click()
    await expect(page.locator('body')).toHaveAttribute('data-export-attempts', '1')
    await expect(page.locator('body')).toHaveAttribute(
      'data-export-adapter-calls',
      mode === 'export-raw' ? '0' : '1'
    )
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    await expect(page.locator('.el-message--error')).not.toContainText(
      'select * from private_table'
    )
    expect(downloads).toEqual([])
    await expect(button).toBeEnabled()

    const download = page.waitForEvent('download')
    await button.click()
    const path = await (await download).path()
    if (!path) throw new Error('重试导出未生成文件')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(path)
    const worksheet = workbook.worksheets[0]
    expect(worksheet.rowCount).toBe(2)
    expect(worksheet.getCell('A2').value).toBe('恢复后的记录')
    expect(JSON.stringify(worksheet.model)).not.toContain('must-not-show')
    await expect(page.locator('body')).toHaveAttribute('data-export-attempts', '2')
    await expect(page.locator('body')).toHaveAttribute(
      'data-export-adapter-calls',
      mode === 'export-raw' ? '1' : '2'
    )
  })
}
