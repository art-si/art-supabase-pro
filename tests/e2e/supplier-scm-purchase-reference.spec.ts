import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })

const outcomes = [
  'found',
  'no-view',
  'missing',
  'error',
  'other-kind',
  'empty-list',
  'read-error',
  'late-response'
] as const
const kinds = {
  purchase_order: { name: 'ScmPurchaseOrder', path: 'purchase-order', title: '采购订单' },
  purchase_request: { name: 'ScmPurchaseRequest', path: 'purchase-request', title: '采购申请' },
  purchase_contract: { name: 'ScmPurchaseContract', path: 'purchase-contract', title: '采购合同' },
  receipt_notice: { name: 'ScmReceiptNotice', path: 'receipt-notice', title: '收料通知单' }
}
const cases: Array<{ kind: keyof typeof kinds; outcome: (typeof outcomes)[number] }> = [
  ...outcomes.map((outcome) => ({ kind: 'purchase_order' as const, outcome })),
  { kind: 'purchase_request', outcome: 'found' },
  { kind: 'purchase_contract', outcome: 'found' },
  { kind: 'receipt_notice', outcome: 'found' }
]
for (const { kind, outcome } of cases) {
  const scenario = kinds[kind]
  test(`供应商 SCM 采购引用-${kind}-${outcome}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const tenant = await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
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
      scenario.name,
      `/scm/purchase-management/${scenario.path}`,
      scenario.title
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
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [
          { code: 'smis', name: '测试安全系统', baseUrl: '/smis/' },
          { code: 'scm', name: '测试供应链', baseUrl: '/scm/' }
        ]
      })
    )
    await mockApplicationMenus(page, {
      smis: [supplier, button(supplier, 'View'), button(supplier, 'Delete')],
      scm: [purchase, ...(outcome === 'no-view' ? [] : [button(purchase, 'View')])]
    })
    await page.route('**/rest/v1/rpc/smis_list_suppliers_secure', (route) =>
      route.fulfill({
        json: {
          records: [{ id: 'supplier-1', supplierName: '测试供应商', supplierCode: 'SUP-001' }],
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
            sourceTable: 'scm_purchase_document',
            recordId: 'purchase-1',
            targetId: 'purchase-1',
            recordNo: 'SCM-001',
            recordSummary: '测试采购订单',
            recordStatus: 'draft',
            createdAt: '2026-10-01'
          }
        ]
      })
    )
    let destinationReads = 0
    const filters: Array<string | null> = []
    let releaseLateResponse: (() => void) | undefined
    const lateResponseGate = new Promise<void>((resolve) => {
      releaseLateResponse = resolve
    })
    let markLateResponseHandled: (() => void) | undefined
    const lateResponseHandled = new Promise<void>((resolve) => {
      markLateResponseHandled = resolve
    })
    await page.route('**/rest/v1/scm_purchase_document?**', async (route) => {
      const params = new URL(route.request().url()).searchParams
      if (params.get('select') === 'kind') {
        destinationReads++
        expect(params.get('id')).toBe('eq.purchase-1')
        if (outcome === 'error')
          return route.fulfill({
            status: 403,
            json: { code: '42501', message: 'permission denied' }
          })
        return route.fulfill({
          json:
            outcome === 'missing'
              ? null
              : {
                  kind: outcome === 'other-kind' ? 'purchase_contract' : kind
                }
        })
      }
      if (params.get('kind') !== `eq.${kind}`) {
        return route.fulfill({
          json: [],
          headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
        })
      }
      filters.push(params.get('id'))
      expect(params.get('order')).toBe('updated_at.desc,id.asc')
      expect(params.get('kind')).toBe(`eq.${kind}`)
      expect(params.get('tenant_id')).toBe(`eq.${tenant.id}`)
      if (outcome === 'read-error' && params.has('id')) {
        return route.fulfill({ status: 403, json: { code: '42501', message: 'permission denied' } })
      }
      const rows = ['purchase-1', 'purchase-2']
        .filter(
          (id) => !params.has('id') || (outcome !== 'empty-list' && params.get('id') === `eq.${id}`)
        )
        .map((id) => ({
          id,
          tenant_id: tenant.id,
          kind,
          document_no: id === 'purchase-1' ? 'SCM-001' : 'SCM-002',
          document_date: '2026-10-01',
          status: 'draft',
          lines: [],
          details: {},
          subtotal: 0,
          total_amount: 0,
          tax_amount: 0
        }))
      const delayed = outcome === 'late-response' && params.has('id')
      if (delayed) await lateResponseGate
      await route.fulfill({
        json: rows,
        headers: {
          'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0',
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
    await expect(page.getByText('SCM-001', { exact: true })).toBeVisible()
    const navigate = page.getByRole('button', { name: '查看关联', exact: true })
    if (outcome === 'no-view') {
      await expect(navigate).toHaveCount(0)
      expect(destinationReads).toBe(0)
      expect(filters).toEqual([])
      return
    }
    await navigate.click()
    if (outcome === 'missing' || outcome === 'error' || outcome === 'other-kind') {
      await expect(page.locator('.el-message--error')).toHaveCount(1)
      await expect(navigate).toBeEnabled()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(filters).toEqual([])
      expect(errors).toEqual([])
      return
    }
    await expect(page).toHaveURL(new RegExp(`${scenario.path}\\?`))
    const rows = page.locator('.el-table__body-wrapper').first()
    if (outcome === 'late-response') {
      await expect.poll(() => filters.includes('eq.purchase-1')).toBe(true)
      await page.getByRole('button', { name: '清除定位', exact: true }).click()
      await expect(rows.getByText('SCM-002', { exact: true })).toBeVisible()
      releaseLateResponse?.()
      await lateResponseHandled
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      )
      await expect(rows.getByText('SCM-002', { exact: true })).toBeVisible()
      await expect(page.locator('.master-delete-notice')).toHaveCount(0)
      expect(errors).toEqual([])
      return
    }
    if (outcome === 'read-error') {
      await expect(page.getByText('数据加载失败', { exact: true })).toBeVisible()
    } else if (outcome === 'empty-list') {
      await expect(page.getByText('未找到可查看的目标采购单据', { exact: true })).toBeVisible()
      await expect(page.getByText('定位待完成', { exact: true })).toBeVisible()
    } else {
      await expect(rows.getByText('SCM-001', { exact: true })).toBeVisible()
      await expect(rows.getByText('SCM-002', { exact: true })).toHaveCount(0)
      await expect(page.getByText('已精确过滤', { exact: true })).toBeVisible()
    }
    expect(filters.every((id) => id === 'eq.purchase-1')).toBe(true)
    if (outcome === 'empty-list') {
      await assertTableFocusContract(page, testInfo)
      await expect(page.getByText('未找到可查看的目标采购单据', { exact: true })).toBeVisible()
    }
    if (outcome === 'read-error') {
      await assertTableFocusContract(page, testInfo, [], '.art-empty-state')
      await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeEnabled()
    }
    await page.screenshot({
      path: testInfo.outputPath('scm-reference.png'),
      animations: 'disabled'
    })
    if (outcome === 'read-error' || outcome === 'empty-list') {
      await page
        .getByText(outcome === 'read-error' ? '数据加载失败' : '未找到可查看的目标采购单据', {
          exact: true
        })
        .scrollIntoViewIfNeeded()
      if (outcome === 'empty-list') {
        const clipping = await page.locator('.el-table__empty-block').evaluate((element) => {
          const copy = element.querySelector('.art-empty-state__copy p')
          const viewport = element.closest('.el-table__body-wrapper')
          if (!copy || !viewport) throw new Error('空状态缺少说明或表格可视区域')
          return {
            copyBottom: copy.getBoundingClientRect().bottom,
            viewportBottom: viewport.getBoundingClientRect().bottom,
            ancestors: (() => {
              const nodes = []
              let node: Element | null = copy
              while (node && nodes.length < 10) {
                const style = getComputedStyle(node)
                nodes.push({
                  className: node.className,
                  height: style.height,
                  minHeight: style.minHeight,
                  overflow: style.overflow,
                  clientHeight: node.clientHeight,
                  scrollHeight: node.scrollHeight,
                  top: node.getBoundingClientRect().top,
                  bottom: node.getBoundingClientRect().bottom
                })
                node = node.parentElement
              }
              return nodes
            })()
          }
        })
        await testInfo.attach('empty-layout', {
          body: JSON.stringify(clipping, null, 2),
          contentType: 'application/json'
        })
        expect(clipping.copyBottom).toBeLessThanOrEqual(clipping.viewportBottom + 1)
      }
      await page.screenshot({
        path: testInfo.outputPath('scm-reference-lower.png'),
        animations: 'disabled'
      })
    }
    await page.getByRole('button', { name: '清除定位', exact: true }).click()
    await expect(rows.getByText('SCM-002', { exact: true })).toBeVisible()
    await expect(page.locator('.master-delete-notice')).toHaveCount(0)
    expect(destinationReads).toBe(1)
    expect(errors).toEqual([])
  })
}
