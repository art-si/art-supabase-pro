import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const kind of ['gain', 'loss', 'transfer']) {
  test(`${kind}两行编辑复制详情保持明细可读`, async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const description = (line: number) =>
      `测试物料 ${line} · 用于检查明细列宽与复制` +
      (kind === 'transfer' ? ' · 长物料描述及规格说明'.repeat(12) : '')
    let writes = 0
    let historicalRequests = 0
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      if (route.request().method() !== 'GET') writes += 1
      const rows = [1, 2].map((line) => ({
        document_id: 'document-test',
        document_no: 'TEST-DOCUMENT-001',
        line_no: line,
        organization_id: 'org-test',
        document_type_id: 'type-test',
        business_type_id: 'business-test',
        business_date: '2026-10-05',
        accounting_date: '2026-10-05',
        application_date: '2026-10-05',
        material_id: `material-${line}`,
        material_code: `TEST-${line}`,
        material_name: `测试物料 ${line}`,
        material_description: description(line),
        specification_model: 'TEST-MODEL',
        inventory_unit_id: 'unit-test',
        inventory_unit_name: '测试库存单位',
        base_unit_id: 'unit-test',
        base_unit_name: '测试基本单位',
        quantity: line + 1,
        book_quantity: 10,
        variance_quantity: kind === 'loss' ? -line : line,
        unit_price: 10,
        warehouse_id: 'warehouse-test',
        source_warehouse_id: 'warehouse-test',
        target_warehouse_id: 'warehouse-target',
        source_organization_id: 'org-test',
        target_organization_id: 'org-target',
        stock_type: kind === 'transfer' && line === 2 ? 'legacy' : 'normal',
        stock_status: 'available',
        owner_type: kind === 'transfer' ? 'self' : line === 1 ? 'supplier' : 'customer',
        owner_id: kind === 'transfer' ? null : line === 1 ? 'supplier-test' : 'customer-test',
        gift: false,
        document_remark: '测试长备注用于详情检查，不包含真实业务数据。'
      }))
      await route.fulfill({
        json: path.endsWith('/sys_menu')
          ? { id: 'menu-test' }
          : /\/wms_(count_adjustment|transfer_request)_list$/.test(path)
            ? rows
            : path.endsWith('/mdm_supplier')
              ? [
                  {
                    id: 'supplier-test',
                    supplier_code: 'SUP-TEST',
                    supplier_name: '测试盘点供应商'
                  }
                ]
              : path.endsWith('/mdm_customer')
                ? [
                    {
                      id: 'customer-test',
                      customer_code: 'CUS-TEST',
                      customer_name: '测试盘点客户'
                    }
                  ]
                : []
      })
    })
    if (kind === 'transfer') {
      await page.route('**/rest/v1/sys_dictionary?*', (route) => {
        const params = new URL(route.request().url()).searchParams
        if (params.get('value') === 'eq.legacy') historicalRequests += 1
        return route.fulfill({
          json: [
            {
              code: 'wmsCountStockType',
              name: '正常库存',
              label: '',
              value: 'normal',
              status: '1'
            },
            {
              code: 'wmsCountStockType',
              name: '历史库存',
              label: '',
              value: 'legacy',
              status: '0'
            },
            { code: 'wmsStockStatus', name: '可用', label: '', value: 'available', status: '1' },
            { code: 'wmsStockStatus', name: '历史状态', label: '', value: 'legacy', status: '0' },
            { code: 'mdmBusinessOwnerType', name: '自有', label: '', value: 'self', status: '1' },
            {
              code: 'mdmBusinessOwnerType',
              name: '历史货主',
              label: '',
              value: 'legacy',
              status: '0'
            }
          ].filter((item) => {
            const code = params.get('dict_type_table.code')
            const value = params.get('value')
            const status = params.get('status')
            return (
              (!code || code === `eq.${item.code}`) &&
              (!value || value === `eq.${item.value}`) &&
              (!status || status === `eq.${item.status}`)
            )
          })
        })
      })
    }
    await page.goto(`/tests/e2e/fixtures/wms-operation-retry.html?adjustmentKind=${kind}`)
    const family = kind === 'transfer' ? '调拨申请' : '盘点调整'
    {
      await page
        .getByRole('button', {
          name: kind === 'transfer' ? '测试调拨申请创建' : '测试盘盈单创建',
          exact: true
        })
        .click()
      const drawer = page.locator('.el-drawer:visible')
      await drawer.getByRole('button', { name: '全屏', exact: true }).click()
      const wrap = drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap')
      await wrap.evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await expect
        .poll(() =>
          drawer.evaluate((el) => {
            const content = el.querySelector('.art-drawer__content')!.getBoundingClientRect()
            const footer = el.querySelector('.el-drawer__footer')!.getBoundingClientRect()
            return content.bottom <= footer.top + 1
          })
        )
        .toBe(true)
      if (kind !== 'transfer')
        await expect(
          drawer.getByText('支持多选物料，编码、规格和默认单位自动带入。')
        ).toBeInViewport()
      await page.screenshot({
        path: testInfo.outputPath(`${kind}-create-fullscreen-bottom.png`),
        animations: 'disabled'
      })
      await drawer.getByRole('button', { name: '取消', exact: true }).click()
    }
    for (const mode of ['edit', 'copy', 'view']) {
      await page.getByRole('button', { name: `测试${family} ${mode}`, exact: true }).click()
      const drawer = page.locator('.el-drawer:visible')
      if (mode === 'edit') {
        await drawer.getByRole('button', { name: '全屏', exact: true }).click()
        await expect(drawer).toHaveClass(/(?:^|\s)is-fullscreen(?:\s|$)/)
        const wrap = drawer.locator('.art-drawer__scrollbar > .el-scrollbar__wrap')
        await wrap.evaluate((el) => {
          el.scrollTop = el.scrollHeight
        })
        await expect
          .poll(() =>
            drawer.evaluate((el) => {
              const content = el.querySelector('.art-drawer__content')!.getBoundingClientRect()
              const footer = el.querySelector('.el-drawer__footer')!.getBoundingClientRect()
              return content.bottom <= footer.top + 1
            })
          )
          .toBe(true)
        await page.screenshot({
          path: testInfo.outputPath(`${kind}-fullscreen-bottom.png`),
          animations: 'disabled'
        })
      }
      await expect(drawer.getByText(description(1)).first()).toBeVisible()
      await expect(drawer.getByText(description(2)).first()).toBeVisible()
      if (mode === 'copy') {
        await expect(drawer.locator('.art-entity-summary')).toContainText('复制')
        await expect(drawer.getByRole('textbox', { name: '单据编号', exact: true })).toHaveValue(
          '保存后自动生成'
        )
      }
      if (mode !== 'view') {
        if (kind === 'transfer') {
          const historical = drawer.locator('.el-select').filter({ hasText: '历史库存' })
          await expect(historical).toHaveCount(1)
          await historical.scrollIntoViewIfNeeded()
          await expect(historical).toBeInViewport()
          await page.screenshot({
            path: testInfo.outputPath(`transfer-${mode}-historical-label.png`),
            animations: 'disabled'
          })
        }
        if (kind === 'transfer' && mode === 'edit') {
          const headers = await drawer.locator('.el-table__header th').allTextContents()
          const row = drawer.locator('.el-table__body tr').first()
          for (const [label, option] of [
            ['货主类型', '自有'],
            ['库存类型', '正常库存'],
            ['库存状态', '可用']
          ]) {
            const cell = row.locator('td').nth(headers.findIndex((text) => text.trim() === label))
            await cell.scrollIntoViewIfNeeded()
            await cell.locator('.el-select').click()
            await expect(page.getByRole('option', { name: option, exact: true })).toBeVisible()
            await expect(page.getByRole('option')).toHaveCount(1)
            await page.screenshot({
              path: testInfo.outputPath(`transfer-${label}-options.png`),
              animations: 'disabled'
            })
            await page.getByRole('option', { name: option, exact: true }).click()
          }
        }
        {
          const dates = await drawer.locator('.art-form .el-date-editor').evaluateAll((elements) =>
            elements.map((element) => ({
              width: element.getBoundingClientRect().width,
              available: element.closest('.el-form-item__content')!.getBoundingClientRect().width
            }))
          )
          expect(dates).toHaveLength(kind === 'transfer' ? 1 : 2)
          for (const date of dates) expect(date.width / date.available).toBeGreaterThan(0.95)
        }
        const sizes = await drawer.locator('.el-table__body .el-select').evaluateAll((elements) =>
          elements.map((el) => ({
            width: el.getBoundingClientRect().width,
            cell: el.closest('td')!.getBoundingClientRect().width
          }))
        )
        expect(sizes.length).toBeGreaterThan(5)
        for (const size of sizes) {
          expect(size.width).toBeGreaterThan(80)
          expect(size.width / size.cell).toBeGreaterThan(0.6)
        }
        await expect(
          drawer.getByRole('button', { name: /保存(?:副本)?|确定/, exact: true })
        ).toBeEnabled()
      } else {
        if (kind === 'transfer')
          await expect(drawer.getByText('历史库存', { exact: true })).toBeVisible()
        await expect(
          drawer.getByRole('button', { name: /保存(?:副本)?|确定/, exact: true })
        ).toHaveCount(0)
        await expect(drawer.locator('.art-descriptions')).toBeVisible()
      }
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`${kind}-${mode}.png`)
      })
      await drawer.getByText(description(1)).first().scrollIntoViewIfNeeded()
      await page.screenshot({
        animations: 'disabled',
        path: testInfo.outputPath(`${kind}-${mode}-lines.png`)
      })
      if (testInfo.project.name.includes('mobile')) {
        await expect(
          drawer.locator(
            '.el-table__body td.el-table-fixed-column--left, .el-table__body td.el-table-fixed-column--right'
          )
        ).toHaveCount(0)
        if (mode !== 'view') {
          const selects = drawer.locator('.el-table__body .el-select')
          await selects
            .nth(3)
            .evaluate((el) => el.scrollIntoView({ inline: 'center', block: 'nearest' }))
          await page.screenshot({
            animations: 'disabled',
            path: testInfo.outputPath(`${kind}-${mode}-scrolled.png`)
          })
        }
      }

      if (mode === 'view' && kind !== 'transfer') {
        await expect(
          drawer.locator('.el-table__body').getByText('测试盘点供应商', { exact: true })
        ).toHaveCount(1)
        await expect(
          drawer.locator('.el-table__body').getByText('测试盘点客户', { exact: true })
        ).toHaveCount(1)
        const owner = drawer.locator('.el-table__header th').filter({ hasText: /^货主$/ })
        await owner.evaluate((el) => {
          const index = Array.from(el.parentElement?.children ?? []).indexOf(el)
          el.closest('.el-table')
            ?.querySelector('.el-table__body tr')
            ?.children[index]?.scrollIntoView({ inline: 'center', block: 'nearest' })
        })
        await expect(owner).toBeVisible()
        await page.screenshot({
          path: testInfo.outputPath(`${kind}-owner-detail.png`),
          animations: 'disabled'
        })
      }
      await drawer
        .getByRole('button', { name: /关闭此对话框|Close this dialog/, exact: true })
        .click()
    }
    expect(writes).toBe(0)
    if (kind === 'transfer') {
      expect(historicalRequests).toBe(1)
      await page.getByRole('button', { name: '测试清空字典缓存', exact: true }).click()
      await page.getByRole('button', { name: '测试调拨申请 edit', exact: true }).click()
      const refreshed = page.locator('.el-drawer:visible')
      await expect(refreshed.locator('.el-select').filter({ hasText: '历史库存' })).toHaveCount(1)
      expect(historicalRequests).toBe(2)
      await refreshed
        .getByRole('button', { name: /关闭此对话框|Close this dialog/, exact: true })
        .click()
    }
    expect(errors).toEqual([])
  })
}
