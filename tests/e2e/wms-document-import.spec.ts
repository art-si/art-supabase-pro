import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const family of ['sales', 'purchase']) {
  test(`${family}导入精确编码不被前二十条模糊候选截断`, async ({ page }, testInfo) => {
    const materialQueries: URL[] = []
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      if (!url.pathname.endsWith('/mdm_material')) return route.fulfill({ json: [] })
      materialQueries.push(url)
      const exact = url.searchParams.get('material_code') === 'eq.EXACT-IMPORT'
      return route.fulfill({
        json: exact
          ? [
              {
                id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
                tenant_id: '11111111-1111-4111-8111-111111111111',
                code: 'EXACT-IMPORT',
                name: '精确编码导入物料',
                serial_management_enabled: false,
                unit_conversions: []
              }
            ]
          : Array.from({ length: 20 }, (_, index) => ({
              id: `fuzzy-${index}`,
              code: `EXACT-IMPORT-${index}`,
              name: '模糊候选'
            }))
      })
    })
    await page.goto('/tests/e2e/fixtures/wms-document-serials.html', {
      waitUntil: 'domcontentloaded'
    })
    await page
      .getByRole('button', {
        name: family === 'sales' ? '打开销售单据' : '打开采购单据',
        exact: true
      })
      .click()
    const drawer = page.locator('.el-drawer:visible')
    await drawer.locator('input[type="file"][accept=".xlsx,.xls,.csv"]').setInputFiles({
      name: '精确编码.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('物料编码,数量\nEXACT-IMPORT,2\nEXACT-IMPORT,3\n')
    })
    await expect(drawer.locator('.el-table__body-wrapper tbody tr')).toHaveCount(3)
    await expect(drawer).toContainText('精确编码导入物料')
    expect(materialQueries).toHaveLength(1)
    expect(materialQueries[0].searchParams.get('tenant_id')).toBe(
      'eq.11111111-1111-4111-8111-111111111111'
    )
    expect(materialQueries[0].searchParams.get('status')).toBe('eq.enabled')
    expect(materialQueries[0].searchParams.has('or')).toBe(false)
    await drawer.getByText('精确编码导入物料', { exact: true }).first().scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('exact-code-imported.png'),
      animations: 'disabled'
    })
  })
  test(`${family}物料导入等待期间锁定导入保存且旧请求不能释放新单据锁`, async ({
    page
  }, testInfo) => {
    test.setTimeout(90_000)
    const held = new Map<string, () => void>()
    let writes = 0
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().method() !== 'GET') writes++
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/sys_menu')) {
        await route.fulfill({ json: { id: 'import-busy-menu' } })
        return
      }
      const code = ['BUSY-FIRST', 'BUSY-OLD', 'BUSY-NEW'].find((item) => url.search.includes(item))
      if (!url.pathname.endsWith('/mdm_material') || !code) {
        await route.fulfill({ json: [] })
        return
      }
      await new Promise<void>((resolve) => held.set(code, resolve))
      if (code === 'BUSY-OLD') {
        await route.fulfill({ status: 400, json: { code: 'P0001', message: '旧导入测试失败' } })
        return
      }
      await route.fulfill({
        json: [
          {
            id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            code,
            name: code === 'BUSY-NEW' ? '新单据导入物料' : '首次导入物料',
            inventory_unit_id: null,
            base_unit_id: null,
            serial_management_enabled: false,
            unit_conversions: []
          }
        ]
      })
    })
    await page.goto('/tests/e2e/fixtures/wms-document-serials.html', {
      waitUntil: 'domcontentloaded'
    })
    const trigger = page.getByRole('button', {
      name: family === 'sales' ? '打开销售单据' : '打开采购单据',
      exact: true
    })
    await trigger.click()
    const drawer = page.locator('.el-drawer')
    const input = drawer.locator('input[type="file"][accept=".xlsx,.xls,.csv"]')
    const button = drawer.getByRole('button', { name: '导入明细', exact: true })
    const save = drawer.getByRole('button', { name: '保存', exact: true })
    const rows = drawer.locator('.el-table__body-wrapper tbody tr')
    const upload = async (code: string) =>
      input.setInputFiles({
        name: '等待导入.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(`物料编码,数量\n${code},2\n`)
      })
    const release = async (code: string) => {
      const response = page.waitForResponse((item) => item.url().includes(code))
      held.get(code)?.()
      await (await response).finished()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
    }
    await expect(save).toBeEnabled()
    await upload('BUSY-FIRST')
    await expect.poll(() => held.has('BUSY-FIRST')).toBe(true)
    await expect(button).toBeDisabled()
    await expect(save).toBeDisabled()
    await release('BUSY-FIRST')
    await expect(rows).toHaveCount(2)
    await expect(button).toBeEnabled()
    await expect(save).toBeEnabled()
    await upload('BUSY-OLD')
    await expect.poll(() => held.has('BUSY-OLD')).toBe(true)
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.locator('.el-drawer:visible')).toHaveCount(0)
    await trigger.click()
    await expect(button).toBeEnabled()
    await expect(save).toBeEnabled()
    await upload('BUSY-NEW')
    await expect.poll(() => held.has('BUSY-NEW')).toBe(true)
    await release('BUSY-OLD')
    await expect(button).toBeDisabled()
    await expect(save).toBeDisabled()
    await expect(rows).toHaveCount(1)
    await expect(page.getByText('旧导入测试失败', { exact: true })).not.toBeVisible()
    await button.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath(`${family}-import-loading-locked.png`),
      animations: 'disabled'
    })
    await release('BUSY-NEW')
    await expect(rows).toHaveCount(2)
    await expect(rows.getByText('新单据导入物料', { exact: true })).toHaveCount(1)
    await expect(button).toBeEnabled()
    await expect(save).toBeEnabled()
    expect(writes).toBe(0)
  })
  test(`${family}导入缺码超限未匹配及重复物料不静默漏行`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    let reads = 0
    let writes = 0
    let duplicate = false
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().method() !== 'GET') writes++
      const url = new URL(route.request().url())
      const material = url.pathname.endsWith('/mdm_material')
      if (material) reads++
      const item = {
        id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
        tenant_id: '11111111-1111-4111-8111-111111111111',
        code: 'COMPLETE-IMPORT',
        name: '完整导入物料',
        inventory_unit_id: null,
        base_unit_id: null,
        serial_management_enabled: false,
        unit_conversions: []
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          material && !url.search.includes('MISSING-IMPORT')
            ? duplicate
              ? [item, { ...item, id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2' }]
              : [item]
            : []
        )
      })
    })
    await page.goto('/tests/e2e/fixtures/wms-document-serials.html', {
      waitUntil: 'domcontentloaded'
    })
    await page
      .getByRole('button', {
        name: family === 'sales' ? '打开销售单据' : '打开采购单据',
        exact: true
      })
      .click()
    const drawer = page.locator('.el-drawer')
    const input = drawer.locator('input[type="file"][accept=".xlsx,.xls,.csv"]')
    const rows = drawer.locator('.el-table__body-wrapper tbody tr')
    const upload = async (body: string) =>
      input.setInputFiles({
        name: '完整明细.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(`物料编码,数量\n${body}`)
      })
    const originalReads = reads
    await upload('COMPLETE-IMPORT,2\n,3\n')
    await expect(page.getByText('第 3 行请填写物料编码', { exact: true })).toBeVisible()
    await expect(rows).toHaveCount(1)
    expect(reads).toBe(originalReads)
    await upload(Array.from({ length: 501 }, () => 'COMPLETE-IMPORT,2\n').join(''))
    await expect(
      page.getByText('请选择包含 1 至 500 行明细的文件；必填列为物料编码、数量', { exact: true })
    ).toBeVisible()
    await expect(rows).toHaveCount(1)
    expect(reads).toBe(originalReads)
    await upload('COMPLETE-IMPORT,2\nMISSING-IMPORT,3\n')
    await expect(
      page.getByText('未找到第 3 行当前租户物料编码“MISSING-IMPORT”', {
        exact: true
      })
    ).toBeVisible()
    await expect(rows).toHaveCount(1)
    duplicate = true
    await upload('COMPLETE-IMPORT,2\n')
    await expect(
      page.getByText(
        '第 2 行当前租户物料编码“COMPLETE-IMPORT”存在多个匹配记录，请核对编号后重新导入',
        {
          exact: true
        }
      )
    ).toBeVisible()
    await expect(rows).toHaveCount(1)
    await drawer.getByRole('button', { name: '导入明细', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath(`${family}-import-incomplete-rejected.png`),
      animations: 'disabled'
    })
    duplicate = false
    await upload('COMPLETE-IMPORT,2\nCOMPLETE-IMPORT,3\n')
    await expect(rows).toHaveCount(3)
    await expect(rows.getByText('完整导入物料', { exact: true })).toHaveCount(2)
    expect(writes).toBe(0)
  })
  test(`${family}导入非法数量价格税率整批拒绝并允许修正重试`, async ({ page }) => {
    let writes = 0
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().method() !== 'GET') writes++
      const material = route.request().url().includes('/mdm_material?')
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          material
            ? [
                {
                  id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
                  tenant_id: '11111111-1111-4111-8111-111111111111',
                  code: 'VALID-IMPORT',
                  name: '数值校验物料',
                  inventory_unit_id: null,
                  base_unit_id: null,
                  serial_management_enabled: false,
                  unit_conversions: []
                }
              ]
            : []
        )
      })
    })
    await page.goto('/tests/e2e/fixtures/wms-document-serials.html', {
      waitUntil: 'domcontentloaded'
    })
    await page
      .getByRole('button', {
        name: family === 'sales' ? '打开销售单据' : '打开采购单据',
        exact: true
      })
      .click()
    const drawer = page.locator('.el-drawer')
    const input = drawer.locator('input[type="file"][accept=".xlsx,.xls,.csv"]')
    const rows = drawer.locator('.el-table__body-wrapper tbody tr')
    for (const [values, message] of [
      ['-2,10,13', '第 3 行数量必须为大于零的数字'],
      ['NaN,10,13', '第 3 行数量必须为大于零的数字'],
      ['2,Infinity,13', '第 3 行单价必须为不小于零的数字'],
      ['2,-10,13', '第 3 行单价必须为不小于零的数字'],
      ['2,10,101', '第 3 行税率必须为 0 至 100 的数字']
    ]) {
      await input.setInputFiles({
        name: '数值校验.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(
          `物料编码,数量,单价(元),税率(%)\nVALID-IMPORT,2,10,13\nVALID-IMPORT,${values}\n`
        )
      })
      await expect(page.getByText(message, { exact: true }).last()).toBeVisible()
      await expect(rows).toHaveCount(1)
      await expect(input).toHaveValue('')
      await expect(drawer.getByRole('button', { name: '导入明细', exact: true })).toBeEnabled()
    }
    await input.setInputFiles({
      name: '数值校验.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('物料编码,数量,单价(元),税率(%)\nVALID-IMPORT,2,0,0\n')
    })
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(1).getByRole('spinbutton').first()).toHaveValue('2.0000')
    await expect(rows.nth(1).getByText('0%', { exact: true })).toBeVisible()
    expect(writes).toBe(0)
  })
  for (const outcome of ['success', 'failure']) {
    test(`${family}-${outcome}文件解析等待中关闭重开不触发旧物料查询`, async ({
      page
    }, testInfo) => {
      let materialReads = 0
      await page.route('**/rest/v1/**', async (route) => {
        if (route.request().url().includes('OLD-PARSE')) materialReads++
        if (new URL(route.request().url()).pathname.endsWith('/sys_menu')) {
          await route.fulfill({ json: { id: 'parse-state-menu' } })
          return
        }
        await route.fulfill({ contentType: 'application/json', body: '[]' })
      })
      await page.goto('/tests/e2e/fixtures/wms-document-serials.html')
      await page.evaluate((outcome) => {
        const original = FileReader.prototype.readAsText
        FileReader.prototype.readAsText = function (blob: Blob, encoding?: string) {
          if (blob instanceof File && blob.name === '延迟解析.csv') {
            document.body.dataset.parseHeld = 'true'
            this.addEventListener(
              'loadend',
              () => {
                document.body.dataset.oldParseDone = 'true'
              },
              { once: true }
            )
            ;(window as typeof window & { releaseWmsParse?: () => void }).releaseWmsParse = () => {
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
        name: family === 'sales' ? '打开销售单据' : '打开采购单据',
        exact: true
      })
      await trigger.click()
      const drawer = page.locator('.el-drawer')
      const save = drawer.getByRole('button', { name: '保存', exact: true })
      await expect(save).toBeEnabled()
      await drawer.locator('input[type="file"][accept=".xlsx,.xls,.csv"]').setInputFiles({
        name: '延迟解析.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('物料编码,数量\nOLD-PARSE,2\n')
      })
      await expect(page.locator('body')).toHaveAttribute('data-parse-held', 'true')
      await expect(drawer.getByRole('button', { name: '导入明细', exact: true })).toBeDisabled()
      await expect(save).toBeDisabled()
      await drawer.getByRole('button', { name: '导入明细', exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath(`${family}-parse-loading-locked.png`),
        animations: 'disabled'
      })
      await drawer.getByRole('button', { name: '取消', exact: true }).click()
      await expect(page.locator('.el-drawer:visible')).toHaveCount(0)
      await trigger.click()
      await expect(drawer.getByRole('button', { name: '导入明细', exact: true })).toBeEnabled()
      await expect(save).toBeEnabled()
      await page.evaluate(() => {
        ;(window as typeof window & { releaseWmsParse?: () => void }).releaseWmsParse?.()
      })
      await expect(page.locator('body')).toHaveAttribute('data-old-parse-done', 'true')
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      expect(materialReads).toBe(0)
      await expect(drawer.locator('.el-table__body-wrapper tbody tr')).toHaveCount(1)
      await expect(
        page.getByText('未找到匹配的物料编码，请检查模板和当前租户物料', { exact: true })
      ).not.toBeVisible()
      await expect(
        page.getByText('导入失败，请检查 Excel 文件格式', { exact: true })
      ).not.toBeVisible()
      await expect(drawer.getByRole('button', { name: '导入明细', exact: true })).toBeEnabled()
      await drawer.getByRole('button', { name: '导入明细', exact: true }).scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath(`${family}-old-parse-ignored.png`),
        animations: 'disabled'
      })
      await drawer.getByRole('button', { name: '取消', exact: true }).click()
    })
  }

  test(`${family}关闭重开后延迟物料导入不污染当前单据`, async ({ page }, testInfo) => {
    let held = false
    let release: () => void = () => undefined
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      if (!url.pathname.endsWith('/mdm_material') || !url.search.includes('OLD-IMPORT')) {
        await route.fulfill({ contentType: 'application/json', body: '[]' })
        return
      }
      held = true
      await pending
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            code: 'OLD-IMPORT',
            name: '旧单据导入物料',
            inventory_unit_id: null,
            base_unit_id: null,
            serial_management_enabled: false,
            unit_conversions: []
          }
        ])
      })
    })
    await page.goto('/tests/e2e/fixtures/wms-document-serials.html')
    const trigger = page.getByRole('button', {
      name: family === 'sales' ? '打开销售单据' : '打开采购单据',
      exact: true
    })
    await trigger.click()
    const drawer = page.locator('.el-drawer')
    await drawer.locator('input[type="file"][accept=".xlsx,.xls,.csv"]').setInputFiles({
      name: '旧单据.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('物料编码,数量\nOLD-IMPORT,2\n')
    })
    await expect.poll(() => held).toBe(true)
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    await expect(page.locator('.el-drawer:visible')).toHaveCount(0)
    await trigger.click()
    const rows = drawer.locator('.el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(1)
    const response = page.waitForResponse((item) => item.url().includes('OLD-IMPORT'))
    release()
    await (await response).finished()
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await expect(rows).toHaveCount(1)
    await expect(drawer.getByText('旧单据导入物料', { exact: true })).not.toBeVisible()
    await expect(
      page.getByText('已导入 1 行，请逐行核对仓储与价格信息', { exact: true })
    ).not.toBeVisible()
    await drawer.getByRole('button', { name: '导入明细', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath(`${family}-old-import-ignored.png`),
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
  })

  test(`${family}第二行物料读取失败不追加半成品且同文件重试不重复`, async ({ page }, testInfo) => {
    let rejectSecond = true
    let writes = 0
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().method() !== 'GET') writes++
      const url = new URL(route.request().url())
      if (!url.pathname.endsWith('/mdm_material')) {
        await route.fulfill({ contentType: 'application/json', body: '[]' })
        return
      }
      const second = url.search.includes('IMPORT-SECOND')
      if (second && rejectSecond) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'P0001', message: '测试物料资料读取失败' })
        })
        return
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: second
              ? 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2'
              : 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
            tenant_id: '11111111-1111-4111-8111-111111111111',
            code: second ? 'IMPORT-SECOND' : 'IMPORT-FIRST',
            name: second ? '导入第二物料' : '导入第一物料',
            inventory_unit_id: null,
            base_unit_id: null,
            serial_management_enabled: false,
            unit_conversions: []
          }
        ])
      })
    })
    await page.goto('/tests/e2e/fixtures/wms-document-serials.html')
    await page
      .getByRole('button', {
        name: family === 'sales' ? '打开销售单据' : '打开采购单据',
        exact: true
      })
      .click()
    const drawer = page.locator('.el-drawer')
    const input = drawer.locator('input[type="file"][accept=".xlsx,.xls,.csv"]')
    const rows = drawer.locator('.el-table__body-wrapper tbody tr')
    const file = {
      name: '两行明细.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('物料编码,数量,单价(元)\nIMPORT-FIRST,2,10\nIMPORT-SECOND,3,20\n')
    }
    await input.setInputFiles(file)
    await expect(page.locator('.el-message--error').first()).toBeVisible()
    await expect(
      page.getByText('导入失败，请检查 Excel 文件格式', { exact: true })
    ).not.toBeVisible()
    await expect(rows).toHaveCount(1)
    await expect(input).toHaveValue('')
    await expect(drawer.getByRole('button', { name: '导入明细', exact: true })).toBeEnabled()
    await page.screenshot({
      path: testInfo.outputPath(`${family}-import-lookup-failed.png`),
      animations: 'disabled'
    })
    rejectSecond = false
    await input.setInputFiles(file)
    await expect(rows).toHaveCount(3)
    await expect(rows.getByText('导入第一物料', { exact: true })).toHaveCount(1)
    await expect(rows.getByText('导入第二物料', { exact: true })).toHaveCount(1)
    await expect(drawer.getByRole('button', { name: '序列号 0', exact: true })).toBeVisible()
    const zeroTaxWorkbook = new ExcelJS.Workbook()
    const zeroTaxSheet = zeroTaxWorkbook.addWorksheet('零税率明细')
    zeroTaxSheet.addRow(['物料编码', '数量', '单价(元)', '税率(%)'])
    zeroTaxSheet.addRow(['IMPORT-FIRST', 2, 20, 0])
    await input.setInputFiles({
      name: '零税率明细.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await zeroTaxWorkbook.xlsx.writeBuffer())
    })
    await expect(rows).toHaveCount(4)
    const zeroTax = rows.nth(3).getByText('0%', { exact: true })
    await expect(zeroTax).toBeVisible()
    await expect(rows.nth(3).getByRole('spinbutton').nth(2)).toHaveValue('20.0000')
    const amounts: Array<[string, string]> = [
      ['金额', '40.00'],
      ['价税合计', '40.00']
    ]
    await expect(drawer.getByRole('columnheader', { name: '税额(元)', exact: true })).toHaveCount(
      family === 'sales' ? 1 : 0
    )
    if (family === 'sales') amounts.push(['税额(元)', '0.00'])
    for (const [label, value] of amounts) {
      const header = drawer.getByRole('columnheader', { name: label, exact: true })
      await expect(header).toHaveCount(1)
      const column = await header.evaluate((element) => (element as HTMLTableCellElement).cellIndex)
      await expect(rows.nth(3).locator('td').nth(column)).toHaveText(value)
    }
    await zeroTax.scrollIntoViewIfNeeded()
    await expect(zeroTax).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath(`${family}-import-zero-tax.png`),
      animations: 'disabled'
    })
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    expect(writes).toBe(0)
  })
}

const scenarios = [
  ...[
    'initial_outbound',
    'initial_return',
    'outbound',
    'return',
    'other_outbound',
    'other_return'
  ].map((variant) => ({ family: 'sales', variant })),
  ...[
    'initial_inbound',
    'initial_return',
    'purchase_inbound',
    'purchase_return',
    'other_inbound',
    'other_return',
    'entrusted_processing_inbound',
    'entrusted_processing_return'
  ].map((variant) => ({ family: 'purchase', variant }))
]
for (const { family, variant } of scenarios) {
  test(`${family}-${variant}明细导入空表格重选和未匹配保留及两行回填`, async ({
    page
  }, testInfo) => {
    test.setTimeout(90_000)
    let writes = 0
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      if (route.request().method() !== 'GET') writes++
      const url = new URL(route.request().url())
      const matching = url.pathname.endsWith('/mdm_material') && url.search.includes('IMPORT-MAT')
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(
          matching
            ? [
                {
                  id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
                  tenant_id: '11111111-1111-4111-8111-111111111111',
                  code: 'IMPORT-MAT',
                  name: '导入测试物料',
                  inventory_unit_id: null,
                  base_unit_id: null,
                  serial_management_enabled: false,
                  unit_conversions: []
                }
              ]
            : []
        )
      })
    })
    await page.goto(`/tests/e2e/fixtures/wms-document-serials.html?${family}Kind=${variant}`)
    await page
      .getByRole('button', {
        name: family === 'sales' ? '打开销售单据' : '打开采购单据',
        exact: true
      })
      .click()
    const drawer = page.locator('.el-drawer')
    const button = drawer.getByRole('button', { name: '导入明细', exact: true })
    await expect(button).toBeEnabled()
    const input = drawer.locator('input[type="file"][accept=".xlsx,.xls,.csv"]')
    const rows = drawer.locator('.el-table__body-wrapper tbody tr')
    await expect(rows).toHaveCount(1)
    const workbook = new ExcelJS.Workbook()
    workbook.addWorksheet('物料明细').addRow(['物料编码', '数量', '单价(元)'])
    const file = {
      name: '空明细.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from(await workbook.xlsx.writeBuffer())
    }
    const warning = page.getByText('请选择包含 1 至 500 行明细的文件；必填列为物料编码、数量', {
      exact: true
    })
    await input.setInputFiles(file)
    await expect(warning).toBeVisible()
    await expect(rows).toHaveCount(1)
    await expect(input).toHaveValue('')
    await expect(button).toBeEnabled()
    await expect(warning).not.toBeVisible({ timeout: 10_000 })
    await input.setInputFiles(file)
    await expect(warning).toBeVisible()
    await expect(rows).toHaveCount(1)
    await expect(warning).not.toBeVisible({ timeout: 10_000 })
    await input.setInputFiles({
      name: '未匹配物料.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('物料编码,数量,单价(元)\nNOT-AVAILABLE,2,10\n')
    })
    await expect(
      page.getByText('未找到第 2 行当前租户物料编码“NOT-AVAILABLE”', {
        exact: true
      })
    ).toBeVisible()
    await expect(rows).toHaveCount(1)
    await expect(drawer.getByRole('button', { name: '序列号 0', exact: true })).toBeVisible()
    await expect(input).toHaveValue('')
    await expect(button).toBeEnabled()
    await button.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath(`${family}-import-unmatched.png`),
      animations: 'disabled'
    })
    await input.setInputFiles({
      name: '有效明细.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        '物料编码,数量,单价(元),税率(%),批号\nIMPORT-MAT,2,10,13,IMPORT-01\nIMPORT-MAT,3,20,9,IMPORT-02\n'
      )
    })
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(1).getByText('导入测试物料', { exact: true })).toBeVisible()
    await expect(rows.nth(2).getByText('导入测试物料', { exact: true })).toBeVisible()
    await expect(rows.nth(1).getByRole('spinbutton').first()).toHaveValue('2.0000')
    await expect(rows.nth(2).getByRole('spinbutton').first()).toHaveValue('3.0000')
    await expect(drawer.getByRole('button', { name: '序列号 0', exact: true })).toBeVisible()
    await expect(input).toHaveValue('')
    await expect(button).toBeEnabled()
    await rows.nth(2).getByText('导入测试物料', { exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath(`${family}-import-two-lines.png`),
      animations: 'disabled'
    })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      await page.evaluate(() => document.documentElement.clientWidth + 1)
    )
    await drawer.getByRole('button', { name: '取消', exact: true }).click()
    expect(writes).toBe(0)
    expect(errors).toEqual([])
  })
}
