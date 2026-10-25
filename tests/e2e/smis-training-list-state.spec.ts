import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const scenario of [
  {
    name: 'SmisSafetyTrainingPlan',
    path: 'safety-training-plan',
    title: '安全培训计划',
    autoCreate: false,
    rpc: 'smis_list_safety_training_plans_secure',
    placeholder: '计划编号、主题或讲师'
  },
  {
    name: 'SmisSafetyTrainingRecord',
    path: 'safety-training-record',
    title: '安全培训记录',
    autoCreate: false,
    rpc: 'smis_list_safety_training_records_secure',
    placeholder: '记录单号、计划编号或主题'
  },
  {
    name: 'SmisSafetyTrainingRecord',
    path: 'safety-training-record',
    title: '安全培训记录',
    autoCreate: true,
    rpc: 'smis_list_safety_training_records_secure',
    placeholder: '记录单号、计划编号或主题'
  }
]) {
  test(`${scenario.title}${scenario.autoCreate ? '授权新增' : '只读'}失败保留与过期请求`, async ({
    page
  }, testInfo) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    const tenant = await prepareIsolatedSession(page)
    await page.route('**/rest/v1/rpc/current_is_super', (route) => route.fulfill({ json: false }))
    const path = `/smis/qualification-training/training-management/${scenario.path}`
    const menu = {
      id: scenario.path,
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
        ...['View', ...(scenario.autoCreate ? ['Add'] : [])].map((action) => ({
          ...menu,
          id: `${menu.id}-${action}`,
          parentId: menu.id,
          name: `${menu.name}:${action}`,
          type: 'button',
          path: '',
          component: ''
        }))
      ]
    })
    const response = (total: number, marker: string) => ({
      total,
      records: Array.from({ length: Math.min(total, 20) }, (_, index) => ({
        id: `training-${marker}-${index}`,
        tenantId: tenant.id,
        planNo: `PLAN-${index}`,
        recordNo: `RECORD-${index}`,
        trainingPlanId: 'plan-test',
        subject: `${marker}主题-${index}`,
        status: 'draft',
        executionStatus: 'not_started',
        warningStatus: 'normal',
        trainingCategory: 'safety',
        trainingForm: 'offline',
        trainingType: 'routine',
        trainingLevel: 'company',
        plannedStartAt: '2026-10-01T00:00:00Z',
        plannedEndAt: '2026-10-01T02:00:00Z',
        actualStartAt: '2026-10-01T00:00:00Z',
        actualEndAt: '2026-10-01T02:00:00Z',
        organizerOrganizationId: `org-${marker}`,
        organizerOrganizationName: `${marker}组织`,
        instructorName: '测试讲师',
        trainingHours: 2,
        participants: [],
        participantCount: 5,
        presentCount: 4,
        attendanceRate: 80,
        attachmentUrls: [],
        signInAttachmentUrls: []
      })),
      overview: {
        total,
        draft: total,
        published: 0,
        completed: 0,
        warning: 0,
        submitted: 0,
        participantCount: total * 5,
        presentCount: total * 4
      },
      organizations: [
        { id: `org-${marker}`, parentId: null, organizationName: `${marker}组织`, sort: 1 }
      ],
      planOptions: [
        {
          id: 'plan-test',
          planNo: 'PLAN-TEST',
          subject: `${marker}计划`,
          plannedStartAt: '2026-10-01T00:00:00Z',
          plannedEndAt: '2026-10-01T02:00:00Z',
          trainingHours: 2,
          content: '测试培训内容',
          assessmentMethod: 'written',
          participants: []
        }
      ]
    })
    let failure = false
    let fresh = false
    let empty = false
    let releaseOld: (() => void) | undefined
    await page.route(`**/rest/v1/rpc/${scenario.rpc}`, async (route) => {
      const params = route.request().postDataJSON()
      if (params.p_keyword === '旧请求') {
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
    await page.goto(
      `#${path}${scenario.path === 'safety-training-record' ? '?planId=plan-test' : ''}`
    )
    if (scenario.autoCreate) {
      const dialog = page.getByRole('dialog', { name: '新增培训记录', exact: true })
      await expect(dialog).toBeVisible({ timeout: 60_000 })
      await expect(dialog.getByText('PLAN-TEST · 当前计划', { exact: true })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath('training-preset-create.png') })
      await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    }
    await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
      timeout: 60_000
    })
    const hint = page.getByText('知道了', { exact: true })
    if (await hint.isVisible()) await hint.click()
    const metric = page.locator('.business-workspace-header__metric').first().locator('strong')
    await expect(metric).toHaveText('7')
    await expect(page.getByText('当前主题-0', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const keyword = page.getByPlaceholder(scenario.placeholder, { exact: true })
    await keyword.fill('保留筛选')
    failure = true
    await page.getByRole('button', { name: '查询', exact: true }).click()
    const error = page.locator('.art-table-query').getByText('数据加载失败', { exact: true })
    await expect(error).toBeVisible()
    await expect(metric).toHaveText('7')
    await expect(keyword).toHaveValue('保留筛选')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.getByText('database unavailable', { exact: true })).toHaveCount(0)
    await error.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('training-list-error.png') })
    failure = false
    await page.getByRole('button', { name: '重新加载', exact: true }).click()
    await expect(error).toBeHidden()
    await expect(page.getByText('当前主题-0', { exact: true })).toBeVisible()
    await expect(keyword).toHaveValue('保留筛选')
    await keyword.fill('旧请求')
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect.poll(() => Boolean(releaseOld)).toBe(true)
    fresh = true
    await page.getByRole('button', { name: '重置', exact: true }).click()
    await expect(metric).toHaveText('23')
    await expect(page.getByText('最新主题-0', { exact: true })).toBeVisible()
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
    await expect(page.getByText('过期主题-0', { exact: true })).toHaveCount(0)
    const expand = page.getByRole('button', { name: '展开', exact: true })
    if (await expand.isVisible()) await expand.click()
    await page.getByRole('combobox', { name: '组织单位', exact: true }).click()
    await expect(page.getByRole('treeitem').filter({ hasText: '最新组织' })).toBeVisible()
    await expect(page.getByRole('treeitem').filter({ hasText: '过期组织' })).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await page.screenshot({ path: testInfo.outputPath('training-latest-options.png') })
    await page.keyboard.press('Escape')
    empty = true
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(metric).toHaveText('0')
    await expect(error).toBeHidden()
    await expect(
      page.getByText(
        scenario.path === 'safety-training-plan' ? '暂无安全培训计划' : '暂无安全培训记录',
        { exact: true }
      )
    ).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('training-empty.png') })
    expect(pageErrors).toEqual([])
  })
}
