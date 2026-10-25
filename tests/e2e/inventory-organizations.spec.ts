import { expect, test } from '@playwright/test'
test.use({ storageState: { cookies: [], origins: [] } })
for (const mode of [
  'collection',
  'page',
  'missing',
  'duplicate',
  'initialization-status',
  'invalid',
  'invalid-wms'
]) {
  test(`库存组织统一读取 ${mode}`, async ({ page }) => {
    const offsets: number[] = []
    await page.route('**/rest/v1/**', (route) => {
      const url = new URL(route.request().url())
      expect(url.pathname).toBe('/rest/v1/mdm_organization')
      expect(url.searchParams.get('select')).toContain(
        'initialization:wms_inventory_initialization!wms_inventory_initialization_organization_id_fkey'
      )
      expect(url.searchParams.get('tenant_id')).toBe('eq.tenant-a')
      expect(url.searchParams.get('organization_type')).toBe('eq.company')
      expect(url.searchParams.get('status')).toBe('eq.1')
      if (mode === 'initialization-status') expect(url.searchParams.get('or')).toBeNull()
      else expect(url.searchParams.get('or')).toContain('测试')
      expect(url.searchParams.get('order')).toBe('organization_code.asc,id.asc')
      expect(url.searchParams.get('limit')).toBe('500')
      expect(route.request().headers().prefer).toContain('count=exact')
      const offset = Number(url.searchParams.get('offset') ?? 0)
      offsets.push(offset)
      const length = mode === 'missing' && offset === 2000 ? 0 : Math.min(500, 2001 - offset)
      const state = {
        enabled_on: '2026-10-01',
        is_default: true,
        initialization_closed_at: '2026-10-02'
      }
      return route.fulfill({
        headers: {
          'content-range': length ? `${offset}-${offset + length - 1}/2001` : '*/2001',
          'access-control-expose-headers': 'content-range'
        },
        json: Array.from({ length }, (_, index) => {
          const id = offset + index
          return {
            id: `org-${id}`,
            tenant_id: 'tenant-a',
            organization_code: `ORG-${id}`,
            organization_name: '测试组织',
            status: '1',
            initialization:
              mode === 'duplicate' ? [state, state] : id === 0 ? null : id % 2 ? state : [state]
          }
        })
      })
    })
    await page.goto(`/tests/e2e/fixtures/inventory-organizations.html?mode=${mode}`)
    await page.getByRole('button', { name: '读取组织', exact: true }).click()
    const output = page.getByTestId('result')
    if (mode === 'invalid' || mode === 'invalid-wms') {
      await expect(output).toHaveText('分页参数无效')
      expect(offsets).toEqual([])
      return
    }
    if (['missing', 'duplicate'].includes(mode)) await expect(output).toHaveText('加载失败')
    else {
      await expect(output).toContainText('org-2000')
      const result = JSON.parse(await output.innerText())
      expect(result.total).toBe(mode === 'page' || mode === 'initialization-status' ? 2000 : 2001)
      expect(result.last.enabledOn).toBe('2026-10-01')
      expect(result.last.isDefault).toBe(true)
      expect(result.last.initializationClosedAt).toBe('2026-10-02')
      expect(result.last.initialization).toBeUndefined()
      if (mode === 'page' || mode === 'initialization-status') {
        expect(result.length).toBe(50)
        expect(result.first).toBe('org-1951')
        if (mode === 'initialization-status')
          expect(result.last.initializationStatus).toBe('initialized')
      } else {
        expect(result.first.enabledOn).toBeNull()
        expect(result.first.isDefault).toBe(false)
      }
    }
    expect(offsets).toEqual([0, 500, 1000, 1500, 2000])
  })
}
