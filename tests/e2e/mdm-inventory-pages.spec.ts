import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'
import {
  tenantId,
  zoneId,
  materialId,
  pages,
  meta,
  bin,
  material,
  installFixtures
} from './support/inventory-fixtures'

async function expectSceneFooterLayout(page: Page): Promise<void> {
  const [frame, legend, hint] = await Promise.all([
    page.locator('.scene-frame').boundingBox(),
    page.locator('.scene-legend').boundingBox(),
    page.locator('.scene-hint').boundingBox()
  ])
  expect(frame).not.toBeNull()
  expect(legend).not.toBeNull()
  expect(hint).not.toBeNull()
  for (const box of [legend!, hint!]) {
    expect(box.x).toBeGreaterThanOrEqual(frame!.x)
    expect(box.x + box.width).toBeLessThanOrEqual(frame!.x + frame!.width + 1)
    expect(box.y).toBeGreaterThanOrEqual(frame!.y)
    expect(box.y + box.height).toBeLessThanOrEqual(frame!.y + frame!.height + 1)
  }
  const separated =
    legend!.x + legend!.width <= hint!.x ||
    hint!.x + hint!.width <= legend!.x ||
    legend!.y + legend!.height <= hint!.y ||
    hint!.y + hint!.height <= legend!.y
  expect(separated, '货架图例与操作提示不能重叠').toBe(true)
}

test('库存主数据布局与库位交互', async ({ page }, testInfo) => {
  test.setTimeout(540_000)
  if (process.env.WMS_E2E_VIEWPORT === '2048') {
    await page.setViewportSize({ width: 2048, height: 1088 })
  }
  const visualDir = join(process.cwd(), '.artifacts', 'wms-visual', testInfo.project.name)
  mkdirSync(visualDir, { recursive: true })
  await installFixtures(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const selectedPages = process.env.WMS_E2E_PAGE
    ? pages.filter(([, path]) => path === process.env.WMS_E2E_PAGE)
    : pages
  for (const [, path, title] of selectedPages) {
    if (path === 'reservation') {
      await page.route('**/rest/v1/rpc/wms_work_order_options_secure', (route) =>
        route.fulfill({
          json: [
            {
              id: 'c0767f00-0000-4000-8000-000000000001',
              tenantId,
              workOrderNo: '可领料测试工单',
              materialId,
              constructionNo: null,
              allowedIssueWarehouseTypes: ['raw_material']
            },
            {
              id: 'c0767f00-0000-4000-8000-000000000002',
              tenantId,
              workOrderNo: '仅成品仓测试工单',
              materialId,
              constructionNo: null,
              allowedIssueWarehouseTypes: ['finished']
            }
          ]
        })
      )
    }
    await page.goto(`#/mdm/inventory-master/${path}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({
      timeout: 120_000
    })
    await expect(page.locator('.art-page-view:visible').last()).toHaveCSS('opacity', '1')
    await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 30_000 })
    if (path === 'outbound-rule' || path === 'supply-chain-code-rule') {
      await expect(page.locator('.el-pagination__total')).toHaveText(/共\s*1\s*条/)
    }
    await expect(page.locator('.art-overlay-loading.is-loading:visible')).toHaveCount(0, {
      timeout: 30_000
    })
    const themeTipDismiss = page.getByText('知道了', { exact: true })
    if (await themeTipDismiss.isVisible()) await themeTipDismiss.click()
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }))
    expect(overflow.content, `${title} 出现横向溢出`).toBeLessThanOrEqual(overflow.viewport + 1)
    if (path === 'outbound-rule' || path === 'supply-chain-code-rule') {
      const identity = page.locator('.business-table-identity-cell:visible').first()
      await expect(identity.locator('strong')).toBeVisible()
      await expect(identity.locator('small')).toBeVisible()
      const primary = await identity.locator('strong').boundingBox()
      const secondary = await identity.locator('small').boundingBox()
      expect(primary).not.toBeNull()
      expect(secondary).not.toBeNull()
      expect(secondary!.y).toBeGreaterThan(primary!.y)
    }
    await page.screenshot({ path: join(visualDir, `mdm-${path}.png`), fullPage: true })
    if (path === 'bin-3d') {
      await expect(page.getByRole('navigation', { name: '货架库区导航' })).toBeVisible()
      await expect(page.locator('canvas.rack-scene__canvas')).toBeVisible()
      await expectSceneFooterLayout(page)
      const sceneFrame = await page.locator('.scene-frame').boundingBox()
      const sceneCanvas = await page.locator('canvas.rack-scene__canvas').boundingBox()
      expect(sceneFrame).not.toBeNull()
      expect(sceneCanvas).not.toBeNull()
      expect(sceneCanvas!.height, '立体场景应填满库位空间卡片').toBeGreaterThanOrEqual(
        sceneFrame!.height - 2
      )
      await expect(page.locator('.art-workspace-splitter')).toHaveCount(2)
      for (const label of ['间距设置', '重置视角', '刷新库位'])
        await expect(page.getByRole('button', { name: label }).locator('svg')).toBeVisible()
      if ((page.viewportSize()?.width ?? 0) <= 640) {
        await page.locator('canvas.rack-scene__canvas').scrollIntoViewIfNeeded()
        await page.screenshot({ path: join(visualDir, 'mdm-bin-3d-mobile-scene.png') })
        await page.locator('.scene-footer').scrollIntoViewIfNeeded()
        await expect(page.locator('.scene-footer')).toBeInViewport({ ratio: 1 })
        await page.screenshot({ path: join(visualDir, 'mdm-bin-3d-mobile-footer.png') })
      }
      await page.getByRole('button', { name: '间距设置' }).click()
      await page.locator('.el-slider__button-wrapper').first().press('ArrowRight')
      await expect(page.getByText('24px')).toBeVisible()
      const rowSlider = page.getByRole('slider', { name: '货架排间距' })
      await expect(rowSlider).toBeVisible()
      const originalRowGap = Number(await rowSlider.getAttribute('aria-valuenow'))
      await rowSlider.press('ArrowRight')
      await expect(rowSlider).toHaveAttribute('aria-valuenow', String(originalRowGap + 4))
      await page.getByRole('button', { name: '间距设置' }).click()
      await page.locator('.rack-scene__label').filter({ hasText: 'B02' }).click()
      await expect(page.getByText('B02', { exact: true }).last()).toBeVisible()
      await page.locator('.rack-scene__label').filter({ hasText: 'A01' }).click()
      await page.getByRole('button', { name: /A01-01-01，空位/ }).click()
      await expect(page.getByText('A01-01-01', { exact: true }).last()).toBeVisible()
      await expect(page.getByRole('button', { name: '查看库存明细' })).toBeVisible()
      if ((page.viewportSize()?.width ?? 0) >= 1200) {
        await page.screenshot({ path: join(visualDir, 'mdm-bin-3d-focused.png') })
        const detailSplitter = page.locator('.art-workspace-splitter.three-d-workspace')
        const detailPanel = detailSplitter.locator('.el-splitter-panel').last()
        const beforeWidth = (await detailPanel.boundingBox())?.width ?? 0
        const handle = await detailSplitter.locator('.el-splitter-bar').first().boundingBox()
        expect(handle).not.toBeNull()
        await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2)
        await page.mouse.down()
        await page.mouse.move(handle!.x + handle!.width / 2 - 500, handle!.y + handle!.height / 2)
        await page.mouse.up()
        await expect
          .poll(async () => (await detailPanel.boundingBox())?.width ?? 0)
          .toBeGreaterThan(beforeWidth + 40)
        await expectSceneFooterLayout(page)
        await page.screenshot({ path: join(visualDir, 'mdm-bin-3d-detail-expanded.png') })
        const expandedHandle = await detailSplitter
          .locator('.el-splitter-bar')
          .first()
          .boundingBox()
        expect(expandedHandle).not.toBeNull()
        await page.mouse.move(
          expandedHandle!.x + expandedHandle!.width / 2,
          expandedHandle!.y + expandedHandle!.height / 2
        )
        await page.mouse.down()
        await page.mouse.move(
          Math.min(
            (page.viewportSize()?.width ?? 0) - 24,
            expandedHandle!.x + expandedHandle!.width / 2 + 500
          ),
          expandedHandle!.y + expandedHandle!.height / 2
        )
        await page.mouse.up()
        await expect
          .poll(async () => (await detailPanel.boundingBox())?.width ?? 0)
          .toBeLessThan(beforeWidth + 20)
      }
      await page.getByRole('button', { name: '俯视' }).click()
      await expect(page.getByRole('button', { name: '俯视' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
      const firstRackLabel = await page
        .locator('.rack-scene__label')
        .filter({ hasText: 'A01' })
        .boundingBox()
      const secondRackLabel = await page
        .locator('.rack-scene__label')
        .filter({ hasText: 'B02' })
        .boundingBox()
      expect(firstRackLabel).not.toBeNull()
      expect(secondRackLabel).not.toBeNull()
      expect(Math.abs(firstRackLabel!.y - secondRackLabel!.y)).toBeGreaterThan(30)
      if ((page.viewportSize()?.width ?? 0) >= 1120)
        await page.screenshot({ path: join(visualDir, 'mdm-bin-3d-top.png') })
      await page.getByRole('button', { name: /彩卷区/ }).click()
      await expect(page.getByText('当前库区暂无货架')).toBeVisible()
    }
    if (path === 'zone' || path === 'bin' || path === 'bin-3d') {
      await expect(page.getByRole('button', { name: '进入专注模式' })).toHaveCount(0)
      await expect(page.getByRole('switch', { name: '进入专注模式' })).toHaveCount(0)
      await expect(page.locator('.art-section-card .el-scrollbar').first()).toBeVisible()
      if (path === 'zone' && (page.viewportSize()?.width ?? 0) > 1200) {
        const zoneWidth = (await page.locator('.zone-tile').first().boundingBox())?.width ?? 0
        expect(zoneWidth, '库区卡片应保持紧凑宽度').toBeLessThanOrEqual(241)
      }
      if (path === 'bin') {
        await expect(page.locator('.art-workspace-splitter')).toHaveCount(2)
        if ((page.viewportSize()?.width ?? 0) > 1200) {
          await expect(page.locator('.art-workspace-splitter .el-splitter-bar')).toHaveCount(2)
          const splitter = page.locator('.art-workspace-splitter').first()
          const primaryPanel = splitter.locator('.el-splitter-panel').first()
          const beforeWidth = (await primaryPanel.boundingBox())?.width ?? 0
          const handle = await splitter.locator('.el-splitter-bar').first().boundingBox()
          expect(handle).not.toBeNull()
          await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2)
          await page.mouse.down()
          await page.mouse.move(handle!.x + handle!.width / 2 + 48, handle!.y + handle!.height / 2)
          await page.mouse.up()
          await expect
            .poll(async () => (await primaryPanel.boundingBox())?.width ?? 0)
            .toBeGreaterThan(beforeWidth + 20)
        }
      }
    } else {
      await expect(
        page.locator('.business-workspace-header:visible').getByText('专注模式', { exact: true })
      ).toBeVisible()
      if (path === 'batch') {
        await page.getByRole('switch', { name: '显示表格右侧工具栏' }).locator('..').click()
        await expect(page.getByRole('button', { name: '进入专注模式' })).toHaveCount(0)
      }
      await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeHidden()
      if (path === 'batch') {
        await expect(page.getByRole('button', { name: '退出专注模式' })).toBeVisible()
      }
      await page.screenshot({ path: join(visualDir, `mdm-${path}-focus.png`), fullPage: true })
      await page.keyboard.press('Escape')
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
    }
    if (path === 'warehouse-definition') {
      await page.getByRole('button', { name: '新增仓库', exact: true }).click()
      const dialog = page.locator('.el-dialog:visible')
      await expect(dialog.getByText('一位一品', { exact: true })).toHaveCount(0)
      const zoneSwitch = dialog
        .locator('.el-form-item')
        .filter({ hasText: '启用库区' })
        .locator('.el-switch')
      const binSwitch = dialog
        .locator('.el-form-item')
        .filter({ hasText: '启用库位' })
        .locator('.el-switch')
      await expect(zoneSwitch).not.toHaveClass(/is-checked/)
      await expect(binSwitch).not.toHaveClass(/is-checked/)
      await dialog
        .locator('.el-form-item')
        .filter({ hasText: '启用库位' })
        .locator('.el-switch')
        .click({ timeout: 15_000 })
      await expect(zoneSwitch).not.toHaveClass(/is-checked/)
      const singleSkuField = dialog.locator('.el-form-item').filter({ hasText: '一位一品' })
      await expect(singleSkuField.locator('.el-select')).toContainText('否')
      await page.screenshot({ path: join(visualDir, 'mdm-warehouse-dialog.png'), fullPage: true })
      await singleSkuField.locator('.el-select').click({ timeout: 15_000 })
      await page.getByRole('option', { name: '是' }).click({ timeout: 15_000 })
      await expect(singleSkuField.locator('.el-select')).toContainText('是')
    }
    if (path === 'movement-type') {
      page.setDefaultTimeout(15_000)
      await expect(page.getByText('采购入库', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('101 · 采购入库', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: '新增类型' })).toBeEnabled()
      await page.getByRole('button', { name: '新增类型' }).click()
      const dialog = page.locator('.el-dialog:visible')
      await expect(dialog.getByText('移动类型编码', { exact: true })).toBeVisible()
      await expect(dialog.getByText('移动类型名称', { exact: true })).toBeVisible()
      await expect(dialog.getByText('反向类型', { exact: true })).toBeVisible()
      await expect(dialog.getByText('冲销标志', { exact: true })).toBeVisible()
      await expect(dialog.getByText('其他出入库', { exact: true })).toBeVisible()
      await expect(dialog.getByText('启用标志', { exact: true })).toBeVisible()
      await page.screenshot({
        path: join(visualDir, 'mdm-movement-type-dialog.png'),
        animations: 'disabled'
      })
      const dialogOverflow = await dialog.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
      expect(dialogOverflow, '出入库类型弹窗出现横向溢出').toBe(false)
      await dialog.evaluate((el) => {
        const scrollable = [...el.querySelectorAll('*')].find(
          (item) => item.scrollHeight > item.clientHeight + 30 && item.clientHeight > 100
        )
        if (scrollable) scrollable.scrollTop = scrollable.scrollHeight
      })
      await expect(dialog.getByRole('switch')).toHaveCount(3)
      await page.screenshot({
        path: join(visualDir, 'mdm-movement-type-dialog-bottom.png'),
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '取消' }).click()
      await page.getByRole('button', { name: '查看类型' }).first().click()
      const drawer = page.locator('.el-drawer:visible')
      await expect(drawer.getByText('采购入库', { exact: true }).first()).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(drawer).toHaveCount(0)
      await page.getByRole('button', { name: '编辑类型' }).first().click()
      const editDialog = page.locator('.el-dialog:visible')
      await expect(editDialog.getByText('编辑出入库类型', { exact: true })).toBeVisible()
      await expect(
        editDialog.locator('.el-form-item').filter({ hasText: '移动类型编码' }).locator('input')
      ).toHaveValue('101')
      await editDialog.getByRole('button', { name: '取消' }).click()
      await page.getByRole('button', { name: '更多操作' }).first().click()
      await page.getByRole('menuitem', { name: '复制类型' }).click()
      const copyDialog = page.locator('.el-dialog:visible')
      await expect(copyDialog.getByText('复制出入库类型', { exact: true })).toBeVisible()
      await copyDialog.getByRole('button', { name: '取消' }).click()
      page.setDefaultTimeout(0)
    }
    if (path === 'serial') {
      await expect(page.getByText('采购', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('原材料', { exact: true }).first()).toBeVisible()
      await page.getByRole('button', { name: '编辑', exact: true }).click()
      const dialog = page.locator('.el-dialog:visible')
      await expect(dialog.locator('.el-form-item').filter({ hasText: '工单' })).toContainText(
        'DEMO-WMS-001'
      )
      await expect(dialog.getByText('39b66f7c-3b4c-4b7d-b849-5ee7cb1d558a')).toHaveCount(0)
      await expect(dialog.locator('.el-form-item').filter({ hasText: '库位' })).toContainText(
        'RAW-A-BOARD-01'
      )
      await page.screenshot({
        path: join(visualDir, 'mdm-serial-dialog.png'),
        fullPage: true,
        animations: 'disabled'
      })
      await dialog.getByRole('button', { name: '取消' }).click()
    }
    if (path === 'batch') {
      await page.getByRole('button', { name: '呆滞口径' }).click()
      const policyDialog = page.locator('.el-dialog:visible')
      await expect(policyDialog.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
      await policyDialog.getByRole('button', { name: '取消' }).click()
    }
    if (path === 'reservation') {
      await page.getByRole('button', { name: '新增预留' }).click()
      const dialog = page.locator('.el-dialog:visible')
      await dialog.getByRole('combobox', { name: '工单' }).click()
      await expect(page.getByRole('option', { name: '可领料测试工单' })).toBeVisible()
      await expect(page.getByRole('option', { name: '仅成品仓测试工单' })).toHaveCount(0)
      await page.screenshot({ path: join(visualDir, 'mdm-reservation-allowed-orders.png') })
      await dialog.getByRole('button', { name: '取消' }).click()
    }
    if (path === 'bin') {
      for (const [label, token] of [
        ['可存', '--el-color-success'],
        ['有库存', '--el-color-primary'],
        ['异常', '--el-color-danger'],
        ['停用', '--el-color-info']
      ] as const) {
        const swatch = page.locator('.el-checkbox-group .el-checkbox').filter({ hasText: label })
        const colors = await swatch.evaluate((element, colorToken) => {
          const reference = document.createElement('span')
          reference.style.color = `var(${colorToken})`
          element.appendChild(reference)
          const colors = {
            actual: getComputedStyle(element.querySelector('.el-checkbox__inner')!).backgroundColor,
            expected: getComputedStyle(reference).color
          }
          reference.remove()
          return colors
        }, token)
        expect(colors.actual, `${label} 筛选色应与库位状态色一致`).toBe(colors.expected)
      }
      const originalAppearance = await page.evaluate(() => ({
        dark: document.documentElement.classList.contains('dark'),
        boxMode: document.documentElement.getAttribute('data-box-mode')
      }))
      await page.evaluate(() => {
        document.documentElement.classList.add('dark')
        document.documentElement.setAttribute('data-box-mode', 'border-mode')
      })
      await page.screenshot({
        path: join(visualDir, 'mdm-bin-dark-border.png'),
        fullPage: true,
        animations: 'disabled'
      })
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-box-mode', 'shadow-mode')
      })
      await page.screenshot({
        path: join(visualDir, 'mdm-bin-dark-shadow.png'),
        fullPage: true,
        animations: 'disabled'
      })
      await page.evaluate(({ dark, boxMode }) => {
        document.documentElement.classList.toggle('dark', dark)
        if (boxMode) document.documentElement.setAttribute('data-box-mode', boxMode)
        else document.documentElement.removeAttribute('data-box-mode')
      }, originalAppearance)
      await expect(page.locator('.rack-facade')).toBeVisible()
      await expect(page.locator('.rack-facade')).toHaveCSS('border-top-width', '12px')
      await expect(page.locator('.rack-level')).toHaveCount(2)
      const firstRack = page.locator('section[aria-label="A01货架"]')
      const secondRack = page.locator('section[aria-label="B02货架"]')
      await expect(firstRack.locator('.rack-facade')).toBeVisible()
      await expect(secondRack.locator('.rack-facade')).toHaveCount(0)
      const editShelfButton = firstRack.getByRole('button', { name: '编辑货架' })
      await expect(editShelfButton.locator('svg')).toBeVisible()
      await editShelfButton.click()
      const shelfDialog = page.locator('.el-dialog:visible')
      await expect(shelfDialog.getByText('编辑货架 · A01')).toBeVisible()
      await expect(shelfDialog.locator('.el-form-item').filter({ hasText: '层数' })).toBeVisible()
      await page.screenshot({
        path: join(visualDir, 'mdm-bin-shelf-editor.png'),
        animations: 'disabled'
      })
      let shelfUpdate: Record<string, unknown> | undefined
      await page.route('**/rest/v1/rpc/mdm_update_warehouse_shelf_secure', (route) => {
        shelfUpdate = route.request().postDataJSON() as Record<string, unknown>
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: 'null'
        })
      })
      await shelfDialog
        .locator('.el-form-item')
        .filter({ hasText: '层数' })
        .locator('input')
        .fill('3')
      await shelfDialog.getByRole('button', { name: '保存货架' }).click()
      await expect(shelfDialog).toBeHidden()
      expect(shelfUpdate?.p_shelf_code).toBe('A01')
      expect(shelfUpdate?.p_levels).toBe(3)
      expect(shelfUpdate?.p_expected_bin_ids).toHaveLength(4)
      await page.unroute('**/rest/v1/rpc/mdm_update_warehouse_shelf_secure')
      await firstRack.getByRole('button', { name: /A01 货架/ }).click()
      await expect(firstRack.locator('.rack-facade')).toHaveCount(0)
      await secondRack.getByRole('button', { name: /B02 货架/ }).click()
      await expect(secondRack.locator('.rack-facade')).toBeVisible()
      await firstRack.getByRole('button', { name: /A01 货架/ }).click()
      await expect(firstRack.locator('.rack-facade')).toBeVisible()
      const rackMore = page.getByRole('button', { name: '操作货架 1-1', exact: true })
      await expect(rackMore.locator('svg')).toBeVisible()
      const rackTile = page.getByRole('button', { name: /^货架 1-1，/ })
      const rackActions = page
        .locator('.rack-cell')
        .filter({ has: rackMore })
        .locator('.storage-card-actions')
      if ((page.viewportSize()?.width ?? 0) > 1200) {
        await expect(rackActions).toHaveCSS('opacity', '0')
      }
      await rackTile.hover()
      await expect(rackActions).toHaveCSS('opacity', '1')
      const rackTileBounds = await rackTile.boundingBox()
      const rackMoreBounds = await rackMore.boundingBox()
      expect(rackTileBounds).not.toBeNull()
      expect(rackMoreBounds).not.toBeNull()
      expect(rackMoreBounds!.x).toBeGreaterThan(rackTileBounds!.x + rackTileBounds!.width / 2)
      expect(rackMoreBounds!.y + rackMoreBounds!.height).toBeLessThanOrEqual(
        rackTileBounds!.y + rackTileBounds!.height
      )
      await expect(page.getByText('子单元 1', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: /^货架 1-1 子单元，/ })).toBeVisible()
      if ((page.viewportSize()?.width ?? 0) > 1200) {
        const childWidth = (
          await page.getByRole('button', { name: /^货架 1-1 子单元，/ }).boundingBox()
        )?.width
        const blockWidth = (await page.getByRole('button', { name: /^一号垛位，/ }).boundingBox())
          ?.width
        expect(childWidth).toBeDefined()
        expect(blockWidth).toBeDefined()
        expect(Math.abs(childWidth! - blockWidth!), '子单元与平面库位卡片应等宽').toBeLessThan(2)
      }
      await rackMore.click()
      await expect(page.getByRole('menuitem', { name: '新增子单元' })).toBeVisible()
      await expect(page.getByRole('menuitem', { name: '删除库位' })).toBeVisible()
      await page.screenshot({
        path: join(visualDir, 'mdm-bin-more-actions.png'),
        animations: 'disabled'
      })
      await page.getByRole('menuitem', { name: '编辑库位' }).click()
      const editDialog = page.locator('.el-dialog:visible')
      await expect(editDialog.getByRole('textbox', { name: /库位编码/ })).toBeDisabled()
      await expect(editDialog.getByRole('textbox', { name: /库位编码/ })).toHaveValue('A01-01-01')
      await expect(editDialog.getByRole('combobox', { name: '上级存储单元' })).toBeDisabled()
      await expect(editDialog.getByRole('textbox', { name: /库位名称/ })).toBeEnabled()
      await editDialog.getByRole('button', { name: '取消' }).click()
      const tile = page.getByRole('button', { name: /^一号垛位，/ })
      const blockMore = page.getByRole('button', { name: '操作一号垛位', exact: true })
      const blockActions = page
        .locator('.bin-node__tile')
        .filter({ has: blockMore })
        .locator('.storage-card-actions')
      if ((page.viewportSize()?.width ?? 0) > 1200) {
        await expect(blockActions).toHaveCSS('opacity', '0')
      }
      await tile.hover()
      await expect(blockActions).toHaveCSS('opacity', '1')
      const blockTileBounds = await tile.boundingBox()
      const blockMoreBounds = await blockMore.boundingBox()
      expect(blockTileBounds).not.toBeNull()
      expect(blockMoreBounds).not.toBeNull()
      expect(blockMoreBounds!.x).toBeGreaterThan(blockTileBounds!.x + blockTileBounds!.width / 2)
      expect(blockMoreBounds!.y + blockMoreBounds!.height).toBeLessThanOrEqual(
        blockTileBounds!.y + blockTileBounds!.height
      )
      await blockMore.click()
      await expect(page.getByRole('menuitem', { name: '编辑库位' })).toBeVisible()
      await page.screenshot({
        path: join(visualDir, 'mdm-bin-block-more-actions.png'),
        animations: 'disabled'
      })
      await page.keyboard.press('Escape')
      await tile.hover()
      await expect(page.getByText(/库存金额.*960/)).toBeVisible()
      await expect(page.getByText(/呆滞物料 1 种/)).toBeVisible()
      await tile.dblclick()
      await expect(page.getByText('B-20260924-01', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '关闭', exact: true }).click()
      await tile.click()
      await expect(page.getByText('一号垛位 · 快捷业务')).toBeVisible()
      await expect(page.getByRole('button', { name: '采购入库' })).toBeVisible()
      await page.screenshot({
        path: join(visualDir, 'mdm-bin-action-dialog.png'),
        fullPage: true,
        animations: 'disabled'
      })
      await page.getByRole('button', { name: '生产入库' }).click()
      await expect(page).toHaveURL(/\/wms\/receipt-issue\/stock-operation/)
    }
  }
  expect(errors).toEqual([])
})

test('库位与立体库位的空库区使用统一空状态', async ({ page }, testInfo) => {
  await installFixtures(page)
  await page.route('**/rest/v1/mdm_warehouse_zone?*', (route) => route.fulfill({ json: [] }))
  const visualDir = join(process.cwd(), '.artifacts', 'wms-visual', testInfo.project.name)
  mkdirSync(visualDir, { recursive: true })

  for (const path of ['bin', 'bin-3d']) {
    await page.goto(`#/mdm/inventory-master/${path}`, { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: path === 'bin' ? '库位管理' : '立体库位', exact: true })
    ).toBeVisible({ timeout: 120_000 })
    await expect(page.locator('.art-page-view:visible').last()).toHaveCSS('opacity', '1')
    const themeTipDismiss = page.getByText('知道了', { exact: true })
    if (await themeTipDismiss.isVisible()) await themeTipDismiss.click()
    const empty = page.locator('.art-empty-state').filter({ hasText: '暂无库区' })
    await expect(empty).toBeVisible({ timeout: 30_000 })
    await expect(empty.getByText('请先')).toBeVisible()
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth
    }))
    expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1)
    await empty.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: join(visualDir, `mdm-${path}-empty-zone.png`),
      animations: 'disabled'
    })
  }
})

test('立体库位加载失败后可重试', async ({ page }) => {
  test.setTimeout(120_000)
  await installFixtures(page)
  let shouldFail = true
  await page.route('**/rest/v1/mdm_warehouse_bin?*', (route) => {
    if (shouldFail) {
      return route.fulfill({ status: 400, json: { code: 'PGRST100', message: '暂时不可用' } })
    }
    return route.fallback()
  })
  await page.goto('#/mdm/inventory-master/bin-3d', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '立体库位', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect(page.getByText('货架空间加载失败，请重试。', { exact: true })).toBeVisible({
    timeout: 30_000
  })
  shouldFail = false
  await page.getByRole('button', { name: '重新加载' }).click()
  await expect(page.locator('canvas.rack-scene__canvas')).toBeVisible()
})

test('立体库位多货架空间布局', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await installFixtures(page)
  const denseBins = Array.from({ length: 12 * 3 * 5 }, (_, index) => {
    const rackNumber = Math.floor(index / 15) + 1
    const column = Math.floor((index % 15) / 5) + 1
    const level = (index % 5) + 1
    return {
      ...bin,
      id: `ed276e75-d9d4-4742-a667-${String(index + 1).padStart(12, '0')}`,
      bin_code: `RAW-A-R${rackNumber}-C${column}-L${level}`,
      bin_name: `${rackNumber} 号货架 ${column} 列 ${level} 层`,
      bin_type: 'shelf',
      shelf_code: `A${String(rackNumber).padStart(2, '0')}`,
      column_no: column,
      level_no: level,
      status: index % 17 === 0 ? 'locked' : 'available',
      sort: index + 1
    }
  })
  await page.route('**/rest/v1/mdm_warehouse_bin?*', (route) => route.fulfill({ json: denseBins }))
  await page.goto('#/mdm/inventory-master/bin-3d', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '立体库位', exact: true })).toBeVisible({
    timeout: 60_000
  })
  await expect(page.getByText('12 组货架 · 180 个层位')).toBeVisible()
  await expect(page.locator('canvas.rack-scene__canvas')).toBeVisible()
  const settingGuide = page.getByRole('button', { name: '知道了' })
  if (await settingGuide.isVisible()) {
    await settingGuide.click()
    await expect(settingGuide).toBeHidden()
  }
  const visualDir = join(process.cwd(), '.artifacts', 'wms-visual', testInfo.project.name)
  mkdirSync(visualDir, { recursive: true })
  await page.screenshot({ path: join(visualDir, 'mdm-bin-3d-dense.png'), fullPage: true })
  await page.getByRole('button', { name: /^RAW-A-R1-C1-L1，/ }).click()
  await expect(page.getByText('RAW-A-R1-C1-L1', { exact: true }).last()).toBeVisible()
  await page.screenshot({ path: join(visualDir, 'mdm-bin-3d-dense-focused.png') })
})

test('出入库类型查询、保存、复制、删除与导出', async ({ page }) => {
  test.setTimeout(120_000)
  page.setDefaultTimeout(15_000)
  await installFixtures(page)
  const savePayloads: Record<string, unknown>[] = []
  const deletePayloads: Record<string, unknown>[] = []
  await page.route('**/rest/v1/rpc/mdm_save_stock_movement_type_secure', (route) => {
    savePayloads.push(route.request().postDataJSON() as Record<string, unknown>)
    return route.fulfill({ json: 'f765ef91-27e6-48e3-94e2-2dd8360b6dc2' })
  })
  await page.route('**/rest/v1/rpc/mdm_delete_stock_movement_types_secure', (route) => {
    deletePayloads.push(route.request().postDataJSON() as Record<string, unknown>)
    return route.fulfill({ json: 1 })
  })
  await page.goto('#/mdm/inventory-master/movement-type', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '出入库类型', exact: true })).toBeVisible()
  await expect(page.getByText('采购退货出库', { exact: true }).first()).toBeVisible()

  const searchRequest = page.waitForRequest(
    (request) =>
      request.url().includes('/mdm_stock_movement_type?') && request.url().includes('or=')
  )
  await page.getByPlaceholder('输入移动类型编码或名称').fill('102')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  expect(new URL((await searchRequest).url()).searchParams.get('or')).toContain('102')
  await page.getByRole('button', { name: '重置', exact: true }).click()

  await page.getByRole('button', { name: '新增类型' }).click()
  const addDialog = page.locator('.el-dialog:visible')
  await expect(addDialog.locator('.el-form-item').filter({ hasText: '所属租户' })).toHaveCount(0)
  await addDialog
    .locator('.el-form-item')
    .filter({ hasText: '移动类型编码' })
    .locator('input')
    .fill('103')
  await addDialog
    .locator('.el-form-item')
    .filter({ hasText: '移动类型名称' })
    .locator('input')
    .fill('库存转移')
  await addDialog.getByText('库存转移', { exact: true }).last().click()
  await addDialog.getByRole('button', { name: '创建类型' }).click()
  await expect(addDialog).toHaveCount(0)
  expect(savePayloads[0]?.p_id).toBeNull()
  expect(savePayloads[0]?.p_tenant_id).toBe(tenantId)
  expect(savePayloads[0]?.p_payload).toMatchObject({ movement_code: '103', direction: 'transfer' })

  await page.getByRole('button', { name: '编辑类型' }).first().click()
  const editDialog = page.locator('.el-dialog:visible')
  await editDialog
    .locator('.el-form-item')
    .filter({ hasText: '移动类型名称' })
    .locator('input')
    .fill('采购收货入库')
  await editDialog.getByRole('button', { name: '保存更改' }).click()
  await expect(editDialog).toHaveCount(0)
  expect(savePayloads[1]?.p_id).toBe('f765ef91-27e6-48e3-94e2-2dd8360b6dc0')
  expect(savePayloads[1]?.p_payload).toMatchObject({ movement_name: '采购收货入库' })

  await page.getByRole('button', { name: '更多操作' }).nth(1).click()
  await page.getByRole('menuitem', { name: '复制类型' }).click()
  const copyDialog = page.locator('.el-dialog:visible')
  await copyDialog
    .locator('.el-form-item')
    .filter({ hasText: '移动类型编码' })
    .locator('input')
    .fill('104')
  await copyDialog.getByRole('button', { name: '创建类型' }).click()
  await expect(copyDialog).toHaveCount(0)
  expect(savePayloads[2]?.p_id).toBeNull()
  expect(savePayloads[2]?.p_payload).toMatchObject({ movement_code: '104', direction: 'outbound' })

  await page.getByRole('button', { name: '更多操作' }).nth(1).click()
  await page.getByRole('menuitem', { name: '删除类型' }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  expect(deletePayloads[0]?.p_ids).toEqual(['f765ef91-27e6-48e3-94e2-2dd8360b6dc1'])

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出', exact: true }).click()
  expect((await downloadPromise).suggestedFilename()).toMatch(/^出入库类型_.*\.xlsx$/)
})

test('生产工单类型显示可配置的领料仓库范围', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await installFixtures(page)
  const root = {
    id: 'wms-document-root',
    parentId: null,
    name: 'MdmMasterData',
    path: '/mdm',
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: meta('MDM主数据')
  }
  const folder = {
    id: 'wms-operational-root',
    parentId: root.id,
    name: 'MdmOperationalMaster',
    path: 'operational-master',
    component: '',
    type: 'folder',
    sort: 1,
    meta: meta('运营主数据')
  }
  const menu = {
    id: 'wms-document-menu',
    parentId: folder.id,
    name: 'MdmDocumentType',
    path: 'document-type',
    component: '/mdm/document-type',
    type: 'menu',
    sort: 1,
    meta: meta('单据类型')
  }
  const buttons = ['View', 'Add', 'Copy', 'Edit', 'Delete', 'Export'].map((action) => ({
    id: `wms-document-${action}`,
    parentId: menu.id,
    name: `MdmDocumentType:${action}`,
    path: '',
    component: '',
    type: 'button',
    sort: 1,
    meta: meta(action),
    children: []
  }))
  const flat = [root, folder, menu, ...buttons]
  await mockApplicationMenus(page, { mdm: flat })
  await page.route('**/rest/v1/sys_menu?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'wms-work-order-menu',
          parent_id: null,
          name: 'MesWorkOrder',
          path: '/mes/production-plan/work-order',
          component: '/mes/production-plan/work-order',
          type: 'menu',
          app_code: 'mes',
          sort: 1,
          meta: meta('生产工单')
        },
        {
          id: 'wms-initial-stock-menu',
          parent_id: null,
          name: 'WmsInitialStock',
          path: 'initial-stock',
          component: '/wms/initialization/initial-stock',
          type: 'menu',
          app_code: 'wms',
          sort: 2,
          meta: meta('初始库存单')
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_document_type?*', (route) =>
    route.fulfill({
      status: 206,
      headers: { 'content-range': '0-0/1' },
      json: [
        {
          id: 'wms-type-id',
          tenant_id: tenantId,
          menu_id: 'wms-work-order-menu',
          menu_ids: ['wms-work-order-menu'],
          document_type_code: 'PP13',
          document_type_name: '演示成品装配',
          is_default: false,
          remark: '',
          sort_order: 10,
          text_color: '',
          tag_style: 'primary',
          enabled: true,
          extension_fields: [],
          allowed_issue_warehouse_types: ['raw_material'],
          tenant: { tenant_code: 'DEMO', tenant_name: '示例工厂' }
        }
      ]
    })
  )
  await page.goto('#/mdm/operational-master/document-type', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.getByRole('heading', { name: '单据类型', exact: true })).toBeVisible({
    timeout: 120_000
  })
  await expect(page.getByText('演示成品装配', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.locator('.el-dialog:visible')
  const field = dialog.locator('.el-form-item').filter({ hasText: '允许领料的仓库类型' })
  await expect(field).toBeVisible()
  await expect(field).toContainText('原料仓')
  await field.scrollIntoViewIfNeeded()
  const visualDir = join(process.cwd(), '.artifacts', 'wms-visual', testInfo.project.name)
  mkdirSync(visualDir, { recursive: true })
  await page.screenshot({ path: join(visualDir, 'mdm-work-order-type-policy.png'), fullPage: true })
  await field.locator('.el-select').click()
  await page.getByRole('option', { name: '成品仓' }).click()
  await expect(field).toContainText('成品仓')
  const menuField = dialog.locator('.el-form-item').filter({ hasText: '所属菜单功能' })
  await menuField.scrollIntoViewIfNeeded()
  await menuField.locator('.el-select').click()
  await page.locator('.el-select-dropdown:visible').getByText('初始库存单', { exact: true }).click()
  await expect(menuField).toContainText('生产工单')
  await expect(menuField).toContainText('+ 1')
  await page.screenshot({
    path: join(visualDir, 'mdm-work-order-type-policy-selected.png'),
    fullPage: true
  })
  const saveRequest = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().includes('/mdm_document_type?')
  )
  await dialog.getByRole('button', { name: '保存更改' }).click()
  const payload = (await saveRequest).postDataJSON() as {
    allowed_issue_warehouse_types: string[]
    menu_ids: string[]
  }
  expect(payload.allowed_issue_warehouse_types).toEqual(['raw_material', 'finished'])
  expect(payload.menu_ids).toEqual(['wms-work-order-menu', 'wms-initial-stock-menu'])
})

test('业务类型可选择多个单据类型和菜单并设置出入库标志', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await installFixtures(page)
  const root = {
    id: 'mdm-business-root',
    parentId: null,
    name: 'MdmMasterData',
    path: '/mdm',
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: meta('MDM主数据')
  }
  const folder = {
    id: 'mdm-business-folder',
    parentId: root.id,
    name: 'MdmUnifiedGovernance',
    path: 'governance',
    component: '',
    type: 'folder',
    sort: 1,
    meta: meta('统一治理目录')
  }
  const menu = {
    id: 'mdm-business-menu',
    parentId: folder.id,
    name: 'MdmBusinessType',
    path: 'business-type',
    component: '/mdm/governance/business-type',
    type: 'menu',
    sort: 1,
    meta: meta('业务类型')
  }
  const buttons = ['View', 'Add', 'Copy', 'Edit', 'Delete', 'Export'].map((action) => ({
    id: `mdm-business-${action}`,
    parentId: menu.id,
    name: `MdmBusinessType:${action}`,
    path: '',
    component: '',
    type: 'button',
    sort: 1,
    meta: meta(action),
    children: []
  }))
  await mockApplicationMenus(page, { mdm: [root, folder, menu, ...buttons] })
  const menuRows = [
    {
      id: 'production-menu',
      parent_id: null,
      name: 'MesWorkOrder',
      path: '/mes/production-plan/work-order',
      component: '/mes/production-plan/work-order',
      type: 'menu',
      app_code: 'mes',
      sort: 1,
      meta: meta('生产工单')
    },
    {
      id: 'stock-menu',
      parent_id: null,
      name: 'WmsInitialStock',
      path: 'initial-stock',
      component: '/wms/initialization/initial-stock',
      type: 'menu',
      app_code: 'wms',
      sort: 2,
      meta: meta('初始库存单')
    }
  ]
  await page.route('**/rest/v1/sys_menu?*', (route) => route.fulfill({ json: menuRows }))
  const documentType = {
    id: 'business-document-type',
    tenant_id: tenantId,
    menu_id: 'production-menu',
    menu_ids: ['production-menu', 'stock-menu'],
    document_type_code: 'TEST_DOC',
    document_type_name: '测试单据类型',
    enabled: true
  }
  const secondDocumentType = {
    ...documentType,
    id: 'second-business-document-type',
    menu_id: 'stock-menu',
    menu_ids: ['stock-menu'],
    document_type_code: 'STOCK_DOC',
    document_type_name: '库存单据类型'
  }
  await page.route('**/rest/v1/mdm_document_type?*', (route) =>
    route.fulfill({
      status: 206,
      headers: { 'content-range': '0-1/2' },
      json: [documentType, secondDocumentType]
    })
  )
  const businessType = {
    id: 'business-type-id',
    tenant_id: tenantId,
    document_type_id: documentType.id,
    document_type_ids: [documentType.id],
    menu_ids: ['production-menu'],
    business_type_code: 'TEST_BUSINESS',
    business_type_name: '测试业务类型',
    is_default: false,
    source_business_type_id: null,
    inventory_direction: null,
    stock_movement: 'inbound',
    owner_type: null,
    inventory_accounting: false,
    remark: '',
    sort_order: 10,
    text_color: '',
    tag_style: 'primary',
    enabled: true,
    documentType
  }
  await page.route('**/rest/v1/mdm_business_type?*', (route) =>
    route.fulfill({ status: 206, headers: { 'content-range': '0-0/1' }, json: [businessType] })
  )
  await page.goto('#/mdm/governance/business-type', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '业务类型', exact: true })).toBeVisible({
    timeout: 120_000
  })
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.locator('.el-dialog:visible')
  const menuField = dialog.locator('.el-form-item').filter({ hasText: '所属菜单功能' })
  await expect(menuField.locator('.el-select')).toBeEnabled()
  await menuField.scrollIntoViewIfNeeded()
  const menuInput = menuField.getByRole('combobox')
  await menuInput.press('ArrowDown')
  await expect(menuInput).toHaveAttribute('aria-expanded', 'true')
  await page.locator('.el-select-dropdown:visible').getByText('初始库存单', { exact: true }).click()
  await expect(menuField).toContainText('+ 1')
  const documentField = dialog.locator('.el-form-item').filter({ hasText: '所属单据类型' })
  await documentField.scrollIntoViewIfNeeded()
  await documentField.getByRole('combobox').press('ArrowDown')
  await page
    .locator('.el-select-dropdown:visible')
    .getByText('测试单据类型 · TEST_DOC', { exact: true })
    .click()
  await page
    .locator('.el-select-dropdown:visible')
    .getByText('库存单据类型 · STOCK_DOC', { exact: true })
    .click()
  await expect(documentField).toContainText('+ 1')
  await documentField.getByRole('combobox').press('Escape')
  const movementField = dialog.locator('.el-form-item').filter({ hasText: '出入库标志' })
  await movementField.scrollIntoViewIfNeeded()
  await movementField.locator('.el-select').click()
  await page.locator('.el-select-dropdown:visible').getByText('出库', { exact: true }).click()
  const visualDir = join(process.cwd(), '.artifacts', 'wms-visual', testInfo.project.name)
  mkdirSync(visualDir, { recursive: true })
  await page.screenshot({ path: join(visualDir, 'mdm-business-type-menus.png'), fullPage: true })
  const saveRequest = page.waitForRequest(
    (request) => request.method() === 'PATCH' && request.url().includes('/mdm_business_type?')
  )
  await dialog.getByRole('button', { name: '保存更改' }).click()
  const payload = (await saveRequest).postDataJSON() as {
    menu_ids: string[]
    document_type_ids: string[]
    stock_movement: string
  }
  expect(payload.menu_ids).toEqual(['production-menu', 'stock-menu'])
  expect(payload.document_type_ids).toEqual([documentType.id, secondDocumentType.id])
  expect(payload.stock_movement).toBe('outbound')
})

test('启用库存默认勾选默认库存组织', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await installFixtures(page)
  const root = {
    id: 'wms-root',
    parentId: null,
    name: 'WmsWarehouseManagement',
    path: '/wms',
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: meta('WMS仓储管理')
  }
  const folder = {
    id: 'wms-initialization',
    parentId: root.id,
    name: 'WmsInitialization',
    path: 'initialization',
    component: '',
    type: 'folder',
    sort: 1,
    meta: meta('初始化')
  }
  const menu = {
    id: 'wms-enable',
    parentId: folder.id,
    name: 'WmsInventoryEnable',
    path: 'enable-inventory',
    component: '/wms/initialization/enable-inventory',
    type: 'menu',
    sort: 1,
    meta: meta('启用库存')
  }
  const buttons = ['View', 'Enable', 'Disable'].map((action) => ({
    id: `wms-enable-${action}`,
    parentId: menu.id,
    name: `WmsInventoryEnable:${action}`,
    path: '',
    component: '',
    type: 'button',
    sort: 1,
    meta: meta(action),
    children: []
  }))
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({
      json: [
        { code: 'platform', name: '测试平台', baseUrl: '/' },
        { code: 'wms', name: 'WMS仓储管理', baseUrl: '/wms/' }
      ]
    })
  )
  await mockApplicationMenus(page, { wms: [root, folder, menu, ...buttons] })
  await page.route('**/rest/v1/mdm_organization?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'test-inventory-organization',
          tenant_id: tenantId,
          organization_code: 'TEST-ORG',
          organization_name: '测试库存组织',
          organization_type: 'company',
          status: '1'
        }
      ]
    })
  )
  await page.route('**/rest/v1/wms_inventory_initialization?*', (route) =>
    route.fulfill({ json: [] })
  )
  await page.goto('#/wms/initialization/enable-inventory', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '启用库存', exact: true })).toBeVisible({
    timeout: 120_000
  })
  await expect(page.getByText('测试库存组织')).toBeVisible()
  await page.getByRole('button', { name: '启用', exact: true }).click()
  const dialog = page.locator('.el-dialog:visible')
  await expect(dialog.getByText('默认库存组织', { exact: true })).toBeVisible()
  const defaultField = dialog.locator('.el-form-item').filter({ hasText: '默认库存组织' })
  await expect(defaultField.getByRole('radio', { name: '是' })).toBeChecked()
  await page.waitForTimeout(350)
  const visualDir = join(process.cwd(), '.artifacts', 'wms-visual', testInfo.project.name)
  mkdirSync(visualDir, { recursive: true })
  await page.screenshot({
    path: join(visualDir, 'wms-enable-default-organization.png'),
    fullPage: true
  })
})

test('物料编码列表描述与编辑字段使用同一规则', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await installFixtures(page)
  await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
  const root = {
    id: 'mdm-material-root',
    parentId: null,
    name: 'MdmMasterData',
    path: '/mdm',
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: meta('MDM主数据')
  }
  const folder = {
    id: 'mdm-material-folder',
    parentId: root.id,
    name: 'MdmMaterialMaster',
    path: 'material-master',
    component: '',
    type: 'folder',
    sort: 1,
    meta: meta('物料主数据')
  }
  const menu = {
    id: 'mdm-material-menu',
    parentId: folder.id,
    name: 'MdmMaterialArchive',
    path: 'material-archive',
    component: '/mdm/material/archive',
    type: 'menu',
    sort: 1,
    meta: meta('物料编码')
  }
  const buttons = ['View', 'Edit'].map((action) => ({
    id: `mdm-material-${action}`,
    parentId: menu.id,
    name: `MdmMaterialArchive:${action}`,
    path: '',
    component: '',
    type: 'button',
    sort: 1,
    meta: meta(action)
  }))
  await mockApplicationMenus(page, { mdm: [root, folder, menu, ...buttons] })
  const categoryId = '7c58fe75-24dc-4ca1-b59c-1ed04a872cc3'
  await page.route('**/rest/v1/mdm_material_category?*', (route) =>
    route.fulfill({
      json: [
        {
          id: categoryId,
          tenant_id: tenantId,
          category_code: 'B00',
          category_name: '雨篷配件',
          parent_id: null,
          status: 'enabled',
          sort: 10,
          composition_columns: ['material_name', 'specification_model', 'material_composition'],
          composition_separator: ' _'
        }
      ]
    })
  )
  await page.route('**/rest/v1/mdm_material?*', (route) =>
    route.fulfill({
      headers: { 'content-range': '0-0/1' },
      json: [
        {
          ...material,
          material_code: 'B00-0037',
          material_name: '雨篷侧封檐',
          category_id: categoryId,
          category: { id: categoryId, category_code: 'B00', category_name: '雨篷配件' },
          specification_model: '展宽 360 mm × 长度 1.1 m',
          material_composition: '蓝色彩钢板',
          attribute_values: {},
          image_urls: [],
          description: '蓝色彩钢板；雨篷侧面',
          status: 'enabled',
          sort: 10
        }
      ]
    })
  )
  await page.goto('#/mdm/material-master/material-archive', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '物料编码', exact: true })).toBeVisible({
    timeout: 60_000
  })
  const row = page.locator('.el-table__body tr').filter({ hasText: 'B00-0037' })
  await expect(row).toContainText('雨篷侧封檐 _展宽 360 mm × 长度 1.1 m _蓝色彩钢板')
  await expect(row).not.toContainText('蓝色彩钢板；雨篷侧面')
  await row
    .locator('td')
    .filter({ hasText: '雨篷侧封檐 _展宽 360 mm × 长度 1.1 m _蓝色彩钢板' })
    .scrollIntoViewIfNeeded()
  const themeTip = page.getByRole('button', { name: '知道了' })
  if (await themeTip.isVisible()) await themeTip.click()
  const visualDir = join(process.cwd(), '.artifacts', 'mdm-visual', testInfo.project.name)
  mkdirSync(visualDir, { recursive: true })
  await page.screenshot({ path: join(visualDir, 'material-description.png'), fullPage: true })
  await row.getByRole('button', { name: '编辑' }).click()
  await expect(page.getByRole('textbox', { name: '自动生成的物料描述' })).toHaveValue(
    '雨篷侧封檐 _展宽 360 mm × 长度 1.1 m _蓝色彩钢板'
  )
})

test('库区新增弹窗先出现，再等待基础数据', async ({ page }) => {
  await installFixtures(page)
  await page.goto('#/mdm/inventory-master/zone', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '库区管理', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '新增库区' })).toBeEnabled()

  let releaseCategories!: () => void
  const categoryGate = new Promise<void>((resolve) => {
    releaseCategories = resolve
  })
  await page.route('**/rest/v1/mdm_material_category*', async (route) => {
    await categoryGate
    await route.fulfill({ json: [] })
  })

  try {
    await page.getByRole('button', { name: '新增库区' }).click()
    const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增库区' })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.art-overlay-loading.is-loading')).toBeVisible()
  } finally {
    releaseCategories()
  }
  await expect(page.locator('.el-dialog:visible .art-overlay-loading.is-loading')).toHaveCount(0)
})

test('库区和库位筛选无结果时保留筛选与重置入口', async ({ page }) => {
  await installFixtures(page)
  await page.goto('#/mdm/inventory-master/zone', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '库区管理', exact: true })).toBeVisible()
  const zoneCard = page.locator('.zone-tile').first()
  const zoneMore = zoneCard.getByRole('button', { name: /^操作/ })
  if ((page.viewportSize()?.width ?? 0) > 1200) {
    await expect(zoneCard.locator('.storage-card-actions')).toHaveCSS('opacity', '0')
  }
  await zoneCard.locator('.storage-tile').hover()
  await expect(zoneCard.locator('.storage-card-actions')).toHaveCSS('opacity', '1')
  await zoneMore.click()
  await expect(page.getByRole('menuitem', { name: '编辑库区' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '删除库区' })).toBeVisible()
  await page.keyboard.press('Escape')

  const zoneFilters = page.locator('.el-checkbox-group:visible').last()
  await expect(zoneFilters.locator('.el-checkbox')).toHaveCount(4)
  for (const label of ['可存', '有库存', '异常', '停用']) {
    await zoneFilters.getByText(label, { exact: true }).click()
  }
  await expect(page.getByText('暂无匹配库区', { exact: true })).toBeVisible()
  await expect(page.locator('.el-checkbox-group .el-checkbox')).toHaveCount(4)
  await page.getByRole('button', { name: '重置筛选' }).first().click()
  await expect(page.locator('.zone-tile').first()).toBeVisible()

  await page.goto('#/mdm/inventory-master/bin', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '库位管理', exact: true })).toBeVisible()
  const binFilters = page.locator('.el-checkbox-group:visible').last()
  await expect(binFilters.locator('.el-checkbox')).toHaveCount(4)
  for (const label of ['可存', '有库存', '异常', '停用']) {
    await binFilters.getByText(label, { exact: true }).click()
  }
  await expect(page.getByText('暂无匹配库位', { exact: true })).toBeVisible()
  await expect(page.locator('.el-checkbox-group .el-checkbox')).toHaveCount(4)
  await page.getByRole('button', { name: '重置筛选' }).first().click()
  await expect(page.locator('.rack-facade')).toBeVisible()
})

test('新增库区时可选分类为空会提交 null', async ({ page }) => {
  await installFixtures(page)
  await page.route('**/rest/v1/mdm_material_category*', (route) =>
    route.fulfill({
      json: [{ id: materialId, category_code: 'BOARD', category_name: '板材', status: 'enabled' }]
    })
  )
  let submitted: Record<string, unknown> | undefined
  await page.route('**/rest/v1/mdm_warehouse_zone?*', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    submitted = route.request().postDataJSON() as Record<string, unknown>
    await route.fulfill({ status: 201, json: [{ id: zoneId }] })
  })
  await page.goto('#/mdm/inventory-master/zone', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '新增库区' }).click()
  const dialog = page.locator('.el-dialog:visible').filter({ hasText: '新增库区' })
  await expect(dialog.locator('.art-overlay-loading.is-loading')).toHaveCount(0)
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '库区编码' })
    .locator('input')
    .fill('C100201')
  await dialog
    .locator('.el-form-item')
    .filter({ hasText: '库区名称' })
    .locator('input')
    .fill('货架区')
  const categoryField = dialog.locator('.el-form-item').filter({ hasText: '存放物料分类' })
  await categoryField.locator('.el-select').click()
  await page.getByRole('option', { name: '板材 · BOARD' }).click()
  await categoryField.locator('.el-select').hover()
  await categoryField.locator('.el-select__clear').click()
  await dialog.getByRole('button', { name: '确定' }).click()
  await expect
    .poll(() => submitted)
    .toMatchObject({
      zone_code: 'C100201',
      zone_name: '货架区',
      category_id: null,
      purpose: null
    })
  await expect(dialog).toBeHidden()
})
