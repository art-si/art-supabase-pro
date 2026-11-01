import { expect, test, type Locator, type Page } from '@playwright/test'
import type { TableColumnLayout } from '../../src/types/table-virtual'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

async function open(page: Page, project: string, initialHidden = false, prototypeFields = false) {
  await prepareIsolatedSession(page)
  await page.route('**/functions/v1/**', (route) => route.fulfill({ json: {} }))
  const theme = project.includes('dark') ? 'dark' : 'light'
  await page.goto(
    `/tests/e2e/fixtures/table-column-layout.html?theme=${theme}${initialHidden ? '&initial-hidden' : ''}${prototypeFields ? '&prototype-fields' : ''}`
  )
}

async function readLayout(page: Page): Promise<TableColumnLayout | null> {
  return JSON.parse((await page.getByLabel('当前布局', { exact: true }).textContent()) || 'null')
}

async function assertActualLayout(page: Page, table: Locator, keys: string[]) {
  await expect
    .poll(async () => (await readLayout(page))?.columns.map(({ key }) => key))
    .toEqual(keys)
  await expect
    .poll(async () => {
      const layout = await readLayout(page)
      if (!layout) return false
      const actual = await table.evaluate((root) => ({
        width: root.getBoundingClientRect().width,
        columns: [...root.querySelectorAll<HTMLElement>('.el-table-v2__header-cell')].map(
          (header) => ({ key: header.dataset.key, width: header.getBoundingClientRect().width })
        )
      }))
      return (
        Math.abs(layout.viewportWidth - actual.width) <= 1 &&
        layout.columns.every(
          (column) =>
            Number.isFinite(column.width) &&
            column.width > 0 &&
            actual.columns.some(
              (header) => header.key === column.key && Math.abs(header.width - column.width) <= 1
            )
        )
      )
    })
    .toBe(true)
  return (await readLayout(page))!
}

test('virtual column-layout reports actual flex, resize, visibility and container geometry without row data', async ({
  page
}, info) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 1000, '弹性扩展与容器压缩在桌面宽度验证')
  await open(page, info.project.name)
  const table = page.getByLabel('虚拟布局区域', { exact: true }).locator('.art-table-v2')
  await expect(table).toBeVisible()
  const initial = await assertActualLayout(page, table, ['fixed', 'flex1', 'flex2', 'tail'])
  const grow = Math.max(0, (initial.viewportWidth - 600) / 2)
  expect(initial.columns[1].width).toBeCloseTo(180 + grow, 3)
  expect(initial.columns[2].width).toBeCloseTo(140 + grow, 3)
  expect(Object.keys(initial).sort()).toEqual(['columns', 'viewportWidth'])
  expect(
    initial.columns.every((column) => Object.keys(column).sort().join(',') === 'key,width')
  ).toBe(true)
  expect(JSON.stringify(initial)).not.toContain('row-secret')
  const beforeWidth = initial.columns[1].width
  const resize = table.getByRole('button', { name: '调整弹性字段一列宽', exact: true })
  await resize.focus()
  await resize.press('ArrowRight')
  await expect
    .poll(async () => (await readLayout(page))?.columns.find(({ key }) => key === 'flex1')?.width)
    .toBeCloseTo(beforeWidth + 16, 3)
  await assertActualLayout(page, table, ['fixed', 'flex1', 'flex2', 'tail'])
  await page.getByRole('button', { name: '切换字段可见', exact: true }).click()
  await assertActualLayout(page, table, ['fixed', 'flex2', 'tail'])
  await page.getByRole('button', { name: '调整字段顺序', exact: true }).click()
  await assertActualLayout(page, table, ['tail', 'flex2', 'fixed'])
  await page.getByRole('button', { name: '切换容器宽度', exact: true }).click()
  await expect
    .poll(async () => (await readLayout(page))?.viewportWidth)
    .toBeLessThan(initial.viewportWidth)
  await assertActualLayout(page, table, ['tail', 'flex2', 'fixed'])
  const eventCount = await page.getByLabel('虚拟布局事件数', { exact: true }).textContent()
  await page.getByRole('button', { name: '切换固定状态', exact: true }).click()
  await expect(table.locator('.el-table-v2__left')).toBeVisible()
  await page.getByRole('button', { name: '替换数据行', exact: true }).click()
  await expect(table).toContainText('row-secret-a-replaced')
  await expect(page.getByLabel('虚拟布局事件数', { exact: true })).toHaveText(eventCount || '')
  await page.getByRole('button', { name: '切换容器显示', exact: true }).click()
  await expect.poll(async () => (await readLayout(page))?.viewportWidth).toBe(0)
  await expect(page.getByLabel('零宽度已发送', { exact: true })).toHaveText('true')
  await page.getByRole('button', { name: '切换容器显示', exact: true }).click()
  await assertActualLayout(page, table, ['tail', 'flex2', 'fixed'])
  await expect(page.getByLabel('原生布局事件数', { exact: true })).toHaveText('0')
  await page.screenshot({ path: info.outputPath('column-layout-metadata.png') })
})

test('an initially hidden virtual table emits its first layout only after a positive measurement', async ({
  page
}, info) => {
  await open(page, info.project.name, true)
  await expect(page.getByLabel('虚拟布局事件数', { exact: true })).toHaveText('0')
  expect(await readLayout(page)).toBeNull()
  await page.getByRole('button', { name: '切换容器显示', exact: true }).click()
  const table = page.getByLabel('虚拟布局区域', { exact: true }).locator('.art-table-v2')
  await assertActualLayout(page, table, ['fixed', 'flex1', 'flex2', 'tail'])
  await expect(page.getByLabel('零宽度已发送', { exact: true })).toHaveText('false')
  await expect(page.getByLabel('原生布局事件数', { exact: true })).toHaveText('0')
})

test('prototype-named columns retain finite layout and rendered rows through resize, fixed panes and visibility changes', async ({
  page
}, info) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 1000, '特殊字段列宽与固定区域在桌面宽度验证')
  await open(page, info.project.name, false, true)
  const table = page.getByLabel('虚拟布局区域', { exact: true }).locator('.art-table-v2')
  await expect(table).toBeVisible()
  const keys = ['fixed', '__proto__', 'constructor', 'hasOwnProperty']
  const initial = await assertActualLayout(page, table, keys)
  const bodyRows = table.locator('.el-table-v2__main .el-table-v2__row')
  await expect(bodyRows).toHaveCount(2)
  await expect(bodyRows.nth(0)).toContainText('弹性字段一')
  await expect(bodyRows.nth(1)).toContainText('第二行一')
  await expect(bodyRows.nth(1)).toContainText('第二行末列')

  const resize = table.getByRole('button', { name: '调整弹性字段一列宽', exact: true })
  await resize.focus()
  await resize.press('ArrowRight')
  const keyboardWidth = initial.columns[1].width + 16
  await expect
    .poll(
      async () => (await readLayout(page))?.columns.find(({ key }) => key === '__proto__')?.width
    )
    .toBeCloseTo(keyboardWidth, 3)
  await assertActualLayout(page, table, keys)
  const handle = await resize.boundingBox()
  expect(handle).not.toBeNull()
  if (!handle) throw new Error('特殊字段列宽握柄不可见')
  const x = handle.x + handle.width / 2
  const y = handle.y + handle.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 32, y, { steps: 4 })
  await page.mouse.up()
  const resizedWidth = keyboardWidth + 32
  await expect
    .poll(
      async () => (await readLayout(page))?.columns.find(({ key }) => key === '__proto__')?.width
    )
    .toBeCloseTo(resizedWidth, 3)
  await assertActualLayout(page, table, keys)
  await expect(bodyRows).toHaveCount(2)

  await page.getByRole('button', { name: '切换固定状态', exact: true }).click()
  const leftPane = table.locator('.el-table-v2__left')
  await expect(leftPane.locator('.el-table-v2__header-cell[data-key="constructor"]')).toContainText(
    '弹性字段二'
  )
  await expect(leftPane.locator('.el-table-v2__row')).toHaveCount(2)
  await expect(leftPane).toContainText('第二行二')
  await assertActualLayout(page, table, keys)

  await page.getByRole('button', { name: '切换字段可见', exact: true }).click()
  await assertActualLayout(page, table, ['fixed', 'constructor', 'hasOwnProperty'])
  await expect(table.locator('.el-table-v2__header-cell[data-key="__proto__"]')).toHaveCount(0)
  await page.getByRole('button', { name: '调整字段顺序', exact: true }).click()
  await assertActualLayout(page, table, ['hasOwnProperty', 'constructor', 'fixed'])
  await page.getByRole('button', { name: '切换字段可见', exact: true }).click()
  const restored = await assertActualLayout(page, table, keys.toReversed())
  expect(restored.columns.find(({ key }) => key === '__proto__')?.width).toBeCloseTo(
    resizedWidth,
    3
  )
  await expect(bodyRows).toHaveCount(2)
  await expect(bodyRows.nth(0)).toContainText('弹性字段一')
  await expect(bodyRows.nth(1)).toContainText('第二行末列')
  await expect(page.getByLabel('原生布局事件数', { exact: true })).toHaveText('0')
  await page.screenshot({ path: info.outputPath('column-layout-prototype-fields.png') })
})
