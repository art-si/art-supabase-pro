import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { assertAppearance, prepareAppearance } from './support/appearance'
import { installDictionaryOptions } from './support/dictionary-options'
import { expectStackedFormErrorFlow } from './support/form-error-layout'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const tenantId = 'test-tenant'
const cases = [
  {
    key: 'bom-group',
    path: '/tests/e2e/fixtures/engineering-dictionary-options.html?mode=bom-group&shadowAudit=1&errorAudit=1',
    open: '打开表单',
    title: '新增 BOM 分组',
    code: '分组编码',
    name: '分组名称',
    error: '编码须以字母开头，且只能包含字母、数字、下划线和短横线',
    draft: '验收 BOM 分组草稿'
  },
  {
    key: 'business-type',
    path: '/tests/e2e/fixtures/business-type-options.html?errorAudit=1',
    open: '新增业务类型',
    title: '新增业务类型',
    code: '业务类型编号',
    name: '业务类型名称',
    error: '编号仅支持字母、数字、下划线和短横线，并需以字母或数字开头',
    draft: '验收业务类型草稿'
  }
] as const

async function mockReads(page: Page) {
  const writes: string[] = []
  const unexpectedReads: string[] = []
  const reads: Array<{ path: string; tenant: string | null }> = []
  const allowedTables = new Set(['sys_dictionary', 'sys_param', 'sys_user', 'sys_tenant'])
  const allowedReadRpcs = new Set([
    'current_is_super',
    'get_organization_list_secure',
    'material_unit_compatibility_options'
  ])
  await page.route('**/rest/v1/**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const name = url.pathname.split('/').at(-1) ?? ''
    if (url.pathname.includes('/rpc/') && allowedReadRpcs.has(name)) {
      return route.fulfill({ json: name === 'current_is_super' ? false : [] })
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      writes.push(`${request.method()} ${url.pathname}`)
      return route.fulfill({
        status: 403,
        json: { code: '42501', message: '隔离验收禁止业务写入' }
      })
    }
    if (['mdm_document_type', 'mdm_business_type'].includes(name)) {
      reads.push({ path: name, tenant: url.searchParams.get('tenant_id') })
      return route.fulfill({ json: [] })
    }
    if (allowedTables.has(name)) return route.fulfill({ json: [] })
    unexpectedReads.push(`${request.method()} ${url.pathname}`)
    return route.fulfill({
      status: 403,
      json: { code: '42501', message: '隔离验收未授权该读取' }
    })
  })
  await installDictionaryOptions(page, {
    commonBoolean: [
      { value: 'true', label: '是' },
      { value: 'false', label: '否' }
    ],
    mdmBusinessInventoryDirection: [],
    mdmStockMovementDirection: [],
    mdmBusinessOwnerType: []
  })
  return { writes, unexpectedReads, reads }
}

for (const scenario of cases)
  for (const width of [390, 320])
    for (const theme of ['light', 'dark'] as const)
      test(`MDM 顶部标签长校验 ${scenario.key} ${width}/${theme} 完整避让后续字段`, async ({
        page
      }, info) => {
        await prepareIsolatedSession(page, { tenantId, platformSuper: false })
        const appearance = { theme, boxBorderMode: theme === 'light' }
        await prepareAppearance(page, appearance)
        await page.setViewportSize({ width, height: 844 })
        const failures: string[] = []
        page.on('pageerror', (error) => failures.push(error.message))
        const { writes, unexpectedReads, reads } = await mockReads(page)
        await page.goto(scenario.path, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await assertAppearance(page, appearance)
        await page.getByRole('button', { name: scenario.open, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: scenario.title, exact: true })
        const code = dialog.getByRole('textbox', { name: new RegExp(scenario.code) })
        const name = dialog.getByRole('textbox', { name: new RegExp(scenario.name) })
        await expect(code).toBeVisible({ timeout: 60_000 })
        await expect(dialog.locator('.art-dialog__viewport')).toHaveAttribute('aria-busy', 'false')
        const actor = await page.evaluate(async () => {
          const { useUserStore }: typeof import('../../src/store/modules/user') = await import(
            new URL('/src/store/modules/user.ts', location.origin).href
          )
          const user = useUserStore()
          return { tenantId: user.getUserInfo.tenantId, platformSuper: user.isPlatformSuper }
        })
        expect(actor).toEqual({ tenantId, platformSuper: false })
        const codeField = code.locator(
          'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " el-form-item ")][1]'
        )
        const nameField = name.locator(
          'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " el-form-item ")][1]'
        )
        await expect(codeField).toHaveClass(/el-form-item--label-top/)
        await name.fill(scenario.draft)
        await code.fill('@INVALID')
        await code.press('Tab')
        await expect(codeField.locator('.el-form-item__error')).toHaveText(scenario.error)
        await codeField.scrollIntoViewIfNeeded()
        await dialog.screenshot({
          path: info.outputPath(`${scenario.key}-${width}-${theme}-invalid.png`),
          animations: 'disabled'
        })
        const metrics = await expectStackedFormErrorFlow(codeField, nameField)
        await info.attach('real-pattern-error-layout', {
          body: JSON.stringify({ actor, metrics, reads }, null, 2),
          contentType: 'application/json'
        })
        await expect(name).toHaveValue(scenario.draft)
        await code.fill('QA_VALID_CODE')
        await code.press('Tab')
        await expect(codeField.locator('.el-form-item__error')).toHaveCount(0)
        await expect(name).toHaveValue(scenario.draft)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        ).toBeLessThanOrEqual(1)
        expect(reads.every((read) => read.tenant === `eq.${tenantId}`)).toBe(true)
        expect(writes).toEqual([])
        expect(unexpectedReads).toEqual([])
        expect(failures).toEqual([])
        await dialog.screenshot({
          path: info.outputPath(`${scenario.key}-${width}-${theme}-corrected.png`),
          animations: 'disabled'
        })
      })
