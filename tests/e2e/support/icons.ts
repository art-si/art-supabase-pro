import type { Page } from '@playwright/test'

/** Verify local icon coverage without allowing a public API to hide missing assets. */
export async function blockExternalIconRequests(page: Page): Promise<string[]> {
  const requests: string[] = []
  await page.route(/https:\/\/api\.(?:iconify\.design|simplesvg\.com|unisvg\.com)\//, (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  return requests
}
