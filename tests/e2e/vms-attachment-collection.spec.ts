import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const sharedUrl = 'https://example.invalid/shared.pdf'

test('车辆保险重复选取资源不新增，移除只删选中行', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    if (table === 'sys_attachment')
      return route.fulfill({
        headers: { 'content-range': '0-0/1', 'access-control-expose-headers': 'content-range' },
        json: [
          {
            id: 1,
            tenant_id: tenantId,
            origin_name: '资源库保单',
            object_name: 'shared.pdf',
            suffix: 'pdf',
            size_info: '10 KB',
            mime_type: 'application/pdf',
            url: sharedUrl
          }
        ]
      })
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  await page.goto('/tests/e2e/fixtures/vms-attachment-collection.html', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '编辑保险' }).click()
  const dialog = page.getByRole('dialog', { name: '编辑车辆保险' })
  await expect(dialog.getByText('旧保单')).toBeVisible()
  await expect(dialog.getByText('新保单')).toBeVisible()

  await dialog.getByRole('button', { name: '更多附件来源' }).click()
  await page.getByText('从资源库选择').click()
  const picker = page.getByRole('dialog', { name: '从资源管理器选择文件' })
  await picker.getByRole('button', { name: '选择资源 资源库保单' }).click()
  await picker.getByRole('button', { name: '确认' }).click()
  await expect(picker).toBeHidden()
  await expect(dialog.getByText('资源库保单')).toHaveCount(0)
  await expect(dialog.getByText('旧保单')).toBeVisible()
  await expect(dialog.getByText('新保单')).toBeVisible()
  await dialog.screenshot({ path: info.outputPath('insurance-duplicate-rejected.png') })

  await dialog
    .getByRole('row')
    .filter({ hasText: '新保单' })
    .getByRole('button', {
      name: '移除附件'
    })
    .click()
  await page.getByRole('dialog', { name: '删除确认' }).getByRole('button', { name: '删除' }).click()
  await expect(dialog.getByText('新保单')).toHaveCount(0)
  await expect(dialog.getByText('旧保单')).toBeVisible()
  await dialog.screenshot({ path: info.outputPath('insurance-one-row-removed.png') })
  expect(errors).toEqual([])
})

test('车辆档案历史重复 URL 附件只移除当前行', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    if (table === 'sys_tenant')
      return route.fulfill({ json: [{ id: tenantId, tenant_code: 'A', tenant_name: '测试租户' }] })
    if (table === 'vms_get_vehicle_archive_secure')
      return route.fulfill({
        json: {
          id: 'archive-1',
          tenant_id: tenantId,
          plate_no: '测A12345',
          audit_status: 'draft',
          field_access: { documents: 'edit' },
          attachments: [
            { name: '旧保单', url: sharedUrl, file_type: 'pdf' },
            { name: '新保单', url: sharedUrl, file_type: 'pdf' }
          ]
        }
      })
    if (table === 'vms_get_default_trailer_secure') return route.fulfill({ json: null })
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })
  await page.goto('/tests/e2e/fixtures/vms-attachment-collection.html?scenario=archive', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '编辑车辆档案' })).toBeVisible()
  await page.getByRole('tab', { name: '其他信息' }).click()
  await expect(page.getByText('旧保单')).toBeVisible()
  await expect(page.getByText('新保单')).toBeVisible()
  await page
    .getByRole('row')
    .filter({ hasText: '新保单' })
    .getByRole('button', {
      name: '删除附件'
    })
    .click()
  await page.getByRole('dialog', { name: '删除确认' }).getByRole('button', { name: '删除' }).click()
  await expect(page.getByText('新保单')).toHaveCount(0)
  await expect(page.getByText('旧保单')).toBeVisible()
  await page.screenshot({ path: info.outputPath('archive-one-row-removed.png') })
  expect(errors).toEqual([])
})
