import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { prepareIsolatedSession } from './support/isolated-session'
import { mockApplicationMenus } from './support/menu-rpc'
import { assertTableFocusContract } from './support/table-focus'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(180_000)

for (const incomplete of [false, true]) {
  test(`题库分页导出 ${incomplete ? 'incomplete' : 'complete'}`, async ({ page }) => {
    const tenant = await prepareIsolatedSession(page)
    const path = '/smis/qualification-training/question-bank-management'
    const menu = {
      id: 'question-test-menu',
      parentId: null,
      name: 'SmisQuestionBankManagement',
      path,
      component: path,
      type: 'menu',
      sort: 1,
      meta: { title: '题库管理', is_enable: true, is_hide: false, roles: [] }
    }
    await page.route('**/rest/v1/rpc/get_accessible_applications', (route) =>
      route.fulfill({
        json: [{ code: 'smis', name: '测试安全管理', baseUrl: '/smis/' }]
      })
    )
    await mockApplicationMenus(page, {
      smis: [
        menu,
        ...['View', 'Export'].map((action) => ({
          ...menu,
          id: `${menu.id}-${action}`,
          parentId: menu.id,
          name: `${menu.name}:${action}`,
          path: '',
          component: '',
          type: 'button'
        }))
      ]
    })
    const records = Array.from({ length: 5001 }, (_, i) => ({
      id: `question-${i}`,
      tenantId: tenant.id,
      categoryId: 'category-test',
      categoryName: '测试分类',
      questionType: 'single',
      stem: `测试题目-${i}`,
      options: [],
      correctAnswers: [],
      analysis: '',
      defaultScore: 2,
      status: 'enabled'
    }))
    const requests: Array<{ p_from: number; p_to: number }> = []
    await page.route('**/rest/v1/rpc/smis_list_question_bank_secure', (route) => {
      const params = route.request().postDataJSON() as (typeof requests)[number]
      requests.push(params)
      return route.fulfill({
        json: {
          records:
            incomplete && params.p_from >= 500
              ? []
              : records.slice(params.p_from, Math.min(params.p_to + 1, params.p_from + 1000)),
          total: records.length,
          categories: [],
          overview: {
            total: records.length,
            enabled: records.length,
            single: records.length,
            multiple: 0,
            judgement: 0
          }
        }
      })
    })
    await page.goto(`#${path}`)
    await expect(page.getByRole('heading', { name: '题库管理', exact: true })).toBeVisible({
      timeout: 60_000
    })
    await expect(page.getByText('测试题目-0', { exact: true })).toBeVisible()
    requests.length = 0
    const button = page.getByRole('button', { name: '导出题库', exact: true })
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
      if (!file) throw new Error('题库导出未生成文件')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.readFile(file)
      expect(workbook.worksheets[0].rowCount).toBe(5002)
      expect(workbook.worksheets[0].getRow(5002).getCell(3).value).toBe('测试题目-5000')
      expect(requests.map((p) => p.p_from)).toEqual(Array.from({ length: 11 }, (_, i) => i * 500))
    }
    await expect(button).toBeEnabled()
    expect(requests.every((p) => p.p_to - p.p_from + 1 === 500)).toBe(true)
    if (!incomplete)
      await assertTableFocusContract(page, test.info(), ['.question-category-navigator'])
    await page.screenshot({ path: test.info().outputPath('question-export.png'), fullPage: true })
    if (!incomplete) {
      for (const form of [
        { button: '新增题库分类', field: '分类名称' },
        { button: '新增题目', field: '题目内容' }
      ]) {
        const create = page.getByRole('button', { name: form.button, exact: true })
        await create.click()
        const dialog = page.getByRole('dialog')
        const field = dialog.getByLabel(form.field, { exact: true })
        await expect(field).toBeVisible()
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
        await page.screenshot({
          path: test.info().outputPath(`${form.button}-form.png`),
          fullPage: true
        })
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await expect(dialog).toBeHidden()
        await create.click()
        await expect(field).toHaveValue('')
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
      }
    }
  })
}
