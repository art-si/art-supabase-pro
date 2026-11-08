import type { Page } from '@playwright/test'

/** Collect uncaught browser errors and runtime failures reported by the Vue error boundary. */
export function collectAppRuntimeErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('[VueError]'))
      errors.push(message.text())
  })
  return errors
}
