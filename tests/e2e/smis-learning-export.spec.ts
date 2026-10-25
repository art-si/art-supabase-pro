import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { omit } from 'lodash-es'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const scenario of [
  {
    page: 'exam',
    title: '考试管理',
    tab: '试卷管理',
    action: '导出试卷',
    rpc: 'smis_list_exam_papers_secure',
    column: 1,
    last: 'PAPER-5000'
  },
  {
    page: 'exam',
    title: '考试管理',
    tab: '考试记录',
    action: '导出考试记录',
    rpc: 'smis_list_exam_records_secure',
    column: 1,
    last: 'PAPER-5000'
  },
  {
    page: 'course',
    title: '课程管理',
    tab: '课程库',
    action: '导出课程',
    rpc: 'smis_list_courses_secure',
    column: 1,
    last: 'COURSE-5000'
  },
  {
    page: 'course',
    title: '课程管理',
    tab: '学习记录',
    action: '导出学习记录',
    rpc: 'smis_list_course_learning_records_secure',
    column: 1,
    last: '测试课程-5000'
  }
] as const) {
  for (const incomplete of [false, true]) {
    test(`${scenario.action}分页 ${incomplete ? 'incomplete' : 'complete'}`, async ({ page }) => {
      const tenant = await prepareIsolatedSession(page)
      const name = scenario.page === 'exam' ? 'SmisExamManagement' : 'SmisCourseManagement'
      const path = `/smis/qualification-training/${scenario.page}-management`
      const menu = {
        id: 'learning-export-menu',
        parentId: null,
        name,
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
          ...['View', 'Export', 'ViewRecord', 'ViewLearningRecord'].map((action) => ({
            ...menu,
            id: `${menu.id}-${action}`,
            parentId: menu.id,
            name: `${name}:${action}`,
            path: '',
            component: '',
            type: 'button'
          }))
        ]
      })
      const records = Array.from({ length: 5001 }, (_, i) => ({
        id: `learning-${i}`,
        tenantId: tenant.id,
        paperNo: `PAPER-${i}`,
        paperTitle: `测试试卷-${i}`,
        courseNo: `COURSE-${i}`,
        courseName: `测试课程-${i}`,
        employeeName: `测试学员-${i}`,
        organizationName: '测试部门',
        status: 'draft',
        attemptStatus: 'graded',
        attemptNo: 1,
        passed: true,
        score: 90,
        totalScore: 100,
        passingScore: 60,
        questionCount: 10,
        durationMinutes: 60,
        courseCategory: 'safety_production',
        courseType: 'video',
        learningStatus: 'completed',
        progressPercent: 100,
        totalLearningSeconds: 3600,
        learnerCount: 1,
        completedCount: 1,
        minimumLearningMinutes: 30,
        creditHours: 1,
        questions: [],
        employeeIds: [],
        startedAt: '2026-10-01T00:00:00Z',
        submittedAt: '2026-10-01T01:00:00Z',
        completedAt: '2026-10-01T01:00:00Z',
        createTime: '2026-10-01T00:00:00Z',
        updateTime: '2026-10-01T00:00:00Z'
      }))
      const requests: Array<Record<string, unknown> & { p_from: number; p_to: number }> = []
      for (const rpc of [
        'smis_list_exam_papers_secure',
        'smis_list_exam_records_secure',
        'smis_list_courses_secure',
        'smis_list_course_learning_records_secure'
      ]) {
        await page.route(`**/rest/v1/rpc/${rpc}`, (route) => {
          const params = route.request().postDataJSON() as (typeof requests)[number]
          if (rpc === scenario.rpc) requests.push(params)
          return route.fulfill({
            json: {
              records:
                incomplete && rpc === scenario.rpc && params.p_from >= 500
                  ? []
                  : records.slice(params.p_from, Math.min(params.p_to + 1, params.p_from + 1000)),
              total: records.length,
              overview: {
                total: records.length,
                draft: records.length,
                published: 0,
                completed: 0,
                inProgress: 0,
                passed: records.length,
                failed: 0,
                assigned: 0,
                learning: 0
              }
            }
          })
        })
      }
      await page.goto(`#${path}`)
      await expect(page.getByRole('heading', { name: scenario.title, exact: true })).toBeVisible({
        timeout: 60_000
      })
      await page.getByRole('tab', { name: scenario.tab, exact: true }).click()
      await expect(page.locator('.art-table-query:visible .el-table__row').first()).toBeVisible()
      const filters = omit(requests.at(-1), ['p_from', 'p_to'])
      requests.length = 0
      const button = page.getByRole('button', { name: scenario.action, exact: true })
      if (incomplete) {
        const downloads: string[] = []
        page.on('download', (d) => downloads.push(d.suggestedFilename()))
        await button.click()
        await expect(page.getByText('数据未完整加载，请刷新后重试', { exact: true })).toBeVisible()
        expect(downloads).toEqual([])
        expect(requests.map((p) => p.p_from)).toEqual([0, 500])
      } else {
        const pending = page.waitForEvent('download')
        await button.click()
        const file = await (await pending).path()
        if (!file) throw new Error('学习考核导出未生成文件')
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.readFile(file)
        expect(workbook.worksheets[0].rowCount).toBe(5002)
        expect(workbook.worksheets[0].getRow(5002).getCell(scenario.column).value).toBe(
          scenario.last
        )
        expect(requests.map((p) => p.p_from)).toEqual(Array.from({ length: 11 }, (_, i) => i * 500))
      }
      await expect(button).toBeEnabled()
      for (const request of requests) {
        expect(request.p_to - request.p_from + 1).toBe(500)
        expect(omit(request, ['p_from', 'p_to'])).toEqual(filters)
      }
      if (!incomplete)
        await assertTableFocusContract(page, test.info(), [`.${scenario.page}-page__tabs`])
      await page.screenshot({ path: test.info().outputPath('learning-export.png'), fullPage: true })
      if (!incomplete && ['试卷管理', '课程库'].includes(scenario.tab)) {
        const bank = Array.from({ length: 5001 }, (_, i) => ({
          id: `bank-${i}`,
          stem: `可选题目-${i}`,
          questionType: 'single',
          defaultScore: 2,
          options: [{ key: 'A', content: '测试选项' }],
          correctAnswers: ['A'],
          status: 'enabled',
          categoryName: '测试题库'
        }))
        await page.route('**/rest/v1/rpc/smis_list_question_bank_secure', (route) => {
          const params = route.request().postDataJSON() as { p_from: number; p_to: number }
          return route.fulfill({
            json: {
              records: bank.slice(params.p_from, params.p_to + 1),
              total: bank.length,
              categories: []
            }
          })
        })
        const createLabel = scenario.page === 'exam' ? '创建试卷' : '新增课程'
        const fieldLabel = scenario.page === 'exam' ? '试卷标题' : '课程名称'
        const create = page.getByRole('button', { name: createLabel, exact: true })
        await create.click()
        const dialog = page.getByRole('dialog')
        const field = dialog.getByLabel(fieldLabel, { exact: true })
        await expect(field).toBeVisible()
        if (scenario.page === 'exam') {
          const picker = dialog.locator('.exam-page__question-picker')
          await expect(picker.locator('.el-checkbox')).toHaveCount(50)
          const search = picker.getByPlaceholder('搜索题干', { exact: true })
          await search.fill('可选题目-5000')
          const last = picker.getByRole('checkbox')
          await expect(last).toHaveCount(1)
          await picker.locator('.el-checkbox').click()
          await search.fill('可选题目-0')
          await picker.locator('.el-checkbox').click()
          await search.fill('可选题目-5000')
          await expect(last).toBeChecked()
          await page.screenshot({
            path: test.info().outputPath('question-picker.png'),
            fullPage: true
          })
        } else {
          const paper = dialog.getByLabel('关联考试', { exact: true })
          await paper.click()
          await expect(page.getByRole('option').first()).toBeVisible()
          expect(await page.getByRole('option').count()).toBeLessThan(50)
          await paper.fill('PAPER-5000')
          await page
            .getByRole('option', { name: 'PAPER-5000 · 测试试卷-5000', exact: true })
            .click()
          await expect(
            dialog.getByText('PAPER-5000 · 测试试卷-5000', { exact: true })
          ).toBeVisible()
        }
        if ((page.viewportSize()?.width ?? 1440) < 768) {
          const fieldBox = await field
            .locator(
              'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " el-input ") or contains(concat(" ", normalize-space(@class), " "), " el-textarea ")][1]'
            )
            .boundingBox()
          const dialogBox = await dialog.boundingBox()
          expect(fieldBox?.width ?? 0).toBeGreaterThan((dialogBox?.width ?? 0) * 0.65)
        }
        await field.fill('测试表单输入')
        await expect(field).toHaveValue('测试表单输入')
        if (scenario.page === 'exam')
          await expect(dialog.getByText('1 基本规则', { exact: true })).toHaveClass(/is-ready/)
        await page.screenshot({ path: test.info().outputPath('learning-form.png'), fullPage: true })
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await expect(dialog).toBeHidden()
        await create.click()
        await expect(field).toHaveValue('')
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
      }
    })
  }
}
