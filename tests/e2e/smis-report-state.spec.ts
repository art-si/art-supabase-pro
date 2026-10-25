import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareAppearance } from './support/appearance'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const scenario of [
  {
    name: 'SmisSafetyAccidentStatistics',
    title: '安全事故统计',
    path: '/smis/safety-production/safety-accident/safety-accident-statistics',
    rpc: 'smis_get_safety_accident_statistics_secure',
    organizationLabel: '事故发生组织',
    chartTitle: '事故发生趋势',
    emptyTitle: '当前范围暂无事故趋势',
    kind: 'accident'
  },
  {
    name: 'SmisTrainingStatisticsReport',
    title: '培训统计报表',
    path: '/smis/qualification-training/training-management/training-statistics-report',
    rpc: 'smis_safety_training_report_secure',
    organizationLabel: '培训组织',
    chartTitle: '培训执行趋势',
    emptyTitle: '当前范围暂无培训趋势',
    kind: 'training'
  },
  {
    name: 'SmisSafetyQualificationReportAnalysis',
    title: '安全资质报表分析',
    path: '/smis/qualification-training/safety-qualification-management/safety-qualification-report-analysis',
    rpc: 'smis_get_safety_qualification_analysis_secure',
    organizationLabel: '所属组织',
    chartTitle: '一、组织证件分布',
    emptyTitle: '当前范围暂无安全资质证件',
    kind: 'qualification'
  }
] as const) {
  const appearances =
    scenario.kind === 'accident'
      ? ([
          { theme: 'light', boxBorderMode: true },
          { theme: 'light', boxBorderMode: false },
          { theme: 'dark', boxBorderMode: true },
          { theme: 'dark', boxBorderMode: false }
        ] as const)
      : ([{ theme: 'light', boxBorderMode: true }] as const)
  for (const appearance of appearances) {
    test(`${scenario.title}失败保留与过期响应 ${appearance.theme} ${appearance.boxBorderMode ? 'border' : 'shadow'}`, async ({
      page
    }, testInfo) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await prepareIsolatedSession(page)
      await prepareAppearance(page, appearance)
      await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
      const menu = {
        id: scenario.name,
        parentId: null,
        name: scenario.name,
        path: scenario.path,
        component: scenario.path,
        type: 'menu',
        sort: 1,
        meta: { title: scenario.title, is_enable: true, is_hide: false, roles: [] }
      }
      await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
        route.fulfill({ json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }] })
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
          },
          ...(scenario.kind === 'training'
            ? [
                {
                  ...menu,
                  id: `${menu.id}-Export`,
                  parentId: menu.id,
                  name: `${menu.name}:Export`,
                  type: 'button',
                  path: '',
                  component: ''
                }
              ]
            : [])
        ]
      })
      const factory = (total: number, marker: string) => ({
        overview: {
          total,
          currentYear: total,
          highSeverity: 0,
          affectedPeople: total,
          planCount: total,
          completedPlanCount: total,
          recordCount: total,
          plannedPersonTimes: total,
          actualPersonTimes: total,
          trainingHours: total,
          outstandingCount: 0,
          completionRate: 100,
          attendanceRate: 100,
          totalCertificates: total,
          certificateHolders: total,
          warningCount: 0,
          expiringInRange: 0,
          dismissedInRange: 0,
          addedInRange: total
        },
        monthlyTrend: total
          ? [
              {
                month: '2026-10',
                planCount: total,
                recordCount: total,
                attendanceCount: total,
                trainingHours: total
              }
            ]
          : [],
        organizationDistribution: total
          ? [
              {
                organizationId: 'org-test',
                organizationName: `${marker}组织`,
                specialEquipmentPersonnel: total,
                specialEquipmentOperator: 0,
                specialOperation: 0,
                safetyManager: 0,
                registeredSafetyEngineer: 0,
                total
              }
            ]
          : [],
        organizationStats: total
          ? [
              {
                organizationId: 'org-test',
                organizationName: `${marker}组织`,
                planCount: total,
                recordCount: total,
                plannedPersonTimes: total,
                actualPersonTimes: total,
                trainingHours: total,
                completionRate: 100,
                attendanceRate: 100
              }
            ]
          : [],
        categoryStats: [],
        trend: total ? [{ label: '2026-10', count: total }] : [],
        levels: [],
        categories: [],
        organizations: [],
        attendanceStats: [],
        outstandingPlans: [],
        topHolders: [],
        periodStats: [],
        equipmentProjects: [],
        specialOperations: [],
        safetyManagerTypes: [],
        registeredEngineerTypes: [],
        educationDistribution: [],
        organizationOptions: total
          ? [
              { id: 'org-test', parentId: null, organizationName: `${marker}组织`, sort: 1 },
              { id: 'org-old', parentId: null, organizationName: '旧请求组织', sort: 2 }
            ]
          : []
      })
      let failure = false
      let fresh = false
      let empty = false
      let staleFailure = false
      let releaseOld: (() => void) | undefined
      await page.route(`**/rest/v1/rpc/${scenario.rpc}`, async (route) => {
        const query = route.request().postDataJSON()
        if (query.p_organization_id === 'org-old') {
          await new Promise<void>((resolve) => {
            releaseOld = resolve
          })
          if (staleFailure)
            return route.fulfill({
              status: 503,
              json: { code: 'XX000', message: 'old database unavailable' }
            })
          return route.fulfill({ json: factory(99, '过期') })
        }
        if (failure)
          return route.fulfill({
            status: 503,
            json: { code: 'XX000', message: 'database unavailable' }
          })
        return route.fulfill({ json: factory(empty ? 0 : fresh ? 23 : 7, fresh ? '最新' : '当前') })
      })
      await page.goto(`#${scenario.path}`)
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
        timeout: 60_000
      })
      const hint = page.getByText('知道了', { exact: true })
      if (await hint.isVisible()) await hint.click()
      const metric = page
        .locator('.business-workspace-header__metric')
        .filter({
          has: page.getByText(
            scenario.kind === 'training'
              ? '正式记录'
              : scenario.kind === 'accident'
                ? '事故总数'
                : '证件总数',
            { exact: true }
          )
        })
        .locator('strong')
      const card = page
        .locator('.art-section-card')
        .filter({ has: page.getByText(scenario.chartTitle, { exact: true }) })
      const search = page.getByRole('button', { name: '查询', exact: true })
      const organization = page.getByRole('combobox', {
        name: scenario.organizationLabel,
        exact: true
      })
      await expect(metric).toHaveText('7')
      await expect(page.locator('html')).toHaveAttribute(
        'data-box-mode',
        appearance.boxBorderMode ? 'border-mode' : 'shadow-mode'
      )
      if (appearance.theme === 'dark') await expect(page.locator('html')).toHaveClass(/dark/)
      else await expect(page.locator('html')).not.toHaveClass(/dark/)
      await page.screenshot({
        path: testInfo.outputPath('report-initial.png'),
        animations: 'disabled'
      })
      const exportButton =
        scenario.kind === 'training'
          ? page.getByRole('button', { name: '导出报表', exact: true })
          : null
      if (exportButton) await expect(exportButton).toBeEnabled()
      await card.scrollIntoViewIfNeeded()
      await expect(card.locator('canvas').first()).toBeVisible()
      await page.screenshot({
        path: testInfo.outputPath('report-chart.png'),
        animations: 'disabled'
      })
      await organization.click()
      await page.getByRole('treeitem').filter({ hasText: '当前组织' }).click()
      failure = true
      await search.click()
      await expect(card.getByText('内容加载失败', { exact: true })).toBeVisible()
      if (exportButton) await expect(exportButton).toBeDisabled()
      await expect(metric).toHaveText('7')
      await expect(page.getByText('当前组织', { exact: true }).first()).toBeVisible()
      await expect(page.locator('.el-message--error')).toHaveCount(0)
      await expect(page.getByText('database unavailable', { exact: true })).toHaveCount(0)
      await card.scrollIntoViewIfNeeded()
      await page.screenshot({ path: testInfo.outputPath('report-error.png') })
      failure = false
      await card.getByRole('button', { name: '重新加载', exact: true }).click()
      await expect(search).toBeEnabled()
      await expect(card.locator('canvas').first()).toBeVisible()
      for (const failOld of [false, true]) {
        releaseOld = undefined
        staleFailure = failOld
        await organization.click()
        await page.getByRole('treeitem').filter({ hasText: '旧请求组织' }).click()
        await search.click()
        await expect.poll(() => Boolean(releaseOld)).toBe(true)
        if (exportButton) await expect(exportButton).toBeDisabled()
        fresh = true
        await page.getByRole('button', { name: '重置', exact: true }).click()
        await expect(metric).toHaveText('23')
        await expect(search).toBeEnabled()
        if (exportButton) await expect(exportButton).toBeEnabled()
        const oldResponse = page.waitForResponse(
          (reply) =>
            reply.url().includes(scenario.rpc) &&
            reply.request().postDataJSON().p_organization_id === 'org-old'
        )
        if (!releaseOld) throw new Error('旧报表请求尚未开始')
        releaseOld()
        await (await oldResponse).finished()
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        )
        await expect(metric).toHaveText('23')
        await expect(search).toBeEnabled()
        await expect(page.getByText('内容加载失败', { exact: true })).toHaveCount(0)
        await expect(page.locator('.el-message--error')).toHaveCount(0)
        await organization.click()
        await expect(page.getByRole('treeitem').filter({ hasText: '最新组织' })).toBeVisible()
        await expect(page.getByRole('treeitem').filter({ hasText: '过期组织' })).toHaveCount(0)
        await page.keyboard.press('Escape')
      }
      empty = true
      await search.click()
      await expect(metric).toHaveText('0')
      if (exportButton) await expect(exportButton).toBeDisabled()
      await expect(search).toBeEnabled()
      await expect(card.getByText(scenario.emptyTitle, { exact: true })).toBeVisible()
      await organization.click()
      if (scenario.kind === 'accident')
        await expect(page.getByRole('treeitem').filter({ hasText: '最新组织' })).toBeVisible()
      else await expect(page.getByRole('treeitem')).toHaveCount(0)
      await page.keyboard.press('Escape')
      await card.scrollIntoViewIfNeeded()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
      ).toBeLessThanOrEqual(1)
      await page.screenshot({ path: testInfo.outputPath('report-empty.png') })
      expect(errors).toEqual([])
    })
  }
}
