import type { Page } from '@playwright/test'

/** 用授权平铺菜单模拟批量 RPC，和生产端一样按请求的应用编码返回。 */
export async function mockApplicationMenus(
  page: Page,
  menusByApplication: Record<string, readonly unknown[]>
): Promise<void> {
  const buttonPermissions = Object.values(menusByApplication)
    .flat()
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item) && item.type === 'button'
    )

  await page.route('**/rest/v1/rpc/get_menus_for_current_applications', async (route) => {
    const payload: unknown = route.request().postDataJSON()
    const requestedCodes =
      payload && typeof payload === 'object' && 'p_app_codes' in payload
        ? payload.p_app_codes
        : null
    const codes = Array.isArray(requestedCodes)
      ? requestedCodes.filter((code): code is string => typeof code === 'string')
      : []

    await route.fulfill({
      json: Object.fromEntries(codes.map((code) => [code, menusByApplication[code] ?? []]))
    })
  })
  await page.route('**/rest/v1/rpc/get_current_user_button_permissions', (route) =>
    route.fulfill({ json: buttonPermissions })
  )
}
