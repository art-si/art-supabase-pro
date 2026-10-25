import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] } })
test.setTimeout(120_000)

test('公共字典三种显示方式采用同一名称回退规则', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/tests/e2e/fixtures/dictionary-display.html')
  const expected: Record<string, string> = {
    known: '已配置标签',
    blank: '空标签名称',
    'missing-label': '无标签名称',
    'empty-name': 'raw',
    zero: '零值名称',
    unknown: 'legacy',
    nil: '—',
    override: '历史选项',
    'explicit-item': '指定字典名称'
  }
  for (const display of ['text', 'tag', 'badge']) {
    for (const [id, label] of Object.entries(expected)) {
      await expect(page.getByTestId(`${display}-${id}`)).toHaveText(label)
    }
  }
  await page.getByRole('button', { name: '更新字典名称', exact: true }).click()
  for (const display of ['text', 'tag', 'badge']) {
    await expect(page.getByTestId(`${display}-blank`)).toHaveText('更新字典名称')
  }
  for (const theme of ['light', 'dark']) {
    for (const box of ['border-mode', 'shadow-mode']) {
      await page.evaluate(
        ({ theme, box }) => {
          document.documentElement.classList.toggle('dark', theme === 'dark')
          document.documentElement.dataset.boxMode = box
        },
        { theme, box }
      )
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
        .toBeLessThanOrEqual(1)
      await page.screenshot({ path: info.outputPath(`${theme}-${box}.png`), fullPage: true })
    }
  }
  expect(errors).toEqual([])
})
