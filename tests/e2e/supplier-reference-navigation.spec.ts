import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareAppearance } from './support/appearance'
import type { SmisEquipment } from '../../modules/art-supabase-smis/src/api/types'
import type { SmisEquipmentInspectionReference } from '../../modules/art-supabase-smis/src/api/modules/inspection-declaration'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const { canView, inspection, lookup } of [
  { canView: true, inspection: false, lookup: 'found' },
  { canView: false, inspection: false, lookup: 'found' },
  { canView: true, inspection: true, lookup: 'found' },
  { canView: true, inspection: true, lookup: 'category-hidden' },
  { canView: false, inspection: true, lookup: 'found' },
  { canView: true, inspection: true, lookup: 'missing' },
  { canView: true, inspection: true, lookup: 'error' }
] as const) {
  test(`供应商${inspection ? '检验' : '设备'}引用定位-${canView ? '允许查看' : '无查看权限'}-${lookup}`, async ({
    page
  }, testInfo) => {
    await prepareIsolatedSession(page)
    const appearance = {
      theme: testInfo.project.name.includes('dark') ? ('dark' as const) : ('light' as const),
      boxBorderMode: !testInfo.project.name.includes('shadow')
    }
    await prepareAppearance(page, appearance)
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().startsWith('[VueError]')) {
        runtimeErrors.push(message.text())
      }
    })
    const supplierPath = '/smis/basic-data/supplier'
    const referenceNumber = inspection ? 'INSP-001' : 'EQ-001'
    const menu = (id: string, name: string, path: string, title: string) => ({
      id,
      parentId: null,
      name,
      path,
      component: path.replace('/:id', ''),
      type: 'menu',
      sort: 1,
      meta: { title, is_enable: true, is_hide: false, roles: [] }
    })
    const supplierMenu = menu('supplier', 'SmisSupplier', supplierPath, '供应商')
    const detailMenu = menu(
      'equipment-detail',
      'SmisEquipmentLedgerDetail',
      '/smis/equipment-ledger/equipment-ledger-detail/:id',
      '设备档案详情'
    )
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [{ code: 'smis', name: '测试安全系统', baseUrl: '/smis/' }]
      })
    )
    await mockApplicationMenus(page, {
      smis: [
        supplierMenu,
        detailMenu,
        ...[
          'SmisSupplier:View',
          'SmisSupplier:Delete',
          ...(canView ? ['SmisEquipmentLedger:View'] : [])
        ].map((name, index) => ({
          ...supplierMenu,
          id: `permission-${index}`,
          parentId: supplierMenu.id,
          name,
          path: '',
          component: '',
          type: 'button'
        }))
      ]
    })
    await page.route('**/rest/v1/rpc/smis_list_suppliers_secure', (route) =>
      route.fulfill({
        json: {
          records: [{ id: 'supplier-1', supplierName: '测试设备供应商', supplierCode: 'SUP-001' }],
          total: 1,
          overview: { total: 1, keySuppliers: 0, categoryCount: 1, contactComplete: 0 }
        }
      })
    )
    await page.route('**/rest/v1/rpc/get_record_delete_dependency_details?**', (route) =>
      route.fulfill({
        json: [
          {
            resourceId: 'supplier-1',
            sourceTable: inspection ? 'smis_equipment_inspection' : 'mdm_equipment',
            recordId: inspection ? 'inspection-1' : 'equipment-1',
            targetId: inspection ? 'inspection-1' : 'equipment-1',
            recordNo: referenceNumber,
            recordSummary: '测试阻断设备',
            recordStatus: 'enabled',
            createdAt: '2026-01-01'
          }
        ]
      })
    )
    let detailReads = 0
    let parentReads = 0
    let inspectionReads = 0
    await page.route('**/rest/v1/smis_equipment_inspection?**', (route) => {
      const query = new URL(route.request().url()).searchParams
      if (query.has('equipment_id')) {
        inspectionReads++
        expect(query.get('id')).toBe('eq.inspection-1')
        expect(['eq.equipment-1', 'eq.equipment-2']).toContain(query.get('equipment_id'))
        const record = {
          id: 'inspection-1',
          equipmentId: 'equipment-1',
          inspectionNo: 'INSP-001',
          inspectionDate: '2026-10-01',
          conclusion: 'operable',
          status: 'completed',
          inspectionCategory:
            lookup === 'category-hidden'
              ? null
              : {
                  id: 'inspection-category-1',
                  categoryCode: 'IC-001',
                  categoryName: '测试检验类别'
                },
          inspectionInstitution: {
            id: 'supplier-1',
            supplierCode: 'SUP-001',
            supplierName: '测试设备供应商'
          }
        } satisfies SmisEquipmentInspectionReference
        return route.fulfill({
          json: query.get('equipment_id') === 'eq.equipment-1' ? record : null
        })
      }
      parentReads++
      expect(query.get('id')).toBe('eq.inspection-1')
      return lookup === 'error'
        ? route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
        : route.fulfill({ json: lookup === 'missing' ? null : { equipmentId: 'equipment-1' } })
    })
    await page.route('**/rest/v1/rpc/smis_get_equipment_archive_secure', (route) => {
      detailReads++
      const equipmentId = route.request().postDataJSON().p_equipment_id
      expect(['equipment-1', 'equipment-2']).toContain(equipmentId)
      return route.fulfill({
        json: {
          id: equipmentId,
          sort: 1,
          categoryId: 'category-1',
          usingOrganizationId: 'organization-1',
          managingOrganizationId: 'organization-1',
          equipmentName: equipmentId === 'equipment-1' ? '测试阻断设备' : '测试另一台设备',
          equipmentCode: 'EQ-001',
          equipmentKind: 'general',
          useStatus: 'in_use',
          operationStatus: 'normal',
          assetStatus: 'active',
          importanceLevel: 'normal',
          qrToken: 'test-equipment-token',
          isMajorHazardSource: false,
          isSpecialEquipment: false,
          status: 'enabled',
          pressureGaugeIds: [],
          safetyValveIds: [],
          attachmentCount: 0,
          inspectionCount: 0,
          usingOrganization: {
            id: 'organization-1',
            organizationCode: 'ORG-001',
            organizationName: '测试使用组织'
          },
          managingOrganization: {
            id: 'organization-1',
            organizationCode: 'ORG-001',
            organizationName: '测试管理组织'
          },
          category: {
            id: 'category-1',
            categoryName: '测试设备分类',
            categoryCode: 'CAT-001',
            profileType: 'general'
          },
          supplierId: 'supplier-1'
        } satisfies SmisEquipment
      })
    })
    await page.goto(`#${supplierPath}`)
    if (appearance.theme === 'dark') {
      await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    } else {
      await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
    }
    await expect(page.locator('html')).toHaveAttribute(
      'data-box-mode',
      appearance.boxBorderMode ? 'border-mode' : 'shadow-mode'
    )
    const remove = page
      .locator('.el-table__body-wrapper')
      .getByRole('button', { name: '删除', exact: true })
      .first()
    await expect(remove).toBeVisible({ timeout: 90_000 })
    const onboarding = page.getByText('知道了', { exact: true })
    if (await onboarding.isVisible()) await onboarding.click()
    await remove.click()
    await expect(page.getByText(referenceNumber, { exact: true })).toBeVisible()
    const navigate = page.getByRole('button', { name: '查看关联', exact: true })
    if (canView) {
      await navigate.click()
      if (lookup === 'missing' || lookup === 'error') {
        await expect(page.locator('.el-message--error')).toHaveCount(1)
        await expect(navigate).toBeEnabled()
        await expect(page.getByRole('dialog')).toBeVisible()
        expect(detailReads).toBe(0)
        expect(parentReads).toBe(1)
        expect(runtimeErrors).toEqual([])
        return
      }
      await expect(page).toHaveURL(/equipment-ledger-detail\/equipment-1\?/)
      await expect(page.locator('.equipment-archive-detail__identity')).toContainText(
        '测试阻断设备'
      )
      expect(detailReads).toBe(1)
      expect(parentReads).toBe(inspection ? 1 : 0)
      if (inspection) {
        await expect(page.getByRole('tab', { name: '检验记录', exact: true })).toHaveAttribute(
          'aria-selected',
          'true'
        )
      }
      await page.screenshot({
        path: testInfo.outputPath('equipment-reference-detail.png'),
        animations: 'disabled'
      })
      if (inspection) {
        await expect(
          page
            .locator('.equipment-archive-detail__inspection-list')
            .getByText('INSP-001', { exact: true })
        ).toBeVisible()
        expect(inspectionReads).toBe(1)
        if (lookup === 'category-hidden') {
          await expect(page.getByText('检验类别不可查看', { exact: true })).toBeVisible()
        }
        const inspectionCard = page.locator('.equipment-archive-detail__inspection-list article')
        await inspectionCard.scrollIntoViewIfNeeded()
        await expect(inspectionCard).toBeInViewport({ ratio: 1 })
        await expect(inspectionCard.getByText('测试设备供应商', { exact: true })).toBeInViewport({
          ratio: 1
        })
        await page.screenshot({
          path: testInfo.outputPath('inspection-reference-lower.png'),
          animations: 'disabled'
        })
        await page.evaluate(() => {
          window.location.hash = window.location.hash.replace('/equipment-1?', '/equipment-2?')
        })
        await expect(page.locator('.equipment-archive-detail__identity')).toContainText(
          '测试另一台设备'
        )
        await expect(page.getByText('未找到可查看的目标检验记录', { exact: true })).toBeVisible()
        await expect(page.getByText('定位待完成', { exact: true })).toBeVisible()
        await expect(
          page
            .locator('.equipment-archive-detail__inspection-list')
            .getByText('INSP-001', { exact: true })
        ).toHaveCount(0)
        expect(inspectionReads).toBe(2)
      }
    } else {
      await expect(navigate).toHaveCount(0)
      expect(detailReads).toBe(0)
      expect(parentReads).toBe(0)
      await page.screenshot({
        path: testInfo.outputPath('equipment-reference-no-permission.png'),
        animations: 'disabled'
      })
    }
    expect(runtimeErrors).toEqual([])
  })
}
