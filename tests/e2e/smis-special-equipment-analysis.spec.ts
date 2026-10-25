import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { prepareAppearance } from './support/appearance'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)
for (const theme of ['light', 'dark'] as const)
  for (const boxBorderMode of [true, false]) {
    test(`特种设备报表统计及竞态 ${theme} ${boxBorderMode ? 'border' : 'shadow'}`, async ({
      page
    }, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await prepareIsolatedSession(page)
      await prepareAppearance(page, { theme, boxBorderMode })
      const path = '/smis/equipment-ledger/special-equipment-analysis'
      const menu = {
        id: 'SmisSpecialEquipmentAnalysis',
        parentId: null,
        name: 'SmisSpecialEquipmentAnalysis',
        path,
        component: path,
        type: 'menu',
        sort: 1,
        meta: { title: '特种设备统计分析', is_enable: true, is_hide: false, roles: [] }
      }
      await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
      await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
        route.fulfill({
          json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }]
        })
      )
      await mockApplicationMenus(page, {
        smis: [
          menu,
          {
            ...menu,
            id: `${menu.id}-View`,
            parentId: menu.id,
            name: `${menu.name}:View`,
            type: 'button',
            path: '',
            component: ''
          }
        ]
      })
      let failure = false
      let empty = false
      let fresh = false
      let holdOld = false
      let staleFailure = false
      let releaseOld: (() => void) | undefined
      await page.route(
        '**/rest/v1/rpc/smis_get_special_equipment_analysis_secure',
        async (route) => {
          const old = holdOld && route.request().postDataJSON().p_organization_id === 'org-a'
          if (old)
            await new Promise<void>((resolve) => {
              releaseOld = resolve
            })
          if (failure || (old && staleFailure))
            return route.fulfill({
              status: 503,
              json: { code: 'XX000', message: 'database unavailable' }
            })
          const total = empty ? 0 : old ? 99 : fresh ? 23 : 12
          return route.fulfill({
            json: {
              rows: empty
                ? []
                : [
                    {
                      organizationId: 'org-a',
                      organizationName: '同名部门',
                      categoryId: 'cat-a',
                      categoryName: '测试分类',
                      count: 3
                    },
                    {
                      organizationId: 'org-a',
                      organizationName: '同名部门',
                      categoryId: 'cat-a',
                      categoryName: '测试分类',
                      count: 2
                    },
                    {
                      organizationId: 'org-b',
                      organizationName: '同名部门',
                      categoryId: 'cat-a',
                      categoryName: '测试分类',
                      count: total - 5
                    }
                  ],
              categories: empty
                ? []
                : [{ categoryId: 'cat-a', categoryName: '测试分类', count: total }],
              organizations: ['org-a', 'org-b'].map((id) => ({
                id,
                parentId: null,
                organizationName: '同名部门',
                sort: 1
              })),
              overview: {
                total,
                organizationCount: empty ? 0 : 2,
                categoryCount: empty ? 0 : 1,
                boilerCount: total,
                majorHazardCount: 0
              }
            }
          })
        }
      )
      await page.goto(`#${path}`)
      const metric = page.locator('.business-workspace-header__metric').first().locator('strong')
      await expect(metric).toHaveText('12', { timeout: 60_000 })
      await expect(page.locator('html')).toHaveAttribute(
        'data-box-mode',
        boxBorderMode ? 'border-mode' : 'shadow-mode'
      )
      if (theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
      else await expect(page.locator('html')).not.toHaveClass(/dark/)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('initial.png'), animations: 'disabled' })
      const card = page
        .locator('.art-section-card')
        .filter({ has: page.getByText('特种设备部门分类报表', { exact: true }) })
      const rows = card.locator('.el-table__body-wrapper tr.el-table__row')
      await expect(rows).toHaveCount(2)
      await expect(rows.nth(0).locator('td').nth(2)).toHaveText('5')
      await expect(rows.nth(1).locator('td').nth(2)).toHaveText('7')
      failure = true
      await page.getByRole('button', { name: '生成统计报表', exact: true }).click()
      await expect(card.getByText('内容加载失败', { exact: true })).toBeVisible()
      await expect(metric).toHaveText('12')
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      await expect(page.getByText(/database unavailable|XX000/)).toHaveCount(0)
      failure = false
      await card.getByRole('button', { name: '重新加载', exact: true }).click()
      await expect(rows).toHaveCount(2)
      await card.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: testInfo.outputPath('same-name-departments.png'),
        animations: 'disabled'
      })
      const organization = page.getByRole('combobox', { name: '统计部门', exact: true })
      for (const failOld of [false, true]) {
        holdOld = true
        staleFailure = failOld
        releaseOld = undefined
        await organization.click()
        await page.getByRole('treeitem').filter({ hasText: '同名部门' }).first().click()
        await page.getByRole('button', { name: '生成统计报表', exact: true }).click()
        await expect.poll(() => Boolean(releaseOld)).toBe(true)
        fresh = true
        holdOld = false
        await page.getByRole('button', { name: '重置', exact: true }).click()
        await expect(metric).toHaveText('23')
        const response = page.waitForResponse(
          (reply) =>
            reply.url().includes('smis_get_special_equipment_analysis_secure') &&
            reply.request().postDataJSON().p_organization_id === 'org-a'
        )
        if (!releaseOld) throw new Error('旧请求尚未开始')
        releaseOld()
        await (await response).finished()
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        )
        await expect(metric).toHaveText('23')
        await expect(card.getByText('内容加载失败', { exact: true })).toHaveCount(0)
        await expect(page.locator('.el-message--error')).toHaveCount(0)
      }
      empty = true
      await page.getByRole('button', { name: '生成统计报表', exact: true }).click()
      await expect(card.getByText('暂无可生成的部门报表', { exact: true })).toBeVisible()
      await expect(metric).toHaveText('0')
      expect(errors).toEqual([])
    })
  }
