import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { expectInputTextUnclipped } from './support/input-text-width'

test.use({ storageState: { cookies: [], origins: [] } })
for (const kind of ['transfer', 'gain', 'loss']) {
  const title = kind === 'transfer' ? '调拨申请单' : kind === 'gain' ? '盘盈单' : '盘亏单'
  for (const outcome of ['success', 'failure']) {
    test(`${title}文件解析${outcome}等待时锁定保存并丢弃关闭后的旧结果`, async ({
      page
    }, testInfo) => {
      let materialReads = 0
      let writes = 0
      await page.route('**/rest/v1/**', async (route) => {
        const url = new URL(route.request().url())
        if (route.request().method() !== 'GET') writes++
        if (url.pathname.endsWith('/mdm_material')) materialReads++
        await route.fulfill({
          json: url.pathname.endsWith('/sys_menu') ? { id: 'parse-menu' } : []
        })
      })
      await page.goto(
        `/tests/e2e/fixtures/wms-operation-retry.html?adjustmentKind=${kind}&importPermission=allow`
      )
      await page.evaluate((outcome) => {
        const original = FileReader.prototype.readAsText
        FileReader.prototype.readAsText = function (blob: Blob, encoding?: string) {
          if (blob instanceof File && blob.name === '等待解析.csv') {
            document.body.dataset.parseHeld = 'true'
            this.addEventListener(
              'loadend',
              () => {
                document.body.dataset.parseDone = 'true'
              },
              { once: true }
            )
            ;(window as typeof window & { releaseImportParse?: () => void }).releaseImportParse =
              () => {
                if (outcome === 'success') original.call(this, blob, encoding)
                else {
                  this.dispatchEvent(new ProgressEvent('error'))
                  this.dispatchEvent(new ProgressEvent('loadend'))
                }
              }
          } else original.call(this, blob, encoding)
        }
      }, outcome)
      const trigger = page.getByRole('button', {
        name: kind === 'transfer' ? '测试调拨申请创建' : '测试盘盈单创建',
        exact: true
      })
      await trigger.click()
      const drawer = page.getByRole('dialog', { name: `新增${title}`, exact: true })
      const save = drawer.getByRole('button', { name: '保存', exact: true })
      const button = drawer.getByRole('button', { name: '导入明细', exact: true })
      await expect(save).toBeEnabled()
      await drawer.locator('input[type="file"]').setInputFiles({
        name: '等待解析.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('物料编码,数量\nOLD-PARSE,2\n')
      })
      await expect(page.locator('body')).toHaveAttribute('data-parse-held', 'true')
      await expect(button).toBeDisabled()
      await expect(save).toBeDisabled()
      await button.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath(`${kind}-parse-loading-locked.png`),
        animations: 'disabled'
      })
      await drawer.getByRole('button', { name: '取消', exact: true }).click()
      await expect(drawer).not.toBeVisible()
      const oldReads = materialReads
      await page.evaluate(() => {
        ;(window as typeof window & { releaseImportParse?: () => void }).releaseImportParse?.()
      })
      await expect(page.locator('body')).toHaveAttribute('data-parse-done', 'true')
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      expect(materialReads).toBe(oldReads)
      await trigger.click()
      await expect(button).toBeEnabled()
      await expect(save).toBeEnabled()
      await expect(drawer.getByText('请选择物料', { exact: true })).toBeVisible()
      expect(writes).toBe(0)
    })
  }
  test(`${title}导入无效数量不改表单并可重选两行`, async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    let writes = 0
    const reads: string[] = []
    let holdMaterial = false
    let failMaterial = false
    let unmatchedMaterial = false
    let releaseMaterial: (() => void) | undefined
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().method() !== 'GET') writes++
      const url = new URL(route.request().url())
      const material = url.pathname.endsWith('/mdm_material')
      if (material) reads.push(url.search)
      if (material && !url.searchParams.has('material_code')) {
        await route.fulfill({
          json: Array.from({ length: 500 }, (_, index) => ({
            id: `fuzzy-${index}`,
            material_code: `OTHER-${index}`,
            material_name: `包含 IMPORT-MAT 的模糊候选 ${index}`
          }))
        })
        return
      }
      if (material && holdMaterial)
        await new Promise<void>((resolve) => {
          releaseMaterial = resolve
        })
      if (material && failMaterial)
        return route.fulfill({ status: 503, json: { code: 'XX000', message: '测试物料读取失败' } })
      await route.fulfill({
        json: url.pathname.endsWith('/sys_menu')
          ? { id: 'menu-test' }
          : material && !unmatchedMaterial
            ? [
                {
                  id: 'import-material',
                  material_code: 'IMPORT-MAT',
                  material_name: '导入测试物料',
                  inventory_unit_id: 'unit-test',
                  base_unit_id: 'unit-test',
                  unit_conversions: []
                }
              ]
            : []
      })
    })
    await page.goto(
      `/tests/e2e/fixtures/wms-operation-retry.html?adjustmentKind=${kind}&importPermission=allow`
    )
    await page
      .getByRole('button', {
        name: kind === 'transfer' ? '测试调拨申请创建' : '测试盘盈单创建',
        exact: true
      })
      .click()
    const drawer = page.getByRole('dialog', { name: `新增${title}`, exact: true })
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    await expect(drawer.locator('.art-drawer__content')).toHaveJSProperty('inert', false)
    const button = drawer.getByRole('button', { name: '导入明细', exact: true })
    await expect(button).toBeEnabled()
    const addButton = drawer.getByRole('button', { name: '添加物料', exact: true })
    await expect
      .poll(async () => {
        const importBounds = await button.boundingBox()
        const addBounds = await addButton.boundingBox()
        return importBounds && addBounds ? Math.abs(importBounds.y - addBounds.y) : Infinity
      })
      .toBeLessThanOrEqual(1)
    const input = drawer.locator('input[type="file"]')
    const file = async (quantities: number[]) => {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('明细')
      sheet.addRow(['物料编码', '数量', '批号', '备注'])
      quantities.forEach((quantity, index) =>
        sheet.addRow(['IMPORT-MAT', quantity, `BATCH-${index}`, '导入备注'])
      )
      return {
        name: '调拨明细.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: Buffer.from(await workbook.xlsx.writeBuffer())
      }
    }
    await input.setInputFiles(await file([2, -1]))
    await expect(page.getByText('第 3 行数量必须为大于零的数字', { exact: true })).toBeVisible()
    await expect(drawer.getByText('请选择物料', { exact: true })).toBeVisible()
    await expect(button).toBeEnabled()
    await expect(input).toHaveValue('')
    expect(reads).toHaveLength(0)
    await input.setInputFiles(await file([2, 3]))
    const rows = drawer.locator('.el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).getByRole('spinbutton').first()).toHaveValue('2.0000')
    await expect(rows.nth(1).getByRole('spinbutton').first()).toHaveValue('3.0000')
    expect(reads).toHaveLength(1)
    expect(
      reads.every((query) => new URLSearchParams(query).get('tenant_id') === 'eq.tenant-test')
    ).toBe(true)
    expect(new URLSearchParams(reads[0]).get('material_code')).toBe('eq.IMPORT-MAT')
    expect(new URLSearchParams(reads[0]).get('status')).toBe('eq.enabled')
    expect(new URLSearchParams(reads[0]).has('or')).toBe(false)
    expect(new URLSearchParams(reads[0]).get('limit')).toBe('2')
    unmatchedMaterial = true
    await input.setInputFiles(await file([9]))
    await expect(
      page.getByText('未找到第 2 行当前租户物料编码“IMPORT-MAT”', {
        exact: true
      })
    ).toBeVisible()
    expect(reads).toHaveLength(2)
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).getByRole('spinbutton').first()).toHaveValue('2.0000')
    await expect(rows.nth(1).getByRole('spinbutton').first()).toHaveValue('3.0000')
    await expect(button).toBeEnabled()
    unmatchedMaterial = false
    await button.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('transfer-import-two-lines.png'),
      animations: 'disabled'
    })
    for (const label of ['生产日期', '有效期至']) {
      const column = await drawer
        .getByRole('columnheader', { name: label, exact: true })
        .evaluate((element) => (element as HTMLTableCellElement).cellIndex)
      const date = rows.first().locator('td').nth(column).locator('.el-date-editor input')
      await date.scrollIntoViewIfNeeded()
      await date.fill('2026-10-07')
      await date.press('Tab')
      await expect(date).toHaveValue('2026-10-07')
      await date.scrollIntoViewIfNeeded()
      await date.evaluate((element) => {
        const editor = element.closest('.el-date-editor')
        const wrap = element.closest('.el-table')?.querySelector('.el-scrollbar__wrap')
        if (!editor || !(wrap instanceof HTMLElement)) throw new Error('日期表格滚动容器缺失')
        wrap.scrollLeft +=
          editor.getBoundingClientRect().left - wrap.getBoundingClientRect().left - 16
      })
      await expect
        .poll(() =>
          date.evaluate((element) => {
            const editor = element.closest('.el-date-editor')
            const wrap = element.closest('.el-table')?.querySelector('.el-scrollbar__wrap')
            if (!editor || !wrap) return false
            const bounds = editor.getBoundingClientRect()
            const viewport = wrap.getBoundingClientRect()
            return bounds.left >= viewport.left && bounds.right <= viewport.right
          })
        )
        .toBe(true)
      await date.hover()
      await expectInputTextUnclipped(date)
    }
    await page.screenshot({
      path: testInfo.outputPath('transfer-line-date-clear-icon.png'),
      animations: 'disabled'
    })
    holdMaterial = true
    await input.setInputFiles(await file([5]))
    await expect.poll(() => Boolean(releaseMaterial)).toBe(true)
    await expect(button).toBeDisabled()
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    await page
      .getByRole('button', {
        name: kind === 'transfer' ? '测试调拨申请创建' : '测试盘盈单创建',
        exact: true
      })
      .click()
    await expect(button).toBeEnabled()
    const oldResponse = page.waitForResponse((response) => response.url().includes('/mdm_material'))
    holdMaterial = false
    releaseMaterial?.()
    await oldResponse
    await expect(drawer.getByText('请选择物料', { exact: true })).toBeVisible()
    await expect(rows).toHaveCount(0)
    failMaterial = true
    const readsBeforeFailure = reads.length
    await input.setInputFiles(await file([2]))
    await expect.poll(() => reads.length).toBeGreaterThan(readsBeforeFailure)
    await expect(button).toBeEnabled()
    await expect(rows).toHaveCount(0)
    await expect(drawer.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    failMaterial = false
    await input.setInputFiles(await file([7]))
    await expect(rows).toHaveCount(1)
    await expect(rows.first().getByRole('spinbutton').first()).toHaveValue('7.0000')
    await button.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('import-reopened-network-retry.png'),
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    expect(writes).toBe(0)
  })
  test(`${title}普通用户没有导入权限时无文件入口`, async ({ page }) => {
    await page.route('**/rest/v1/**', (route) =>
      route.fulfill({
        json: new URL(route.request().url()).pathname.endsWith('/sys_menu')
          ? { id: 'menu-test' }
          : []
      })
    )
    await page.goto(
      `/tests/e2e/fixtures/wms-operation-retry.html?adjustmentKind=${kind}&importPermission=deny`
    )
    await page
      .getByRole('button', {
        name: kind === 'transfer' ? '测试调拨申请创建' : '测试盘盈单创建',
        exact: true
      })
      .click()
    const drawer = page.getByRole('dialog', { name: `新增${title}`, exact: true })
    await expect(drawer.getByRole('button', { name: '添加物料', exact: true })).toBeVisible()
    await expect(drawer.getByRole('button', { name: '导入明细', exact: true })).toHaveCount(0)
    await expect(drawer.locator('input[type="file"]')).toHaveCount(0)
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
  })
}
