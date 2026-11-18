import { expect, test, type Page } from '@playwright/test'
import { assertAppearance } from './support/appearance'
import { prepareIsolatedSession } from './support/isolated-session'

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 15_000 })
test.setTimeout(150_000)

const courseName = '现场作业安全与设备检查标准流程专项学习课程'
const introduction = '学习现场作业风险识别、设备检查和异常处置，结合班前核对要求完成资料阅读。'
const coverPath = '/tests/e2e/fixtures/course-learning-cover.svg'
const resourcePath = '/tests/e2e/fixtures/course-learning-resource.html'
const dictionaryValues: Record<string, [string, string]> = {
  smisCourseType: ['document', '文档课程'],
  smisCourseCategory: ['safety', '安全培训'],
  smisCourseStatus: ['published', '已发布'],
  smisCourseLearningStatus: ['in_progress', '学习中']
}

async function openLearning(page: Page) {
  const row = page.getByRole('row').filter({ has: page.getByText(courseName, { exact: true }) })
  await row.getByRole('button', { name: '更多操作', exact: true }).click()
  const learn = page.getByRole('menuitem', { name: '继续学习', exact: true })
  const popper = await learn.evaluateHandle((element) => element.closest('.el-popper'))
  try {
    await learn.click()
    await expect(learn).toBeHidden()
    await popper.evaluate(async (element) => {
      if (!element) throw new Error('学习操作菜单不可用')
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => undefined))
      )
    })
  } finally {
    await popper.dispose()
  }
  const dialog = page.getByRole('dialog', { name: '继续学习', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.evaluate(async (element) => {
    await Promise.all(
      (element.closest('.el-overlay') ?? element)
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined))
    )
  })
  return dialog
}

for (const profile of [
  { theme: 'light', boxBorderMode: true, width: 1440, height: 1000 },
  { theme: 'dark', boxBorderMode: false, width: 390, height: 844 }
] as const) {
  for (const covered of [false, true]) {
    test(`课程学习${covered ? '真实封面' : '无封面'}保留身份进度与操作 ${profile.theme}${profile.width}`, async ({
      page,
      context
    }, info) => {
      await prepareIsolatedSession(page, { tenantId: 'test-tenant', platformSuper: false })
      await page.setViewportSize({ width: profile.width, height: profile.height })
      const writes: string[] = []
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => {
        const url = new URL(route.request().url())
        if (
          /\/(smis_manage_course_secure|smis_update_course_learning_secure)$/.test(url.pathname)
        ) {
          writes.push(url.pathname)
          return route.abort('blockedbyclient')
        }
        if (url.pathname.endsWith('/sys_dictionary')) {
          const code = url.searchParams.get('dict_type_table.code')?.replace(/^eq\./, '')
          const entries = Object.entries(dictionaryValues).filter(([key]) => !code || key === code)
          return route.fulfill({
            json: entries.map(([key, [value, label]]) => ({
              id: `dictionary-${key}`,
              code: value,
              label,
              value,
              sort: 1,
              status: '1',
              dict_type_table: { code: key, name: key }
            }))
          })
        }
        if (url.pathname.endsWith('/smis_list_courses_secure'))
          return route.fulfill({
            json: {
              records: [
                {
                  id: 'layout-course',
                  tenantId: 'test-tenant',
                  courseNo: 'C-LAYOUT',
                  courseName,
                  introduction,
                  status: 'published',
                  assignmentId: 'layout-assignment',
                  learningStatus: 'in_progress',
                  courseType: 'document',
                  category: 'safety',
                  minimumLearningMinutes: 10,
                  creditHours: 1,
                  dueDate: '2026-12-31',
                  progressPercent: 35,
                  totalLearningSeconds: 120,
                  coverUrl: covered ? coverPath : '',
                  resourceUrl: resourcePath,
                  assigneeCount: 1
                }
              ],
              total: 1,
              overview: { total: 1, draft: 0, published: 1, learning: 1, completed: 0 }
            }
          })
        return route.fulfill({ json: [] })
      })
      await page.route(`**${coverPath}`, (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#dceaf2"/><path d="M240 360V180h160l80 40 80-40h160v180H560l-80 40-80-40Z" fill="#406880"/><text x="480" y="465" font-size="44" text-anchor="middle" fill="#263b48">COURSE MATERIAL</text></svg>'
        })
      )
      await context.route(`**${resourcePath}`, (route) =>
        route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: '<!doctype html><html lang="zh-CN"><title>课程资料</title><h1>课程学习资料</h1></html>'
        })
      )
      await page.goto(
        `/tests/e2e/fixtures/training-template-content.html?mode=course&theme=${profile.theme}&box=${profile.boxBorderMode ? 'border' : 'shadow'}`
      )
      await assertAppearance(page, profile)
      const dialog = await openLearning(page)
      const title = dialog.getByText(courseName, { exact: true })
      const progress = dialog.getByRole('progressbar')
      const resource = dialog.getByRole('button', { name: '打开课程资源', exact: true })
      await expect(title).toBeVisible()
      await expect(dialog.getByText('文档课程', { exact: true })).toBeVisible()
      await expect(dialog.getByText(introduction, { exact: true })).toBeVisible()
      await expect(dialog.getByText('最低学习 10 分钟', { exact: true })).toBeVisible()
      await expect(dialog.getByText('1 学时', { exact: true })).toBeVisible()
      await expect(dialog.getByText('截止 2026-12-31', { exact: true })).toBeVisible()
      await expect(progress).toHaveAttribute('aria-valuenow', '35')
      await expect(dialog.getByText('35%', { exact: true })).toBeVisible()

      if (covered) {
        const image = dialog.locator('.el-image img')
        await expect(image).toHaveJSProperty('naturalWidth', 960)
        await expect(image).toHaveAttribute('alt', `${courseName}封面`)
        await expect(image).toHaveCSS('object-fit', 'cover')
        const cover = image.locator('xpath=ancestor::*[contains(@class,"el-image")][1]')
        expect((await cover.boundingBox())?.height).toBeCloseTo(210, 0)
        await image.scrollIntoViewIfNeeded()
      } else {
        const titleOffset = await title.evaluate((element) => {
          const content = element.closest('.art-dialog__content')
          if (!content) throw new Error('学习正文不可用')
          return element.getBoundingClientRect().top - content.getBoundingClientRect().top
        })
        expect(titleOffset).toBeLessThanOrEqual(112)
        await expect(dialog.locator('.el-image img')).toHaveCount(0)
        for (const visible of [
          title,
          dialog.getByText('最低学习 10 分钟', { exact: true }),
          dialog.getByText('1 学时', { exact: true }),
          dialog.getByText('截止 2026-12-31', { exact: true }),
          progress,
          resource,
          ...['稍后学习', '保存进度', '完成学习'].map((name) =>
            dialog.getByRole('button', { name, exact: true })
          )
        ])
          await expect(visible).toBeInViewport({ ratio: 1 })
      }
      expect(
        await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)
      ).toBeLessThanOrEqual(1)
      await dialog.screenshot({
        path: info.outputPath(
          `course-learning-${covered ? 'cover' : 'no-cover'}-${profile.width}.png`
        ),
        animations: 'disabled'
      })
      const popupPromise = page.waitForEvent('popup')
      await resource.click()
      const popup = await popupPromise
      await expect(popup).toHaveURL(new RegExp(`${resourcePath}$`))
      await expect(popup.getByRole('heading', { name: '课程学习资料', exact: true })).toBeVisible()
      await popup.close()
      await expect(dialog).toBeVisible()
      await dialog.getByRole('button', { name: '稍后学习', exact: true }).click()
      await expect(dialog).toBeHidden()
      expect(writes).toEqual([])
      expect(errors).toEqual([])
    })
  }
}
