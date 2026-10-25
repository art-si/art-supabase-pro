import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
for (const { navigationAllowed, theme, boxBorderMode } of [
  { navigationAllowed: false, theme: 'light', boxBorderMode: true },
  { navigationAllowed: true, theme: 'light', boxBorderMode: true },
  { navigationAllowed: true, theme: 'light', boxBorderMode: false },
  { navigationAllowed: true, theme: 'dark', boxBorderMode: true },
  { navigationAllowed: true, theme: 'dark', boxBorderMode: false }
] as const) {
  test(`危废仓库删除与引用导航 ${navigationAllowed}-${theme}-${boxBorderMode ? 'border' : 'shadow'}`, async ({
    page
  }, testInfo) => {
    await prepareIsolatedSession(page)
    await prepareAppearance(page, { theme, boxBorderMode })
    const path = '/smis/hazardous-waste-management/warehouse-definition'
    const menu = {
      id: 'warehouse',
      parentId: null,
      name: 'SmisHazardousWasteWarehouseDefinition',
      path,
      component: path,
      type: 'menu',
      sort: 1,
      meta: { title: '仓库定义', is_enable: true, is_hide: false, roles: [] }
    }
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
    )
    await mockApplicationMenus(page, {
      smis: [
        menu,
        ...['inbound', 'outbound'].flatMap((direction) => {
          const name =
            direction === 'inbound' ? 'SmisHazardousWasteInbound' : 'SmisHazardousWasteOutbound'
          const targetPath = `/smis/hazardous-waste-management/hazardous-waste-${direction}`
          const target = {
            ...menu,
            id: name,
            name,
            path: targetPath,
            component: targetPath,
            meta: { ...menu.meta, title: direction === 'inbound' ? '危废入库' : '危废出库' }
          }
          return [
            target,
            ...(navigationAllowed
              ? ['View', 'Submit', 'Delete'].map((action) => ({
                  ...target,
                  id: `${name}-${action}`,
                  parentId: name,
                  name: `${name}:${action}`,
                  type: 'button',
                  path: '',
                  component: ''
                }))
              : [])
          ]
        }),
        ...['View', 'Delete'].map((action) => ({
          ...menu,
          id: `warehouse-${action}`,
          parentId: menu.id,
          name: `${menu.name}:${action}`,
          type: 'button',
          path: '',
          component: ''
        }))
      ]
    })
    const row = {
      id: '10000000-0000-0000-0000-000000000001',
      warehouseName: '测试危废仓库',
      warehouseCode: 'CK-001',
      status: 'enabled',
      sort: 1,
      regionPath: [],
      updateTime: '2026-01-01'
    }
    let navigationFailure = true
    let documentDeleted = false
    await page.route('**/rest/v1/rpc/smis_list_hazardous_waste_documents_secure', (route) => {
      if (documentDeleted) return route.fulfill({ json: { records: [], total: 0 } })
      const query = route.request().postDataJSON()
      if (query.p_document_no) {
        expect(query.p_warehouse_id).toBe(row.id)
        expect(query.p_document_no).toBe('WF-001')
      }
      if (query.p_direction === 'outbound' && navigationFailure)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'database unavailable' }
        })
      const records =
        query.p_direction === 'outbound'
          ? [
              {
                id: 'doc-1',
                documentNo: 'WF-001',
                warehouseId: row.id,
                warehouseName: row.warehouseName,
                operationDate: '2026-01-01',
                status: 'draft',
                items: [],
                handlerEmployeeName: '测试经办人',
                handlerEmployeeNo: 'TEST-001',
                createTime: '2026-01-01'
              }
            ]
          : []
      if (records.length) records.push({ ...records[0], id: 'doc-2', documentNo: 'WF-001-OTHER' })
      return route.fulfill({
        json: {
          records,
          total: records.length,
          overview: {
            total: records.length,
            draft: records.length,
            pending: 0,
            approved: 0,
            rejected: 0,
            quantity: 0
          }
        }
      })
    })
    await page.route('**/rest/v1/rpc/smis_list_hazardous_waste_warehouses_secure', (route) =>
      route.fulfill({
        json: {
          records: [
            row,
            {
              ...row,
              id: '10000000-0000-0000-0000-000000000002',
              warehouseName: '测试备用仓库',
              warehouseCode: 'CK-002'
            }
          ],
          total: 2,
          overview: { total: 2, enabled: 2, managed: 0, regionCount: 0 }
        }
      })
    )
    let failure = true,
      blocked = false,
      deletes = 0,
      checks = 0
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details*', (route) => {
      checks++
      expect(route.request().postDataJSON().p_table).toBe('smis_hazardous_waste_warehouse')
      if (failure)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'database unavailable' }
        })
      return route.fulfill({
        json: blocked
          ? [
              {
                resourceId: row.id,
                sourceTable: 'smis_hazardous_waste_document',
                recordId: 'doc-1',
                targetId: 'doc-1',
                recordNo: 'WF-001',
                recordStatus: 'draft',
                createdAt: '2026-01-01'
              }
            ]
          : []
      })
    })
    await page.route('**/rest/v1/rpc/smis_delete_hazardous_waste_warehouses_secure', (route) => {
      expect(route.request().postDataJSON().p_ids).toEqual([
        row.id,
        '10000000-0000-0000-0000-000000000002'
      ])
      deletes++
      blocked = true
      return route.fulfill({
        status: 400,
        json: { code: 'P0001', message: '选中的仓库已被危废单据引用，请改为停用' }
      })
    })
    await page.goto(`#${path}`)
    const remove = page
      .locator('.el-table__body-wrapper')
      .getByRole('button', { name: '删除', exact: true })
      .first()
    await expect(remove).toBeVisible({ timeout: 60_000 })
    await remove.click()
    await expect(page.getByText('关联资料未完成核验，删除已停止')).toBeVisible()
    expect(deletes).toBe(0)
    await expect(page.getByText('确定删除危废仓库', { exact: false })).toHaveCount(0)
    failure = false
    blocked = true
    await page.getByRole('button', { name: '重新检查', exact: true }).click()
    await expect(page.getByText('WF-001', { exact: true })).toBeVisible()
    expect(deletes).toBe(0)
    await page.screenshot({ path: testInfo.outputPath('blocked.png'), animations: 'disabled' })
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    blocked = false
    await page.locator('.el-table__body-wrapper .el-checkbox').first().click()
    await page.locator('.el-table__body-wrapper .el-checkbox').nth(1).click()
    await page.getByRole('button', { name: '批量删除', exact: true }).click()
    await expect(page.getByText('确定删除选中的 2 个危废仓库吗？', { exact: true })).toBeVisible()
    const before = checks
    await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
    await expect(page.getByText('WF-001', { exact: true })).toBeVisible()
    expect(deletes).toBe(1)
    expect(checks).toBeGreaterThan(before)
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    const navigate = page.getByRole('button', { name: '查看关联', exact: true })
    if (!navigationAllowed) {
      await expect(navigate).toHaveCount(0)
    } else {
      await navigate.click()
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(page.getByText('WF-001', { exact: true })).toBeVisible()
      navigationFailure = false
      await navigate.click()
      await expect(page).toHaveURL(/hazardous-waste-outbound/)
      await expect(
        page.locator('.el-table__body-wrapper').getByText('WF-001', { exact: true })
      ).toBeVisible()
      await expect(page.getByText('已精确过滤', { exact: true })).toBeVisible()
      await expect(
        page.locator('.el-table__body-wrapper').getByText('WF-001-OTHER', { exact: true })
      ).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: '单据编码', exact: true })).toHaveValue(
        'WF-001'
      )
      const onboarding = page.getByText('知道了', { exact: true })
      if (await onboarding.isVisible()) await onboarding.click()
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      await page.screenshot({
        path: testInfo.outputPath('reference-navigation.png'),
        animations: 'disabled'
      })
      const referenceUrl = page.url()
      await assertTableFocusContract(page, testInfo, ['.master-delete-notice'])
      let transitionRequests = 0
      await page.route(
        '**/rest/v1/rpc/smis_transition_hazardous_waste_document_secure',
        (route) => {
          transitionRequests++
          return route.abort('failed')
        }
      )
      const submit = page
        .locator('.el-table__body-wrapper')
        .getByRole('button', { name: '提交', exact: true })
      await submit.click()
      await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
      expect(transitionRequests).toBe(0)
      await submit.click()
      await page.getByRole('dialog').getByRole('button', { name: '确认提交', exact: true }).click()
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      expect(transitionRequests).toBeGreaterThan(0)
      await page.mouse.move(0, 0)
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      let documentChecks = 0,
        documentDeletes = 0,
        documentSuccessfulResult = false,
        documentZeroResult = false,
        documentCheckFailure = true
      await page.route('**/rest/v1/rpc/get_record_delete_dependency_details*', (route) => {
        expect(route.request().postDataJSON().p_table).toBe('smis_hazardous_waste_document')
        documentChecks++
        return documentCheckFailure
          ? route.fulfill({ status: 503, json: { code: 'XX000', message: 'unavailable' } })
          : route.fulfill({ json: [] })
      })
      await page.route('**/rest/v1/rpc/smis_delete_hazardous_waste_documents_secure', (route) => {
        documentDeletes++
        expect(route.request().postDataJSON().p_direction).toBe('outbound')
        expect(route.request().postDataJSON().p_ids).toEqual(['doc-1'])
        if (documentSuccessfulResult) {
          documentDeleted = true
          return route.fulfill({ json: 1 })
        }
        if (documentZeroResult) return route.fulfill({ json: 0 })
        return route.fulfill({
          status: 400,
          json: { code: 'P0001', message: '单据状态已变化，请刷新后重试' }
        })
      })
      await page
        .locator('.el-table__body-wrapper')
        .getByRole('button', { name: '更多操作' })
        .click()
      await page.getByRole('menuitem', { name: '删除', exact: true }).click()
      await expect(page.getByText('关联资料未完成核验，删除已停止')).toBeVisible()
      expect(documentDeletes).toBe(0)
      const footerTextFits = await page
        .locator('.master-delete-guard__footer > span')
        .evaluate((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          const text = range.getBoundingClientRect()
          const dialog = element.closest('.el-dialog')!.getBoundingClientRect()
          return text.left >= dialog.left + 16 && text.right <= dialog.right - 16
        })
      expect(footerTextFits).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath('document-delete-check-error.png'),
        animations: 'disabled'
      })
      documentCheckFailure = false
      await page.getByRole('button', { name: '重新检查', exact: true }).click()
      await expect(page.getByRole('dialog', { name: '删除检查未完成', exact: true })).toBeHidden()
      await page.locator('.el-table__body-wrapper .el-checkbox').first().click()
      await page.getByRole('button', { name: '批量删除', exact: true }).click()
      await expect(page.getByText('确定删除单据“WF-001”吗？', { exact: true })).toBeVisible()
      const beforeDocumentDelete = documentChecks
      await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      expect(documentDeletes).toBe(1)
      expect(documentChecks).toBeGreaterThan(beforeDocumentDelete)
      await page.mouse.move(0, 0)
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      documentZeroResult = true
      const documentSelection = page.locator('.el-table__body-wrapper .el-checkbox').first()
      if (!(await documentSelection.locator('input').isChecked())) await documentSelection.click()
      await page.getByRole('button', { name: '批量删除', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(page.locator('.el-message--success')).toHaveCount(0)
      expect(documentDeletes).toBe(2)
      await page.screenshot({
        path: testInfo.outputPath('document-delete-zero-result.png'),
        animations: 'disabled'
      })
      await expect(
        page.locator('.el-table__body-wrapper').getByText('WF-001', { exact: true })
      ).toBeVisible()
      await page.getByRole('button', { name: '清除定位', exact: true }).click()
      await expect(page.getByText('已精确过滤', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: '单据编码', exact: true })).toHaveValue('')
      await expect(
        page.locator('.el-table__body-wrapper').getByText('WF-001-OTHER', { exact: true })
      ).toBeVisible()
      let pickerFailure = true
      const remoteWarehouse = {
        ...row,
        id: '10000000-0000-0000-0000-000000001001',
        warehouseName: '远端危废仓库',
        warehouseCode: 'CK-1001'
      }
      await page.route('**/rest/v1/rpc/smis_list_hazardous_waste_warehouses_secure', (route) => {
        const query = route.request().postDataJSON()
        expect(query.p_to - query.p_from).toBeLessThan(1000)
        if (pickerFailure)
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'database unavailable' }
          })
        return route.fulfill({
          json: {
            records: query.p_keyword ? [remoteWarehouse] : [row],
            total: query.p_keyword ? 1 : 1001
          }
        })
      })
      await page.getByRole('textbox', { name: '仓库', exact: true }).click()
      const picker = page.getByRole('dialog', { name: '选择危废仓库', exact: true })
      await expect(
        picker.getByText('请检查网络连接后重新加载，已选内容会保留。', { exact: true })
      ).toBeVisible()
      pickerFailure = false
      await picker.getByRole('button', { name: '重新加载', exact: true }).click()
      await expect(picker.locator('.el-pagination')).toBeVisible()
      await picker.getByPlaceholder('搜索仓库名称或编号').fill('CK-1001')
      await picker.getByPlaceholder('搜索仓库名称或编号').press('Enter')
      await expect(picker.getByText('远端危废仓库', { exact: true })).toBeVisible()
      await picker.screenshot({
        path: testInfo.outputPath('warehouse-picker.png'),
        animations: 'disabled'
      })
      await picker.getByText('远端危废仓库', { exact: true }).click()
      await picker.getByRole('button', { name: '确定', exact: true }).click()
      await expect(page.getByRole('textbox', { name: '仓库', exact: true })).toHaveValue(
        '远端危废仓库'
      )
      const filteredRequest = page.waitForRequest(
        (request) =>
          request.url().includes('/rpc/smis_list_hazardous_waste_documents_secure') &&
          request.postDataJSON().p_warehouse_id === remoteWarehouse.id
      )
      await page.getByRole('button', { name: '查询', exact: true }).click()
      await filteredRequest
      await page.goto(referenceUrl)
      await expect(page.getByText('已精确过滤', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '返回危废仓库管理', exact: true }).click()
      await expect(page).toHaveURL(/warehouse-definition/)
      await page.goto(referenceUrl)
      await expect(
        page.locator('.el-table__body-wrapper').getByText('WF-001', { exact: true })
      ).toBeVisible()
      documentSuccessfulResult = true
      await page
        .locator('.el-table__body-wrapper')
        .getByRole('button', { name: '更多操作' })
        .click()
      await page.getByRole('menuitem', { name: '删除', exact: true }).click()
      await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
      await expect(page.locator('.el-message--success')).toHaveCount(1)
      await expect(
        page.locator('.el-table__body-wrapper').getByText('WF-001', { exact: true })
      ).toHaveCount(0)
      expect(documentDeletes).toBe(3)
    }
  })
}
