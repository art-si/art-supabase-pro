import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

for (const kind of ['issue', 'return', 'finished_inbound']) {
  test(`${kind}生产导入坏行整批拒绝超限不截断且保留原有明细`, async ({ page }, testInfo) => {
    let reads = 0
    let writes = 0
    let duplicate = false
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      if (
        route.request().method() !== 'GET' &&
        !url.pathname.endsWith('/wms_work_order_options_secure')
      )
        writes++
      if (url.pathname.endsWith('/sys_menu'))
        return route.fulfill({ json: { id: 'production-import-menu' } })
      if (!url.pathname.endsWith('/mdm_material')) return route.fulfill({ json: [] })
      reads++
      const material = {
        id: 'import-mat',
        material_code: 'MATCH-MAT',
        material_name: '完整生产物料',
        inventory_unit_id: 'unit-test',
        base_unit_id: 'unit-test',
        serial_management_enabled: false,
        unit_conversions: []
      }
      return route.fulfill({
        json: duplicate ? [material, { ...material, id: 'duplicate-mat' }] : [material]
      })
    })
    await page.goto(`/tests/e2e/fixtures/wms-operation-retry.html?kind=${kind}`, {
      waitUntil: 'domcontentloaded'
    })
    await page.getByRole('button', { name: '测试生产单据创建', exact: true }).click()
    const drawer = page.locator('.el-drawer')
    const input = drawer.locator('input[type="file"]')
    const button = drawer.getByRole('button', { name: '导入明细', exact: true })
    const save = drawer.getByRole('button', { name: '保存', exact: true })
    const rows = drawer.locator('.el-table__body-wrapper tbody tr')
    const upload = async (body: string) =>
      input.setInputFiles({
        name: '生产明细.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(`物料编码,申请数量,实发数量\n${body}`)
      })
    await expect(button).toBeEnabled()
    const signed = kind === 'return' ? '-2,-2' : '2,2'
    await upload(`MATCH-MAT,${signed}\n`)
    await expect(rows).toHaveCount(1)
    await expect(rows.first().getByRole('spinbutton').first()).toHaveValue(
      kind === 'return' ? '-2.0000' : '2.0000'
    )
    await expect(button).toBeEnabled()
    for (const [body, message] of [
      ['', '请选择包含 1 至 500 行生产明细的文件'],
      [
        Array.from({ length: 501 }, () => 'MATCH-MAT,2,2\n').join(''),
        '请选择包含 1 至 500 行生产明细的文件'
      ],
      ['MATCH-MAT,2,2\n,2,2\n', '第 3 行请填写物料编码'],
      ['MATCH-MAT,2,2\nMATCH-MAT,NaN,2\n', '第 3 行请填写有效且非零的数量'],
      ['MATCH-MAT,2,2\nMATCH-MAT,2,Infinity\n', '第 3 行请填写有效且非零的数量'],
      ['MATCH-MAT,2,2\nMATCH-MAT,0,0\n', '第 3 行请填写有效且非零的数量'],
      ['MATCH-MAT,2,2\nMATCH-MAT,2,3\n', '第 3 行实际数量不得超过申请数量']
    ]) {
      const priorReads = reads
      await upload(body)
      await expect(page.getByText(message, { exact: true }).last()).toBeVisible()
      await expect(rows).toHaveCount(1)
      expect(reads).toBe(priorReads)
      await expect(button).toBeEnabled()
      await expect(save).toBeEnabled()
      await expect(input).toHaveValue('')
    }
    await upload('MATCH-MAT,2,2\nABSENT-MAT,2,2\n')
    await expect(
      page.getByText('第 3 行物料编码“ABSENT-MAT”未匹配到唯一物料，请检查当前租户物料', {
        exact: true
      })
    ).toBeVisible()
    await expect(rows).toHaveCount(1)
    await expect(button).toBeEnabled()
    await expect(page.locator('.el-message')).toHaveCount(0, { timeout: 10_000 })
    duplicate = true
    await upload('MATCH-MAT,2,2\n')
    await expect(
      page.getByText('第 2 行物料编码“MATCH-MAT”未匹配到唯一物料，请检查当前租户物料', {
        exact: true
      })
    ).toBeVisible()
    await expect(rows).toHaveCount(1)
    await expect(button).toBeEnabled()
    await button.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('production-import-invalid-preserved.png'),
      animations: 'disabled'
    })
    duplicate = false
    await upload(`MATCH-MAT,${signed}\nMATCH-MAT,${signed}\n`)
    await expect(rows).toHaveCount(3)
    await expect(rows.getByText('完整生产物料', { exact: true })).toHaveCount(3)
    await expect(button).toBeEnabled()
    expect(writes).toBe(0)
  })
  test(`${kind}生产导入解析隔离查询锁定及失败恢复`, async ({ page }, testInfo) => {
    const held = new Map<string, () => void>()
    let reads = 0
    let writes = 0
    let rejectCurrent = true
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      if (
        route.request().method() !== 'GET' &&
        !url.pathname.endsWith('/wms_work_order_options_secure')
      )
        writes++
      if (url.pathname.endsWith('/sys_menu'))
        return route.fulfill({ json: { id: 'production-import-menu' } })
      if (!url.pathname.endsWith('/mdm_material')) return route.fulfill({ json: [] })
      reads++
      const code = ['OLD-QUERY', 'NEW-QUERY', 'FAIL-QUERY'].find((item) =>
        url.search.includes(item)
      )
      expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-test')
      if (code === 'OLD-QUERY' || code === 'NEW-QUERY')
        await new Promise<void>((resolve) => held.set(code, resolve))
      if (code === 'OLD-QUERY' || (code === 'FAIL-QUERY' && rejectCurrent))
        return route.fulfill({
          status: 400,
          json: {
            code: 'P0001',
            message: code === 'OLD-QUERY' ? '旧生产导入失败' : '生产导入读取失败'
          }
        })
      return route.fulfill({
        json: [
          {
            id: code === 'NEW-QUERY' ? 'import-new' : 'import-retry',
            material_code: code,
            material_name: code === 'NEW-QUERY' ? '新生产导入物料' : '重试生产导入物料',
            inventory_unit_id: 'unit-test',
            base_unit_id: 'unit-test',
            serial_management_enabled: false,
            unit_conversions: []
          }
        ]
      })
    })
    await page.goto(`/tests/e2e/fixtures/wms-operation-retry.html?kind=${kind}`, {
      waitUntil: 'domcontentloaded'
    })
    await page.evaluate(() => {
      const original = FileReader.prototype.readAsText
      FileReader.prototype.readAsText = function (blob: Blob, encoding?: string) {
        if (blob instanceof File && blob.name === '旧解析.csv') {
          document.body.dataset.parseHeld = 'true'
          this.addEventListener(
            'loadend',
            () => {
              document.body.dataset.parseDone = 'true'
            },
            { once: true }
          )
          ;(
            window as typeof window & { releaseProductionParse?: () => void }
          ).releaseProductionParse = () => original.call(this, blob, encoding)
        } else original.call(this, blob, encoding)
      }
    })
    const trigger = page.getByRole('button', { name: '测试生产单据创建', exact: true })
    await trigger.click()
    const drawer = page.locator('.el-drawer')
    const button = drawer.getByRole('button', { name: '导入明细', exact: true })
    const save = drawer.getByRole('button', { name: '保存', exact: true })
    const input = drawer.locator('input[type="file"]')
    const rows = drawer.locator('.el-table__body-wrapper tbody tr')
    const upload = async (code: string, name = '生产明细.csv') =>
      input.setInputFiles({
        name,
        mimeType: 'text/csv',
        buffer: Buffer.from(`物料编码,申请数量,实发数量,入库数量\n${code},2,2,2\n`)
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
    const reopen = async () => {
      await drawer.getByRole('button', { name: '取消', exact: true }).click()
      await expect(page.locator('.el-drawer:visible')).toHaveCount(0)
      await trigger.click()
      await expect(button).toBeEnabled()
      await expect(save).toBeEnabled()
    }
    await expect(button).toBeEnabled()
    await expect(save).toBeEnabled()
    await upload('OLD-PARSE', '旧解析.csv')
    await expect(page.locator('body')).toHaveAttribute('data-parse-held', 'true')
    await expect(save).toBeDisabled()
    await reopen()
    const priorReads = reads
    await page.evaluate(() => {
      ;(
        window as typeof window & { releaseProductionParse?: () => void }
      ).releaseProductionParse?.()
    })
    await expect(page.locator('body')).toHaveAttribute('data-parse-done', 'true')
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    expect(reads).toBe(priorReads)
    await upload('OLD-QUERY')
    await expect.poll(() => held.has('OLD-QUERY')).toBe(true)
    await expect(button).toBeDisabled()
    await expect(save).toBeDisabled()
    await reopen()
    await upload('NEW-QUERY')
    await expect.poll(() => held.has('NEW-QUERY')).toBe(true)
    await release('OLD-QUERY')
    await expect(button).toBeDisabled()
    await expect(save).toBeDisabled()
    await expect(rows).toHaveCount(0)
    await expect(page.getByText('旧生产导入失败', { exact: true })).not.toBeVisible()
    await button.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('production-import-query-locked.png'),
      animations: 'disabled'
    })
    await release('NEW-QUERY')
    await expect(rows).toHaveCount(1)
    await expect(rows.getByText('新生产导入物料', { exact: true })).toHaveCount(1)
    await expect(button).toBeEnabled()
    await expect(save).toBeEnabled()
    await upload('FAIL-QUERY')
    await expect(page.getByText('生产导入读取失败', { exact: true })).toBeVisible()
    await expect(rows).toHaveCount(1)
    await expect(button).toBeEnabled()
    await expect(save).toBeEnabled()
    rejectCurrent = false
    await upload('FAIL-QUERY')
    await expect(rows).toHaveCount(2)
    await expect(rows.getByText('重试生产导入物料', { exact: true })).toHaveCount(1)
    await expect(button).toBeEnabled()
    expect(writes).toBe(0)
  })
}
