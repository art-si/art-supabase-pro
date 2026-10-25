import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { mockApplicationMenus } from './support/menu-rpc'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] } })

type MockMenu = {
  id: string
  parentId: string | null
  name: string
  path: string
  component: string
  type: 'button' | 'folder' | 'menu'
  meta: Record<string, unknown>
  sort: number
  children?: MockMenu[]
}

const pageMenuId = '164cfd80-a0dd-4e0b-b9f8-365bfdeae6a0'
const buttonNames = [
  'View',
  'Add',
  'Upload',
  'Edit',
  'Delete',
  'Export',
  'Follow',
  'Share',
  'CategoryAdd',
  'CategoryEdit',
  'CategoryDelete'
]

const buttons: MockMenu[] = buttonNames.map((name, index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  parentId: pageMenuId,
  name: `SmisAllDocuments:${name}`,
  path: '',
  component: '',
  type: 'button',
  meta: { is_enable: true, is_hide: true, roles: [], title: name },
  sort: index + 1
}))

const pageMenu: MockMenu = {
  id: pageMenuId,
  parentId: 'eccbb9a9-8543-4299-86af-36a3b1dcc077',
  name: 'SmisAllDocuments',
  path: 'all-documents',
  component: '/smis/safety-production/document-center/all-documents',
  type: 'menu',
  meta: { icon: '', is_enable: true, is_hide: false, roles: [], title: '全部文档' },
  sort: 1,
  children: buttons
}

const documentCenterMenu: MockMenu = {
  id: 'eccbb9a9-8543-4299-86af-36a3b1dcc077',
  parentId: 'a1530000-0000-4000-8000-000000000004',
  name: 'SmisDocumentCenter',
  path: 'document-center',
  component: '',
  type: 'folder',
  meta: {
    icon: 'ri:folder-shield-2-line',
    is_enable: true,
    is_hide: false,
    roles: [],
    title: '文档中心'
  },
  sort: 6,
  children: [pageMenu]
}

const safetyProductionMenu: MockMenu = {
  id: 'a1530000-0000-4000-8000-000000000004',
  parentId: 'a1530000-0000-4000-8000-000000000001',
  name: 'SmisSafetyProduction',
  path: 'safety-production',
  component: '',
  type: 'folder',
  meta: {
    icon: 'ri:shield-star-line',
    is_enable: true,
    is_hide: false,
    roles: [],
    title: '安全生产'
  },
  sort: 3,
  children: [documentCenterMenu]
}

const rootMenu: MockMenu = {
  id: 'a1530000-0000-4000-8000-000000000001',
  parentId: null,
  name: 'SmisSafetyManagement',
  path: '/smis',
  component: '/index/index',
  type: 'folder',
  meta: {
    icon: 'ri:shield-check-line',
    is_enable: true,
    is_hide: false,
    keep_alive: true,
    roles: [],
    title: 'SMIS安全管理'
  },
  sort: 14,
  children: [safetyProductionMenu]
}

const flatMenus = [rootMenu, safetyProductionMenu, documentCenterMenu, pageMenu, ...buttons].map(
  (menu) => ({
    id: menu.id,
    parentId: menu.parentId,
    name: menu.name,
    path: menu.path,
    component: menu.component,
    type: menu.type,
    meta: menu.meta,
    sort: menu.sort
  })
)

const categories = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    parentId: null,
    categoryName: '企业制度',
    sort: 10,
    status: 'enabled',
    description: '企业级受控文件',
    documentCount: 3,
    createTime: '2026-08-01T09:00:00+08:00',
    updateTime: '2026-08-30T09:00:00+08:00'
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    parentId: '20000000-0000-4000-8000-000000000001',
    categoryName: '人事制度',
    sort: 10,
    status: 'enabled',
    description: '人事管理制度',
    documentCount: 2,
    createTime: '2026-08-01T09:00:00+08:00',
    updateTime: '2026-08-30T09:00:00+08:00'
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    parentId: null,
    categoryName: '检验标准',
    sort: 20,
    status: 'enabled',
    description: '质量检验文件',
    documentCount: 1,
    createTime: '2026-08-01T09:00:00+08:00',
    updateTime: '2026-08-30T09:00:00+08:00'
  }
]

const documents = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    categoryId: categories[1].id,
    categoryName: '人事制度',
    categoryPath: '企业制度 / 人事制度',
    title: '员工入职与转正管理制度',
    status: 'published',
    summary: '规范员工入职、试用期评估与转正审批流程。',
    creatorUserId: '40000000-0000-4000-8000-000000000001',
    creatorName: '系统管理员',
    versionNo: 2,
    latestVersionNo: 3,
    fileName: '员工入职与转正管理制度.pdf',
    fileUrl: 'https://example.invalid/employee-onboarding.pdf',
    fileType: 'pdf',
    fileSize: 1864320,
    effectiveDate: '2026-07-01',
    latestEffectiveDate: '2026-09-10',
    scheduledEffectiveDate: '2026-09-10',
    implementationState: 'scheduled',
    isFollowing: true,
    sharedByMeCount: 2,
    sharedToMe: false,
    createTime: '2026-06-20T10:00:00+08:00',
    updateTime: '2026-08-30T09:30:00+08:00'
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    categoryId: categories[0].id,
    categoryName: '企业制度',
    categoryPath: '企业制度',
    title: '收入证明办理指南',
    status: 'published',
    summary: '收入证明开具条件、材料清单与审批时限。',
    creatorUserId: '40000000-0000-4000-8000-000000000001',
    creatorName: '系统管理员',
    versionNo: 1,
    latestVersionNo: 1,
    fileName: '收入证明办理指南.docx',
    fileUrl: 'https://example.invalid/income-proof.docx',
    fileType: 'docx',
    fileSize: 428032,
    effectiveDate: '2026-08-01',
    latestEffectiveDate: '2026-08-01',
    scheduledEffectiveDate: null,
    implementationState: 'effective',
    isFollowing: false,
    sharedByMeCount: 0,
    sharedToMe: true,
    createTime: '2026-07-20T10:00:00+08:00',
    updateTime: '2026-08-25T16:20:00+08:00'
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    categoryId: categories[2].id,
    categoryName: '检验标准',
    categoryPath: '检验标准',
    title: '原材料进场检验规范',
    status: 'draft',
    summary: '待补充抽样频次与复验规则。',
    creatorUserId: '40000000-0000-4000-8000-000000000001',
    creatorName: '质量专员',
    versionNo: null,
    latestVersionNo: null,
    fileName: null,
    fileUrl: null,
    fileType: null,
    fileSize: null,
    effectiveDate: null,
    latestEffectiveDate: null,
    scheduledEffectiveDate: null,
    implementationState: 'no_file',
    isFollowing: false,
    sharedByMeCount: 0,
    sharedToMe: false,
    createTime: '2026-08-28T10:00:00+08:00',
    updateTime: '2026-08-29T11:15:00+08:00'
  }
]

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS'
}

test.beforeEach(async ({ page }) => {
  await prepareIsolatedSession(page)
  await page.route('**/rest/v1/sys_dictionary?*', (route) =>
    route.fulfill({
      headers: { 'content-range': '0-1/2', 'access-control-expose-headers': 'content-range' },
      json: [
        {
          id: 'document-status-draft',
          label: '草稿',
          value: 'draft',
          sort: 1,
          dict_type_table: { code: 'smisDocumentStatus', name: '文档状态' }
        },
        {
          id: 'document-status-published',
          label: '已发布',
          value: 'published',
          sort: 2,
          dict_type_table: { code: 'smisDocumentStatus', name: '文档状态' }
        }
      ]
    })
  )
  await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
    route.fulfill({ json: [{ code: 'smis', name: '测试安全生产', baseUrl: '/', sort: 1 }] })
  )
  await mockApplicationMenus(page, { smis: flatMenus })
  await page.route('**/rest/v1/rpc/smis_list_document_categories_secure', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(categories)
    })
  )
  await page.route('**/rest/v1/rpc/smis_list_documents_secure', (route) =>
    route.fulfill({
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({
        records: documents,
        total: documents.length,
        overview: { total: documents.length, published: 2, draft: 1, scheduled: 1 }
      })
    })
  )
})

for (const incomplete of [false, true]) {
  test(`文档导出${incomplete ? '拒绝缺失后续页并恢复按钮' : '完整读取超过一万条记录'}`, async ({
    page
  }) => {
    test.setTimeout(180_000)
    const records = Array.from({ length: 10001 }, (_, index) => ({
      ...documents[0],
      id: `export-document-${index}`,
      title: `导出文档-${String(index).padStart(5, '0')}`
    }))
    const offsets: number[] = []
    await page.route('**/rest/v1/rpc/smis_list_documents_secure', (route) => {
      const params: { p_from: number; p_to: number; p_purpose: string } = route
        .request()
        .postDataJSON()
      const exporting = params.p_purpose === 'export'
      if (exporting) offsets.push(params.p_from)
      return route.fulfill({
        headers: corsHeaders,
        json: {
          records:
            exporting && incomplete && params.p_from >= 500
              ? []
              : records.slice(params.p_from, params.p_to + 1),
          total: records.length,
          overview: { total: records.length, published: records.length, draft: 0, scheduled: 0 }
        }
      })
    })
    await page.goto('#/smis/safety-production/document-center/all-documents', {
      waitUntil: 'domcontentloaded'
    })
    await expect(page.getByRole('heading', { name: '全部文档', exact: true })).toBeVisible({
      timeout: 60_000
    })
    const button = page.getByRole('button', { name: '导出', exact: true })
    if (incomplete) {
      const downloads: string[] = []
      page.on('download', (download) => downloads.push(download.suggestedFilename()))
      await button.click()
      await expect(page.getByText('数据未完整加载，请刷新后重试', { exact: true })).toBeVisible()
      await expect(button).toBeEnabled()
      expect(offsets).toEqual([0, 500])
      expect(downloads).toEqual([])
    } else {
      const downloadPromise = page.waitForEvent('download')
      await button.click()
      const filePath = await (await downloadPromise).path()
      expect(filePath).not.toBeNull()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(filePath!)
      const sheet = workbook.worksheets[0]
      expect(sheet.rowCount).toBe(10002)
      expect(sheet.getCell('A2').text).toBe('导出文档-00000')
      expect(sheet.getCell('A10002').text).toBe('导出文档-10000')
      expect(offsets).toContain(10000)
    }
  })
}

test('文档中心旧请求不会覆盖新筛选的概览和列表', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    const events: { target: string; width: number; height: number }[] = []
    Reflect.set(window, '__documentResizeEvents', events)
    const NativeObserver = window.ResizeObserver
    window.ResizeObserver = class extends NativeObserver {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          for (const entry of entries) {
            if (events.length < 2000)
              events.push({
                target: entry.target.className,
                width: entry.contentRect.width,
                height: entry.contentRect.height
              })
          }
          callback(entries, observer)
        })
      }
    }
  })
  let releaseOld!: () => void
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  let releaseNew!: () => void
  const newGate = new Promise<void>((resolve) => {
    releaseNew = resolve
  })
  let requests = 0
  let oldFinished = false
  await page.route('**/rest/v1/rpc/smis_list_documents_secure', async (route) => {
    const isOld = ++requests === 1
    if (isOld) await oldGate
    else await newGate
    await route.fulfill({
      headers: corsHeaders,
      json: {
        records: isOld ? documents : [],
        total: isOld ? 99 : 0,
        overview: { total: isOld ? 99 : 0, published: 0, draft: 0, scheduled: 0 }
      }
    })
    if (isOld) oldFinished = true
  })
  await page.goto('#/smis/safety-production/document-center/all-documents', {
    waitUntil: 'domcontentloaded'
  })
  await expect.poll(() => requests, { timeout: 60_000 }).toBe(1)
  await page.clock.install({ time: new Date('2026-10-03T00:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-03T00:00:01Z'))
  await page.getByPlaceholder('按文档标题、文件名或分类路径查询').fill('无匹配文档')
  releaseOld()
  await expect.poll(() => oldFinished).toBe(true)
  await page.clock.runFor(32)
  expect(requests).toBe(1)
  await expect(page.locator('.document-center-page').getByText('99', { exact: true })).toHaveCount(
    0
  )
  await page.clock.resume()
  await expect.poll(() => requests).toBe(2)
  releaseNew()
  await expect(page.getByText('暂无符合条件的文档', { exact: true })).toBeVisible()
  const layoutSamples = await page.evaluate(async () => {
    const samples: number[][] = []
    for (let index = 0; index < 20; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      samples.push(
        [
          '.document-center-page',
          '.document-center-page__content',
          '.document-center-page__table'
        ].map((selector) => document.querySelector(selector)?.getBoundingClientRect().height ?? 0)
      )
    }
    return samples
  })
  const maximumLoadingHeight = await page.evaluate(() => {
    const events: { target: string; height: number }[] = Reflect.get(
      window,
      '__documentResizeEvents'
    )
    return Math.max(
      0,
      ...events
        .filter(
          (entry) =>
            entry.target.includes('document-center-page__table') &&
            entry.target.includes('is-empty')
        )
        .map((entry) => entry.height)
    )
  })
  expect(maximumLoadingHeight).toBeLessThanOrEqual(page.viewportSize()?.height ?? 900)
  await test.info().attach('layout-samples', {
    body: JSON.stringify(layoutSamples),
    contentType: 'application/json'
  })
  for (const sample of layoutSamples.slice(-10)) {
    expect(sample).toEqual(layoutSamples.at(-1))
  }
  await writeFile(
    `.artifacts/document-resize-${test.info().project.name}.json`,
    JSON.stringify(await page.evaluate(() => Reflect.get(window, '__documentResizeEvents')))
  )
})

test('文档中心三视图在桌面和窄屏下无页面级溢出', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.goto('#/smis/safety-production/document-center/all-documents', {
    waitUntil: 'domcontentloaded'
  })
  await expect(page.locator('.document-center-page')).toBeVisible({ timeout: 45_000 })
  await expect(page.getByRole('heading', { name: '全部文档' })).toBeVisible()
  const tourDismiss = page.getByRole('button', { name: '知道了', exact: true })
  if (await tourDismiss.isVisible()) await tourDismiss.click()
  await expect(
    page.getByRole('link', { name: '员工入职与转正管理制度', exact: true })
  ).toBeVisible()

  const outputDir = path.join(process.cwd(), '.artifacts', 'ui-quality', 'document-center-e2e')
  await mkdir(outputDir, { recursive: true })
  const viewModes = [
    { name: '文件夹视图', value: 'folder' },
    { name: '列表视图', value: 'list' },
    { name: '树结构视图', value: 'tree' }
  ]
  for (const viewMode of viewModes) {
    const viewName = viewMode.name
    const option = page.getByRole('radio', { name: viewName })
    await page.locator('.el-segmented__item').filter({ has: option }).click({ timeout: 10_000 })
    await expect(option).toBeChecked()
    await expect(page.locator('.document-center-page__content')).toHaveClass(
      new RegExp(`is-${viewMode.value}`)
    )
    await expect(
      page.locator('.document-center-page__content').getByText('已发布', { exact: true }).first()
    ).toBeVisible()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(250)
    if (viewMode.value === 'folder') {
      await expect(page.locator('.document-center-page__folder-card').first()).toBeInViewport()
      await expect(page.locator('.document-center-page__document-card').first()).toBeVisible()
    }
    await page.screenshot({
      path: path.join(outputDir, `${testInfo.project.name}-${viewMode.value}.png`),
      fullPage: true,
      animations: 'disabled'
    })
    if (viewMode.value === 'folder') {
      const lastCard = page.locator('.document-center-page__document-card').last()
      const footer = lastCard.locator('footer')
      await footer.scrollIntoViewIfNeeded()
      await expect(footer).toBeInViewport({ ratio: 1 })
      const jump = page.locator('.document-center-page__folder-pagination .el-pagination__jump')
      await jump.scrollIntoViewIfNeeded()
      await expect(jump).toBeInViewport({ ratio: 1 })
      const paginationOverflow = await page
        .locator('.document-center-page__folder-pagination')
        .evaluate((element) => element.scrollWidth - element.clientWidth)
      expect(paginationOverflow).toBeLessThanOrEqual(1)
      await page.screenshot({
        path: path.join(outputDir, `${testInfo.project.name}-folder-lower.png`),
        animations: 'disabled'
      })
    } else {
      const lastTitle = page
        .locator('.document-center-page__table')
        .getByText(documents[2].title, { exact: true })
        .first()
      await lastTitle.scrollIntoViewIfNeeded()
      await expect(lastTitle).toBeInViewport({ ratio: 1 })
      await page.screenshot({
        path: path.join(outputDir, `${testInfo.project.name}-${viewMode.value}-lower.png`),
        animations: 'disabled'
      })
    }
  }

  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth
  }))
  expect(overflow.document).toBeLessThanOrEqual(1)
  expect(overflow.body).toBeLessThanOrEqual(1)
})
