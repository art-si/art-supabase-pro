import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

const tenantId = '11111111-1111-4111-8111-111111111111'

async function mockParents(page: Page, kind: 'customer' | 'carrier') {
  const writes: Record<string, unknown>[] = []
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/**', (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    if (name === `tms_update_${kind}${kind === 'carrier' ? '_multi' : ''}_secure`) {
      writes.push(route.request().postDataJSON().p_payload)
      return route.fulfill({ json: {} })
    }
    if (name === 'mdm_carrier') {
      const url = new URL(route.request().url())
      if (url.searchParams.get('select') === 'tenant_id')
        return route.fulfill({ json: { tenant_id: tenantId } })
      expect(url.searchParams.get('tenant_id')).toBe(`eq.${tenantId}`)
      return route.fulfill({
        json: ['root', 'child', 'carrier-1', 'descendant'].map((id) => ({ id }))
      })
    }
    if (name === `tms_list_${kind === 'customer' ? 'customers' : 'carriers'}_secure`) {
      const makeRow = (id: string, parentId: string | null, title: string, code: string) => ({
        id,
        parent_unit_id: parentId,
        ...(kind === 'customer' ? { tenant_id: tenantId } : {}),
        [kind === 'customer' ? 'customer_name' : 'company_name']: title,
        [kind === 'customer' ? 'customer_code' : 'carrier_code']: code,
        enabled: true
      })
      const records = [
        makeRow('root', null, '集团单位', 'ROOT'),
        makeRow('child', 'root', '可选单位', 'CHILD'),
        makeRow(`${kind}-1`, 'root', '当前单位', 'SELF'),
        makeRow('descendant', `${kind}-1`, '当前单位下级', 'DESCENDANT'),
        {
          ...makeRow('foreign', null, '其他租户单位', 'FOREIGN'),
          ...(kind === 'customer' ? { tenant_id: 'foreign-tenant' } : {})
        }
      ]
      return route.fulfill({ json: { records, total: records.length } })
    }
    return route.fulfill({ json: [] })
  })
  return writes
}

for (const kind of ['customer', 'carrier'] as const) {
  test(`${kind}上级单位保留层级并排除自身、后代及其他租户`, async ({ page }, info) => {
    const writes = await mockParents(page, kind)
    await page.goto('/tests/e2e/fixtures/tms-customer-coordinate-write.html', {
      waitUntil: 'domcontentloaded'
    })
    await page
      .getByRole('button', {
        name: kind === 'customer' ? '打开客户 negative' : '打开承运商',
        exact: true
      })
      .click()
    const dialog = page.getByRole('dialog', {
      name: kind === 'customer' ? '编辑客户' : '编辑承运商'
    })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.art-form .art-async-state__skeleton')).toHaveCount(0, {
      timeout: 120_000
    })
    const parent = dialog
      .locator('.el-form-item')
      .filter({ hasText: '上级单位' })
      .locator('.el-select')
    await parent.click()
    const tree = page.locator('.el-select__popper:visible .el-tree')
    await expect(tree.getByText('集团单位（ROOT）', { exact: true })).toBeVisible()
    await expect(tree.getByText('可选单位（CHILD）', { exact: true })).toBeHidden()
    await tree
      .locator('.el-tree-node[data-key="root"] > .el-tree-node__content .el-tree-node__expand-icon')
      .click()
    await expect(tree.getByText('可选单位（CHILD）', { exact: true })).toBeVisible()
    await expect(tree.getByText('当前单位（SELF）', { exact: true })).toHaveCount(0)
    await expect(tree.getByText('当前单位下级（DESCENDANT）', { exact: true })).toHaveCount(0)
    await expect(tree.getByText('其他租户单位（FOREIGN）', { exact: true })).toHaveCount(0)
    await dialog.screenshot({ path: info.outputPath(`${kind}-parent-unit-tree.png`) })
    await tree.getByText('可选单位（CHILD）', { exact: true }).click()
    await expect(parent).toContainText('可选单位（CHILD）')
    await dialog.getByRole('button', { name: '确定', exact: true }).click()
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0].parent_unit_id).toBe('child')
    await expect(dialog).toBeHidden()
  })
}

test('全部租户中新建承运商的上级选项跟随默认写入租户', async ({ page }) => {
  await mockParents(page, 'carrier')
  await page.goto('/tests/e2e/fixtures/tms-customer-coordinate-write.html?scope=all', {
    waitUntil: 'domcontentloaded'
  })
  await page.getByRole('button', { name: '新增承运商', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '新增承运商' })
  await expect(dialog.locator('.art-form .art-async-state__skeleton')).toHaveCount(0, {
    timeout: 120_000
  })
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '上级单位' })
    .locator('.el-select')
    .click()
  const tree = page.locator('.el-select__popper:visible .el-tree')
  await expect(tree.getByText('集团单位（ROOT）', { exact: true })).toBeVisible()
  await expect(tree.getByText('其他租户单位（FOREIGN）', { exact: true })).toHaveCount(0)
})
