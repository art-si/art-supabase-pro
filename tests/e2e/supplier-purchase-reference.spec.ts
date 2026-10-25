import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareAppearance } from './support/appearance'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const { allowed, outcome } of [
  { allowed: true, outcome: 'found' },
  { allowed: false, outcome: 'found' },
  { allowed: true, outcome: 'missing' },
  { allowed: true, outcome: 'error' },
  { allowed: true, outcome: 'other-kind' },
  { allowed: true, outcome: 'empty-list' },
  { allowed: true, outcome: 'late-response' },
  { allowed: true, outcome: 'many-lines' },
  { allowed: true, outcome: 'sibling-lines' }
] as const) {
  test(`供应商采购引用定位与清除-${allowed ? '允许查看' : '无查看权限'}-${outcome}`, async ({
    page
  }, testInfo) => {
    const tenant = await prepareIsolatedSession(page)
    await prepareAppearance(page, {
      theme: testInfo.project.name.includes('dark') ? 'dark' : 'light',
      boxBorderMode: !testInfo.project.name.includes('shadow')
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const menu = (id: string, name: string, path: string, title: string) => ({
      id,
      parentId: null,
      name,
      path,
      component: path,
      type: 'menu',
      sort: 1,
      meta: { title, is_enable: true, is_hide: false, roles: [] }
    })
    const supplier = menu('supplier', 'SmisSupplier', '/smis/basic-data/supplier', '供应商')
    const purchase = menu(
      'purchase',
      'WmsPurchaseInbound',
      '/wms/inbound-business/purchase-inbound',
      '采购入库单'
    )
    const button = (parent: typeof supplier, action: string) => ({
      ...parent,
      id: `${parent.id}-${action}`,
      parentId: parent.id,
      name: `${parent.name}:${action}`,
      path: '',
      component: '',
      type: 'button'
    })
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'smis', name: '测试安全系统', baseUrl: '/smis/' },
          { code: 'wms', name: '测试仓储系统', baseUrl: '/wms/' }
        ]
      })
    )
    await mockApplicationMenus(page, {
      smis: [supplier, button(supplier, 'View'), button(supplier, 'Delete')],
      wms: [purchase, ...(allowed ? [button(purchase, 'View')] : [])]
    })
    await page.route('**/rest/v1/rpc/smis_list_suppliers_secure', (route) =>
      route.fulfill({
        json: {
          records: [{ id: 'supplier-1', supplierName: '测试采购供应商', supplierCode: 'SUP-001' }],
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
            sourceTable: 'wms_purchase_document',
            recordId: 'purchase-1',
            targetId: 'purchase-1',
            recordNo: 'PUR-001',
            recordSummary: '测试采购单据',
            recordStatus: 'draft',
            createdAt: '2026-10-01'
          }
        ]
      })
    )
    let destinationReads = 0
    await page.route('**/rest/v1/wms_purchase_document?**', (route) => {
      const params = new URL(route.request().url()).searchParams
      if (params.get('select') !== 'kind') {
        expect(params.get('kind')).toBe('eq.purchase_inbound')
        expect(params.get('tenant_id')).toBe(`eq.${tenant.id}`)
        expect(params.get('select')).toContain('matchingLines:')
        expect(params.get('order')).toBe('create_time.desc,id.asc')
        const data = params.has('matchingLines.material.material_code')
          ? params.get('matchingLines.material.material_code') === 'ilike.%MAT-001%'
            ? [{ id: 'purchase-1' }]
            : []
          : [{ id: 'purchase-1' }, { id: 'purchase-2' }]
        return route.fulfill({
          json: data,
          headers: {
            'content-range': data.length ? `0-${data.length - 1}/${data.length}` : '*/0',
            'access-control-expose-headers': 'content-range'
          }
        })
      }
      destinationReads++
      expect(new URL(route.request().url()).searchParams.get('id')).toBe('eq.purchase-1')
      if (outcome === 'error')
        return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      return route.fulfill({
        json:
          outcome === 'missing'
            ? null
            : { kind: outcome === 'other-kind' ? 'purchase_return' : 'purchase_inbound' }
      })
    })
    const filters: Array<string | null> = []
    const lineOffsets: number[] = []
    let unfilteredReads = 0
    let releaseLateResponse: (() => void) | undefined
    const lateResponseGate = new Promise<void>((resolve) => {
      releaseLateResponse = resolve
    })
    let markLateResponseHandled: (() => void) | undefined
    const lateResponseHandled = new Promise<void>((resolve) => {
      markLateResponseHandled = resolve
    })
    await page.route('**/rest/v1/wms_purchase_document_list?**', async (route) => {
      const params = new URL(route.request().url()).searchParams
      filters.push(params.get('document_id'))
      const offset = Number(params.get('offset') || 0)
      const limit = Number(params.get('limit') || 500)
      lineOffsets.push(offset)
      if (!params.has('document_id') && !params.has('material_code')) unfilteredReads++
      expect(params.get('kind')).toBe('eq.purchase_inbound')
      expect(params.get('tenant_id')).toBe(`eq.${tenant.id}`)
      expect(params.get('order')).toBe('create_time.desc,document_id.asc,line_no.asc,line_id.asc')
      if (outcome === 'sibling-lines' && params.get('document_id')?.startsWith('in.(')) {
        expect(params.has('material_code')).toBe(false)
      }
      const records = ['purchase-1', 'purchase-2']
        .filter(() => !params.has('material_code'))
        .filter(
          (id) =>
            !params.get('document_id') ||
            (params.get('document_id')?.startsWith('in.(') &&
              params.get('document_id')?.includes(id)) ||
            (outcome !== 'empty-list' && params.get('document_id') === `eq.${id}`)
        )
        .map((id) => ({
          document_id: id,
          line_id: `line-${id}`,
          tenant_id: tenant.id,
          kind: 'purchase_inbound',
          document_no: id === 'purchase-1' ? 'PUR-001' : 'PUR-002',
          line_no: 1,
          business_date: '2026-10-01',
          accounting_date: '2026-10-01',
          status: 'draft',
          supplier_name: '测试采购供应商',
          material_code: 'MAT-001',
          material_description: '测试物料',
          quantity: 1,
          amount: 10,
          tax_amount: 0,
          total_amount: 10
        }))
        .flatMap((row) =>
          outcome === 'many-lines' && row.document_id === 'purchase-1'
            ? Array.from({ length: 501 }, (_, index) => ({
                ...row,
                line_id: `line-${index}`,
                line_no: index + 1
              }))
            : outcome === 'sibling-lines' && row.document_id === 'purchase-1'
              ? [
                  row,
                  {
                    ...row,
                    line_id: 'sibling-line',
                    line_no: 2,
                    material_code: 'MAT-002',
                    amount: 20,
                    total_amount: 20
                  }
                ]
              : [row]
        )
      const data = records.slice(offset, offset + limit)
      const delayed = outcome === 'late-response' && params.get('document_id') === 'eq.purchase-1'
      if (delayed) await lateResponseGate
      await route.fulfill({
        json: data,
        headers: {
          'content-range': records.length
            ? `${offset}-${offset + data.length - 1}/${records.length}`
            : '*/0',
          'access-control-expose-headers': 'content-range'
        }
      })
      if (delayed) markLateResponseHandled?.()
    })
    await page.goto('#/smis/basic-data/supplier')
    const remove = page
      .locator('.el-table__body-wrapper')
      .getByRole('button', { name: '删除', exact: true })
      .first()
    await expect(remove).toBeVisible({ timeout: 90_000 })
    const guide = page.getByText('知道了', { exact: true })
    if (await guide.isVisible()) await guide.click()
    await remove.click()
    await expect(page.getByText('PUR-001', { exact: true })).toBeVisible()
    const navigate = page.getByRole('button', { name: '查看关联', exact: true })
    if (!allowed) {
      await expect(navigate).toHaveCount(0)
      expect(destinationReads).toBe(0)
      expect(filters).toEqual([])
    } else {
      await navigate.click()
      if (outcome === 'missing' || outcome === 'error' || outcome === 'other-kind') {
        await expect(page.locator('.el-message--error')).toHaveCount(1)
        await expect(navigate).toBeEnabled()
        await expect(page.getByRole('dialog')).toBeVisible()
        expect(destinationReads).toBe(1)
        expect(filters).toEqual([])
        expect(errors).toEqual([])
        return
      }
      await expect(page).toHaveURL(/purchase-inbound\?/)
      const rows = page.locator('.el-table__body-wrapper')
      if (outcome === 'late-response') {
        await expect.poll(() => filters.includes('eq.purchase-1')).toBe(true)
        await page.getByRole('button', { name: '清除定位', exact: true }).click()
        await expect(rows.getByText('PUR-002', { exact: true })).toBeVisible()
        releaseLateResponse?.()
        await lateResponseHandled
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        )
        await expect(rows.getByText('PUR-002', { exact: true })).toBeVisible()
        await expect(page.locator('.master-delete-notice')).toHaveCount(0)
        expect(errors).toEqual([])
        return
      }
      if (outcome === 'empty-list') {
        await expect(page.getByText('未找到可查看的目标采购单据', { exact: true })).toBeVisible()
        await expect(page.getByText('定位待完成', { exact: true })).toBeVisible()
        await page.getByRole('button', { name: '清除定位', exact: true }).click()
        await expect(rows.getByText('PUR-002', { exact: true })).toBeVisible()
        expect(filters.some((filter) => filter?.startsWith('in.('))).toBe(true)
        expect(errors).toEqual([])
        return
      }
      await expect(rows.getByText('PUR-001', { exact: true })).toBeVisible()
      await expect(rows.getByText('PUR-002', { exact: true })).toHaveCount(0)
      await expect(page.getByText('已精确过滤', { exact: true })).toBeVisible()
      if (outcome === 'many-lines') {
        await expect(rows).toContainText('共 501 项物料')
        await expect(rows).toContainText('5,010.00')
        expect(lineOffsets).toContain(500)
      }
      const modeChoices = page
        .getByRole('radiogroup', { name: '单据列表展示方式' })
        .locator('label')
      const firstChoice = await modeChoices.nth(0).boundingBox()
      const secondChoice = await modeChoices.nth(1).boundingBox()
      expect(firstChoice).not.toBeNull()
      expect(secondChoice).not.toBeNull()
      expect(Math.abs((firstChoice?.y ?? 0) - (secondChoice?.y ?? 0))).toBeLessThanOrEqual(1)
      expect(filters.every((id) => id === 'eq.purchase-1')).toBe(true)
      await assertTableFocusContract(page, testInfo)
      await page.screenshot({
        path: testInfo.outputPath('purchase-reference.png'),
        animations: 'disabled'
      })
      await page.getByRole('button', { name: '清除定位', exact: true }).click()
      await expect(rows.getByText('PUR-002', { exact: true })).toBeVisible()
      await expect(page.locator('.master-delete-notice')).toHaveCount(0)
      expect(filters.some((filter) => filter?.startsWith('in.('))).toBe(true)
      expect(destinationReads).toBe(1)
      const readsBeforeMaterialFilter = unfilteredReads
      await page.getByRole('button', { name: '展开', exact: true }).click()
      if (outcome === 'sibling-lines') {
        await page.getByPlaceholder('物料编码', { exact: true }).fill('MAT-001')
        await page.getByRole('button', { name: '查询', exact: true }).click()
        await expect(rows.getByText('PUR-002', { exact: true })).toHaveCount(0)
        await expect(rows.getByText('PUR-001', { exact: true })).toBeVisible()
        await expect(rows).toContainText('共 2 项物料')
        await expect(rows).toContainText('30.00')
      }
      await page.getByPlaceholder('物料编码', { exact: true }).fill('MISSING-MATERIAL')
      await page.getByRole('button', { name: '查询', exact: true }).click()
      await expect(page.getByText('当前范围暂无采购入库单', { exact: true })).toBeVisible()
      expect(unfilteredReads).toBe(readsBeforeMaterialFilter)
    }
    expect(errors).toEqual([])
  })
}
