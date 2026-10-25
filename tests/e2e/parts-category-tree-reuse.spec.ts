import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })

const rows = [
  { id: 'root', parent_id: null, category_name: '全部配件', category_code: 'ROOT' },
  { id: 'branch', parent_id: 'root', category_name: '待编辑类别', category_code: 'BRANCH' },
  { id: 'child', parent_id: 'branch', category_name: '下级类别', category_code: 'CHILD' },
  { id: 'sibling', parent_id: 'root', category_name: '其他类别', category_code: 'SIBLING' }
]

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-ckbftoopuyophiebamwy-auth-token',
      JSON.stringify({
        access_token: 'a.b.c',
        refresh_token: 'test-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: { id: '00000000-0000-4000-8000-000000000001', role: 'authenticated' }
      })
    )
  })
  await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
})

test('编辑类别排除自身和整个下级分支，保留其他父类别候选', async ({ page }, info) => {
  await page.route('**/rest/v1/mdm_part_category**', (route) => route.fulfill({ json: rows }))
  await page.goto('/tests/e2e/fixtures/parts-category-tree.html')
  await page.getByRole('button', { name: '编辑类别', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑零部件类别' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox', { name: '上级类别' }).click()
  const dropdown = page.locator('.el-select-dropdown:visible')
  await expect(dropdown.getByText('全部配件', { exact: true })).toBeVisible()
  await expect(dropdown.getByText('其他类别', { exact: true })).toBeVisible()
  await expect(dropdown.getByText('待编辑类别', { exact: true })).toHaveCount(0)
  await expect(dropdown.getByText('下级类别', { exact: true })).toHaveCount(0)
  await dropdown.getByText('其他类别', { exact: true }).click()
  await expect(
    dialog.locator('.el-select__selected-item').filter({ hasText: '其他类别' })
  ).toBeVisible()
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }))
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1)
  await page.screenshot({ path: info.outputPath('category-parent.png') })
})

test('类别选项沿用公共加载、空态和失败重试', async ({ page }, info) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let attempt = 0
  await page.route('**/rest/v1/mdm_part_category**', async (route) => {
    attempt += 1
    if (attempt === 1) {
      await gate
      await route.fulfill({ status: 403, json: { message: '测试读取被拒绝' } })
    } else await route.fulfill({ json: [] })
  })
  await page.goto('/tests/e2e/fixtures/parts-category-tree.html')
  await page.getByRole('button', { name: '新增类别' }).click()
  const dialog = page.getByRole('dialog', { name: '新增零部件类别' })
  const parent = dialog.getByRole('combobox', { name: '上级类别' })
  await expect(parent).toBeDisabled()
  await page.screenshot({ path: info.outputPath('category-loading.png') })
  release()
  await expect(dialog.getByText('选项加载失败', { exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath('category-error.png') })
  await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(parent).toBeEnabled()
  await parent.click()
  const dropdown = page.locator('.el-select-dropdown:visible')
  await expect(dropdown.getByText('暂无可选数据', { exact: true })).toBeVisible()
  expect(attempt).toBe(2)
  await page.screenshot({ path: info.outputPath('category-empty.png') })
})

test('公共分页完整读取超过 1000 条类别并保留末页子节点', async ({ page }) => {
  const ranges: number[] = []
  const all = Array.from({ length: 1001 }, (_, index) => ({
    id: String(index),
    parent_id: index ? '0' : null,
    category_name: `类别${index}`
  }))
  await page.route('**/rest/v1/mdm_part_category**', async (route) => {
    const url = new URL(route.request().url())
    const offset = Number(url.searchParams.get('offset') ?? 0)
    const limit = Number(url.searchParams.get('limit') ?? 500)
    ranges.push(offset)
    await route.fulfill({ json: all.slice(offset, offset + limit) })
  })
  await page.goto('/tests/e2e/fixtures/parts-category-tree.html')
  await page.getByRole('button', { name: '查询类别' }).click()
  await expect(page.getByTestId('category-result')).toContainText('类别1000')
  const result = JSON.parse(await page.getByTestId('category-result').innerText())
  expect(result.data).toHaveLength(1)
  expect(result.data[0].children).toHaveLength(1000)
  expect(ranges).toEqual([0, 500, 1000])
})

test('Java 类别接口保留嵌套层级而不丢失子节点', async ({ page }) => {
  await page.route('**/api/vms/basic-info/parts-categories/tree**', (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: [
          {
            id: 'root',
            categoryName: '根类别',
            children: [{ id: 'child', categoryName: '嵌套子类别' }]
          }
        ]
      }
    })
  )
  await page.goto('/tests/e2e/fixtures/parts-category-tree.html?java')
  await page.getByRole('button', { name: '查询类别' }).click()
  await expect(page.getByTestId('category-result')).toContainText('嵌套子类别')
  const result = JSON.parse(await page.getByTestId('category-result').innerText())
  expect(result.data[0].children[0].id).toBe('child')
})
