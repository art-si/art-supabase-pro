import { expect, test } from '@playwright/test'
import { expectInputTextUnclipped } from './support/input-text-width'
test.use({ storageState: { cookies: [], origins: [] } })
for (const kind of ['gain', 'loss', 'transfer-source', 'transfer-target'])
  for (const scenario of ['换仓', '关闭重开', '旧请求失败', '当前失败重试'])
    test(`${kind}${scenario}丢弃迟到仓位`, async ({ page }, testInfo) => {
      let release = () => {}
      const held = new Promise<void>((resolve) => (release = resolve))
      let pending = false
      let currentFailed = false
      await page.route('**/rest/v1/**', async (route) => {
        const url = new URL(route.request().url())
        const table = url.pathname.split('/').pop()
        if (table === 'mdm_warehouse_bin') {
          const old = url.searchParams.get('warehouse_id') === 'eq.A'
          if (old && scenario === '当前失败重试') {
            pending = true
            if (!currentFailed) {
              currentFailed = true
              return route.fulfill({
                status: 400,
                json: { code: 'PGRST000', message: 'technical failure' }
              })
            }
            return route.fulfill({
              json: [
                {
                  id: 'retry-A',
                  warehouse_id: 'A',
                  bin_code: 'B',
                  bin_name: '新仓位',
                  status: 'available'
                }
              ]
            })
          }
          if (old) {
            pending = true
            await held
          }
          if (old && scenario === '旧请求失败')
            return route.fulfill({
              status: 400,
              json: { code: 'PGRST000', message: 'technical failure' }
            })
          return route.fulfill({
            json: [
              {
                id: old ? 'bin-A' : 'bin-B',
                bin_code: old ? 'A' : 'B',
                bin_name: old ? '旧仓位' : '新仓位',
                warehouse_id: old ? 'A' : 'B',
                status: 'available'
              }
            ]
          })
        }
        const json =
          table === 'sys_menu'
            ? { id: 'menu-test' }
            : table === 'mdm_organization'
              ? [
                  {
                    id: 'org-test',
                    tenant_id: 'tenant-test',
                    organization_code: 'ORG',
                    organization_name: '测试组织',
                    organization_type: 'company',
                    status: '1',
                    initialization: [
                      { enabled_on: '2026-10-01', is_default: true, initialization_closed_at: null }
                    ]
                  }
                ]
              : table === 'mdm_warehouse'
                ? ['A', 'B'].map((id) => ({
                    id,
                    tenant_id: 'tenant-test',
                    organization_id: 'org-test',
                    warehouse_code: id,
                    warehouse_name: `仓库${id}`,
                    status: 'enabled'
                  }))
                : table === 'mdm_material'
                  ? [
                      {
                        id: 'material-test',
                        material_code: 'MAT',
                        material_name: '测试物料',
                        unit_conversions: []
                      }
                    ]
                  : []
        return route.fulfill({
          json,
          headers: {
            'access-control-expose-headers': 'content-range',
            'content-range':
              Array.isArray(json) && json.length ? `0-${json.length - 1}/${json.length}` : '*/0'
          }
        })
      })
      await page.goto(
        `/tests/e2e/fixtures/wms-operation-retry.html?adjustmentKind=${kind.startsWith('transfer') ? 'transfer' : kind}&importPermission=allow`
      )
      await page
        .getByRole('button', {
          name: kind.startsWith('transfer') ? '测试调拨申请创建' : '测试盘盈单创建',
          exact: true
        })
        .click()
      const drawer = page.getByRole('dialog', {
        name: kind.startsWith('transfer')
          ? '新增调拨申请单'
          : kind === 'gain'
            ? '新增盘盈单'
            : '新增盘亏单',
        exact: true
      })
      await expect(drawer.getByRole('button', { name: '导入明细', exact: true })).toBeVisible({
        timeout: 5000
      })
      await drawer.locator('input[type=file]').setInputFiles({
        name: '明细.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('物料编码,数量\nMAT,2\n')
      })
      const row = drawer.locator('.el-table__body tr').first()
      await expect(row).toBeVisible()
      const col = async (name: string) =>
        drawer
          .getByRole('columnheader', { name, exact: true })
          .evaluate((cell) => (cell as HTMLTableCellElement).cellIndex)
      const warehouse = row
        .locator('td')
        .nth(
          await col(
            kind === 'transfer-source'
              ? '调出仓库'
              : kind === 'transfer-target'
                ? '调入仓库'
                : '仓库'
          )
        )
        .getByRole('combobox')
      await warehouse.scrollIntoViewIfNeeded()
      await warehouse.click()
      await page
        .getByRole('option', { name: '仓库B', exact: true })
        .and(page.locator(':visible'))
        .click()
      await warehouse.click()
      await page
        .getByRole('option', { name: '仓库A', exact: true })
        .and(page.locator(':visible'))
        .click()
      await expect.poll(() => pending).toBe(true)
      if (scenario === '当前失败重试') {
        const errors = page.locator('.el-message').filter({ hasText: '数据库服务暂时不可用' })
        await expect(errors).toHaveCount(1)
        await expect(errors).not.toContainText('technical')
        await page.screenshot({
          path: testInfo.outputPath('current-bin-error.png'),
          animations: 'disabled'
        })
      }
      if (scenario === '关闭重开') {
        await drawer.getByRole('button', { name: '取消', exact: true }).click()
        await expect(drawer).not.toBeVisible()
        await page
          .getByRole('button', {
            name: kind.startsWith('transfer') ? '测试调拨申请创建' : '测试盘盈单创建',
            exact: true
          })
          .click()
        await expect(drawer.getByRole('button', { name: '导入明细', exact: true })).toBeVisible()
        await drawer.locator('input[type=file]').setInputFiles({
          name: '新明细.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from('物料编码,数量\nMAT,3\n')
        })
        await expect(row.getByRole('spinbutton').first()).toHaveValue('3.0000')
        await warehouse.scrollIntoViewIfNeeded()
        if (kind === 'transfer-target') {
          await warehouse.click()
          await page
            .getByRole('option', { name: '仓库A', exact: true })
            .and(page.locator(':visible'))
            .click()
        }
      }
      await warehouse.click()
      await page
        .getByRole('option', { name: '仓库B', exact: true })
        .and(page.locator(':visible'))
        .click()
      if (scenario === '当前失败重试') {
        await warehouse.click()
        await page
          .getByRole('option', { name: '仓库A', exact: true })
          .and(page.locator(':visible'))
          .click()
      }
      const bin = row
        .locator('td')
        .nth(
          await col(
            kind === 'transfer-source'
              ? '调出仓位'
              : kind === 'transfer-target'
                ? '调入仓位'
                : '仓位'
          )
        )
        .getByRole('combobox')
      await bin.click()
      await expect(
        page.getByRole('option', { name: 'B · 新仓位', exact: true }).and(page.locator(':visible'))
      ).toBeVisible()
      if (scenario !== '当前失败重试') {
        const response = page.waitForResponse((r) => r.url().includes('warehouse_id=eq.A'))
        release()
        await (await response).finished()
      }
      await expect(page.getByRole('option', { name: 'A · 旧仓位', exact: true })).toHaveCount(0)
      await expect(
        page.getByRole('option', { name: 'B · 新仓位', exact: true }).and(page.locator(':visible'))
      ).toBeVisible()
      await expect(
        page.locator('.el-message').filter({ hasText: '数据库服务暂时不可用' })
      ).toHaveCount(0)
      await page.screenshot({
        path: testInfo.outputPath('current-warehouse-bin.png'),
        animations: 'disabled'
      })
      if (scenario === '换仓') {
        await bin.press('Tab')
        for (const label of kind === 'gain'
          ? ['单价(元)', '盘盈数量(库存)']
          : kind === 'loss'
            ? ['单价(元)', '盘亏数量(库存)']
            : ['数量']) {
          const price = row
            .locator('td')
            .nth(await col(label))
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
          if (kind.startsWith('transfer')) {
            const base = row
              .locator('td')
              .nth(await col('基本数量'))
              .locator('.cell')
            await expect(base).toHaveText('12345678.1234')
            const readable = await base.evaluate((element) => {
              const range = document.createRange()
              range.selectNodeContents(element)
              return (
                new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top)))
                  .size === 1 && element.scrollWidth <= element.clientWidth
              )
            })
            expect(readable, '基本数量须完整显示且不可折行').toBe(true)
            await base.scrollIntoViewIfNeeded()
            await base.evaluate((element) => {
              const wrap = element.closest('.el-table')?.querySelector('.el-scrollbar__wrap')
              if (!(wrap instanceof HTMLElement)) throw new Error('基本数量滚动容器缺失')
              wrap.scrollLeft +=
                element.getBoundingClientRect().left - wrap.getBoundingClientRect().left - 16
            })
            await page.screenshot({
              path: testInfo.outputPath('base-number-full.png'),
              animations: 'disabled'
            })
          }
          await page.screenshot({
            path: testInfo.outputPath(`${label}-full-number.png`),
            animations: 'disabled'
          })
        }
      }
    })
