import { expect, test, type Page } from '@playwright/test'
import ExcelJS from 'exceljs'

const previewPath = '/tests/e2e/fixtures/smis-site-import.html'
const platformTenantId = '55555555-5555-4555-8555-555555555555'
const businessTenantId = '11111111-1111-4111-8111-111111111111'
const platformOrganizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const businessOrganizationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const businessEmployeeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

interface ImportRow {
  organizationCode: string
  parentSiteName?: string
  siteName: string
  categoryCode?: string
  responsibleEmployeeNo?: string
  sort?: number
}

interface SiteRequest {
  path: string
  body: Record<string, unknown> | null
}

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const buildWorkbook = async (rows: ImportRow[]): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('场所')
  sheet.addRow(['部门编码', '上级场所', '场所名称', '属性类别', '顺序号', '责任人员工号'])
  rows.forEach((row) => {
    sheet.addRow([
      row.organizationCode,
      row.parentSiteName ?? '',
      row.siteName,
      row.categoryCode ?? '区域',
      row.sort ?? 0,
      row.responsibleEmployeeNo ?? ''
    ])
  })
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

const mockSiteApi = async (page: Page, duplicateCode = false): Promise<SiteRequest[]> => {
  const requests: SiteRequest[] = []
  await page.route('**/rest/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const body = request.postDataJSON() as Record<string, unknown> | null
    requests.push({ path, body })

    if (path.endsWith('/mdm_organization')) {
      await route.fulfill({
        json: [
          {
            id: platformOrganizationId,
            tenant_id: platformTenantId,
            organization_code: duplicateCode ? 'OPS' : 'HQ',
            organization_name: '平台部门',
            organization_type: 'department',
            status: '1',
            sort: 1,
            tenant: { tenant_code: 'platform', tenant_name: '平台管理员租户' }
          },
          {
            id: businessOrganizationId,
            tenant_id: businessTenantId,
            organization_code: 'OPS',
            organization_name: '业务部门',
            organization_type: 'department',
            status: '1',
            sort: 2,
            tenant: { tenant_code: 'business', tenant_name: '业务租户' }
          }
        ]
      })
      return
    }
    if (path.endsWith('/sys_dictionary')) {
      await route.fulfill({
        json: [
          {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            type_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            code: 'area',
            label: '区域',
            value: 'area',
            status: '1',
            sort: 1,
            dict_type_table: { code: 'smisSiteCategory', name: '场所类别' }
          }
        ]
      })
      return
    }
    if (path.endsWith('/rpc/smis_list_sites_secure')) {
      await route.fulfill({ json: [] })
      return
    }
    if (path.endsWith('/rpc/smis_list_site_employees_secure')) {
      const from = Number(body?.p_from ?? 0)
      await route.fulfill({
        json: {
          records: [
            {
              id: from === 0 ? platformTenantId : businessEmployeeId,
              tenant_id: from === 0 ? platformTenantId : businessTenantId,
              employee_no: 'EMP-001',
              employee_name: from === 0 ? '其他租户员工' : '业务租户员工',
              employment_status: 'active'
            }
          ],
          total: 101
        }
      })
      return
    }
    if (path.endsWith('/rpc/smis_save_site_secure')) {
      const saveCount = requests.filter((item) =>
        item.path.endsWith('/rpc/smis_save_site_secure')
      ).length
      await route.fulfill({
        json: `33333333-3333-4333-8333-${String(saveCount).padStart(12, '0')}`
      })
      return
    }
    await route.fulfill({ json: [] })
  })
  return requests
}

const upload = async (page: Page, rows: ImportRow[]): Promise<void> => {
  await expect(page.getByRole('button', { name: '导入', exact: true })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: '场所.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await buildWorkbook(rows)
  })
}

test('全部租户跨租户导入父子场所，按租户分页核对员工且复用场所快照', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const requests = await mockSiteApi(page)
  await page.goto(`${previewPath}?scope=all`)
  await upload(page, [
    { organizationCode: 'OPS', siteName: '业务园区', responsibleEmployeeNo: 'EMP-001' },
    {
      organizationCode: 'OPS',
      parentSiteName: '业务园区',
      siteName: '仓库',
      responsibleEmployeeNo: 'EMP-001'
    }
  ])

  await expect(page.getByText('已导入 2 个场所')).toBeVisible()
  const saves = requests.filter((item) => item.path.endsWith('/rpc/smis_save_site_secure'))
  expect(saves).toHaveLength(2)
  expect(saves[0].body?.p_payload).toMatchObject({
    organization_id: businessOrganizationId,
    responsible_employee_id: businessEmployeeId,
    parent_id: null
  })
  expect(saves[1].body?.p_payload).toMatchObject({
    organization_id: businessOrganizationId,
    responsible_employee_id: businessEmployeeId,
    parent_id: '33333333-3333-4333-8333-000000000001'
  })
  expect(
    requests.filter((item) => item.path.endsWith('/rpc/smis_list_site_employees_secure'))
  ).toHaveLength(2)
  expect(
    requests.filter((item) => item.path.endsWith('/rpc/smis_list_sites_secure')).length
  ).toBeLessThanOrEqual(3)
  await page.screenshot({ path: '.artifacts/smis-site-import-desktop.png', animations: 'disabled' })
  await page.setViewportSize({ width: 390, height: 844 })
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
  await page.screenshot({ path: '.artifacts/smis-site-import-mobile.png', animations: 'disabled' })
  expect(pageErrors).toEqual([])
})

test('全部租户遇到跨租户重复部门编码时停止导入，指定租户可继续', async ({ page }) => {
  const requests = await mockSiteApi(page, true)
  await page.goto(`${previewPath}?scope=all`)
  await upload(page, [{ organizationCode: 'OPS', siteName: '园区' }])
  await expect(page.getByText(/部门编码“OPS”对应多个租户/)).toBeVisible()
  expect(requests.filter((item) => item.path.endsWith('/rpc/smis_save_site_secure'))).toHaveLength(
    0
  )

  await page.goto(`${previewPath}?scope=selected`)
  await upload(page, [{ organizationCode: 'OPS', siteName: '园区' }])
  await expect(page.getByText('已导入 1 个场所')).toBeVisible()
  const saves = requests.filter((item) => item.path.endsWith('/rpc/smis_save_site_secure'))
  expect(saves).toHaveLength(1)
  expect(saves[0].body?.p_payload).toMatchObject({ organization_id: businessOrganizationId })
})

test('普通用户的伪造会话租户不改变导入目标', async ({ page }) => {
  const requests = await mockSiteApi(page)
  await page.goto(`${previewPath}?scope=ordinary-forged`)
  await upload(page, [{ organizationCode: 'OPS', siteName: '园区' }])
  await expect(page.getByText('已导入 1 个场所')).toBeVisible()
  const save = requests.find((item) => item.path.endsWith('/rpc/smis_save_site_secure'))
  expect(save?.body?.p_payload).toMatchObject({ organization_id: businessOrganizationId })
})

test('部分行保存后失败会指出行号和已保存数量', async ({ page }) => {
  const requests = await mockSiteApi(page)
  await page.goto(`${previewPath}?scope=selected`)
  await upload(page, [
    { organizationCode: 'OPS', siteName: '园区' },
    { organizationCode: 'OPS', siteName: '车间', categoryCode: '未知类别' }
  ])
  await expect(page.getByText(/第 2 行无法识别属性类别/)).toBeVisible()
  await expect(page.getByText(/已有 1 行保存成功/)).toBeVisible()
  expect(requests.filter((item) => item.path.endsWith('/rpc/smis_save_site_secure'))).toHaveLength(
    1
  )
})

test('部门加载失败显示可重试状态，重试后恢复部门树', async ({ page }) => {
  await mockSiteApi(page)
  let organizationRequests = 0
  let allowSuccess = false
  await page.route('**/rest/v1/mdm_organization?*', async (route) => {
    organizationRequests += 1
    if (!allowSuccess) {
      await route.fulfill({
        status: 503,
        json: { code: 'PGRST000', message: 'service unavailable' }
      })
      return
    }
    await route.fallback()
  })

  await page.goto(`${previewPath}?scope=selected`)
  await expect(page.getByText('数据库服务暂时不可用，请稍后重试', { exact: true })).toBeVisible()
  await expect(page.locator('.el-message--error')).toHaveCount(0)
  allowSuccess = true
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.getByText('业务部门', { exact: true })).toBeVisible()
  expect(organizationRequests).toBeGreaterThan(1)
})
