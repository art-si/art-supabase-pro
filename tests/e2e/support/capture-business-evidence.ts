import { expect, type Locator, type Page } from '@playwright/test'

export async function captureBusinessEvidence(
  target: Page | Locator,
  options: { path: string; fullPage?: boolean }
): Promise<void> {
  const owner = 'page' in target ? target.page() : target
  await expect
    .poll(
      () =>
        owner.evaluate(() => {
          const failed: string[] = []
          document.fonts.forEach((font) => {
            if (font.status === 'error') failed.push(font.family)
          })
          return { status: document.fonts.status, failed }
        }),
      { timeout: 90000, message: '视觉证据必须等待项目字体加载完成，不能使用失败字体替代验收' }
    )
    .toEqual({ status: 'loaded', failed: [] })
  if ('page' in target) {
    await target.screenshot({ path: options.path, timeout: 60000, animations: 'disabled' })
  } else {
    await target.screenshot({ ...options, timeout: 60000, animations: 'disabled' })
  }
}
