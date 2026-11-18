import { expect, test, type Locator } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

async function getDescriptionValue(panel: Locator, label: string): Promise<Locator> {
  const labelCell = panel.getByText(label, { exact: true })
  const index = await labelCell.evaluate((element) => {
    const cell = element.closest('th, td')
    if (!(cell instanceof HTMLTableCellElement)) throw new Error('描述项缺少标签单元格')
    return cell.cellIndex
  })
  return labelCell
    .locator('xpath=ancestor::tr[1]/following-sibling::tr[1]')
    .locator('.el-descriptions__content')
    .nth(index)
}

for (const status of ['unknown', 'prototype']) {
  test('运单详情不显示原始状态码 ' + status, async ({ page }) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    await page.goto('/tests/e2e/fixtures/tms-waybill-date-reuse.html?status=' + status, {
      waitUntil: 'domcontentloaded'
    })
    const statusFact = await getDescriptionValue(page.locator('.waybill-info-panel'), '运单状态')
    await expect(statusFact).toContainText('状态待核对')
    await expect(statusFact).not.toContainText(
      status === 'prototype' ? 'constructor' : 'unexpected_waybill_status'
    )
    const tracking = page.locator('.waybill-tracking')
    await expect(tracking).toContainText('运输节点待核对')
    await expect(tracking).not.toContainText(
      status === 'prototype' ? 'constructor' : 'unexpected_waybill_event'
    )
  })
}

async function expectCompleteValue(field: Locator): Promise<void> {
  await field.scrollIntoViewIfNeeded()
  await expect(field).toBeVisible()
  const geometry = await field.evaluate((element) => {
    const cell = element.closest('dd, .el-descriptions__content, p') ?? element
    const bounds = cell.getBoundingClientRect()
    const scrollport = element.closest('.el-scrollbar__wrap')?.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(element)
    const lines = Array.from(range.getClientRects())
    return {
      hasText: lines.length > 0,
      fitsCell: lines.every(
        (line) =>
          line.left >= bounds.left - 1 &&
          line.right <= bounds.right + 1 &&
          line.top >= bounds.top - 1 &&
          line.bottom <= bounds.bottom + 1
      ),
      fitsScrollport:
        !scrollport ||
        lines.every(
          (line) =>
            line.left >= scrollport.left - 1 &&
            line.right <= scrollport.right + 1 &&
            line.top >= scrollport.top - 1 &&
            line.bottom <= scrollport.bottom + 1
        ),
      fitsViewport: lines.every(
        (line) =>
          line.left >= -1 &&
          line.right <= innerWidth + 1 &&
          line.top >= -1 &&
          line.bottom <= innerHeight + 1
      )
    }
  })
  expect(geometry).toEqual({
    hasText: true,
    fitsCell: true,
    fitsScrollport: true,
    fitsViewport: true
  })
}

for (const detail of ['执行概览', '附件归档'] as const) {
  test(`运单${detail}完整保留只读业务值`, async ({ page }, info) => {
    const writes: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    for (const appearance of [
      { width: 1440, theme: 'light', boxBorderMode: true },
      { width: 390, theme: 'dark', boxBorderMode: false }
    ] as const) {
      await page.setViewportSize({ width: appearance.width, height: 900 })
      await prepareIsolatedSession(page, {
        tenantId: '11111111-1111-4111-8111-111111111111',
        platformSuper: false
      })
      await prepareAppearance(page, appearance)
      await page.route('**/rest/v1/**', (route) => {
        if (route.request().method() !== 'GET') writes.push(route.request().url())
        return route.fulfill({ json: [] })
      })
      await page.goto('/tests/e2e/fixtures/tms-waybill-date-reuse.html?mode=valid')
      await assertAppearance(page, appearance)
      if (detail === '执行概览') {
        const facts = page.locator('.waybill-info-panel__facts')
        const values = facts.locator('dd, .art-descriptions__value')
        await expect(values).toHaveText([
          '运输中',
          '2026-10-09 12:34',
          '2026-10-09 12:34',
          '-',
          '-',
          '-',
          '-',
          '0 km'
        ])
        for (const field of await values.all()) await expectCompleteValue(field)
        await facts.screenshot({
          path: info.outputPath(`execution-facts-${appearance.width}-${appearance.theme}.png`)
        })
      } else {
        const panel = page.locator('.waybill-document-panel')
        const document = panel.locator('.waybill-document-panel__file-info')
        await expect(document.getByText('运单凭证库', { exact: true })).toBeVisible()
        await expect(document.getByText('2026-10-09 12:34', { exact: true })).toBeVisible()
        await expect(document.getByText('日期验收文件.pdf', { exact: true })).toHaveAttribute(
          'title',
          '日期验收文件.pdf'
        )
        const link = document.getByRole('link', { name: '在新窗口打开文件', exact: true })
        await expect(link).toHaveAttribute('href', `${new URL(page.url()).origin}/date-test.pdf`)
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        for (const field of [
          document.getByText(
            /^装备制造与物流保障联合归档复核负责人.*EMP-DOCUMENT-2026-0000123456789）$/
          ),
          document.getByText(/^装货现场说明：.*凭证归档结束。$/),
          document.getByText('2026-10-09 12:34', { exact: true })
        ])
          await expectCompleteValue(field)
        await document.screenshot({
          path: info.outputPath(`archive-facts-${appearance.width}-${appearance.theme}.png`)
        })
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
      ).toBe(true)
    }
    expect(writes).toEqual([])
    expect(errors).toEqual([])
  })
}
for (const mode of ['valid', 'empty', 'invalid', 'time-only']) {
  test('运单详情日期共享规则 ' + mode, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/tests/e2e/fixtures/tms-waybill-date-reuse.html?mode=' + mode)
    const expected = mode === 'valid' ? '2026-10-09 12:34' : '-'
    await expect(
      await getDescriptionValue(page.locator('.waybill-info-panel'), '计划装货')
    ).toContainText(expected)
    await expect(
      await getDescriptionValue(page.locator('.waybill-document-panel'), '归档时间')
    ).toContainText(expected)
    const operation = page.locator('.waybill-operation-panel')
    if (mode === 'valid') await expect(operation).toContainText(expected)
    else {
      await expect(operation).not.toContainText('invalid-date')
      await expect(operation).not.toContainText('12:34')
      await expect(operation).not.toContainText('流程已完成')
      await expect(operation).not.toContainText('完成业务节点')
      await expect(operation).not.toContainText('流程节点存在')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath('waybill-dates.png'), fullPage: true })
  })
}
