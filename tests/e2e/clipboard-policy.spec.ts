import { expect, test } from '@playwright/test'
import { prepareIsolatedSession } from './support/isolated-session'
for (const mode of ['success', 'denied', 'unsupported'])
  test('公共复制正确反馈 ' + mode, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value:
          mode === 'unsupported'
            ? undefined
            : {
                writeText: async (value: string) => {
                  if (mode === 'denied') throw new DOMException('denied', 'NotAllowedError')
                  document.documentElement.dataset.copied = value
                }
              }
      })
    }, mode)
    await page.goto('/tests/e2e/fixtures/clipboard-policy.html')
    await page.getByRole('button', { name: '复制', exact: true }).click()
    await expect(page.locator('.el-message')).toContainText(
      mode === 'success' ? '复制成功' : '复制失败'
    )
    if (mode === 'success')
      await expect(page.locator('html')).toHaveAttribute('data-copied', '编号-0')
    await page.getByRole('button', { name: '复制原文', exact: true }).click()
    await expect(page.locator('.el-message').last()).toContainText(
      mode === 'success' ? '识别原文已复制' : '复制失败'
    )
    if (mode === 'success')
      await expect(page.locator('html')).toHaveAttribute('data-copied', '测试识别原文')
    else await expect(page.locator('.el-message--success')).toHaveCount(0)
    const codeCopy = page.getByRole('button', { name: '复制代码', exact: true })
    await codeCopy.focus()
    await codeCopy.press('Enter')
    await expect(page.locator('.el-message').last()).toContainText(
      mode === 'success' ? '复制成功' : '复制失败'
    )
    if (mode === 'success')
      await expect(page.locator('html')).toHaveAttribute(
        'data-copied',
        '123 actual code\n  456 indented'
      )
    expect(errors).toEqual([])
    if (mode === 'success') await page.screenshot({ path: info.outputPath('clipboard.png') })
  })

for (const result of ['success', 'false', 'throw'])
  test('兼容复制清理并恢复焦点 ' + result, async ({ page }) => {
    await page.addInitScript((result) => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
      document.execCommand = () => {
        if (result === 'throw') throw new Error('denied')
        return result === 'success'
      }
    }, result)
    await page.goto('/tests/e2e/fixtures/clipboard-policy.html')
    const button = page.getByRole('button', { name: '兼容复制', exact: true })
    const existingTextareas = await page.locator('textarea[readonly]').count()
    await button.click()
    await expect(page.locator('html')).toHaveAttribute(
      'data-fallback',
      result === 'success' ? 'success' : 'failed'
    )
    await expect(button).toBeFocused()
    await expect(page.locator('textarea[readonly]')).toHaveCount(existingTextareas)
  })

for (const mode of ['success', 'denied', 'unsupported'])
  test('配置与 SQL 单元格复制反馈 ' + mode, async ({ page }, info) => {
    await prepareIsolatedSession(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript((mode) => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value:
          mode === 'unsupported'
            ? undefined
            : {
                writeText: async (value: string) => {
                  if (mode === 'denied') throw new DOMException('denied', 'NotAllowedError')
                  document.documentElement.dataset.copied = value
                }
              }
      })
    }, mode)
    await page.goto('/tests/e2e/fixtures/clipboard-policy.html?business')
    await page.getByRole('button', { name: '复制配置', exact: true }).click()
    await expect(page.locator('.el-message').last()).toContainText(
      mode === 'success' ? '配置已复制' : '复制失败'
    )
    if (mode === 'success')
      await expect(page.locator('html')).toHaveAttribute('data-copied', /menuType:/)
    await page.locator('td').filter({ hasText: /^0$/ }).first().click({ button: 'right' })
    await page.getByRole('menuitem', { name: '复制', exact: true }).click()
    await expect(page.locator('.el-message').last()).toContainText(
      mode === 'success' ? '复制成功' : '复制失败'
    )
    if (mode === 'success') {
      await expect(page.locator('html')).toHaveAttribute('data-copied', '0')
      await page.screenshot({ path: info.outputPath('business-copy.png') })
    } else await expect(page.locator('.el-message--success')).toHaveCount(0)
    expect(errors).toEqual([])
  })
