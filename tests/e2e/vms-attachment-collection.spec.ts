import { expect, test, type Page } from '@playwright/test'
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
  test.setTimeout(300_000)
  const errors: string[] = []
  const saveRequests: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    if (
      table === 'vms_create_vehicle_maintenance_secure' ||
      table === 'vms_update_vehicle_maintenance_secure'
    )
      saveRequests.push(table)
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
              id: 'vehicle-a2',
              tenantId,
              plateNo: '测A54321',
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
          total: 3,
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
  const selectVehicle = async (plateNo: string): Promise<void> => {
    await recordDialog.locator('.art-data-select__single-input input').first().click()
    const vehiclePicker = page.getByRole('dialog', { name: '选择车辆' })
    await vehiclePicker.getByRole('row').filter({ hasText: plateNo }).click()
    await vehiclePicker.getByRole('button', { name: '确定' }).click()
    await expect(vehiclePicker).toBeHidden()
  }

  await selectVehicle('测A12345')
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

  await selectVehicle('测A54321')
  await expect(attachmentRow).toHaveCount(1)
  await expect(page.getByText('车辆所属租户已变化，原有附件已清空，请重新上传')).toHaveCount(0)
  await attachmentRow.scrollIntoViewIfNeeded()
  await recordDialog.screenshot({ path: info.outputPath('maintenance-same-tenant-kept.png') })

  await selectVehicle('测B67890')
  await expect(attachmentRow).toHaveCount(0)
  await expect(page.getByText('车辆所属租户已变化，原有附件已清空，请重新上传')).toBeVisible()
  await recordDialog.getByText('维修保养附件', { exact: true }).scrollIntoViewIfNeeded()
  await recordDialog.screenshot({ path: info.outputPath('maintenance-cross-tenant-cleared.png') })
  expect(saveRequests).toEqual([])
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
      const addedRow = recordDialog.getByRole('row').filter({ hasText: '自定义附件' })
      await expect(addedRow).toHaveCount(1)
      await addedRow.scrollIntoViewIfNeeded()
      await recordDialog.screenshot({
        path: info.outputPath(`${scenario}-${appearance}-attachment-added.png`)
      })
      if (scenario === 'routine' && appearance === 'light-border') {
        await recordDialog
          .locator('.routine-inspection-dialog__section')
          .last()
          .screenshot({
            path: info.outputPath('routine-light-border-attachment-table.png')
          })
      }

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
      await attachmentDialog.getByRole('button', { name: '关闭弹窗' }).click()
      await expect(attachmentDialog).toBeHidden()
      const attachmentRow = recordDialog.getByRole('row').filter({ hasText: '自定义附件' })
      await expect(
        recordDialog.getByRole('columnheader', {
          name: scenario === 'accident' ? '事故附件名称' : '附件名称',
          exact: true
        })
      ).toBeVisible()
      await expect(attachmentRow.getByRole('button', { name: '查看附件' })).toBeEnabled()
      await expect(attachmentRow.getByRole('button', { name: '下载附件' })).toBeEnabled()
      await attachmentRow.getByRole('button', { name: '删除附件' }).click()
      const deletion = page.getByRole('dialog', { name: '删除确认' })
      await deletion.getByRole('button', { name: '取消' }).click()
      await expect(attachmentRow).toHaveCount(1)
      await attachmentRow.getByRole('button', { name: '删除附件' }).click()
      await deletion.getByRole('button', { name: '删除' }).click()
      await expect(attachmentRow).toHaveCount(0)
      expect(errors).toEqual([])
    })
  }
}

test('事故记录只读附件保留查看下载但不显示上传和删除', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
  await page.goto('/tests/e2e/fixtures/vms-attachment-collection.html?scenario=accident-readonly')
  await page.getByRole('button', { name: '查看只读事故记录' }).click()
  const dialog = page.getByRole('dialog', { name: '编辑事故记录' })
  const row = dialog.getByRole('row').filter({ hasText: '只读附件' })
  await expect(row).toBeVisible()
  await expect(dialog.getByRole('columnheader', { name: '事故附件名称' })).toBeVisible()
  await expect(row.getByRole('button', { name: '查看附件' })).toBeEnabled()
  await expect(row.getByRole('button', { name: '下载附件' })).toBeEnabled()
  await expect(row.getByRole('button', { name: '删除附件' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '上传', exact: true })).toHaveCount(0)
  await row.scrollIntoViewIfNeeded()
  await dialog.screenshot({ path: info.outputPath('accident-readonly-attachment-table.png') })
  expect(errors).toEqual([])
})

const removalScenarios = [
  {
    key: 'insurance',
    dialog: '编辑车辆保险',
    remove: '移除附件',
    confirm: '删除确认',
    accept: '删除'
  },
  {
    key: 'accident',
    dialog: '编辑事故记录',
    remove: '删除附件',
    confirm: '删除确认',
    accept: '删除'
  },
  {
    key: 'maintenance',
    dialog: '编辑维修保养记录',
    remove: '删除附件',
    confirm: '删除确认',
    accept: '删除'
  },
  {
    key: 'routine',
    dialog: '编辑例检记录',
    remove: '删除附件',
    confirm: '删除确认',
    accept: '删除'
  },
  {
    key: 'inspection',
    dialog: '编辑车辆年检',
    remove: '移除附件',
    confirm: '删除确认',
    accept: '删除'
  },
  {
    key: 'archive',
    dialog: '编辑车辆档案',
    remove: '删除附件',
    confirm: '删除确认',
    accept: '删除'
  },
  {
    key: 'certificate',
    dialog: '编辑证件',
    remove: '移除附件',
    confirm: '移除附件',
    accept: '移除'
  }
] as const

type RemovalBridge = {
  openA: () => Promise<unknown> | undefined
  openB: (readOnly?: boolean) => Promise<unknown> | undefined
  closeRecord: () => Promise<unknown> | undefined
  switchTenantB: () => void
  switchIdentityB: () => void
}

async function removalBridge(page: Page, action: keyof RemovalBridge, readOnly = false) {
  await page.evaluate(
    async ({ action, readOnly }) => {
      const bridge = window as Window & { __vmsAttachmentRemoval?: RemovalBridge }
      if (!bridge.__vmsAttachmentRemoval)
        throw new Error('VMS public-dialog fixture bridge unavailable')
      if (action === 'openB') await bridge.__vmsAttachmentRemoval.openB(readOnly)
      else if (action === 'openA') await bridge.__vmsAttachmentRemoval.openA()
      else if (action === 'closeRecord') await bridge.__vmsAttachmentRemoval.closeRecord()
      else if (action === 'switchTenantB') bridge.__vmsAttachmentRemoval.switchTenantB()
      else bridge.__vmsAttachmentRemoval.switchIdentityB()
    },
    { action, readOnly }
  )
}

async function prepareRemovalPage(page: Page) {
  const unexpectedWrites: string[] = []
  const externalAttempts: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue()
    externalAttempts.push(`${route.request().method()} ${url.pathname}`)
    return route.abort()
  })
  await prepareIsolatedSession(page)
  await page.route('**/storage/v1/**', (route) => {
    unexpectedWrites.push(`${route.request().method()} storage`)
    return route.abort()
  })
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const name = new URL(request.url()).pathname.split('/').at(-1) ?? ''
    if (request.method() === 'GET') {
      if (name === 'sys_tenant')
        return route.fulfill({
          json: [
            { id: tenantId, tenant_code: 'A', tenant_name: '测试租户' },
            { id: otherTenantId, tenant_code: 'B', tenant_name: '另一测试租户' }
          ]
        })
      return route.fallback()
    }
    if (request.method() !== 'POST' || !request.url().includes('/rpc/')) {
      unexpectedWrites.push(`${request.method()} ${name}`)
      return route.fulfill({ status: 403, json: { code: 'UNEXPECTED_WRITE' } })
    }
    if (name === 'current_is_super') return route.fulfill({ json: true })
    if (name === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    if (name === 'tms_list_carrier_options_secure') return route.fulfill({ json: [] })
    if (name === 'vms_get_vehicle_archive_secure') {
      const payload = request.postDataJSON() as { p_id?: string } | null
      const id = payload?.p_id ?? ''
      const prefix = id === 'archive-1' ? 'A' : 'B'
      return route.fulfill({
        json: {
          id,
          tenant_id: tenantId,
          plate_no: prefix === 'A' ? '测A12345' : '测B67890',
          audit_status: 'draft',
          field_access: { documents: id.endsWith('readonly') ? 'read' : 'edit' },
          attachments: [
            { name: `${prefix}旧保单`, url: sharedUrl, file_type: 'pdf' },
            { name: `${prefix}新保单`, url: sharedUrl, file_type: 'pdf' }
          ]
        }
      })
    }
    if (name === 'vms_get_default_trailer_secure') return route.fulfill({ json: null })
    if (name === 'vms_list_certificate_responsible_options_secure')
      return route.fulfill({ json: [] })
    if (name.startsWith('vms_list_'))
      return route.fulfill({ json: { records: [], total: 0, fieldAccess: {} } })
    if (name.startsWith('vms_get_')) return route.fulfill({ json: null })
    unexpectedWrites.push(`POST ${name}`)
    return route.fulfill({ status: 403, json: { code: 'UNEXPECTED_RPC' } })
  })
  return { unexpectedWrites, externalAttempts, pageErrors }
}

async function openRemovalScenario(page: Page, key: (typeof removalScenarios)[number]['key']) {
  await page.goto(`/tests/e2e/fixtures/vms-attachment-collection.html?scenario=${key}-remove`, {
    waitUntil: 'domcontentloaded'
  })
  await removalBridge(page, 'openA')
  if (key === 'archive') await page.getByRole('tab', { name: '其他信息' }).click()
}

for (const scenario of removalScenarios) {
  test(`${scenario.key} 附件取消、Esc 关闭与确认只解绑当前行`, async ({ page }, info) => {
    if (scenario.key === 'archive') test.setTimeout(180_000)
    const evidence = await prepareRemovalPage(page)
    await openRemovalScenario(page, scenario.key)
    const scope =
      scenario.key === 'archive'
        ? page.locator('.vehicle-archive-edit')
        : page.getByRole('dialog', { name: scenario.dialog })
    const oldRow = scope.getByRole('row').filter({ hasText: 'A旧保单' })
    const targetRow = scope.getByRole('row').filter({ hasText: 'A新保单' })
    await expect(oldRow).toBeVisible()
    await expect(targetRow).toBeVisible()
    for (const close of ['取消', 'Escape', scenario.accept] as const) {
      await targetRow.getByRole('button', { name: scenario.remove }).click()
      const confirmation = page.getByRole('dialog', { name: scenario.confirm })
      await expect(confirmation).toBeVisible()
      if (close === 'Escape') await page.keyboard.press('Escape')
      else await confirmation.getByRole('button', { name: close }).click()
      await expect(confirmation).toBeHidden()
      await expect(oldRow).toBeVisible()
      await expect(targetRow).toHaveCount(close === scenario.accept ? 0 : 1)
    }
    expect(evidence.unexpectedWrites).toEqual([])
    expect(evidence.externalAttempts).toEqual([])
    expect(evidence.pageErrors).toEqual([])
    await scope.screenshot({ path: info.outputPath(`${scenario.key}-one-draft-row-removed.png`) })
  })

  test(`${scenario.key} 旧 A 确认不得删除同 URL 新 B 记录附件`, async ({ page }, info) => {
    if (scenario.key === 'archive') test.setTimeout(180_000)
    const evidence = await prepareRemovalPage(page)
    await openRemovalScenario(page, scenario.key)
    const scope =
      scenario.key === 'archive'
        ? page.locator('.vehicle-archive-edit')
        : page.getByRole('dialog', { name: scenario.dialog })
    await scope
      .getByRole('row')
      .filter({ hasText: 'A新保单' })
      .getByRole('button', { name: scenario.remove })
      .click()
    const confirmation = page.getByRole('dialog', { name: scenario.confirm })
    await expect(confirmation).toBeVisible()
    await removalBridge(page, 'openB')
    if (scenario.key === 'archive') {
      await expect(
        scope
          .locator('.el-form-item')
          .filter({ has: page.getByText('车牌号', { exact: true }) })
          .locator('input')
      ).toHaveValue('测B67890')
      await expect(confirmation).toBeVisible()
      await scope.screenshot({ path: info.outputPath('archive-b-before-old-confirm.png') })
      await confirmation.getByRole('button', { name: scenario.accept }).click()
      await expect(confirmation).toBeHidden()
      await page.getByRole('tab', { name: '其他信息' }).click()
    }
    await expect(scope.getByRole('row').filter({ hasText: 'B旧保单' })).toBeVisible()
    await expect(scope.getByRole('row').filter({ hasText: 'B新保单' })).toBeVisible()
    if (scenario.key !== 'archive')
      await confirmation.getByRole('button', { name: scenario.accept }).click()
    await expect(scope.getByRole('row').filter({ hasText: 'B旧保单' })).toBeVisible()
    await expect(scope.getByRole('row').filter({ hasText: 'B新保单' })).toBeVisible()
    await expect(scope.getByRole('row').filter({ hasText: 'A新保单' })).toHaveCount(0)
    expect(evidence.unexpectedWrites).toEqual([])
    expect(evidence.externalAttempts).toEqual([])
    expect(evidence.pageErrors).toEqual([])
    await scope.screenshot({ path: info.outputPath(`${scenario.key}-new-b-preserved.png`) })
  })
}

for (const scenario of [
  { key: 'insurance', action: 'switchTenantB', dialog: '编辑车辆保险', remove: '移除附件' },
  { key: 'accident', action: 'switchIdentityB', dialog: '编辑事故记录', remove: '删除附件' }
] as const) {
  test(`${scenario.key} 确认期间切换租户或身份，原草稿附件保持`, async ({ page }, info) => {
    const evidence = await prepareRemovalPage(page)
    await openRemovalScenario(page, scenario.key)
    const dialog = page.getByRole('dialog', { name: scenario.dialog })
    const target = dialog.getByRole('row').filter({ hasText: 'A新保单' })
    await target.getByRole('button', { name: scenario.remove }).click()
    const confirmation = page.getByRole('dialog', { name: '删除确认' })
    await expect(confirmation).toBeVisible()
    await removalBridge(page, scenario.action)
    await confirmation.getByRole('button', { name: '删除' }).click()
    await expect(target).toBeVisible()
    await expect(dialog.getByRole('row').filter({ hasText: 'A旧保单' })).toBeVisible()
    expect(evidence.unexpectedWrites).toEqual([])
    expect(evidence.externalAttempts).toEqual([])
    expect(evidence.pageErrors).toEqual([])
    await dialog.screenshot({
      path: info.outputPath(`${scenario.key}-context-change-preserved.png`)
    })
  })
}

test('维修附件确认期间收紧 B 记录编辑权限，不删除 B 同 URL 附件', async ({ page }, info) => {
  const evidence = await prepareRemovalPage(page)
  await openRemovalScenario(page, 'maintenance')
  const dialog = page.getByRole('dialog', { name: '编辑维修保养记录' })
  await dialog
    .getByRole('row')
    .filter({ hasText: 'A新保单' })
    .getByRole('button', { name: '删除附件' })
    .click()
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await expect(confirmation).toBeVisible()
  await removalBridge(page, 'openB', true)
  const target = dialog.getByRole('row').filter({ hasText: 'B新保单' })
  await expect(target).toBeVisible()
  await expect(target.getByRole('button', { name: '删除附件' })).toHaveCount(0)
  await confirmation.getByRole('button', { name: '删除' }).click()
  await expect(target).toBeVisible()
  await expect(dialog.getByRole('row').filter({ hasText: 'B旧保单' })).toBeVisible()
  expect(evidence.unexpectedWrites).toEqual([])
  expect(evidence.externalAttempts).toEqual([])
  expect(evidence.pageErrors).toEqual([])
  await dialog.screenshot({ path: info.outputPath('maintenance-readonly-b-preserved.png') })
})

test('共享草稿附件 hook 的适配器异常只提示友好中文且不改变原行', async ({ page }) => {
  const evidence = await prepareRemovalPage(page)
  await page.goto('/tests/e2e/fixtures/vms-attachment-collection.html?scenario=hook-error')
  await expect(page.getByText('异常旧保单', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '删除测试附件' }).click()
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await confirmation.getByRole('button', { name: '删除' }).click()
  await expect(confirmation).toBeHidden()
  await expect(page.locator('.el-message--error')).toHaveCount(1)
  await expect(page.locator('.el-message--error')).toContainText('附件移除失败，请重试')
  await expect(page.getByText('TECHNICAL_SQLSTATE_INTERNAL_ATTACHMENT_FAILURE')).toHaveCount(0)
  await expect(page.getByText('异常旧保单', { exact: true })).toBeVisible()
  expect(evidence.unexpectedWrites).toEqual([])
  expect(evidence.externalAttempts).toEqual([])
  expect(evidence.pageErrors).toEqual([])
})

test('共享 hook 同一记录与同一附件数组切车后拒绝旧确认', async ({ page }) => {
  const evidence = await prepareRemovalPage(page)
  await page.goto('/tests/e2e/fixtures/vms-attachment-collection.html?scenario=hook-context')
  await expect(page.getByText('上下文旧保单', { exact: true })).toBeVisible()
  await expect(page.getByText('上下文新保单', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '删除上下文附件' }).click()
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await expect(confirmation).toBeVisible()
  await page.evaluate(() => {
    const bridge = window as Window & { __vmsHookContext?: { switchVehicle: () => void } }
    if (!bridge.__vmsHookContext) throw new Error('Public hook context fixture unavailable')
    bridge.__vmsHookContext.switchVehicle()
  })
  await confirmation.getByRole('button', { name: '删除' }).click()
  await expect(page.getByText('上下文新保单', { exact: true })).toBeVisible()
  await expect(page.getByText('上下文旧保单', { exact: true })).toBeVisible()
  expect(evidence.unexpectedWrites).toEqual([])
  expect(evidence.externalAttempts).toEqual([])
  expect(evidence.pageErrors).toEqual([])
})
