import { expect, test, type ConsoleMessage, type Page } from '@playwright/test'
import { mockApplicationMenus } from './support/menu-rpc'

interface TestMenuNode {
  id: string
  parentId: string | null
  name: string
  path: string
  component: string
  type: string
  sort: number
  meta: Record<string, unknown>
  children?: TestMenuNode[]
}

const menuMeta = (title: string, icon: string) => ({
  title,
  icon,
  roles: ['R_SUPER', 'R_ADMIN'],
  is_hide: false,
  is_enable: true,
  keep_alive: true
})

const createAppMenu = (
  code: 'mdm' | 'wms' | 'mes',
  title: string,
  icon: string,
  component: string
): TestMenuNode => {
  const rootId = `test-${code}-root`
  return {
    id: rootId,
    parentId: null,
    name: `${code.toUpperCase()}Root`,
    path: `/${code}`,
    component: '/index/index',
    type: 'folder',
    sort: 1,
    meta: menuMeta(title, icon),
    children: [
      {
        id: `test-${code}-workbench`,
        parentId: rootId,
        name: `${code.toUpperCase()}Workbench`,
        path: 'workbench',
        component,
        type: 'menu',
        sort: 1,
        meta: menuMeta(code === 'wms' ? '仓储工作台' : '制造工作台', 'ri:dashboard-3-line'),
        children: []
      }
    ]
  }
}

const mdmMenu: TestMenuNode = {
  ...createAppMenu('mdm', 'MDM主数据', 'ri:database-2-line', '/mdm/workbench'),
  children: [
    {
      id: 'test-mdm-workbench',
      parentId: 'test-mdm-root',
      name: 'MDMWorkbench',
      path: 'workbench',
      component: '/mdm/workbench',
      type: 'menu',
      sort: 0,
      meta: menuMeta('治理总览', 'ri:dashboard-3-line'),
      children: []
    },
    {
      id: 'test-mdm-governance-directory',
      parentId: 'test-mdm-root',
      name: 'MdmGovernanceDirectory',
      path: 'governance',
      component: '',
      type: 'folder',
      sort: 1,
      meta: menuMeta('统一治理目录', 'ri:book-shelf-line'),
      children: [
        {
          id: 'test-mdm-organization',
          parentId: 'test-mdm-governance-directory',
          name: 'MdmOrganization',
          path: 'organization',
          component: '',
          type: 'folder',
          sort: 1,
          meta: menuMeta('组织与人员', 'ri:organization-chart'),
          children: [
            {
              id: 'test-mdm-organization-directory',
              parentId: 'test-mdm-organization',
              name: 'MdmOrganizationDirectory',
              path: 'organization-directory',
              component: '/mdm/governance/organization/organization-directory',
              type: 'menu',
              sort: 1,
              meta: menuMeta('组织机构主数据', 'ri:organization-chart'),
              children: []
            }
          ]
        }
      ]
    }
  ]
}

const testMenus: Record<'mdm' | 'wms' | 'mes', TestMenuNode> = {
  mdm: mdmMenu,
  wms: createAppMenu('wms', 'WMS仓储管理', 'ri:store-3-line', '/wms/workbench'),
  mes: createAppMenu('mes', 'MES制造执行', 'ri:tools-line', '/mes/workbench')
}

function flattenMenu(node: TestMenuNode): TestMenuNode[] {
  return [{ ...node, children: undefined }, ...(node.children ?? []).flatMap(flattenMenu)]
}

async function installApplicationMenuMocks(page: Page): Promise<void> {
  await page.route('**/rest/v1/rpc/get_accessible_applications', async (route) => {
    await route.fulfill({
      json: [
        {
          code: 'platform',
          name: '亿企工场',
          description: '企业数字化平台',
          baseUrl: '/',
          sort: 1
        },
        {
          code: 'mdm',
          name: '亿企工场 MDM',
          description: '主数据治理',
          baseUrl: '/mdm/',
          sort: 15
        },
        {
          code: 'wms',
          name: '亿企工场 WMS',
          description: '仓储管理',
          baseUrl: '/wms/',
          sort: 55
        },
        {
          code: 'mes',
          name: '亿企工场 MES',
          description: '制造执行',
          baseUrl: '/mes/',
          sort: 60
        }
      ]
    })
  })

  await mockApplicationMenus(page, {
    mdm: flattenMenu(testMenus.mdm),
    wms: flattenMenu(testMenus.wms),
    mes: flattenMenu(testMenus.mes)
  })
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)
}

async function dismissSettingGuide(page: Page): Promise<void> {
  const guide = page.locator('.setting-guide')
  const shown = await guide
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false)
  if (!shown) return
  await guide.getByRole('button', { name: '知道了' }).click()
  await expect(guide).toBeHidden()
}

async function openWorkspace(page: Page, path: string, heading: string): Promise<void> {
  const errors: string[] = []
  const handleConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text())
  }
  page.on('console', handleConsole)

  try {
    await page.goto(path, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(page.locator('.el-loading-mask:visible')).toHaveCount(0, { timeout: 60_000 })
    await expect(page.locator('.el-skeleton')).toHaveCount(0, { timeout: 60_000 })
    await dismissSettingGuide(page)
    await expectNoHorizontalOverflow(page)
    expect(errors).toEqual([])
  } finally {
    page.off('console', handleConsole)
  }
}

test.describe('MDM, WMS and MES application scaffolds', () => {
  test.describe.configure({ timeout: 120_000 })

  test('MDM health uses record quality and treats empty data explicitly', async ({
    page
  }, testInfo) => {
    await installApplicationMenuMocks(page)
    let empty = false
    await page.route('**/rest/v1/rpc/mdm_get_governance_overview_secure', async (route) => {
      await route.fulfill({
        json: {
          domains: empty ? [] : [{ key: 'organization', recordCount: 10, attentionCount: 5 }]
        }
      })
    })
    await openWorkspace(page, '#/mdm/workbench', '治理总览')
    await expect(page.locator('.coverage-ring')).toContainText('50%')
    await expect(page.locator('.coverage-legend')).toContainText('5 条')
    await expect(page.getByText('资料完整率', { exact: true })).toBeVisible()
    const pendingMetric = page
      .locator('.business-workspace-header__metric')
      .filter({ hasText: '待完善记录' })
    await expect(pendingMetric).toContainText('5')
    await expect(page.getByText('独立主档类型', { exact: true })).toBeVisible()
    await expect(page.getByText('另有 2 类关系/明细对象', { exact: true })).toBeVisible()
    await expect(page.locator('.domain-list__count').first()).toContainText('5 条待完善')
    await page.screenshot({ path: testInfo.outputPath('mdm-health.png'), fullPage: true })
    await page.locator('.governance-rules article').last().scrollIntoViewIfNeeded()
    await expect(page.locator('.domain-list button')).toHaveCount(5)
    await expect(page.locator('.domain-list button').last()).toBeInViewport()
    await expect(page.locator('.governance-rules article').last()).toBeInViewport()
    await expectNoHorizontalOverflow(page)
    await page.screenshot({ path: testInfo.outputPath('mdm-health-lower.png'), fullPage: true })
    empty = true
    await page.getByRole('button', { name: '刷新主数据概览' }).click()
    await expect(page.getByText('暂无可评估的主数据', { exact: true })).toBeVisible()
    await expect(page.locator('.coverage-ring')).toHaveCount(0)
  })

  test('MDM overview failure shows retry instead of successful zero counts', async ({
    page
  }, testInfo) => {
    await installApplicationMenuMocks(page)
    let fail = true
    await page.route('**/rest/v1/rpc/mdm_get_governance_overview_secure', async (route) => {
      await route.fulfill(
        fail
          ? { status: 500, json: { code: 'XX000', message: 'database internal details' } }
          : { json: { domains: [{ key: 'organization', recordCount: 10, attentionCount: 2 }] } }
      )
    })
    await page.goto('#/mdm/workbench', { waitUntil: 'domcontentloaded' })
    const directory = page.locator('.mdm-workbench__directory')
    await expect(directory.getByText('主数据概览加载失败', { exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(page.locator('.coverage-ring')).toHaveCount(0)
    await expect(page.locator('.mdm-workbench')).not.toContainText('database internal details')
    await dismissSettingGuide(page)
    await page.screenshot({ path: testInfo.outputPath('mdm-health-error.png'), fullPage: true })
    fail = false
    await directory.getByRole('button', { name: '重新加载' }).click()
    await expect(page.locator('.coverage-ring')).toContainText('80%')
    await expectNoHorizontalOverflow(page)
  })

  test('MDM invalid statistics cannot render a misleading health percentage', async ({ page }) => {
    await installApplicationMenuMocks(page)
    let domains: unknown = [{ key: 'organization', recordCount: 10, attentionCount: 20 }]
    await page.route('**/rest/v1/rpc/mdm_get_governance_overview_secure', (route) =>
      route.fulfill({ json: { domains } })
    )
    await page.goto('#/mdm/workbench', { waitUntil: 'domcontentloaded' })
    const directory = page.locator('.mdm-workbench__directory')
    const error = directory.getByText('主数据概览加载失败', { exact: true })
    await expect(error).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.coverage-ring')).toHaveCount(0)

    for (const invalid of [
      null,
      [{ key: 'organization', recordCount: -1, attentionCount: 0 }],
      [{ key: 'organization', recordCount: 10 }],
      [
        { key: 'organization', recordCount: 10, attentionCount: 1 },
        { key: 'organization', recordCount: 10, attentionCount: 1 }
      ]
    ]) {
      domains = invalid
      const response = page.waitForResponse('**/rest/v1/rpc/mdm_get_governance_overview_secure')
      await directory.getByRole('button', { name: '重新加载' }).click()
      await response
      await expect(error).toBeVisible()
      await expect(page.locator('.coverage-ring')).toHaveCount(0)
    }

    domains = [{ key: 'organization', recordCount: 10, attentionCount: 2 }]
    await directory.getByRole('button', { name: '重新加载' }).click()
    await expect(page.locator('.coverage-ring')).toContainText('80%')
  })

  test('opens the MDM governance workspace and catalog', async ({ page }, testInfo) => {
    await installApplicationMenuMocks(page)
    await openWorkspace(page, '#/mdm/workbench', '治理总览')
    await page.screenshot({ path: testInfo.outputPath('mdm-workbench.png'), fullPage: true })

    await openWorkspace(
      page,
      '#/mdm/governance/organization/organization-directory',
      '组织机构主数据'
    )
    await expect(page.locator('.catalog-navigator__note')).toContainText('来源系统维护')
    await expect(page.getByText('当前结果', { exact: true })).toBeVisible()
    const overview = page.locator('.mdm-catalog-page__overview')
    const query = page.locator('.mdm-catalog-page .art-table-query')
    const initialHeight = (await query.boundingBox())!.height
    await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await expect(overview).toBeHidden()
    await expect(query).toHaveClass(/is-focus-mode/)
    await expect(page.getByText('资料质量', { exact: true })).toBeVisible()
    await expect
      .poll(async () => (await query.boundingBox())!.height)
      .toBeGreaterThan(initialHeight)
    await page.keyboard.press('Escape')
    await expect(overview).toBeVisible()
    await expect(query).not.toHaveClass(/is-focus-mode/)
    await page.getByRole('switch', { name: '进入专注模式' }).locator('..').click()
    await page.getByRole('button', { name: '退出专注' }).click()
    await expect(overview).toBeVisible()
    const keywordInput = page.getByPlaceholder('组织编码或名称')
    await keywordInput.fill('ROOT')
    await keywordInput.press('Enter')
    await expect(page.getByText('ROOT', { exact: true }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: '查看详情' }).first()).toBeVisible()
    await page.getByRole('button', { name: '查看详情' }).first().click()
    await expect(page.getByText('主数据详情', { exact: true })).toBeVisible()
    await expect(page.getByText('治理与来源', { exact: true })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await page.screenshot({
      path: testInfo.outputPath('mdm-catalog-detail.png'),
      fullPage: true,
      animations: 'disabled'
    })
  })

  test('opens the WMS workspace', async ({ page }, testInfo) => {
    await installApplicationMenuMocks(page)
    await openWorkspace(page, '#/wms/workbench', '仓储运营工作台')
    await expect(page.getByText('暂无可用作业入口', { exact: true })).toBeVisible()
    await expect(page.getByText('SCM 采购与收料', { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('wms-workbench.png'), fullPage: true })
  })

  test('opens the MES workspace', async ({ page }, testInfo) => {
    await installApplicationMenuMocks(page)
    await openWorkspace(page, '#/mes/workbench', '制造执行工作台')
    await expect(page.getByText('上线准备', { exact: true })).toBeVisible()
    for (const tag of await page.locator('.readiness-list .el-tag').all()) {
      expect((await tag.boundingBox())!.width).toBeGreaterThanOrEqual(60)
    }
    await page.screenshot({ path: testInfo.outputPath('mes-workbench.png'), fullPage: true })
  })
})
