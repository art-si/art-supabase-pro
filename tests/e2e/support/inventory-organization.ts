import type { Page } from '@playwright/test'

interface OrganizationFixture {
  id: string
  tenant_id: string
  organization_code: string
  organization_name: string
  organization_type: string
  status: string
}
interface InitializationFixture {
  organization_id: string
  enabled_on: string | null
  is_default: boolean
  initialization_closed_at: string | null
}

export async function mockInventoryOrganizations(
  page: Page,
  organizations: () => OrganizationFixture[],
  initialization: () => InitializationFixture[]
): Promise<void> {
  await page.route('**/rest/v1/mdm_organization?*', (route) => {
    const states = new Map(initialization().map((row) => [row.organization_id, row]))
    const rows = organizations().map((row) => ({
      ...row,
      initialization: states.get(row.id) ?? null
    }))
    const offset = Number(new URL(route.request().url()).searchParams.get('offset') ?? 0)
    const limit = Number(new URL(route.request().url()).searchParams.get('limit') ?? rows.length)
    const data = rows.slice(offset, offset + limit)
    return route.fulfill({
      headers: {
        'content-range': data.length
          ? `${offset}-${offset + data.length - 1}/${rows.length}`
          : `*/${rows.length}`,
        'access-control-expose-headers': 'content-range'
      },
      json: data
    })
  })
}
