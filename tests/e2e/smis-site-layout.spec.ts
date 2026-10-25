import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test('场所树箭头与图片上传保持公用布局', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const organization = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      organization_code: 'OPS',
      organization_name: '业务部门',
      organization_type: 'department',
      status: '1',
      sort: 1
    }
    if (path.endsWith('/mdm_organization')) return route.fulfill({ json: [organization] })
    if (path.endsWith('/rpc/smis_list_sites_secure')) {
      const root = {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organization_id: organization.id,
        organization,
        site_name: '新新社区',
        category_code: 'area',
        sort: 1,
        coordinate_system: 'gcj02',
        image_urls: []
      }
      return route.fulfill({
        json: [
          root,
          {
            ...root,
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            parent_id: root.id,
            site_name: '社区服务中心'
          }
        ]
      })
    }
    if (path.endsWith('/rpc/smis_list_site_employees_secure'))
      return route.fulfill({ json: { records: [], total: 0 } })
    return route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/smis-site-import.html?scope=selected&layout=1')
  const cell = page.locator('.site-tree-identity-cell').filter({ hasText: '新新社区' }).first()
  await expect(cell).toBeVisible()
  const arrow = cell.locator('.el-table__expand-icon')
  const identity = cell.locator('.site-page__identity')
  const a = await arrow.boundingBox()
  const b = await identity.boundingBox()
  expect(a).not.toBeNull()
  expect(b).not.toBeNull()
  expect(Math.abs(a!.y + a!.height / 2 - (b!.y + b!.height / 2))).toBeLessThan(2)
  await arrow.click()
  await expect(
    page.locator('.site-tree-identity-cell').filter({ hasText: '社区服务中心' })
  ).toBeVisible()
  await page
    .locator('.site-tree-row')
    .first()
    .getByRole('button', { name: '编辑', exact: true })
    .click()
  const dialog = page.getByRole('dialog').filter({ hasText: '编辑场所' })
  const tile = dialog.locator('.art-upload .el-upload')
  const resource = dialog.getByRole('button', { name: '从资源库选择图片', exact: true })
  await expect(resource).toBeVisible()
  const t = await tile.boundingBox()
  const r = await resource.boundingBox()
  expect(t).not.toBeNull()
  expect(r).not.toBeNull()
  expect(r!.x).toBeGreaterThanOrEqual(t!.x)
  expect(r!.x + r!.width).toBeLessThanOrEqual(t!.x + t!.width + 1)
  expect(r!.y).toBeGreaterThanOrEqual(t!.y)
  expect(r!.y + r!.height).toBeLessThan(t!.y + t!.height)
  await page.screenshot({ path: info.outputPath('site-upload-layout.png'), fullPage: true })
})
