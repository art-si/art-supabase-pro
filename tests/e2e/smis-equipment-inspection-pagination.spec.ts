import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const entry of ['detail', 'drawer']) {
  for (const empty of [false, true]) {
    test(`设备检验记录 ${entry} ${empty ? 'empty' : 'pagination-and-retry'}`, async ({
      page
    }, testInfo) => {
      const tenant = await prepareIsolatedSession(page)
      const renderErrors: string[] = []
      page.on('pageerror', (error) => renderErrors.push(error.message))
      page.on('console', (message) => {
        if (/Unhandled error|Property "toJSON"/.test(message.text()))
          renderErrors.push(message.text())
      })
      const component =
        entry === 'detail'
          ? '/smis/equipment-ledger/equipment-ledger-detail'
          : '/smis/equipment-ledger/equipment-ledger'
      const permissionName =
        entry === 'detail' ? 'SmisEquipmentLedgerDetail' : 'SmisEquipmentLedger'
      const menu = {
        id: 'equipment-detail-test',
        parentId: null,
        name: permissionName,
        path: entry === 'detail' ? `${component}/:id` : component,
        component,
        type: 'menu',
        sort: 1,
        meta: { title: '设备档案详情', is_enable: true, is_hide: true, roles: [] }
      }
      await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
        route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
      )
      await mockApplicationMenus(page, {
        smis: [
          menu,
          {
            ...menu,
            id: 'equipment-detail-view',
            parentId: menu.id,
            name: `${permissionName}:View`,
            path: '',
            component: '',
            type: 'button'
          }
        ]
      })
      await page.route('**/rest/v1/rpc/smis_get_equipment_archive_secure', (route) =>
        route.fulfill({
          json: {
            id: 'equipment-test',
            tenantId: tenant.id,
            equipmentName: '测试设备档案',
            equipmentCode: 'EQ-TEST',
            profileType: 'general',
            category: {
              categoryName: '测试分类',
              categoryCode: 'CAT-TEST',
              profileType: 'general'
            },
            usingOrganization: { organizationName: '测试使用部门' },
            managingOrganization: { organizationName: '测试管理部门' },
            location: { locationName: '测试位置' },
            status: 'enabled',
            operationStatus: 'normal',
            specialParameters: {}
          }
        })
      )
      await page.route('**/rest/v1/rpc/smis_list_equipment_ledger_secure', (route) =>
        route.fulfill({
          json: {
            records: [
              {
                id: 'equipment-test',
                tenantId: tenant.id,
                equipmentName: '测试设备档案',
                equipmentCode: 'EQ-TEST',
                categoryId: 'category-test',
                category: { categoryName: '测试分类', categoryCode: 'CAT-TEST' },
                usingOrganization: { organizationName: '测试使用部门' },
                attachmentCount: 0,
                inspectionCount: empty ? 0 : 1001,
                specialParameters: {},
                status: 'enabled'
              }
            ],
            total: 1,
            categoryTree: [],
            locationTree: []
          }
        })
      )
      const records = Array.from({ length: empty ? 0 : 1001 }, (_, index) => ({
        id: `inspection-${index}`,
        inspectionNo: `INSPECT-${index}`,
        equipmentId: 'equipment-test',
        inspectionCategory: { categoryName: '测试检验分类' },
        inspectionDate: '2026-10-01',
        status: 'completed',
        conclusion: 'qualified',
        inspectionInstitution: null,
        nextDueDate: '2027-10-01',
        images: []
      }))
      let fail = !empty
      const offsets: number[] = []
      await page.route('**/rest/v1/rpc/smis_list_equipment_inspections_secure', (route) => {
        const query = route.request().postDataJSON()
        expect(query.p_equipment_id).toBe('equipment-test')
        expect(query.p_to - query.p_from + 1).toBe(20)
        offsets.push(query.p_from)
        if (fail)
          return route.fulfill({
            status: 503,
            json: { code: 'PGRST000', message: 'Connection unavailable' }
          })
        return route.fulfill({
          json: { records: records.slice(query.p_from, query.p_to + 1), total: records.length }
        })
      })
      await page.goto(
        entry === 'detail' ? `#${component}/equipment-test?tab=inspections` : `#${component}`
      )
      if (entry === 'drawer') {
        await page
          .getByRole('button', { name: `0 附件 · ${empty ? 0 : 1001} 检验`, exact: true })
          .first()
          .click({ timeout: 60_000 })
        await page.getByRole('tab', { name: '检验记录', exact: true }).click()
      }
      await expect(page.getByRole('tab', { name: '检验记录', exact: true })).toBeVisible({
        timeout: 60_000
      })
      const pane = page.getByRole('tabpanel', { name: '检验记录', exact: true })
      if (empty) {
        await expect(pane.getByText('当前设备暂无检验记录', { exact: true })).toBeVisible()
        await expect(pane.locator('.el-pagination')).toHaveCount(0)
        expect(offsets).toEqual([0])
      } else {
        await expect(pane.getByText('检验记录加载失败，请重新加载', { exact: true })).toBeVisible()
        await expect(page.locator('.el-message--error')).toHaveCount(0)
        await pane.screenshot({ path: testInfo.outputPath('inspection-error.png') })
        fail = false
        await pane.getByRole('button', { name: '重新加载', exact: true }).click()
        await expect(pane.getByText('INSPECT-0', { exact: true })).toBeVisible()
        await expect(
          pane.locator(
            '.equipment-archive-detail__inspection-list > article, .equipment-ledger-page__inspections > article'
          )
        ).toHaveCount(20)
        const pagination = pane.locator('.el-pagination')
        await pagination.locator('.el-pager li.number').filter({ hasText: /^2$/ }).click()
        await expect(pane.getByText('INSPECT-20', { exact: true })).toBeVisible()
        await pagination.locator('.el-pager li.number').filter({ hasText: /^51$/ }).click()
        await expect(pane.getByText('INSPECT-1000', { exact: true })).toBeVisible()
        await expect(
          pane.locator(
            '.equipment-archive-detail__inspection-list > article, .equipment-ledger-page__inspections > article'
          )
        ).toHaveCount(1)
        expect(offsets).toEqual([0, 0, 20, 1000])
        await pagination.scrollIntoViewIfNeeded()
        await expect(pagination).toBeInViewport()
        const previous = await pagination.locator('.btn-prev').boundingBox()
        const next = await pagination.locator('.btn-next').boundingBox()
        expect(previous).not.toBeNull()
        expect(next).not.toBeNull()
        expect(Math.abs(previous!.y - next!.y)).toBeLessThanOrEqual(1)
        await expect(pane.getByText('共 1001 条', { exact: true })).toBeVisible()
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      ).toBeLessThanOrEqual(1)
      await page.screenshot({
        path: testInfo.outputPath('equipment-inspections.png'),
        fullPage: true
      })
      expect(renderErrors).toEqual([])
    })
  }
}
