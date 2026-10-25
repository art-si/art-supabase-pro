import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

for (const mode of [
  'cargo',
  'assembly',
  'station',
  'purchase',
  'pack',
  'notice',
  'driver',
  'insurance',
  'accessory',
  'accessory-project',
  'accessory-customer'
]) {
  for (const incomplete of [false, true]) {
    test(`${mode} 集合${incomplete ? '缺页拒绝部分集合' : '完整读取 1001 条'}`, async ({
      page
    }) => {
      const offsets: number[] = []
      await page.route('**/rest/v1/**', (route) => {
        const url = new URL(route.request().url())
        expect(
          url.pathname.endsWith(
            mode === 'accessory-project'
              ? '/mdm_project'
              : mode === 'accessory-customer'
                ? '/mdm_customer'
                : mode === 'cargo'
                  ? '/mdm_material'
                  : mode === 'station'
                    ? '/mdm_station'
                    : mode === 'purchase'
                      ? '/scm_order_target_document'
                      : mode === 'pack'
                        ? '/mes_work_order_pack'
                        : mode === 'notice'
                          ? '/scm_sales_document'
                          : mode === 'driver'
                            ? '/mdm_vehicle'
                            : mode === 'insurance'
                              ? '/mdm_insurance_company'
                              : mode === 'accessory'
                                ? '/mdm_accessory_processing_list'
                                : '/wms_serial_number'
          )
        ).toBe(true)
        expect(url.searchParams.get('limit')).toBe('500')
        expect(route.request().headers().prefer).toContain('count=exact')
        expect(url.searchParams.get('order')).toContain('id.asc')
        if (mode === 'accessory-project' || mode === 'accessory-customer') {
          expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
          expect(url.searchParams.get('order')).toBe(
            mode === 'accessory-project' ? 'project_name.asc,id.asc' : 'customer_name.asc,id.asc'
          )
          expect(url.searchParams.get('select')).toContain(
            mode === 'accessory-project' ? 'projectName:project_name' : 'customerName:customer_name'
          )
          if (mode === 'accessory-customer') expect(url.searchParams.get('enabled')).toBe('eq.true')
        } else if (mode === 'cargo') {
          expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
          expect(url.searchParams.get('status')).toBe('eq.enabled')
        } else if (mode === 'purchase') {
          expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
          expect(url.searchParams.get('target_kind')).toBe('eq.purchase_inbound')
          expect(url.searchParams.get('status')).toBe('in.(draft,partial)')
          expect(url.searchParams.get('order')).toBe('created_at.desc,id.asc')
        } else if (mode === 'station') {
          expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
          expect(url.searchParams.get('enabled')).toBe('eq.true')
          expect(url.searchParams.get('stationRoleFilter.role_type')).toBe('eq.transfer')
          expect(url.searchParams.get('select')).toContain('tms_station_role!inner(role_type)')
          expect(url.searchParams.get('or')).toContain('测试')
          expect(url.searchParams.get('order')).toBe('sort.asc,station_code.asc,id.asc')
        } else if (mode === 'pack') {
          expect(url.searchParams.get('work_order_id')).toBe('eq.order-a')
          expect(url.searchParams.get('confirmed')).toBe('eq.true')
          expect(url.searchParams.get('order')).toBe('pack_no.asc,id.asc')
          expect(url.searchParams.get('select')).toContain('mes_work_order_pack_item(pieces)')
        } else if (mode === 'notice') {
          expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
          expect(url.searchParams.get('kind')).toBe('eq.shipping_notice')
          expect(url.searchParams.get('status')).toBe('eq.submitted')
          expect(url.searchParams.get('order')).toBe('updated_at.desc,id.asc')
        } else if (mode === 'driver') {
          expect(url.searchParams.get('carrier_id')).toBe('eq.carrier-a')
          expect(url.searchParams.get('order')).toBe('plate_no.asc,id.asc')
          expect(url.searchParams.get('or')).toBe(
            '(primary_driver_id.eq.11111111-1111-4111-8111-111111111111,secondary_driver_id.eq.11111111-1111-4111-8111-111111111111)'
          )
        } else if (mode === 'insurance') {
          expect(url.searchParams.get('order')).toBe('company_name.asc,id.asc')
          expect(url.searchParams.get('select')).toContain('contact_person,contact_phone')
        } else if (mode === 'accessory') {
          expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
          expect(url.searchParams.get('order')).toBe('create_time.desc,id.asc')
          expect(url.searchParams.get('select')).toContain('items:mdm_accessory_processing_item')
        } else {
          expect(url.searchParams.get('consumed_work_order_id')).toBe('eq.order-a')
          expect(url.searchParams.get('status')).toBe('eq.out')
          expect(url.searchParams.get('parent_serial_id')).toBe('is.null')
        }
        const offset = Number(url.searchParams.get('offset') ?? 0)
        offsets.push(offset)
        const length = incomplete && offset === 1000 ? 0 : Math.min(500, 1001 - offset)
        const data = Array.from({ length }, (_, index) => ({ id: `record-${offset + index}` }))
        return route.fulfill({
          headers: {
            'content-range': length ? `${offset}-${offset + length - 1}/1001` : '*/1001',
            'access-control-expose-headers': 'content-range'
          },
          json: data
        })
      })
      await page.goto(`/tests/e2e/fixtures/business-options-pagination.html?mode=${mode}`)
      await page.getByRole('button', { name: '加载候选', exact: true }).click()
      await expect(page.getByTestId('result')).toHaveText(
        incomplete ? '加载失败' : '1001:record-1000'
      )
      expect(offsets).toEqual([0, 500, 1000])
    })
  }
}

test('站点第二页取消后拒绝返回第一页部分集合', async ({ page }) => {
  const offsets: number[] = []
  let releaseSecondPage: (() => void) | undefined
  const heldPage = new Promise<void>((resolve) => {
    releaseSecondPage = resolve
  })
  await page.route('**/rest/v1/mdm_station?**', async (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0)
    offsets.push(offset)
    if (offset === 500) await heldPage
    await route.fulfill({
      headers: {
        'content-range': `${offset}-${offset + 499}/1001`,
        'access-control-expose-headers': 'content-range'
      },
      json: Array.from({ length: 500 }, (_, index) => ({ id: `record-${offset + index}` }))
    })
  })
  await page.goto('/tests/e2e/fixtures/business-options-pagination.html?mode=station')
  await page.getByRole('button', { name: '加载候选', exact: true }).click()
  await expect.poll(() => offsets).toEqual([0, 500])
  await page.getByRole('button', { name: '取消加载', exact: true }).click()
  await expect(page.getByTestId('result')).toHaveText('加载失败')
  releaseSecondPage?.()
  expect(offsets).toEqual([0, 500])
})

test('站点空集合是成功结果', async ({ page }) => {
  await page.route('**/rest/v1/mdm_station?**', (route) =>
    route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  )
  await page.goto('/tests/e2e/fixtures/business-options-pagination.html?mode=station')
  await page.getByRole('button', { name: '加载候选', exact: true }).click()
  await expect(page.getByTestId('result')).toHaveText('0:undefined')
})
