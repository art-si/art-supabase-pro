import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)
for (const mode of ['course', 'preview', 'session']) {
  test(`培训页面无多余模板文本 ${mode}`, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const paper = {
      id: 'test-paper',
      tenantId: 'test-tenant',
      paperNo: 'P-001',
      paperTitle: '测试试卷',
      status: 'published',
      assignmentId: 'test-assignment',
      examStatus: 'not_started',
      assemblyMode: 'manual',
      questionCount: 1,
      totalScore: 100,
      passingScore: 60,
      timeLimitMinutes: 30,
      assigneeCount: 1
    }
    const course = {
      id: 'test-course',
      tenantId: 'test-tenant',
      courseNo: 'C-001',
      courseName: '测试课程',
      status: 'published',
      assignmentId: 'test-assignment',
      learningStatus: 'not_started',
      courseType: 'document',
      category: 'safety',
      introduction: '课程简介',
      minimumLearningMinutes: 10,
      creditHours: 1,
      progressPercent: 0,
      totalLearningSeconds: 0,
      coverUrl: '',
      resourceUrl: '',
      assigneeCount: 1
    }
    const detail = {
      paper,
      attempt: {
        id: 'test-attempt',
        status: 'in_progress',
        startedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + 1800000).toISOString()
      },
      questions: [
        {
          id: 'test-question',
          questionType: 'single',
          stem: '测试题目',
          score: 100,
          options: [{ key: 'A', content: '测试选项' }],
          correctAnswers: ['A'],
          answerValues: [],
          analysis: ''
        }
      ]
    }
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      const json = path.endsWith('/smis_list_courses_secure')
        ? {
            records: [course],
            total: 1,
            overview: { total: 1, draft: 0, published: 1, learning: 1, completed: 0 }
          }
        : path.endsWith('/smis_list_exam_papers_secure')
          ? {
              records: [paper],
              total: 1,
              overview: { total: 1, draft: 0, published: 1, passed: 0 }
            }
          : path.endsWith('/smis_get_exam_detail_secure') ||
              path.endsWith('/smis_start_exam_secure')
            ? detail
            : []
      return route.fulfill({ json })
    })
    await page.goto(
      `/tests/e2e/fixtures/training-template-content.html?mode=${mode === 'course' ? 'course' : 'exam'}`
    )
    await expect(
      page.getByText(mode === 'course' ? '测试课程' : '测试试卷', { exact: true }).first()
    ).toBeVisible()
    await page.getByRole('button', { name: '更多操作', exact: true }).first().click()
    const action = mode === 'course' ? '开始学习' : mode === 'preview' ? '考试预览' : '开始考试'
    await page.getByRole('menuitem', { name: action, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: action, exact: true })
    if (mode === 'session') {
      await expect(dialog.getByRole('button', { name: '提交试卷', exact: true })).toBeVisible()
      await expect(dialog.locator('.el-dialog__footer')).toHaveCount(0)
    }
    await expect(
      dialog.getByText(mode === 'course' ? '测试课程' : '测试题目', { exact: mode !== 'preview' })
    ).toBeVisible()
    expect(
      await dialog.evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const leftovers: string[] = []
        let node: Node | null
        while ((node = walker.nextNode()))
          if (/^[<>]+$/.test(node.textContent?.trim() ?? ''))
            leftovers.push(node.textContent?.trim() ?? '')
        return leftovers
      })
    ).toEqual([])
    await page.screenshot({ path: info.outputPath('content.png') })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1)
    expect(errors).toEqual([])
  })
}
