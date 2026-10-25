import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

for (const dark of [false, true]) {
  for (const shadow of [false, true]) {
    test(`防范措施删除后保留内容并重新排序 dark-${dark} shadow-${shadow}`, async ({
      page
    }, info) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.route('**/rest/v1/**', (route) => route.fulfill({ json: [] }))
      await page.goto('/tests/e2e/fixtures/accident-employee-reuse.html')
      await page.evaluate(
        ({ dark, shadow }) => {
          document.documentElement.classList.toggle('dark', dark)
          document.documentElement.dataset.boxMode = shadow ? 'shadow-mode' : 'border-mode'
        },
        { dark, shadow }
      )
      const editor = page.locator('.accident-measures-editor')
      await expect(editor).toContainText('暂未添加防范措施')
      await editor.getByRole('button', { name: '添加措施' }).click()
      await editor.getByRole('button', { name: '添加措施' }).click()
      const inputs = editor.getByPlaceholder('请输入可执行、可核验的防范措施')
      await inputs.nth(0).fill('待移除的旧措施')
      await inputs.nth(1).fill('保留的措施：逐班核验防护装置，并记录检查结果。')
      await editor.getByRole('button', { name: '删除防范措施' }).nth(0).click()
      await expect(inputs).toHaveCount(1)
      await expect(inputs).toHaveValue('保留的措施：逐班核验防护装置，并记录检查结果。')
      expect(
        await inputs.evaluate((input) => {
          const cell = input.closest('td')?.querySelector('.cell')
          return cell ? input.getBoundingClientRect().width / cell.getBoundingClientRect().width : 0
        })
      ).toBeGreaterThan(0.9)
      await expect
        .poll(async () =>
          JSON.parse((await page.getByTestId('measures-snapshot').textContent()) || '[]')
        )
        .toEqual([
          {
            plannedMeasure: '保留的措施：逐班核验防护装置，并记录检查结果。',
            plannedImplementationDate: null,
            responsibleEmployeeId: null,
            responsibleEmployee: null,
            sort: 0
          }
        ])
      await editor.scrollIntoViewIfNeeded()
      await editor.locator('.el-table__body-wrapper .el-scrollbar__wrap').evaluate((element) => {
        element.scrollLeft = 0
      })
      await page.screenshot({ path: info.outputPath('measure-retained.png') })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
        )
      ).toBe(true)
      expect(errors).toEqual([])
    })
  }
}
