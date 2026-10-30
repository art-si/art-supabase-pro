import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(150_000)

const tenantA = '11111111-1111-4111-8111-111111111111'
const sharedUrl = 'https://example.invalid/shared-contract.pdf'
const contract = (id: string) => {
  const prefix = id === 'contract-a' ? 'A' : 'B'
  return {
    id,
    tenantId: tenantA,
    contractNo: `CONTRACT-${prefix}`,
    contractName: `${prefix} 运输合同`,
    contractStatus: 'draft',
    contractCategory: 'transport',
    transportMode: 'road',
    businessContractType: 'customer',
    billingMethod: 'monthly',
    signTime: '2026-10-30',
    isCompleted: false,
    handler: '测试经办人',
    transportDetails: [],
    attachments: [
      { name: `${prefix}旧合同附件`, url: sharedUrl, fileType: 'pdf' },
      { name: `${prefix}新合同附件`, url: sharedUrl, fileType: 'pdf' }
    ],
    fieldAccess: { attachments: id.endsWith('readonly') ? 'read' : 'edit' },
    isRecordOwner: !id.endsWith('readonly')
  }
}

async function prepareContractPage(page: Page) {
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
    if (request.method() === 'GET') return route.fallback()
    if (request.method() !== 'POST' || !request.url().includes('/rpc/')) {
      unexpectedWrites.push(`${request.method()} ${name}`)
      return route.fulfill({ status: 403, json: { code: 'UNEXPECTED_WRITE' } })
    }
    if (name === 'current_is_super') return route.fulfill({ json: true })
    if (name === 'get_table_column_runtime')
      return route.fulfill({ json: { enabled: false, profiles: [] } })
    if (name === 'tms_get_contract_secure') {
      const payload = request.postDataJSON() as { p_id?: string } | null
      return route.fulfill({ json: contract(payload?.p_id ?? '') })
    }
    if (name.startsWith('tms_list_')) return route.fulfill({ json: { records: [], total: 0 } })
    unexpectedWrites.push(`POST ${name}`)
    return route.fulfill({ status: 403, json: { code: 'UNEXPECTED_RPC' } })
  })
  await page.goto('/tests/e2e/fixtures/tms-contract-attachment-removal.html', {
    waitUntil: 'domcontentloaded'
  })
  return { unexpectedWrites, externalAttempts, pageErrors }
}

async function contractBridge(
  page: Page,
  action: 'openA' | 'openB' | 'switchTenantB',
  readOnly = false
) {
  await page.evaluate(
    async ({ action, readOnly }) => {
      const bridge = window as Window & {
        __tmsContractAttachmentTest?: {
          openA: () => Promise<void> | undefined
          openB: (readOnly?: boolean) => Promise<void> | undefined
          switchTenantB: () => void
        }
      }
      if (!bridge.__tmsContractAttachmentTest)
        throw new Error('TMS contract fixture bridge unavailable')
      if (action === 'openA') await bridge.__tmsContractAttachmentTest.openA()
      else if (action === 'openB') await bridge.__tmsContractAttachmentTest.openB(readOnly)
      else bridge.__tmsContractAttachmentTest.switchTenantB()
    },
    { action, readOnly }
  )
}

test('合同附件取消、Esc 关闭、确认只解绑目标草稿行', async ({ page }, info) => {
  const evidence = await prepareContractPage(page)
  await contractBridge(page, 'openA')
  const dialog = page.getByRole('dialog', { name: '编辑合同' })
  const oldRow = dialog.getByRole('row').filter({ hasText: 'A旧合同附件' })
  const targetRow = dialog.getByRole('row').filter({ hasText: 'A新合同附件' })
  await expect(oldRow).toBeVisible()
  await expect(targetRow).toBeVisible()
  for (const action of ['取消', 'Escape', '删除'] as const) {
    await targetRow.getByRole('button', { name: '移除附件' }).click()
    const confirmation = page.getByRole('dialog', { name: '删除确认' })
    await expect(confirmation).toBeVisible()
    if (action === 'Escape') await page.keyboard.press('Escape')
    else await confirmation.getByRole('button', { name: action }).click()
    await expect(confirmation).toBeHidden()
    await expect(oldRow).toBeVisible()
    await expect(targetRow).toHaveCount(action === '删除' ? 0 : 1)
  }
  expect(evidence.unexpectedWrites).toEqual([])
  expect(evidence.externalAttempts).toEqual([])
  expect(evidence.pageErrors).toEqual([])
  await dialog.screenshot({ path: info.outputPath('contract-one-draft-row-removed.png') })
})

test('合同 A 确认期间重开同 URL 合同 B，旧确认不得删除 B 附件', async ({ page }, info) => {
  const evidence = await prepareContractPage(page)
  await contractBridge(page, 'openA')
  const dialog = page.getByRole('dialog', { name: '编辑合同' })
  await dialog
    .getByRole('row')
    .filter({ hasText: 'A新合同附件' })
    .getByRole('button', { name: '移除附件' })
    .click()
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await expect(confirmation).toBeVisible()
  await contractBridge(page, 'openB')
  await expect(dialog.getByRole('row').filter({ hasText: 'B旧合同附件' })).toBeVisible()
  await expect(dialog.getByRole('row').filter({ hasText: 'B新合同附件' })).toBeVisible()
  await confirmation.getByRole('button', { name: '删除' }).click()
  await expect(dialog.getByRole('row').filter({ hasText: 'B新合同附件' })).toBeVisible()
  await expect(dialog.getByRole('row').filter({ hasText: 'B旧合同附件' })).toBeVisible()
  expect(evidence.unexpectedWrites).toEqual([])
  expect(evidence.externalAttempts).toEqual([])
  expect(evidence.pageErrors).toEqual([])
  await dialog.screenshot({ path: info.outputPath('contract-new-b-preserved.png') })
})

test('合同确认期间切租户与打开只读 B，旧确认不更改 B 附件', async ({ page }, info) => {
  const evidence = await prepareContractPage(page)
  await contractBridge(page, 'openA')
  const dialog = page.getByRole('dialog', { name: '编辑合同' })
  await dialog
    .getByRole('row')
    .filter({ hasText: 'A新合同附件' })
    .getByRole('button', { name: '移除附件' })
    .click()
  const confirmation = page.getByRole('dialog', { name: '删除确认' })
  await expect(confirmation).toBeVisible()
  await contractBridge(page, 'switchTenantB')
  await contractBridge(page, 'openB', true)
  const target = dialog.getByRole('row').filter({ hasText: 'B新合同附件' })
  await expect(target).toBeVisible()
  await expect(target.getByRole('button', { name: '移除附件' })).toHaveCount(0)
  await confirmation.getByRole('button', { name: '删除' }).click()
  await expect(target).toBeVisible()
  expect(evidence.unexpectedWrites).toEqual([])
  expect(evidence.externalAttempts).toEqual([])
  expect(evidence.pageErrors).toEqual([])
  await dialog.screenshot({ path: info.outputPath('contract-readonly-b-preserved.png') })
})
