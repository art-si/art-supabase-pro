import { expect, test, type Route } from '@playwright/test'
import { installFixtures, meta, tenantId } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'

for (const scenario of [
  {
    app: 'wms',
    path: '/wms/receipt-issue/receipt-inbound',
    name: 'WmsReceiptInbound',
    title: '收料入库',
    kind: 'inbound'
  },
  {
    app: 'fms',
    path: '/fms/settlement/asset-payable',
    name: 'FinanceAssetPayable',
    title: '资产应付',
    kind: 'asset_payable'
  }
].flatMap((scenario) =>
  scenario.kind === 'inbound'
    ? [
        { ...scenario, viewOnly: false },
        { ...scenario, viewOnly: true }
      ]
    : [{ ...scenario, viewOnly: false }]
)) {
  test(`${scenario.title}${scenario.viewOnly ? '仅查看权限' : ''}查询失败清理旧单据并可恢复`, async ({
    page
  }, testInfo) => {
    test.setTimeout(90_000)
    await installFixtures(page)
    if (scenario.kind === 'inbound') {
      await page.route('**/rpc/current_is_super', (route) => route.fulfill({ json: false }))
      await page.route('**/rest/v1/sys_user?*', (route) =>
        route.fulfill({
          json: {
            id: 'receipt-ordinary-user',
            auth_user_id: '705ddd8d-4959-4dc1-aeb0-08caed7ab51a',
            user_name: '普通收料用户',
            user_type: '2',
            user_roles: ['R_USER'],
            status: '1',
            tenant_id: tenantId,
            tenant: { id: tenantId, tenant_code: 'DEMO', tenant_name: '示例工厂' }
          }
        })
      )
    }
    await page.route('**/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'platform', name: '平台', baseUrl: '/' },
          { code: scenario.app, name: scenario.app.toUpperCase(), baseUrl: `/${scenario.app}/` }
        ]
      })
    )
    await mockApplicationMenus(page, {
      [scenario.app]: [
        {
          id: 'receipt-menu',
          parentId: null,
          name: scenario.name,
          path: scenario.path,
          component: scenario.path,
          type: 'menu',
          sort: 1,
          meta: meta(scenario.title)
        },
        ...(scenario.kind === 'inbound' && !scenario.viewOnly
          ? ['View', 'Confirm', 'AssignScope', 'AssignBin', 'CaptureSN']
          : ['View']
        ).map((action) => ({
          id: `receipt-${action}`,
          parentId: 'receipt-menu',
          name: `${scenario.name}:${action}`,
          path: '',
          component: '',
          type: 'button',
          sort: 1,
          meta: meta(action)
        }))
      ]
    })
    let state: 'data' | 'error' | 'empty' = 'data'
    await page.route('**/rest/v1/mdm_project_construction?*', (route) =>
      route.fulfill({
        json: [{ construction_no: 'SCOPE-01', section_name: '测试施工段', status: 'active' }]
      })
    )
    await page.route('**/rest/v1/scm_receipt_target_document?*', (route) =>
      route.fulfill(
        state === 'error'
          ? { status: 503, json: { code: 'XX000', message: '测试收料读取失败' } }
          : {
              json:
                state === 'empty'
                  ? []
                  : [
                      {
                        id: 'receipt-test',
                        tenant_id: tenantId,
                        document_no: 'RECEIPT-TEST-001',
                        status: 'draft',
                        created_at: '2026-10-01T01:02:03Z',
                        target_kind: scenario.kind,
                        project_id: scenario.kind === 'inbound' ? 'receipt-project' : null
                      }
                    ],
              headers: {
                'content-range': state === 'empty' ? '*/0' : '0-0/1',
                'access-control-expose-headers': 'content-range'
              }
            }
      )
    )
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`#${scenario.path}`)
    await expect(page.getByText('RECEIPT-TEST-001', { exact: true })).toBeVisible({
      timeout: 60_000
    })
    state = 'error'
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByText('RECEIPT-TEST-001', { exact: true })).toHaveCount(0)
    const retry = page.getByRole('button', { name: /重新加载|重试/ }).first()
    await expect(retry).toBeVisible()
    await expect(retry).toBeEnabled()
    await retry.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: testInfo.outputPath('receipt-query-error.png'),
      animations: 'disabled'
    })
    state = 'data'
    await retry.click()
    await expect(page.getByText('RECEIPT-TEST-001', { exact: true })).toBeVisible()
    state = 'empty'
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(page.getByText(`暂无${scenario.title}`, { exact: true })).toBeVisible()
    let lineFailed = false
    await page.route('**/rest/v1/mdm_material?*', (route) =>
      route.fulfill({
        json: [{ id: 'receipt-sn-material', serial_management_enabled: true }]
      })
    )
    await page.route('**/rest/v1/scm_receipt_target_line?*', (route) =>
      route.fulfill(
        lineFailed
          ? { status: 503, json: { code: 'XX000', message: '测试明细读取失败' } }
          : {
              json: [1, 2].map((line) => ({
                id: `receipt-line-${line}`,
                target_document_id: 'receipt-test',
                source_line_id: `source-line-${line}`,
                line_snapshot: {
                  line_no: line,
                  material_code: `RECEIPT-MAT-${line}`,
                  material_id: 'receipt-sn-material',
                  material_description: `收料测试物料${line}`,
                  quantity: line,
                  stock_quantity: line,
                  warehouse_id: 'receipt-warehouse'
                },
                serial_nos: [],
                amount: line
              }))
            }
      )
    )
    state = 'data'
    await page.locator('.el-radio-button').filter({ hasText: '按明细' }).click()
    const table = page.locator('.el-table__body-wrapper').first()
    await expect(table.getByText('RECEIPT-MAT-1', { exact: true })).toBeVisible()
    await expect(table.getByText('RECEIPT-MAT-2', { exact: true })).toBeVisible()
    await expect(table.getByText('2026-10-01 09:02:03', { exact: true })).toBeVisible()
    lineFailed = true
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(retry).toBeVisible()
    await expect(table.getByText('RECEIPT-MAT-1', { exact: true })).toHaveCount(0)
    lineFailed = false
    await retry.click()
    await expect(table.getByText('RECEIPT-MAT-2', { exact: true })).toBeVisible()
    await table.getByText('RECEIPT-MAT-2', { exact: true }).scrollIntoViewIfNeeded()
    await expect(table.getByText('RECEIPT-MAT-1', { exact: true })).toBeInViewport()
    await expect(table.getByText('RECEIPT-MAT-2', { exact: true })).toBeInViewport()
    await page.screenshot({
      path: testInfo.outputPath('receipt-two-lines-recovered.png'),
      animations: 'disabled'
    })
    await page.locator('.el-radio-button').filter({ hasText: '按单据' }).click()
    await expect(page.getByRole('columnheader', { name: '物料编码', exact: true })).toHaveCount(0)
    await expect(table.locator('tr.el-table__row')).toHaveCount(1)
    await expect(table.getByText('RECEIPT-TEST-001', { exact: true })).toBeVisible()
    lineFailed = true
    await table.getByText('RECEIPT-TEST-001', { exact: true }).click()
    const drawer = page.locator('.el-drawer')
    await expect(drawer.getByText('单据明细加载失败', { exact: true })).toBeVisible()
    lineFailed = false
    await drawer.getByRole('button', { name: /重新加载|重试/ }).click()
    await expect(drawer.getByText('RECEIPT-MAT-1', { exact: true })).toBeVisible()
    await expect(drawer.getByText('RECEIPT-MAT-2', { exact: true })).toBeVisible()
    if (scenario.viewOnly) {
      await expect(drawer.getByRole('combobox').first()).toBeDisabled()
      for (const action of ['保存施工号', '指定入库库位', '录入序列号'])
        await expect(drawer.getByRole('button', { name: action, exact: true })).toHaveCount(0)
      await expect(table.getByRole('button', { name: '确认入库', exact: true })).toHaveCount(0)
      await expect(drawer.getByRole('button', { name: /^录入 SN/ })).toHaveCount(0)
      await expect(drawer.getByText('0 件 SN', { exact: true })).toHaveCount(2)
      await drawer.getByText('0 件 SN', { exact: true }).first().scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('receipt-viewonly-detail.png'),
        animations: 'disabled'
      })
      await page.keyboard.press('Escape')
      await expect(drawer).toBeHidden()
      expect(errors).toEqual([])
      return
    }
    if (scenario.kind === 'inbound') {
      let serialFailed = true
      const serialWrites: unknown[] = []
      await page.route('**/rpc/wms_set_receipt_line_serials_secure', (route) => {
        serialWrites.push(route.request().postDataJSON())
        return route.fulfill(
          serialFailed
            ? { status: 400, json: { code: 'P0001', message: '测试普通用户 SN 保存失败' } }
            : { json: null }
        )
      })
      await drawer.getByRole('button', { name: '录入 SN (0)', exact: true }).nth(1).click()
      const serialDialog = page.getByRole('dialog', { name: /录入.*SN|录入.*序列号/ })
      const serialInput = serialDialog.getByRole('textbox')
      const serialConfirm = serialDialog.getByRole('button', { name: '确定', exact: true })
      await serialInput.fill('SN-ORDINARY-001\nSN-ORDINARY-001')
      await serialConfirm.click()
      await expect(
        page.getByText('SN 编码必须逐件唯一，件数应等于本行库存数量', { exact: true })
      ).toBeVisible()
      expect(serialWrites).toHaveLength(0)
      await serialInput.fill('SN-ORDINARY-001\nSN-ORDINARY-002')
      await serialConfirm.click()
      await expect(
        page.getByText('测试普通用户 SN 保存失败', { exact: true }).first()
      ).toBeVisible()
      await expect(serialInput).toHaveValue('SN-ORDINARY-001\nSN-ORDINARY-002')
      serialFailed = false
      await serialConfirm.click()
      await expect(serialDialog).toBeHidden()
      expect(serialWrites).toEqual(
        [1, 2].map(() => ({
          p_line_id: 'receipt-line-2',
          p_serial_nos: ['SN-ORDINARY-001', 'SN-ORDINARY-002']
        }))
      )
      await expect(drawer.getByText('RECEIPT-MAT-2', { exact: true })).toBeVisible()
      let pendingScope: Route | undefined
      const scopeResponse = page.waitForResponse('**/rpc/wms_set_receipt_scope_secure')
      await page.route('**/rpc/wms_set_receipt_scope_secure', (route) => {
        pendingScope = route
      })
      const scope = drawer.getByRole('combobox').first()
      await scope.click()
      await page.getByRole('option', { name: 'SCOPE-01 · 测试施工段', exact: true }).click()
      const saveScope = drawer.getByRole('button', { name: '保存施工号', exact: true })
      await saveScope.click()
      await expect.poll(() => Boolean(pendingScope)).toBe(true)
      expect(pendingScope!.request().postDataJSON()).toMatchObject({
        p_target_id: 'receipt-test',
        p_construction_no: 'SCOPE-01'
      })
      await expect(scope).toBeDisabled()
      await page.keyboard.press('Escape')
      await expect(drawer).toBeHidden()
      await table.getByText('RECEIPT-TEST-001', { exact: true }).click()
      await expect(drawer.getByText('RECEIPT-MAT-2', { exact: true })).toBeVisible()
      await expect(scope).toBeEnabled()
      await pendingScope!.fulfill({ json: null })
      await (await scopeResponse).finished()
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      await expect(drawer.getByText('施工号：待指定', { exact: true })).toBeVisible()
      await expect(saveScope).toBeDisabled()
      await page.screenshot({
        path: testInfo.outputPath('receipt-scope-reopened.png'),
        animations: 'disabled'
      })
      await page.route('**/rest/v1/mdm_warehouse?*', (route) =>
        route.fulfill({
          json: {
            id: 'receipt-warehouse',
            warehouse_code: 'WH-01',
            warehouse_name: '测试仓库',
            enable_locations: false
          }
        })
      )
      await page.route('**/rpc/wms_set_receipt_line_bin_secure', (route) =>
        route.fulfill({ json: null })
      )
      pendingScope = undefined
      const concurrentScopeResponse = page.waitForResponse('**/rpc/wms_set_receipt_scope_secure')
      await scope.click()
      await page.getByRole('option', { name: 'SCOPE-01 · 测试施工段', exact: true }).click()
      await saveScope.click()
      await expect.poll(() => Boolean(pendingScope)).toBe(true)
      await drawer.getByRole('button', { name: '指定入库库位', exact: true }).first().click()
      const binDialog = page.getByRole('dialog', { name: /指定入库库位/ })
      await expect(
        binDialog.getByText('此仓库未启用库位，入库将直接归属仓库。', { exact: true })
      ).toBeVisible()
      const refreshedLines = page.waitForResponse('**/rest/v1/scm_receipt_target_line?*')
      await binDialog.getByRole('button', { name: '确定', exact: true }).click()
      await expect(binDialog).toBeHidden()
      await (await refreshedLines).finished()
      await expect(drawer.getByText('RECEIPT-MAT-2', { exact: true })).toBeVisible()
      await expect(scope).toBeDisabled()
      await pendingScope!.fulfill({ json: null })
      await (await concurrentScopeResponse).finished()
      await expect(scope).toBeEnabled()
      await expect(drawer.getByText('施工号：SCOPE-01', { exact: true })).toBeVisible()
      await expect(saveScope).toBeDisabled()
      await page.screenshot({
        path: testInfo.outputPath('receipt-scope-after-bin-refresh.png'),
        animations: 'disabled'
      })
    }
    await drawer.getByText('RECEIPT-MAT-2', { exact: true }).scrollIntoViewIfNeeded()
    await expect(drawer.locator('.receipt-target-detail__summary strong')).toBeInViewport()
    expect(await drawer.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true
    )
    await page.screenshot({
      path: testInfo.outputPath('receipt-detail-recovered.png'),
      animations: 'disabled'
    })
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    let oldRequest: Route | undefined
    let holdOldRequest = true
    await page.route('**/rest/v1/scm_receipt_target_line?*', async (route) => {
      if (holdOldRequest) {
        holdOldRequest = false
        oldRequest = route
        return
      }
      await route.fulfill({
        json: [
          {
            id: 'fresh-line',
            line_snapshot: { material_code: 'FRESH-RECEIPT-MAT', quantity: 2 },
            serial_nos: [],
            amount: 2
          }
        ]
      })
    })
    await table.getByText('RECEIPT-TEST-001', { exact: true }).click()
    await expect.poll(() => Boolean(oldRequest)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    await table.getByText('RECEIPT-TEST-001', { exact: true }).click()
    await expect(drawer.getByText('FRESH-RECEIPT-MAT', { exact: true })).toBeVisible()
    const oldResponse = page.waitForResponse((response) =>
      response.url().includes('/rest/v1/scm_receipt_target_line?')
    )
    await oldRequest?.fulfill({
      json: [
        {
          id: 'old-line',
          line_snapshot: { material_code: 'OLD-RECEIPT-MAT', quantity: 1 },
          serial_nos: [],
          amount: 1
        }
      ]
    })
    await (await oldResponse).finished()
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await expect(drawer.getByText('FRESH-RECEIPT-MAT', { exact: true })).toBeVisible()
    await expect(drawer.getByText('OLD-RECEIPT-MAT', { exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(drawer).toBeHidden()
    let transitionFailed = true
    let completed = false
    const transitions: unknown[] = []
    await page.route('**/rpc/scm_transition_receipt_target_secure', (route) => {
      transitions.push(route.request().postDataJSON())
      if (transitionFailed)
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '测试收料流程办理失败' }
        })
      completed = true
      return route.fulfill({ json: null })
    })
    await page.route('**/rest/v1/scm_receipt_target_document?*', (route) =>
      route.fulfill({
        json: [
          {
            id: 'receipt-test',
            tenant_id: tenantId,
            document_no: 'RECEIPT-TEST-001',
            status: completed ? (scenario.kind === 'inbound' ? 'confirmed' : 'approved') : 'draft',
            target_kind: scenario.kind,
            created_at: '2026-10-01T01:02:03Z'
          }
        ],
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' }
      })
    )
    const action = scenario.kind === 'inbound' ? '确认入库' : '审核应付'
    const actionButton = table.getByRole('button', { name: action, exact: true })
    await actionButton.click()
    const confirmation = page.locator('.el-message-box')
    await confirmation.getByRole('button', { name: '取消', exact: true }).click()
    expect(transitions).toHaveLength(0)
    await actionButton.click()
    await confirmation.getByRole('button', { name: action, exact: true }).click()
    await expect(page.getByText('测试收料流程办理失败', { exact: true }).first()).toBeVisible()
    await expect(actionButton).toBeVisible()
    transitionFailed = false
    await actionButton.click()
    await confirmation.getByRole('button', { name: action, exact: true }).click()
    await expect(actionButton).toHaveCount(0)
    await expect(
      table.getByText(scenario.kind === 'inbound' ? '已入库' : '已审核', { exact: true })
    ).toBeVisible()
    expect(transitions).toEqual(
      [1, 2].map(() => ({
        p_target_id: 'receipt-test',
        p_action: scenario.kind === 'inbound' ? 'confirm' : 'approve'
      }))
    )
    expect(errors).toEqual([])
  })
}
