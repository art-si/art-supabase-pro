import { expect, test, type Page } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
import {
  installActionFeedbackHistory,
  readActionFeedbackHistory
} from './support/action-feedback-history'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 30_000 })
test.setTimeout(240_000)

async function openTrainingAction(
  page: Page,
  recordName: string,
  action: string,
  expectedText = recordName
) {
  const row = page.getByRole('row').filter({ has: page.getByText(recordName, { exact: true }) })
  await row.getByRole('button', { name: '更多操作', exact: true }).click()
  const menuAction = page.getByRole('menuitem', { name: action, exact: true })
  const menuPopper = await menuAction.evaluateHandle((element) => element.closest('.el-popper'))
  try {
    await menuAction.click()
    await expect(menuAction).toBeHidden()
    await menuPopper.evaluate(async (element) => {
      if (!element) throw new Error('培训操作菜单浮层不可用')
      const animations = element
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
      await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
    })
  } finally {
    await menuPopper.dispose()
  }
  const dialog = page.getByRole('dialog', { name: action, exact: true })
  await expect(dialog.getByText(expectedText, { exact: true })).toBeVisible()
  await dialog.evaluate(async (element) => {
    const animations = (element.closest('.el-overlay') ?? element)
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)))
  })
  return dialog
}

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

for (const scenario of [
  {
    action: 'progress',
    label: '保存进度',
    error: '学习进度暂未保存，请重试',
    retryElapsed: 95
  },
  {
    action: 'complete',
    label: '完成学习',
    error: '学习时长未达到最低要求，请继续学习后重试',
    retryElapsed: 625
  }
]) {
  test(`课程学习${scenario.action === 'progress' ? '保存' : '完成'}失败保留进度与计时，键盘重试仅显示当前操作加载`, async ({
    page
  }, info) => {
    await prepareIsolatedSession(page, { tenantId: 'test-tenant', platformSuper: false })
    await page.setViewportSize({ width: 390, height: 844 })
    const openedAt = new Date('2026-11-18T02:00:00Z').getTime()
    await page.clock.setFixedTime(openedAt)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const isComplete = scenario.action === 'complete'
    const requestedProgress = isComplete ? 100 : 35
    const course = {
      id: 'test-course',
      tenantId: 'test-tenant',
      courseNo: 'C-001',
      courseName: '测试课程',
      status: 'published',
      assignmentId: 'test-assignment',
      learningStatus: 'in_progress',
      courseType: 'document',
      category: 'safety',
      introduction: '课程简介',
      minimumLearningMinutes: 10,
      creditHours: 1,
      progressPercent: 35,
      totalLearningSeconds: 120,
      coverUrl: '',
      resourceUrl: '',
      assigneeCount: 1
    }
    let courseReads = 0
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      if (path.endsWith('/smis_list_courses_secure')) {
        courseReads++
        return route.fulfill({
          json: {
            records: [course],
            total: 1,
            overview: { total: 1, draft: 0, published: 1, learning: 1, completed: 0 }
          }
        })
      }
      return route.fulfill({ json: [] })
    })
    const failure = Promise.withResolvers<void>()
    const attempts: unknown[] = []
    await page.route('**/rest/v1/rpc/smis_update_course_learning_secure', async (route) => {
      attempts.push(route.request().postDataJSON())
      if (attempts.length === 1) {
        await failure.promise
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: scenario.error }
        })
      }
      return route.fulfill({
        json: {
          progressPercent: requestedProgress,
          totalLearningSeconds: 120 + scenario.retryElapsed
        }
      })
    })

    await page.goto('/tests/e2e/fixtures/training-template-content.html?mode=course')
    const dialog = await openTrainingAction(page, '测试课程', '继续学习')
    const progress = dialog.getByRole('progressbar')
    await expect(progress).toHaveAttribute('aria-valuenow', '35')
    await expect(dialog.getByText('最低学习 10 分钟', { exact: true })).toBeVisible()
    const confirm = dialog.getByRole('button', { name: scenario.label, exact: true })
    const peer = dialog.getByRole('button', {
      name: isComplete ? '保存进度' : '完成学习',
      exact: true
    })
    await expect(peer).toBeEnabled()
    const readsBeforeConfirm = courseReads
    await page.clock.setFixedTime(openedAt + 65_000)
    await installActionFeedbackHistory(page)
    try {
      await confirm.focus()
      await expect(confirm).toBeFocused()
      await page.keyboard.press('Enter')
      await expect.poll(() => attempts.length).toBe(1)
      await expect(confirm).toBeDisabled()
      await expect(confirm).toHaveClass(/\bis-loading\b/)
      await expect(peer).toBeDisabled()
      await expect.soft(peer).not.toHaveClass(/\bis-loading\b/)
      await peer.evaluate((button: HTMLButtonElement) => button.click())
      expect(attempts).toHaveLength(1)
      await dialog.screenshot({
        path: info.outputPath(`course-learning-${scenario.action}-pending-390.png`)
      })
    } finally {
      failure.resolve()
    }

    await expect(
      page.locator('.el-message__content').filter({ hasText: scenario.error })
    ).toHaveCount(1)
    await expect(page.locator('.el-message--error')).toHaveCount(1)
    await expect(dialog).toBeVisible()
    await expect(progress).toHaveAttribute('aria-valuenow', '35')
    await expect(confirm).toBeEnabled()
    await expect(peer).toBeEnabled()
    await expect(confirm).toBeFocused()
    await dialog.screenshot({
      path: info.outputPath(`course-learning-${scenario.action}-retry-focus-390.png`)
    })

    await page.clock.setFixedTime(openedAt + scenario.retryElapsed * 1000)
    await page.keyboard.press('Enter')
    await expect(dialog).toBeHidden()
    await expect.poll(() => courseReads).toBeGreaterThan(readsBeforeConfirm)
    expect(attempts).toEqual([
      {
        p_assignment_id: 'test-assignment',
        p_progress_percent: requestedProgress,
        p_elapsed_seconds: 65,
        p_complete: isComplete
      },
      {
        p_assignment_id: 'test-assignment',
        p_progress_percent: requestedProgress,
        p_elapsed_seconds: scenario.retryElapsed,
        p_complete: isComplete
      }
    ])
    expect(await readActionFeedbackHistory(page)).toEqual([
      { kind: 'error', text: scenario.error },
      ...(isComplete ? [{ kind: 'success', text: '课程学习已完成' }] : [])
    ])
    expect(errors).toEqual([])
  })
}

for (const action of ['progress', 'complete']) {
  for (const outcome of ['success', 'failure']) {
    const complete = action === 'complete'
    const firstElapsed = complete ? 625 : 65
    const secondOpenedElapsed = complete ? 900 : 180
    const label = complete ? '完成学习' : '保存进度'
    test(`课程${complete ? '完成' : '学习'}旧请求${outcome === 'success' ? '成功' : '失败'}返回不关闭或污染新课程`, async ({
      page
    }, info) => {
      await prepareIsolatedSession(page, { tenantId: 'test-tenant', platformSuper: false })
      await page.setViewportSize({ width: 390, height: 844 })
      const openedAt = new Date('2026-11-18T02:00:00Z').getTime()
      await page.clock.setFixedTime(openedAt)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const common = {
        tenantId: 'test-tenant',
        status: 'published',
        learningStatus: 'in_progress',
        courseType: 'document',
        category: 'safety',
        introduction: '课程简介',
        minimumLearningMinutes: 10,
        creditHours: 1,
        totalLearningSeconds: 120,
        coverUrl: '',
        resourceUrl: '',
        assigneeCount: 1
      }
      const courses = [
        {
          ...common,
          id: 'course-a',
          courseNo: 'C-A',
          courseName: '第一门课程',
          assignmentId: 'assignment-a',
          progressPercent: 35
        },
        {
          ...common,
          id: 'course-b',
          courseNo: 'C-B',
          courseName: '第二门课程',
          assignmentId: 'assignment-b',
          progressPercent: 80
        }
      ]
      let courseReads = 0
      await page.route('**/rest/v1/**', (route) => {
        if (new URL(route.request().url()).pathname.endsWith('/smis_list_courses_secure')) {
          courseReads++
          return route.fulfill({
            json: {
              records: courses,
              total: 2,
              overview: { total: 2, draft: 0, published: 2, learning: 2, completed: 0 }
            }
          })
        }
        return route.fulfill({ json: [] })
      })
      const oldResponse = Promise.withResolvers<void>()
      const writes: unknown[] = []
      await page.route('**/rest/v1/rpc/smis_update_course_learning_secure', async (route) => {
        const payload = route.request().postDataJSON()
        writes.push(payload)
        if (payload.p_assignment_id === 'assignment-a') {
          await oldResponse.promise
          return outcome === 'failure'
            ? route.fulfill({
                status: 409,
                json: {
                  code: 'P0001',
                  message: complete
                    ? '第一门课程完成状态暂未更新，请重试'
                    : '第一门课程的学习进度暂未保存，请重试'
                }
              })
            : route.fulfill({
                json: {
                  progressPercent: complete ? 100 : 35,
                  totalLearningSeconds: 120 + firstElapsed
                }
              })
        }
        return route.fulfill({ json: { progressPercent: 80, totalLearningSeconds: 160 } })
      })

      await page.goto('/tests/e2e/fixtures/training-template-content.html?mode=course')
      const first = await openTrainingAction(page, '第一门课程', '继续学习')
      await expect(first.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '35')
      try {
        await page.clock.setFixedTime(openedAt + firstElapsed * 1000)
        await first.getByRole('button', { name: label, exact: true }).click()
        await expect.poll(() => writes.length).toBe(1)
        await expect(first.getByRole('button', { name: label, exact: true })).toBeDisabled()
        await first.getByRole('button', { name: '关闭弹窗', exact: true }).click()
        await expect(first).toBeHidden()

        await page.clock.setFixedTime(openedAt + secondOpenedElapsed * 1000)
        const second = await openTrainingAction(page, '第二门课程', '继续学习')
        await expect(second.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80')
        await installActionFeedbackHistory(page)
        const secondOverlay = await second.evaluateHandle((element) =>
          element.closest('.el-overlay')
        )
        try {
          const response = page.waitForResponse(
            (candidate) =>
              candidate.url().includes('/rpc/smis_update_course_learning_secure') &&
              candidate.request().postDataJSON().p_assignment_id === 'assignment-a'
          )
          oldResponse.resolve()
          await (await response).finished()
          await page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
              )
          )
          await secondOverlay.evaluate(async (element) => {
            if (!element) throw new Error('第二门课程弹窗浮层不可用')
            const animations = element
              .getAnimations({ subtree: true })
              .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
            await Promise.all(
              animations.map((animation) => animation.finished.catch(() => undefined))
            )
          })
        } finally {
          await secondOverlay.dispose()
        }
        await expect(second).toBeVisible()
        await expect(second.getByText('第二门课程', { exact: true })).toBeVisible()
        await expect(second.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80')
        await expect(page.locator('.el-message--error')).toHaveCount(0)
        const save = second.getByRole('button', { name: '保存进度', exact: true })
        await expect(save).toBeEnabled()
        await expect(second.getByRole('button', { name: '完成学习', exact: true })).toBeEnabled()
        await second.screenshot({
          path: info.outputPath(`course-learning-${action}-stale-${outcome}-390.png`)
        })

        const readsBeforeSave = courseReads
        await page.clock.setFixedTime(openedAt + (secondOpenedElapsed + 40) * 1000)
        await save.click()
        await expect(second).toBeHidden()
        await expect.poll(() => courseReads).toBeGreaterThan(readsBeforeSave)
        expect(writes).toEqual([
          {
            p_assignment_id: 'assignment-a',
            p_progress_percent: complete ? 100 : 35,
            p_elapsed_seconds: firstElapsed,
            p_complete: complete
          },
          {
            p_assignment_id: 'assignment-b',
            p_progress_percent: 80,
            p_elapsed_seconds: 40,
            p_complete: false
          }
        ])
        expect(await readActionFeedbackHistory(page)).toEqual([])
        expect(errors).toEqual([])
      } finally {
        oldResponse.resolve()
      }
    })
  }
}

for (const questionType of ['single', 'multiple']) {
  test(`考试提交首步保存期间冻结答案，失败保留作答并可键盘重试 ${questionType === 'multiple' ? '多选' : '单选'}`, async ({
    page
  }, info) => {
    await prepareIsolatedSession(page, { tenantId: 'test-tenant', platformSuper: false })
    await page.setViewportSize({ width: 390, height: 844 })
    const startedAt = new Date('2026-11-18T02:00:00Z')
    await page.clock.setFixedTime(startedAt)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const expectedAnswers = questionType === 'multiple' ? ['A', 'B'] : ['A']
    const paper = {
      id: 'test-paper',
      tenantId: 'test-tenant',
      paperNo: 'P-001',
      paperTitle: '提交保护试卷',
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
    const question = {
      id: 'test-question',
      questionType,
      stem: '提交等待期间的答案保护',
      score: 100,
      options: [
        { key: 'A', content: '保留答案 A' },
        { key: 'B', content: '备选答案 B' }
      ],
      answerValues: questionType === 'multiple' ? ['A', 'B'] : [],
      analysis: ''
    }
    const detail = {
      paper,
      attempt: {
        id: 'test-attempt',
        status: 'in_progress',
        startedAt: startedAt.toISOString(),
        expiresAt: new Date(startedAt.getTime() + 30 * 60 * 1000).toISOString()
      },
      questions: [question]
    }
    await page.route('**/rest/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname
      const json = path.endsWith('/smis_list_exam_papers_secure')
        ? {
            records: [paper],
            total: 1,
            overview: { total: 1, draft: 0, published: 1, passed: 0 }
          }
        : path.endsWith('/smis_start_exam_secure')
          ? detail
          : []
      return route.fulfill({ json })
    })
    const failure = Promise.withResolvers<void>()
    const answerWrites: unknown[] = []
    await page.route('**/rest/v1/rpc/smis_save_exam_answer_secure', async (route) => {
      answerWrites.push(route.request().postDataJSON())
      if (answerWrites.length === 1) {
        await failure.promise
        return route.fulfill({
          status: 409,
          json: { code: 'P0001', message: '本题答案暂未保存，请重试' }
        })
      }
      return route.fulfill({ json: null })
    })
    const submissions: unknown[] = []
    await page.route('**/rest/v1/rpc/smis_submit_exam_secure', (route) => {
      submissions.push(route.request().postDataJSON())
      return route.fulfill({
        json: {
          ...detail,
          attempt: { ...detail.attempt, status: 'submitted' },
          questions: [{ ...question, answerValues: expectedAnswers }]
        }
      })
    })

    await page.goto(
      `/tests/e2e/fixtures/training-template-content.html?mode=exam${questionType === 'multiple' ? '&theme=dark' : ''}`
    )
    if (questionType === 'multiple') await expect(page.locator('html')).toHaveClass(/dark/)
    const dialog = await openTrainingAction(page, paper.paperTitle, '开始考试', question.stem)
    const choiceRole = questionType === 'multiple' ? 'checkbox' : 'radio'
    const answerA = dialog.getByRole(choiceRole, { name: /保留答案 A/ })
    const answerB = dialog.getByRole(choiceRole, { name: /备选答案 B/ })
    if (questionType === 'single') {
      await dialog.locator('label').filter({ hasText: '保留答案 A' }).click()
    }
    await expect(answerA).toBeChecked()
    await expect(answerB).toBeChecked({ checked: questionType === 'multiple' })
    const questionCard = dialog.locator('aside').getByRole('button', { name: '1', exact: true })
    const submit = dialog.getByRole('button', { name: '提交试卷', exact: true })
    const confirmation = page.locator('.el-message-box').filter({ hasText: '确定提交试卷吗？' })
    await installActionFeedbackHistory(page)
    try {
      await submit.focus()
      await expect(submit).toBeFocused()
      await page.keyboard.press('Enter')
      await expect.poll(() => answerWrites.length).toBe(1)
      await expect(submit).toBeDisabled()
      await expect(submit).toHaveClass(/\bis-loading\b/)
      await expect(answerB).toBeDisabled()
      await expect(questionCard).toBeDisabled()
      await answerB.evaluate((input: HTMLInputElement) => input.click())
      await questionCard.evaluate((button: HTMLButtonElement) => button.click())
      await submit.evaluate((button: HTMLButtonElement) => button.click())
      await expect(answerA).toBeChecked()
      await expect(answerB).toBeChecked({ checked: questionType === 'multiple' })
      expect(answerWrites).toHaveLength(1)
      expect(submissions).toHaveLength(0)
      await expect(confirmation).toBeHidden()
      await dialog.screenshot({
        path: info.outputPath(`exam-${questionType}-first-answer-pending-390.png`)
      })
    } finally {
      failure.resolve()
    }

    await expect(
      page.locator('.el-message__content').filter({ hasText: '本题答案暂未保存，请重试' })
    ).toHaveCount(1)
    await expect(dialog).toBeVisible()
    await expect(answerA).toBeChecked()
    await expect(answerB).toBeChecked({ checked: questionType === 'multiple' })
    await expect(answerB).toBeEnabled()
    await expect(questionCard).toBeEnabled()
    await expect(submit).toBeEnabled()
    await expect(submit).toBeFocused()
    await expect(confirmation).toBeHidden()
    expect(submissions).toHaveLength(0)
    await dialog.screenshot({
      path: info.outputPath(`exam-${questionType}-first-answer-retry-390.png`)
    })

    await page.keyboard.press('Enter')
    await expect(confirmation).toBeVisible()
    await expect(confirmation.getByText('提交试卷', { exact: true })).toHaveCount(2)
    await expect(confirmation.getByText('删除确认', { exact: true })).toHaveCount(0)
    const confirmSubmit = confirmation.getByRole('button', { name: '提交试卷', exact: true })
    await expect(confirmSubmit).toHaveClass(/el-button--primary/)
    await expect(confirmSubmit).not.toHaveClass(/el-button--danger/)
    await expect(confirmation).toContainText('当前已作答 1/1 题')
    await expect(submit).toBeDisabled()
    await expect(answerB).toBeDisabled()
    await expect(questionCard).toBeDisabled()
    await confirmation.getByRole('button', { name: '取消', exact: true }).click()
    await expect(confirmation).toBeHidden()
    await expect(dialog).toBeVisible()
    await expect(answerA).toBeChecked()
    await expect(answerB).toBeEnabled()
    await expect(questionCard).toBeEnabled()
    await expect(submit).toBeEnabled()
    await expect(submit).toBeFocused()
    expect(submissions).toHaveLength(0)

    await page.keyboard.press('Enter')
    await expect(confirmation).toBeVisible()
    await expect(answerA).toBeChecked()
    await expect(answerB).toBeDisabled()
    await confirmSubmit.click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('dialog', { name: '考试结果', exact: true })).toBeVisible()
    expect(answerWrites).toEqual([
      {
        p_attempt_id: 'test-attempt',
        p_question_id: 'test-question',
        p_answer_values: expectedAnswers
      },
      {
        p_attempt_id: 'test-attempt',
        p_question_id: 'test-question',
        p_answer_values: expectedAnswers
      },
      {
        p_attempt_id: 'test-attempt',
        p_question_id: 'test-question',
        p_answer_values: expectedAnswers
      }
    ])
    expect(submissions).toEqual([{ p_attempt_id: 'test-attempt' }])
    expect(await readActionFeedbackHistory(page)).toEqual([
      { kind: 'error', text: '本题答案暂未保存，请重试' },
      { kind: 'success', text: '试卷已提交并完成自动评分' }
    ])
    expect(errors).toEqual([])
  })
}
