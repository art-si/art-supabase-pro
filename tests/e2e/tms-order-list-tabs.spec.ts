import { expect, test } from '@playwright/test'
import { installDictionaryOptions } from './support/dictionary-options'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(180_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const rows = [
  {
    id: '11111111-1111-4111-8111-111111111201',
    tenantId,
    orderNo: 'QA-ORDER-PENDING',
    orderStatus: 'pending_load',
    shippingContactName: '测试发货人',
    receivingContactName: '测试收货人',
    originStation: '上海站',
    destinationStation: '杭州站',
    paymentMethod: 'monthly',
    createTime: '2026-10-01T08:00:00+08:00'
  },
  {
    id: '11111111-1111-4111-8111-111111111202',
    tenantId,
    orderNo: 'QA-ORDER-CANCELLED',
    orderStatus: 'cancelled',
    shippingContactName: '测试发货人',
    receivingContactName: '测试收货人',
    originStation: '苏州站',
    destinationStation: '宁波站',
    paymentMethod: 'monthly',
    createTime: '2026-10-02T08:00:00+08:00'
  }
]

for (const variant of [
  { width: 1440, height: 900, dark: false },
  { width: 900, height: 800, dark: true }
]) {
  test(`真实运输订单页 ${variant.width}px${variant.dark ? '暗色' : '浅色'}状态标签与专注模式`, async ({
    page
  }, info) => {
    const pageErrors: string[] = []
    const unexpectedRequests: string[] = []
    const listStatuses: Array<string | null> = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.setViewportSize({ width: variant.width, height: variant.height })
    await page.route('**/rest/v1/**', (route) => {
      const request = route.request()
      const endpoint = new URL(request.url()).pathname.split('/').at(-1)
      if (endpoint === 'tms_list_orders_secure') {
        const payload = request.postDataJSON() as Record<string, unknown>
        if (payload.p_scope !== 'order_list') {
          unexpectedRequests.push(`tms_list_orders_secure:${String(payload.p_scope)}`)
          return route.fulfill({ status: 403, json: { message: 'Unexpected scope' } })
        }
        if (payload.p_count_only === true)
          return route.fulfill({
            json: {
              records: [],
              total: 2,
              orderStatusCounts: { pending_load: 1, cancelled: 1 }
            }
          })
        const status = typeof payload.p_order_status === 'string' ? payload.p_order_status : null
        listStatuses.push(status)
        const filtered = status ? rows.filter((row) => row.orderStatus === status) : rows
        return route.fulfill({
          json: { records: filtered, total: filtered.length, fieldAccess: {} }
        })
      }
      if (endpoint === 'get_table_column_runtime' && request.method() === 'POST') {
        const payload = request.postDataJSON() as Record<string, unknown>
        if (payload.p_route_path !== '/tms/order-list') {
          unexpectedRequests.push(`get_table_column_runtime:${String(payload.p_route_path)}`)
          return route.fulfill({ status: 403, json: { message: 'Unexpected route' } })
        }
        return route.fulfill({ json: { enabled: false, profiles: [] } })
      }
      if (request.method() === 'GET')
        return route.fulfill({
          json: [],
          headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }
        })
      unexpectedRequests.push(`${request.method()} ${endpoint}`)
      return route.fulfill({ status: 403, json: { message: 'Unexpected write' } })
    })
    await installDictionaryOptions(page, {
      tmsOrderStatus: [
        { value: 'pending_load', label: '待配载' },
        { value: 'partially_dispatched', label: '部分调度' },
        { value: 'pending_order', label: '待接单' },
        { value: 'pending_pickup', label: '待提货' },
        { value: 'transporting', label: '运输中' },
        { value: 'partially_signed', label: '部分签收' },
        { value: 'signed', label: '已签收' },
        { value: 'completed', label: '已完成' },
        { value: 'cancelled', label: '已取消' }
      ],
      tmsOrderPaymentMethod: [{ value: 'monthly', label: '月结' }]
    })

    await page.goto('/tests/e2e/fixtures/tms-order-list-tabs.html', {
      waitUntil: 'domcontentloaded'
    })
    if (variant.dark) await page.evaluate(() => document.documentElement.classList.add('dark'))
    const orderList = page.locator('.order-list')
    const tabs = orderList.locator('.order-list__status-tabs')
    const tabsWrap = tabs.locator('.el-scrollbar__wrap')
    await expect(orderList).toBeVisible({ timeout: 90_000 })
    await expect(orderList.getByText('QA-ORDER-PENDING')).toBeVisible()
    await expect(orderList.getByText('QA-ORDER-CANCELLED')).toBeVisible()
    await expect(tabs).toHaveClass(/el-scrollbar/)
    await expect(tabsWrap).toHaveCount(1)
    await expect(tabs.locator('.el-segmented__item')).toHaveCount(10)

    const layout = await tabsWrap.evaluate((wrap) => {
      const items = Array.from(wrap.querySelectorAll<HTMLElement>('.el-segmented__item'))
      return {
        clientWidth: wrap.clientWidth,
        scrollWidth: wrap.scrollWidth,
        itemTops: items.map((item) => Math.round(item.getBoundingClientRect().top))
      }
    })
    expect(new Set(layout.itemTops).size).toBe(1)
    if (variant.width === 900) expect(layout.scrollWidth).toBeGreaterThan(layout.clientWidth + 1)
    await tabsWrap.evaluate((wrap) => {
      wrap.scrollLeft = wrap.scrollWidth
    })
    const cancelledTab = tabs.locator('.el-segmented__item').last()
    await expect(cancelledTab).toContainText('已取消 (1)')
    await expect(cancelledTab).toBeInViewport()
    await cancelledTab.click()
    await expect(cancelledTab).toHaveClass(/is-selected/)
    await expect.poll(() => listStatuses.includes('cancelled')).toBe(true)
    await expect(orderList.getByText('QA-ORDER-CANCELLED')).toBeVisible()
    await expect(orderList.getByText('QA-ORDER-PENDING')).toHaveCount(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(unexpectedRequests).toEqual([])
    expect(pageErrors).toEqual([])
    await page.screenshot({ path: info.outputPath('order-list-tabs.png'), fullPage: true })

    await assertTableFocusContract(page, info, ['.order-list__status-tabs'])
    await expect(cancelledTab).toHaveClass(/is-selected/)
    await expect(orderList.getByText('QA-ORDER-CANCELLED')).toBeVisible()
    expect(unexpectedRequests).toEqual([])
    expect(pageErrors).toEqual([])
  })
}
