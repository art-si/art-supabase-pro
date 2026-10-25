import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const scenario of [
  {
    name: 'SmisDualControlRiskIdentification',
    path: 'risk-identification',
    title: '风险辨识',
    rpc: 'smis_list_risk_points_secure',
    placeholder: '风险点编号或名称',
    empty: '暂无风险点'
  },
  {
    name: 'SmisDualControlRiskClassificationControl',
    path: 'risk-classification-control',
    title: '风险分级管控',
    rpc: 'smis_list_risk_control_points_secure',
    placeholder: '风险点编号或名称',
    empty: '暂无可管控风险点'
  },
  {
    name: 'SmisDualControlSafetyRiskList',
    path: 'safety-risk-list',
    title: '安全风险清单',
    rpc: 'smis_list_safety_risks_secure',
    placeholder: '危险编号、风险点编号或危险源',
    empty: '暂无安全风险'
  },
  {
    name: 'SmisDualControlRiskListSummary',
    path: 'risk-list-summary',
    title: '风险清单汇总',
    rpc: 'smis_list_safety_risks_secure',
    placeholder: '危险编号、风险点编号或危险源',
    empty: '暂无风险汇总数据'
  },
  {
    name: 'SmisDualControlHazardFactorCategory',
    path: 'hazard-factor-category',
    title: '危害因素类别',
    rpc: 'smis_list_hazard_factor_categories_secure',
    placeholder: '类别编号或类别名称',
    empty: '暂无危害因素类别'
  },
  {
    name: 'SmisDualControlRiskInspectionTask',
    path: 'risk-inspection-task',
    title: '风险巡查任务',
    rpc: 'smis_list_risk_inspection_tasks_secure',
    placeholder: '任务编号或风险点编号',
    empty: '暂无风险巡查任务'
  }
]) {
  test(`${scenario.title}失败保留与过期请求`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const tenant = await prepareIsolatedSession(page)
    await page.addInitScript(() =>
      localStorage.setItem('setting', JSON.stringify({ showSettingGuide: false }))
    )
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    const path = `/smis/dual-control-system/risk-control/${scenario.path}`
    const menu = {
      id: scenario.name,
      parentId: null,
      name: scenario.name,
      path,
      component: path,
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
        }
      ]
    })
    await page.route('**/rest/v1/rpc/smis_list_risk_identification_options_secure', (route) =>
      route.fulfill({ json: { sites: [], organizations: [], equipment: [], hazardCategories: [] } })
    )
    await page.route('**/rest/v1/rpc/smis_list_risk_control_options_secure', (route) =>
      route.fulfill({ json: { riskPoints: [], duplicateConfigurations: [] } })
    )
    await page.route('**/rest/v1/rpc/hr_list_employee_selector_secure', (route) =>
      route.fulfill({ json: { records: [], total: 0 } })
    )
    const response = (total: number, marker: string) => ({
      total,
      overview: {
        total,
        identified: total,
        specialEquipment: 0,
        unidentified: 0,
        evaluated:
          scenario.path === 'risk-list-summary' && marker === '最新'
            ? Math.max(total - 2, 0)
            : total,
        major: 0,
        controlled:
          scenario.path === 'risk-list-summary' && marker === '最新'
            ? Math.max(total - 3, 0)
            : total,
        uncontrolled: 0,
        active: total,
        enabled: total,
        disabled: 0,
        styled: 0,
        notStarted: total,
        inProgress: 0,
        overdue: 0,
        completed: 0
      },
      records: Array.from({ length: Math.min(total, 20) }, (_, index) => ({
        id: `${marker}-${index}`,
        tenantId: tenant.id,
        pointNo: `POINT-${index}`,
        pointName: `${marker}记录-${index}`,
        riskType: 'location',
        siteName: '测试场所',
        equipmentName: '测试设备',
        isSpecialEquipment: false,
        organizations: [],
        hazardCount: 0,
        activityCount: 0,
        riskLevel: 'low',
        riskScore: 0,
        sort: index,
        status: scenario.path === 'risk-inspection-task' ? 'not_started' : 'enabled',
        photoUrls: [],
        attachmentUrls: [],
        controlPlanAttachmentUrls: [],
        hazardNo: `HAZARD-${index}`,
        hazardSource: `${marker}记录-${index}`,
        riskPointId: `${marker}-${index}`,
        riskPointNo: `POINT-${index}`,
        riskName: `${marker}记录-${index}`,
        riskPointName: `${marker}记录-${index}`,
        riskPointType: 'location',
        riskLevelCode: 'low',
        riskLevelName: '低风险',
        riskLevelColor: '#16a34a',
        accidentTypes: [],
        activityIds: [],
        controlLevels: [],
        assignments: [],
        responsibleEmployeeIds: [],
        controlStatus: 'active',
        taskCount: 0,
        categoryCode: `CATEGORY-${index}`,
        categoryName: `${marker}记录-${index}`,
        factorType: 'physical',
        tagStyle: 'primary',
        tagColor: null,
        taskNo: `${marker}记录-${index}`,
        plannedStartAt: '2026-10-01T08:00:00',
        plannedEndAt: '2026-10-01T18:00:00',
        itemCount: 3,
        completedItemCount: 0,
        normalCount: 0,
        abnormalCount: 0
      }))
    })
    let failure = false
    let fresh = false
    let empty = false
    let releaseOld: (() => void) | undefined
    await page.route(`**/rest/v1/rpc/${scenario.rpc}`, async (route) => {
      if (route.request().postDataJSON().p_keyword === '旧请求') {
        await new Promise<void>((resolve) => {
          releaseOld = resolve
        })
        return route.fulfill({ json: response(99, '过期') })
      }
      if (failure)
        return route.fulfill({
          status: 503,
          json: { code: 'XX000', message: 'database unavailable' }
        })
      return route.fulfill({ json: response(empty ? 0 : fresh ? 23 : 7, fresh ? '最新' : '当前') })
    })
    await page.goto(`#${path}`)
    await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    const hint = page.getByText('知道了', { exact: true })
    if (await hint.isVisible()) await hint.click()
    const metric = page.locator('.business-workspace-header__metric').first().locator('strong')
    const table = page.locator('.art-table-query')
    const keyword = page.getByPlaceholder(scenario.placeholder, { exact: true })
    const search = page.getByRole('button', { name: '查询', exact: true })
    await expect(metric).toHaveText('7')
    await expect(table.getByText('当前记录-0', { exact: true }).first()).toBeVisible()
    const coverage = page.locator('.risk-summary-page__coverage')
    if (scenario.path === 'risk-list-summary') {
      await expect(coverage.getByText('治理链路完整', { exact: true })).toBeVisible()
      await expect(coverage.locator('aside')).toHaveClass('is-complete')
      await assertTableFocusContract(page, testInfo)
      await expect(coverage).toBeVisible()
    }
    failure = true
    await keyword.fill('保留筛选')
    await search.click()
    const error = table.getByText('数据加载失败', { exact: true })
    await expect(error).toBeVisible()
    await expect(search).toBeEnabled()
    await expect(metric).toHaveText('7')
    await expect(keyword).toHaveValue('保留筛选')
    await expect(table.getByText(scenario.empty, { exact: true })).toHaveCount(0)
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.getByText('database unavailable', { exact: true })).toHaveCount(0)
    await error.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('risk-list-error.png') })
    failure = false
    await table.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(error).toBeHidden()
    await expect(table.getByText('当前记录-0', { exact: true }).first()).toBeVisible()
    await expect(keyword).toHaveValue('保留筛选')
    await keyword.fill('旧请求')
    await search.click()
    await expect.poll(() => Boolean(releaseOld)).toBe(true)
    fresh = true
    await page.getByRole('button', { name: '重置', exact: true }).click()
    await expect(metric).toHaveText('23')
    const oldResponse = page.waitForResponse(
      (reply) =>
        reply.url().includes(scenario.rpc) && reply.request().postDataJSON().p_keyword === '旧请求'
    )
    if (!releaseOld) throw new Error('旧请求尚未开始')
    releaseOld()
    await (await oldResponse).finished()
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    )
    await expect(metric).toHaveText('23')
    await expect(table.getByText('最新记录-0', { exact: true }).first()).toBeVisible()
    await expect(table.getByText('过期记录-0', { exact: true })).toHaveCount(0)
    if (scenario.path === 'risk-list-summary') {
      await expect(coverage.getByText('治理缺口提示', { exact: true })).toBeVisible()
      await expect(
        coverage.getByText('还有 2 项待评价、3 项待落实管控。', { exact: true })
      ).toBeVisible()
      await expect(coverage.locator('aside')).not.toHaveClass('is-complete')
      await expect(coverage.locator('.el-progress').nth(0)).toHaveAttribute('aria-valuenow', '91')
      await expect(coverage.locator('.el-progress').nth(1)).toHaveAttribute('aria-valuenow', '87')
    }
    empty = true
    await search.click()
    await expect(metric).toHaveText('0')
    await expect(search).toBeEnabled()
    await expect(error).toBeHidden()
    await expect(table.getByText(scenario.empty, { exact: true })).toBeVisible()
    if (scenario.path === 'risk-list-summary') {
      await expect(coverage.getByText('暂无风险数据', { exact: true })).toBeVisible()
      await expect(coverage.getByText('治理链路完整', { exact: true })).toHaveCount(0)
      await expect(coverage.locator('aside')).not.toHaveClass('is-complete')
      await expect
        .poll(() =>
          coverage
            .locator('.el-progress-bar__inner')
            .evaluateAll((bars) => bars.every((bar) => bar.getBoundingClientRect().width <= 0.5))
        )
        .toBe(true)
      await expect(coverage.locator('.el-progress').nth(0)).toHaveAttribute('aria-valuenow', '0')
      await expect(coverage.locator('.el-progress').nth(1)).toHaveAttribute('aria-valuenow', '0')
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath('risk-list-empty.png') })
    expect(errors).toEqual([])
  })
}
