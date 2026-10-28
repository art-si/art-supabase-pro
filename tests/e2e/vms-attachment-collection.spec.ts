import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantId = '11111111-1111-4111-8111-111111111111'
const otherTenantId = '22222222-2222-4222-8222-222222222222'
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

test('维修记录选择同租户车辆保留附件，跨租户切车清空旧附件', async ({ page }, info) => {
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
    if (table === 'vms_list_vehicle_archives_secure')
      return route.fulfill({
        json: {
          records: [
            {
              id: 'vehicle-a',
              tenantId,
              plateNo: '测A12345',
              companyName: '甲租户运输公司',
              auditStatus: 'approved'
            },
            {
              id: 'vehicle-b',
              tenantId: otherTenantId,
              plateNo: '测B67890',
              companyName: '乙租户运输公司',
              auditStatus: 'approved'
            }
          ],
          total: 2,
          fieldAccess: {}
        }
      })
    return route.fulfill({
      headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' },
      json: []
    })
  })

  await page.goto(
    '/tests/e2e/fixtures/vms-attachment-collection.html?scenario=maintenance-tenant-switch',
    {
      waitUntil: 'domcontentloaded'
    }
  )
  await page.getByRole('button', { name: '新增维修保养记录' }).click()
  const recordDialog = page.getByRole('dialog', { name: '新增维修保养记录' })
  await recordDialog.getByRole('button', { name: '上传', exact: true }).click()
  const attachmentDialog = page.getByRole('dialog', { name: '上传维修保养附件' })
  await attachmentDialog.getByRole('button', { name: '更多附件来源' }).click()
  await page.getByText('从资源库选择').click()
  const resourcePicker = page.getByRole('dialog', { name: '从资源管理器选择文件' })
  await resourcePicker.getByRole('button', { name: '选择资源 资源库保单' }).click()
  await resourcePicker.getByRole('button', { name: '确认' }).click()
  await attachmentDialog.getByRole('button', { name: '确定' }).click()
  await expect(attachmentDialog).toBeHidden()
  const attachmentRow = recordDialog.getByRole('row').filter({ hasText: '资源库保单' })
  await expect(attachmentRow).toHaveCount(1)

  const selectVehicle = async (plateNo: string): Promise<void> => {
    await recordDialog.locator('.art-data-select__single-input input').first().click()
    const vehiclePicker = page.getByRole('dialog', { name: '选择车辆' })
    await vehiclePicker.getByRole('row').filter({ hasText: plateNo }).click()
    await vehiclePicker.getByRole('button', { name: '确定' }).click()
    await expect(vehiclePicker).toBeHidden()
  }

  await selectVehicle('测A12345')
  await expect(attachmentRow).toHaveCount(1)
  await expect(page.getByText('车辆所属租户已变化，原有附件已清空，请重新上传')).toHaveCount(0)
  await recordDialog.screenshot({ path: info.outputPath('maintenance-same-tenant-kept.png') })

  await selectVehicle('测B67890')
  await expect(attachmentRow).toHaveCount(0)
  await expect(page.getByText('车辆所属租户已变化，原有附件已清空，请重新上传')).toBeVisible()
  await recordDialog.screenshot({ path: info.outputPath('maintenance-cross-tenant-cleared.png') })
  expect(errors).toEqual([])
})

for (const { scenario, title, attachmentTitle, nameLabel, nameRequiredMessage } of [
  {
    scenario: 'accident',
    title: '新增事故记录',
    attachmentTitle: '上传事故附件',
    nameLabel: '事故附件名称',
    nameRequiredMessage: '请输入事故附件名称'
  },
  {
    scenario: 'maintenance',
    title: '新增维修保养记录',
    attachmentTitle: '上传维修保养附件',
    nameLabel: '维修保养附件名称',
    nameRequiredMessage: '请输入维修保养附件名称'
  },
  {
    scenario: 'routine',
    title: '新增例检记录',
    attachmentTitle: '上传例检附件',
    nameLabel: '附件名称',
    nameRequiredMessage: '请输入附件名称'
  }
] as const) {
  for (const appearance of ['light-border', 'dark-shadow'] as const) {
    test(`${title}资源选择、名称保留和重复拦截 ${appearance}`, async ({ page }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await prepareIsolatedSession(page)
      await page.setViewportSize(
        appearance === 'dark-shadow' ? { width: 570, height: 900 } : { width: 1440, height: 900 }
      )
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

      await page.goto(
        `/tests/e2e/fixtures/vms-attachment-collection.html?scenario=${scenario}&appearance=${appearance}`,
        { waitUntil: 'domcontentloaded' }
      )
      await page.getByRole('button', { name: title }).click()
      const recordDialog = page.getByRole('dialog', { name: title })
      await recordDialog.getByRole('button', { name: '上传', exact: true }).click()
      const attachmentDialog = page.getByRole('dialog', { name: attachmentTitle })
      const nameInput = attachmentDialog.getByRole('textbox', { name: nameLabel })
      await expect(nameInput).toBeEditable()
      await attachmentDialog.getByRole('button', { name: '确定' }).click()
      await expect(attachmentDialog).toBeVisible()
      await expect(attachmentDialog.getByText(nameRequiredMessage)).toBeVisible()
      await expect(recordDialog.getByRole('row').filter({ hasText: '资源库保单' })).toHaveCount(0)
      await nameInput.fill('仅填写名称')
      await attachmentDialog.getByRole('button', { name: '确定' }).click()
      await expect(attachmentDialog).toBeVisible()
      await expect(attachmentDialog.getByText('请选择上传文件')).toBeVisible()
      await expect(recordDialog.getByRole('row').filter({ hasText: '仅填写名称' })).toHaveCount(0)
      await nameInput.fill('')

      const selectResource = async (): Promise<void> => {
        await attachmentDialog.getByRole('button', { name: '更多附件来源' }).click()
        await page.getByText('从资源库选择').click()
        const picker = page.getByRole('dialog', { name: '从资源管理器选择文件' })
        await picker.getByRole('button', { name: '选择资源 资源库保单' }).click()
        await picker.getByRole('button', { name: '确认' }).click()
        await expect(picker).toBeHidden()
      }

      await selectResource()
      await expect(nameInput).toHaveValue('资源库保单')
      await nameInput.fill('自定义附件')
      await attachmentDialog.getByRole('button', { name: '确定' }).click()
      await expect(attachmentDialog).toBeHidden()
      await expect(recordDialog.getByRole('row').filter({ hasText: '自定义附件' })).toHaveCount(1)
      await recordDialog.screenshot({
        path: info.outputPath(`${scenario}-${appearance}-attachment-added.png`)
      })

      await recordDialog.getByRole('button', { name: '上传', exact: true }).click()
      await nameInput.fill('保留的自定义名')
      await selectResource()
      await expect(nameInput).toHaveValue('保留的自定义名')
      await attachmentDialog.getByRole('button', { name: '确定' }).click()
      await expect(page.getByText('该附件已在当前记录中')).toBeVisible()
      await expect(attachmentDialog).toBeVisible()
      await expect(recordDialog.getByRole('row').filter({ hasText: '自定义附件' })).toHaveCount(1)
      await expect(recordDialog.getByText('保留的自定义名')).toHaveCount(0)
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      await expect
        .poll(() =>
          attachmentDialog.evaluate((element) => element.scrollWidth - element.clientWidth)
        )
        .toBeLessThanOrEqual(1)
      await page.screenshot({
        path: info.outputPath(`${scenario}-${appearance}-attachment-duplicate.png`)
      })
      expect(errors).toEqual([])
    })
  }
}
