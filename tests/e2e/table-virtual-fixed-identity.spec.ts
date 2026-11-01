import { expect, test, type Locator, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import type { TableColumnLayout } from '../../src/types/table-virtual'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

async function openFixture(page: Page, project: string, controls = false): Promise<void> {
  await prepareIsolatedSession(page)
  await page.route('**/functions/v1/**', (route) => route.fulfill({ json: {} }))
  const theme = project.includes('dark') ? 'dark' : 'light'
  const box = project.includes('shadow') ? 'shadow-mode' : 'border-mode'
  await page.goto(
    `/tests/e2e/fixtures/table-fixed-identity.html?theme=${theme}&box=${box}&controls=${controls ? '1' : '0'}`
  )
  await expect(page.locator('.art-table-v2')).toBeVisible()
}

async function probe(cell: Locator) {
  return cell.evaluate((element) => ({
    className: element.className,
    column: getComputedStyle(element).getPropertyValue('--probe-column').trim(),
    index: getComputedStyle(element).getPropertyValue('--probe-index').trim()
  }))
}

test('fixed panes preserve original column identity for callbacks, events and validation', async ({
  page
}, info) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 640, '窄视口通过解除固定列的独立用例验证')
  await openFixture(page, info.project.name)
  const table = page.getByRole('region', { name: '虚拟固定列', exact: true })
  await expect(table.locator('.art-table-v2')).toBeVisible()
  const leftCell = table.locator('.el-table-v2__left .el-table-v2__row-cell').first()
  const rightCell = table.locator('.el-table-v2__right .el-table-v2__row-cell').first()
  const middleCell = table.locator('.el-table-v2__main .el-table-v2__row-cell').first()
  const evidence = {
    left: await probe(leftCell),
    right: await probe(rightCell),
    middle: await probe(middleCell)
  }
  for (const side of ['left', 'right']) {
    await table
      .locator(`.el-table-v2__${side} .el-table-v2__header-cell`)
      .first()
      .click({ button: 'right' })
    await table
      .locator(`.el-table-v2__${side} .art-table-v2__content`)
      .first()
      .click({ button: 'right' })
  }
  const events = JSON.parse(
    (await page.getByLabel('事件记录', { exact: true }).textContent()) || '[]'
  ) as unknown
  await writeFile(
    info.outputPath('column-identity.json'),
    JSON.stringify({ evidence, events }, null, 2)
  )
  await info.attach('column-identity-evidence', {
    body: JSON.stringify({ evidence, events }, null, 2),
    contentType: 'application/json'
  })
  await page.screenshot({ path: info.outputPath('fixed-column-identity.png') })
  expect(evidence.left.column).toBe('leftThird')
  expect(evidence.left.index).toBe('2')
  expect(evidence.right.column).toBe('right')
  expect(evidence.right.index).toBe('4')
  expect(evidence.middle.column).toBe('before')
  expect(evidence.middle.index).toBe('0')
  expect(evidence.left.className).toContain('column-leftThird')
  expect(evidence.left.className).toContain('callback-leftThird-index-2')
  expect(evidence.right.className).toContain('column-right')
  expect(evidence.right.className).toContain('callback-right-index-4')
  expect(evidence.middle.className).toContain('column-before')
  expect(events).toEqual([
    { table: 'virtual', kind: 'header', property: 'leftThird', id: 'art-v2-column-2' },
    { table: 'virtual', kind: 'cell', property: 'leftThird', id: 'art-v2-column-2' },
    { table: 'virtual', kind: 'row', property: 'leftThird', id: 'art-v2-column-2' },
    { table: 'virtual', kind: 'header', property: 'right', id: 'art-v2-column-4' },
    { table: 'virtual', kind: 'cell', property: 'right', id: 'art-v2-column-4' },
    { table: 'virtual', kind: 'row', property: 'right', id: 'art-v2-column-4' }
  ])
  await page.getByRole('button', { name: '校验固定列', exact: true }).click()
  const errors = [
    { prop: 'leftThird', rowIndex: 0 },
    { prop: 'right', rowIndex: 0 }
  ]
  await expect(page.getByRole('status')).toHaveText(JSON.stringify([errors, errors]))
  const native = page.getByRole('region', { name: '普通固定列', exact: true })
  for (const field of ['leftThird', 'right']) {
    await expect(native.locator(`[data-art-edit-field="${field}"]`).first()).toHaveAttribute(
      'aria-invalid',
      'true'
    )
  }
  for (const cell of [leftCell, rightCell]) {
    await expect(cell.locator('.art-table__cell-content')).toHaveAttribute('aria-invalid', 'true')
    await expect(cell.locator('xpath=..')).toHaveClass(/probe-row-0/)
  }
  await expect(middleCell.locator('.art-table__cell-content')).not.toHaveAttribute(
    'aria-invalid',
    'true'
  )
  await page.screenshot({ path: info.outputPath('fixed-column-validation.png') })
})

test('narrow containers release fixed panes and preserve all column identities', async ({
  page
}, info) => {
  await openFixture(page, info.project.name)
  for (const label of ['普通固定列', '虚拟固定列']) {
    await page
      .getByRole('region', { name: label, exact: true })
      .locator(':scope > div')
      .evaluate((element) => {
        if (element instanceof HTMLElement) element.style.width = 'min(100%, 520px)'
      })
  }
  const table = page.getByRole('region', { name: '虚拟固定列', exact: true })
  await expect(table.locator('.el-table-v2__left, .el-table-v2__right')).toHaveCount(0)
  const cells = table
    .locator('.el-table-v2__main .el-table-v2__row')
    .first()
    .locator('.el-table-v2__row-cell')
  const columns = ['before', 'after', 'leftThird', 'center', 'right']
  await expect(cells).toHaveCount(columns.length)
  for (const [index, column] of columns.entries()) {
    expect(await probe(cells.nth(index))).toMatchObject({ column, index: String(index) })
  }
  const native = page.getByRole('region', { name: '普通固定列', exact: true })
  await expect(
    native.locator('.el-table-fixed-column--left, .el-table-fixed-column--right')
  ).toHaveCount(0)
  const nativeColumns = await native
    .locator('.el-table__body tr')
    .first()
    .locator('td')
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).getPropertyValue('--probe-column').trim())
    )
  expect(nativeColumns).toEqual(columns)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  )
  await page.screenshot({ path: info.outputPath('narrow-column-identity.png') })
})

test('fixed header clicks dispatch original identities and sortable headers keep sorting', async ({
  page
}, info) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 640, '固定表头行为在桌面容器验证')
  await openFixture(page, info.project.name)
  const table = page.getByRole('region', { name: '虚拟固定列', exact: true })
  const leftHeader = table.locator('.el-table-v2__left .el-table-v2__header-cell').first()
  const rightHeader = table.locator('.el-table-v2__right .el-table-v2__header-cell').first()
  await leftHeader.click({ position: { x: 20, y: 20 } })
  await rightHeader.click({ position: { x: 20, y: 20 } })
  const events: unknown = JSON.parse(
    (await page.getByLabel('事件记录', { exact: true }).textContent()) || '[]'
  )
  await writeFile(info.outputPath('header-click-evidence.json'), JSON.stringify(events, null, 2))
  expect(events).toEqual([
    { table: 'virtual', kind: 'header-click', property: 'leftThird', id: 'art-v2-column-2' },
    { table: 'virtual', kind: 'sort', property: 'right', id: 'art-v2-column-4' },
    { table: 'virtual', kind: 'header-click', property: 'right', id: 'art-v2-column-4' }
  ])
  await expect(rightHeader.locator('.el-table-v2__sort-icon.is-sorting')).toBeVisible()
})

test('header resize, selection and custom controls retain click propagation boundaries', async ({
  page
}, info) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 640, '固定表头交互在桌面容器验证')
  await openFixture(page, info.project.name, true)
  const table = page.getByRole('region', { name: '虚拟固定列', exact: true })
  const rightHeader = table.locator('.el-table-v2__right .el-table-v2__header-cell').first()
  const resize = table.getByRole('button', { name: '调整右固定列宽', exact: true })
  const before = await rightHeader.evaluate((element) => element.getBoundingClientRect().width)
  await resize.click()
  await resize.press('ArrowRight')
  await expect
    .poll(() => rightHeader.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(before)
  const selection = table.getByRole('checkbox', { name: '选择当前页全部行', exact: true })
  await selection.locator('..').click()
  await expect(selection).toBeChecked()
  await table.getByRole('button', { name: '表头子按钮', exact: true }).click()
  await expect(page.getByLabel('事件记录', { exact: true })).toHaveText('[]')
  await table
    .locator('.el-table-v2__left .el-table-v2__header-cell')
    .first()
    .click({ position: { x: 20, y: 20 } })
  const events: unknown = JSON.parse(
    (await page.getByLabel('事件记录', { exact: true }).textContent()) || '[]'
  )
  expect(events).toEqual([
    { table: 'virtual', kind: 'header-click', property: 'leftThird', id: 'art-v2-column-2' }
  ])
  await writeFile(info.outputPath('header-control-evidence.json'), JSON.stringify(events, null, 2))
})

test('resize handles retain a usable hit area and resize from their centers in every pane', async ({
  page
}, info) => {
  test.skip((page.viewportSize()?.width ?? 1440) < 640, '固定区域热区在桌面容器验证')
  await openFixture(page, info.project.name)
  const table = page.getByRole('region', { name: '虚拟固定列', exact: true })
  const evidence = []
  for (const pane of ['main', 'left', 'right']) {
    const button = table.locator(`.el-table-v2__${pane} .art-table-v2__resize`).first()
    const hit = await button.evaluate((button) => {
      const box = button.getBoundingClientRect()
      const y = box.top + box.height / 2
      const samples = []
      for (let x = box.left + 0.5; x < box.right; x++) {
        const target = document.elementFromPoint(x, y)
        samples.push({ x, hit: target === button || (target !== null && button.contains(target)) })
      }
      const center = document.elementFromPoint(box.left + box.width / 2, y)
      const header = button.closest<HTMLElement>('[role="columnheader"][data-key]')!
      return {
        key: header.dataset.key,
        width: box.width,
        left: box.left,
        right: box.right,
        y,
        samples,
        hitPixels: samples.filter(({ hit }) => hit).length,
        centerHit: center === button || (center !== null && button.contains(center)),
        columnWidth: header.getBoundingClientRect().width
      }
    })
    expect(hit.width).toBe(12)
    expect(
      hit.hitPixels,
      `${pane} has only ${hit.hitPixels}/12 hittable pixels`
    ).toBeGreaterThanOrEqual(10)
    expect(hit.centerHit, `${pane} handle center is obscured`).toBe(true)
    const x = hit.left + hit.width / 2
    await page.mouse.move(x, hit.y)
    await page.mouse.down()
    await page.mouse.move(x + 40, hit.y, { steps: 6 })
    await page.mouse.up()
    const header = button.locator('xpath=ancestor::div[@role="columnheader"][1]')
    await expect
      .poll(() => header.evaluate((element) => element.getBoundingClientRect().width))
      .toBeGreaterThan(hit.columnWidth + 20)
    await expect
      .poll(async () => {
        const layout: TableColumnLayout | null = JSON.parse(
          (await page.getByLabel('虚拟固定布局', { exact: true }).textContent()) || 'null'
        )
        const reported = layout?.columns.find(({ key }) => key === hit.key)?.width
        const actual = await header.evaluate((element) => element.getBoundingClientRect().width)
        return reported !== undefined && Math.abs(reported - actual) <= 1
      })
      .toBe(true)
    evidence.push({
      pane,
      ...hit,
      resizedWidth: await header.evaluate((element) => element.getBoundingClientRect().width)
    })
  }
  await expect(page.getByLabel('事件记录', { exact: true })).toHaveText('[]')
  await writeFile(info.outputPath('resize-hit-evidence.json'), JSON.stringify(evidence, null, 2))
  await page.screenshot({ path: info.outputPath('resize-hit-areas.png') })
})
