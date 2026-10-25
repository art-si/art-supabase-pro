import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

const base = '/smis/qualification-training/safety-qualification-management'
const scenarios = [
  {
    title: '题库管理',
    name: 'SmisQuestionBankManagement',
    path: '/smis/qualification-training/question-bank-management',
    kind: 'question'
  },
  { title: '作业项目', name: 'SmisWorkItem', path: `${base}/work-item`, kind: 'catalog' },
  { title: '作业类别', name: 'SmisWorkCategory', path: `${base}/work-category`, kind: 'catalog' },
  {
    title: '准操项目',
    name: 'SmisPermittedOperationItem',
    path: `${base}/permitted-operation-item`,
    kind: 'catalog'
  },
  {
    title: '特种设备人员证件台账',
    name: 'SmisPersonnelCertificateLedger',
    path: `${base}/special-equipment-personnel-certificate-ledger`,
    kind: 'certificate'
  },
  {
    title: '特种设备作业人员证件台账',
    name: 'SmisSpecialEquipmentOperatorCertificateLedger',
    path: `${base}/special-equipment-operator-certificate-ledger`,
    kind: 'certificate'
  },
  {
    title: '特种作业操作证',
    name: 'SmisSpecialOperationCertificate',
    path: `${base}/special-operation-certificate`,
    kind: 'certificate'
  },
  {
    title: '安全管理人员证',
    name: 'SmisSafetyManagerCertificate',
    path: `${base}/safety-manager-certificate`,
    kind: 'certificate'
  },
  {
    title: '注册安全工程师台账',
    name: 'SmisRegisteredSafetyEngineerLedger',
    path: `${base}/registered-safety-engineer-ledger`,
    kind: 'certificate'
  }
] as const

for (const scenario of scenarios) {
  test(`${scenario.title}失败保留与旧请求隔离`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const tenant = await prepareIsolatedSession(page)
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
        }
      ]
    })
    const rpc =
      scenario.kind === 'question'
        ? 'smis_list_question_bank_secure'
        : scenario.kind === 'catalog'
          ? 'smis_list_qualification_catalog_secure'
          : 'smis_list_personnel_certificates_extended_secure'
    const placeholder =
      scenario.kind === 'question'
        ? '搜索题干或解析'
        : scenario.kind === 'catalog'
          ? '编码、名称或备注'
          : '请输入人员姓名'
    const factory = (total: number, marker: string) => {
      const records = Array.from({ length: Math.min(total, 20) }, (_, index) => ({
        id: `${marker}-${index}`,
        tenantId: tenant.id,
        status: 'enabled',
        sort: index,
        itemCode: `CODE-${index}`,
        itemName: `${marker}记录-${index}`,
        parentId: null,
        catalogType: 'work_item',
        workCategoryId: null,
        childCount: 0,
        categoryId: `${marker}-category`,
        categoryName: `${marker}分类`,
        questionType: 'single',
        stem: `${marker}记录-${index}`,
        options: [],
        correctAnswers: [],
        defaultScore: 2,
        employeeId: `employee-${index}`,
        employeeNo: `EMP-${index}`,
        employeeName: `${marker}记录-${index}`,
        certificateCategory: 'special_operation',
        certificateNumber: `CERT-${index}`,
        extraFields: {},
        warningStatus: 'normal',
        reminderState: 'normal',
        nearestEffectiveDate: '2027-10-01',
        items: [],
        reviewHistory: []
      }))
      return {
        total,
        records,
        overview: {
          total,
          enabled: total,
          disabled: 0,
          rootCount: total,
          single: total,
          multiple: 0,
          judgement: 0,
          normal: total,
          warning: 0,
          expired: 0,
          employees: total
        },
        categories: total
          ? [
              {
                id: `${marker}-category`,
                parentId: null,
                categoryName: `${marker}分类`,
                status: 'enabled',
                sort: 1,
                questionCount: total
              }
            ]
          : [],
        tree: total
          ? [
              {
                id: `${marker}-node`,
                parentId: null,
                itemCode: 'NODE',
                itemName: `${marker}节点`,
                status: 'enabled',
                sort: 1
              }
            ]
          : [],
        workCategories: []
      }
    }
    let failure = false
    let fresh = false
    let empty = false
    let releaseOld: (() => void) | undefined
    await page.route(`**/rest/v1/rpc/${rpc}`, async (route) => {
      const query = route.request().postDataJSON()
      if ((query.p_keyword ?? query.p_employee_name) === '旧请求') {
        await new Promise<void>((resolve) => {
          releaseOld = resolve
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
    const metric = page.locator('.business-workspace-header__metric').first().locator('strong')
    const table = page.locator('.art-table-query')
    await expect(metric).toHaveText('7')
    await expect(table.getByText('当前记录-0', { exact: true })).toBeVisible()
    const keyword = page.getByPlaceholder(placeholder, { exact: true })
    await keyword.fill('保留筛选')
    failure = true
    await page.getByRole('button', { name: '查询', exact: true }).click()
    const error = table.getByText('数据加载失败', { exact: true })
    await expect(error).toBeVisible()
    await expect(metric).toHaveText('7')
    await expect(keyword).toHaveValue('保留筛选')
    await expect(page.locator('.el-message--error')).toHaveCount(0)
    await expect(page.getByText('database unavailable', { exact: true })).toHaveCount(0)
    await error.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('list-error.png') })
    failure = false
    const navigator =
      scenario.kind === 'certificate'
        ? null
        : page.locator(
            scenario.kind === 'question'
              ? '.question-category-navigator'
              : '.qualification-catalog-navigator'
          )
    const retry = (navigator ?? table).getByRole('button', { name: '重新加载', exact: true })
    await retry.scrollIntoViewIfNeeded()
    if (navigator) {
      const cardBox = await navigator.boundingBox()
      const retryBox = await retry.boundingBox()
      expect(cardBox).not.toBeNull()
      expect(retryBox).not.toBeNull()
      expect(retryBox!.y + retryBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height + 1)
      await page.screenshot({ path: testInfo.outputPath('category-error.png') })
    }
    await retry.click()
    await expect(error).toBeHidden()
    await expect(table.getByText('当前记录-0', { exact: true })).toBeVisible()
    await expect(keyword).toHaveValue('保留筛选')
    await keyword.fill('旧请求')
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect.poll(() => Boolean(releaseOld)).toBe(true)
    fresh = true
    await page.getByRole('button', { name: '重置', exact: true }).click()
    await expect(metric).toHaveText('23')
    const oldResponse = page.waitForResponse(
      (reply) =>
        reply.url().includes(rpc) &&
        (reply.request().postDataJSON().p_keyword ??
          reply.request().postDataJSON().p_employee_name) === '旧请求'
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
    await expect(table.getByText('最新记录-0', { exact: true })).toBeVisible()
    await expect(page.getByText('过期记录-0', { exact: true })).toHaveCount(0)
    if (navigator) {
      await expect(
        navigator.getByText(scenario.kind === 'question' ? '最新分类' : '最新节点', { exact: true })
      ).toBeVisible()
      await expect(
        navigator.getByText(scenario.kind === 'question' ? '过期分类' : '过期节点', { exact: true })
      ).toHaveCount(0)
    }
    empty = true
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await expect(metric).toHaveText('0')
    await expect(error).toBeHidden()
    await expect(
      table.getByText(scenario.kind === 'question' ? '暂无题目' : `暂无${scenario.title}`, {
        exact: true
      })
    ).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    await expect(page.getByRole('button', { name: '查询', exact: true })).toBeEnabled()
    await page.screenshot({ path: testInfo.outputPath('list-empty.png') })
    expect(errors).toEqual([])
  })
}
