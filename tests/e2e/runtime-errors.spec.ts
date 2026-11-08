import { expect, test } from '@playwright/test'
import { collectAppRuntimeErrors } from './support/runtime-errors'

test.use({ storageState: { cookies: [], origins: [] } })

test('运行时收集器记录 Vue 边界已捕获的组件错误', async ({ page }) => {
  const errors = collectAppRuntimeErrors(page)
  await page.setContent('<main>错误收集验证</main>')
  await page.evaluate(() => console.error('[VueError] async-component-probe'))
  await expect.poll(() => errors).toEqual(['[VueError] async-component-probe'])
})

test('运行时收集器记录未捕获的浏览器错误', async ({ page }) => {
  const errors = collectAppRuntimeErrors(page)
  await page.setContent('<main>错误收集验证</main>')
  await page.evaluate(() => {
    window.setTimeout(() => {
      throw new Error('uncaught-browser-probe')
    }, 0)
  })
  await expect.poll(() => errors.length).toBe(1)
  expect(errors[0]).toContain('uncaught-browser-probe')
})
