import { expect, test, type Locator, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

type CellAppearance = {
  color: string
  background: string
  fontSize: string
  fontWeight: string
  lineHeight: number
  paddingX: number
  paddingY: number
  height: number
  borderBottomWidth: string
  borderBottomColor: string
  borderRightWidth: string
  borderRightColor: string
}

const fixture = '/tests/e2e/fixtures/table-style-parity.html'

async function openFixture(page: Page, project: string): Promise<void> {
  page.setDefaultTimeout(12000)
  await prepareIsolatedSession(page)
  await page.route('**/functions/v1/**', (route) => route.fulfill({ json: {} }))
  const theme = project.includes('dark') ? 'dark' : 'light'
  const box = project.includes('shadow') ? 'shadow-mode' : 'border-mode'
  await page.goto(`${fixture}?theme=${theme}&box=${box}`)
  await expect(page.locator('.art-table-v2')).toBeVisible()
  await expect(page.locator('.el-table__header-wrapper')).toBeVisible()
  await expect(page.locator('.el-table-v2__header-row')).toBeVisible()
  await expect(page.locator('.el-table-v2__main .el-table-v2__row').first()).toBeVisible()
}

async function sampleCell(cell: Locator): Promise<CellAppearance> {
  return cell.evaluate((outer) => {
    const content = outer.querySelector('.cell') ?? outer
    const outerStyle = getComputedStyle(outer)
    const contentStyle = getComputedStyle(content)
    const px = (value: string) => Number.parseFloat(value) || 0
    const background = (node: Element) => {
      let current: Element | null = node
      while (current) {
        const color = getComputedStyle(current).backgroundColor
        if (color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') return color
        current = current.parentElement
      }
      return 'transparent'
    }
    return {
      color: contentStyle.color,
      background: background(outer),
      fontSize: contentStyle.fontSize,
      fontWeight: contentStyle.fontWeight,
      lineHeight: px(contentStyle.lineHeight),
      paddingX:
        px(outerStyle.paddingLeft) +
        px(outerStyle.paddingRight) +
        px(contentStyle.paddingLeft) +
        px(contentStyle.paddingRight),
      paddingY:
        px(outerStyle.paddingTop) +
        px(outerStyle.paddingBottom) +
        px(contentStyle.paddingTop) +
        px(contentStyle.paddingBottom),
      height: outer.getBoundingClientRect().height,
      borderBottomWidth: outerStyle.borderBottomWidth,
      borderBottomColor: outerStyle.borderBottomColor,
      borderRightWidth: outerStyle.borderRightWidth,
      borderRightColor: outerStyle.borderRightColor
    }
  })
}

async function compareCell(native: Locator, virtual: Locator, context: string): Promise<void> {
  const expected = await sampleCell(native)
  const actual = await sampleCell(virtual)
  const details = `${context}: native=${JSON.stringify(expected)} virtual=${JSON.stringify(actual)}`
  expect(actual.color, details).toBe(expected.color)
  expect(actual.background, details).toBe(expected.background)
  expect(actual.fontSize, details).toBe(expected.fontSize)
  expect(actual.fontWeight, details).toBe(expected.fontWeight)
  expect(Math.abs(actual.lineHeight - expected.lineHeight), details).toBeLessThanOrEqual(1)
  expect(Math.abs(actual.paddingX - expected.paddingX), details).toBeLessThanOrEqual(2)
  expect(Math.abs(actual.paddingY - expected.paddingY), details).toBeLessThanOrEqual(2)
  expect(Math.abs(actual.height - expected.height), details).toBeLessThanOrEqual(3)
  expect(actual.borderBottomWidth, details).toBe(expected.borderBottomWidth)
  expect(actual.borderBottomColor, details).toBe(expected.borderBottomColor)
  expect(actual.borderRightWidth, details).toBe(expected.borderRightWidth)
  if (expected.borderRightWidth !== '0px')
    expect(actual.borderRightColor, details).toBe(expected.borderRightColor)
}

test('默认继承的三种尺寸、表头背景、边框和斑马纹保持旧 ArtTable 的视觉规格', async ({
  page
}, info) => {
  test.setTimeout(120000)
  await openFixture(page, info.project.name)
  const native = page.getByRole('region', { name: '普通 ArtTable' })
  const virtual = page.getByRole('region', { name: '虚拟 ArtTable' })
  const nativeHeader = native.locator('.el-table__header-wrapper th.el-table__cell').first()
  const virtualHeader = virtual.locator('.el-table-v2__header-cell').first()
  const nativeCell = native.locator('.el-table__body tr.el-table__row td.el-table__cell').first()
  const virtualCell = virtual.locator('.el-table-v2__main .el-table-v2__row-cell').first()
  const filledHeader = (await sampleCell(nativeHeader)).background

  for (const [label, size] of [
    ['紧凑', 'small'],
    ['默认', 'default'],
    ['宽松', 'large']
  ] as const) {
    await page
      .getByRole('radiogroup', { name: '表格尺寸' })
      .locator('.el-segmented__item')
      .filter({ hasText: label })
      .click()
    await expect(
      page.getByRole('radiogroup', { name: '表格尺寸' }).locator('.el-segmented__item.is-selected')
    ).toHaveText(label)
    await compareCell(nativeHeader, virtualHeader, `${label}表头`)
    await compareCell(nativeCell, virtualCell, `${label}正文`)
    await page.screenshot({ path: info.outputPath(`table-parity-${size}.png`), fullPage: true })
  }

  await page.getByRole('switch', { name: '表格边框' }).locator('..').click()
  await expect(page.getByRole('switch', { name: '表格边框' })).toBeChecked()
  await compareCell(nativeHeader, virtualHeader, '边框表头')
  await compareCell(nativeCell, virtualCell, '边框正文')
  expect((await sampleCell(nativeCell)).borderRightWidth).not.toBe('0px')
  await page.getByRole('switch', { name: '表头背景' }).locator('..').click()
  await expect(page.getByRole('switch', { name: '表头背景' })).not.toBeChecked()
  await compareCell(nativeHeader, virtualHeader, '无色表头')
  expect((await sampleCell(nativeHeader)).background).not.toBe(filledHeader)
  await page.getByRole('switch', { name: '表格斑马纹' }).locator('..').click()
  await expect(page.getByRole('switch', { name: '表格斑马纹' })).toBeChecked()
  const stripedNative = native
    .locator('.el-table__body tr.el-table__row')
    .nth(3)
    .locator('td.el-table__cell')
    .first()
  const stripedVirtual = virtual
    .locator('.el-table-v2__main .el-table-v2__row')
    .nth(3)
    .locator('.el-table-v2__row-cell')
    .first()
  await compareCell(stripedNative, stripedVirtual, '斑马纹正文')
  expect((await sampleCell(stripedNative)).background).not.toBe(
    (await sampleCell(nativeCell)).background
  )
})

test('悬停、选中、编辑入口和水平滚动在两种渲染分支中保持一致', async ({ page }, info) => {
  test.setTimeout(90000)
  await openFixture(page, info.project.name)
  const native = page.getByRole('region', { name: '普通 ArtTable' })
  const virtual = page.getByRole('region', { name: '虚拟 ArtTable' })
  const nativeSelected = native
    .locator('.el-table__body tr.is-art-selected-row td.el-table__cell')
    .first()
  const virtualSelected = virtual
    .locator('.el-table-v2__main .el-table-v2__row.is-art-selected-row .el-table-v2__row-cell')
    .first()
  await expect(nativeSelected).toBeVisible()
  await expect(virtualSelected).toBeVisible()
  await compareCell(nativeSelected, virtualSelected, '选中行')

  const nativeRow = native.locator('.el-table__body tr.el-table__row').nth(2)
  const virtualRow = virtual.locator('.el-table-v2__main .el-table-v2__row').nth(2)
  await nativeRow.hover()
  const hoveredNative = await sampleCell(nativeRow.locator('td.el-table__cell').first())
  await virtualRow.hover()
  const hoveredVirtual = await sampleCell(virtualRow.locator('.el-table-v2__row-cell').first())
  expect(
    hoveredVirtual.background,
    `悬停背景 native=${hoveredNative.background} virtual=${hoveredVirtual.background}`
  ).toBe(hoveredNative.background)

  await page.getByRole('button', { name: '切换编辑入口' }).click()
  await expect(native.getByRole('button', { name: '编辑第 1 行 业务名称' })).toBeVisible()
  await expect(virtual.getByRole('button', { name: '编辑第 1 行 业务名称' })).toBeVisible()
  const nativeEditor = native.getByRole('button', { name: '编辑第 1 行 业务名称' })
  const virtualEditor = virtual.getByRole('button', { name: '编辑第 1 行 业务名称' })
  await nativeEditor.hover()
  const nativeHover = await sampleCell(nativeEditor)
  await virtualEditor.hover()
  const virtualHover = await sampleCell(virtualEditor)
  expect(virtualHover.background).toBe(nativeHover.background)

  const inputAppearance = (input: Locator) =>
    input.evaluate((element) => {
      const wrapper = element.closest('.el-input__wrapper')!
      const style = getComputedStyle(wrapper)
      return {
        shadow: style.boxShadow,
        background: style.backgroundColor,
        radius: style.borderRadius,
        fontSize: getComputedStyle(element).fontSize,
        color: getComputedStyle(element).color
      }
    })
  await nativeEditor.dblclick()
  const nativeInput = native.getByRole('textbox', { name: '第 1 行 业务名称', exact: true })
  await nativeInput.focus()
  const nativeInputStyle = await inputAppearance(nativeInput)
  await virtualEditor.dblclick()
  const virtualInput = virtual.getByRole('textbox', { name: '第 1 行 业务名称', exact: true })
  await virtualInput.focus()
  expect(await inputAppearance(virtualInput)).toEqual(nativeInputStyle)

  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    native: (() => {
      const region = document.querySelector('[aria-label="普通 ArtTable"]')
      const scroll = region?.querySelector('.el-table__body-wrapper .el-scrollbar__wrap')
      return scroll ? scroll.scrollWidth - scroll.clientWidth : -1
    })(),
    virtual: (() => {
      const region = document.querySelector('[aria-label="虚拟 ArtTable"]')
      const window = region?.querySelector(
        '.el-table-v2__main .el-table-v2__body > div:first-child'
      )
      const main = region?.querySelector('.el-table-v2__main')
      const headerCells = region?.querySelectorAll('.el-table-v2__main .el-table-v2__header-cell')
      const headerWidth = [...(headerCells ?? [])].reduce(
        (width, cell) => width + cell.getBoundingClientRect().width,
        0
      )
      return {
        scrollable: window ? window.scrollWidth - window.clientWidth : -1,
        headerExcess: main ? headerWidth - main.getBoundingClientRect().width : -1
      }
    })()
  }))
  expect(overflow.page, JSON.stringify(overflow)).toBeLessThanOrEqual(2)
  expect(overflow.native, JSON.stringify(overflow)).toBeGreaterThan(0)
  expect(overflow.virtual.scrollable, JSON.stringify(overflow)).toBeGreaterThan(0)
  expect(overflow.virtual.headerExcess, JSON.stringify(overflow)).toBeGreaterThan(0)
  await page.screenshot({ path: info.outputPath('table-parity-interactions.png'), fullPage: true })
})
