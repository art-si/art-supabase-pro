import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('危废分类与名录删除检查、并发引用和父单据导航', async ({ page }, testInfo) => {
  await prepareIsolatedSession(page)
  const path = '/smis/hazardous-waste-management/hazardous-waste-catalog'
  const documentPath = '/smis/hazardous-waste-management/hazardous-waste-outbound'
  const menu = {
    id: 'catalog',
    parentId: null,
    name: 'SmisHazardousWasteCatalog',
    path,
    component: path,
    type: 'menu',
    sort: 1,
    meta: { title: '危废名录', is_enable: true, is_hide: false, roles: [] }
  }
  const target = {
    ...menu,
    id: 'outbound',
    name: 'SmisHazardousWasteOutbound',
    path: documentPath,
    component: documentPath
  }
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
  )
  await mockApplicationMenus(page, {
    smis: [
      menu,
      target,
      ...['View', 'Delete', 'DeleteCategory'].map((action) => ({
        ...menu,
        id: `catalog-${action}`,
        parentId: menu.id,
        name: `${menu.name}:${action}`,
        type: 'button',
        path: '',
        component: ''
      })),
      {
        ...target,
        id: 'outbound-view',
        parentId: target.id,
        name: `${target.name}:View`,
        type: 'button',
        path: '',
        component: ''
      }
    ]
  })
  const childCategory = {
    id: 'category-2',
    parentId: 'category-1',
    categoryCode: 'HW-02',
    categoryName: '测试下级分类',
    sort: 1,
    status: 'enabled',
    tagStyle: '',
    catalogCount: 0,
    children: []
  }
  const category = {
    id: 'category-1',
    categoryCode: 'HW-01',
    categoryName: '测试危废分类',
    sort: 1,
    status: 'enabled',
    tagStyle: '',
    catalogCount: 1,
    children: [childCategory]
  }
  const catalog = {
    id: 'catalog-1',
    categoryId: category.id,
    category,
    wasteCode: 'W-001',
    wasteName: '测试危废名录',
    unit: 'kg',
    sort: 1,
    status: 'enabled',
    tagStyle: '',
    updateTime: '2026-01-01'
  }
  let removed = false
  let childFilterRequests = 0
  await page.route('**/rest/v1/rpc/smis_list_hazardous_waste_catalog_secure', (route) => {
    const query = route.request().postDataJSON()
    const childFilter = query.p_category_id === childCategory.id
    if (childFilter) childFilterRequests++
    return route.fulfill({
      json: {
        records: removed || childFilter ? [] : [catalog],
        total: removed || childFilter ? 0 : 1,
        categories: [category, childCategory],
        overview: { total: 1, enabled: 1, categoryCount: 1, characteristicCount: 0 }
      }
    })
  })
  let failure = true
  let blocked = false
  let checks = 0
  let deletes = 0
  let success = false
  let documentVisible = false
  let childReference = false
  await page.route('**/rest/v1/rpc/get_record_delete_dependency_details?**', (route) => {
    checks++
    const table = route.request().postDataJSON().p_table
    if (failure)
      return route.fulfill({
        status: 503,
        json: { code: 'XX000', message: 'database unavailable' }
      })
    return route.fulfill({
      json: blocked
        ? [
            {
              resourceId: table === 'smis_hazardous_waste_category' ? category.id : catalog.id,
              sourceTable:
                table === 'smis_hazardous_waste_category'
                  ? childReference
                    ? 'smis_hazardous_waste_category'
                    : 'smis_hazardous_waste_catalog'
                  : 'smis_hazardous_waste_document_item',
              recordId:
                table === 'smis_hazardous_waste_category'
                  ? childReference
                    ? childCategory.id
                    : catalog.id
                  : 'item-1',
              targetId:
                table === 'smis_hazardous_waste_category'
                  ? childReference
                    ? childCategory.id
                    : catalog.id
                  : 'item-1',
              recordNo:
                table === 'smis_hazardous_waste_category'
                  ? childReference
                    ? childCategory.categoryCode
                    : 'W-001'
                  : '明细',
              recordStatus: 'enabled',
              createdAt: '2026-01-01'
            }
          ]
        : []
    })
  })
  await page.route('**/rest/v1/smis_hazardous_waste_document_item?**', (route) => {
    expect(new URL(route.request().url()).searchParams.get('id')).toBe('in.(item-1)')
    return route.fulfill({
      json: [
        {
          id: 'item-1',
          document: documentVisible
            ? { id: 'doc-1', documentNo: 'WF-001', direction: 'outbound', status: 'draft' }
            : null
        }
      ]
    })
  })
  await page.route('**/rest/v1/rpc/smis_list_hazardous_waste_documents_secure', (route) => {
    const query = route.request().postDataJSON()
    expect(query.p_warehouse_id).toBeNull()
    expect(query.p_document_no).toBe('WF-001')
    return route.fulfill({
      json: {
        records: [
          {
            id: 'doc-1',
            documentNo: 'WF-001',
            status: 'draft',
            warehouseId: 'warehouse-1',
            warehouseName: '测试仓库',
            operationDate: '2026-01-01',
            items: [
              { catalogId: catalog.id, wasteName: catalog.wasteName, quantity: 1, unit: 'kg' }
            ],
            attachments: [],
            updateTime: '2026-01-01'
          }
        ],
        total: 1
      }
    })
  })
  await page.route('**/rest/v1/rpc/smis_delete_hazardous_waste_catalog_secure', (route) => {
    deletes++
    if (success) {
      removed = true
      return route.fulfill({ json: 1 })
    }
    blocked = true
    return route.fulfill({
      status: 400,
      json: { code: 'P0001', message: '选中的危废名录已被单据引用，请改为停用' }
    })
  })
  let categoryDeletes = 0
  await page.route('**/rest/v1/rpc/smis_delete_hazardous_waste_categories_secure', (route) => {
    categoryDeletes++
    return route.fulfill({ json: 0 })
  })
  await page.goto(`#${path}`)
  const remove = page
    .locator('.el-table__body-wrapper')
    .getByRole('button', { name: '删除', exact: true })
    .first()
  await expect(remove).toBeVisible({ timeout: 60_000 })
  await remove.click()
  await expect(page.getByText('关联资料未完成核验，删除已停止')).toBeVisible()
  expect(deletes).toBe(0)
  failure = false
  blocked = true
  await page.getByRole('button', { name: '重新检查', exact: true }).click()
  await expect(
    page.getByText('关联单据暂不可见，请核对查看权限后重新检查', { exact: true })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '查看关联', exact: true })).toHaveCount(0)
  expect(deletes).toBe(0)
  await page.screenshot({
    path: testInfo.outputPath('document-unavailable.png'),
    animations: 'disabled'
  })
  documentVisible = true
  await page.getByRole('button', { name: '重新检查', exact: true }).click()
  await expect(page.getByText('WF-001', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('catalog-blocked.png'),
    animations: 'disabled'
  })
  await page.getByRole('button', { name: '查看关联', exact: true }).click()
  await expect(page).toHaveURL(/recordId=doc-1/)
  await expect(page).toHaveURL(/hazardous-waste-outbound/)
  await expect(
    page.locator('.el-table__body-wrapper').getByText('WF-001', { exact: true })
  ).toBeVisible()
  await expect(page.getByText('已精确过滤', { exact: true })).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('catalog-document.png'),
    animations: 'disabled'
  })
  const onboarding = page.getByText('知道了', { exact: true })
  if (await onboarding.isVisible()) await onboarding.click()
  await assertTableFocusContract(page, testInfo, ['.master-delete-notice'])
  await page.getByRole('button', { name: '返回危废名录管理', exact: true }).click()
  await expect(remove).toBeVisible()
  blocked = false
  await page.locator('.el-table__body-wrapper .el-checkbox').first().click()
  await page.getByRole('button', { name: '批量删除', exact: true }).click()
  const before = checks
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByText('WF-001', { exact: true })).toBeVisible()
  expect(deletes).toBe(1)
  expect(checks).toBeGreaterThan(before)
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page
    .locator('.hazardous-category-nav__node')
    .filter({ hasText: category.categoryName })
    .click()
  await page.getByRole('button', { name: '删除当前分类', exact: true }).click()
  await expect(page.getByText('W-001', { exact: true }).last()).toBeVisible()
  expect(categoryDeletes).toBe(0)
  await page.getByRole('button', { name: '查看关联', exact: true }).click()
  await expect(page).toHaveURL(/recordId=catalog-1/)
  await expect(page.getByText('已精确过滤', { exact: true })).toBeVisible()
  await assertTableFocusContract(page, testInfo, [
    '.master-delete-notice',
    '.hazardous-category-nav'
  ])
  await page.getByRole('button', { name: '清除定位', exact: true }).click()
  childReference = true
  await page
    .locator('.hazardous-category-nav__node')
    .filter({ hasText: category.categoryName })
    .click()
  await page.getByRole('button', { name: '删除当前分类', exact: true }).click()
  await expect(
    page.getByRole('dialog').getByText(childCategory.categoryCode, { exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: '查看关联', exact: true }).click()
  await expect(page).toHaveURL(/recordId=category-2/)
  await expect(page.getByText('已精确过滤', { exact: true })).toBeVisible()
  await expect(
    page.locator('.art-table-query').getByText('暂无危废名录', { exact: true })
  ).toBeVisible()
  expect(childFilterRequests).toBeGreaterThan(0)
  expect(categoryDeletes).toBe(0)
  await page.screenshot({
    path: testInfo.outputPath('child-category-location.png'),
    animations: 'disabled'
  })
  await page.getByRole('button', { name: '清除定位', exact: true }).click()
  childReference = false
  await page
    .locator('.hazardous-category-nav__node')
    .filter({ hasText: category.categoryName })
    .click()
  blocked = false
  await page.getByRole('button', { name: '删除当前分类', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  expect(categoryDeletes).toBe(1)
  await expect(page.locator('.el-message--success')).toHaveCount(0)
  await page.mouse.move(0, 0)
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  success = true
  await remove.click()
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.locator('.el-message--success')).toHaveCount(1)
  await expect(
    page.locator('.el-table__body-wrapper').getByText(catalog.wasteName, { exact: true })
  ).toHaveCount(0)
  expect(deletes).toBe(2)
})
