import { expect, test, type Page } from '@playwright/test'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'
import { prepareAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(90_000)

const fixture = '/tests/e2e/fixtures/master-delete-context.html'
const tenantB = '22222222-2222-4222-8222-222222222222'

async function prepare(page: Page, projectName: string) {
  await prepareIsolatedSession(page)
  const dark = projectName.includes('dark')
  await prepareAppearance(page, {
    theme: dark ? 'dark' : 'light',
    boxBorderMode: !projectName.includes('shadow')
  })
  const unexpectedRest: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    unexpectedRest.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
    return route.abort()
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveClass(dark ? /\bdark\b/ : /^(?!.*\bdark\b)/)
  await installActionFeedbackHistory(page)
  await expect(page.getByTestId('guard-route')).toHaveText('/a')
  return unexpectedRest
}

async function externalButton(page: Page, name: string) {
  await page
    .getByRole('button', { name, exact: true })
    .evaluate((button: HTMLButtonElement) => button.click())
}

for (const context of ['路由', '租户', '用户'] as const) {
  for (const outcome of ['blocked', 'error', 'empty'] as const) {
    test(`公共删除检查 ${context}切换后旧${outcome}结果失败关闭`, async ({ page }, info) => {
      const unexpectedRest = await prepare(page, info.project.name)
      await page.getByRole('button', { name: `检查 A ${outcome}` }).click()
      await expect(page.getByTestId('guard-a-result')).toHaveText('pending')
      await externalButton(page, `切换${context} B`)
      if (context === '路由') await expect(page.getByTestId('guard-route')).toHaveText('/b')
      if (context === '租户') await expect(page.getByTestId('guard-tenant')).toHaveText(tenantB)
      if (context === '用户')
        await expect(page.getByTestId('guard-user')).toHaveText('guard-user-b')
      await externalButton(page, '释放 A')
      await expect(page.getByTestId('guard-a-result')).toHaveText('true')
      await expect(page.locator('.el-dialog:visible')).toHaveCount(0)
      expect(await readActionFeedbackHistory(page)).toEqual([])
      expect(unexpectedRest).toEqual([])
      await page.screenshot({ path: info.outputPath(`${context}-${outcome}-stale.png`) })
    })
  }
}

test('资源解析晚于租户切换时不读取旧依赖或打开旧弹窗', async ({ page }, info) => {
  const unexpectedRest = await prepare(page, info.project.name)
  await page.getByRole('button', { name: '检查 A resolve' }).click()
  await externalButton(page, '切换租户 B')
  await expect(page.getByTestId('guard-tenant')).toHaveText(tenantB)
  await externalButton(page, '释放 A')
  await expect(page.getByTestId('guard-a-result')).toHaveText('true')
  await expect(page.locator('.el-dialog:visible')).toHaveCount(0)
  expect(unexpectedRest).toEqual([])
})

test('B检查接管后晚到A结果不覆盖B', async ({ page }, info) => {
  const unexpectedRest = await prepare(page, info.project.name)
  await page.getByRole('button', { name: '检查 A blocked' }).click()
  await externalButton(page, '切换租户 B')
  await externalButton(page, '检查 B')
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toContainText('关联记录 B')
  await externalButton(page, '释放 A')
  await expect(page.getByTestId('guard-a-result')).toHaveText('true')
  await expect(dialog).toContainText('关联记录 B')
  await expect(dialog).not.toContainText('关联记录 A')
  expect(unexpectedRest).toEqual([])
})

test('清理确认期间切到B不派发旧A清理', async ({ page }, info) => {
  const unexpectedRest = await prepare(page, info.project.name)
  await page.getByRole('button', { name: '检查 A 清理' }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toContainText('关联记录 A')
  await dialog
    .locator('.el-checkbox')
    .filter({ has: page.getByRole('checkbox', { name: '选择清理 关联记录 A' }) })
    .click()
  await dialog.getByRole('button', { name: '清理选中项（1）' }).click()
  const confirmation = page.locator('.el-message-box:visible')
  await expect(confirmation).toBeVisible()
  await externalButton(page, '切换租户 B')
  await externalButton(page, '检查 B')
  await expect(dialog).toContainText('关联记录 B')
  await confirmation
    .getByRole('button', { name: '清理选中项', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click())
  await expect(confirmation).toBeHidden()
  await expect(dialog.getByRole('button', { name: '重新检查' })).toBeEnabled()
  await expect(page.getByTestId('guard-cleanup-calls')).toHaveText('0')
  await expect(dialog).toContainText('关联记录 B')
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(unexpectedRest).toEqual([])
})

test('A清理写入晚到不关闭或改写B检查', async ({ page }, info) => {
  const unexpectedRest = await prepare(page, info.project.name)
  await page.getByRole('button', { name: '检查 A 清理' }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toContainText('关联记录 A')
  await dialog
    .locator('.el-checkbox')
    .filter({ has: page.getByRole('checkbox', { name: '选择清理 关联记录 A' }) })
    .click()
  await dialog.getByRole('button', { name: '清理选中项（1）' }).click()
  await page
    .locator('.el-message-box:visible')
    .getByRole('button', { name: '清理选中项', exact: true })
    .click()
  await expect(page.getByTestId('guard-cleanup-calls')).toHaveText('1')
  await externalButton(page, '切换租户 B')
  await externalButton(page, '检查 B')
  await expect(dialog).toContainText('关联记录 B')
  await externalButton(page, '释放清理')
  await expect(dialog.getByRole('button', { name: '重新检查' })).toBeEnabled()
  await expect(dialog).toContainText('关联记录 B')
  await expect(page.getByTestId('guard-cleanup-selected')).toHaveText('record-A')
  await expect(page.getByTestId('guard-cleared')).toHaveText('0')
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(unexpectedRest).toEqual([])
})

test('清理按钮连续点击只产生一次确认与一次清理', async ({ page }, info) => {
  const unexpectedRest = await prepare(page, info.project.name)
  await page.getByRole('button', { name: '检查 A 清理' }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toContainText('关联记录 A')
  await dialog
    .locator('.el-checkbox')
    .filter({ has: page.getByRole('checkbox', { name: '选择清理 关联记录 A' }) })
    .click()
  await dialog
    .getByRole('button', { name: '清理选中项（1）' })
    .evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })
  const confirmation = page.locator('.el-message-box:visible')
  await expect(confirmation).toHaveCount(1)
  await confirmation.getByRole('button', { name: '清理选中项', exact: true }).click()
  await expect(page.getByTestId('guard-cleanup-calls')).toHaveText('1')
  await externalButton(page, '释放清理')
  await expect(dialog.getByRole('button', { name: '重新检查' })).toBeEnabled()
  await expect(page.getByTestId('guard-cleanup-calls')).toHaveText('1')
  expect(unexpectedRest).toEqual([])
})

test('内置清理确认期间切B不把旧记录配上B资源发RPC', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const dark = info.project.name.includes('dark')
  await prepareAppearance(page, {
    theme: dark ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  const writes: Record<string, unknown>[] = []
  const unexpectedRest: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'get_governed_delete_dependency_details')
      return route.fulfill({
        json: [
          {
            resource_id: 'role-A',
            dependency_code: 'role_menu_grant',
            record_id: 'grant-A',
            target_id: 'grant-A',
            record_no: '授权 A',
            record_status: '草稿',
            created_at: '2026-11-03T00:00:00Z',
            cleanup_allowed: true
          }
        ]
      })
    if (endpoint === 'cleanup_governed_delete_dependencies') {
      writes.push(route.request().postDataJSON() as Record<string, unknown>)
      return route.fulfill({ json: 1 })
    }
    unexpectedRest.push(`${route.request().method()} ${endpoint}`)
    return route.abort()
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveClass(dark ? /\bdark\b/ : /^(?!.*\bdark\b)/)
  await installActionFeedbackHistory(page)
  await page.getByRole('button', { name: '检查 A 内置清理' }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toContainText('授权 A')
  await dialog
    .locator('.el-checkbox')
    .filter({ has: page.getByRole('checkbox', { name: '选择清理 授权 A' }) })
    .click()
  await dialog.getByRole('button', { name: '清理选中项（1）' }).click()
  const confirmation = page.locator('.el-message-box:visible')
  await expect(confirmation).toBeVisible()
  await externalButton(page, '切换租户 B')
  await externalButton(page, '检查 B')
  await expect(dialog).toContainText('关联记录 B')
  await confirmation
    .getByRole('button', { name: '确认清理 1 项' })
    .evaluate((button: HTMLButtonElement) => button.click())
  await expect(confirmation).toBeHidden()
  await expect(dialog).toContainText('关联记录 B')
  expect(writes).toEqual([])
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(unexpectedRest).toEqual([])
})

test('内置清理23503当前态只由本地守卫反馈且不发全局引用事件', async ({ page }, info) => {
  await prepareIsolatedSession(page)
  const dark = info.project.name.includes('dark')
  await prepareAppearance(page, {
    theme: dark ? 'dark' : 'light',
    boxBorderMode: !info.project.name.includes('shadow')
  })
  let reads = 0
  const writes: Record<string, unknown>[] = []
  const unexpectedRest: string[] = []
  await page.route('**/rest/v1/**', (route) => {
    const endpoint = new URL(route.request().url()).pathname.split('/').at(-1)
    if (endpoint === 'get_governed_delete_dependency_details') {
      reads += 1
      return route.fulfill({
        json: [
          {
            resource_id: 'role-A',
            dependency_code: 'role_menu_grant',
            record_id: 'grant-A',
            target_id: 'grant-A',
            record_no: '授权 A',
            record_status: '草稿',
            created_at: '2026-11-03T00:00:00Z',
            cleanup_allowed: true
          }
        ]
      })
    }
    if (endpoint === 'cleanup_governed_delete_dependencies') {
      writes.push(route.request().postDataJSON() as Record<string, unknown>)
      return route.fulfill({
        status: 409,
        json: {
          code: '23503',
          message:
            'update or delete on table "sys_role" violates foreign key constraint "sys_role_menu_role_id_fkey" on table "sys_role_menu"',
          details: 'Key (id)=(role-A) is still referenced from table "sys_role_menu".'
        }
      })
    }
    unexpectedRest.push(`${route.request().method()} ${endpoint}`)
    return route.abort()
  })
  await page.goto(fixture, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('html')).toHaveClass(dark ? /\bdark\b/ : /^(?!.*\bdark\b)/)
  await installActionFeedbackHistory(page)
  await page.getByRole('button', { name: '检查 A 内置清理' }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toContainText('授权 A')
  await dialog
    .locator('.el-checkbox')
    .filter({ has: page.getByRole('checkbox', { name: '选择清理 授权 A' }) })
    .click()
  await dialog.getByRole('button', { name: '清理选中项（1）' }).click()
  await page
    .locator('.el-message-box:visible')
    .getByRole('button', { name: '确认清理 1 项' })
    .click()
  await expect.poll(() => writes.length).toBe(1)
  await expect.poll(() => reads).toBe(2)
  await expect(dialog).toContainText('授权 A')
  await expect(page.getByTestId('guard-global-reference-events')).toHaveText('0')
  await expect
    .poll(
      async () =>
        (await readActionFeedbackHistory(page)).filter((item) => item.kind === 'error').length
    )
    .toBe(1)
  expect(unexpectedRest).toEqual([])
  await page.screenshot({ path: info.outputPath('governed-23503-local-only.png') })
})

test('旧关联导航解析晚到不跳转且不关闭B', async ({ page }, info) => {
  const unexpectedRest = await prepare(page, info.project.name)
  await page.getByRole('button', { name: '检查 A 导航' }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toContainText('关联记录 A')
  await dialog.getByRole('button', { name: '查看记录' }).click()
  await externalButton(page, '切换路由 B')
  await externalButton(page, '检查 B')
  await expect(dialog).toContainText('关联记录 B')
  await externalButton(page, '释放导航')
  await expect(dialog.getByRole('button', { name: '查看记录' })).toBeEnabled()
  await expect(page.getByTestId('guard-route')).toHaveText('/b')
  await expect(dialog).toContainText('关联记录 B')
  expect(unexpectedRest).toEqual([])
})

test('不可删单据关闭中B接管不跳A目标或提示旧导航错误', async ({ page }, info) => {
  const unexpectedRest = await prepare(page, info.project.name)
  await page.getByRole('button', { name: '检查 A 不可删单据' }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toContainText('客户 A')
  await dialog.getByRole('button', { name: '查看单据' }).evaluate((button: HTMLButtonElement) => {
    button.click()
    const openB = document.querySelector<HTMLButtonElement>('[data-testid="guard-open-b"]')
    if (!openB) throw new Error('B 公开入口缺失')
    openB.click()
  })
  await expect(page.getByTestId('guard-b-result')).toHaveText('true')
  await expect(page.getByTestId('guard-route')).toHaveText('/a')
  await expect(dialog).toContainText('关联记录 B')
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(unexpectedRest).toEqual([])
  await page.screenshot({ path: info.outputPath('blocked-navigation-b-preserved.png') })
})

test('不可删单据旧导航拒绝晚于B接管时不把错误提示给B', async ({ page }, info) => {
  const unexpectedRest = await prepare(page, info.project.name)
  await page.getByRole('button', { name: '检查 A 旧导航失败' }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toContainText('客户 A')
  await dialog.getByRole('button', { name: '查看单据' }).click()
  await expect(page.getByTestId('guard-route-pending')).toHaveText('true')
  await externalButton(page, '检查 B')
  await expect(dialog).toContainText('关联记录 B')
  await externalButton(page, '释放路由拒绝')
  await expect(page.getByTestId('guard-route-pending')).toHaveText('false')
  await expect(page.getByTestId('guard-route')).toHaveText('/a')
  await expect(dialog).toContainText('关联记录 B')
  expect(await readActionFeedbackHistory(page)).toEqual([])
  expect(unexpectedRest).toEqual([])
  await page.screenshot({ path: info.outputPath('blocked-navigation-old-error-suppressed.png') })
})

test('不可删单据正常导航仍到原目标', async ({ page }, info) => {
  const unexpectedRest = await prepare(page, info.project.name)
  await page.getByRole('button', { name: '检查 A 不可删单据' }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toContainText('客户 A')
  await dialog.getByRole('button', { name: '查看单据' }).click()
  await expect(page.getByTestId('guard-route')).toHaveText('/record?selected=A')
  await expect(dialog).toHaveCount(0)
  expect(unexpectedRest).toEqual([])
  await page.screenshot({ path: info.outputPath('blocked-navigation-normal.png') })
})

test('已解除引用重新检查正常关闭旧弹窗并提示再次删除', async ({ page }, info) => {
  const unexpectedRest = await prepare(page, info.project.name)
  await page.getByRole('button', { name: '检查 A 可解除' }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog).toContainText('关联记录 A')
  await externalButton(page, '解除 A 引用')
  await dialog.getByRole('button', { name: '重新检查' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('关联已解除，请再次点击删除', { exact: true })).toBeVisible()
  expect(unexpectedRest).toEqual([])
  await page.screenshot({ path: info.outputPath('retry-empty-normal-close.png') })
})
