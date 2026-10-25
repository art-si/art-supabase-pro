import { expect, test } from '@playwright/test'
import { expectInputTextUnclipped } from './support/input-text-width'

for (const family of ['初始库存', '销售', '采购']) {
  for (const scenario of ['换行', '关闭重开', '旧请求失败']) {
    test(`${family}仓位${scenario}隔离迟到响应`, async ({ page }, testInfo) => {
      let release = () => {}
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      let waiting = false
      await page.route('**/rest/v1/**', async (route) => {
        const url = new URL(route.request().url())
        if (url.pathname.endsWith('/mdm_warehouse_bin')) {
          const old = url.searchParams.get('warehouse_id') === 'eq.warehouse-A'
          if (old) {
            waiting = true
            await held
          }
          if (old && scenario === '旧请求失败') {
            return route.fulfill({
              status: 400,
              json: { code: 'PGRST000', message: 'technical failure' }
            })
          }
          return route.fulfill({
            json: [
              {
                id: old ? 'bin-A' : 'bin-B',
                warehouse_id: old ? 'warehouse-A' : 'warehouse-B',
                bin_name: old ? '旧仓位候选' : '当前仓位候选',
                bin_code: old ? 'A' : 'B',
                status: 'available'
              }
            ]
          })
        }
        return route.fulfill({
          json: url.pathname.endsWith('/sys_menu') ? { id: 'test-menu' } : []
        })
      })
      await page.goto('/tests/e2e/fixtures/wms-document-serials.html?twoLines=true&binRace=true')
      await page
        .getByRole('button', {
          name: family === '初始库存' ? '打开初始库存单' : `复制${family}单据`,
          exact: true
        })
        .click()
      const drawer = page.locator('.el-drawer:visible')
      const column = await drawer
        .getByRole('columnheader', { name: '仓位', exact: true })
        .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
      const rows = drawer.locator('.el-table__body tr')
      const first = rows.nth(0).locator('td').nth(column).getByRole('combobox')
      const second = rows.nth(1).locator('td').nth(column).getByRole('combobox')
      await first.scrollIntoViewIfNeeded()
      await first.click()
      await expect.poll(() => waiting).toBe(true)
      await page.keyboard.press('Escape')
      if (scenario === '关闭重开') {
        await drawer.getByRole('button', { name: '取消', exact: true }).click()
        await expect(drawer).toHaveCount(0)
        await page
          .getByRole('button', {
            name: family === '初始库存' ? '打开初始库存单' : `复制${family}单据`,
            exact: true
          })
          .click()
        await second.scrollIntoViewIfNeeded()
      }
      await second.click()
      await expect(
        page
          .getByRole('option', { name: '当前仓位候选 · B', exact: true })
          .and(page.locator(':visible'))
      ).toBeVisible()
      const oldResponse = page.waitForResponse((response) =>
        response.url().includes('warehouse_id=eq.warehouse-A')
      )
      release()
      await (await oldResponse).finished()
      await expect(page.getByRole('option', { name: '旧仓位候选 · A', exact: true })).toHaveCount(0)
      await expect(
        page
          .getByRole('option', { name: '当前仓位候选 · B', exact: true })
          .and(page.locator(':visible'))
      ).toBeVisible()
      await expect(page.locator('.el-message')).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('bin-current-row.png'),
        animations: 'disabled'
      })
    })
  }
}

for (const family of ['初始库存', '销售', '采购']) {
  test(`${family}当前仓位请求失败后可重新打开重试`, async ({ page }, testInfo) => {
    let requests = 0
    let writes = 0
    await page.route('**/rest/v1/**', async (route) => {
      const url = new URL(route.request().url())
      if (route.request().method() !== 'GET') writes++
      if (url.pathname.endsWith('/mdm_warehouse_bin')) {
        requests++
        if (requests === 1)
          return route.fulfill({
            status: 400,
            json: { code: 'PGRST000', message: 'technical bin failure' }
          })
        return route.fulfill({
          json: [
            {
              id: 'bin-B',
              warehouse_id: 'warehouse-B',
              bin_name: '恢复仓位',
              bin_code: 'B',
              status: 'available'
            }
          ]
        })
      }
      return route.fulfill({ json: url.pathname.endsWith('/sys_menu') ? { id: 'test-menu' } : [] })
    })
    await page.goto('/tests/e2e/fixtures/wms-document-serials.html?twoLines=true&binRace=true')
    await page
      .getByRole('button', {
        name: family === '初始库存' ? '打开初始库存单' : `复制${family}单据`,
        exact: true
      })
      .click()
    const drawer = page.locator('.el-drawer:visible')
    const column = await drawer
      .getByRole('columnheader', { name: '仓位', exact: true })
      .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
    const bin = drawer
      .locator('.el-table__body tr')
      .nth(1)
      .locator('td')
      .nth(column)
      .getByRole('combobox')
    await bin.scrollIntoViewIfNeeded()
    await bin.click()
    const message = page.locator('.el-message')
    await expect(message).toHaveCount(1)
    await expect(message).toContainText('数据库服务暂时不可用，请稍后重试')
    await expect(message).not.toContainText('technical')
    await page.screenshot({
      path: testInfo.outputPath('bin-current-error.png'),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')
    await bin.click()
    await expect(
      page.getByRole('option', { name: '恢复仓位 · B', exact: true }).and(page.locator(':visible'))
    ).toBeVisible()
    await expect.poll(() => requests).toBe(2)
    await expect(drawer.locator('.el-table__body tr')).toHaveCount(2)
    expect(writes).toBe(0)
    await page.screenshot({
      path: testInfo.outputPath('bin-current-retry.png'),
      animations: 'disabled'
    })
  })
}

for (const family of ['初始库存', '销售', '采购'])
  for (const field of ['单价', '数量'])
    test(`${family}长${field}完整显示`, async ({ page }, testInfo) => {
      await page.route('**/rest/v1/**', (route) =>
        route.fulfill({
          json: new URL(route.request().url()).pathname.endsWith('/sys_menu')
            ? { id: 'menu-test' }
            : []
        })
      )
      await page.goto('/tests/e2e/fixtures/wms-document-serials.html?twoLines=true')
      await page
        .getByRole('button', {
          name: family === '初始库存' ? '打开初始库存单' : `复制${family}单据`,
          exact: true
        })
        .click()
      const drawer = page.locator('.el-drawer:visible')
      for (const label of field === '数量'
        ? family === '初始库存'
          ? ['期初数量', '年收入数量', '年发出数量']
          : ['数量']
        : family === '初始库存'
          ? ['单价']
          : ['未税单价', '含税单价']) {
        const column = await drawer
          .getByRole('columnheader', { name: label, exact: true })
          .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
        const price = drawer
          .locator('.el-table__body tr')
          .first()
          .locator('td')
          .nth(column)
          .getByRole('spinbutton')
        await price.scrollIntoViewIfNeeded()
        await price.fill('12345678.1234')
        await price.press('Tab')
        await expect(price).toHaveValue('12345678.1234')
        await price.scrollIntoViewIfNeeded()
        await price.evaluate((element) => {
          const editor = element.closest('.el-input-number')
          const wrap = element.closest('.el-table')?.querySelector('.el-scrollbar__wrap')
          if (!editor || !(wrap instanceof HTMLElement)) throw new Error('单价滚动容器缺失')
          wrap.scrollLeft +=
            editor.getBoundingClientRect().left - wrap.getBoundingClientRect().left - 16
        })
        await expectInputTextUnclipped(price)
        await page.screenshot({
          path: testInfo.outputPath(`${label}-full-price.png`),
          animations: 'disabled'
        })
      }
    })
