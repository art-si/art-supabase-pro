import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { installFixtures, meta } from './support/inventory-fixtures'
import { mockApplicationMenus } from './support/menu-rpc'
import { expectInputTextUnclipped } from './support/input-text-width'
import { installQueryDateClock } from './support/query-date-range'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })

const targets = [
  {
    app: 'wms',
    title: '调拨申请单',
    route: '/wms/transfer-business/transfer-request',
    name: 'WmsTransfer',
    label: '申请日期',
    key: 'applicationDateRange'
  },
  {
    app: 'fms',
    title: '运单费用',
    route: '/fms/settlement/waybill-cost',
    name: 'FinanceWaybillCost',
    label: '计划付款日',
    key: 'plannedPaymentDateRange',
    tab: '费用报销与支付'
  },
  {
    app: 'mes',
    title: '作业任务',
    route: '/mes/production-plan/operation-task',
    name: 'MesOperationTask',
    label: '工单开工',
    key: 'workOrderStartDates',
    shortcut: '今天'
  }
]

for (const target of targets) {
  test(`${target.title}日期筛选跨窄屏断点不溢出且回焦`, async ({ page }, info) => {
    test.setTimeout(110_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await installQueryDateClock(page)
    await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
    if (target.app === 'wms') await installFixtures(page)
    else await prepareIsolatedSession(page)
    const menu = {
      id: target.name,
      parentId: null,
      name: target.name,
      path: target.route,
      component: target.route,
      type: 'menu',
      sort: 1,
      meta: meta(target.title)
    }
    await mockApplicationMenus(page, {
      [target.app]: [
        menu,
        {
          ...menu,
          id: `${menu.id}-view`,
          parentId: menu.id,
          name: `${menu.name}:View`,
          path: '',
          component: '',
          type: 'button'
        }
      ]
    })
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [{ code: target.app, name: '验收应用', baseUrl: `/${target.app}/` }]
      })
    )
    const paymentRequests: unknown[] = []
    if (target.tab) {
      await page.route('**/rest/v1/rpc/tms_list_expense_reimbursements_secure', (route) => {
        paymentRequests.push(route.request().postDataJSON())
        return route.fulfill({ json: { records: [], total: 0, fieldAccess: {} } })
      })
    }
    await page.goto(`#${target.route}`, { waitUntil: 'domcontentloaded' })
    const search = page.locator('.art-search-bar:visible')
    await expect(search).toHaveCount(1, { timeout: 60_000 })
    const hint = page.getByText('知道了', { exact: true })
    if (await hint.isVisible()) await hint.click()
    if (target.tab) await page.getByRole('tab', { name: new RegExp(target.tab) }).click()
    const field = search.locator(`[data-art-form-item-key="${target.key}"]`)
    const label = field.locator('.el-form-item__label')
    const editor = field.locator('.el-range-editor')
    const start = field.getByPlaceholder('开始日期')
    const end = field.getByPlaceholder('结束日期')
    const popup = page.locator('.el-picker__popper:has(.el-date-range-picker):visible')
    const submit = search.getByRole('button', { name: '查询', exact: true })

    const breakpoint = target.shortcut ? 782 : 672
    const widths = target.shortcut ? [641, 757, 758, 781, 782] : [390, 641, 647, 656, 671, 672]
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 })
      if (!(await start.isVisible())) {
        const expand = search.getByRole('button', { name: '展开', exact: true })
        if (await expand.isVisible()) await expand.click()
      }
      await expect(label).toHaveText(target.label)
      await expect(label).toHaveCSS('text-align', 'right')
      await expect(label).toHaveCSS('justify-content', 'flex-end')
      const labelText = label.locator('.art-form-item__label > span')
      await expect(labelText).toHaveCSS('white-space', 'nowrap')
      expect(await labelText.evaluate((span) => span.scrollWidth - span.clientWidth)).toBe(0)
      const [labelBox, editorBox] = await Promise.all([label.boundingBox(), editor.boundingBox()])
      const labelCenter = labelBox!.y + labelBox!.height / 2
      const editorCenter = editorBox!.y + editorBox!.height / 2
      expect(Math.abs(labelCenter - editorCenter)).toBeLessThan(1)
      await start.press('ArrowDown')
      await expect(popup).toBeVisible()
      const geometry = await popup.evaluate((element) => {
        const panel = element.getBoundingClientRect()
        const months = [...element.querySelectorAll('.el-date-range-picker__content')].map(
          (month) => month.getBoundingClientRect().top
        )
        return {
          left: panel.left,
          right: panel.right,
          panelWidth: panel.width,
          documentWidth: document.documentElement.scrollWidth,
          stacked: Math.abs(months[0]! - months[1]!) > 1
        }
      })
      expect(geometry.left).toBeGreaterThanOrEqual(0)
      expect(geometry.right).toBeLessThanOrEqual(width)
      expect(geometry.documentWidth).toBe(width)
      expect(geometry.stacked).toBe(width < breakpoint)
      if (width < breakpoint) expect(geometry.panelWidth).toBeLessThanOrEqual(width - 22)
      if (target.shortcut) {
        const shortcut = popup.getByRole('button', { name: target.shortcut, exact: true })
        await expect(shortcut).toBeVisible()
        if (width === 757) {
          await page.screenshot({
            path: info.outputPath('date-query-shortcuts-757.png'),
            animations: 'disabled'
          })
          await shortcut.click()
          await expect(start).toHaveValue('2026-11-16')
          await expect(end).toHaveValue('2026-11-16')
        } else await page.keyboard.press('Escape')
      } else if (width === 641) {
        await page.screenshot({
          path: info.outputPath('date-query-popup-641.png'),
          animations: 'disabled'
        })
        const months = popup.locator('.el-date-range-picker__content')
        await months.first().locator('td.available').filter({ hasText: /^7$/ }).click()
        await months.last().locator('td.available').filter({ hasText: /^10$/ }).click()
        await expect(start).toHaveValue('2026-11-07')
        await expect(end).toHaveValue('2026-12-10')
        await expectInputTextUnclipped(start.or(end))
      } else await page.keyboard.press('Escape')
      await expect(popup).toBeHidden()
      await expect(start).toBeFocused()
      await expect(submit).toBeEnabled()
    }

    if (target.tab) {
      await submit.click()
      await expect
        .poll(() => paymentRequests.at(-1))
        .toMatchObject({
          p_planned_payment_date_start: '2026-11-07',
          p_planned_payment_date_end: '2026-12-10'
        })
    }
  })
}
